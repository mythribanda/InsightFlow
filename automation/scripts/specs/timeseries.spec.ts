import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import {
  bypassAuth,
  uploadFileAndProfile,
  FIXTURES_DIR
} from "../../../tests/automation_scripts/specs/helpers.js";

const TIMESERIES_CSV = path.join(FIXTURES_DIR, "timeseries_data.csv");

// Generate timeseries test CSV if it doesn't exist
if (!fs.existsSync(TIMESERIES_CSV)) {
  let content = "date,value\n";
  for (let i = 1; i <= 35; i++) {
    const day = String(i).padStart(2, "0");
    const val = 50 + i * 2 + (i % 7) * 4;
    content += `2026-01-${day},${val}\n`;
  }
  fs.writeFileSync(TIMESERIES_CSV, content, "utf-8");
}

test.describe("Time Series Analysis and Forecasting", () => {
  test.beforeEach(async ({ page }) => {
    // Setup browser logs capture
    page.on("console", (msg: any) => {
      console.log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`);
    });
    page.on("pageerror", (err: any) => {
      console.error("[BROWSER ERROR]", err.message);
    });

    await bypassAuth(page);
  });

  test("Verify time series decomposition and forecast rendering", async ({ page }) => {
    test.setTimeout(120000);

    // 1. Go to Home page and upload time series CSV
    await page.goto("/", { waitUntil: "load" });
    await uploadFileAndProfile(page, TIMESERIES_CSV);

    // 2. Select Time Series tab in sidebar
    const timeseriesTab = page.locator("aside button:has-text('Time Series')").first();
    await expect(timeseriesTab).toBeVisible();
    await timeseriesTab.click();

    // 3. Select date and value columns
    const dateSelect = page.locator("label:has-text('Datetime Column') + div").locator('[role="combobox"]').first();
    await dateSelect.click();
    await page.locator('[role="option"]:has-text("date")').first().click();

    const valSelect = page.locator("label:has-text('Numeric Value') + div").locator('[role="combobox"]').first();
    await valSelect.click();
    await page.locator('[role="option"]:has-text("value")').first().click();

    // 4. Click "Run Analysis" button
    const runBtn = page.locator("button:has-text('Run Analysis')").first();
    await expect(runBtn).toBeVisible();
    await runBtn.click();

    // 5. Verify the results render
    // Verification 1: Forecast projection chart title/header
    await expect(page.locator("text=Future Forecast Projection").first()).toBeVisible({ timeout: 60000 });

    // Verification 2: Recharts lines for Observed and Forecast
    const rechartsSvg = page.locator(".recharts-responsive-container").first();
    await expect(rechartsSvg).toBeVisible({ timeout: 10000 });

    // Verification 3: Decomposition header
    await expect(page.locator("text=Time Series Decomposition & Rolling Stats").first()).toBeVisible();

    // Verification 4: Toggle rolling average overlay
    const rollingToggle = page.locator("button:has-text('Rolling Stats Overlay')").or(page.locator("text=Rolling Stats Overlay").first());
    await expect(rollingToggle).toBeVisible();
    
    // Toggle check
    const toggleBtn = page.locator("button.relative.inline-flex.h-5.w-9").first();
    await expect(toggleBtn).toBeVisible();
    await toggleBtn.click(); // Toggle it off
  });
});
