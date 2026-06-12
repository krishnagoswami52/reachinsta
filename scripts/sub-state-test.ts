/**
 * Subscription state-machine test â€” everything that can be verified WITHOUT a
 * working Paddle API key (the sandbox key currently has no API permissions).
 *
 * Covers: signed webhook handling (activated / updated+scheduled-cancel /
 * updated-resume / past_due / canceled), endpoint guard rails, the downgrade
 * cron, and the billing UI states (active card, confirm modal, canceling
 * banner + resume button, downgraded view).
 *
 * NOT covered (blocked on API key): the real Paddle subscriptions.cancel /
 * scheduled_change=null calls inside POST /api/subscription/cancel|resume.
 *
 * Run: npx tsx scripts/sub-state-test.ts
 */
import "dotenv/config";
import { chromium, type Page } from "@playwright/test";
import { createHmac } from "crypto";
import { eq } from "drizzle-orm";
import { mkdirSync } from "fs";
import { db, pool } from "../server/db";
import { profiles } from "../shared/schema";
import { users } from "../shared/models/auth";
import { downgradeExpiredSubscriptions } from "../server/jobs/downgrade-expired";

const BASE = "http://127.0.0.1:5000";
const EMAIL = `substate-${Date.now()}@reachinsta-lifecycle.test`;
const PASSWORD = "SubLifecycle!2026";
const SHOT_DIR = "tests/screenshots/sub-lifecycle";
const WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET!;
const PLUS_PRICE = process.env.VITE_PADDLE_PRICE_PLUS!;

const SUB_ID = `sub_test_${Date.now()}`;
const CUSTOMER_ID = `ctm_test_${Date.now()}`;

let step = 0;
function log(msg: string) {
  console.log(`\n[${String(++step).padStart(2, "0")}] ${msg}`);
}
function fail(msg: string): never {
  console.error(`\nâŒ FAIL: ${msg}`);
  process.exit(1);
}
function assert(cond: unknown, msg: string) {
  if (!cond) fail(msg);
  console.log(`    âœ“ ${msg}`);
}

async function getProfile() {
  const [row] = await db.select().from(profiles).where(eq(profiles.email, EMAIL));
  return row;
}

async function deliverWebhook(eventType: string, data: any): Promise<number> {
  const body = JSON.stringify({
    event_id: `evt_test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    event_type: eventType,
    occurred_at: new Date().toISOString(),
    data,
  });
  const ts = Math.floor(Date.now() / 1000).toString();
  const h1 = createHmac("sha256", WEBHOOK_SECRET).update(`${ts}:${body}`).digest("hex");
  const res = await fetch(`${BASE}/api/webhooks/paddle`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Paddle-Signature": `ts=${ts};h1=${h1}` },
    body,
  });
  return res.status;
}

function subPayload(overrides: Record<string, unknown> = {}, userId?: string) {
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  return {
    id: SUB_ID,
    status: "active",
    customer_id: CUSTOMER_ID,
    custom_data: userId ? { user_id: userId } : undefined,
    items: [{ price: { id: PLUS_PRICE }, quantity: 1 }],
    scheduled_change: null,
    current_billing_period: {
      starts_at: new Date().toISOString(),
      ends_at: periodEnd,
    },
    ...overrides,
  };
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

(async () => {
  mkdirSync(SHOT_DIR, { recursive: true });

  log(`Registering test user ${EMAIL}`);
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, firstName: "Sub", lastName: "State" }),
  });
  assert(reg.ok, `register returned ${reg.status}`);
  const cookie = reg.headers.get("set-cookie")!.split(";")[0];
  await db.update(users).set({ emailVerified: true }).where(eq(users.email, EMAIL));
  const userId = (await getProfile())!.id;

  log("GUARDS: endpoints reject bad states before touching Paddle");
  const noAuth = await fetch(`${BASE}/api/subscription/cancel`, { method: "POST" });
  assert(noAuth.status === 401, `unauthenticated cancel â†’ 401 (got ${noAuth.status})`);

  const noSub = await fetch(`${BASE}/api/subscription/cancel`, { method: "POST", headers: { Cookie: cookie } });
  const noSubBody = await noSub.json();
  assert(noSub.status === 400 && noSubBody.code === "NO_SUBSCRIPTION", `cancel with no subscription â†’ 400 NO_SUBSCRIPTION`);

  const noSubResume = await fetch(`${BASE}/api/subscription/resume`, { method: "POST", headers: { Cookie: cookie } });
  assert(noSubResume.status === 400, `resume with no subscription â†’ 400 (got ${noSubResume.status})`);

  log("WEBHOOK: bad signature is rejected");
  const badSig = await fetch(`${BASE}/api/webhooks/paddle`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Paddle-Signature": "ts=1;h1=deadbeef" },
    body: JSON.stringify({ event_type: "subscription.activated", data: subPayload({}, userId) }),
  });
  assert(badSig.status === 401, `tampered signature â†’ 401 (got ${badSig.status})`);

  log("WEBHOOK: subscription.activated â†’ plan=plus, active");
  assert((await deliverWebhook("subscription.activated", subPayload({}, userId))) === 200, "activated accepted");
  let p = await getProfile();
  assert(p?.plan === "plus", `plan = plus (got ${p?.plan})`);
  assert(p?.subscriptionStatus === "active", `status = active (got ${p?.subscriptionStatus})`);
  assert(p?.paddleSubscriptionId === SUB_ID && p?.paddleCustomerId === CUSTOMER_ID, "paddle IDs stored");
  assert(p?.monthlyFetchLimit === 2 && p?.maxCompetitors === 50, "plus plan limits applied");

  log("WEBHOOK: subscription.updated with scheduled cancel â†’ canceling + cancelAt");
  const effectiveAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  assert(
    (await deliverWebhook(
      "subscription.updated",
      subPayload({ scheduled_change: { action: "cancel", effective_at: effectiveAt, resume_at: null } }, userId),
    )) === 200,
    "updated(scheduled cancel) accepted",
  );
  p = await getProfile();
  assert(p?.subscriptionStatus === "canceling", `status = canceling (got ${p?.subscriptionStatus})`);
  assert(p?.cancelAt?.toISOString() === effectiveAt, `cancelAt = effective_at (${p?.cancelAt?.toISOString()})`);
  assert(p?.plan === "plus", "plan stays plus until period end");

  log("GUARD: cancel while already canceling â†’ 400 ALREADY_CANCELED");
  const dup = await fetch(`${BASE}/api/subscription/cancel`, { method: "POST", headers: { Cookie: cookie } });
  const dupBody = await dup.json();
  assert(dup.status === 400 && dupBody.code === "ALREADY_CANCELED", "duplicate cancel rejected");

  log("UI: billing page shows canceling banner + resume button");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/login`);
  await page.getByTestId("input-email").fill(EMAIL);
  await page.getByTestId("input-password").fill(PASSWORD);
  await page.getByTestId("button-submit-login").click();
  await page.waitForURL("**/dashboard**", { timeout: 20_000 });
  await page.goto(`${BASE}/account/billing`);
  await page.waitForTimeout(2500);
  await shot(page, "20-canceling-banner");
  assert(await page.getByText(/you'll keep your plus plan until/i).isVisible(), "canceling banner with date visible");
  assert(await page.getByRole("button", { name: /resume subscription/i }).isVisible(), "Resume button visible");

  log("WEBHOOK: subscription.updated back to active (resume path) â†’ cancelAt cleared");
  assert((await deliverWebhook("subscription.updated", subPayload({}, userId))) === 200, "updated(active) accepted");
  p = await getProfile();
  assert(p?.subscriptionStatus === "active" && p?.cancelAt === null, "status active, cancelAt null");

  log("GUARD: resume while active â†’ 400 NOT_CANCELING");
  const badResume = await fetch(`${BASE}/api/subscription/resume`, { method: "POST", headers: { Cookie: cookie } });
  const badResumeBody = await badResume.json();
  assert(badResume.status === 400 && badResumeBody.code === "NOT_CANCELING", "resume while active rejected");

  log("UI: active subscription shows Cancel button + confirm modal");
  await page.reload();
  await page.waitForTimeout(2500);
  await shot(page, "21-active-with-cancel");
  const cancelBtn = page.getByRole("button", { name: /cancel subscription/i });
  assert(await cancelBtn.isVisible(), "Cancel subscription button visible (no longer disabled placeholder)");
  await cancelBtn.click();
  await page.waitForTimeout(600);
  await shot(page, "22-confirm-modal");
  const dialog = page.locator('[role="alertdialog"]');
  assert(await dialog.isVisible(), "confirmation modal opens");
  const dialogText = await dialog.innerText();
  assert(/you'll keep access/i.test(dialogText), "modal explains access-until-period-end");
  assert(/\b20\d\d\b/.test(dialogText), `modal shows a concrete period-end date`);
  await page.getByRole("button", { name: /keep subscription/i }).click();
  await page.waitForTimeout(400);
  assert(!(await dialog.isVisible()), "modal closes on Keep subscription");

  log("WEBHOOK: past_due keeps paid plan, marks status");
  assert((await deliverWebhook("subscription.updated", subPayload({ status: "past_due" }, userId))) === 200, "updated(past_due) accepted");
  p = await getProfile();
  assert(p?.subscriptionStatus === "past_due" && p?.plan === "plus", "past_due stored, plan kept");
  await deliverWebhook("subscription.updated", subPayload({}, userId)); // back to active

  log("CRON: scheduled cancel reaches period end â†’ downgrade to free");
  await deliverWebhook(
    "subscription.updated",
    subPayload({ scheduled_change: { action: "cancel", effective_at: effectiveAt, resume_at: null } }, userId),
  );
  await db.update(profiles).set({ cancelAt: new Date(Date.now() - 86_400_000) }).where(eq(profiles.email, EMAIL));
  const n = await downgradeExpiredSubscriptions();
  assert(n >= 1, `cron downgraded ${n} user(s)`);
  p = await getProfile();
  assert(p?.plan === "free" && p?.subscriptionStatus === "canceled", "plan=free, status=canceled");
  assert(p?.paddleSubscriptionId === null && p?.cancelAt === null && p?.currentPeriodEnd === null, "subscription fields cleared");
  assert(p?.monthlyFetchLimit === 1 && p?.maxCompetitors === 5 && p?.csvExport === false, "free plan limits enforced");

  log("CRON: idempotent â€” second run downgrades nobody");
  assert((await downgradeExpiredSubscriptions()) === 0, "second run is a no-op");

  log("WEBHOOK: subscription.canceled with ended period â†’ immediate downgrade path");
  // Re-activate first so the canceled handler has something to downgrade
  await deliverWebhook("subscription.activated", subPayload({}, userId));
  p = await getProfile();
  assert(p?.plan === "plus", "re-activated to plus for canceled-event test");
  assert(
    (await deliverWebhook(
      "subscription.canceled",
      subPayload({ status: "canceled", current_billing_period: null, canceled_at: new Date().toISOString() }, userId),
    )) === 200,
    "canceled accepted",
  );
  p = await getProfile();
  assert(p?.plan === "free" && p?.subscriptionStatus === "canceled", "canceled(period over) downgrades immediately");

  log("WEBHOOK: subscription.canceled with period still running â†’ grace period kept");
  await deliverWebhook("subscription.activated", subPayload({}, userId));
  const futureEnd = new Date(Date.now() + 10 * 86_400_000).toISOString();
  await deliverWebhook(
    "subscription.canceled",
    subPayload(
      { status: "canceled", current_billing_period: { starts_at: new Date().toISOString(), ends_at: futureEnd } },
      userId,
    ),
  );
  p = await getProfile();
  assert(p?.plan === "plus" && p?.subscriptionStatus === "canceling", "plan kept, status=canceling");
  assert(p?.cancelAt?.toISOString() === futureEnd, "cancelAt = period end");

  log("UI: downgraded user sees free plan, no cancel card");
  await db
    .update(profiles)
    .set({ cancelAt: new Date(Date.now() - 86_400_000) })
    .where(eq(profiles.email, EMAIL));
  await downgradeExpiredSubscriptions();
  await page.reload();
  await page.waitForTimeout(2500);
  await shot(page, "23-downgraded-free");
  assert(!(await page.getByRole("button", { name: /^cancel subscription$/i }).isVisible().catch(() => false)), "no cancel card for free user");

  await browser.close();
  await pool.end();
  console.log("\nâœ… STATE-MACHINE TESTS PASSED (webhooks, cron, guards, UI). Real Paddle cancel/resume API calls remain blocked on API key permissions.");
  process.exit(0);
})().catch((err) => {
  console.error("\nâŒ State test crashed:", err);
  process.exit(1);
});
