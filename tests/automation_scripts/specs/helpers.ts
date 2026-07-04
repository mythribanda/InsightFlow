import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { expect } from "@playwright/test";

// Resolving __dirname in ES Modules (Playwright supports TypeScript ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const FIXTURES_DIR = path.resolve(__dirname, "../fixtures/test-data");
export const VALID_CSV = path.join(FIXTURES_DIR, "valid.csv");
export const VALID_TSV = path.join(FIXTURES_DIR, "valid.tsv");
export const VALID_TXT = path.join(FIXTURES_DIR, "valid.txt");
export const VALID_XLSX = path.join(FIXTURES_DIR, "valid.xlsx");
export const VALID_XLS = path.join(FIXTURES_DIR, "valid.xls");
export const EMPTY_CSV = path.join(FIXTURES_DIR, "empty.csv");
export const OVERSIZED_CSV = path.join(FIXTURES_DIR, "oversized.csv");
export const NA_NUMERIC_CSV = path.join(FIXTURES_DIR, "na_numeric.csv");
export const IMBALANCED_CSV = path.join(FIXTURES_DIR, "imbalanced.csv");
export const MISSING_LABELS_CSV = path.join(FIXTURES_DIR, "missing_labels.csv");

// Generate a 30-row regression dataset on the fly to bypass <= 20 task classification limits
export const REGRESSION_CSV = path.join(FIXTURES_DIR, "regression_data.csv");
if (!fs.existsSync(REGRESSION_CSV)) {
  let content = "employee_id,name,age,experience,department,city,rating,salary\n";
  const depts = ["Engineering", "Sales", "HR"];
  const cities = ["San Francisco", "New York", "Chicago"];
  for (let i = 1; i <= 30; i++) {
    const dept = depts[i % 3];
    const city = cities[i % 3];
    const rating = (3.0 + (i % 3) * 0.5).toFixed(1);
    const salary = 50000 + i * 3000;
    content += `EMP${String(i).padStart(3, "0")},Employee ${i},${20 + i},${i},${dept},${city},${rating},${salary}\n`;
  }
  fs.writeFileSync(REGRESSION_CSV, content, "utf-8");
}

/**
 * Mocks all Supabase REST and Authentication endpoints to prevent any actual network calls
 * to Supabase services during E2E test execution.
 */
export async function mockAuthEndpoints(page: any) {
  // 1. Mock Supabase REST calls to 'profiles' table to return mock user data
  await page.route("**/rest/v1/profiles*", async (route: any) => {
    const method = route.request().method();
    if (method === "GET") {
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
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true })
      });
    }
  });

  // 2. Mock Supabase Auth OTP sending
  await page.route("**/auth/v1/otp", async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "OTP sent successfully" })
    });
  });

  // 3. Mock Supabase Auth OTP verification
  await page.route("**/auth/v1/verify", async (route: any) => {
    const request = route.request();
    const postData = JSON.parse(request.postData() || "{}");
    if (postData.token === "999999") {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error_description: "Invalid login credentials", message: "Invalid login credentials" })
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "mock-access-token",
          token_type: "bearer",
          user: { id: "e2e-test-user-id", email: "insightflow_e2e_test@gmail.com" }
        })
      });
    }
  });

  // 4. Mock Supabase Auth signup
  await page.route("**/auth/v1/signup", async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "mock-access-token",
        token_type: "bearer",
        user: { id: "e2e-test-user-id", email: "insightflow_e2e_test@gmail.com" }
      })
    });
  });

  // 5. Mock Supabase Auth token/password signin
  await page.route("**/auth/v1/token*", async (route: any) => {
    const request = route.request();
    const postData = JSON.parse(request.postData() || "{}");
    if (postData.password === "wrong_password" || postData.password === "wrong") {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error_description: "Invalid login credentials", message: "Invalid login credentials" })
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "mock-access-token",
          token_type: "bearer",
          user: { id: "e2e-test-user-id", email: "insightflow_e2e_test@gmail.com" }
        })
      });
    }
  });
}

/**
 * Sets up local storage with a mock token that will bypass authentication checks
 * on the backend when E2E_AUTH_BYPASS is active.
 * Also registers the Supabase Auth mocks.
 */
export async function bypassAuth(page: any) {
  await mockAuthEndpoints(page);

  // Set local storage tokens
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
}

/**
 * Uploads a file to the FileDrop and waits for the profiling to complete.
 */
export async function uploadFileAndProfile(page: any, filePath: string) {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(filePath);
  
  // Wait for the file upload input to disappear
  await expect(fileInput).toBeHidden({ timeout: 15000 });
  
  // Wait for the backend intelligence profiling/analyzing state to complete
  await expect(page.locator('text=Running backend intelligence profiling...')).toBeHidden({ timeout: 60000 });
  await expect(page.locator('text=Analyzing...').first()).toBeHidden({ timeout: 60000 });
}
