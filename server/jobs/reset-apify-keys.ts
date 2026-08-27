import { storage } from "../storage";
import { maskToken } from "../services/keyManager";
import { fetchApifyAccountUsage, type ApifyAccountUsage } from "../services/apifyAccount";
import { KEY_BUDGET_FLOOR } from "@shared/queue";

/**
 * What the job decided about one retired key.
 *
 * "held" carries a reason because the two are operationally different: a key
 * waiting out its cycle needs nothing, while a key that reached a fresh cycle
 * and still has no budget was genuinely spent and its retirement was correct.
 */
export type ResetDecision =
  | { action: "reset"; usage: ApifyAccountUsage }
  | { action: "hold"; reason: "same-cycle"; usage: ApifyAccountUsage; daysUntilRenewal: number }
  | { action: "hold"; reason: "no-budget"; usage: ApifyAccountUsage }
  | { action: "skip"; reason: string };

export interface KeyOutcome {
  id: string;
  token: string;
  decision: ResetDecision;
}

export interface ResetRunSummary {
  checked: number;
  reset: number;
  held: number;
  skipped: number;
  outcomes: KeyOutcome[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Should this key go back in the pool?
 *
 * Pure, and exported so the rules can be driven against constructed cycles —
 * including the ones the live pool does not currently contain, like a cycle
 * that turned over while the key was retired but left it still overspent.
 *
 * Two conditions, both required:
 *
 * 1. *A new cycle.* The account's cycle must have started after the last time
 *    we credited this key. Without it a key retired again mid-cycle would be
 *    handed its allowance a second time, and a key failing for a reason that
 *    is not budget at all would flip in and out of the pool every night.
 *    A key never reset before has no such timestamp, so any cycle counts —
 *    which is what lets this rescue the keys retired in error before the job
 *    existed.
 *
 * 2. *Money in it.* Apify's own figure, not ours, must clear the same floor
 *    selection uses. A cycle turning over does not by itself mean the credit
 *    came back: an account can carry spend past its allowance, and one in
 *    this pool does.
 */
export function decideKeyReset(
  usage: ApifyAccountUsage,
  lastResetAt: Date | null,
  now: Date,
): ResetDecision {
  const creditedThrough = lastResetAt ?? new Date(0);

  if (usage.cycleStart <= creditedThrough) {
    return {
      action: "hold",
      reason: "same-cycle",
      usage,
      daysUntilRenewal: Math.max(
        0,
        Math.ceil((usage.cycleEnd.getTime() - now.getTime()) / MS_PER_DAY),
      ),
    };
  }

  if (usage.remainingUsd <= KEY_BUDGET_FLOOR) {
    return { action: "hold", reason: "no-budget", usage };
  }

  return { action: "reset", usage };
}

function describe(outcome: KeyOutcome): string {
  const key = maskToken(outcome.token);
  const d = outcome.decision;

  if (d.action === "skip") {
    return `[KeyManager] ${key} — could not check (${d.reason}); staying retired`;
  }

  const cycle =
    `${d.usage.cycleStart.toISOString().slice(0, 10)} -> ` +
    `${d.usage.cycleEnd.toISOString().slice(0, 10)}`;
  const money = `$${d.usage.remainingUsd.toFixed(2)} of $${d.usage.limitUsd.toFixed(2)} left`;

  if (d.action === "reset") {
    return `[KeyManager] ${key} — new cycle ${cycle}, ${money}; returning to the pool`;
  }
  if (d.reason === "same-cycle") {
    return `[KeyManager] ${key} — still in cycle ${cycle}, renews in ${d.daysUntilRenewal} day(s)`;
  }
  return `[KeyManager] ${key} — new cycle ${cycle} but only ${money}; genuinely spent`;
}

/**
 * Return retired keys to the pool as their own Apify credit cycles turn over.
 *
 * Runs daily on the 01:00 UTC tick. It used to run only on the 1st, on the
 * assumption that Apify credit renews with the calendar — it does not. Each
 * account's cycle is anchored to its own signup date, reported per token by
 * GET /v2/users/me/usage/monthly. Across the ten accounts in this pool those
 * cycles start on the 27th (seven of them), the 30th, the 12th and the 1st,
 * so the calendar rule was right for one key in ten and left the rest retired
 * for up to 29 days after their credit had actually come back.
 *
 * So there is no date gate any more. Every retired key is polled for where it
 * actually stands, and the decision is per key. Healthy keys are never
 * polled: the cost is one API call per RETIRED key per day, which at today's
 * four is ~120 calls a month against a limit measured in calls per second.
 *
 * Nothing here can retire a key or spend credit — the only writes are
 * un-retiring one and stamping a check timestamp — so the worst a bad run can
 * do is leave the pool exactly as it found it. A key whose account cannot be
 * reached stays retired, deliberately: a retired key with credit costs
 * throughput, while a key put back without credit costs a user their fetch.
 *
 * `now` and `dryRun` are injectable so the job itself can be driven against
 * the live pool without writing.
 */
export async function autoResetExhaustedKeys(
  opts: { now?: Date; dryRun?: boolean } = {},
): Promise<ResetRunSummary> {
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun ?? false;

  const exhausted = await storage.getExhaustedApifyKeys();

  const summary: ResetRunSummary = {
    checked: exhausted.length,
    reset: 0,
    held: 0,
    skipped: 0,
    outcomes: [],
  };

  if (exhausted.length === 0) {
    console.log("[KeyManager] Reset check — no retired keys");
    return summary;
  }

  console.log(
    `[KeyManager] Reset check — polling ${exhausted.length} retired key(s)` +
      (dryRun ? " (dry run, nothing will be written)" : ""),
  );

  for (const key of exhausted) {
    let decision: ResetDecision;

    try {
      const usage = await fetchApifyAccountUsage(key.token);
      decision = decideKeyReset(usage, key.monthlyResetAt, now);
    } catch (err: any) {
      decision = { action: "skip", reason: err?.message ?? "unknown error" };
    }

    const outcome: KeyOutcome = { id: key.id, token: key.token, decision };
    summary.outcomes.push(outcome);
    console.log(describe(outcome));

    if (decision.action === "reset") {
      summary.reset++;
      if (!dryRun) {
        await storage.resetApifyKeyForNewCycle(
          key.id,
          { usedUsd: decision.usage.usedUsd, limitUsd: decision.usage.limitUsd },
          now,
        );
      }
    } else if (decision.action === "hold") {
      summary.held++;
      // A held key is still evidence the poll ran, which is the whole point of
      // recording the check separately from the reset.
      if (!dryRun) {
        await storage.markApifyKeyResetChecked(key.id, now);
      }
    } else {
      summary.skipped++;
    }
  }

  console.log(
    `[KeyManager] Reset check complete: ${summary.reset} returned to the pool, ` +
      `${summary.held} still retired, ${summary.skipped} unreachable`,
  );

  return summary;
}
