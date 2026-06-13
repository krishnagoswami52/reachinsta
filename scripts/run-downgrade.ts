// scripts/run-downgrade.ts
// One-off runner to manually trigger the downgrade-expired cron job.
// Used for testing the subscription lifecycle without waiting for the 1 AM UTC schedule.
//
// Env loading note: the dev server (`tsx server/index.ts`) loads `.env` via
// `import 'dotenv/config'`. DATABASE_URL lives only in `.env`; `.env.local`
// holds only Paddle overrides. We replicate that order here so the runner hits
// the same Supabase pooler the server uses — without this, server/db.ts falls
// back to postgres://postgres:postgres@localhost and auth fails.

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const { downgradeExpiredSubscriptions } = await import(
  "../server/jobs/downgrade-expired"
);

(async () => {
  console.log("[Manual] Starting downgrade-expired job manually...");

  if (!process.env.DATABASE_URL) {
    console.error(
      "[Manual] DATABASE_URL is not set in env. Check .env / .env.local",
    );
    process.exit(1);
  }

  console.log(
    `[Manual] DATABASE_URL prefix: ${process.env.DATABASE_URL.slice(0, 30)}...`,
  );

  try {
    const count = await downgradeExpiredSubscriptions();
    console.log(`[Manual] ✅ Job complete. Downgraded ${count} user(s).`);

    if (count === 0) {
      console.log("[Manual] ⚠️  No users matched the filter. Possible causes:");
      console.log("[Manual]    - No user has subscription_status='canceling'");
      console.log("[Manual]    - No user's cancel_at is in the past");
    }

    process.exit(0);
  } catch (err) {
    console.error("[Manual] ❌ Job failed:", err);
    process.exit(1);
  }
})();
