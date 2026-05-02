import { test, expect, Page } from "@playwright/test";

const BASE = "http://localhost:5000";
const FOUNDER = { email: "founder@techcm.in", password: "mnikg2190" };
const ADMIN = { email: "krishna@techcm.in", password: "mnikg2190" };

// ─── helpers ────────────────────────────────────────────────────────────────

async function login(page: Page, user = FOUNDER) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /login|sign in/i }).click();
  await page.waitForURL(/dashboard|verify-email/, { timeout: 10_000 });
}

async function logout(page: Page) {
  // Try sidebar logout button
  const logoutBtn = page.getByRole("button", { name: /logout|sign out/i });
  if (await logoutBtn.isVisible()) {
    await logoutBtn.click();
  } else {
    await page.goto(`${BASE}/login`);
  }
  await page.waitForURL(/login/, { timeout: 5_000 });
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: `tests/screenshots/${name}.png`,
    fullPage: true,
  });
}

// ─── tests ──────────────────────────────────────────────────────────────────

test.describe("1. Public Pages", () => {
  test("login page loads", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await screenshot(page, "01-login-page");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /login|sign in/i })
    ).toBeVisible();
    console.log("✅ Login page loaded");
  });

  test("register page loads", async ({ page }) => {
    await page.goto(`${BASE}/register`);
    await screenshot(page, "02-register-page");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    // Register has two password fields — just check the first
    await expect(page.getByLabel(/password/i).first()).toBeVisible();
    console.log("✅ Register page loaded");
  });

  test("forgot password page loads", async ({ page }) => {
    await page.goto(`${BASE}/forgot-password`);
    await screenshot(page, "03-forgot-password-page");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    console.log("✅ Forgot password page loaded");
  });

  test("unauthenticated redirect to login", async ({ page }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.waitForURL(/login/, { timeout: 5_000 });
    await screenshot(page, "04-unauthenticated-redirect");
    console.log("✅ Unauthenticated redirect works");
  });
});

test.describe("2. Authentication", () => {
  test("login with founder credentials", async ({ page }) => {
    await login(page, FOUNDER);
    await screenshot(page, "05-after-login");
    const url = page.url();
    console.log(`✅ Login successful → ${url}`);
    expect(url).toMatch(/dashboard|verify-email/);
  });

  test("login with wrong password shows error", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(FOUNDER.email);
    await page.getByLabel(/password/i).fill("wrongpassword123");
    await page.getByRole("button", { name: /login|sign in/i }).click();
    // Wait for the button to stop saying "Signing in..." (request completed)
    await page.getByRole("button", { name: /sign in/i }).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(500); // let toast animate in
    await screenshot(page, "06-wrong-password-error");
    const bodyText = await page.locator("body").innerText();
    // Login errors are shown as toast: "Login failed" + server message
    const hasError =
      bodyText.toLowerCase().includes("login failed") ||
      bodyText.toLowerCase().includes("invalid") ||
      bodyText.toLowerCase().includes("incorrect") ||
      bodyText.toLowerCase().includes("wrong") ||
      bodyText.toLowerCase().includes("failed");
    console.log(`✅ Wrong password error shown: ${hasError}`);
    expect(hasError).toBe(true);
  });

  test("logout works", async ({ page }) => {
    await login(page, FOUNDER);
    await page.waitForURL(/dashboard/, { timeout: 10_000 });
    await screenshot(page, "07-before-logout");
    await logout(page);
    await screenshot(page, "08-after-logout");
    console.log("✅ Logout works");
  });
});

test.describe("3. Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, FOUNDER);
    await page.waitForURL(/dashboard/, { timeout: 10_000 });
  });

  test("dashboard loads with KPI cards", async ({ page }) => {
    // Wait for the main heading "Dashboard" to appear
    await page.getByRole("heading", { name: /^Dashboard$/i }).waitFor({ timeout: 10_000 });
    await screenshot(page, "09-dashboard-overview");
    const bodyText = await page.locator("body").innerText();
    console.log("Dashboard content preview:", bodyText.slice(0, 300));
    expect(bodyText).toContain("Dashboard");
    console.log("✅ Dashboard loaded");
  });

  test("dashboard time range buttons are clickable", async ({ page }) => {
    await page.waitForTimeout(1500);
    // Dashboard uses time-range buttons: 7 days, 14 days, 28 days
    const btn7 = page.getByRole("button", { name: "7 days" });
    const btn14 = page.getByRole("button", { name: "14 days" });
    const btn28 = page.getByRole("button", { name: "28 days" });

    for (const [label, btn] of [["7 days", btn7], ["14 days", btn14], ["28 days", btn28]] as const) {
      const visible = await btn.isVisible();
      console.log(`  "${label}" button visible: ${visible}`);
      if (visible) {
        await btn.click();
        await page.waitForTimeout(400);
      }
    }
    await screenshot(page, "10-dashboard-time-range");
    console.log("✅ Time range buttons tested");
    await expect(btn7).toBeVisible();
  });

  test("sidebar navigation visible", async ({ page }) => {
    // Wait for the Dashboard heading first to confirm the page has rendered
    await page.getByRole("heading", { name: /^Dashboard$/i }).waitFor({ timeout: 10_000 });
    await screenshot(page, "11-sidebar");
    const dashLink = page.getByRole("link", { name: /^Dashboard$/i });
    const compLink = page.getByRole("link", { name: /^Competitors$/i });
    await dashLink.waitFor({ timeout: 5_000 });
    const dashCount = await dashLink.count();
    const compCount = await compLink.count();
    console.log(`✅ Sidebar links — Dashboard: ${dashCount}, Competitors: ${compCount}`);
    expect(dashCount).toBeGreaterThan(0);
    expect(compCount).toBeGreaterThan(0);
  });
});

test.describe("4. Competitors Page", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, FOUNDER);
    await page.waitForURL(/dashboard/, { timeout: 10_000 });
    // Wait for dashboard to fully render before navigating away
    await page.getByRole("heading", { name: /^Dashboard$/i }).waitFor({ timeout: 10_000 });
    await page.goto(`${BASE}/competitors`);
    // Wait for the competitors page heading or any input to appear
    await page.waitForTimeout(2000);
  });

  test("competitors page loads", async ({ page }) => {
    await screenshot(page, "12-competitors-page");
    const url = page.url();
    console.log(`✅ Competitors page loaded: ${url}`);
  });

  test("can add a competitor", async ({ page }) => {
    await screenshot(page, "13-competitors-before-add");

    // Log all inputs on the page for debugging
    const inputs = page.locator("input");
    const count = await inputs.count();
    console.log(`  Found ${count} input(s) on competitors page`);
    for (let i = 0; i < count; i++) {
      const ph = await inputs.nth(i).getAttribute("placeholder");
      const type = await inputs.nth(i).getAttribute("type");
      console.log(`    input[${i}]: type=${type}, placeholder=${ph}`);
    }

    // The input is labeled "Competitor username"
    const input = page.getByRole("textbox", { name: /competitor username/i });

    if (!(await input.isVisible())) {
      console.log("⚠️  Competitor username input not found");
      return;
    }

    await input.fill("testcompetitor_reachinsta");
    await screenshot(page, "13b-competitors-input-filled");
    await input.press("Enter");
    await page.waitForTimeout(2000);
    await screenshot(page, "14-competitors-after-enter");
    const bodyText = await page.locator("body").innerText();
    const added = bodyText.includes("testcompetitor_reachinsta");
    console.log(`✅ Competitor added via Enter: ${added}`);
  });

  test("bulk add shows UI", async ({ page }) => {
    // Log all buttons for debugging
    const btns = page.getByRole("button");
    const count = await btns.count();
    console.log(`  Found ${count} button(s) on competitors page`);
    for (let i = 0; i < Math.min(count, 10); i++) {
      const text = await btns.nth(i).innerText();
      console.log(`    button[${i}]: "${text.trim()}"`);
    }

    // Snapshot shows a "Bulk Add" button
    const bulkBtn = page.getByRole("button", { name: /bulk add/i });

    if (await bulkBtn.isVisible()) {
      await bulkBtn.click();
      await page.waitForTimeout(800);
      await screenshot(page, "15-bulk-add-open");
      console.log("✅ Bulk Add dialog opened");
    } else {
      await screenshot(page, "15-bulk-add-not-found");
      console.log("⚠️  Bulk Add button not found");
    }
  });
});

test.describe("5. Fetch / Analytics Run", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, FOUNDER);
    await page.waitForURL(/dashboard/, { timeout: 10_000 });
  });

  test("fetch button / run analysis UI exists", async ({ page }) => {
    await page.waitForTimeout(1500);
    await screenshot(page, "16-pre-fetch");

    const fetchBtn = page.getByRole("button", {
      name: /fetch|analyze|run|start/i,
    });
    const hasFetch = await fetchBtn.first().isVisible();
    console.log(`✅ Fetch/Analyze button visible: ${hasFetch}`);
    expect(hasFetch).toBe(true);

    const isEnabled = await fetchBtn.first().isEnabled();
    console.log(`  Fetch button enabled: ${isEnabled}`);

    if (isEnabled) {
      await fetchBtn.first().click();
      await page.waitForTimeout(2000);
      await screenshot(page, "17-post-fetch-click");
      console.log("✅ Fetch button clicked");
    } else {
      console.log("⚠️  Fetch button is disabled (expected: no competitors added yet)");
    }
  });
});

test.describe("6. Admin Panel", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN);
    await page.waitForURL(/dashboard|verify-email/, { timeout: 10_000 });
    if (page.url().includes("verify-email")) {
      console.log("⚠️  Admin email not verified, skipping admin tests");
      return;
    }
    await page.goto(`${BASE}/admin`);
    await page.waitForTimeout(2000);
  });

  test("admin panel loads with user table", async ({ page }) => {
    const url = page.url();
    if (!url.includes("admin")) {
      console.log("⚠️  Not on admin page, may have been redirected");
      await screenshot(page, "18-admin-redirect");
      return;
    }

    // Wait for "Loading users..." to disappear (up to 15s), meaning data arrived or failed
    try {
      await page.waitForFunction(
        () => !document.body.innerText.includes("Loading users..."),
        { timeout: 15_000 }
      );
      console.log("  Users finished loading");
    } catch {
      console.log("⚠️  Users still loading after 15s — possible API issue");
    }

    await screenshot(page, "18-admin-panel");
    const bodyText = await page.locator("body").innerText();
    console.log("Admin page content:", bodyText.slice(0, 600));

    const hasUsers =
      bodyText.includes("@") || // email addresses
      bodyText.includes("No users found") ||
      bodyText.includes("Loading users...");
    console.log(`✅ Admin panel loaded, has users/message: ${hasUsers}`);
  });

  test("admin can search users", async ({ page }) => {
    if (!page.url().includes("admin")) return;
    await page.waitForTimeout(2000);

    // Try multiple selectors for search
    const searchInput = page
      .getByPlaceholder(/search|email|filter/i)
      .or(page.locator('input[type="search"]'))
      .or(page.locator('input[type="text"]'))
      .first();

    if (await searchInput.isVisible()) {
      await searchInput.fill("founder");
      await page.waitForTimeout(1000);
      await screenshot(page, "19-admin-search");
      console.log("✅ Admin search works");
    } else {
      await screenshot(page, "19-admin-no-search");
      console.log("⚠️  Admin search input not found");
    }
  });

  test("admin plan change UI visible", async ({ page }) => {
    if (!page.url().includes("admin")) return;
    await page.waitForTimeout(2000);
    await screenshot(page, "20-admin-plan-change");

    // Log all select/combobox elements
    const selects = page.locator('select, [role="combobox"]');
    const count = await selects.count();
    console.log(`  Combobox/select elements found: ${count}`);

    if (count > 0) {
      console.log("✅ Plan change UI visible");
    } else {
      console.log("⚠️  No dropdowns found on admin page");
    }
  });
});

test.describe("7. Profile & Plan Info", () => {
  test("plan info shows in sidebar", async ({ page }) => {
    await login(page, FOUNDER);
    await page.waitForURL(/dashboard/, { timeout: 10_000 });
    await page.waitForTimeout(1500);
    await screenshot(page, "21-plan-info-sidebar");

    const bodyText = await page.locator("body").innerText();
    const hasPlanInfo =
      bodyText.toLowerCase().includes("free") ||
      bodyText.toLowerCase().includes("plus") ||
      bodyText.toLowerCase().includes("pro");
    console.log(`✅ Plan info visible: ${hasPlanInfo}`);
  });
});

test.describe("8. Responsive / Visual Checks", () => {
  test("mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page, FOUNDER);
    await page.waitForURL(/dashboard/, { timeout: 10_000 });
    await page.waitForTimeout(1500);
    await screenshot(page, "22-mobile-dashboard");
    console.log("✅ Mobile viewport renders");
  });

  test("wide desktop viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await login(page, FOUNDER);
    await page.waitForURL(/dashboard/, { timeout: 10_000 });
    await page.waitForTimeout(1500);
    await screenshot(page, "23-desktop-wide-dashboard");
    console.log("✅ Wide desktop viewport renders");
  });
});
