/**
 * One-off: scrub technical error text out of fetch_runs.error_message.
 *
 *   npx tsx scripts/backfill-error-messages.ts --dry-run   (default)
 *   npx tsx scripts/backfill-error-messages.ts --apply
 *
 * Everything written from now on goes through server/utils/errorMessages.ts,
 * but rows written before that change still hold raw strings the user can see.
 * Two distinct problems:
 *
 * 1. Four COMPLETED runs carry a leftover message from a recovery or a retry —
 *    including the yulkakadran run the audit called out, which succeeded with
 *    a full dataset while telling its owner "worker went away 50724m ago".
 *    A completed run must carry no error at all.
 *
 * 2. Failed runs carry raw operational text ("Monthly usage hard limit
 *    exceeded", "APIFY_TOKEN is not configured"). Those get translated.
 *
 * Data-only: no status, no reels, no quota is touched. The original text is
 * preserved as internal_error_code so nothing is lost for debugging.
 */
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const { detectErrorCode, messageForCode } = await import("../server/utils/errorMessages");

const apply = process.argv.includes("--apply");
const pg = (await import("pg")).default;
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
});

(async () => {
  try {
    const { rows } = await pool.query(
      `SELECT id, status, error_message FROM fetch_runs
        WHERE error_message IS NOT NULL
        ORDER BY created_at DESC`,
    );

    console.log(`${rows.length} run(s) carry an error_message. Mode: ${apply ? "APPLY" : "DRY RUN"}\n`);

    let cleared = 0;
    let translated = 0;
    let unchanged = 0;

    for (const row of rows) {
      const code = detectErrorCode(row.error_message);

      // A completed run has its data. Whatever went wrong on the way was
      // recovered from, so there is nothing left to tell the user.
      const isCompleted = row.status === "completed";
      const nextMessage = isCompleted ? null : messageForCode(code);

      if (nextMessage === row.error_message) {
        unchanged++;
        continue;
      }

      console.log(
        `${row.id}  [${row.status}]\n` +
          `   was: ${JSON.stringify(row.error_message)}\n` +
          `   now: ${JSON.stringify(nextMessage)}  (code ${code})`,
      );

      if (apply) {
        await pool.query(
          `UPDATE fetch_runs SET error_message = $1, internal_error_code = $2 WHERE id = $3`,
          [nextMessage, code, row.id],
        );
      }

      if (nextMessage === null) cleared++;
      else translated++;
    }

    console.log(
      `\n${cleared} cleared, ${translated} translated, ${unchanged} already fine.` +
        (apply ? "" : "\nNothing was written. Re-run with --apply."),
    );

    if (apply) {
      const leaks = await pool.query(
        `SELECT COUNT(*)::int AS n FROM fetch_runs
          WHERE error_message IS NOT NULL
            AND (error_message ILIKE '%apify%' OR error_message ILIKE '%econnrefused%'
                 OR error_message ILIKE '%recovering%' OR error_message ILIKE '%worker went away%'
                 OR error_message ILIKE '%retry %' OR error_message ILIKE '%_TOKEN%')`,
      );
      console.log(`Remaining rows with technical text: ${leaks.rows[0].n}`);

      const dirty = await pool.query(
        `SELECT COUNT(*)::int AS n FROM fetch_runs WHERE status = 'completed' AND error_message IS NOT NULL`,
      );
      console.log(`Completed runs still carrying an error: ${dirty.rows[0].n}`);
    }
  } catch (e) {
    console.error("ERROR:", e);
    process.exitCode = 1;
  } finally {
    await pool.end();
    const { pool: appPool } = await import("../server/db");
    await appPool.end();
  }
})();
