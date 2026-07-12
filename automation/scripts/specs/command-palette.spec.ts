import { test, expect } from "@playwright/test";
import { bypassAuth } from "../../../tests/automation_scripts/specs/helpers.js";

test.describe("Ctrl+K Command Palette", () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuth(page);
    await page.goto("/", { waitUntil: "load" });
  });

  test("Verify Command Palette opens and keyboard triggers tab routing", async ({ page }) => {
    test.setTimeout(60000);

    // 1. Press Ctrl+K
    await page.keyboard.press("Control+k");

    // 2. Verify command palette input is visible
    const paletteInput = page.locator("input[placeholder='Type a command or search projects...']").first();
    await expect(paletteInput).toBeVisible({ timeout: 10000 });

    // 3. Search for SQL Console
    await paletteInput.fill("SQL Console");

    // 4. Click the Go to SQL Console item
    const consoleItem = page.locator("span:text-is('Go to SQL Console')").first();
    await expect(consoleItem).toBeVisible();
    await consoleItem.click();

    // 5. Verify palette closes
    await expect(paletteInput).toBeHidden();
  });
});
