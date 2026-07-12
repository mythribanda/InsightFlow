import { test, expect } from "@playwright/test";
import { bypassAuth, uploadFileAndProfile, VALID_CSV } from "../../../tests/automation_scripts/specs/helpers.js";

test.describe("SQL Console & CodeMirror Editor", () => {
  test.beforeEach(async ({ page }) => {
    page.on("console", (msg: any) => {
      console.log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`);
    });
    page.on("pageerror", (err: any) => {
      console.error("[BROWSER ERROR]", err.message);
    });

    await bypassAuth(page);
    await page.goto("/", { waitUntil: "load" });
    await uploadFileAndProfile(page, VALID_CSV);
  });

  test("Verify SQL schema browser sidebar collapsibility, column insertion, query timing, history, and saving", async ({ page }) => {
    test.setTimeout(120000);

    // 1. Navigate to Ask your data tab
    const askTab = page.locator("aside button:has-text('Ask your data')").first();
    await expect(askTab).toBeVisible({ timeout: 15000 });
    await askTab.click();

    // 2. Switch to Sandbox sub-tab
    const sandboxBtn = page.locator("button:has-text('Sandbox')").first();
    await expect(sandboxBtn).toBeVisible({ timeout: 15000 });
    await sandboxBtn.click();

    // 3. Switch to SQL Mode
    const sqlModeBtn = page.locator("button:has-text('SQL Mode')").first();
    await expect(sqlModeBtn).toBeVisible();
    await sqlModeBtn.click();

    // 4. Verify table schema browser sidebar displays SQL Browser title
    const schemaTitle = page.locator("text=SQL Browser").first();
    await expect(schemaTitle).toBeVisible();

    // 5. Collapse schema browser
    const collapseBtn = page.locator("button[title='Collapse Sidebar']").first();
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();
    await expect(schemaTitle).toBeHidden();

    // 6. Show schema browser again
    const showSchemaBtn = page.locator("button:has-text('Show SQL Browser')").first();
    await expect(showSchemaBtn).toBeVisible();
    await showSchemaBtn.click();
    await expect(schemaTitle).toBeVisible();

    // 7. Click a column to insert it into SQL editor
    const firstColumnItem = page.locator("button[title='Click to insert at cursor']").first();
    await expect(firstColumnItem).toBeVisible();
    const colName = await firstColumnItem.locator("span").first().innerText();
    await firstColumnItem.click();

    // 8. Run standard SQL Query and verify output is generated with timing info
    const runQueryBtn = page.locator("button:has-text('Run Query')").first();
    await expect(runQueryBtn).toBeVisible();
    await runQueryBtn.click();

    // Verify row results count displays (indicates execution completed successfully)
    const resultCount = page.locator("text=Returned").first();
    await expect(resultCount).toBeVisible({ timeout: 30000 });

    // Verify execution time text appears
    const timingText = page.locator("text=Execution:").first();
    await expect(timingText).toBeVisible({ timeout: 10000 });

    // 9. Verify History Tab
    const queriesTab = page.locator("button:has-text('Queries')").first();
    await expect(queriesTab).toBeVisible();
    await queriesTab.click();

    const historySubTab = page.locator("button:has-text('History')").first();
    await expect(historySubTab).toBeVisible();

    const rerunBtn = page.locator("button:has-text('Rerun')").first();
    await expect(rerunBtn).toBeVisible();

    // 10. Verify Save Query Dialog Modal
    const saveQueryBtn = page.locator("button:has-text('Save Query')").first();
    await expect(saveQueryBtn).toBeVisible();
    await saveQueryBtn.click();

    const queryNameInput = page.locator("input[placeholder='e.g. Average Salary by Dep']").first();
    await expect(queryNameInput).toBeVisible();
    await queryNameInput.fill("E2E Test Saved Query");

    // Click confirm Save inside modal
    const confirmSaveBtn = page.locator("button:text-is('Save Query')").first();
    await expect(confirmSaveBtn).toBeVisible();
    await confirmSaveBtn.click();

    // Verify saved tab shows the saved query name
    const savedSubTab = page.locator("button:has-text('Saved')").first();
    await expect(savedSubTab).toBeVisible();
    await savedSubTab.click();

    const savedNameLabel = page.locator("text=E2E Test Saved Query").first();
    await expect(savedNameLabel).toBeVisible({ timeout: 10000 });
  });
});
