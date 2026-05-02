/**
 * ReachInsta — Full API Test Suite
 * Run with:  node tests/api-test.mjs
 */

const BASE = "http://127.0.0.1:5000";

const FOUNDER = { email: "founder@techcm.in",  password: "mnikg2190" };
const ADMIN   = { email: "krishna@techcm.in",   password: "mnikg2190" };

// ─── helpers ────────────────────────────────────────────────────────────────

let founderCookie = "";
let adminCookie   = "";

const results = [];

async function req(method, path, body, cookie) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    credentials: "include",
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  let data;
  const ct = res.headers.get("content-type") || "";
  try {
    data = ct.includes("json") ? await res.json() : await res.text();
  } catch {
    data = null;
  }
  return { status: res.status, data, headers: res.headers };
}

function extractCookie(headers) {
  const raw = headers.get("set-cookie") || "";
  const match = raw.match(/connect\.sid=[^;]+/);
  return match ? match[0] : "";
}

function pass(name, status, data) {
  const summary = typeof data === "object" ? JSON.stringify(data).slice(0, 120) : String(data).slice(0, 120);
  console.log(`  ✅ ${name}  [${status}]  ${summary}`);
  results.push({ ok: true, name, status });
}

function fail(name, status, data, reason) {
  const summary = typeof data === "object" ? JSON.stringify(data).slice(0, 120) : String(data).slice(0, 120);
  console.log(`  ❌ ${name}  [${status}]  ${reason || ""}  → ${summary}`);
  results.push({ ok: false, name, status, reason: reason || "" });
}

function section(title) {
  console.log(`\n${"─".repeat(60)}\n  ${title}\n${"─".repeat(60)}`);
}

// ─── test runner ─────────────────────────────────────────────────────────────

async function run() {

  // ══════════════════════════════════════════════════════════════
  section("1. AUTH ENDPOINTS");
  // ══════════════════════════════════════════════════════════════

  // GET /api/auth/user — unauthenticated
  {
    const r = await req("GET", "/api/auth/user");
    r.status === 401
      ? pass("GET /api/auth/user (unauthenticated)", r.status, r.data)
      : fail("GET /api/auth/user (unauthenticated)", r.status, r.data, "Expected 401");
  }

  // POST /api/auth/login — wrong password
  {
    const r = await req("POST", "/api/auth/login", { email: FOUNDER.email, password: "wrongpassword" });
    r.status === 401 || r.status === 400
      ? pass("POST /api/auth/login (wrong password)", r.status, r.data)
      : fail("POST /api/auth/login (wrong password)", r.status, r.data, "Expected 4xx");
  }

  // POST /api/auth/register — duplicate email
  {
    const r = await req("POST", "/api/auth/register", {
      email: FOUNDER.email,
      password: "testpassword123",
    });
    r.status === 409 || r.status === 400
      ? pass("POST /api/auth/register (duplicate email)", r.status, r.data)
      : fail("POST /api/auth/register (duplicate email)", r.status, r.data, "Expected 409/400");
  }

  // POST /api/auth/login — founder
  {
    const r = await req("POST", "/api/auth/login", FOUNDER);
    if (r.status === 200 && r.data?.id) {
      founderCookie = extractCookie(r.headers);
      pass("POST /api/auth/login (founder)", r.status, { id: r.data.id, email: r.data.email });
    } else {
      fail("POST /api/auth/login (founder)", r.status, r.data, "Expected 200 with user object");
    }
  }

  // POST /api/auth/login — admin
  {
    const r = await req("POST", "/api/auth/login", ADMIN);
    if (r.status === 200 && r.data?.id) {
      adminCookie = extractCookie(r.headers);
      pass("POST /api/auth/login (admin)", r.status, { id: r.data.id, email: r.data.email });
    } else {
      fail("POST /api/auth/login (admin)", r.status, r.data, "Expected 200 with user object");
    }
  }

  // GET /api/auth/user — authenticated
  {
    const r = await req("GET", "/api/auth/user", null, founderCookie);
    r.status === 200 && r.data?.id
      ? pass("GET /api/auth/user (authenticated)", r.status, { id: r.data.id, email: r.data.email })
      : fail("GET /api/auth/user (authenticated)", r.status, r.data, "Expected 200 with user object");
  }

  // POST /api/auth/forgot-password — valid email
  {
    const r = await req("POST", "/api/auth/forgot-password", { email: FOUNDER.email });
    r.status === 200
      ? pass("POST /api/auth/forgot-password (valid email)", r.status, r.data)
      : fail("POST /api/auth/forgot-password (valid email)", r.status, r.data, "Expected 200");
  }

  // POST /api/auth/forgot-password — unknown email (should still return 200 to prevent enumeration)
  {
    const r = await req("POST", "/api/auth/forgot-password", { email: "nobody@example.com" });
    r.status === 200
      ? pass("POST /api/auth/forgot-password (unknown email)", r.status, r.data)
      : fail("POST /api/auth/forgot-password (unknown email)", r.status, r.data, "Expected 200 (anti-enum)");
  }

  // POST /api/auth/verify-email — invalid code
  {
    const r = await req("POST", "/api/auth/verify-email", { code: "000000" }, founderCookie);
    r.status === 400 || r.status === 401
      ? pass("POST /api/auth/verify-email (invalid code)", r.status, r.data)
      : fail("POST /api/auth/verify-email (invalid code)", r.status, r.data, "Expected 4xx");
  }

  // POST /api/auth/resend-verification
  {
    const r = await req("POST", "/api/auth/resend-verification", {}, founderCookie);
    r.status === 200 || r.status === 429 || r.status === 400
      ? pass("POST /api/auth/resend-verification", r.status, r.data)
      : fail("POST /api/auth/resend-verification", r.status, r.data, "Expected 200/429/400");
  }

  // POST /api/auth/reset-password — invalid code
  {
    const r = await req("POST", "/api/auth/reset-password", {
      email: FOUNDER.email,
      code: "000000",
      password: "newpassword123",
    });
    r.status === 400 || r.status === 401
      ? pass("POST /api/auth/reset-password (invalid code)", r.status, r.data)
      : fail("POST /api/auth/reset-password (invalid code)", r.status, r.data, "Expected 4xx");
  }

  // ══════════════════════════════════════════════════════════════
  section("2. PROFILE ENDPOINT");
  // ══════════════════════════════════════════════════════════════

  // GET /api/profile — unauthenticated
  {
    const r = await req("GET", "/api/profile");
    r.status === 401
      ? pass("GET /api/profile (unauthenticated)", r.status, r.data)
      : fail("GET /api/profile (unauthenticated)", r.status, r.data, "Expected 401");
  }

  // GET /api/profile — founder
  let founderProfile;
  {
    const r = await req("GET", "/api/profile", null, founderCookie);
    if (r.status === 200 && r.data?.id) {
      founderProfile = r.data;
      pass("GET /api/profile (founder)", r.status, {
        id: r.data.id, plan: r.data.plan, role: r.data.role,
        fetchesUsed: r.data.fetchesUsed, maxCompetitors: r.data.maxCompetitors
      });
    } else {
      fail("GET /api/profile (founder)", r.status, r.data, "Expected 200 with profile object");
    }
  }

  // GET /api/profile — admin
  let adminProfile;
  {
    const r = await req("GET", "/api/profile", null, adminCookie);
    if (r.status === 200 && r.data?.id) {
      adminProfile = r.data;
      pass("GET /api/profile (admin)", r.status, {
        id: r.data.id, plan: r.data.plan, role: r.data.role
      });
    } else {
      fail("GET /api/profile (admin)", r.status, r.data, "Expected 200 with profile object");
    }
  }

  // ══════════════════════════════════════════════════════════════
  section("3. COMPETITOR ENDPOINTS");
  // ══════════════════════════════════════════════════════════════

  // GET /api/competitors — unauthenticated
  {
    const r = await req("GET", "/api/competitors");
    r.status === 401
      ? pass("GET /api/competitors (unauthenticated)", r.status, r.data)
      : fail("GET /api/competitors (unauthenticated)", r.status, r.data, "Expected 401");
  }

  // GET /api/competitors — founder
  {
    const r = await req("GET", "/api/competitors", null, founderCookie);
    r.status === 200 && Array.isArray(r.data)
      ? pass("GET /api/competitors (founder)", r.status, `Array(${r.data.length})`)
      : fail("GET /api/competitors (founder)", r.status, r.data, "Expected 200 array");
  }

  // POST /api/competitors — add valid competitor
  let addedCompetitorId;
  {
    const r = await req("POST", "/api/competitors", { username: "testuser_reachinsta_api" }, founderCookie);
    if (r.status === 200 && r.data?.id) {
      addedCompetitorId = r.data.id;
      pass("POST /api/competitors (add valid)", r.status, { id: r.data.id, username: r.data.username });
    } else if (r.status === 409) {
      pass("POST /api/competitors (already exists)", r.status, r.data);
      // Try to get it from list
      const list = await req("GET", "/api/competitors", null, founderCookie);
      const found = list.data?.find(c => c.username === "testuser_reachinsta_api");
      if (found) addedCompetitorId = found.id;
    } else {
      fail("POST /api/competitors (add valid)", r.status, r.data, "Expected 200 or 409");
    }
  }

  // POST /api/competitors — invalid username (too long / bad chars)
  {
    const r = await req("POST", "/api/competitors", { username: "invalid username with spaces!" }, founderCookie);
    r.status === 400
      ? pass("POST /api/competitors (invalid username)", r.status, r.data)
      : fail("POST /api/competitors (invalid username)", r.status, r.data, "Expected 400");
  }

  // POST /api/competitors — missing body
  {
    const r = await req("POST", "/api/competitors", {}, founderCookie);
    r.status === 400
      ? pass("POST /api/competitors (missing username)", r.status, r.data)
      : fail("POST /api/competitors (missing username)", r.status, r.data, "Expected 400");
  }

  // POST /api/competitors/bulk — valid
  {
    const r = await req("POST", "/api/competitors/bulk",
      { usernames: ["bulktest1_reachinsta", "bulktest2_reachinsta"] },
      founderCookie
    );
    r.status === 200 && r.data?.added !== undefined
      ? pass("POST /api/competitors/bulk (valid)", r.status, r.data)
      : fail("POST /api/competitors/bulk (valid)", r.status, r.data, "Expected 200 with added count");
  }

  // POST /api/competitors/bulk — empty array
  {
    const r = await req("POST", "/api/competitors/bulk", { usernames: [] }, founderCookie);
    r.status === 400
      ? pass("POST /api/competitors/bulk (empty array)", r.status, r.data)
      : fail("POST /api/competitors/bulk (empty array)", r.status, r.data, "Expected 400");
  }

  // DELETE /api/competitors/:id — valid
  if (addedCompetitorId) {
    const r = await req("DELETE", `/api/competitors/${addedCompetitorId}`, null, founderCookie);
    r.status === 200 && r.data?.success
      ? pass(`DELETE /api/competitors/:id (valid)`, r.status, r.data)
      : fail(`DELETE /api/competitors/:id (valid)`, r.status, r.data, "Expected 200 success");
  } else {
    fail("DELETE /api/competitors/:id", 0, null, "No competitor ID available to delete");
  }

  // DELETE /api/competitors/:id — wrong user / not found
  {
    const r = await req("DELETE", "/api/competitors/00000000-0000-0000-0000-000000000000", null, founderCookie);
    r.status === 404
      ? pass("DELETE /api/competitors/:id (not found)", r.status, r.data)
      : fail("DELETE /api/competitors/:id (not found)", r.status, r.data, "Expected 404");
  }

  // DELETE /api/competitors (clear all)
  {
    const r = await req("DELETE", "/api/competitors", null, founderCookie);
    r.status === 200 && r.data?.success
      ? pass("DELETE /api/competitors (clear all)", r.status, r.data)
      : fail("DELETE /api/competitors (clear all)", r.status, r.data, "Expected 200 success");
  }

  // ══════════════════════════════════════════════════════════════
  section("4. FETCH / ANALYTICS RUN ENDPOINTS");
  // ══════════════════════════════════════════════════════════════

  // GET /api/fetch/history — unauthenticated
  {
    const r = await req("GET", "/api/fetch/history");
    r.status === 401
      ? pass("GET /api/fetch/history (unauthenticated)", r.status, r.data)
      : fail("GET /api/fetch/history (unauthenticated)", r.status, r.data, "Expected 401");
  }

  // GET /api/fetch/history — authenticated
  {
    const r = await req("GET", "/api/fetch/history", null, founderCookie);
    r.status === 200 && Array.isArray(r.data)
      ? pass("GET /api/fetch/history (founder)", r.status, `Array(${r.data.length})`)
      : fail("GET /api/fetch/history (founder)", r.status, r.data, "Expected 200 array");
  }

  // GET /api/fetch/latest — authenticated
  {
    const r = await req("GET", "/api/fetch/latest", null, founderCookie);
    r.status === 200
      ? pass("GET /api/fetch/latest (founder)", r.status, r.data === null ? "null (no runs yet)" : `fetchRun.id=${r.data?.fetchRun?.id?.slice(0,8)}`)
      : fail("GET /api/fetch/latest (founder)", r.status, r.data, "Expected 200");
  }

  // GET /api/fetch/:id — invalid UUID
  {
    const r = await req("GET", "/api/fetch/00000000-0000-0000-0000-000000000000", null, founderCookie);
    r.status === 404
      ? pass("GET /api/fetch/:id (not found)", r.status, r.data)
      : fail("GET /api/fetch/:id (not found)", r.status, r.data, "Expected 404");
  }

  // POST /api/fetch — no competitors (should fail with 400)
  {
    const r = await req("POST", "/api/fetch", { timeRangeDays: 7 }, founderCookie);
    r.status === 400
      ? pass("POST /api/fetch (no competitors)", r.status, r.data)
      : fail("POST /api/fetch (no competitors)", r.status, r.data, "Expected 400 — no competitors");
  }

  // POST /api/fetch — invalid timeRange
  {
    const r = await req("POST", "/api/fetch", { timeRangeDays: 999 }, founderCookie);
    r.status === 400
      ? pass("POST /api/fetch (invalid timeRange)", r.status, r.data)
      : fail("POST /api/fetch (invalid timeRange)", r.status, r.data, "Expected 400");
  }

  // POST /api/fetch — with competitor, check plan limit enforcement
  {
    // Add a competitor first
    await req("POST", "/api/competitors", { username: "fetchtest_reachinsta" }, founderCookie);
    const r = await req("POST", "/api/fetch", { timeRangeDays: 7 }, founderCookie);
    if (r.status === 200 && r.data?.id) {
      pass("POST /api/fetch (valid, queued)", r.status, { id: r.data.id, status: r.data.status });
      // Cancel it so we don't waste a real Apify run
      const cancel = await req("POST", `/api/fetch/${r.data.id}/cancel`, null, founderCookie);
      cancel.status === 200
        ? pass("POST /api/fetch/:id/cancel", cancel.status, { status: cancel.data?.status })
        : fail("POST /api/fetch/:id/cancel", cancel.status, cancel.data, "Expected 200");
    } else if (r.status === 403) {
      pass("POST /api/fetch (monthly limit enforced)", r.status, r.data);
    } else {
      fail("POST /api/fetch (valid)", r.status, r.data, "Expected 200 or 403");
    }
    // Clean up competitor
    await req("DELETE", "/api/competitors", null, founderCookie);
  }

  // POST /api/fetch/:id/cancel — already completed / invalid
  {
    const r = await req("POST", "/api/fetch/00000000-0000-0000-0000-000000000000/cancel", null, founderCookie);
    r.status === 404
      ? pass("POST /api/fetch/:id/cancel (not found)", r.status, r.data)
      : fail("POST /api/fetch/:id/cancel (not found)", r.status, r.data, "Expected 404");
  }

  // ══════════════════════════════════════════════════════════════
  section("5. EXPORT ENDPOINTS");
  // ══════════════════════════════════════════════════════════════

  // GET /api/export/reels.csv — unauthenticated
  {
    const r = await req("GET", "/api/export/reels.csv?runId=test");
    r.status === 401
      ? pass("GET /api/export/reels.csv (unauthenticated)", r.status, r.data)
      : fail("GET /api/export/reels.csv (unauthenticated)", r.status, r.data, "Expected 401");
  }

  // GET /api/export/reels.csv — free/plus user should get 403
  {
    const r = await req("GET", "/api/export/reels.csv?runId=00000000-0000-0000-0000-000000000000", null, founderCookie);
    if (r.status === 403) {
      pass("GET /api/export/reels.csv (non-Pro user blocked)", r.status, r.data);
    } else if (r.status === 404) {
      // If founder has csvExport=true or is admin, they get 404 (run not found) rather than 403
      pass("GET /api/export/reels.csv (has access, run not found)", r.status, r.data);
    } else {
      fail("GET /api/export/reels.csv (non-Pro)", r.status, r.data, "Expected 403 or 404");
    }
  }

  // GET /api/export/reels.csv — admin gets 404 (not 403)
  {
    const r = await req("GET", "/api/export/reels.csv?runId=00000000-0000-0000-0000-000000000000", null, adminCookie);
    r.status === 404 || r.status === 200
      ? pass("GET /api/export/reels.csv (admin — past CSV gate)", r.status, r.data)
      : fail("GET /api/export/reels.csv (admin)", r.status, r.data, "Expected 404 or 200");
  }

  // GET /api/export/competitors.csv — admin
  {
    const r = await req("GET", "/api/export/competitors.csv?runId=00000000-0000-0000-0000-000000000000", null, adminCookie);
    r.status === 404 || r.status === 200
      ? pass("GET /api/export/competitors.csv (admin)", r.status, r.data)
      : fail("GET /api/export/competitors.csv (admin)", r.status, r.data, "Expected 404 or 200");
  }

  // ══════════════════════════════════════════════════════════════
  section("6. ADMIN ENDPOINTS");
  // ══════════════════════════════════════════════════════════════

  // GET /api/admin/users — unauthenticated
  {
    const r = await req("GET", "/api/admin/users");
    r.status === 401
      ? pass("GET /api/admin/users (unauthenticated)", r.status, r.data)
      : fail("GET /api/admin/users (unauthenticated)", r.status, r.data, "Expected 401");
  }

  // GET /api/admin/users — non-admin (founder)
  {
    const r = await req("GET", "/api/admin/users", null, founderCookie);
    r.status === 403
      ? pass("GET /api/admin/users (non-admin blocked)", r.status, r.data)
      : fail("GET /api/admin/users (non-admin)", r.status, r.data, "Expected 403");
  }

  // GET /api/admin/users — admin
  let adminUsers = [];
  {
    const r = await req("GET", "/api/admin/users", null, adminCookie);
    if (r.status === 200 && Array.isArray(r.data)) {
      adminUsers = r.data;
      pass("GET /api/admin/users (admin)", r.status,
        `Array(${r.data.length}) — plans: ${JSON.stringify(r.data.map(u => u.plan))}`
      );
    } else {
      fail("GET /api/admin/users (admin)", r.status, r.data, "Expected 200 array");
    }
  }

  // POST /api/admin/users/:id/plan — non-admin
  if (founderProfile?.id) {
    const r = await req("POST", `/api/admin/users/${founderProfile.id}/plan`, { plan: "pro" }, founderCookie);
    r.status === 403
      ? pass("POST /api/admin/users/:id/plan (non-admin blocked)", r.status, r.data)
      : fail("POST /api/admin/users/:id/plan (non-admin)", r.status, r.data, "Expected 403");
  }

  // POST /api/admin/users/:id/plan — admin changes founder plan
  if (founderProfile?.id) {
    const r = await req("POST", `/api/admin/users/${founderProfile.id}/plan`, { plan: "pro" }, adminCookie);
    if (r.status === 200 && r.data?.plan === "pro") {
      pass("POST /api/admin/users/:id/plan (admin sets pro)", r.status, { plan: r.data.plan });
      // Restore to plus
      await req("POST", `/api/admin/users/${founderProfile.id}/plan`, { plan: "plus" }, adminCookie);
    } else {
      fail("POST /api/admin/users/:id/plan (admin)", r.status, r.data, "Expected 200 with updated plan");
    }
  }

  // POST /api/admin/users/:id/plan — invalid plan
  if (founderProfile?.id) {
    const r = await req("POST", `/api/admin/users/${founderProfile.id}/plan`, { plan: "enterprise" }, adminCookie);
    r.status === 400
      ? pass("POST /api/admin/users/:id/plan (invalid plan)", r.status, r.data)
      : fail("POST /api/admin/users/:id/plan (invalid plan)", r.status, r.data, "Expected 400");
  }

  // POST /api/admin/users/:id/limits — admin
  if (founderProfile?.id) {
    const r = await req("POST", `/api/admin/users/${founderProfile.id}/limits`,
      { maxCompetitors: 10, monthlyFetchLimit: 3 },
      adminCookie
    );
    if (r.status === 200 && r.data?.maxCompetitors === 10) {
      pass("POST /api/admin/users/:id/limits (admin)", r.status, {
        maxCompetitors: r.data.maxCompetitors, monthlyFetchLimit: r.data.monthlyFetchLimit
      });
      // Restore
      await req("POST", `/api/admin/users/${founderProfile.id}/limits`,
        { maxCompetitors: 50, monthlyFetchLimit: 2 }, adminCookie
      );
    } else {
      fail("POST /api/admin/users/:id/limits (admin)", r.status, r.data, "Expected 200 with updated limits");
    }
  }

  // POST /api/admin/users/:id/role — non-super-admin assigning admin role (should be blocked)
  // Admin can change roles but only super-admin can assign "admin" role
  if (founderProfile?.id && adminProfile?.id) {
    const r = await req("POST", `/api/admin/users/${founderProfile.id}/role`, { role: "admin" }, adminCookie);
    // krishna@techcm.in IS the super-admin, so this should succeed
    if (r.status === 200) {
      pass("POST /api/admin/users/:id/role (super-admin assigns admin)", r.status, { role: r.data?.role });
      // Restore to user
      await req("POST", `/api/admin/users/${founderProfile.id}/role`, { role: "user" }, adminCookie);
    } else {
      fail("POST /api/admin/users/:id/role", r.status, r.data, "Expected 200 for super-admin");
    }
  }

  // POST /api/admin/users/:id/role — invalid role
  if (founderProfile?.id) {
    const r = await req("POST", `/api/admin/users/${founderProfile.id}/role`, { role: "superuser" }, adminCookie);
    r.status === 400
      ? pass("POST /api/admin/users/:id/role (invalid role)", r.status, r.data)
      : fail("POST /api/admin/users/:id/role (invalid role)", r.status, r.data, "Expected 400");
  }

  // POST /api/admin/users/:id/plan — non-existent user
  {
    const r = await req("POST", "/api/admin/users/00000000-0000-0000-0000-000000000000/plan",
      { plan: "pro" }, adminCookie
    );
    r.status === 404
      ? pass("POST /api/admin/users/:id/plan (non-existent user)", r.status, r.data)
      : fail("POST /api/admin/users/:id/plan (non-existent user)", r.status, r.data, "Expected 404");
  }

  // ══════════════════════════════════════════════════════════════
  section("7. LOGOUT");
  // ══════════════════════════════════════════════════════════════

  // POST /api/auth/logout — founder
  {
    const r = await req("POST", "/api/auth/logout", null, founderCookie);
    r.status === 200
      ? pass("POST /api/auth/logout (founder)", r.status, r.data)
      : fail("POST /api/auth/logout (founder)", r.status, r.data, "Expected 200");
  }

  // GET /api/auth/user after logout — should be 401
  {
    const r = await req("GET", "/api/auth/user", null, founderCookie);
    r.status === 401
      ? pass("GET /api/auth/user (after logout)", r.status, r.data)
      : fail("GET /api/auth/user (after logout)", r.status, r.data, "Expected 401 after logout");
  }

  // POST /api/auth/logout — admin
  {
    const r = await req("POST", "/api/auth/logout", null, adminCookie);
    r.status === 200
      ? pass("POST /api/auth/logout (admin)", r.status, r.data)
      : fail("POST /api/auth/logout (admin)", r.status, r.data, "Expected 200");
  }

  // ══════════════════════════════════════════════════════════════
  section("8. EDGE CASES & SECURITY");
  // ══════════════════════════════════════════════════════════════

  // All protected endpoints should return 401 after logout
  for (const [method, path] of [
    ["GET",  "/api/profile"],
    ["GET",  "/api/competitors"],
    ["GET",  "/api/fetch/history"],
    ["GET",  "/api/fetch/latest"],
    ["GET",  "/api/admin/users"],
  ]) {
    const r = await req(method, path);
    r.status === 401
      ? pass(`${method} ${path} (no cookie → 401)`, r.status, "")
      : fail(`${method} ${path} (no cookie)`, r.status, r.data, "Expected 401");
  }

  // ══════════════════════════════════════════════════════════════
  section("SUMMARY");
  // ══════════════════════════════════════════════════════════════

  const passed = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);

  console.log(`\n  Total:  ${results.length}`);
  console.log(`  ✅ Passed: ${passed.length}`);
  console.log(`  ❌ Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log("\n  Failed tests:");
    for (const f of failed) {
      console.log(`    ❌ [${f.status}] ${f.name}  ${f.reason}`);
    }
  }
}

run().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
