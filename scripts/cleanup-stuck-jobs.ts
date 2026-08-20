// scripts/cleanup-stuck-jobs.ts
// One-off reconciliation for jobs stranded in status='running' by a worker that
// died before the stuck-job sweep existed. See docs/fetch-flow-audit.md (C3).
//
// Run this BEFORE deploying the C1 sweep so the affected users are unblocked
// immediately. The C1 sweep uses a 15-minute heartbeat threshold; these rows
// predate heartbeats entirely, so this script uses a much more conservative
// 1-hour age cutoff and is safe to run against a live system.
//
// Usage:
//   npx tsx scripts/cleanup-stuck-jobs.ts              # dry run (default)
//   npx tsx scripts/cleanup-stuck-jobs.ts --apply      # actually write
//   npx tsx scripts/cleanup-stuck-jobs.ts --apply --older-than-mins=120
//
// Env loading mirrors scripts/run-downgrade.ts so this hits the same database
// the dev server does.

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const { and, eq, lt, sql } = await import("drizzle-orm");
const { db, pool } = await import("../server/db");
const { jobs, fetchRuns, profiles } = await import("@shared/schema");

const APPLY = process.argv.includes("--apply");
const olderThanArg = process.argv.find((a) => a.startsWith("--older-than-mins="));
const OLDER_THAN_MINS = olderThanArg ? Number(olderThanArg.split("=")[1]) : 60;

/**
 * Terminal fetch-run states. If the parent run already reached one of these,
 * the dangling job row is pure residue: the user has already seen a final
 * outcome. Requeueing it would resurrect a run they cancelled (or that failed
 * on budget) and spend Apify credit re-fetching data nobody is waiting for —
 * so those get closed out instead.
 */
const TERMINAL_RUN_STATUSES = ["completed", "failed"];

type Plan = {
  jobId: string;
  fetchRunId: string;
  userId: string;
  userEmail: string | null;
  runStatus: string;
  attempts: number;
  staleMins: number;
  action: "requeue" | "close";
  reason: string;
};

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[Cleanup] DATABASE_URL is not set. Check .env / .env.local");
    process.exit(1);
  }

  if (!Number.isFinite(OLDER_THAN_MINS) || OLDER_THAN_MINS <= 0) {
    console.error(`[Cleanup] Invalid --older-than-mins value: ${OLDER_THAN_MINS}`);
    process.exit(1);
  }

  console.log(`[Cleanup] Mode: ${APPLY ? "APPLY (writes)" : "DRY RUN (no writes)"}`);
  console.log(`[Cleanup] Threshold: jobs running & untouched for > ${OLDER_THAN_MINS} min`);
  console.log(`[Cleanup] DATABASE_URL prefix: ${process.env.DATABASE_URL.slice(0, 30)}...`);

  const cutoff = new Date(Date.now() - OLDER_THAN_MINS * 60 * 1000);

  const stuck = await db
    .select({
      jobId: jobs.id,
      fetchRunId: jobs.fetchRunId,
      userId: jobs.userId,
      attempts: jobs.attempts,
      jobUpdatedAt: jobs.updatedAt,
      runStatus: fetchRuns.status,
      userEmail: profiles.email,
    })
    .from(jobs)
    .innerJoin(fetchRuns, eq(fetchRuns.id, jobs.fetchRunId))
    .leftJoin(profiles, eq(profiles.id, jobs.userId))
    .where(and(eq(jobs.status, "running"), lt(jobs.updatedAt, cutoff)))
    .orderBy(jobs.updatedAt);

  if (stuck.length === 0) {
    console.log("[Cleanup] No stuck jobs found. Nothing to do.");
    return;
  }

  const plans: Plan[] = stuck.map((row) => {
    const staleMins = Math.round((Date.now() - new Date(row.jobUpdatedAt).getTime()) / 60000);
    const parentIsTerminal = TERMINAL_RUN_STATUSES.includes(row.runStatus);

    return {
      jobId: row.jobId,
      fetchRunId: row.fetchRunId,
      userId: row.userId,
      userEmail: row.userEmail,
      runStatus: row.runStatus,
      attempts: row.attempts,
      staleMins,
      action: parentIsTerminal ? "close" : "requeue",
      reason: parentIsTerminal
        ? `parent run already ${row.runStatus} — closing dangling job, no refetch`
        : `parent run still ${row.runStatus} — requeueing so the user gets their data`,
    };
  });

  console.log(`\n[Cleanup] Found ${plans.length} stuck job(s):\n`);
  for (const p of plans) {
    console.log(
      `  ${p.action.toUpperCase().padEnd(7)} job=${p.jobId} run=${p.fetchRunId}\n` +
        `          user=${p.userEmail ?? p.userId} run_status=${p.runStatus} ` +
        `attempts=${p.attempts} stale=${p.staleMins}m\n` +
        `          ${p.reason}`,
    );
  }

  const requeueCount = plans.filter((p) => p.action === "requeue").length;
  const closeCount = plans.filter((p) => p.action === "close").length;
  console.log(`\n[Cleanup] Plan: ${requeueCount} requeue, ${closeCount} close.`);

  if (!APPLY) {
    console.log("[Cleanup] DRY RUN — nothing written. Re-run with --apply to execute.");
    return;
  }

  let applied = 0;
  let skipped = 0;

  for (const p of plans) {
    // Every write is a CAS on status='running'. If a live worker (or the C1
    // sweep) resolved the job between our SELECT and this UPDATE, zero rows
    // come back and we leave it alone rather than stomping the newer state.
    if (p.action === "requeue") {
      const updated = await db
        .update(jobs)
        .set({
          status: "queued",
          lastError: `Recovered by cleanup-stuck-jobs (stale ${p.staleMins}m)`,
          updatedAt: new Date(),
        })
        .where(and(eq(jobs.id, p.jobId), eq(jobs.status, "running")))
        .returning({ id: jobs.id });

      if (updated.length === 0) {
        console.log(`[Cleanup] SKIP job=${p.jobId} — no longer running`);
        skipped++;
        continue;
      }

      await db
        .update(fetchRuns)
        .set({
          status: "queued",
          errorMessage: `Recovering: worker went away ${p.staleMins}m ago`,
        })
        .where(eq(fetchRuns.id, p.fetchRunId));

      console.log(`[Cleanup] REQUEUED job=${p.jobId} run=${p.fetchRunId}`);
      applied++;
    } else {
      const updated = await db
        .update(jobs)
        .set({
          status: "failed",
          lastError: `Closed by cleanup-stuck-jobs (parent run already ${p.runStatus})`,
          updatedAt: new Date(),
        })
        .where(and(eq(jobs.id, p.jobId), eq(jobs.status, "running")))
        .returning({ id: jobs.id });

      if (updated.length === 0) {
        console.log(`[Cleanup] SKIP job=${p.jobId} — no longer running`);
        skipped++;
        continue;
      }

      // The parent run is deliberately left untouched: it already carries the
      // outcome the user saw (cancelled / budget failure) and rewriting it
      // would falsify their history.
      console.log(`[Cleanup] CLOSED job=${p.jobId} (run left as ${p.runStatus})`);
      applied++;
    }
  }

  console.log(`\n[Cleanup] Done. ${applied} applied, ${skipped} skipped.`);

  const remaining = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(and(eq(jobs.status, "running"), lt(jobs.updatedAt, cutoff)));
  console.log(`[Cleanup] Stuck jobs remaining above threshold: ${remaining[0]?.n ?? 0}`);
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[Cleanup] Failed:", err);
    await pool.end();
    process.exit(1);
  });
