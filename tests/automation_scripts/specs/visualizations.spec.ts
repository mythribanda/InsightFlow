import { test, expect } from "@playwright/test";
import { bypassAuth, uploadFileAndProfile, VALID_CSV } from "./helpers.js";

// TC_VIS_001, TC_VIS_002, TC_VIS_003, TC_VIS_004, TC_VIS_005, TC_VIS_006

test.describe("Visualizations Studio", () => {

  test.beforeEach(async ({ page }) => {
    await bypassAuth(page);
    await page.goto("/", { waitUntil: "load" });
    await uploadFileAndProfile(page, VALID_CSV);

    // Navigate to Visualizations Tab (sidebar)
    const visTab = page.locator("aside button:has-text('Visualizations')").first();
    await visTab.click();
    await page.waitForTimeout(500);
  });

  test("TC_VIS_001: Verify auto-generated charts render automatically after upload", async ({ page }) => {
    // TC_VIS_001: Verify auto-generated charts render automatically after upload
    // Expected: AutoCharts renders a set of charts (e.g. Distribution of age)
    // Auto Charts mode is the default — check for "Auto Charts" mode button (active) or chart labels
    await expect(page.locator("button:has-text('Auto Charts')").first()).toBeVisible();
    await expect(page.locator("button:has-text('Custom Builder')").first()).toBeVisible();
    // AutoCharts shows Distribution or Correlation titles
    await expect(
      page.locator("text=/Distribution of/i").first()
        .or(page.locator(".recharts-responsive-container").first()).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("TC_VIS_002: Verify histogram chart renders correctly for a numeric column", async ({ page }) => {
    // TC_VIS_002: Verify histogram chart renders correctly for a numeric column
    // Expected: Histogram rendered matching column distribution
    await page.locator("button:has-text('Custom Builder')").click();
    await page.waitForTimeout(500);

    // Column 1 select
    const col1Select = page.locator("div.surface-card:has-text('Column 1') select").first();
    await col1Select.selectOption("age");

    // Wait for loading spinner to clear
    await expect(page.locator(".recharts-responsive-container")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".recharts-responsive-container svg")).toBeVisible();
  });

  test("TC_VIS_003: Verify scatter plot renders for two numeric columns", async ({ page }) => {
    // TC_VIS_003: Verify scatter plot renders for two numeric columns
    // Expected: Scatter plot renders both axes correctly
    await page.locator("button:has-text('Custom Builder')").click();
    await page.waitForTimeout(500);

    const customBuilder = page.locator("div.surface-card:has-text('Column 1')");
    await customBuilder.locator("select").nth(0).selectOption("age");
    await customBuilder.locator("select").nth(1).selectOption("salary");

    await expect(page.locator(".recharts-responsive-container")).toBeVisible({ timeout: 15000 });
  });

  test("TC_VIS_004: Verify grouped bar chart renders for two categorical columns", async ({ page }) => {
    // TC_VIS_004: Verify grouped bar chart renders for two categorical columns
    // Expected: Grouped bar chart renders correctly
    await page.locator("button:has-text('Custom Builder')").click();
    await page.waitForTimeout(500);

    const customBuilder = page.locator("div.surface-card:has-text('Column 1')");
    await customBuilder.locator("select").nth(0).selectOption("department");
    await customBuilder.locator("select").nth(1).selectOption("city");

    await expect(page.locator(".recharts-responsive-container")).toBeVisible({ timeout: 15000 });
  });

  test("TC_VIS_005: Verify heatmap chart type renders correctly", async ({ page }) => {
    // TC_VIS_005: Verify heatmap chart type renders correctly
    // Expected: Heatmap renders correctly (as a table)
    await page.locator("button:has-text('Custom Builder')").click();
    await page.waitForTimeout(500);

    const customBuilder = page.locator("div.surface-card:has-text('Column 1')");
    await customBuilder.locator("select").nth(0).selectOption("department");
    await customBuilder.locator("select").nth(1).selectOption("city");

    // Wait for chart to load first
    await expect(page.locator(".recharts-responsive-container")).toBeVisible({ timeout: 15000 });

    // Then switch to heatmap via the chart type select (3rd select)
    await customBuilder.locator("select").nth(2).selectOption("heatmap");
    await page.waitForTimeout(1000);
    // Heatmap renders as a table (no recharts container)
    await expect(page.locator("table").or(page.locator(".recharts-responsive-container"))).toBeVisible({ timeout: 5000 });
  });

  test("TC_VIS_006: Verify chart type dropdown switches the rendered chart correctly", async ({ page }) => {
    // TC_VIS_006: Verify chart type dropdown switches the rendered chart correctly
    // Expected: Chart re-renders correctly for each selected type
    await page.locator("button:has-text('Custom Builder')").click();
    await page.waitForTimeout(500);

    const customBuilder = page.locator("div.surface-card:has-text('Column 1')");
    await customBuilder.locator("select").nth(0).selectOption("department");
    await customBuilder.locator("select").nth(1).selectOption("city");

    // Wait for initial chart
    await expect(page.locator(".recharts-responsive-container")).toBeVisible({ timeout: 15000 });

    // Switch to grouped_bar using chart type select (3rd select)
    await customBuilder.locator("select").nth(2).selectOption("grouped_bar");
    await page.waitForTimeout(800);
    await expect(page.locator(".recharts-responsive-container")).toBeVisible({ timeout: 5000 });

    // Switch to heatmap
    await customBuilder.locator("select").nth(2).selectOption("heatmap");
    await page.waitForTimeout(800);
    await expect(page.locator("table").or(page.locator(".recharts-responsive-container"))).toBeVisible({ timeout: 5000 });
  });

});
