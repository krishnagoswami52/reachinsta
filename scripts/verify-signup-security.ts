/**
 * End-to-end verification of the four signup security fixes
 * (docs/signup-security-audit.md V1, V2, V5, V6).
 *
 * Mounts the REAL route stack — registerRoutes(), which runs setupAuth() and
 * every rate limiter and middleware exactly as production does — on a throwaway
 * port. It deliberately does NOT boot server/index.ts, because that also starts
 * the background worker and the daily cron against the production database: a
 * local worker would happily claim a real user's queued fetch and spend Apify
 * credit on this machine.
 *
 * Cost control:
 *   - one real account is created; the other register calls reuse that same
 *     email, so they 409 without creating a row or sending mail. The limiter
 *     counts them anyway, which is the whole point of the test.
 *   - POST /api/fetch is never allowed to reach the queue. The verified-path
 *     assertion sends an untracked competitor, so a pass shows up as the
 *     handler's own 4xx, proving the gate opened without enqueueing a job.
 *   - every row this creates is deleted in the finally block, then verified.
 *
 * Run: npx tsx scripts/verify-signup-security.ts
 */
import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";

const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();
const EMAIL = `sectest-${STAMP}@reachinsta-sectest.local`;
const PASSWORD = "SecTest!2026Verify";
const TEST_IP = "203.0.113.77";

let step = 0;
let failures = 0;
function log(msg: string) {
  console.log(`\n[${String(++step).padStart(2, "0")}] ${msg}`);
}
function assert(cond: unknown, msg: string) {
  if (cond) {
    console.log(`    PASS  ${msg}`);
  } else {
    console.log(`    FAIL  ${msg}`);
    failures++;
  }
}

/** Minimal cookie jar — the session cookie is the whole point of these tests. */
let cookie = "";
async function call(method: string, path: string, body?: unknown, withCookie = true) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(withCookie && cookie ? { Cookie: cookie } : {}),
      // Traefik sends this in production; trust proxy makes req.ip read it.
      "X-Forwarded-For": TEST_IP,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie && withCookie) cookie = setCookie.split(";")[0];
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, body: json };
}

(async () => {
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  const { registerRoutes } = await import("../server/routes");
  await registerRoutes(httpServer, app);
  await new Promise<void>((r) => httpServer.listen(PORT, "127.0.0.1", () => r()));
  console.log(`Harness listening on ${BASE} (no worker, no cron)`);

  try {
    // ---------------------------------------------------------------
    log("V5 - signup IP is recorded");
    const reg = await call("POST", "/api/auth/register", { email: EMAIL, password: PASSWORD });
    assert(reg.status === 200, `register returned 200 (got ${reg.status})`);

    const [row] = (
      await db.execute(sql`SELECT id, email, ip_address, email_verified FROM users WHERE email = ${EMAIL}`)
    ).rows as any[];
    assert(!!row, "user row exists");
    assert(
      row?.ip_address === TEST_IP,
      `users.ip_address = "${row?.ip_address}" (X-Forwarded-For was ${TEST_IP})`,
    );
    assert(row?.email_verified === false, "new account starts unverified");
    assert(!("ipAddress" in (reg.body ?? {})), "ipAddress is not leaked in the register response");

    // ---------------------------------------------------------------
    log("V1 - an UNVERIFIED session cannot spend money");
    const f1 = await call("POST", "/api/fetch", { timeRangeDays: 7 });
    assert(f1.status === 403, `POST /api/fetch -> 403 (got ${f1.status})`);
    assert(f1.body?.code === "EMAIL_NOT_VERIFIED", `code = EMAIL_NOT_VERIFIED (got ${f1.body?.code})`);
    assert(
      f1.body?.message === "Please verify your email to use this feature",
      `message = "${f1.body?.message}"`,
    );

    const c1 = await call("POST", "/api/competitors", { username: "nasa" });
    assert(
      c1.status === 403 && c1.body?.code === "EMAIL_NOT_VERIFIED",
      `POST /api/competitors -> 403 EMAIL_NOT_VERIFIED (got ${c1.status}/${c1.body?.code})`,
    );

    const cb = await call("POST", "/api/competitors/bulk", { usernames: ["nasa", "nike"] });
    assert(
      cb.status === 403 && cb.body?.code === "EMAIL_NOT_VERIFIED",
      `POST /api/competitors/bulk -> 403 EMAIL_NOT_VERIFIED (got ${cb.status}/${cb.body?.code})`,
    );

    // ---------------------------------------------------------------
    log("V1 - an UNVERIFIED session can still see its own state");
    const prof = await call("GET", "/api/profile");
    assert(prof.status === 200, `GET /api/profile -> 200 (got ${prof.status})`);
    const me = await call("GET", "/api/auth/user");
    assert(me.status === 200, `GET /api/auth/user -> 200 (got ${me.status})`);
    assert(me.body?.emailVerified === false, "...and reports emailVerified: false so the UI can react");
    assert(!("ipAddress" in (me.body ?? {})), "...and does not leak ipAddress");
    const comps = await call("GET", "/api/competitors");
    assert(comps.status === 200, `GET /api/competitors -> 200 (read stays open, got ${comps.status})`);

    // ---------------------------------------------------------------
    log("V6 - emailActionLimiter caps verification email actions per USER");
    // The pre-existing 60s in-process throttle answers 429 without a `code`
    // from the 2nd call on, so only ONE real Resend send happens here. The
    // limiter is the only thing that returns EMAIL_ACTION_RATE_LIMITED.
    let limiterHitAt = 0;
    for (let i = 1; i <= 11; i++) {
      const r = await call("POST", "/api/auth/resend-verification");
      if (r.body?.code === "EMAIL_ACTION_RATE_LIMITED") {
        limiterHitAt = i;
        break;
      }
    }
    assert(limiterHitAt === 11, `11th resend blocked by the limiter (blocked at #${limiterHitAt || "never"})`);
    const ce = await call("POST", "/api/auth/change-email", {
      email: `moved-${STAMP}@reachinsta-sectest.local`,
    });
    assert(
      ce.status === 429 && ce.body?.code === "EMAIL_ACTION_RATE_LIMITED",
      `change-email shares the same per-user budget (got ${ce.status}/${ce.body?.code})`,
    );

    // ---------------------------------------------------------------
    log("V1 - the gate OPENS once the email is verified");
    await db.execute(sql`UPDATE users SET email_verified = true WHERE email = ${EMAIL}`);
    const c2 = await call("POST", "/api/competitors", { username: `sectest${STAMP}` });
    assert(c2.status === 200, `POST /api/competitors -> 200 once verified (got ${c2.status})`);
    // An untracked competitor is rejected by the handler's own ownership check.
    // Reaching ANY non-403 proves requireVerifiedEmail let the request through
    // without a job ever being enqueued.
    const f2 = await call("POST", "/api/fetch", { timeRangeDays: 7, competitors: ["not-tracked-by-me"] });
    assert(
      f2.status !== 403,
      `POST /api/fetch is past the verification gate (got ${f2.status}: ${f2.body?.message})`,
    );
    assert(f2.body?.code !== "EMAIL_NOT_VERIFIED", "...and not for verification reasons");

    // ---------------------------------------------------------------
    log("V2 - registerLimiter blocks the 6th signup from one IP in an hour");
    // Call #1 was the real registration above. #2-#5 reuse that email, so they
    // 409 without creating a row or sending mail - the limiter counts them all.
    let regBlockedAt = 0;
    for (let i = 2; i <= 6; i++) {
      const r = await call("POST", "/api/auth/register", { email: EMAIL, password: PASSWORD }, false);
      if (r.status === 429) {
        regBlockedAt = i;
        break;
      }
      assert(r.status === 409, `register attempt #${i} -> 409 duplicate, still counted (got ${r.status})`);
    }
    assert(regBlockedAt === 6, `6th register attempt -> 429 (blocked at #${regBlockedAt || "never"})`);

    log("V2 - login is NOT locked out by that signup burst");
    const login = await call("POST", "/api/auth/login", { email: EMAIL, password: PASSWORD }, false);
    assert(login.status === 200, `POST /api/auth/login -> 200 on its own bucket (got ${login.status})`);
  } catch (err) {
    console.error("\nHarness error:", err);
    failures++;
  } finally {
    // -----------------------------------------------------------------
    log("Cleanup - remove every row this run created");
    const before = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM users`)).rows[0] as any;
    await db.execute(
      sql`DELETE FROM competitors WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@reachinsta-sectest.local')`,
    );
    await db.execute(
      sql`DELETE FROM email_verification_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@reachinsta-sectest.local')`,
    );
    await db.execute(
      sql`DELETE FROM sessions WHERE sess->>'userId' IN (SELECT id FROM users WHERE email LIKE '%@reachinsta-sectest.local')`,
    );
    await db.execute(sql`DELETE FROM profiles WHERE email LIKE '%@reachinsta-sectest.local'`);
    const del = await db.execute(sql`DELETE FROM users WHERE email LIKE '%@reachinsta-sectest.local'`);
    const after = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM users`)).rows[0] as any;
    console.log(`    users ${before.n} -> ${after.n} (deleted ${del.rowCount})`);
    const leftover = (
      await db.execute(sql`SELECT COUNT(*)::int AS n FROM users WHERE email LIKE '%@reachinsta-sectest.local'`)
    ).rows[0] as any;
    assert(leftover.n === 0, "no sectest rows left behind");

    httpServer.close();
    await pool.end();
    console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  }
})();
