/**
 * Apify Multi-Account Audit Script
 *
 * Run with: npm run audit:apify
 *
 * Loads tokens from (in priority order):
 *   1. apify_api.txt   — one token per line (production source, same as keyManager.ts)
 *   2. APIFY_TOKEN_N   — numbered env vars (APIFY_TOKEN_1 … APIFY_TOKEN_20)
 *   3. APIFY_TOKENS    — comma-separated env var
 *   4. APIFY_TOKEN     — single env var fallback
 *
 * Queries the real Apify API (not the local DB estimates) so results reflect
 * actual account state even if the DB tracking has drifted.
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { readCycleSpend } from '../server/services/apifyAccount';

// ===== Token loader =====

function loadTokens(): string[] {
  const tokens: string[] = [];

  // Source 1: apify_api.txt (same file keyManager.ts seeds from)
  try {
    const content = readFileSync(join(process.cwd(), 'apify_api.txt'), 'utf-8');
    const fromFile = content
      .trim()
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean);
    tokens.push(...fromFile);
    if (fromFile.length > 0) {
      console.log(`  Loaded ${fromFile.length} token(s) from apify_api.txt`);
    }
  } catch {
    // file doesn't exist — that's fine, fall through to env vars
  }

  // Source 2: numbered env vars APIFY_TOKEN_1 … APIFY_TOKEN_20
  for (let i = 1; i <= 20; i++) {
    const t = process.env[`APIFY_TOKEN_${i}`];
    if (t?.trim()) tokens.push(t.trim());
  }

  // Source 3: comma-separated APIFY_TOKENS
  if (process.env.APIFY_TOKENS) {
    tokens.push(
      ...process.env.APIFY_TOKENS
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    );
  }

  // Source 4: single APIFY_TOKEN
  if (process.env.APIFY_TOKEN?.trim()) {
    tokens.push(process.env.APIFY_TOKEN.trim());
  }

  return [...new Set(tokens)]; // dedupe
}

// ===== Types =====

type AccountStatus = 'healthy' | 'warning' | 'exhausted' | 'invalid';

interface AccountReport {
  tokenPreview: string;
  status: AccountStatus;
  email?: string;
  username?: string;
  plan?: string;
  usageThisMonth?: number;
  monthlyLimit?: number;
  percentUsed?: number;
  remainingCredit?: number;
  /** Apify anchors each account's cycle to its signup date, not the 1st. */
  cycleStart?: string;
  cycleEnd?: string;
  lastError?: string;
  proxyGbUsed?: number;
}

// ===== Apify API calls =====

async function getAccountInfo(token: string): Promise<AccountReport> {
  const preview = `${token.slice(0, 12)}...${token.slice(-4)}`;

  try {
    // GET https://api.apify.com/v2/users/me
    const userRes = await fetch('https://api.apify.com/v2/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!userRes.ok) {
      return {
        tokenPreview: preview,
        status: 'invalid',
        lastError: `User info HTTP ${userRes.status}`,
      };
    }

    const userJson = await userRes.json() as any;
    const ud = userJson.data;

    // GET https://api.apify.com/v2/users/me/usage/monthly
    const usageRes = await fetch('https://api.apify.com/v2/users/me/usage/monthly', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!usageRes.ok) {
      // Still return what we have from user info
      return {
        tokenPreview: preview,
        status: 'warning',
        email: ud?.email,
        username: ud?.username,
        plan: ud?.plan ?? 'FREE',
        lastError: `Usage info HTTP ${usageRes.status}`,
      };
    }

    const usageJson = await usageRes.json() as any;
    const usage = usageJson.data;

    // Spend for the cycle. This used to sum `entry.priceUsd` across
    // monthlyServiceUsage, which does not exist at that level — priceUsd sits
    // inside each entry's priceTiers array — so every account reported $0.00
    // used and 🟢 healthy no matter how much it had actually spent. The
    // top-level total is the right field; readCycleSpend() is shared with the
    // reset job so this cannot drift again.
    const monthlyUsageUsd: number = readCycleSpend(usage);

    // Plan may be a string ID or a full plan object — normalise to string ID
    const planRaw = ud?.plan;
    const plan: string =
      typeof planRaw === 'object' && planRaw !== null
        ? (planRaw.id ?? planRaw.tier ?? 'FREE')
        : (planRaw ?? 'FREE');

    // Prefer the plan object's own limit (more accurate than a hardcoded table)
    const planLimits: Record<string, number> = { FREE: 5, PERSONAL: 49, TEAM: 499 };
    const monthlyLimit: number =
      (typeof planRaw === 'object' && planRaw?.maxMonthlyUsageUsd) ||
      planLimits[plan] ||
      5;
    const percentUsed = (monthlyUsageUsd / monthlyLimit) * 100;
    const remaining = Math.max(0, monthlyLimit - monthlyUsageUsd);

    let status: AccountStatus = 'healthy';
    if (percentUsed >= 95) status = 'exhausted';
    else if (percentUsed >= 75) status = 'warning';

    return {
      tokenPreview: preview,
      status,
      email: ud?.email,
      username: ud?.username,
      plan,
      usageThisMonth: monthlyUsageUsd,
      monthlyLimit,
      percentUsed: Math.round(percentUsed * 10) / 10,
      remainingCredit: Math.round(remaining * 100) / 100,
      cycleStart: usage?.usageCycle?.startAt,
      cycleEnd: usage?.usageCycle?.endAt,
      proxyGbUsed: ud?.proxy?.usedGB != null
        ? Math.round(ud.proxy.usedGB * 100) / 100
        : undefined,
    };
  } catch (err: any) {
    return {
      tokenPreview: preview,
      status: 'invalid',
      lastError: err.message ?? 'Unknown error',
    };
  }
}

// ===== Main =====

async function main() {
  console.log('\nLoading tokens...');
  const tokens = loadTokens();

  if (tokens.length === 0) {
    console.error('\n❌ No Apify tokens found.');
    console.error('   Add tokens to apify_api.txt (one per line) or set APIFY_TOKEN in .env\n');
    process.exit(1);
  }

  console.log(`\n🔍 Auditing ${tokens.length} Apify account(s)...\n`);

  const reports = await Promise.all(tokens.map(getAccountInfo));

  // Sort: most credit remaining first (these are rotation-preferred)
  reports.sort((a, b) => (b.remainingCredit ?? -1) - (a.remainingCredit ?? -1));

  const SEP = '═══════════════════════════════════════════════════════════════════════';
  const statusEmoji: Record<AccountStatus, string> = {
    healthy:   '🟢',
    warning:   '🟡',
    exhausted: '🔴',
    invalid:   '⚫',
  };

  console.log(SEP);
  console.log(' APIFY ACCOUNT AUDIT');
  console.log(SEP + '\n');

  reports.forEach((r, i) => {
    console.log(`${i + 1}. ${statusEmoji[r.status]}  ${r.status.toUpperCase()}`);
    console.log(`   Token:     ${r.tokenPreview}`);

    if (r.status === 'invalid') {
      console.log(`   Error:     ${r.lastError}`);
    } else {
      console.log(`   Email:     ${r.email ?? '(unknown)'}`);
      console.log(`   Username:  ${r.username ?? '(unknown)'}`);
      console.log(`   Plan:      ${r.plan}`);
      console.log(`   Used:      $${(r.usageThisMonth ?? 0).toFixed(2)} / $${r.monthlyLimit} (${r.percentUsed}%)`);
      console.log(`   Remaining: $${(r.remainingCredit ?? 0).toFixed(2)}`);
      if (r.cycleStart) {
        console.log(`   Cycle:     ${r.cycleStart.slice(0, 10)} -> ${r.cycleEnd?.slice(0, 10)}`);
      }
      if (r.proxyGbUsed !== undefined) {
        console.log(`   Proxy:     ${r.proxyGbUsed} GB used`);
      }
      if (r.lastError) {
        console.log(`   Note:      ${r.lastError}`);
      }
    }
    console.log('');
  });

  // Summary
  const healthy   = reports.filter((r) => r.status === 'healthy');
  const warning   = reports.filter((r) => r.status === 'warning');
  const exhausted = reports.filter((r) => r.status === 'exhausted');
  const invalid   = reports.filter((r) => r.status === 'invalid');
  const totalRemaining = reports.reduce((s, r) => s + (r.remainingCredit ?? 0), 0);

  console.log(SEP);
  console.log(' SUMMARY');
  console.log(SEP);
  console.log(`  🟢 Healthy:    ${healthy.length} account(s) — safe to use`);
  console.log(`  🟡 Warning:    ${warning.length} account(s) — >75% used`);
  console.log(`  🔴 Exhausted:  ${exhausted.length} account(s) — each resets on its own cycle date, shown above`);
  console.log(`  ⚫ Invalid:    ${invalid.length} token(s) — bad credentials`);
  console.log(`  💰 Total remaining credit: $${totalRemaining.toFixed(2)}`);
  console.log(SEP + '\n');

  // Recommendations
  const recs: string[] = [];
  if (exhausted.length > 0)
    recs.push(`${exhausted.length} account(s) exhausted — rotation skips these until each one's own cycle turns over.`);
  if (invalid.length > 0)
    recs.push(`${invalid.length} token(s) invalid — remove from apify_api.txt to stop wasted attempts.`);
  if (healthy.length === 0 && warning.length === 0)
    recs.push('🚨 NO HEALTHY ACCOUNTS — fetches will fail until accounts reset or new ones are added.');
  if (tokens.length === 1)
    recs.push('Only 1 token found — add remaining tokens to apify_api.txt then run: npm run audit:apify');

  if (recs.length > 0) {
    console.log('⚠️  RECOMMENDATIONS:\n');
    recs.forEach((r) => console.log(`  • ${r}`));
    console.log('');
  }

  // JSON for programmatic use
  console.log('─── JSON output (for rotation logic) ───────────────────────────────────');
  console.log(JSON.stringify(reports, null, 2));
  console.log('');
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
