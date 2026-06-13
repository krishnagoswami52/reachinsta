// scripts/check-user-state.ts
// Read-only helper: prints the subscription-relevant columns for the lifecycle
// test user. Used to verify DB state before/after the downgrade cron run.

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const EMAIL = "subtest-1781344088153@reachinsta-lifecycle.test";

const { pool } = await import("../server/db");

(async () => {
  const { rows } = await pool.query(
    `SELECT email, plan, subscription_status, current_period_end, cancel_at,
            paddle_subscription_id, max_competitors, monthly_fetch_limit
     FROM profiles
     WHERE email = $1`,
    [EMAIL],
  );

  if (rows.length === 0) {
    console.log(`[Check] No profile found for ${EMAIL}`);
  } else {
    console.log(`[Check] State for ${EMAIL}:`);
    console.table(rows);
  }

  await pool.end();
  process.exit(0);
})();
