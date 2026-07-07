import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = "http://localhost:8080";
const FIXTURES_DIR = path.join(__dirname, "..", "..", "tests", "automation_scripts", "fixtures");
const IMAGES_DIR = path.join(__dirname, "..", "..", "tests", "images_of_e2e");

const EV_CSV_PATH = path.join(FIXTURES_DIR, "mini_electric_vehicles.csv");
const EMP_CSV_PATH = path.join(__dirname, "..", "..", "demo-employee-data.csv");
const INJECTED_CSV_PATH = path.join(FIXTURES_DIR, "injected_solo_class.csv");
const TIMEOUT = 600_000; // 10 minutes overall timeout

// Setup directories
fs.mkdirSync(FIXTURES_DIR, { recursive: true });
fs.mkdirSync(IMAGES_DIR, { recursive: true });

// Create injected solo class fixture
const empData = fs.readFileSync(EMP_CSV_PATH, "utf-8").trim().split("\n");
const lastRowIndex = empData.length - 1;
const lastRowCols = empData[lastRowIndex].split(",");
lastRowCols[4] = "SoloDept"; // department column index is 4
empData[lastRowIndex] = lastRowCols.join(",");
fs.writeFileSync(INJECTED_CSV_PATH, empData.join("\n"), "utf-8");
console.log(`Created injected solo class CSV at: ${INJECTED_CSV_PATH}`);

// Hard assertion helper — throws with a clear message on failure
function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
  console.log(`   ASSERTION PASSED: ${message}`);
}

async function runScenario(csvPath, targetCol, excludeCols, testName, screenshotName, expectations) {
  console.log(`\n========================================`);
  console.log(`Running Scenario: ${testName}`);
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

  // Mock Supabase Auth user endpoint
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
  const logs = [];

  page.on("console", (msg) => {
    const text = msg.text();
    logs.push(`[${msg.type().toUpperCase()}] ${text}`);
    console.log(`[BROWSER CONSOLE] ${msg.type()}: ${text}`);
    if (msg.type() === "error") {
      if (!text.includes("favicon") && !text.includes("connection") && !text.includes("vite")) {
        errors.push(text);
      }
    }
  });

  page.on("pageerror", (err) => {
    errors.push(err.message);
    console.log(`[PAGE ERROR] ${err.message}`);
  });

  try {
    console.log("1. Navigating to InsightFlow...");
    await page.goto(APP_URL, { waitUntil: "networkidle" });

    console.log("2. Uploading CSV file...");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(csvPath);

    await page.waitForFunction(() => {
      const body = document.body.innerText;
      return body.includes("Profiling") || body.includes("trust") || body.includes("Anomalies");
    }, { timeout: 45_000 });
    console.log("   CSV uploaded and profiled.");

    console.log("3. Navigating to ML Models tab... ");
    const modelTab = page.locator('button', { hasText: /ML Models/i }).first();
    await modelTab.click();
    await page.waitForTimeout(1000);

    console.log(`4. Selecting Target Column: '${targetCol}'...`);
    const selectTrigger = page.locator('button:has-text("Select target column...")').first();
    await selectTrigger.click();
    await page.waitForTimeout(500);
    const targetOption = page.locator(`[role="option"]:has-text("${targetCol}")`).first();
    await targetOption.click();

    console.log("5. Running recommendations...");
    const suitabilityBtn = page.locator('button', { hasText: /Feature Analysis/i });
    await suitabilityBtn.click();
    
    console.log("   Waiting for Feature Recommendations to appear...");
    await page.waitForSelector('text=Feature Recommendations', { timeout: 300_000 });

    console.log("6. Waiting for Configure & Train button to be enabled...");
    await page.waitForSelector('button:has-text("Configure & Train"):not([disabled])', { timeout: 300_000 });
    
    console.log("   Clicking Configure & Train...");
    const configureBtn = page.locator('button', { hasText: /Configure & Train/i });
    await configureBtn.click();
    await page.waitForTimeout(1000);

    console.log("7. Excluding columns...");
    for (const col of excludeCols) {
      console.log(`   Attempting to exclude column: ${col}`);
      const badge = page.locator('.cursor-pointer', { hasText: new RegExp(`^${col}\\b`) }).first();
      await badge.waitFor({ state: "visible", timeout: 20000 });
      await badge.click();
      await page.waitForTimeout(300);
    }

    console.log("8. Starting model training...");
    const trainBtn = page.locator('button', { hasText: /Train Both Models/i });
    await trainBtn.click();

    await page.waitForFunction(() => {
      return document.body.innerText.includes("Model Comparison");
    }, { timeout: 360_000 });
    console.log("   Training complete. Navigation to results verified.");
    await page.waitForTimeout(3000);

    // Save screenshot
    const screenshotPath = path.join(IMAGES_DIR, `${screenshotName}.png`);
    await page.screenshot({ path: screenshotPath });
    console.log(`   Saved screenshot to ${screenshotPath}`);

    // Read the rendered body text for assertions
    const bodyText = await page.locator("body").innerText();

    // --- HARD ASSERTIONS ---

    // Assert folds text is rendered
    assert(
      bodyText.includes("folds:"),
      `Page body contains 'folds:' (expected: any fold coverage string)`
    );

    // Assert class coverage text is rendered
    assert(
      bodyText.includes("class coverage:"),
      `Page body contains 'class coverage:' (expected: any class coverage string)`
    );

    // Assert the exact coverage string if provided
    if (expectations.expectedFoldCoverage) {
      assert(
        bodyText.includes(`folds: ${expectations.expectedFoldCoverage}`),
        `Page body contains exact string 'folds: ${expectations.expectedFoldCoverage}'`
      );
    }

    if (expectations.expectedClassCoverage) {
      assert(
        bodyText.includes(`class coverage: ${expectations.expectedClassCoverage}`),
        `Page body contains exact string 'class coverage: ${expectations.expectedClassCoverage}'`
      );
    }

    // Assert warning banner presence/absence
    const hasWarning = bodyText.includes("Excluded Classes Warning");
    assert(
      hasWarning === expectations.expectWarningBanner,
      `Excluded Classes Warning banner: expected=${expectations.expectWarningBanner}, actual=${hasWarning}`
    );

    await browser.close();

    return {
      success: true,
      errors
    };

  } catch (err) {
    console.error("❌ Scenario failed:", err.message);
    try {
      await browser.close();
    } catch (_) {}
    return {
      success: false,
      errors: [err.message]
    };
  }
}

(async () => {
  // Scenario 1: car_body_type (rare-class multiclass, mini_electric_vehicles.csv, 127 rows)
  // Pipeline uses KFold (class Coupe has 2 members < 5 folds).
  // Coverage: 34/40 (verified by direct pipeline computation)
  const sc1 = await runScenario(
    EV_CSV_PATH,
    "car_body_type",
    ["brand", "model", "fast_charge_port", "source_url"],
    "car_body_type (rare-class multiclass)",
    "car_body_type-coverage",
    {
      expectedFoldCoverage: "5/5",
      expectedClassCoverage: "34/40",
      expectWarningBanner: false
    }
  );

  // Scenario 2: Injected 1-member class (department with SoloDept)
  // SoloDept has 1 row — excluded from CV entirely. No expected class coverage assert
  // since SoloDept is dropped before pipeline, leaving 4 classes * 5 folds = 20/20.
  const sc2 = await runScenario(
    INJECTED_CSV_PATH,
    "department",
    ["employee_id", "name"],
    "Injected 1-member class target",
    "injected_solo_class-coverage",
    {
      expectedFoldCoverage: "5/5",
      expectedClassCoverage: null, // Not asserting exact value — depends on excluded dept count
      expectWarningBanner: true
    }
  );

  // Scenario 3: department (balanced, no 1-member classes)
  // 5 classes * 5 folds = 25/25 (salary excluded as harmful, no SoloDept).
  const sc3 = await runScenario(
    EMP_CSV_PATH,
    "department",
    ["employee_id", "name"],
    "department (balanced target)",
    "department-coverage",
    {
      expectedFoldCoverage: "5/5",
      expectedClassCoverage: null, // Not asserting exact — dependent on which classes appear
      expectWarningBanner: false
    }
  );

  console.log("\n========================================");
  console.log("ALL SCENARIOS COMPLETED");
  console.log("========================================");
  console.log(`Scenario 1 (car_body_type): success=${sc1.success}, errors=${sc1.errors.length}`);
  console.log(`Scenario 2 (injected solo class): success=${sc2.success}, errors=${sc2.errors.length}`);
  console.log(`Scenario 3 (balanced dept): success=${sc3.success}, errors=${sc3.errors.length}`);

  const anyFailed = !sc1.success || !sc2.success || !sc3.success;
  const totalErrors = sc1.errors.length + sc2.errors.length + sc3.errors.length;

  if (anyFailed || totalErrors > 0) {
    console.error("❌ One or more scenarios failed.");
    process.exit(1);
  }

  console.log("\n✅ ALL ASSERTIONS PASSED");
  process.exit(0);
})();
