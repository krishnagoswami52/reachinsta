import "dotenv/config";
import { test, expect, Page } from "@playwright/test";

/**
 * Sprint 3 — tab restructure.
 * Each tab must have one clear purpose: Overview = insights, Creators = deep dive,
 * Duration = no duplicates, Reels = the only home of the viral table.
 */

const BASE = "http://localhost:5000";

const EMAIL = process.env.TEST_FOUNDER_EMAIL;
const PASSWORD = process.env.TEST_FOUNDER_PASSWORD;

if (!EMAIL || !PASSWORD) {
  throw new Error("Set TEST_FOUNDER_EMAIL and TEST_FOUNDER_PASSWORD in .env before running tests.");
}

async function gotoAnalytics(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/email/i).fill(EMAIL!);
  await page.getByLabel(/password/i).fill(PASSWORD!);
  await page.getByRole("button", { name: /login|sign in/i }).click();
  await page.waitForURL(/dashboard|verify-email/, { timeout: 15_000 });
  await page.goto(`${BASE}/analytics`);
  // Wait for the fetch data to land — the tab strip only renders once reels exist.
  await expect(page.getByTestId("analytics-tab-overview")).toBeVisible({ timeout: 20_000 });
}

async function openTab(page: Page, tab: string) {
  await page.getByTestId(`analytics-tab-${tab}`).click();
  await page.waitForTimeout(400);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `tests/screenshots/sprint3-${name}.png`, fullPage: true });
}

test.describe("Sprint 3 — tab restructure", () => {
  test("1. Overview shows insights, not duplicated charts", async ({ page }) => {
    await gotoAnalytics(page);

    // KPI cards survive from Sprint 2
    await expect(page.getByText("total reels", { exact: true })).toBeVisible();
    await expect(page.getByText("avg er", { exact: true })).toBeVisible();

    // Insights panel with at least 3 generated items
    const insights = page.locator('[data-testid^="insight-"]:not([data-testid*="link"])');
    expect(await insights.count()).toBeGreaterThanOrEqual(3);

    // Quick stats + tab guide
    expect(await page.locator('[data-testid^="quick-stat-"]:not([data-testid*="link"])').count())
      .toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId("tab-guide-creators")).toBeVisible();

    // NO full charts, NO viral table on Overview
    await expect(page.getByText("Top 25 Viral Reels")).toHaveCount(0);
    await expect(page.getByText("Competitor Leaderboard")).toHaveCount(0);
    await expect(page.getByText("Top Creators by Avg ER (%)")).toHaveCount(0);

    await shot(page, "01-overview");
    console.log("✅ Overview = insights + KPIs + navigation");
  });

  test("2. Creators is the deep dive, without the viral table", async ({ page }) => {
    await gotoAnalytics(page);
    await openTab(page, "creators");

    await expect(page.getByText("Top Creators by Avg ER (%)")).toBeVisible();
    await expect(page.getByText("Competitor Leaderboard")).toBeVisible();
    await expect(page.getByText("All Competitors")).toBeVisible();
    expect(await page.getByTestId("competitor-row-0").count()).toBe(1);

    await expect(page.getByText("Top 25 Viral Reels")).toHaveCount(0);

    // Sorting works
    await page.getByTestId("sort-competitors-avgER").click();
    await page.waitForTimeout(300);
    await expect(page.getByTestId("competitor-row-0")).toBeVisible();

    await shot(page, "02-creators");
    console.log("✅ Creators = charts + All Competitors table, no viral table");
  });

  test("3. Duration tab has no duplicate widgets", async ({ page }) => {
    await gotoAnalytics(page);
    await openTab(page, "duration");

    await expect(page.getByText("Views by Duration")).toBeVisible();
    await expect(page.getByText("Duration Performance")).toHaveCount(0);
    await expect(page.getByText("Avg Views by Duration")).toHaveCount(0);
    await expect(page.getByText("Duration vs Views")).toBeVisible();
    await expect(page.getByText("View-to-Like Ratio Distribution")).toBeVisible();

    await shot(page, "03-duration");
    console.log("✅ Duration = 3 widgets, no duplicates");
  });

  test("4. Timing tab keeps both Sprint 1 heatmaps", async ({ page }) => {
    await gotoAnalytics(page);
    await openTab(page, "timing");

    await expect(page.getByText("Views Heatmap")).toBeVisible();
    await expect(page.getByText("Engagement Heatmap")).toBeVisible();
    await expect(page.getByText("Avg ER by Upload Hour")).toBeVisible();
    await expect(page.getByText("Avg ER by Weekday")).toBeVisible();

    await shot(page, "04-timing");
    console.log("✅ Timing unchanged, Sprint 1 heatmaps intact");
  });

  test("5. Reels tab owns the viral table", async ({ page }) => {
    await gotoAnalytics(page);
    await openTab(page, "reels");

    await expect(page.getByText("Top 25 Viral Reels")).toBeVisible();
    expect(await page.getByTestId("reel-row-0").count()).toBe(1);

    await shot(page, "05-reels");
    console.log("✅ Reels = top tables + the only viral table");
  });

  test("6. Insight links navigate to the right tab", async ({ page }) => {
    await gotoAnalytics(page);

    await page.getByTestId("insight-link-creators").first().click();
    await expect(page.getByText("All Competitors")).toBeVisible();

    await openTab(page, "overview");
    await page.getByTestId("insight-link-timing").first().click();
    await expect(page.getByText("Views Heatmap")).toBeVisible();

    await openTab(page, "overview");
    await page.getByTestId("tab-guide-duration").click();
    await expect(page.getByText("Views by Duration")).toBeVisible();

    console.log("✅ Insight + guide links switch tabs");
  });

  test("7. Insights are data-driven, not hardcoded", async ({ page }) => {
    await gotoAnalytics(page);

    // Every insight detail must carry a number pulled from the data.
    const details = await page.locator('[data-testid^="insight-"] p.font-mono').allTextContents();
    expect(details.length).toBeGreaterThanOrEqual(3);
    for (const detail of details) {
      expect(detail).toMatch(/\d/);
    }

    // Switching to another fetch must change the panel's numbers (if >1 fetch exists).
    const before = details.join("|");
    const selector = page.getByTestId("select-fetch-history");
    await selector.click();
    const options = page.locator('[data-testid^="fetch-option-"]');
    const count = await options.count();
    if (count > 1) {
      await options.nth(1).click();
      await page.waitForTimeout(2500);
      const after = (await page.locator('[data-testid^="insight-"] p.font-mono').allTextContents()).join("|");
      expect(after).not.toBe(before);
      console.log("✅ Insights change with the selected fetch");
    } else {
      await page.keyboard.press("Escape");
      console.log("⚠️ Only one fetch available — skipped cross-fetch comparison");
    }
  });

  test("8. Overview is usable at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoAnalytics(page);

    await expect(page.getByTestId("tab-guide-reels")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await shot(page, "06-overview-375");
    console.log("✅ Overview fits 375px with no horizontal scroll");
  });
});
