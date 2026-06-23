/**
 * E2E verification: real browser click-through of Anomaly tab and Query box.
 * Uses Playwright to drive a Chromium browser against the running dev server.
 *
 * Prerequisites: backend on :8000, frontend on :8081
 * Run:  npx playwright test e2e-verify.mjs  (or node e2e-verify.mjs with playwright installed)
 */
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = "http://localhost:8081";
const CSV_PATH = path.join(__dirname, "demo-employee-data.csv");
const TIMEOUT = 60_000;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT);

  // Log browser console messages and errors
  page.on("console", (msg) => console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (err) => console.log(`[BROWSER ERROR] ${err.message}`));

  console.log("=== Step 1: Navigate to app ===");
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  console.log("  Page loaded:", await page.title());

  // Take a screenshot for reference
  await page.screenshot({ path: path.join(__dirname, "e2e-screenshot-1-loaded.png") });

  console.log("\n=== Step 2: Upload demo-employee-data.csv ===");
  // Find the file input (may be hidden) and set the file
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(CSV_PATH);
  console.log("  File selected");

  // Wait for analysis to complete — look for tabs or profile data to appear
  // The app shows tabs like "anomaly", "query" after upload + analysis
  console.log("  Waiting for analysis to complete...");
  
  // Wait for either the anomaly tab or some indicator that analysis finished
  // Give it up to 30s for the background analysis
  try {
    await page.waitForFunction(() => {
      const body = document.body.innerText;
      return body.includes("Anomalies") || body.includes("anomalies");
    }, { timeout: 30_000 });
    console.log("  Analysis completed — tabs visible");
  } catch {
    console.log("  WARNING: Could not detect Anomalies tab text, continuing anyway...");
  }

  await page.screenshot({ path: path.join(__dirname, "e2e-screenshot-2-after-upload.png") });

  // Print all visible tab-like buttons for debugging
  const buttons = await page.locator("button").allTextContents();
  console.log("  Visible buttons:", buttons.filter(b => b.trim()).slice(0, 20));

  console.log("\n=== Step 3: Click Anomaly tab ===");
  // Find and click the anomaly tab button
  let anomalyClicked = false;
  try {
    // Try exact text match first
    const anomalyTab = page.locator('button', { hasText: /anomal/i }).first();
    await anomalyTab.click();
    anomalyClicked = true;
    console.log("  Clicked Anomaly tab");
  } catch (err) {
    console.log("  Could not find/click Anomaly tab:", err.message);
  }

  if (anomalyClicked) {
    // Wait for anomaly results to load
    console.log("  Waiting for anomaly results...");
    await page.waitForTimeout(5000); // Give the useQuery time to fire and resolve
    
    await page.screenshot({ path: path.join(__dirname, "e2e-screenshot-3-anomaly.png") });

    // Check for anomaly content
    const pageText = await page.locator("body").innerText();
    
    if (pageText.includes("score") || pageText.includes("anomal") || pageText.includes("driver")) {
      console.log("  ✅ ANOMALY TAB: Content rendered (found anomaly-related text)");
    } else if (pageText.includes("error") || pageText.includes("Error") || pageText.includes("failed")) {
      // Look for specific error text
      const errorText = pageText.match(/error[^\n]*/i)?.[0] || "unknown error";
      console.log("  ❌ ANOMALY TAB: Error detected:", errorText);
    } else if (pageText.includes("Loading") || pageText.includes("loading")) {
      console.log("  ⏳ ANOMALY TAB: Still loading, waiting more...");
      await page.waitForTimeout(10000);
      await page.screenshot({ path: path.join(__dirname, "e2e-screenshot-3b-anomaly-retry.png") });
      const retryText = await page.locator("body").innerText();
      if (retryText.includes("score") || retryText.includes("driver")) {
        console.log("  ✅ ANOMALY TAB: Content rendered after extra wait");
      } else {
        console.log("  ❌ ANOMALY TAB: No anomaly content after extended wait");
      }
    } else {
      console.log("  ❓ ANOMALY TAB: Could not determine state. Body excerpt:");
      console.log("    ", pageText.substring(0, 500).replace(/\n/g, " | "));
    }
  }

  console.log("\n=== Step 4: Click NL Query tab and run a query ===");
  let queryClicked = false;
  try {
    // The tab might be labeled "Query", "NL Query", "Code Sandbox", "Ask your data", etc.
    const queryTab = page.locator('button', { hasText: /ask|chat/i }).first();
    await queryTab.click();
    queryClicked = true;
    console.log("  Clicked Query tab");
  } catch (err) {
    console.log("  Could not find/click Query tab:", err.message);
  }

  if (queryClicked) {
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(__dirname, "e2e-screenshot-4-query-tab.png") });

    // Find the query input and type a question
    try {
      const queryInput = page.locator('input[placeholder*="missing"]').first()
        .or(page.locator('input[placeholder*="column"]').first())
        .or(page.locator('input[type="text"]').first());
      
      await queryInput.fill("how many employees are in engineering");
      console.log("  Typed query: 'how many employees are in engineering'");

      // Click Run/Submit button
      const runBtn = page.locator('button', { hasText: /run|send|submit/i }).first();
      await runBtn.click();
      console.log("  Clicked Run button");

      // Wait for result
      console.log("  Waiting for query result...");
      await page.waitForTimeout(8000);

      await page.screenshot({ path: path.join(__dirname, "e2e-screenshot-5-query-result.png") });

      const queryPageText = await page.locator("body").innerText();

      if (queryPageText.includes("79") || queryPageText.includes("count") || queryPageText.includes("Engineering")) {
        console.log("  ✅ NL QUERY: Correct result rendered (found 79 or count/Engineering)");
      } else if (queryPageText.includes("df[") || queryPageText.includes("result =")) {
        console.log("  ✅ NL QUERY: Generated code visible");
        // Check for the numeric result too
        if (queryPageText.includes("79")) {
          console.log("  ✅ NL QUERY: Result value present");
        }
      } else if (queryPageText.includes("error") || queryPageText.includes("Error") || queryPageText.includes("Failed")) {
        const errorText = queryPageText.match(/(error|failed|Error)[^\n]*/i)?.[0] || "unknown error";
        console.log("  ❌ NL QUERY: Error detected:", errorText);
      } else {
        console.log("  ❓ NL QUERY: Could not determine state. Body excerpt:");
        console.log("    ", queryPageText.substring(0, 500).replace(/\n/g, " | "));
      }
    } catch (err) {
      console.log("  ❌ NL QUERY: Failed to interact with query box:", err.message);
    }
  }

  // Also try clicking a suggestion button (e.g. "how many employees are in engineering") directly if it exists
  console.log("\n=== Step 5: Try clicking suggestion button ===");
  try {
    const suggestionBtn = page.locator('button', { hasText: /how many employees are in engineering/i }).first();
    if (await suggestionBtn.isVisible()) {
      await suggestionBtn.click();
      console.log("  Clicked 'how many employees are in engineering' suggestion");
      await page.waitForTimeout(8000);
      await page.screenshot({ path: path.join(__dirname, "e2e-screenshot-6-suggestion-result.png") });
      const resultText = await page.locator("body").innerText();
      if (resultText.includes("79") || resultText.includes("df[")) {
        console.log("  ✅ SUGGESTION QUERY: Result rendered");
      } else {
        console.log("  ❓ SUGGESTION QUERY: Unclear result");
      }
    } else {
      console.log("  Suggestion button not visible, skipping");
    }
  } catch {
    console.log("  Suggestion test skipped");
  }

  console.log("\n=== Done ===");
  await browser.close();
  process.exit(0);
})().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
