// Tests destroyUserSessions against the real sessions table by inserting
// synthetic rows for a fake test userId, then asserting delete behavior.
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const { db } = await import("../server/db");
const { sql } = await import("drizzle-orm");
const { destroyUserSessions } = await import("../server/services/auth");

const USER = "00000000-test-sess-0000-000000000001";
const OTHER = "00000000-test-sess-0000-000000000002";
let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`  ✅ ${n}`)) : (fail++, console.log(`  ❌ ${n} ${d}`)); };

function expire() { return new Date(Date.now() + 7 * 864e5).toISOString().replace("T", " ").slice(0, 19); }
async function seed(sid: string, userId: string) {
  const sess = JSON.stringify({ cookie: { path: "/" }, userId });
  await db.execute(sql`INSERT INTO sessions (sid, sess, expire) VALUES (${sid}, ${sess}::jsonb, ${expire()}::timestamp)
    ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess`);
}
async function exists(sid: string) {
  const r = await db.execute(sql`SELECT 1 FROM sessions WHERE sid = ${sid}`);
  return (r.rowCount ?? 0) > 0;
}
async function cleanup() {
  await db.execute(sql`DELETE FROM sessions WHERE sid LIKE 'tsess_%'`);
}

(async () => {
  await cleanup();

  console.log("\n[1] destroyUserSessions(userId, exceptCurrentSid) keeps current, kills others, ignores other users");
  await seed("tsess_a", USER);   // current
  await seed("tsess_b", USER);   // other session of same user
  await seed("tsess_c", USER);   // other session of same user
  await seed("tsess_z", OTHER);  // different user — must survive
  const n1 = await destroyUserSessions(USER, "tsess_a");
  check("returned count = 2", n1 === 2, `(got ${n1})`);
  check("current session kept", await exists("tsess_a"));
  check("other session b destroyed", !(await exists("tsess_b")));
  check("other session c destroyed", !(await exists("tsess_c")));
  check("different user's session untouched", await exists("tsess_z"));

  console.log("\n[2] destroyUserSessions(userId) destroys ALL of that user");
  await seed("tsess_a", USER); // re-seed current
  const n2 = await destroyUserSessions(USER);
  check("returned count = 1", n2 === 1, `(got ${n2})`);
  check("all user sessions gone", !(await exists("tsess_a")));
  check("different user still untouched", await exists("tsess_z"));

  await cleanup();
  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
