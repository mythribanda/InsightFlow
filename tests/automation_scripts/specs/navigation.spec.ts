import { test, expect } from "@playwright/test";
import { bypassAuth, uploadFileAndProfile, VALID_CSV } from "./helpers.js";

test.describe("Navigation - Tabs", () => {
  
  test.beforeEach(async ({ page }) => {
    await bypassAuth(page);
    await page.goto("/", { waitUntil: "load" });
    await uploadFileAndProfile(page, VALID_CSV);
    await page.waitForTimeout(1000);
  });

  test("TC_UI_NAV_001: Verify clicking 'ML Models' tab renders ModelingPanel", async ({ page }) => {
    // TC_UI_NAV_001: Verify clicking 'Modeling' tab renders ModelingPanel
    // Expected: ModelingPanel component displayed with target options
    const tabBtn = page.locator("aside button:has-text('ML Models')").first();
    await tabBtn.click();
    await expect(page.locator("text=Select Target Variable")).toBeVisible();
  });

  test("TC_UI_NAV_002: Verify clicking 'Anomalies' tab renders AnomalyPanel", async ({ page }) => {
    // TC_UI_NAV_002: Verify clicking 'Anomaly' tab renders AnomalyPanel
    // Expected: AnomalyPanel displayed
    const tabBtn = page.locator("aside button:has-text('Anomalies')").first();
    await tabBtn.click();
    await expect(page.locator("text=Anomaly Detection").or(page.locator("text=Anomalies")).first()).toBeVisible();
  });

  test("TC_UI_NAV_003: Verify clicking 'Clustering' tab renders ClusteringPanel", async ({ page }) => {
    // TC_UI_NAV_003: Verify clicking 'Clustering' tab renders ClusteringPanel
    // Expected: ClusteringPanel displayed
    const tabBtn = page.locator("aside button:has-text('Clustering')").first();
    await tabBtn.click();
    await expect(page.locator("text=Clustering Studio").or(page.locator("text=Clusters")).first()).toBeVisible();
  });

  test("TC_UI_NAV_004: Verify clicking 'Calculated Cols' tab renders CalcColumnPanel", async ({ page }) => {
    // TC_UI_NAV_004: Verify clicking 'Calculated Columns' tab renders CalcColumnPanel
    // Expected: CalcColumnPanel displayed
    const tabBtn = page.locator("aside button:has-text('Calculated Cols')").first();
    await tabBtn.click();
    await expect(page.locator("text=Create Column").or(page.locator("text=Calculated Columns")).first()).toBeVisible();
  });

  test("TC_UI_NAV_005: Verify clicking 'Ask your data' tab renders QueryBox and ChatPanel", async ({ page }) => {
    // TC_UI_NAV_005: Verify clicking 'Ask Data / Query' tab renders QueryBox and ChatPanel
    // Expected: QueryBox/ChatPanel is visible
    const tabBtn = page.locator("aside button:has-text('Ask your data')").first();
    await tabBtn.click();
    await expect(page.locator("button:has-text('Sandbox')").first()).toBeVisible();
    await expect(page.locator("button:text-is('AI Chat')").first()).toBeVisible();
  });

  test("TC_UI_NAV_006: Verify clicking 'Visualizations' tab renders AutoCharts", async ({ page }) => {
    // TC_UI_NAV_006: Verify clicking 'Visualizations' tab renders AutoCharts
    // Expected: AutoCharts renders with profile
    const tabBtn = page.locator("aside button:has-text('Visualizations')").first();
    await tabBtn.click();
    await expect(page.locator("text=Auto Charts")).toBeVisible();
    await expect(page.locator("text=Custom Builder")).toBeVisible();
  });

  test("TC_UI_NAV_007: Verify only one tab's content is visible at a time", async ({ page }) => {
    // TC_UI_NAV_007: Verify only one tab's content is visible at a time
    // Expected: Previously active tab's panel unmounts; only selected tab shown
    const modelingTab = page.locator("aside button:has-text('ML Models')").first();
    const anomalyTab = page.locator("aside button:has-text('Anomalies')").first();
    
    // Go to Modeling first
    await modelingTab.click();
    await expect(page.locator("text=Select Target Variable")).toBeVisible();
    await expect(page.locator("text=Anomaly Detection")).toBeHidden();
    
    // Go to Anomaly
    await anomalyTab.click();
    await expect(page.locator("text=Anomaly Detection").or(page.locator("text=Anomalies")).first()).toBeVisible();
    await expect(page.locator("text=Select Target Variable")).toBeHidden();
  });

});
