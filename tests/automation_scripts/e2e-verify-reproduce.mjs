import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = "http://localhost:8080";
const CSV_PATH = path.join(__dirname, "..", "..", "demo-employee-data.csv");
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

    console.log("\n=== Step 3: Navigate to ML Models Tab ===");
    const modelTab = page.locator('button', { hasText: /ML Models/i }).first();
    await modelTab.click();
    await page.waitForTimeout(1000);

    console.log("\n=== Step 4: Select Target Column 'salary' ===");
    const selectTrigger = page.locator('button:has-text("Select target column...")').first();
    await selectTrigger.click();
    await page.waitForTimeout(500);
    const salaryOption = page.locator('[role="option"]:has-text("salary")').first();
    await salaryOption.click();

    console.log("\n=== Step 5: Run Suitability & Recommendations Check ===");
    const suitabilityBtn = page.locator('button', { hasText: /Feature Analysis/i });
    await suitabilityBtn.click();
    await page.waitForSelector('text=Feature Recommendations', { timeout: 20_000 });
    console.log("  Suitability and recommendations complete.");

    console.log("\n=== Step 6: Go to Configure & Train and Exclude 'employee_id' ===");
    const configureBtn = page.locator('button', { hasText: /Configure & Train/i });
    await configureBtn.click();
    await page.waitForTimeout(1000);

    // Exclude employee_id
    const employeeIdBadge = page.locator('.cursor-pointer', { hasText: /^employee_id$/ }).first();
    await employeeIdBadge.click();
    console.log("  Excluded employee_id.");
    await page.waitForTimeout(500);

    console.log("\n=== Step 7: Train Models ===");
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
    await page.waitForTimeout(1000);

    console.log("\n=== Step 8: Download Reproduction Code ===");
    const downloadPromise = page.waitForEvent('download');
    // Click the Reproduction Code button
    await page.locator('button:has-text("Reproduction Code")').first().click();
    const download = await downloadPromise;
    const downloadPath = path.join(__dirname, "reproduce.py");
    await download.saveAs(downloadPath);
    console.log("  ✅ Saved reproduction code to reproduce.py");

    // Close browser to free file locks
    await browser.close();
    console.log("  Browser closed.");

    console.log("\n=== Step 9: Verify contents of reproduce.py ===");
    const scriptContent = fs.readFileSync(downloadPath, "utf-8");
    
    // Check comments
    if (!scriptContent.includes("Target Column: salary")) {
      throw new Error("Validation Failed: Target column comment not found in reproduce.py");
    }
    if (!scriptContent.includes("employee_id: User-excluded column") && !scriptContent.includes("employee_id: ID-like")) {
      throw new Error("Validation Failed: employee_id exclusion comment not found in reproduce.py");
    }
    
    // Check for ColumnTransformer structure
    if (!scriptContent.includes("ColumnTransformer") || !scriptContent.includes("SimpleImputer(strategy=\"median\")") || !scriptContent.includes("OneHotEncoder")) {
      throw new Error("Validation Failed: ColumnTransformer or imputer/encoder structure mismatch in reproduce.py");
    }
    console.log("  ✅ Verification of script file contents successful!");

    console.log("\n=== Step 10: Run reproduce.py Standalone ===");
    const pythonPath = path.join(__dirname, "..", "..", "backend", "venv", "Scripts", "python.exe");
    const cmd = `"${pythonPath}" reproduce.py ../../demo-employee-data.csv`;
    console.log(`  Executing: ${cmd}`);
    
    // Clean up any old image files if they exist
    const filesToClean = ["target_distribution.png", "feature_vs_target_age.png", "feature_vs_target_experience.png"];
    for (const f of filesToClean) {
      if (fs.existsSync(path.join(__dirname, f))) {
        fs.unlinkSync(path.join(__dirname, f));
      }
    }

    const runOutput = execSync(cmd, { encoding: "utf-8", cwd: __dirname });
    console.log("  Script execution stdout:");
    console.log(runOutput);

    // Confirm that target_distribution.png exists
    const plot1 = path.join(__dirname, "target_distribution.png");
    if (!fs.existsSync(plot1)) {
      throw new Error("Validation Failed: target_distribution.png was not generated!");
    }
    console.log("  ✅ Verified: target_distribution.png generated.");

    // Check if at least one feature vs target plot was generated
    const hasFeaturePlot = filesToClean.some(f => f !== "target_distribution.png" && fs.existsSync(path.join(__dirname, f)));
    if (!hasFeaturePlot) {
      throw new Error("Validation Failed: No feature vs target plot (e.g. feature_vs_target_*.png) was generated!");
    }
    console.log("  ✅ Verified: Feature-vs-target plot generated.");

    console.log("\n=== ALL REPRODUCTION CODE E2E VERIFICATIONS PASSED SUCCESSFULLY! ===");
    process.exit(0);

  } catch (err) {
    console.error("\n❌ E2E REPRODUCTION CODE VERIFICATION FAILED:", err);
    try {
      await browser.close();
    } catch (_) {}
    process.exit(1);
  }
})();
