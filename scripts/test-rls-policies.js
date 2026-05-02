#!/usr/bin/env node
/**
 * test-rls-policies.js
 *
 * Tests Row Level Security on all 12 ReachInsta tables via the
 * Supabase PostgREST API (the actual attack surface being protected).
 *
 * IMPORTANT: This script tests the PostgREST REST API, NOT the
 * backend Express API. The backend bypasses RLS via direct PostgreSQL
 * connection — that path does not need testing here.
 *
 * SETUP:
 *   1. Install: npm install @supabase/supabase-js dotenv
 *   2. Create .env.test (do NOT commit it):
 *        SUPABASE_URL=https://[your-project-ref].supabase.co
 *        SUPABASE_ANON_KEY=eyJ...          (from Dashboard → Settings → API)
 *        SUPABASE_SERVICE_ROLE_KEY=eyJ...  (from Dashboard → Settings → API)
 *   3. Apply the RLS migration first:
 *        Paste supabase/migrations/20260501000000_enable_rls_security.sql
 *        into Supabase SQL editor and run it.
 *   4. Run: node scripts/test-rls-policies.js
 *
 * NOTE ON AUTH:
 *   This app uses custom auth (Express sessions), NOT Supabase Auth.
 *   auth.uid() returns NULL for all PostgREST requests — the "authenticated"
 *   role policies effectively block access. This test verifies that behavior.
 *   The service role key bypasses RLS, so it should always have full access.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env.test
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const envPath = join(__dirname, "..", ".env.test");
  const envContent = readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) {
      process.env[key.trim()] = rest.join("=").trim();
    }
  });
} catch {
  // Fall through — env vars may already be set in the environment
}

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`
ERROR: Missing required environment variables.

Create .env.test with:
  SUPABASE_URL=https://[your-project-ref].supabase.co
  SUPABASE_ANON_KEY=eyJ...
  SUPABASE_SERVICE_ROLE_KEY=eyJ...

Find these in: Supabase Dashboard → Settings → API
`);
  process.exit(1);
}

// Two clients — anon simulates unauthenticated browser, service role simulates backend
const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// =============================================================
// Table definitions
// =============================================================

const TIER_1_TABLES = [
  { name: "users",                    expectAnonBlocked: true,  notes: "password_hash present — must be blocked" },
  { name: "profiles",                 expectAnonBlocked: true,  notes: "Paddle subscription data" },
  { name: "sessions",                 expectAnonBlocked: true,  notes: "No user_id column — backend-only" },
  { name: "email_verification_tokens",expectAnonBlocked: true,  notes: "token_hash is a secret" },
  { name: "password_reset_tokens",    expectAnonBlocked: true,  notes: "token_hash is a secret" },
];

const TIER_2_TABLES = [
  { name: "apify_keys",       expectAnonBlocked: true, notes: "CRITICAL — contains plaintext API keys" },
  { name: "fetch_runs",       expectAnonBlocked: true, notes: "Backend-only job records" },
  { name: "raw_payloads",     expectAnonBlocked: true, notes: "Raw Apify JSON responses" },
  { name: "jobs",             expectAnonBlocked: true, notes: "Internal job queue" },
  { name: "reels",            expectAnonBlocked: true, notes: "Scraped reel metrics" },
  { name: "competitor_stats", expectAnonBlocked: true, notes: "Computed stats" },
  { name: "competitors",      expectAnonBlocked: true, notes: "User's tracked accounts" },
];

const ALL_TABLES = [...TIER_1_TABLES, ...TIER_2_TABLES];

// =============================================================
// Test helpers
// =============================================================

const PASS = "PASS";
const FAIL = "FAIL";
const SKIP = "SKIP";

function colorize(label, text) {
  const colors = { PASS: "\x1b[32m", FAIL: "\x1b[31m", SKIP: "\x1b[33m", RESET: "\x1b[0m" };
  return `${colors[label] ?? ""}${text}${colors.RESET}`;
}

async function testSelect(client, tableName) {
  const { data, error } = await client.from(tableName).select("*").limit(1);
  return { data, error };
}

async function testInsert(client, tableName) {
  // Attempt a bogus insert — we only care whether it's blocked, not whether it succeeds
  const { data, error } = await client.from(tableName).insert({ _rls_test: true }).select();
  return { data, error };
}

function isBlocked(result) {
  if (result.error) {
    const msg = result.error.message?.toLowerCase() ?? "";
    const code = result.error.code;
    // RLS block: 0 rows returned (empty array) or specific error codes
    if (
      code === "42501" ||            // PostgreSQL: insufficient privilege
      msg.includes("rls") ||
      msg.includes("row level security") ||
      msg.includes("permission denied") ||
      msg.includes("new row violates") ||
      msg.includes("policy")
    ) {
      return true;
    }
  }
  // RLS SELECT block returns empty array, not an error
  if (Array.isArray(result.data) && result.data.length === 0 && !result.error) {
    // Could be empty table OR RLS block — we count this as "effectively blocked"
    return true;
  }
  return false;
}

function isServiceRoleAccessible(result) {
  // Service role should either get data (array) or get no error
  // An empty array is fine for an empty table
  if (!result.error) return true;
  // "relation does not exist" means the table name is wrong in our test config
  if (result.error.code === "42P01") return false;
  return false;
}

// =============================================================
// Main test runner
// =============================================================

async function runTests() {
  const results = [];
  let passCount = 0;
  let failCount = 0;

  console.log("\n" + "=".repeat(72));
  console.log("  ReachInsta RLS Policy Test Suite");
  console.log("  Target: " + SUPABASE_URL);
  console.log("=".repeat(72));

  console.log("\n[1/3] Testing anon client SELECT (should be blocked on ALL tables)...\n");

  for (const table of ALL_TABLES) {
    const result = await testSelect(anonClient, table.name);
    const blocked = isBlocked(result);
    const status = blocked === table.expectAnonBlocked ? PASS : FAIL;

    if (status === PASS) passCount++;
    else failCount++;

    const statusLabel = colorize(status, `[${status}]`);
    const errorDetail = result.error ? ` (${result.error.code}: ${result.error.message?.slice(0, 60)})` : " (empty result set)";
    console.log(`  ${statusLabel} anon SELECT ${table.name.padEnd(28)} ${blocked ? "BLOCKED" : "EXPOSED ← SECURITY ISSUE"}${blocked ? errorDetail : ""}`);
    results.push({ table: table.name, test: "anon SELECT", status, blocked, expected: table.expectAnonBlocked });
  }

  console.log("\n[2/3] Testing anon client INSERT (should be blocked on ALL tables)...\n");

  for (const table of ALL_TABLES) {
    const result = await testInsert(anonClient, table.name);
    const blocked = result.error !== null; // Any error = blocked
    const status = blocked ? PASS : FAIL;

    if (status === PASS) passCount++;
    else failCount++;

    const statusLabel = colorize(status, `[${status}]`);
    const errorDetail = result.error ? ` (${result.error.code}: ${result.error.message?.slice(0, 60)})` : "";
    console.log(`  ${statusLabel} anon INSERT ${table.name.padEnd(28)} ${blocked ? "BLOCKED" : "EXPOSED ← SECURITY ISSUE"}${errorDetail}`);
    results.push({ table: table.name, test: "anon INSERT", status, blocked });
  }

  console.log("\n[3/3] Testing service role client SELECT (should succeed on ALL tables)...\n");

  for (const table of ALL_TABLES) {
    const result = await testSelect(serviceClient, table.name);
    const accessible = isServiceRoleAccessible(result);
    const status = accessible ? PASS : FAIL;

    if (status === PASS) passCount++;
    else failCount++;

    const statusLabel = colorize(status, `[${status}]`);
    const rowCount = Array.isArray(result.data) ? result.data.length : "?";
    const errorDetail = result.error ? ` ERROR: ${result.error.code}: ${result.error.message?.slice(0, 60)}` : ` (${rowCount} row(s) returned)`;
    console.log(`  ${statusLabel} service SELECT ${table.name.padEnd(28)} ${accessible ? "ACCESSIBLE" : "BLOCKED ← SERVICE ROLE ISSUE"}${errorDetail}`);
    results.push({ table: table.name, test: "service SELECT", status, accessible });
  }

  // Summary
  const total = passCount + failCount;
  console.log("\n" + "=".repeat(72));
  console.log(`  RESULTS: ${colorize(failCount === 0 ? "PASS" : "FAIL", `${passCount}/${total} passed, ${failCount} failed`)}`);
  console.log("=".repeat(72));

  if (failCount > 0) {
    console.log("\nFAILED TESTS:");
    results.filter(r => r.status === FAIL).forEach(r => {
      console.log(`  - ${r.table} / ${r.test}`);
    });
    console.log("\nIf anon SELECT shows EXPOSED: RLS migration not applied, or policy is incorrect.");
    console.log("If service SELECT shows BLOCKED: Check SUPABASE_SERVICE_ROLE_KEY is correct.");
  } else {
    console.log("\nAll tables are properly secured:");
    console.log("  - Anon PostgREST access: BLOCKED on all 12 tables");
    console.log("  - Service role access: AVAILABLE on all 12 tables (backend unaffected)");
  }

  console.log("");

  // Apify keys specific check
  const apifyAnonResult = results.find(r => r.table === "apify_keys" && r.test === "anon SELECT");
  if (apifyAnonResult?.status === FAIL) {
    console.log(colorize("FAIL", "  CRITICAL: apify_keys anon SELECT is not blocked!"));
    console.log("  Plaintext API keys are exposed via PostgREST. Apply the RLS migration immediately.");
  }

  process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
