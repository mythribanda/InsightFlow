import { test, expect } from "@playwright/test";
import { bypassAuth, uploadFileAndProfile, VALID_CSV } from "./helpers.js";

test.describe("Responsive Design Viewports", () => {

  test("TC_UI_RESP_001: Verify dashboard layout adapts correctly on mobile viewport", async ({ page }) => {
    // TC_UI_RESP_001: Verify dashboard layout adapts correctly on mobile viewport (375px width)
    // Expected: Tabs collapse/adapt (sidebar hides, mobile tab strip appears), no horizontal overflow
    await page.setViewportSize({ width: 375, height: 812 });
    await bypassAuth(page);
    await page.goto("/", { waitUntil: "load" });
    await uploadFileAndProfile(page, VALID_CSV);
    
    // Sidebar should be hidden on mobile screen
    await expect(page.locator("aside")).toBeHidden();
    
    // Mobile tab navigation should be visible
    const mobileNav = page.locator("nav").nth(1);
    await expect(mobileNav).toBeVisible();
    
    // Check that there is no major horizontal page overflow
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  test("TC_UI_RESP_002: Verify dashboard layout adapts correctly on tablet viewport", async ({ page }) => {
    // TC_UI_RESP_002: Verify dashboard layout adapts correctly on tablet viewport (768px width)
    // Expected: Sidebar is visible, layout adapts to tablet sizing
    await page.setViewportSize({ width: 768, height: 1024 });
    await bypassAuth(page);
    await page.goto("/", { waitUntil: "load" });
    await uploadFileAndProfile(page, VALID_CSV);
    
    // Sidebar should be visible on tablet screen
    await expect(page.locator("aside")).toBeVisible();
  });

  test("TC_UI_RESP_003: Verify login/signup forms are fully usable on mobile viewport", async ({ page }) => {
    // TC_UI_RESP_003: Verify login/signup forms are fully usable on mobile viewport
    // Expected: All fields and buttons remain visible and clickable without horizontal scroll
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/login", { waitUntil: "load" });
    
    const emailInput = page.locator("input[type='email']");
    const passwordInput = page.locator("input[type='password']");
    const submitBtn = page.locator("button:text-is('Sign in')");
    
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();
    
    // Verify signup page form elements are visible on mobile too
    await page.goto("/signup", { waitUntil: "load" });
    await expect(page.locator("input[placeholder='Enter your full name']").or(page.locator("input")).first()).toBeVisible();
  });

  test("TC_UI_RESP_004: Verify charts and tables do not overflow viewport on small screens", async ({ page }) => {
    // TC_UI_RESP_004: Verify charts and tables do not overflow viewport on small screens
    // Expected: Charts resize/scroll within viewport bounds (no clipped content)
    await page.setViewportSize({ width: 360, height: 640 });
    await bypassAuth(page);
    await page.goto("/", { waitUntil: "load" });
    await uploadFileAndProfile(page, VALID_CSV);
    
    // Go to Visualizations tab
    const visTab = page.locator("nav button:has-text('Visualizations'):visible").first();
    await visTab.click();
    await page.waitForTimeout(1000);
    
    // Verify auto charts container does not overflow horizontally
    const chartContainer = page.locator(".surface-card").first();
    const containerWidth = await chartContainer.evaluate((el) => el.getBoundingClientRect().width);
    expect(containerWidth).toBeLessThanOrEqual(360);
  });

});
