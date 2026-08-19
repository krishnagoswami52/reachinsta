/**
 * Verification harness for the admin analytics dashboard.
 *
 *   npx tsx scripts/verify-admin-dashboard.ts
 *
 * Mounts the REAL server/routes/admin router (real isAuthenticated, real
 * requireAdmin, real SQL) on a throwaway Express app and drives it end-to-end,
 * so the access-control matrix and every query can be verified without needing
 * a browser session. Useful when TEST_ADMIN_PASSWORD is not available.
 *
 * Writes nothing except a handful of page_views rows under /__verify*, which it
 * deletes again before exiting. No user, profile or subscription row is touched.
 */
// Must load the env BEFORE server/db.ts is evaluated, hence the dynamic imports.
import "dotenv/config";
import express from "express";
import type { AddressInfo } from "net";

const adminRouter = (await import("../server/routes/admin")).default;
const { trackPageView } = await import("../server/middleware/tracking");
const { isAdminEmail } = await import("../server/middleware/adminAuth");
const { pool } = await import("../server/db");

const line = (label: string) => console.log(`\n=== ${label} ===`);
const mask = (email: string | null) =>
  email ? email.replace(/^(.).*(@.*)$/, "$1***$2") : "(none)";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label} -> ${actual}${ok ? "" : ` (expected ${expected})`}`);
}

/** Boots an app whose session carries `userId` (or none), returns its base URL. */
function boot(userId: string | null) {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).session = userId ? { userId } : {};
    next();
  });
  app.use("/api/admin", adminRouter);
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

const ENDPOINTS = ["stats", "activity", "traffic?days=7", "producthunt"];

async function statusMatrix(userId: string | null, expected: number, label: string) {
  const { base, close } = boot(userId);
  try {
    for (const ep of ENDPOINTS) {
      const res = await fetch(`${base}/api/admin/${ep}`);
      check(`${label} GET /api/admin/${ep}`, res.status, expected);
    }
  } finally {
    await close();
  }
}

(async () => {
  // ── who is in the DB ─────────────────────────────────────────────────────
  const users = await pool.query<{ id: string; email: string }>(
    `SELECT id, email FROM users ORDER BY created_at ASC`,
  );
  const admin = users.rows.find((u) => isAdminEmail(u.email));
  const nonAdmin = users.rows.find((u) => !isAdminEmail(u.email));

  line("accounts");
  console.log(`  users in DB:      ${users.rows.length}`);
  console.log(`  admin account:    ${mask(admin?.email ?? null)}`);
  console.log(`  non-admin sample: ${mask(nonAdmin?.email ?? null)}`);
  if (!admin) throw new Error("No allow-listed admin account found in users table");

  // ── access control ───────────────────────────────────────────────────────
  line("access control");
  await statusMatrix(null, 401, "anonymous");
  if (nonAdmin) await statusMatrix(nonAdmin.id, 403, "non-admin");
  else console.log("  SKIP  non-admin 403 (no non-admin user in DB)");
  await statusMatrix(admin.id, 200, "admin   ");

  // ── page view tracking ───────────────────────────────────────────────────
  line("page view tracking");
  // Clear leftovers from an interrupted earlier run so the count check is exact.
  await pool.query(`DELETE FROM page_views WHERE path LIKE '/__verify%'`);
  const trackApp = express();
  trackApp.use((req, _res, next) => {
    (req as any).session = {};
    next();
  });
  trackApp.use(trackPageView);
  trackApp.use((_req, res) => res.send("ok"));
  const trackServer = trackApp.listen(0);
  const trackBase = `http://127.0.0.1:${(trackServer.address() as AddressInfo).port}`;

  await fetch(`${trackBase}/__verify-landing?utm_source=producthunt&utm_medium=launch`, {
    headers: { referer: "https://www.producthunt.com/posts/reachinsta" },
  });
  await fetch(`${trackBase}/__verify-pricing`);
  await fetch(`${trackBase}/api/__verify-ignored`);      // must NOT be tracked
  await fetch(`${trackBase}/assets/__verify-app.js`);    // must NOT be tracked
  await fetch(`${trackBase}/__verify-post`, { method: "POST" }); // must NOT be tracked
  await new Promise((r) => setTimeout(r, 1500)); // fire-and-forget insert
  await new Promise((r) => trackServer.close(r));

  const tracked = await pool.query(
    `SELECT path, utm_source, utm_medium, referrer, session_id
     FROM page_views WHERE path LIKE '/__verify%' ORDER BY id`,
  );
  check("rows written for page loads only", tracked.rows.length, 2);
  console.log(
    "  rows:",
    tracked.rows.map((r) => `${r.path} utm=${r.utm_source ?? "-"} sid=${String(r.session_id).slice(0, 10)}…`),
  );
  check(
    "UTM captured",
    tracked.rows.find((r) => r.path === "/__verify-landing")?.utm_source,
    "producthunt",
  );
  check(
    "referrer captured",
    tracked.rows.find((r) => r.path === "/__verify-landing")?.referrer,
    "https://www.producthunt.com/posts/reachinsta",
  );

  // ── sample dashboard payloads ────────────────────────────────────────────
  const { base, close } = boot(admin.id);
  try {
    for (const ep of ENDPOINTS) {
      line(`GET /api/admin/${ep}`);
      const res = await fetch(`${base}/api/admin/${ep}`);
      console.log(JSON.stringify(await res.json(), null, 2).slice(0, 2600));
    }
  } finally {
    await close();
  }

  // ── cleanup: remove only the rows this harness created ───────────────────
  const deleted = await pool.query(`DELETE FROM page_views WHERE path LIKE '/__verify%'`);
  line("cleanup");
  console.log(`  removed ${deleted.rowCount} harness page_views row(s)`);

  line(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
})().catch(async (err) => {
  console.error("HARNESS ERROR:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
