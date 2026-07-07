import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = "http://localhost:8080";
const FIXTURES_DIR = path.join(__dirname, "fixtures");
const IMAGES_DIR = path.join(__dirname, "..", "images_of_e2e");

const BALANCED_CSV_PATH = path.join(FIXTURES_DIR, "balanced_multiclass.csv");
const RARE_CSV_PATH = path.join(FIXTURES_DIR, "rare_multiclass.csv");
const TIMEOUT = 90_000;

// Helper to run a test for a CSV file
async function runMulticlassTest(csvPath, testName, screenshotPrefix) {
  console.log(`\n========================================`);
  console.log(`Starting Test Case: ${testName}`);
  console.log(`Using CSV: ${csvPath}`);
  console.log(`========================================`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT);

  // Mock profiles REST API to return user metadata
  await page.route("**/rest/v1/profiles*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "e2e-test-user-id",
        display_name: "E2E Test User",
        phone: "1234567890",
        email: "insightflow_e2e_test@gmail.com"
      })
    });
  });

  // Mock Supabase Auth user endpoint to return user session payload
  await page.route("**/auth/v1/user", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "e2e-test-user-id",
        email: "insightflow_e2e_test@gmail.com",
        role: "authenticated",
        aud: "authenticated",
        app_metadata: { provider: "email" },
        user_metadata: {}
      })
    });
  });

  await page.addInitScript(() => {
    window.localStorage.setItem(
      "sb-jnweqizsbcagcczcvqwy-auth-token",
      JSON.stringify({
        access_token: "mock-access-token",
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "mock-refresh-token",
        user: {
          id: "e2e-test-user-id",
          email: "insightflow_e2e_test@gmail.com",
          role: "authenticated",
          aud: "authenticated"
        },
        expires_at: Math.floor(Date.now() / 1000) + 3600
      })
    );
  });

  const errors = [];
  const consoleLogs = [];

  // Log browser console messages and errors
  page.on("console", (msg) => {
    const text = msg.text();
    consoleLogs.push(`[${msg.type().toUpperCase()}] ${text}`);
    if (msg.type() === "error") {
      errors.push(text);
      console.log(`[BROWSER CONSOLE ERROR] ${text}`);
    } else {
      console.log(`[BROWSER CONSOLE] ${msg.type()}: ${text}`);
    }
  });
  page.on("pageerror", (err) => {
    errors.push(err.message);
    console.log(`[BROWSER ERROR] ${err.message}`);
  });

  // Log backend network responses for API debugging
  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/model/") || url.includes("/shap/")) {
      try {
        const text = await response.text();
        console.log(`[API RESPONSE] ${url} -> ${response.status()} -> ${text.substring(0, 800)}`);
      } catch (err) {
        console.log(`[API RESPONSE ERROR] ${url} -> ${response.status()} -> failed to read text: ${err.message}`);
      }
    }
  });

  try {
    console.log("=== Step 1: Navigate to InsightFlow App ===");
    await page.goto(APP_URL, { waitUntil: "load" });
    console.log("  Page loaded title:", await page.title());
    
    // Wait for the file input to be attached and visible
    await page.waitForSelector('input[type="file"]', { timeout: 15000 });

    console.log("=== Step 2: Upload CSV ===");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(csvPath);
    console.log("  File uploaded. Waiting for initial analysis...");

    await page.waitForFunction(() => {
      const body = document.body.innerText;
      return body.includes("Profiling") || body.includes("trust") || body.includes("Anomalies");
    }, { timeout: 30_000 });
    console.log("  Initial profiling complete.");

    console.log("=== Step 3: Navigate to ML Models Tab ===");
    const modelTab = page.locator('button', { hasText: /ML Models/i }).first();
    await modelTab.click();
    await page.waitForTimeout(1000);

    console.log("=== Step 4: Select Target Column 'target' ===");
    const selectTrigger = page.locator('button:has-text("Select target column...")').first();
    await selectTrigger.click();
    await page.waitForTimeout(500);
    const targetOption = page.locator('[role="option"]:has-text("target")').first();
    await targetOption.click();

    console.log("=== Step 5: Run Suitability Check ===");
    const suitabilityBtn = page.locator('button', { hasText: /Feature Analysis/i });
    await suitabilityBtn.click();
    await page.waitForSelector('text=Feature Recommendations', { timeout: 20_000 });
    console.log("  Suitability and recommendations complete.");

    console.log("=== Step 6: Go to Configure & Train and Exclude 'id' ===");
    const configureBtn = page.locator('button', { hasText: /Configure & Train/i });
    await configureBtn.click();
    await page.waitForTimeout(1000);

    // Exclude id
    const idBadge = page.locator('.cursor-pointer', { hasText: /^id/i }).first();
    await idBadge.click();
    console.log("  Excluded id.");
    await page.waitForTimeout(500);

    console.log("=== Step 7: Train Models ===");
    const trainBtn = page.locator('button', { hasText: /Train Both Models/i });
    await trainBtn.click();

    // Wait for the mutation to succeed and change tab to 'comparison'
    console.log("  Waiting for training to complete...");
    await page.waitForFunction(() => {
      const tabs = document.querySelectorAll('[role="tab"]');
      const activeTab = Array.from(tabs).find(tab => tab.getAttribute('aria-selected') === 'true');
      return activeTab?.textContent?.includes("Compare") || document.body.innerText.includes("Model Comparison");
    }, { timeout: 60_000 });
    console.log("  Training complete. Navigated to Comparison tab.");
    await page.waitForTimeout(2000);

    // Take screenshot of Model Comparison tab
    const resultsScreenshotPath = path.join(IMAGES_DIR, `${screenshotPrefix}-results.png`);
    await page.screenshot({ path: resultsScreenshotPath });
    console.log(`  Saved comparison screenshot to ${resultsScreenshotPath}`);

    // Verify if fold coverage text exists on comparison tab
    const bodyText = await page.locator("body").innerText();
    const hasFoldCoverage = bodyText.includes("cv:") || bodyText.includes("Coverage:");
    console.log(`  Fold coverage text present in UI: ${hasFoldCoverage}`);

    console.log("=== Step 8: Trigger SHAP Analysis ===");
    // Click on the SHAP button
    const shapBtn = page.locator('button', { hasText: /SHAP Analysis →/i });
    await shapBtn.click();

    console.log("  Waiting for SHAP analysis...");
    await page.waitForSelector('text=Global Feature Importance', { timeout: 30_000 });
    await page.waitForTimeout(2000);

    // Take screenshot of SHAP Explainability tab
    const shapScreenshotPath = path.join(IMAGES_DIR, `${screenshotPrefix}-shap.png`);
    await page.screenshot({ path: shapScreenshotPath });
    console.log(`  Saved SHAP screenshot to ${shapScreenshotPath}`);

    // Verify SHAP images
    const images = await page.locator('img').all();
    let globalImportanceImgFound = false;
    let waterfallImgFound = false;

    for (const img of images) {
      const src = await img.getAttribute("src");
      const alt = await img.getAttribute("alt");
      if (src && src.startsWith("data:image/png;base64,")) {
        if (alt === "Global importance") {
          globalImportanceImgFound = true;
        } else if (alt === "Per-sample waterfall") {
          waterfallImgFound = true;
        }
      }
    }

    console.log(`  Global Feature Importance image found: ${globalImportanceImgFound}`);
    console.log(`  Per-Sample Waterfall image found: ${waterfallImgFound}`);

    await browser.close();

    return {
      success: true,
      hasFoldCoverage,
      globalImportanceImgFound,
      waterfallImgFound,
      errors
    };

  } catch (err) {
    console.error(`❌ Test failed with exception:`, err);
    try {
      await browser.close();
    } catch (_) {}
    return {
      success: false,
      errors: [err.message],
      hasFoldCoverage: false,
      globalImportanceImgFound: false,
      waterfallImgFound: false
    };
  }
}

(async () => {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const balancedResult = await runMulticlassTest(BALANCED_CSV_PATH, "Balanced Multiclass Target", "balanced-multiclass");
  const rareResult = await runMulticlassTest(RARE_CSV_PATH, "Rare-Class Multiclass Target", "rare-multiclass");

  console.log("\n========================================");
  console.log("TEST SUMMARY REPORT");
  console.log("========================================");
  console.log("Balanced Multiclass Target:");
  console.log(`  Success: ${balancedResult.success}`);
  console.log(`  Fold Coverage Displayed: ${balancedResult.hasFoldCoverage}`);
  console.log(`  Global Importance SHAP plot: ${balancedResult.globalImportanceImgFound}`);
  console.log(`  Waterfall SHAP plot: ${balancedResult.waterfallImgFound}`);
  console.log(`  Unhandled Console Errors count: ${balancedResult.errors.length}`);

  console.log("Rare-Class Multiclass Target:");
  console.log(`  Success: ${rareResult.success}`);
  console.log(`  Fold Coverage Displayed: ${rareResult.hasFoldCoverage}`);
  console.log(`  Global Importance SHAP plot: ${rareResult.globalImportanceImgFound}`);
  console.log(`  Waterfall SHAP plot: ${rareResult.waterfallImgFound}`);
  console.log(`  Unhandled Console Errors count: ${rareResult.errors.length}`);

  const hasFailed = !balancedResult.success || !rareResult.success ||
                    !balancedResult.globalImportanceImgFound || !balancedResult.waterfallImgFound ||
                    !rareResult.globalImportanceImgFound || !rareResult.waterfallImgFound ||
                    balancedResult.errors.length > 0 || rareResult.errors.length > 0;

  if (hasFailed) {
    console.log("\n❌ SOME TESTS OR CHECKS FAILED!");
    process.exit(1);
  } else {
    console.log("\n✅ ALL TESTS AND CHECKS PASSED SUCCESSFULLY!");
    process.exit(0);
  }
})();
