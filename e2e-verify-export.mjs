import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = "http://localhost:8081";
const CSV_PATH = path.join(__dirname, "demo-employee-data.csv");
const TIMEOUT = 90_000;

(async () => {
  console.log("Launching Chromium browser...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT);

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

    const configureBtn = page.locator('button', { hasText: /Configure & Train/i });
    await configureBtn.click();
    console.log("  Navigated to configure page.");
    await page.waitForTimeout(1000);

    console.log("\n=== Step 6: Case 1 - Download Clean CSV with NO Exclusions ===");
    const downloadPromise1 = page.waitForEvent('download');
    await page.locator('button:has-text("Download Clean CSV")').click();
    const download1 = await downloadPromise1;
    const downloadPath1 = path.join(__dirname, "downloaded_clean_no_exclusions.csv");
    await download1.saveAs(downloadPath1);
    console.log("  ✅ Download completed: downloaded_clean_no_exclusions.csv");

    // Verify downloaded CSV
    const csvContent1 = fs.readFileSync(downloadPath1, "utf-8");
    const lines1 = csvContent1.split("\n").map(l => l.trim()).filter(Boolean);
    const headers1 = lines1[0].split(",");
    console.log("  Headers in Case 1:", headers1);

    if (!headers1.includes("employee_id")) {
      throw new Error("Case 1 validation failed: 'employee_id' should be present");
    }
    if (!headers1.includes("bonus")) {
      throw new Error("Case 1 validation failed: 'bonus' should be present");
    }

    // Check for nulls in rating (index of rating column)
    const ratingIdx1 = headers1.indexOf("rating");
    const ratingValues1 = lines1.slice(1).map(line => line.split(",")[ratingIdx1]);
    const missingRatings1 = ratingValues1.filter(val => !val || val.trim() === "");
    console.log(`  Case 1: Total rows = ${ratingValues1.length}, missing ratings = ${missingRatings1.length}`);
    if (missingRatings1.length > 0) {
      throw new Error("Case 1 validation failed: there are still missing ratings (imputation failed)");
    }

    console.log("\n=== Step 7: Case 2 - Exclude 'employee_id' and Download CSV ===");
    // Toggle/Click exclude employee_id
    const employeeIdBadge = page.locator('.cursor-pointer', { hasText: /^employee_id$/ }).first();
    await employeeIdBadge.click();
    console.log("  Clicked employee_id to exclude it.");
    await page.waitForTimeout(500);

    const downloadPromise2 = page.waitForEvent('download');
    await page.locator('button:has-text("Download Clean CSV")').click();
    const download2 = await downloadPromise2;
    const downloadPath2 = path.join(__dirname, "downloaded_clean_with_exclusions.csv");
    await download2.saveAs(downloadPath2);
    console.log("  ✅ Download completed: downloaded_clean_with_exclusions.csv");

    // Verify Case 2 downloaded CSV
    const csvContent2 = fs.readFileSync(downloadPath2, "utf-8");
    const lines2 = csvContent2.split("\n").map(l => l.trim()).filter(Boolean);
    const headers2 = lines2[0].split(",");
    console.log("  Headers in Case 2:", headers2);

    if (headers2.includes("employee_id")) {
      throw new Error("Case 2 validation failed: 'employee_id' should have been excluded");
    }
    if (!headers2.includes("bonus")) {
      throw new Error("Case 2 validation failed: 'bonus' should be present");
    }

    const ratingIdx2 = headers2.indexOf("rating");
    const ratingValues2 = lines2.slice(1).map(line => line.split(",")[ratingIdx2]);
    const missingRatings2 = ratingValues2.filter(val => !val || val.trim() === "");
    console.log(`  Case 2: Total rows = ${ratingValues2.length}, missing ratings = ${missingRatings2.length}`);
    if (missingRatings2.length > 0) {
      throw new Error("Case 2 validation failed: there are still missing ratings (imputation failed)");
    }

    // Close browser to free file locks
    await browser.close();
    console.log("  Browser closed.");

    // Clean up downloaded files
    try {
      if (fs.existsSync(downloadPath1)) fs.unlinkSync(downloadPath1);
      if (fs.existsSync(downloadPath2)) fs.unlinkSync(downloadPath2);
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
