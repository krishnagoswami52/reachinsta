/**
 * Sandbox end-to-end test for the subscription lifecycle (fix #2).
 *
 * Flow: register user → real Paddle sandbox checkout (test card) →
 * sync webhook → cancel via UI → resume via UI → cancel again →
 * simulate period expiry → run downgrade cron → verify free plan.
 *
 * Paddle sandbox cannot reach localhost with webhooks, so webhook delivery is
 * simulated by POSTing the REAL subscription object (fetched from the Paddle
 * sandbox API) to /api/webhooks/paddle, signed with PADDLE_WEBHOOK_SECRET —
 * this exercises the full handler path including signature verification.
 *
 * Run: npx tsx scripts/sub-lifecycle-test.ts
 */
import "dotenv/config";
import { chromium, type Page, type Frame } from "@playwright/test";
import { createHmac } from "crypto";
import { eq } from "drizzle-orm";
import { mkdirSync } from "fs";
import { db, pool } from "../server/db";
import { profiles } from "../shared/schema";
import { users } from "../shared/models/auth";
import { downgradeExpiredSubscriptions } from "../server/jobs/downgrade-expired";

const BASE = "http://127.0.0.1:5000";
const EMAIL = `subtest-${Date.now()}@reachinsta-lifecycle.test`;
const PASSWORD = "SubLifecycle!2026";
const SHOT_DIR = "tests/screenshots/sub-lifecycle";

const PADDLE_BASE = "https://sandbox-api.paddle.com";
const PADDLE_KEY = process.env.PADDLE_API_KEY!;
const WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET!;

let step = 0;
function log(msg: string) {
  console.log(`\n[${String(++step).padStart(2, "0")}] ${msg}`);
}
function fail(msg: string): never {
  console.error(`\n❌ FAIL: ${msg}`);
  process.exit(1);
}
function assert(cond: unknown, msg: string) {
  if (!cond) fail(msg);
  console.log(`    ✓ ${msg}`);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false });
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function getProfileByEmail(email: string) {
  const [row] = await db.select().from(profiles).where(eq(profiles.email, email));
  return row;
}

// ─── Paddle sandbox API helpers ───────────────────────────────────────────────

async function paddleGet(path: string): Promise<any> {
  const res = await fetch(`${PADDLE_BASE}${path}`, {
    headers: { Authorization: `Bearer ${PADDLE_KEY}` },
  });
  if (!res.ok) throw new Error(`Paddle GET ${path} → ${res.status}`);
  return (await res.json()).data;
}

async function findSandboxSubscription(email: string): Promise<any | null> {
  const customers = await paddleGet(`/customers?email=${encodeURIComponent(email)}`);
  if (!customers?.length) return null;
  const subs = await paddleGet(`/subscriptions?customer_id=${customers[0].id}`);
  return subs?.[0] ?? null;
}

// ─── Signed webhook simulation ────────────────────────────────────────────────

async function deliverWebhook(eventType: string, data: any): Promise<number> {
  const body = JSON.stringify({
    event_id: `evt_test_${Date.now()}`,
    event_type: eventType,
    occurred_at: new Date().toISOString(),
    notification_id: `ntf_test_${Date.now()}`,
    data,
  });
  const ts = Math.floor(Date.now() / 1000).toString();
  const h1 = createHmac("sha256", WEBHOOK_SECRET).update(`${ts}:${body}`).digest("hex");
  const res = await fetch(`${BASE}/api/webhooks/paddle`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Paddle-Signature": `ts=${ts};h1=${h1}`,
    },
    body,
  });
  return res.status;
}

// ─── Paddle checkout overlay automation ───────────────────────────────────────

function paddleFrame(page: Page): Frame {
  const frame = page
    .frames()
    .find((f) => f.url().includes("paddle.com") || f.name().includes("paddle"));
  if (!frame) throw new Error("Paddle checkout iframe not found");
  return frame;
}

async function fillFirst(frame: Frame, selectors: string[], value: string, label: string) {
  for (const sel of selectors) {
    const el = frame.locator(sel).first();
    if ((await el.count()) > 0 && (await el.isVisible().catch(() => false))) {
      await el.fill(value);
      console.log(`    filled ${label} via ${sel}`);
      return true;
    }
  }
  console.log(`    (skipped ${label} — no matching visible field)`);
  return false;
}

async function completeCheckout(page: Page) {
  // Overlay iframe appears after Paddle.Checkout.open
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("iframe")).some((f) => f.src.includes("paddle.com")),
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(5000); // let the checkout app boot
  await shot(page, "03-checkout-open");

  const frame = paddleFrame(page);

  // Stage 1: customer details (email usually prefilled via openCheckout)
  await fillFirst(frame, ['input[name="email"]', "#email"], EMAIL, "email");
  const countrySelect = frame.locator('select[name="countryCode"], select[data-testid="countriesSelect"]').first();
  if ((await countrySelect.count()) > 0 && (await countrySelect.isVisible().catch(() => false))) {
    await countrySelect.selectOption("US");
    console.log("    selected country US");
  }
  await fillFirst(frame, ['input[name="postcode"]', 'input[name="postalCode"]', "#postcode"], "90210", "postal code");

  const continueBtn = frame.locator('button[type="submit"]').first();
  if ((await continueBtn.count()) > 0 && (await continueBtn.isVisible().catch(() => false))) {
    await continueBtn.click();
    console.log("    clicked continue");
    await page.waitForTimeout(5000);
  }
  await shot(page, "04-checkout-payment");

  // Stage 2: card details. Paddle may render card fields directly or behind a
  // "Card" payment-method button.
  const cardMethodBtn = frame
    .locator('button:has-text("Card"), [data-testid="CARD-payment-method-button"]')
    .first();
  if ((await cardMethodBtn.count()) > 0 && (await cardMethodBtn.isVisible().catch(() => false))) {
    await cardMethodBtn.click();
    await page.waitForTimeout(3000);
  }

  const filledCard = await fillFirst(
    frame,
    ['input[name="cardNumber"]', "#cardNumber", 'input[id*="cardNumber"]'],
    "4242424242424242",
    "card number",
  );
  if (!filledCard) {
    console.log("    frame text dump:\n" + (await frame.locator("body").innerText()).slice(0, 2000));
    await shot(page, "04b-card-not-found");
    throw new Error("Card number field not found in Paddle frame");
  }
  const nameByLabel = frame.getByLabel(/name on card/i).first();
  if ((await nameByLabel.count()) > 0) {
    await nameByLabel.fill("Sub Test");
    console.log("    filled cardholder name via label");
  } else {
    await fillFirst(
      frame,
      ['input[name="cardholderName"]', 'input[name="cardHolderName"]', 'input[name="name"]', "#cardholderName", 'input[autocomplete="cc-name"]'],
      "Sub Test",
      "cardholder name",
    );
  }
  await fillFirst(frame, ['input[name="expiryDate"]', "#expiryDate", 'input[name="expiry"]'], "12/30", "expiry");
  await fillFirst(frame, ['input[name="cardVerificationValue"]', "#cardVerificationValue", 'input[name="cvv"]'], "100", "cvc");

  // Recurring-charge consent checkbox must be ticked before paying. The input
  // may be hidden behind custom styling, so try several click targets briefly.
  await tickConsent(frame);
  await shot(page, "05-card-filled");

  const payBtn = frame.locator('button[type="submit"]').first();
  await payBtn.click();
  console.log("    submitted payment");
  await page.waitForTimeout(8000);

  // If the consent warning blocked the submit, tick it and retry once
  const consentWarning = frame.getByText(/confirm your consent/i).first();
  if ((await consentWarning.isVisible().catch(() => false))) {
    console.log("    consent warning shown — ticking checkbox and resubmitting");
    await tickConsent(frame);
    await frame.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(8000);
  }
  await shot(page, "05b-after-submit");
}

async function tickConsent(frame: Frame) {
  const candidates = [
    frame.locator('input[type="checkbox"]').first(),
    frame.locator('[role="checkbox"]').first(),
    frame.locator('label:has(input[type="checkbox"])').first(),
    frame.getByText(/i agree to be charged/i).first(),
  ];
  for (const target of candidates) {
    try {
      if ((await target.count()) === 0) continue;
      await target.click({ force: true, timeout: 3000 });
      console.log("    ticked consent checkbox");
      return;
    } catch {
      // try the next candidate
    }
  }
  console.log("    (no consent checkbox found/clickable yet)");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  mkdirSync(SHOT_DIR, { recursive: true });
  if (!PADDLE_KEY?.startsWith("pdl_sdbx_")) fail("PADDLE_API_KEY is not a sandbox key — aborting");

  log(`Registering test user ${EMAIL}`);
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, firstName: "Sub", lastName: "Test" }),
  });
  assert(reg.ok, `register returned ${reg.status}`);

  log("Marking email verified directly in DB (skip verification email)");
  await db.update(users).set({ emailVerified: true }).where(eq(users.email, EMAIL));

  log("Launching browser + logging in");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/login`);
  await page.getByTestId("input-email").fill(EMAIL);
  await page.getByTestId("input-password").fill(PASSWORD);
  await page.getByTestId("button-submit-login").click();
  await page.waitForURL("**/dashboard**", { timeout: 20_000 });
  await shot(page, "01-logged-in");

  log("Opening pricing page and starting Plus checkout");
  await page.goto(`${BASE}/pricing`);
  await page.waitForTimeout(4000); // let Paddle.js load
  await shot(page, "02-pricing");
  const upgradeBtn = page.getByRole("button", { name: /upgrade to plus/i }).first();
  await upgradeBtn.click();

  log("Completing Paddle sandbox checkout with test card 4242…");
  await completeCheckout(page);

  log("Waiting for subscription to appear in Paddle sandbox");
  let sub: any = null;
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(5000);
    sub = await findSandboxSubscription(EMAIL).catch(() => null);
    if (sub) break;
  }
  await shot(page, "06-after-payment");
  assert(sub, `Paddle sandbox subscription created (id=${sub?.id}, status=${sub?.status})`);

  log("Delivering subscription.activated webhook (signed) to local server");
  const actStatus = await deliverWebhook("subscription.activated", sub);
  assert(actStatus === 200, `webhook accepted (HTTP ${actStatus})`);

  let p = await getProfileByEmail(EMAIL);
  assert(p?.plan === "plus", `DB plan = plus (got ${p?.plan})`);
  assert(p?.subscriptionStatus === "active", `DB subscriptionStatus = active (got ${p?.subscriptionStatus})`);
  assert(p?.paddleSubscriptionId === sub.id, "DB paddleSubscriptionId stored");

  log("CANCEL: opening /billing and clicking Cancel subscription");
  await page.goto(`${BASE}/billing`);
  await page.waitForTimeout(2000);
  await shot(page, "07-billing-active");
  await page.getByRole("button", { name: /cancel subscription/i }).click();
  await page.waitForTimeout(500);
  await shot(page, "08-cancel-modal");
  const modalText = await page.locator('[role="alertdialog"]').innerText();
  console.log(`    modal text: ${modalText.replace(/\n/g, " | ").slice(0, 300)}`);
  await page.getByRole("button", { name: /yes, cancel/i }).click();
  await page.waitForTimeout(4000);
  await shot(page, "09-after-cancel");

  p = await getProfileByEmail(EMAIL);
  assert(p?.subscriptionStatus === "canceling", `DB subscriptionStatus = canceling (got ${p?.subscriptionStatus})`);
  assert(p?.cancelAt instanceof Date && p.cancelAt > new Date(), `DB cancelAt populated (${p?.cancelAt?.toISOString()})`);

  const bannerVisible = await page.getByText(/you'll keep your .* plan until/i).isVisible();
  assert(bannerVisible, "UI shows canceling banner with access-until date");
  const resumeVisible = await page.getByRole("button", { name: /resume subscription/i }).isVisible();
  assert(resumeVisible, "UI shows Resume button");

  log("RESUME: clicking Resume subscription");
  await page.getByRole("button", { name: /resume subscription/i }).click();
  await page.waitForTimeout(4000);
  await shot(page, "10-after-resume");

  p = await getProfileByEmail(EMAIL);
  assert(p?.subscriptionStatus === "active", `DB subscriptionStatus back to active (got ${p?.subscriptionStatus})`);
  assert(p?.cancelAt === null, "DB cancelAt cleared");
  const paddleSub = await paddleGet(`/subscriptions/${sub.id}`);
  assert(paddleSub.scheduled_change === null, "Paddle sandbox scheduled_change cleared (resume confirmed remotely)");

  log("CANCEL AGAIN: scheduling cancel for expiry simulation");
  await page.getByRole("button", { name: /cancel subscription/i }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /yes, cancel/i }).click();
  await page.waitForTimeout(4000);
  p = await getProfileByEmail(EMAIL);
  assert(p?.subscriptionStatus === "canceling", "DB back in canceling state");

  log("EXPIRY: setting cancelAt to yesterday + running downgrade cron manually");
  await db
    .update(profiles)
    .set({ cancelAt: new Date(Date.now() - 24 * 60 * 60 * 1000) })
    .where(eq(profiles.email, EMAIL));
  const downgraded = await downgradeExpiredSubscriptions();
  assert(downgraded >= 1, `cron downgraded ${downgraded} user(s)`);

  p = await getProfileByEmail(EMAIL);
  assert(p?.plan === "free", `DB plan = free after cron (got ${p?.plan})`);
  assert(p?.subscriptionStatus === "canceled", `DB subscriptionStatus = canceled (got ${p?.subscriptionStatus})`);
  assert(p?.paddleSubscriptionId === null, "DB paddleSubscriptionId cleared");
  assert(p?.cancelAt === null && p?.currentPeriodEnd === null, "DB cancelAt/currentPeriodEnd cleared");
  assert(p?.monthlyFetchLimit === 1 && p?.maxCompetitors === 5, "plan limits reset to free tier");

  log("Idempotency: running cron again");
  const second = await downgradeExpiredSubscriptions();
  assert(second === 0, "second run downgrades nobody");

  log("WEBHOOK: simulating subscription.canceled (period ended) end-to-end");
  const canceledStatus = await deliverWebhook("subscription.canceled", {
    ...sub,
    status: "canceled",
    scheduled_change: null,
    current_billing_period: null,
    canceled_at: new Date().toISOString(),
  });
  assert(canceledStatus === 200, `webhook accepted (HTTP ${canceledStatus})`);
  p = await getProfileByEmail(EMAIL);
  assert(p?.plan === "free" && p?.subscriptionStatus === "canceled", "canceled webhook keeps user on free (idempotent)");

  log("UI: billing page after downgrade");
  await page.reload();
  await page.waitForTimeout(2000);
  await shot(page, "11-downgraded-free");

  await browser.close();
  await pool.end();
  console.log("\n✅ FULL LIFECYCLE PASSED: pay → cancel → resume → cancel → expire → downgrade");
  process.exit(0);
})().catch(async (err) => {
  console.error("\n❌ Lifecycle test crashed:", err);
  process.exit(1);
});
