import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = "http://localhost:8081/login";
const TIMEOUT = 15_000;

(async () => {
  console.log("=== Step 1: Launching Browser & Navigating to /login ===");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT);

  // Log browser console messages and errors
  page.on("console", (msg) => console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (err) => console.log(`[BROWSER ERROR] ${err.message}`));

  try {
    await page.goto(APP_URL, { waitUntil: "networkidle" });
    console.log("  Page title:", await page.title());

    // Check if card title exists
    const title = await page.locator("h1").innerText();
    console.log("  Branding header text:", title);

    await page.screenshot({ path: path.join(__dirname, "..", "images_of_e2e", "login-screenshot-1-loaded.png") });

    console.log("\n=== Step 2: Testing Google OAuth (Unconfigured Provider) ===");
    // Click Google Login
    const googleBtn = page.locator("button:has-text('Continue with Google')");
    await googleBtn.click();
    console.log("  Clicked 'Continue with Google'");

    // Wait a couple of seconds for OAuth attempt to complete and display the error
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(__dirname, "..", "images_of_e2e", "login-screenshot-2-google-error.png") });

    let bodyText = await page.locator("body").innerText();
    if (bodyText.includes("Authentication Error") || bodyText.includes("error") || bodyText.includes("failed")) {
      console.log("  ✅ SUCCESS: Clear OAuth error displayed inline!");
      const errorAlert = page.locator(".bg-destructive\\/15, [role='alert'], .text-destructive");
      if (await errorAlert.count() > 0) {
        console.log("  Error message content:\n   ", (await errorAlert.first().innerText()).replace(/\n/g, " | "));
      }
    } else {
      console.log("  ❌ FAILED: No visible OAuth error found in body.");
    }

    console.log("\n=== Step 3: Testing OTP Request & Wrong Code Validation ===");
    // Reload page to clear states
    await page.goto(APP_URL, { waitUntil: "networkidle" });

    // Enter a dummy email and submit
    const emailInput = page.locator("input[type='email']");
    await emailInput.fill("insightflow_e2e_test@gmail.com");
    console.log("  Filled email input: 'insightflow_e2e_test@gmail.com'");

    const submitEmailBtn = page.locator("button:has-text('Send Login Code')");
    await submitEmailBtn.click();
    console.log("  Clicked 'Send Login Code'");

    // Wait for the verification code step
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(__dirname, "..", "images_of_e2e", "login-screenshot-3-otp-step.png") });

    bodyText = await page.locator("body").innerText();
    if (bodyText.includes("Confirm your email") || bodyText.includes("Verify")) {
      console.log("  ✅ SUCCESS: Transitioned to OTP verification step!");

      // Enter an incorrect 6-digit code
      const codeInput = page.locator("input[placeholder='123456']");
      await codeInput.fill("999999");
      console.log("  Filled incorrect code: '999999'");

      const verifyBtn = page.locator("button:has-text('Verify & Login')");
      await verifyBtn.click();
      console.log("  Clicked 'Verify & Login'");

      // Wait for validation error to display
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(__dirname, "..", "images_of_e2e", "login-screenshot-4-otp-error.png") });

      const verifyBodyText = await page.locator("body").innerText();
      if (verifyBodyText.includes("Authentication Error") || verifyBodyText.includes("Invalid") || verifyBodyText.includes("expired") || verifyBodyText.includes("error")) {
        console.log("  ✅ SUCCESS: Correctly displayed invalid OTP code error!");
        const errorAlert = page.locator("[role='alert']");
        if (await errorAlert.count() > 0) {
          console.log("  Error message content:\n   ", (await errorAlert.first().innerText()).replace(/\n/g, " | "));
        }
      } else {
        console.log("  ❌ FAILED: No error message displayed for invalid OTP.");
      }
    } else {
      console.log("  ❌ FAILED: Did not transition to verification screen after submitting email.");
    }

  } catch (err) {
    console.error("  ❌ TEST FAILED WITH EXCEPTION:", err);
  } finally {
    await browser.close();
    console.log("\n=== Done ===");
  }
})();
