// Integration test for Paddle webhook idempotency + freshness + error handling.
// Mounts the REAL webhook router against the REAL dev DB and signs payloads
// exactly as Paddle does. Uses event_ids prefixed evt_test_ and cleans them up.
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const { createHmac } = await import("crypto");
const express = (await import("express")).default;
const { db } = await import("../server/db");
const { processedWebhookEvents } = await import("@shared/schema");
const { eq } = await import("drizzle-orm");
const { storage } = await import("../server/storage");
const webhookRouter = (await import("../server/routes/paddleWebhook")).default;

const SECRET = process.env.PADDLE_WEBHOOK_SECRET!;
if (!SECRET) { console.error("PADDLE_WEBHOOK_SECRET missing"); process.exit(1); }

function sign(body: string, ts: number) {
  const h1 = createHmac("sha256", SECRET).update(`${ts}:${body}`).digest("hex");
  return `ts=${ts};h1=${h1}`;
}

const app = express();
app.use(webhookRouter);
const server = app.listen(0);
const port = (server.address() as any).port;
const URL = `http://127.0.0.1:${port}/api/webhooks/paddle`;

async function post(body: string, ts: number, sigOverride?: string) {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json", "paddle-signature": sigOverride ?? sign(body, ts) },
    body,
  });
  let json: any = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const nowTs = () => Math.floor(Date.now() / 1000);
let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}

// Event that resolves NO profile → handler is a clean no-op success (no data mutation)
function evt(id: string) {
  return JSON.stringify({
    event_id: id,
    event_type: "subscription.activated",
    data: { id: "sub_test_none", customer_id: "ctm_test_nonexistent_xyz", custom_data: {} },
  });
}

(async () => {
  const ids = ["evt_test_happy_1", "evt_test_err_1"];
  // pre-clean
  for (const id of ids) await db.delete(processedWebhookEvents).where(eq(processedWebhookEvents.eventId, id));

  console.log("\n[1] Happy path → 200 + recorded");
  {
    const r = await post(evt("evt_test_happy_1"), nowTs());
    check("returns 200", r.status === 200, `(got ${r.status})`);
    const row = await db.select().from(processedWebhookEvents).where(eq(processedWebhookEvents.eventId, "evt_test_happy_1"));
    check("event recorded in DB", row.length === 1);
  }

  console.log("\n[2] Replay same event → 200 deduped, no duplicate row");
  {
    const r = await post(evt("evt_test_happy_1"), nowTs());
    check("returns 200", r.status === 200, `(got ${r.status})`);
    check("body deduped:true", r.json?.deduped === true, `(got ${JSON.stringify(r.json)})`);
    const row = await db.select().from(processedWebhookEvents).where(eq(processedWebhookEvents.eventId, "evt_test_happy_1"));
    check("still exactly one row", row.length === 1);
  }

  console.log("\n[3] Stale event (ts 10 min ago) → 401");
  {
    const r = await post(evt("evt_test_stale_1"), nowTs() - 600);
    check("returns 401", r.status === 401, `(got ${r.status})`);
    const row = await db.select().from(processedWebhookEvents).where(eq(processedWebhookEvents.eventId, "evt_test_stale_1"));
    check("not recorded", row.length === 0);
  }

  console.log("\n[4] Future event (ts 10 min ahead) → 401");
  {
    const r = await post(evt("evt_test_future_1"), nowTs() + 600);
    check("returns 401", r.status === 401, `(got ${r.status})`);
  }

  console.log("\n[4b] Bad signature → 401 (no regression)");
  {
    const r = await post(evt("evt_test_badsig_1"), nowTs(), `ts=${nowTs()};h1=deadbeef`);
    check("returns 401", r.status === 401, `(got ${r.status})`);
  }

  console.log("\n[5] Handler throws → 500, event NOT recorded");
  {
    const orig = storage.getProfileByPaddleCustomerId;
    (storage as any).getProfileByPaddleCustomerId = async () => { throw new Error("forced handler error"); };
    const r = await post(evt("evt_test_err_1"), nowTs());
    (storage as any).getProfileByPaddleCustomerId = orig;
    check("returns 500", r.status === 500, `(got ${r.status})`);
    const row = await db.select().from(processedWebhookEvents).where(eq(processedWebhookEvents.eventId, "evt_test_err_1"));
    check("NOT recorded (retry-able)", row.length === 0);
  }

  // cleanup
  for (const id of ids) await db.delete(processedWebhookEvents).where(eq(processedWebhookEvents.eventId, id));
  await db.delete(processedWebhookEvents).where(eq(processedWebhookEvents.eventId, "evt_test_happy_1"));

  server.close();
  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
