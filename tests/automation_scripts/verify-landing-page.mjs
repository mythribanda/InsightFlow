import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

(async () => {
  console.log("=== Controlled Test: Checking Landing Page on `/` ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(); // completely fresh context
  const page = await context.newPage();

  // Track page navigation events
  const history = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      history.push(frame.url());
      console.log(`  [Navigate] -> ${frame.url()}`);
    }
  });

  try {
    await page.goto("http://localhost:8080/", { waitUntil: "networkidle" });
    
    // Wait extra time to see if any client-side redirect kicks in
    await page.waitForTimeout(5000);

    const finalUrl = page.url();
    const title = await page.title();
    
    // Check for landing page text
    const hasLandingContent = await page.locator("body").evaluate((body) => {
      return body.innerText.includes("Honest analysis") || 
             body.innerText.includes("Marketing") || 
             body.innerText.includes("landing") || 
             body.innerHTML.includes("vignette") || 
             body.innerHTML.includes("canvas") ||
             body.innerHTML.includes("InsightFlow");
    });
    
    console.log("\n=== Test Results ===");
    console.log(`  Final URL: ${finalUrl}`);
    console.log(`  Page Title: ${title}`);
    console.log(`  Navigation History: ${history.join(" -> ")}`);
    console.log(`  Has Landing Page Markup: ${hasLandingContent}`);
    
    if (finalUrl === "http://localhost:8080/" || finalUrl === "http://localhost:8080") {
      console.log("  ✅ SUCCESS: Final URL is `/` (no redirect occurred).");
    } else {
      console.log(`  ❌ FAILED: Redirected to ${finalUrl}`);
    }

    if (hasLandingContent) {
      console.log("  ✅ SUCCESS: Landing page content or container is rendered.");
    } else {
      console.log("  ❌ FAILED: Landing page content not found in body.");
    }
  } catch (err) {
    console.error("  ❌ TEST EXCEPTION:", err);
  } finally {
    await browser.close();
    console.log("=== Test Done ===");
  }
})();
