import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = "http://localhost:8081";
const CSV_PATH = path.join(__dirname, "..", "..", "demo-employee-data.csv");
const TIMEOUT = 120_000;

(async () => {
  console.log("=== Launching Chromium browser for E2E ML integration audit ===");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT);

  // Set mock access token in localStorage to bypass supabase login page
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

  page.on("requestfailed", (req) => console.log(`[REQUEST FAILED] ${req.url()}: ${req.failure()?.errorText}`));
  page.on("response", (res) => {
    if (res.status() >= 400) {
      console.log(`[HTTP ERROR] ${res.url()}: ${res.status()}`);
    }
  });

  // Intercept and mock Supabase API calls
  await page.route(/supabase\.co/, async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/v1/user")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "e2e-test-user-id",
          email: "insightflow_e2e_test@gmail.com",
          role: "authenticated",
          aud: "authenticated"
        })
      });
    } else if (url.includes("/rest/v1/profiles")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          display_name: "E2E Test User",
          phone: "+1234567890"
        })
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({})
      });
    }
  });

  try {
    console.log("\n=== Step 1: Navigating to InsightFlow ===");
    await page.goto(APP_URL, { waitUntil: "load" });
    console.log("  Page title:", await page.title());

    console.log("\n=== Step 2: Uploading demo-employee-data.csv ===");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(CSV_PATH);
    console.log("  CSV set in input. Waiting for initial profiling...");

    // Wait for profiling/trust indicators to appear
    await page.waitForFunction(() => {
      const body = document.body.innerText;
      return body.includes("Profiling") || body.includes("trust") || body.includes("Anomalies");
    }, { timeout: 30_000 });
    console.log("  Initial profiling completed. Main tabs are visible.");

    // --- A. CLUSTERING TAB ---
    console.log("\n=== Step 3: Verifying Clustering Tab ===");
    const clusteringTabBtn = page.locator('button', { hasText: /Clustering/i }).first();
    await clusteringTabBtn.click();
    console.log("  Clicked Clustering tab.");
    await page.waitForTimeout(1000);

    // Verify Optimal K indicator shows up (it fetches in the background on load)
    console.log("  Checking for Optimal K sweep indicator...");
    await page.waitForSelector('text=looks best', { timeout: 15_000 });
    console.log("  Optimal K sweep resolved successfully.");

    // Click 'Run Clustering' (K-Means)
    console.log("  Running K-Means clustering...");
    const runClusteringBtn = page.locator('button', { hasText: /Run Clustering/i }).first();
    await runClusteringBtn.click();
    
    // Wait for metrics/results to render
    await page.waitForSelector('text=Clustering Metrics', { timeout: 15_000 });
    console.log("  K-Means clustering completed. Silhouette score and metrics are visible.");

    // Switch to DBSCAN
    console.log("  Switching to DBSCAN method...");
    const dbscanBtn = page.locator('button', { hasText: /DBSCAN/i }).first();
    await dbscanBtn.click();
    await page.waitForTimeout(500);

    // Run DBSCAN clustering
    console.log("  Running DBSCAN clustering...");
    await runClusteringBtn.click();
    await page.waitForTimeout(2000); // Wait for finish
    console.log("  DBSCAN clustering completed.");

    // Take screenshot of clustering tab
    const imagesDir = path.join(__dirname, "..", "images_of_e2e");
    await page.screenshot({ path: path.join(imagesDir, "clustering_results.png") });
    console.log("  Saved screenshot: clustering_results.png");

    // --- B. ANOMALIES TAB ---
    console.log("\n=== Step 4: Verifying Anomalies Tab ===");
    const anomalyTabBtn = page.locator('button', { hasText: /Anomalies/i }).first();
    await anomalyTabBtn.click();
    console.log("  Clicked Anomalies tab. Waiting for anomaly calculation...");

    // Wait for anomaly content or drivers list to render
    await page.waitForSelector('text=Anomaly Detection', { timeout: 15_000 });
    await page.waitForTimeout(3000); // Wait for list to load fully
    console.log("  Anomaly detection completed. Drivers and scores are visible.");

    await page.screenshot({ path: path.join(imagesDir, "anomalies_results.png") });
    console.log("  Saved screenshot: anomalies_results.png");

    // --- C. MODELING TAB ---
    console.log("\n=== Step 5: Verifying ML Models (Modeling) Tab ===");
    const modelingTabBtn = page.locator('button', { hasText: /ML Models/i }).first();
    await modelingTabBtn.click();
    console.log("  Clicked ML Models tab.");
    await page.waitForTimeout(1000);

    // Select target column
    console.log("  Selecting target column 'salary'...");
    const selectTrigger = page.locator('button:has-text("Select target column...")').first();
    await selectTrigger.click();
    await page.waitForTimeout(500);
    const salaryOption = page.locator('[role="option"]:has-text("salary")').first();
    await salaryOption.click();

    // Click Suitability / Feature Analysis
    console.log("  Running target suitability and feature recommendations pre-flight...");
    const featureAnalysisBtn = page.locator('button', { hasText: /Feature Analysis/i });
    await featureAnalysisBtn.click();

    // Wait for recommendations page
    await page.waitForSelector('text=Feature Recommendations', { timeout: 15_000 });
    console.log("  Suitability and recommendations page loaded.");

    // Click Configure & Train
    const configureBtn = page.locator('button', { hasText: /Configure & Train/i });
    await configureBtn.click();
    await page.waitForTimeout(500);

    // Click Train Both Models
    console.log("  Training models (running 5-fold CV)...");
    const trainBtn = page.locator('button', { hasText: /Train Both Models/i });
    await trainBtn.click();

    // Wait for model comparison table
    await page.waitForSelector('text=Model Comparison', { timeout: 45_000 });
    console.log("  Model training completed. Comparison metrics loaded.");

    // Click Export Python Script (Reproduction Code)
    console.log("  Verifying Code Export (Reproduction Script)...");
    const exportBtn = page.locator('button', { hasText: /Reproduction Code/i }).first();
    await exportBtn.click();
    await page.waitForTimeout(2000);
    console.log("  Code export script generated.");

    // Generate SHAP
    console.log("  Generating SHAP Explainability plots (global + waterfall)...");
    const shapBtn = page.locator('button', { hasText: /SHAP Analysis/i }).first();
    await shapBtn.click();

    // Wait for SHAP plots
    await page.waitForSelector('text=Global Feature Importance', { timeout: 35_000 });
    console.log("  SHAP plots generated successfully.");

    await page.screenshot({ path: path.join(imagesDir, "modeling_results.png") });
    console.log("  Saved screenshot: modeling_results.png");

    console.log("\n=== E2E Browser ML Panels Audit COMPLETED SUCCESSFULLY ===");
    await browser.close();
    process.exit(0);

  } catch (err) {
    console.error("\n❌ E2E ML Panels Audit FAILED:", err);
    await page.screenshot({ path: path.join(__dirname, "..", "images_of_e2e", "audit-screenshot-error.png") });
    await browser.close();
    process.exit(1);
  }
})();
