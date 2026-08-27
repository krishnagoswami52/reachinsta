/**
 * What Apify itself says about an account: when its credit cycle turns over,
 * and how much of the allowance is gone.
 *
 * This is the authority on both questions. The local apify_keys accounting is
 * an estimate — cost-per-item multiplied by item count, accumulated since the
 * token was seeded and never reset when the real cycle rolls over — so it
 * drifts in both directions and cannot answer "has this key's credit come
 * back yet" at all.
 *
 * Two endpoints, because the answers live in different places:
 *   GET /v2/users/me                  -> plan and its ceiling
 *   GET /v2/users/me/usage/monthly    -> the cycle window and the spend
 */

/** Ceilings for the plans this pool uses, when the plan object omits its own. */
const PLAN_LIMITS_USD: Record<string, number> = { FREE: 5, PERSONAL: 49, TEAM: 499 };

const DEFAULT_LIMIT_USD = 5;
const REQUEST_TIMEOUT_MS = 15_000;

export interface ApifyAccountUsage {
  /** Plan id, e.g. "FREE". */
  plan: string;
  /** Start of the account's current credit cycle — anchored to its signup date. */
  cycleStart: Date;
  /** Last instant of the current cycle. */
  cycleEnd: Date;
  /** Spend inside the current cycle, in USD. Can exceed the limit. */
  usedUsd: number;
  /** The cycle's allowance, in USD. */
  limitUsd: number;
  /** limitUsd - usedUsd, floored at zero. */
  remainingUsd: number;
}

/**
 * Pull the plan ceiling out of a /users/me payload.
 *
 * `plan` arrives as an object on current accounts and as a bare string id on
 * older ones, so both are handled.
 */
function readPlanLimit(planRaw: any): { plan: string; limitUsd: number } {
  const plan =
    typeof planRaw === "object" && planRaw !== null
      ? (planRaw.id ?? planRaw.tier ?? "FREE")
      : (planRaw ?? "FREE");

  const limitUsd =
    (typeof planRaw === "object" && planRaw?.maxMonthlyUsageUsd) ||
    PLAN_LIMITS_USD[plan] ||
    DEFAULT_LIMIT_USD;

  return { plan, limitUsd };
}

/**
 * Total spend for the cycle, from a /users/me/usage/monthly payload.
 *
 * The top-level total is the field to use, and reading anything else is how
 * this went wrong before. `monthlyServiceUsage` is an object keyed by service
 * name whose entries carry `amountAfterVolumeDiscountUsd`; the per-tier
 * `priceUsd` figures sit one level further down inside each entry's
 * `priceTiers` array. Summing `entry.priceUsd` therefore adds up a column of
 * `undefined` and yields exactly $0.00 for every account, every time —
 * which is what scripts/apify-audit.ts had been reporting.
 *
 * Order below is most to least authoritative, so a payload missing the
 * top-level totals still produces a real number rather than a confident zero.
 */
export function readCycleSpend(usage: any): number {
  const total =
    usage?.totalUsageCreditsUsdAfterVolumeDiscount ??
    usage?.totalUsageCreditsUsdBeforeVolumeDiscount;
  if (typeof total === "number") return total;

  const services = usage?.monthlyServiceUsage;

  // Legacy array shape: one row per service, plus a TOTAL row.
  if (Array.isArray(services)) {
    const totalRow = services.find((s: any) => s.serviceName === "TOTAL");
    if (typeof totalRow?.priceUsd === "number") return totalRow.priceUsd;
    return services.reduce((sum: number, s: any) => sum + (s?.priceUsd ?? 0), 0);
  }

  if (services && typeof services === "object") {
    return Object.values(services as Record<string, any>).reduce(
      (sum: number, entry: any) =>
        sum + (entry?.amountAfterVolumeDiscountUsd ?? entry?.baseAmountUsd ?? 0),
      0,
    );
  }

  return usage?.usdSpent ?? 0;
}

/**
 * Build the usage view from the two raw payloads.
 *
 * Pure, and exported separately from the fetching so the parsing can be
 * tested against recorded payloads — including the shapes this pool does not
 * currently produce.
 */
export function parseAccountUsage(userData: any, usageData: any): ApifyAccountUsage {
  const { plan, limitUsd } = readPlanLimit(userData?.plan);

  const startAt = usageData?.usageCycle?.startAt;
  const endAt = usageData?.usageCycle?.endAt;
  if (!startAt || !endAt) {
    throw new Error("usage payload carries no usageCycle");
  }

  const cycleStart = new Date(startAt);
  const cycleEnd = new Date(endAt);
  if (Number.isNaN(cycleStart.getTime()) || Number.isNaN(cycleEnd.getTime())) {
    throw new Error(`unparseable usageCycle (${startAt} -> ${endAt})`);
  }

  const usedUsd = readCycleSpend(usageData);

  return {
    plan,
    cycleStart,
    cycleEnd,
    usedUsd,
    limitUsd,
    remainingUsd: Math.max(0, limitUsd - usedUsd),
  };
}

async function getJson(url: string, token: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`${url.replace("https://api.apify.com/v2", "")} -> HTTP ${res.status}`);
  }
  return ((await res.json()) as any)?.data;
}

/**
 * Ask Apify where this token's account stands right now.
 *
 * Throws on a dead token, a network failure or a payload without a usage
 * cycle. Callers decide what an unanswerable key means — for the reset job it
 * means "leave it retired", never "assume it is funded".
 */
export async function fetchApifyAccountUsage(token: string): Promise<ApifyAccountUsage> {
  const [userData, usageData] = await Promise.all([
    getJson("https://api.apify.com/v2/users/me", token),
    getJson("https://api.apify.com/v2/users/me/usage/monthly", token),
  ]);
  return parseAccountUsage(userData, usageData);
}
