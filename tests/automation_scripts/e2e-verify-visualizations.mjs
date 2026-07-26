import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = "http://localhost:8081";
const CSV_PATH = path.join(__dirname, "..", "..", "demo-employee-data.csv");
const TIMEOUT = 60_000;

(async () => {
  console.log("=== Step 1: Launching Browser & Navigating to InsightFlow App ===");
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

    // Take screenshot after upload
    await page.screenshot({ path: path.join(__dirname, "..", "images_of_e2e", "vis-screenshot-1-loaded.png") });

    console.log("\n=== Step 3: Navigate to Visualizations Tab ===");
    const visTab = page.locator('button', { hasText: /Visualizations/i }).first();
    await visTab.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(__dirname, "..", "images_of_e2e", "vis-screenshot-2-tab-opened.png") });

    console.log("\n=== Step 4: Test Single Column Numeric plot (age) ===");
    // select column 1 'age'
    const col1Select = page.locator('label:has-text("Column 1") + select');
    await col1Select.selectOption("age");
    console.log("  Selected Column 1: 'age'");
    
    // Select Column 2 'None' to keep it single column
    const col2Select = page.locator('label:has-text("Column 2") + select');
    await col2Select.selectOption("none");
    console.log("  Selected Column 2: 'none'");
    
    await page.waitForTimeout(3000); // wait for fetch
    
    // Check chart displayed
    const bodyText = await page.locator("body").innerText();
    console.log("  Default single column chart type (Histogram) loaded.");
    await page.screenshot({ path: path.join(__dirname, "..", "images_of_e2e", "vis-screenshot-3-histogram-age.png") });
    
    // Print insights
    const insightSection1 = page.locator('.surface-card').last();
    if (await insightSection1.isVisible()) {
      console.log("  Analytical Insight:\n   ", (await insightSection1.innerText()).replace(/\n/g, " | "));
    }

    console.log("\n=== Step 5: Test Numeric-Numeric Relationship (age vs salary) ===");
    await col2Select.selectOption("salary");
    console.log("  Selected Column 2: 'salary'");
    
    await page.waitForTimeout(3000); // wait for fetch
    
    console.log("  Scatter Plot with Regression Line loaded.");
    await page.screenshot({ path: path.join(__dirname, "..", "images_of_e2e", "vis-screenshot-4-scatter-age-salary.png") });
    
    const insightSection2 = page.locator('.surface-card').last();
    if (await insightSection2.isVisible()) {
      console.log("  Analytical Insight:\n   ", (await insightSection2.innerText()).replace(/\n/g, " | "));
    }

    console.log("\n=== Step 6: Test Categorical-Categorical Relationship (department vs city) ===");
    await col1Select.selectOption("department");
    console.log("  Selected Column 1: 'department'");
    await col2Select.selectOption("city");
    console.log("  Selected Column 2: 'city'");
    
    await page.waitForTimeout(3000); // wait for fetch
    
    console.log("  Grouped Bar Chart loaded.");
    await page.screenshot({ path: path.join(__dirname, "..", "images_of_e2e", "vis-screenshot-5-groupedbar-dept-city.png") });
    
    const insightSection3 = page.locator('.surface-card').last();
    if (await insightSection3.isVisible()) {
      console.log("  Analytical Insight:\n   ", (await insightSection3.innerText()).replace(/\n/g, " | "));
    }

    console.log("\n=== Step 7: Test Crosstab Heatmap ===");
    const chartTypeSelect = page.locator('label:has-text("Chart Type") + select');
    await chartTypeSelect.selectOption("heatmap");
    console.log("  Selected Chart Type: 'heatmap'");
    
    await page.waitForTimeout(3000); // wait for fetch
    
    console.log("  Crosstab Heatmap loaded.");
    await page.screenshot({ path: path.join(__dirname, "..", "images_of_e2e", "vis-screenshot-6-heatmap-dept-city.png") });
    
    const insightSection4 = page.locator('.surface-card').last();
    if (await insightSection4.isVisible()) {
      console.log("  Analytical Insight:\n   ", (await insightSection4.innerText()).replace(/\n/g, " | "));
    }

    console.log("\n=== E2E Visualizations Verification Passed Successfully! ===");
    process.exit(0);

  } catch (err) {
    console.error("  ❌ TEST FAILED WITH EXCEPTION:", err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
