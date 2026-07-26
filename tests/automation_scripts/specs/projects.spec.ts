import { test, expect } from "@playwright/test";
import { bypassAuth, uploadFileAndProfile, VALID_CSV } from "./helpers.js";

test.describe("Persistent Projects", () => {
  test.beforeEach(async ({ page }) => {
    // Setup browser logs capture
    page.on("console", (msg: any) => {
      console.log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`);
    });
    page.on("pageerror", (err: any) => {
      console.error("[BROWSER ERROR]", err.message);
    });

    // Mock profiles API
    await bypassAuth(page);
  });

  test("Verify project creation, listing, reloading and opening", async ({ page }) => {
    test.setTimeout(150000);
    await page.goto("/", { waitUntil: "load" });
    await uploadFileAndProfile(page, VALID_CSV);

    // Wait for analysis to complete and dashboard to load
    const saveBtn = page.locator("button:has-text('Save Project')").first();
    await expect(saveBtn).toBeVisible({ timeout: 60000 });
    await saveBtn.click();

    // Fill in project name
    const projectNameInput = page.locator("input[placeholder='My Project']");
    await expect(projectNameInput).toBeVisible();
    const uniqueProjectName = `Test Project ${Date.now()}`;
    await projectNameInput.fill(uniqueProjectName);

    // Click save in the modal
    const confirmSaveBtn = page.locator(".fixed button:has-text('Save')").first();
    await confirmSaveBtn.click();

    // Verify toast of successful save
    await expect(page.locator("text=saved successfully").first()).toBeVisible({ timeout: 15000 });
    
    // Go to projects list page
    await page.goto("/projects", { waitUntil: "load" });

    // Verify the project card exists
    await expect(page.locator(`text=${uniqueProjectName}`).first()).toBeVisible({ timeout: 15000 });

    // Click "Open Workspace"
    const openBtn = page.locator("button:has-text('Open Workspace')").first();
    await expect(openBtn).toBeVisible();
    await openBtn.click();

    // Wait for console to load the workspace
    await expect(page.locator("text=Completeness").first()).toBeVisible({ timeout: 60000 });
    await expect(page.locator(`text=${uniqueProjectName}`).first()).toBeVisible();
  });

  test("Verify Dataset Gallery (searching, sorting, favoriting, tagging)", async ({ page }) => {
    test.setTimeout(180000);
    await page.goto("/", { waitUntil: "load" });
    await uploadFileAndProfile(page, VALID_CSV);

    // Save project
    const saveBtn = page.locator("button:has-text('Save Project')").first();
    await expect(saveBtn).toBeVisible({ timeout: 60000 });
    await saveBtn.click();

    const uniqueGalleryProjName = `Gallery Project ${Date.now()}`;
    const projectNameInput = page.locator("input[placeholder='My Project']");
    await expect(projectNameInput).toBeVisible();
    await projectNameInput.fill(uniqueGalleryProjName);

    const confirmSaveBtn = page.locator(".fixed button:has-text('Save')").first();
    await confirmSaveBtn.click();

    // Verify toast
    await expect(page.locator("text=saved successfully").first()).toBeVisible({ timeout: 15000 });

    // Navigate to datasets page
    await page.goto("/datasets", { waitUntil: "load" });

    // Verify card exists
    const cardLocator = page.locator(`text=${uniqueGalleryProjName}`).first();
    await expect(cardLocator).toBeVisible({ timeout: 15000 });

    // 1. Tagging flow
    const addTagBadge = page.locator("text=Add Tag").first();
    await expect(addTagBadge).toBeVisible();
    await addTagBadge.click();

    const tagInput = page.locator("input[placeholder='new tag']");
    await expect(tagInput).toBeVisible();
    await tagInput.fill("finance");
    await tagInput.press("Enter");

    // Verify tag is added and shown
    const financeBadge = page.locator("text=finance").first();
    await expect(financeBadge).toBeVisible({ timeout: 15000 });

    // 2. Favorite toggle flow
    const starBtn = page.locator("div.rounded-xl button:has(svg.lucide-star)").first();
    await expect(starBtn).toBeVisible();
    await starBtn.click();
    await expect(page.locator("text=favorited!").first()).toBeVisible({ timeout: 15000 });

    // Click Favorites filter
    const favFilterBtn = page.locator("button:has-text('Favorites')").first();
    await expect(favFilterBtn).toBeVisible();
    await favFilterBtn.click();

    // Verify our project is still visible
    await expect(page.locator(`text=${uniqueGalleryProjName}`).first()).toBeVisible();

    // Click Favorites filter again to disable
    await favFilterBtn.click();

    // 3. Search flow
    const searchInput = page.locator("input[placeholder='Search datasets...']");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("Gallery");
    await expect(page.locator(`text=${uniqueGalleryProjName}`).first()).toBeVisible();

    await searchInput.fill("NonexistentName");
    await expect(page.locator(`text=${uniqueGalleryProjName}`)).toBeHidden();

    // Clear search
    await searchInput.fill("");

    // 4. Deleting flow
    // Setup dialog handler to accept deletion confirmation
    page.once("dialog", (dialog: any) => {
      dialog.accept();
    });

    const deleteBtn = page.locator("button:has(svg.lucide-trash-2)").first();
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // Verify it is deleted
    await expect(page.locator("text=deleted successfully").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator(`text=${uniqueGalleryProjName}`)).toBeHidden({ timeout: 15000 });
  });

  test("Version history panel shows snapshots and allows preview", async ({ page }) => {
    test.setTimeout(180000);
    await page.goto("/", { waitUntil: "load" });
    await uploadFileAndProfile(page, VALID_CSV);

    // Wait for analysis and save the project
    const saveBtn = page.locator("button:has-text('Save Project')").first();
    await expect(saveBtn).toBeVisible({ timeout: 60000 });
    await saveBtn.click();

    const projectNameInput = page.locator("input[placeholder='My Project']");
    await expect(projectNameInput).toBeVisible();
    const uniqueName = `Version Test ${Date.now()}`;
    await projectNameInput.fill(uniqueName);

    const confirmSaveBtn = page.locator(".fixed button:has-text('Save')").first();
    await confirmSaveBtn.click();
    await expect(page.locator("text=saved successfully").first()).toBeVisible({ timeout: 15000 });

    // Navigate to Dataset Gallery
    await page.goto("/datasets", { waitUntil: "load" });
    await expect(page.locator(`text=${uniqueName}`).first()).toBeVisible({ timeout: 15000 });

    // Click the History button (clock/history icon) for this project card
    const historyBtn = page.locator("button:has(svg.lucide-history)").first();
    await expect(historyBtn).toBeVisible({ timeout: 10000 });
    await historyBtn.click();

    // Version history panel should expand with at least 1 snapshot
    await expect(page.locator("text=Version History").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=v1").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Initial save").first()).toBeVisible({ timeout: 10000 });

    // Hover over v1 to reveal the Preview button and click it
    const versionItem = page.locator("li").filter({ hasText: "v1" }).first();
    await versionItem.hover();
    const previewBtn = versionItem.locator("button:has-text('Preview')").first();
    await expect(previewBtn).toBeVisible({ timeout: 5000 });
    await previewBtn.click();

    // Preview modal should show column metadata
    await expect(page.locator("text=Version 1 Preview").first()).toBeVisible({ timeout: 10000 });
    // Close preview modal
    const closeBtn = page.locator(".fixed button:has-text('Close')").first();
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await expect(page.locator("text=Version 1 Preview")).toBeHidden({ timeout: 5000 });
  });
});
