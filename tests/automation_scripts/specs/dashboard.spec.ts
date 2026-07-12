import { test, expect } from "@playwright/test";
import { bypassAuth, uploadFileAndProfile, VALID_CSV } from "./helpers.js";

test.describe("Dashboard Custom Layouts and Persistence", () => {
  test.beforeEach(async ({ page }) => {
    page.on("console", (msg: any) => {
      console.log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`);
    });
    page.on("pageerror", (err: any) => {
      console.error("[BROWSER ERROR]", err.message);
    });

    await bypassAuth(page);
  });

  test("Verify custom widget addition, saving layout, and auto-loading layout", async ({ page }) => {
    test.setTimeout(180000);
    await page.goto("/", { waitUntil: "load" });
    await uploadFileAndProfile(page, VALID_CSV);

    // Save project first to ensure layout persistence is active
    const saveBtn = page.locator("button:has-text('Save Project')").first();
    await expect(saveBtn).toBeVisible({ timeout: 60000 });
    await saveBtn.click();

    const projectNameInput = page.locator("input[placeholder='My Project']");
    await expect(projectNameInput).toBeVisible();
    const uniqueProjectName = `Dashboard Project ${Date.now()}`;
    await projectNameInput.fill(uniqueProjectName);

    const confirmSaveBtn = page.locator(".fixed button:has-text('Save')").first();
    await confirmSaveBtn.click();
    await expect(page.locator("text=saved successfully").first()).toBeVisible({ timeout: 15000 });

    // Click "Interactive Grid" tab switcher
    const interactiveGridBtn = page.locator("button:has-text('Interactive Grid')").first();
    await expect(interactiveGridBtn).toBeVisible({ timeout: 10000 });
    await interactiveGridBtn.click();

    // Click "Add Widget" button
    const addWidgetBtn = page.locator("button:has-text('Add Widget')").first();
    await expect(addWidgetBtn).toBeVisible();
    await addWidgetBtn.click();

    // Fill in custom widget picker
    const widgetTitleInput = page.locator("input[placeholder='e.g. Sales Distribution']");
    await expect(widgetTitleInput).toBeVisible();
    const customWidgetTitle = `E2E Custom Widget ${Date.now()}`;
    await widgetTitleInput.fill(customWidgetTitle);

    // Click "Add to Dashboard" in modal
    const addToDashboardBtn = page.locator("button:has-text('Add to Dashboard')").first();
    await addToDashboardBtn.click();

    // Verify custom widget header is visible on the grid
    await expect(page.locator(`text=${customWidgetTitle}`).first()).toBeVisible({ timeout: 10000 });

    // Click "Save Layout" button
    const saveLayoutBtn = page.locator("button:has-text('Save Layout')").first();
    await expect(saveLayoutBtn).toBeVisible();
    await saveLayoutBtn.click();

    // Input layout name in layout save dialog
    const layoutNameInput = page.locator("input[placeholder='e.g. Sales Metrics View']");
    await expect(layoutNameInput).toBeVisible();
    const customLayoutName = `My Layout ${Date.now()}`;
    await layoutNameInput.fill(customLayoutName);

    // Confirm save in dialog
    const confirmSaveLayoutBtn = page.locator("button:has-text('Save Dashboard')").first();
    await confirmSaveLayoutBtn.click();

    // Expect successful save toast notification
    await expect(page.locator("text=saved successfully").first()).toBeVisible({ timeout: 15000 });

    // Go to projects list to reload the workspace fresh
    await page.goto("/projects", { waitUntil: "load" });
    await expect(page.locator(`text=${uniqueProjectName}`).first()).toBeVisible({ timeout: 15000 });

    // Open Workspace
    const openBtn = page.locator("button:has-text('Open Workspace')").first();
    await expect(openBtn).toBeVisible();
    await openBtn.click();

    // Wait for console to load the workspace
    await expect(page.locator("text=Completeness").first()).toBeVisible({ timeout: 60000 });

    // Switch to Interactive Grid
    const interactiveGridBtn2 = page.locator("button:has-text('Interactive Grid')").first();
    await expect(interactiveGridBtn2).toBeVisible({ timeout: 10000 });
    await interactiveGridBtn2.click();

    // The layout switcher dropdown should contain our customLayoutName as selected or option,
    // and the custom widget should be visible on reload since it was the last viewed!
    await expect(page.locator(`text=${customWidgetTitle}`).first()).toBeVisible({ timeout: 15000 });
  });

  test("Verify filter bar addition, range slider input, and clear active filters", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/", { waitUntil: "load" });
    await uploadFileAndProfile(page, VALID_CSV);

    // Click "Interactive Grid" tab switcher
    const interactiveGridBtn = page.locator("button:has-text('Interactive Grid')").first();
    await expect(interactiveGridBtn).toBeVisible({ timeout: 60000 });
    await interactiveGridBtn.click();

    // Select column dropdown for filters
    const filterSelect = page.locator("button:has-text('Add column filter...')").first();
    await expect(filterSelect).toBeVisible();
    await filterSelect.click();

    // Select target column (let's say first item in list - 'target' or similar)
    const targetOption = page.locator("[role='option']").first();
    await expect(targetOption).toBeVisible();
    const colName = await targetOption.innerText();
    await targetOption.click();

    // Verify Apply button is now visible
    const applyBtn = page.locator("button:has-text('Apply')").first();
    await expect(applyBtn).toBeVisible();
    await applyBtn.click();

    // Verify active filter badge appears
    const activeBadge = page.locator(`text=Active: ${colName}`).first();
    await expect(activeBadge).toBeVisible({ timeout: 10000 });

    // Click Clear All
    const clearAllBtn = page.locator("button:has-text('Clear All')").first();
    await expect(clearAllBtn).toBeVisible();
    await clearAllBtn.click();

    // Verify active badge disappears
    await expect(activeBadge).toBeHidden({ timeout: 5000 });
  });

  test("Verify starting from Data Quality template", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/", { waitUntil: "load" });
    await uploadFileAndProfile(page, VALID_CSV);

    // Click "Interactive Grid" tab switcher
    const interactiveGridBtn = page.locator("button:has-text('Interactive Grid')").first();
    await expect(interactiveGridBtn).toBeVisible({ timeout: 60000 });
    await interactiveGridBtn.click();

    // Click template button "Data Quality Overview"
    const dqTemplateBtn = page.locator("button:has-text('Data Quality Overview')").first();
    await expect(dqTemplateBtn).toBeVisible();
    await dqTemplateBtn.click();

    // Expect widgets to load: 'Dataset Trust Score', 'Missing Values per Column', and 'Correlation Heatmap Matrix'
    await expect(page.locator("text=Dataset Trust Score").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Missing Values per Column").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Correlation Heatmap Matrix").first()).toBeVisible({ timeout: 15000 });
  });
});

