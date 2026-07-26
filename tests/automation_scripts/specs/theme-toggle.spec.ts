import { test, expect } from "@playwright/test";
import { bypassAuth } from "./helpers.js";

test.describe("Theme Toggle Component", () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuth(page);
    await page.goto("/", { waitUntil: "load" });
  });

  test("Verify theme toggle updates HTML data-theme and classList attributes", async ({ page }) => {
    test.setTimeout(60000);

    const html = page.locator("html");
    
    // 1. Locate theme toggle button in header
    const toggleBtn = page.locator("button[title*='Switch to']").first();
    await expect(toggleBtn).toBeVisible({ timeout: 15000 });

    const initialTheme = await html.getAttribute("data-theme");
    const initialDarkClass = await html.evaluate(el => el.classList.contains("dark"));

    // 2. Click the toggle
    await toggleBtn.click();

    // 3. Verify values updated/toggled
    const toggledTheme = await html.getAttribute("data-theme");
    const toggledDarkClass = await html.evaluate(el => el.classList.contains("dark"));

    expect(toggledTheme).not.toBe(initialTheme);
    expect(toggledDarkClass).not.toBe(initialDarkClass);
  });
});
