import "dotenv/config";
import { test, expect, Page } from "@playwright/test";

/**
 * Admin analytics dashboard (/admin/metrics) — access control + rendering.
 *
 * Read-only suite: it never signs up, upgrades, cancels or edits anything.
 *
 * The API-level access-control matrix (401 / 403 / 200) is also covered without
 * a browser by `npx tsx scripts/verify-admin-dashboard.ts`, which is the one to
 * run when TEST_ADMIN_PASSWORD is not set.
 */

const BASE = "http://localhost:5000";

// Credentials must come from env — never hardcode (audit issue C1)
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;
const FOUNDER_EMAIL = process.env.TEST_FOUNDER_EMAIL;
const FOUNDER_PASSWORD = process.env.TEST_FOUNDER_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !FOUNDER_EMAIL || !FOUNDER_PASSWORD) {
  throw new Error(
    "Tests require TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, TEST_FOUNDER_EMAIL and " +
      "TEST_FOUNDER_PASSWORD env vars. Set them in .env before running tests."
  );
}

const ADMIN = { email: ADMIN_EMAIL, password: ADMIN_PASSWORD };
const FOUNDER = { email: FOUNDER_EMAIL, password: FOUNDER_PASSWORD };

const ADMIN_ENDPOINTS = ["stats", "activity", "traffic?days=7", "producthunt"];

// ─── helpers ────────────────────────────────────────────────────────────────

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /login|sign in/i }).click();
  await page.waitForURL(/dashboard|verify-email/, { timeout: 10_000 });
}

const isAdminAccount = ADMIN_EMAIL.toLowerCase() !== FOUNDER_EMAIL.toLowerCase();

// ─── tests ──────────────────────────────────────────────────────────────────

test.describe("1. Admin API access control", () => {
  test("all admin endpoints reject anonymous callers with 401", async ({ request }) => {
    for (const endpoint of ADMIN_ENDPOINTS) {
      const res = await request.get(`${BASE}/api/admin/${endpoint}`);
      expect(res.status(), `/api/admin/${endpoint}`).toBe(401);
    }
    console.log("✅ Anonymous callers get 401 on every admin endpoint");
  });

  test("admin endpoints answer 200 for an allow-listed admin", async ({ page }) => {
    await login(page, ADMIN);
    for (const endpoint of ADMIN_ENDPOINTS) {
      const res = await page.request.get(`${BASE}/api/admin/${endpoint}`);
      expect(res.status(), `/api/admin/${endpoint}`).toBe(200);
    }
    console.log("✅ Admin gets 200 on every admin endpoint");
  });

  test("stats payload has the expected shape", async ({ page }) => {
    await login(page, ADMIN);
    const res = await page.request.get(`${BASE}/api/admin/stats`);
    const body = await res.json();

    expect(typeof body.users.total).toBe("number");
    expect(typeof body.users.signups_today).toBe("number");
    expect(typeof body.fetches.today).toBe("number");
    expect(typeof body.revenue.mrr).toBe("number");
    expect(body.revenue.arr).toBe(body.revenue.mrr * 12);
    expect(typeof body.traffic.unique_visitors_today).toBe("number");
    expect(body.plans).toHaveProperty("free");
    expect(body.plans).toHaveProperty("plus");
    expect(body.plans).toHaveProperty("pro");
    console.log(`✅ Stats shape OK — ${body.users.total} users, MRR $${body.revenue.mrr}`);
  });
});

test.describe("2. Admin dashboard page", () => {
  test("renders KPI cards and every section for an admin", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto(`${BASE}/admin/metrics`);

    await expect(page.getByTestId("admin-metrics-header")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("kpi-total-users")).toBeVisible();
    await expect(page.getByTestId("kpi-mrr")).toBeVisible();
    await expect(page.getByTestId("admin-plan-distribution")).toBeVisible();
    await expect(page.getByTestId("admin-revenue")).toBeVisible();
    await expect(page.getByTestId("admin-producthunt")).toBeVisible();
    await expect(page.getByTestId("admin-traffic")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("admin-activity")).toBeVisible({ timeout: 15_000 });

    await page.screenshot({ path: "tests/screenshots/admin-metrics.png", fullPage: true });
    console.log("✅ Admin dashboard renders all sections");
  });

  test("non-admin is redirected away from /admin/metrics", async ({ page }) => {
    test.skip(!isAdminAccount, "TEST_FOUNDER_EMAIL is the admin account — no non-admin to test with");
    await login(page, FOUNDER);
    await page.goto(`${BASE}/admin/metrics`);
    await page.waitForURL(/dashboard/, { timeout: 10_000 });
    console.log("✅ Non-admin redirected to /dashboard");
  });

  test("logged-out visitor to /admin/metrics lands on login", async ({ page }) => {
    await page.goto(`${BASE}/admin/metrics`);
    await page.waitForURL(/login/, { timeout: 10_000 });
    console.log("✅ Logged-out visitor redirected to /login");
  });
});

test.describe("3. Existing features unaffected", () => {
  test("pricing page shows Free / Plus / Pro at their current USD prices", async ({ page }) => {
    await page.goto(`${BASE}/pricing`);
    const body = await page.locator("body").innerText();
    expect(body).toContain("Free");
    expect(body).toContain("Plus");
    expect(body).toContain("Pro");
    // Playwright's default timezone is not India, so this is the USD view.
    expect(body).toContain("$19");
    expect(body).toContain("$49");
    console.log("✅ Pricing shows Plus $19, Pro $49");
  });

  test("the existing /admin user-management page still loads", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto(`${BASE}/admin`);
    const body = await page.locator("body").innerText();
    expect(body.toLowerCase()).toMatch(/user|admin/);
    console.log("✅ Existing /admin page untouched and still loading");
  });

  test("dashboard and competitors pages still load for a normal user", async ({ page }) => {
    await login(page, FOUNDER);
    await page.goto(`${BASE}/dashboard`);
    await expect(page.locator("body")).toBeVisible();
    await page.goto(`${BASE}/competitors`);
    await expect(page.locator("body")).toBeVisible();
    console.log("✅ Core user pages unaffected");
  });
});

test.describe("4. Page view tracking", () => {
  test("a page load with UTM params surfaces in the traffic endpoint", async ({ page }) => {
    // Hit a public page carrying a UTM tag, then confirm the admin traffic
    // endpoint reports at least one UTM-tagged visit.
    await page.goto(`${BASE}/?utm_source=playwright&utm_medium=test&utm_campaign=tracking_check`);
    await page.waitForTimeout(1_500); // insert is fire-and-forget

    await login(page, ADMIN);
    const res = await page.request.get(`${BASE}/api/admin/traffic?days=1`);
    const body = await res.json();

    const sources = body.utm_sources.map((row: { source: string }) => row.source);
    expect(sources).toContain("playwright");
    console.log(`✅ Tracking works — utm sources seen: ${sources.join(", ")}`);
  });

  test("API calls are not tracked as page views", async ({ page }) => {
    await login(page, ADMIN);
    const res = await page.request.get(`${BASE}/api/admin/traffic?days=1`);
    const body = await res.json();
    const paths = body.top_pages.map((row: { path: string }) => row.path);
    expect(paths.some((p: string) => p.startsWith("/api/"))).toBe(false);
    console.log("✅ /api/* excluded from page view tracking");
  });
});
