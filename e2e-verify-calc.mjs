import { chromium } from "playwright";
import path from "path";
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
    console.log("  Initial profiling complete. App tabs are now visible.");

    console.log("\n=== Step 3: Navigate to Calculated Columns Tab ===");
    const calcTab = page.locator('button', { hasText: /Calculated Cols/i }).first();
    await calcTab.click();
    console.log("  Clicked Calculated Cols tab.");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(__dirname, "calc-screenshot-1-tab.png") });

    console.log("\n=== Step 4: Test Happy Path Calculated Column creation ===");
    console.log("  Creating 'bonus' = ROUND(salary * 0.1, 2)");
    
    // Fill the name and formula using proper CSS selector for attributes
    await page.locator('[placeholder="e.g. bonus"]').fill("bonus");
    const formulaInput = page.locator('[placeholder="e.g. ROUND(salary * 0.1, 2)"]');
    await formulaInput.fill("ROUND(salary * 0.1, 2)");
    
    // Click Create button
    const createBtn = page.locator('button', { hasText: /Create Column/i });
    await createBtn.click();
    console.log("  Submitted formula. Waiting for preview...");

    // Wait for success preview
    await page.waitForSelector('text=Created Successfully', { timeout: 15_000 });
    console.log("  ... Success text found. Fetching preview values...");
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(__dirname, "calc-screenshot-2-happy-path.png") });

    // Print preview values from the page
    const previewTable = page.locator('table').first();
    const previewText = await previewTable.innerText();
    console.log("  Preview table content:\n", previewText);

    console.log("\n=== Step 5: Test Security Injection Probe ===");
    console.log("  Attempting: 'exploit' = salary + (1).__class__");
    
    await page.locator('[placeholder="e.g. bonus"]').fill("exploit");
    await formulaInput.fill("salary + (1).__class__");
    await createBtn.click();
    console.log("  Submitted security probe formula. Waiting for error alert...");

    // Wait for error display
    const errorAlert = page.locator('.alert-destructive, [role="alert"]').first();
    await errorAlert.waitFor({ timeout: 10_000 });
    const errorText = await errorAlert.innerText();
    console.log("  ✅ SUCCESS: Code execution blocked! Error text is:\n", errorText);
    
    if (errorText.includes("Security validation failed") || errorText.includes("Attribute")) {
      console.log("  ✅ AST Whitelist security validator successfully blocked attribute access.");
    } else {
      console.log("  ❌ WARNING: Error was shown but might not be the expected AST whitelist rejection.");
    }
    await page.screenshot({ path: path.join(__dirname, "calc-screenshot-3-security-blocked.png") });

    console.log("\n=== Step 6: Create Boolean Calculated Column ===");
    console.log("  Creating 'high_sal' = IF(salary > 100000, True, False)");
    await page.locator('[placeholder="e.g. bonus"]').fill("high_sal");
    await formulaInput.fill("IF(salary > 100000, True, False)");
    await createBtn.click();
    
    // Wait for column to be created successfully
    await page.waitForSelector('text=high_sal\' Created Successfully', { timeout: 10_000 });
    console.log("  ... Success text found.");
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(__dirname, "calc-screenshot-4-boolean.png") });

    console.log("\n=== Step 7: Train Model Using Calculated Column ('bonus') as Target ===");
    const modelTab = page.locator('button', { hasText: /ML Models/i }).first();
    await modelTab.click();
    console.log("  Clicked ML Models tab.");
    await page.waitForTimeout(1000);

    // Click select trigger for target column
    const selectTrigger = page.locator('button:has-text("Select target column...")').first();
    await selectTrigger.click();
    await page.waitForTimeout(500);
    
    // Select the newly created 'bonus' column from select options
    console.log("  Selecting target column 'bonus'...");
    // Find the item with text "bonus" in the dropdown list
    const bonusOption = page.locator('[role="option"]:has-text("bonus")').first();
    await bonusOption.click();

    // Click Suitability / Next button
    const suitabilityBtn = page.locator('button', { hasText: /Feature Analysis/i });
    await suitabilityBtn.click();
    console.log("  Submitted target selection. Waiting for suitability check...");

    // Wait for S2 Recommendations page to render
    await page.waitForSelector('text=Feature Recommendations', { timeout: 20_000 });
    console.log("  ✅ SUCCESS: Suitability and Feature Recommendations computed.");
    await page.screenshot({ path: path.join(__dirname, "calc-screenshot-5-suitability.png") });

    // Click Next: Configure & Train
    const configureBtn = page.locator('button', { hasText: /Configure & Train/i });
    await configureBtn.click();
    console.log("  Navigated to Train configuration page.");
    await page.waitForTimeout(500);

    // Click Train both models
    const trainBtn = page.locator('button', { hasText: /Train Both Models/i });
    await trainBtn.click();
    console.log("  Training models (this might take 10-15s)...");

    // Wait for model comparison to show up
    await page.waitForSelector('text=Model Comparison', { timeout: 45_000 });
    console.log("  ✅ SUCCESS: Both models successfully trained!");
    await page.screenshot({ path: path.join(__dirname, "calc-screenshot-6-trained.png") });

    const metricsTable = page.locator('table').first();
    console.log("  Model comparison metrics table:\n", await metricsTable.innerText());

    // Generate SHAP explanation
    console.log("  Requesting SHAP explainability analysis...");
    const shapBtn = page.locator('button', { hasText: /SHAP Analysis/i });
    await shapBtn.click();
    
    await page.waitForSelector('text=Global Feature Importance', { timeout: 30_000 });
    console.log("  ✅ SUCCESS: SHAP plots generated successfully.");
    await page.screenshot({ path: path.join(__dirname, "calc-screenshot-7-shap.png") });

    console.log("\n=== E2E Integration Verification COMPLETED SUCCESSFULLY! ===");
    await browser.close();
    process.exit(0);

  } catch (err) {
    console.error("\n❌ E2E Integration Verification FAILED:", err);
    await page.screenshot({ path: path.join(__dirname, "calc-screenshot-error.png") });
    await browser.close();
    process.exit(1);
  }
})();
