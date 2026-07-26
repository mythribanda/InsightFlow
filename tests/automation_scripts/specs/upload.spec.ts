import { test, expect } from "@playwright/test";
import { 
  bypassAuth, 
  VALID_CSV, 
  VALID_TSV, 
  VALID_TXT, 
  VALID_XLSX, 
  VALID_XLS, 
  EMPTY_CSV, 
  OVERSIZED_CSV 
} from "./helpers.js";
import path from "path";
import fs from "fs";

test.describe("Dataset Upload", () => {
  
  test.beforeEach(async ({ page }) => {
    await bypassAuth(page);
    await page.goto("/", { waitUntil: "load" });
  });

  test("TC_UPLOAD_001: Verify uploading a valid .csv file succeeds", async ({ page }) => {
    // TC_UPLOAD_001: Verify uploading a valid .csv file succeeds
    // Expected: File parsed, profile/trust score displayed
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(VALID_CSV);
    
    // Wait for profiling/analysis indicators
    await expect(page.locator("text=/trust score/i").first()).toBeVisible({ timeout: 30000 });
  });

  test("TC_UPLOAD_002: Verify uploading a valid .xlsx file succeeds", async ({ page }) => {
    // TC_UPLOAD_002: Verify uploading a valid .xlsx file succeeds
    // Expected: File parsed correctly
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(VALID_XLSX);
    await expect(page.locator("text=/trust score/i").first()).toBeVisible({ timeout: 30000 });
  });

  test("TC_UPLOAD_003: Verify uploading a valid .xls file succeeds", async ({ page }) => {
    // TC_UPLOAD_003: Verify uploading a valid .xls file succeeds
    // Expected: File parsed correctly
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(VALID_XLS);
    await expect(page.locator("text=/trust score/i").first()).toBeVisible({ timeout: 30000 });
  });

  test("TC_UPLOAD_004: Verify uploading a valid .tsv file succeeds", async ({ page }) => {
    // TC_UPLOAD_004: Verify uploading a valid .tsv file succeeds
    // Expected: File parsed with tab delimiter detected correctly
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(VALID_TSV);
    await expect(page.locator("text=/trust score/i").first()).toBeVisible({ timeout: 30000 });
  });

  test("TC_UPLOAD_005: Verify uploading a valid .txt file succeeds", async ({ page }) => {
    // TC_UPLOAD_005: Verify uploading a .txt file
    // Expected: File parsed successfully if delimited
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(VALID_TXT);
    await expect(page.locator("text=/trust score/i").first()).toBeVisible({ timeout: 30000 });
  });

  test("TC_UPLOAD_006: Verify unsupported file type is rejected", async ({ page }) => {
    // TC_UPLOAD_006: Verify unsupported file type is rejected
    // Expected: Toast error message displayed
    
    // Create a temporary dummy pdf file
    const dummyPdf = path.join(path.dirname(VALID_CSV), "dummy.pdf");
    fs.writeFileSync(dummyPdf, "dummy pdf content");
    
    try {
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(dummyPdf);
      
      // Look for toast message
      const toast = page.locator("text=/Unsupported file/i");
      await expect(toast).toBeVisible();
    } finally {
      if (fs.existsSync(dummyPdf)) fs.unlinkSync(dummyPdf);
    }
  });

  test("TC_UPLOAD_007: Verify empty file is handled gracefully", async ({ page }) => {
    // TC_UPLOAD_007: Verify empty file (0 data rows) is handled gracefully
    // Expected: Graceful error/empty-state message shown, no crash
    const dummyEmpty = path.join(path.dirname(VALID_CSV), "completely_empty.csv");
    fs.writeFileSync(dummyEmpty, "");
    
    try {
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(dummyEmpty);
      
      // Look for toast error "File has no rows" or parse failed
      const toast = page.locator("text=/no rows|failed to parse/i");
      await expect(toast).toBeVisible();
    } finally {
      if (fs.existsSync(dummyEmpty)) fs.unlinkSync(dummyEmpty);
    }
  });

  test("TC_UPLOAD_008: Verify header-only file is handled", async ({ page }) => {
    // TC_UPLOAD_008: Verify header-only file (no data rows) is handled
    // Expected: App shows 'no data' state or toast rather than crashing
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(EMPTY_CSV);
    
    const toast = page.locator("text=/no rows/i");
    await expect(toast).toBeVisible();
  });

  test("TC_UPLOAD_009: Verify file exceeding max size limit is rejected", async ({ page }) => {
    // TC_UPLOAD_009: Verify file exceeding max size limit (>25MB) is rejected
    // Expected: Clear size-limit error shown
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(OVERSIZED_CSV);
    
    const toast = page.locator("text=/larger than 25 MB/i");
    await expect(toast).toBeVisible();
  });

  test("TC_UPLOAD_010: Verify drag-and-drop upload works", async ({ page }) => {
    // TC_UPLOAD_010: Verify drag-and-drop upload works
    // Expected: File accepted and processed same as click-upload
    
    // Playwright allows simulating a drag and drop event with the file dropzone.
    // However, the standard `setInputFiles` already interacts directly with the file drop input.
    // To strictly verify drag-and-drop capability, we trigger drop events.
    const fileContent = fs.readFileSync(VALID_CSV, "utf-8");
    const dataTransfer = await page.evaluateHandle((content) => {
      const dt = new DataTransfer();
      const file = new File([content], "valid.csv", { type: "text/csv" });
      dt.items.add(file);
      return dt;
    }, fileContent);
    
    await page.dispatchEvent("label:has-text('Drag & drop your file here')", "drop", { dataTransfer });
    await expect(page.locator("text=/trust score/i").first()).toBeVisible({ timeout: 30000 });
  });

  test("TC_UPLOAD_011: Verify click-to-browse file picker upload works", async ({ page }) => {
    // TC_UPLOAD_011: Verify click-to-browse file picker upload works
    // Expected: File accepted and processed
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(VALID_CSV);
    await expect(page.locator("text=/trust score/i").first()).toBeVisible({ timeout: 30000 });
  });

  test("TC_UPLOAD_012: Verify malformed CSV is handled without crash", async ({ page }) => {
    // TC_UPLOAD_012: Verify malformed CSV (ragged rows/unbalanced quotes) is handled without crash
    // Expected: Parser either recovers gracefully or shows a specific parse error
    const malformedCsv = path.join(path.dirname(VALID_CSV), "malformed.csv");
    fs.writeFileSync(
      malformedCsv, 
      "employee_id,name,age\nEMP001,Alice,30\nEMP002,Bob,25,extra_col_here\nEMP003,\"Charlie,35"
    );
    
    try {
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(malformedCsv);
      
      // Should either successfully profile (recovering ragged rows) or show a toast without white-screening the page
      await page.waitForTimeout(3000);
      const headerTitle = page.locator("h1").first();
      await expect(headerTitle).toBeVisible(); // check that page is not blank/crashed
    } finally {
      if (fs.existsSync(malformedCsv)) fs.unlinkSync(malformedCsv);
    }
  });

});
