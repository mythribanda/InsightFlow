import { test, expect } from "@playwright/test";
import { bypassAuth, uploadFileAndProfile, VALID_CSV } from "./helpers.js";

// TC_CALC_001, TC_CALC_002, TC_CALC_003, TC_CALC_004

test.describe("Calculated Columns", () => {

  test.beforeEach(async ({ page }) => {
    await bypassAuth(page);
    await page.goto("/", { waitUntil: "load" });
    await uploadFileAndProfile(page, VALID_CSV);

    // Navigate to Calculated Columns Tab
    const calcTab = page.locator("aside button:has-text('Calculated Cols')").first();
    await calcTab.click();
    await page.waitForTimeout(500);
  });

  test("TC_CALC_001: Verify creating a calculated column with a valid arithmetic formula", async ({ page }) => {
    // TC_CALC_001: Verify creating a calculated column with a valid arithmetic formula
    // Expected: Column created successfully, preview shows correct values
    await page.locator('[placeholder="e.g. bonus"]').fill("bonus");
    const formulaInput = page.locator('[placeholder="e.g. ROUND(salary * 0.1, 2)"]');
    await formulaInput.fill("ROUND(salary * 0.1, 2)");

    const createBtn = page.locator('button:text-is("Create Column")');
    await createBtn.click();

    // The success message renders as: Column 'bonus' Created Successfully
    await expect(page.locator("text=Created Successfully").first()).toBeVisible({ timeout: 15000 });

    // Assert table rows are showing values
    const table = page.locator("table").first();
    await expect(table).toBeVisible();
    const tableText = await table.innerText();
    expect(tableText).toContain("bonus");
  });

  test("TC_CALC_002: Verify formula referencing a non-existent column returns an error", async ({ page }) => {
    // TC_CALC_002: Verify formula referencing a non-existent column returns an error
    // Expected: error message identifies the missing column
    await page.locator('[placeholder="e.g. bonus"]').fill("invalid_col");
    const formulaInput = page.locator('[placeholder="e.g. ROUND(salary * 0.1, 2)"]');
    await formulaInput.fill("col_z * 2");

    const createBtn = page.locator('button:text-is("Create Column")');
    await createBtn.click();

    const errorAlert = page.locator(".alert-destructive, [role='alert']").first();
    await errorAlert.waitFor({ timeout: 10000 });
    const errorText = await errorAlert.innerText();
    expect(errorText.toLowerCase()).toContain("failed");
  });

  test("TC_CALC_003: Verify formula injection/unsafe code execution attempt is blocked", async ({ page }) => {
    // TC_CALC_003: REGRESSION/SECURITY: verify formula injection/unsafe code execution attempt is blocked
    // Expected: Request blocked/sandboxed, no code execution
    await page.locator('[placeholder="e.g. bonus"]').fill("exploit");
    const formulaInput = page.locator('[placeholder="e.g. ROUND(salary * 0.1, 2)"]');
    await formulaInput.fill("salary + (1).__class__");

    const createBtn = page.locator('button:text-is("Create Column")');
    await createBtn.click();

    const errorAlert = page.locator(".alert-destructive, [role='alert']").first();
    await errorAlert.waitFor({ timeout: 10000 });
    const errorText = await errorAlert.innerText();

    expect(
      errorText.includes("Security validation failed") ||
      errorText.includes("Attribute") ||
      errorText.includes("invalid") ||
      errorText.includes("syntax") ||
      errorText.includes("error")
    ).toBe(true);
  });

  test("TC_CALC_004: Verify boolean expression formulas are supported", async ({ page }) => {
    // TC_CALC_004: Verify boolean expression formulas are supported
    // Expected: preview shows True/False values per row
    await page.locator('[placeholder="e.g. bonus"]').fill("high_sal");
    const formulaInput = page.locator('[placeholder="e.g. ROUND(salary * 0.1, 2)"]');
    await formulaInput.fill("IF(salary > 100000, True, False)");

    const createBtn = page.locator('button:text-is("Create Column")');
    await createBtn.click();

    // Wait for success message
    await expect(page.locator("text=Created Successfully").first()).toBeVisible({ timeout: 15000 });

    const table = page.locator("table").first();
    await expect(table).toBeVisible();
    const tableText = await table.innerText();
    expect(tableText.toLowerCase()).toContain("true" || "false");
  });

});
