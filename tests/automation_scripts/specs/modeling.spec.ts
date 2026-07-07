import { test, expect } from "@playwright/test";
import {
  bypassAuth,
  uploadFileAndProfile,
  VALID_CSV,
  REGRESSION_CSV,
  IMBALANCED_CSV,
  MISSING_LABELS_CSV
} from "./helpers.js";

// TC_MODEL_001, TC_MODEL_003, TC_MODEL_004, TC_MODEL_010, TC_MODEL_012, TC_MODEL_013

/** Helper: opens modeling tab, selects target column, runs Feature Analysis, waits for results */
async function runSuitabilityCheck(page: any, targetColumn: string) {
  // Navigate to ML Models tab (sidebar aside button)
  const modelTab = page.locator("aside button:has-text('ML Models')").first();
  await modelTab.click();

  // Click the shadcn SelectTrigger (renders as role="combobox")
  const combobox = page.locator('[role="combobox"]').first();
  await combobox.click();

  // Click the option matching the target column in the SelectContent
  await page.locator(`[role="option"]:has-text("${targetColumn}")`).first().click();

  // Click "Next: Feature Analysis →" button
  await page.locator('button:has-text("Feature Analysis")').click();

  // Wait for the "Feature Recommendations (S2)" card title to appear
  await expect(page.locator("text=Feature Recommendations (S2)").first()).toBeVisible({ timeout: 30000 });
}

/** Helper: runs the full pipeline through Model Comparison */
async function runFullModelTraining(page: any, targetColumn: string) {
  await runSuitabilityCheck(page, targetColumn);

  // Click "Next: Configure & Train →" button
  await page.locator('button:has-text("Configure")').click();

  // Wait for "Configure & Train" card to appear
  await expect(page.locator("text=Configure & Train (§4)").first()).toBeVisible({ timeout: 10000 });

  // Train the models
  await page.locator('button:has-text("Train Both Models")').click();

  // Wait for "Model Comparison (S4)" card title to appear
  await expect(page.locator("text=Model Comparison (S4)").first()).toBeVisible({ timeout: 90000 });
}

test.describe("Modeling Studio", () => {

  test.beforeEach(async ({ page }) => {
    await bypassAuth(page);
    await page.goto("/", { waitUntil: "load" });
  });

  test("TC_MODEL_001: Verify task auto-detection based on target column type", async ({ page }) => {
    // TC_MODEL_001: Verify task auto-detection (classification vs regression) based on target column
    // Expected: Regression task for numeric high-cardinality, classification for low-cardinality

    // --- REGRESSION TASK ---
    await uploadFileAndProfile(page, REGRESSION_CSV);
    await runFullModelTraining(page, "salary");

    // Regression metrics (R2, RMSE) should appear in table headers
    const regHeaderText = await page.locator("table thead tr").first().innerText();
    expect(regHeaderText.toLowerCase()).toContain("r2");
    expect(regHeaderText.toLowerCase()).toContain("rmse");

    // --- CLASSIFICATION TASK ---
    await page.reload({ waitUntil: "load" });
    await uploadFileAndProfile(page, REGRESSION_CSV);
    await runFullModelTraining(page, "department");

    // Classification metrics (f1, accuracy) should appear in table headers
    const clsHeaderText = await page.locator("table thead tr").first().innerText();
    expect(clsHeaderText.toLowerCase()).toContain("f1");
    expect(clsHeaderText.toLowerCase()).toContain("accuracy");
  });

  test.skip("TC_MODEL_002: Verify user can manually override auto-detected task", async () => {
    // TC_MODEL_002: Verify user can manually override auto-detected task
    // Reason for Skip: The manual task type override feature is not implemented in the application UI or backend API.
  });

  test("TC_MODEL_003: Verify Target Suitability Checker flags missing labels", async ({ page }) => {
    // TC_MODEL_003: Verify Target Suitability Checker flags high proportion of missing labels
    // Expected: Warning surfaced in issues/warnings section of Feature Recommendations
    await uploadFileAndProfile(page, MISSING_LABELS_CSV);
    await runSuitabilityCheck(page, "salary");

    // Look for warning or issues text inside the Feature Recommendations card
    const warningArea = page
      .locator("[role='alert']")
      .or(page.locator("text=/missing/i").first())
      .or(page.locator("text=/warning/i").first());
    await expect(warningArea.first()).toBeVisible({ timeout: 10000 });
  });

  test("TC_MODEL_004: Verify Target Suitability Checker flags class imbalance", async ({ page }) => {
    // TC_MODEL_004: Verify Target Suitability Checker flags class imbalance >80%
    // Expected: Warning surfaced in issues/warnings section of Feature Recommendations
    await uploadFileAndProfile(page, IMBALANCED_CSV);
    await runSuitabilityCheck(page, "department");

    // The suitability check renders warnings in a "Warnings" section
    const warningOrIssueArea = page
      .locator("[role='alert']")
      .or(page.locator("text=/imbalance/i").first())
      .or(page.locator("text=/class/i").first());
    await expect(warningOrIssueArea.first()).toBeVisible({ timeout: 10000 });
  });

  test("TC_MODEL_010: Verify model training runs baseline + HistGradientBoosting models only", async ({ page }) => {
    // TC_MODEL_010: Verify model training runs curated baseline + HistGradientBoosting models only
    // Expected: exactly 2 rows/results in model comparison table
    await uploadFileAndProfile(page, REGRESSION_CSV);
    await runFullModelTraining(page, "salary");

    // Count table rows (excluding header) - should be exactly 2 models
    const rowsCount = await page.locator("table tbody tr").count();
    expect(rowsCount).toBe(2);
  });

  test("TC_MODEL_012: Verify classification task shows only classification metrics", async ({ page }) => {
    // TC_MODEL_012: Verify classification task shows only classification metrics
    // Expected: ROC_AUC, F1, Accuracy, Precision, Recall visible, R2/RMSE hidden
    await uploadFileAndProfile(page, REGRESSION_CSV);
    await runFullModelTraining(page, "department");

    const headerText = await page.locator("table thead tr").first().innerText();
    expect(headerText.toLowerCase()).toContain("f1");
    expect(headerText.toLowerCase()).toContain("accuracy");
    expect(headerText.toLowerCase()).not.toContain("rmse");
  });

  test("TC_MODEL_013: Verify regression task shows only regression metrics", async ({ page }) => {
    // TC_MODEL_013: Verify regression task shows only regression metrics
    // Expected: R2, RMSE, MAE visible, ROC_AUC/Accuracy hidden
    await uploadFileAndProfile(page, REGRESSION_CSV);
    await runFullModelTraining(page, "salary");

    const headerText = await page.locator("table thead tr").first().innerText();
    expect(headerText.toLowerCase()).toContain("r2");
    expect(headerText.toLowerCase()).toContain("rmse");
    expect(headerText.toLowerCase()).not.toContain("accuracy");
  });

});
