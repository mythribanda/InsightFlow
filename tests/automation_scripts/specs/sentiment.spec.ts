import { test, expect } from "@playwright/test";
import { bypassAuth, uploadFileAndProfile, FIXTURES_DIR } from "./helpers.js";
import fs from "fs";
import path from "path";

const SENTIMENT_CSV = path.join(FIXTURES_DIR, "sentiment_data.csv");

test.describe("Sentiment Analysis & VADER Donut Chart", () => {
  test.beforeEach(async ({ page }) => {
    // Generate sentiment CSV
    if (!fs.existsSync(SENTIMENT_CSV)) {
      let content = "row_id,review_text\n";
      const reviews = [
        "I absolutely love this product it is wonderful",
        "This was a terrible experience and I hate it",
        "It is okay I guess, neither good nor bad",
        "Highly recommended best purchase I ever made",
        "Completely useless waste of money do not buy",
        "The quality is decent but could be improved"
      ];
      for (let i = 1; i <= 30; i++) {
        content += `${i},${reviews[i % reviews.length]}\n`;
      }
      fs.writeFileSync(SENTIMENT_CSV, content, "utf-8");
    }

    await bypassAuth(page);
    await page.goto("/", { waitUntil: "load" });
    await uploadFileAndProfile(page, SENTIMENT_CSV);
  });

  test("Verify VADER Sentiment Analysis card and donut chart renders", async ({ page }) => {
    test.setTimeout(120000);

    // 1. Navigate to Profiling Tab
    const profilingTab = page.locator("aside button:has-text('Profiling')").first();
    await expect(profilingTab).toBeVisible({ timeout: 30000 });
    await profilingTab.click();

    // 2. Click "View Top Terms" for review_text column
    const viewTermsBtn = page.locator("button:has-text('View Top Terms')").first();
    await expect(viewTermsBtn).toBeVisible({ timeout: 15000 });
    await viewTermsBtn.click();

    // 3. Verify VADER sentiment distribution section appears
    const vaderTitle = page.locator("text=Sentiment Distribution (VADER)").first();
    await expect(vaderTitle).toBeVisible({ timeout: 30000 });

    // 4. Verify Positive, Neutral, Negative labels inside stats list
    await expect(page.locator("text=Positive").first()).toBeVisible();
    await expect(page.locator("text=Neutral").first()).toBeVisible();
    await expect(page.locator("text=Negative").first()).toBeVisible();

    // 5. Verify donut chart SVG renders
    const donutChart = page.locator(".recharts-pie").first();
    await expect(donutChart).toBeVisible({ timeout: 15000 });
  });
});
