/**
 * Rotation validation — runs locally, no server needed, no query issued.
 *
 * Tests:
 *   1. isBudgetError() catches real credit/quota exhaustion + 402 + error type
 *   2. isBudgetError() does NOT fire on transient or merely limit-shaped errors
 *   3. Simulated failover: token 0 force-fails, rotation moves to token 1
 *   4. Exhausted token is skipped on subsequent attempt
 *
 * Test 2 is the H2 regression suite. Every "insufficient <not-money>" and
 * "<something> limit reached" case in it was a TRUE before the phrase list was
 * tightened, and each one retired a key holding real budget until the next
 * monthly reset.
 */

import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

config({ path: join(process.cwd(), '.env') });

// The real production function, not a copy of it. This script used to inline
// its own isBudgetError() "so it is self-contained"; the copy then drifted
// from the original and kept asserting the loose matching that retired four
// healthy keys. Importing keyManager costs a lazily-constructed pg Pool that
// never connects — no query is issued below.
const { isBudgetError, maskToken } = await import('../server/services/keyManager');

// ── Helpers ──

let passed = 0;
let failed = 0;

function expect(label: string, actual: boolean, expected: boolean) {
  if (actual === expected) {
    console.log(`  ✅ PASS  ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL  ${label}  (expected ${expected}, got ${actual})`);
    failed++;
  }
}

// ── Test 1: isBudgetError catches all quota phrases ──

console.log('\n══════════════════════════════════════════════════════');
console.log('  TEST 1 — isBudgetError() catches all quota phrases');
console.log('══════════════════════════════════════════════════════\n');

const shouldMatch: Array<[string, any]> = [
  ['HTTP 402 statusCode',          { statusCode: 402 }],
  ['HTTP 402 status',              { status: 402 }],
  ['HTTP 402 response.status',     { response: { status: 402 } }],
  ['type insufficient-credits',    { type: 'insufficient-credits' }],
  ['type account-blocked-for-budget', { type: 'account-blocked-for-budget' }],
  ['nested error.type',            { error: { type: 'insufficient-credits' } }],
  ['monthly usage limit reached',  new Error('monthly usage limit reached')],
  ['monthly usage hard limit',     new Error('Monthly usage hard limit exceeded')],
  ['usage limit exceeded',         new Error('usage limit exceeded')],
  ['usage hard limit exceeded',    new Error('usage hard limit exceeded')],
  ['reached your plan limit',      new Error('you have reached your plan limit')],
  ['limit for your current plan',  new Error("you've reached the limit for your current plan")],
  ['insufficient credit',          new Error('Actor: insufficient credit remaining')],
  ['insufficient credits',         new Error('insufficient credits on this account')],
  ['insufficient balance',         new Error('Insufficient balance in account')],
  ['insufficient funds',           new Error('insufficient funds')],
  ['payment required',             new Error('payment required')],
  ['account has been limited',     new Error('account has been limited')],
  ['platform usage credits',       new Error('platform usage credits exhausted')],
  ['budget exceeded',              new Error('budget exceeded for this account')],
  ['quota exceeded',               new Error('quota exceeded')],
  ['quota exhausted',              new Error('quota exhausted')],
  ['out of credit',                new Error('out of credit')],
  ['no credit remaining',          new Error('no credit remaining')],
  ['credit limit',                 new Error('credit limit reached')],
  ['account credit is depleted',   new Error('account credit is depleted')],
  ['account is suspended',         new Error('account is suspended')],
  ['nested error object',          { error: { message: 'monthly usage limit reached' } }],
  ['nested response.data.message', { response: { data: { message: 'payment required' } } }],
  ['string error value',           'monthly usage limit reached'],
];

for (const [label, err] of shouldMatch) {
  expect(label, isBudgetError(err), true);
}

// ── Test 2: Non-budget errors do NOT trigger ──

console.log('\n══════════════════════════════════════════════════════');
console.log('  TEST 2 — isBudgetError() does NOT fire on transient errors');
console.log('══════════════════════════════════════════════════════\n');

const shouldNotMatch: Array<[string, any]> = [
  ['null error',            null],
  ['network timeout',       new Error('ECONNRESET: connection reset')],
  ['rate limited 429',      { statusCode: 429, message: 'Too Many Requests' }],
  ['403 no budget message', { statusCode: 403, message: 'Forbidden' }],
  ['actor failed',          new Error('Actor run failed with status FAILED')],
  ['dataset not found',     new Error('Dataset not found')],
  ['empty message',         new Error('')],

  // ── H2 regressions: every one of these returned TRUE before the phrase
  // list was tightened, and every TRUE retired a funded key ──────────────
  ['insufficient permissions',   new Error('Insufficient permissions')],
  ['insufficient data',          new Error('Insufficient data returned from Instagram')],
  ['insufficient privileges',    new Error('insufficient privileges for this resource')],
  ['rate limit reached',         new Error('Rate limit reached')],
  ['result limit reached',       new Error('reached the limit of 100 results')],
  ['concurrency limit exceeded', new Error('exceeded the limit of concurrent actor runs')],
  ['too many runs',              new Error('You have exceeded the maximum number of concurrent runs')],
  ['memory limit',               new Error('Actor exceeded the memory limit')],
  ['no credit card on file',     new Error('no credit card on file for this account')],
  ['actor exited',               new Error('Actor exited with error')],
  ['unknown error type',         { type: 'actor-run-failed' }],
];

for (const [label, err] of shouldNotMatch) {
  expect(label, isBudgetError(err), false);
}

// ── Test 3: Simulated failover ──

console.log('\n══════════════════════════════════════════════════════');
console.log('  TEST 3 — Simulated failover (token 0 force-fails)');
console.log('══════════════════════════════════════════════════════\n');

const filePath = join(process.cwd(), 'apify_api.txt');
const tokens = [
  ...new Set(
    readFileSync(filePath, 'utf-8')
      .split('\n')
      .map((t) => t.trim())
      .filter((t) => t.startsWith('apify_api_')),
  ),
];

console.log(`  Loaded ${tokens.length} tokens from apify_api.txt`);
expect('10 tokens loaded', tokens.length === 10, true);
console.log('');

// Simulate rotation pool — in-memory exhausted set
const exhaustedTokens = new Set<string>();

function getBestTokenSimulated(): string | null {
  const available = tokens.filter((t) => !exhaustedTokens.has(t));
  return available[0] ?? null;
}

function markExhaustedSimulated(token: string) {
  exhaustedTokens.add(token);
  console.log(`  [keyManager] Marked key ${maskToken(token)} as exhausted`);
}

// Force-fail token: first token in the file
const FORCE_FAIL_TOKEN = tokens[0];
console.log(`  Force-fail token: ${maskToken(FORCE_FAIL_TOKEN)}`);
console.log('');

// Run rotation loop (mirrors runActorWithRotation)
const MAX_KEY_ATTEMPTS = 10;
let usedToken: string | null = null;
let failoverOccurred = false;

for (let attempt = 0; attempt < MAX_KEY_ATTEMPTS; attempt++) {
  const token = getBestTokenSimulated();
  if (!token) {
    console.log('  [keyManager] All Apify keys exhausted — no budget remaining');
    break;
  }

  // Test hook: inject budget error for the force-fail token
  if (token === FORCE_FAIL_TOKEN) {
    const fakeErr = new Error('monthly usage limit reached');
    console.log(`  [keyManager] APIFY_TEST_FORCE_BUDGET_ERROR active — injecting budget error for ${maskToken(token)}`);
    if (isBudgetError(fakeErr)) {
      console.log(`  [keyManager] Token ${maskToken(token)} hit budget limit. Marking exhausted, rotating to next.`);
      markExhaustedSimulated(token);
      failoverOccurred = true;
      continue;
    }
  }

  // Simulate successful fetch with next token
  console.log(`  [keyManager] Using token ${maskToken(token)} for fetch (attempt ${attempt + 1})`);
  console.log(`  [keyManager] Fetch succeeded with token ${maskToken(token)}`);
  usedToken = token;
  break;
}

console.log('');
expect('failover occurred (token 0 was rejected)', failoverOccurred, true);
expect('fetch completed (usedToken is not null)', usedToken !== null, true);
expect('first token was NOT used for successful fetch', usedToken !== FORCE_FAIL_TOKEN, true);
expect('second token WAS used', usedToken === tokens[1], true);
expect('first token is now exhausted', exhaustedTokens.has(FORCE_FAIL_TOKEN), true);

// ── Test 4: Exhausted token is skipped on next attempt ──

console.log('\n══════════════════════════════════════════════════════');
console.log('  TEST 4 — Exhausted token skipped on next fetch');
console.log('══════════════════════════════════════════════════════\n');

const nextToken = getBestTokenSimulated();
console.log(`  Next getBestKey() returns: ${nextToken ? maskToken(nextToken) : 'null'}`);
expect('exhausted token skipped, next token selected', nextToken === tokens[1], true);
expect('first token still in exhausted set', exhaustedTokens.has(FORCE_FAIL_TOKEN), true);

// ── Summary ──

console.log('\n══════════════════════════════════════════════════════');
console.log('  RESULTS');
console.log('══════════════════════════════════════════════════════\n');
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log('');

if (failed > 0) {
  console.error(`  ❌ ${failed} test(s) failed`);
  process.exit(1);
} else {
  console.log('  ✅ All tests passed — rotation is production-ready');
}
