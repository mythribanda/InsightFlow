import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = "http://localhost:8081";
const CSV_PATH = path.join(__dirname, "..", "..", "demo-employee-data.csv");
const TIMEOUT = 90_000;

(async () => {
  console.log("Launching Chromium browser...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT);

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

  // Log browser console messages and errors
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => console.log(`[BROWSER ERROR] ${err.message}`));

  try {
    console.log("\n=== Step 1: Navigate to InsightFlow App ===");
    await page.goto(APP_URL, { waitUntil: "networkidle" });
    console.log("  Page loaded title:", await page.title());

    console.log("\n=== Step 2: Upload demo-employee-data.csv ===");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(CSV_PATH);
    console.log("  File uploaded. Waiting for initial analysis...");

    await page.waitForFunction(() => {
      const body = document.body.innerText;
      return body.includes("Profiling") || body.includes("trust") || body.includes("Anomalies");
    }, { timeout: 30_000 });
    console.log("  Initial profiling complete.");

    console.log("\n=== Step 3: Navigate to Calculated Columns Tab ===");
    const calcTab = page.locator('button', { hasText: /Calculated Cols/i }).first();
    await calcTab.click();
    console.log("  Clicked Calculated Cols tab.");
    await page.waitForTimeout(1000);

    console.log("\n=== Step 4: Create Calculated Column 'bonus' ===");
    await page.locator('[placeholder="e.g. bonus"]').fill("bonus");
    const formulaInput = page.locator('[placeholder="e.g. ROUND(salary * 0.1, 2)"]');
    await formulaInput.fill("ROUND(salary * 0.1, 2)");
    const createBtn = page.locator('button', { hasText: /Create Column/i });
    await createBtn.click();
    await page.waitForSelector('text=Created Successfully', { timeout: 15_000 });
    console.log("  Calculated column 'bonus' created successfully.");

    console.log("\n=== Step 5: Navigate to ML Models and Select Target ===");
    const modelTab = page.locator('button', { hasText: /ML Models/i }).first();
    await modelTab.click();
    await page.waitForTimeout(1000);

    const selectTrigger = page.locator('button:has-text("Select target column...")').first();
    await selectTrigger.click();
    await page.waitForTimeout(500);
    const bonusOption = page.locator('[role="option"]:has-text("bonus")').first();
    await bonusOption.click();

    const suitabilityBtn = page.locator('button', { hasText: /Feature Analysis/i });
    await suitabilityBtn.click();
    await page.waitForSelector('text=Feature Recommendations', { timeout: 20_000 });
    console.log("  Suitability checked.");

    console.log("\n=== Step 6: Navigate to Profiling Tab & Download Clean CSV ===");
    const profilingTab = page.locator('button', { hasText: /Profiling/i }).first();
    await profilingTab.click();
    console.log("  Clicked Profiling tab.");
    await page.waitForTimeout(1000);

    const downloadPromise1 = page.waitForEvent('download');
    await page.locator('button:has-text("Download Preprocessed")').click();
    const download1 = await downloadPromise1;
    const downloadPath1 = path.join(__dirname, "downloaded_clean_no_exclusions.csv");
    await download1.saveAs(downloadPath1);
    console.log("  ✅ Download completed: downloaded_clean_no_exclusions.csv");

    // Verify downloaded CSV
    const csvContent1 = fs.readFileSync(downloadPath1, "utf-8");
    const lines1 = csvContent1.split("\n").map(l => l.trim()).filter(Boolean);
    const headers1 = lines1[0].split(",");
    console.log("  Headers in downloaded CSV:", headers1);

    if (!headers1.includes("employee_id")) {
      throw new Error("Validation failed: 'employee_id' should be present");
    }
    if (!headers1.includes("bonus")) {
      throw new Error("Validation failed: 'bonus' should be present");
    }

    // Check for nulls in rating (index of rating column)
    const ratingIdx1 = headers1.indexOf("rating");
    const ratingValues1 = lines1.slice(1).map(line => line.split(",")[ratingIdx1]);
    const missingRatings1 = ratingValues1.filter(val => !val || val.trim() === "");
    console.log(`  Total rows = ${ratingValues1.length}, missing ratings = ${missingRatings1.length}`);
    if (missingRatings1.length > 0) {
      throw new Error("Validation failed: there are still missing ratings (imputation failed)");
    }

    // Close browser to free file locks
    await browser.close();
    console.log("  Browser closed.");

    // Clean up downloaded files
    try {
      if (fs.existsSync(downloadPath1)) fs.unlinkSync(downloadPath1);
      console.log("  Cleaned up temporary downloaded files.");
    } catch (cleanupErr) {
      console.log("  Warning: failed to clean up temporary CSV files:", cleanupErr.message);
    }

    console.log("\n=== E2E CSV EXPORT VERIFICATION COMPLETED SUCCESSFULLY! ===");
    process.exit(0);

  } catch (err) {
    console.error("\n❌ E2E CSV EXPORT VERIFICATION FAILED:", err);
    await browser.close();
    process.exit(1);
  }
})();
