import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = "http://localhost:8081";
const IMAGES_DIR = path.join(__dirname, "..", "images_of_e2e");

(async () => {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

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

  page.on("console", (msg) => console.log(`[CONSOLE] ${msg.type()}: ${msg.text()}`));
  
  page.on("requestfailed", (request) => {
    console.log(`[REQUEST FAILED] ${request.url()} - ${request.failure()?.errorText}`);
  });
  
  page.on("response", (response) => {
    if (response.status() >= 400) {
      console.log(`[RESPONSE ERROR] ${response.status()} ${response.url()}`);
    }
  });

  console.log("Navigating to:", APP_URL);
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  
  console.log("Waiting 5 seconds for page load...");
  await page.waitForTimeout(5000);

  const screenshotPath = path.join(IMAGES_DIR, "inspect-session-active.png");
  await page.screenshot({ path: screenshotPath });
  console.log("Saved screenshot to:", screenshotPath);

  const bodyText = await page.locator("body").innerText();
  console.log("Body text excerpt (first 1000 chars):");
  console.log(bodyText.substring(0, 1000));

  const inputs = await page.locator("input").all();
  console.log(`Found ${inputs.length} inputs:`);
  for (const input of inputs) {
    const type = await input.getAttribute("type");
    const name = await input.getAttribute("name");
    const id = await input.getAttribute("id");
    const placeholder = await input.getAttribute("placeholder");
    console.log(`  - Type: ${type}, Name: ${name}, Id: ${id}, Placeholder: ${placeholder}`);
  }

  await browser.close();
})();
