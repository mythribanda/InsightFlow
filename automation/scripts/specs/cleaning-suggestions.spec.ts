import { test, expect } from "@playwright/test";
import { bypassAuth, uploadFileAndProfile, REGRESSION_CSV } from "../../../tests/automation_scripts/specs/helpers.js";

test.describe("AI Data Cleaning Suggestions Checklist", () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuth(page);
    await page.goto("/", { waitUntil: "load" });
    await uploadFileAndProfile(page, REGRESSION_CSV);
  });

  test("Verify cleaning suggestions render and clicking Apply routes and pre-fills panels", async ({ page }) => {
    test.setTimeout(120000);

    // 1. Navigate to Insights tab
    const insightsTab = page.locator("aside button:has-text('Insights')").first();
    await expect(insightsTab).toBeVisible({ timeout: 30000 });
    await insightsTab.click();

    // 2. Verify AI Data Cleaning Suggestions card is displayed
    const suggestionsTitle = page.locator("text=AI Data Cleaning Suggestions").first();
    await expect(suggestionsTitle).toBeVisible({ timeout: 45000 });

    // 3. Locate the first Apply button
    const firstApplyBtn = page.locator("button:text-is('Apply')").first();
    await expect(firstApplyBtn).toBeVisible();

    // Get suggestion details for verification
    const suggestionRow = page.locator("div.flex.items-center.justify-between").first();
    const actionText = await suggestionRow.locator("p.text-xs.text-muted-foreground").first().innerText();
    const colNameElement = suggestionRow.locator("span.font-mono").first();
    const colName = (await colNameElement.count()) > 0 ? await colNameElement.innerText() : "";

    // 4. Click Apply
    await firstApplyBtn.click();

    // 5. Verify it routed to the correct panel and pre-filled inputs
    if (actionText.includes("drop column")) {
      // Routed to modeling tab
      const activeHeader = page.locator("h2:has-text('Machine Learning Workspace')").first();
      await expect(activeHeader).toBeVisible({ timeout: 15000 });
    } else if (actionText.includes("impute missing")) {
      // Routed to calc tab
      const calcHeader = page.locator("h3:has-text('Calculated Columns')").first();
      await expect(calcHeader).toBeVisible({ timeout: 15000 });

      // Input name should match the column
      const nameInput = page.locator("input[placeholder='e.g. bonus']").first();
      await expect(nameInput).toHaveValue(colName);
    }
  });
});
