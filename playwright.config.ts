import { defineConfig } from "@playwright/test";
import { execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ---------------------------------------------------------------------------
// Pre-flight 1: Fail fast if Docker stack is not running
// ---------------------------------------------------------------------------
function assertDockerStackRunning() {
  try {
    const output = execSync("docker ps --format {{.Names}}", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const running = output.split(/\r?\n/).map((n) => n.trim()).filter(Boolean);
    const required = ["insightflow_frontend", "insightflow_backend"];
    const missing = required.filter((name) => !running.includes(name));
    if (missing.length > 0) {
      console.error(
        "\n❌  InsightFlow Docker stack is not fully running.\n" +
          `   Missing containers: ${missing.join(", ")}\n\n` +
          "   Start the stack first:\n" +
          "     docker compose up -d\n\n" +
          "   Then re-run: npx playwright test\n"
      );
      process.exit(1);
    }
  } catch {
    console.error(
      "\n❌  Could not run `docker ps`. Is Docker installed and running?\n" +
        "   Start the stack first:\n" +
        "     docker compose up -d\n\n" +
        "   Then re-run: npx playwright test\n"
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Pre-flight 2: Materialize spec files from OneDrive cloud stubs
//
// This project lives inside a OneDrive-managed folder. OneDrive uses Windows
// Cloud File reparse-point stubs (IO_REPARSE_TAG_CLOUD_FILES, 0x9000a01a)
// for locally-available cloud files. Node.js fs.readdir({withFileTypes:true})
// returns Dirent objects where isFile() === false for these stubs, so
// Playwright's collectFilesForProject() silently skips every spec file.
//
// Fix: copy the spec directory contents byte-for-byte into a temp directory
// that lives outside of OneDrive's management scope (e.g. %TEMP%). The copy
// uses standard OS temp directories that are always on NTFS without cloud
// reparse points. Playwright is then pointed at the temp directory.
//
// The temp directory is stable across invocations (keyed by process.cwd())
// so incremental runs are fast (only changed files are re-copied).
// ---------------------------------------------------------------------------

const SPECS_SRC = path.join(process.cwd(), "tests", "automation_scripts", "specs");
const FIXTURES_SRC = path.join(process.cwd(), "tests", "automation_scripts", "fixtures");

// Use a stable temp dir keyed to this project so incremental reruns are fast.
const TEMP_TEST_ROOT = path.join(
  os.tmpdir(),
  "insightflow-playwright",
  Buffer.from(process.cwd()).toString("base64").slice(0, 12)
);
const SPECS_DEST = path.join(TEMP_TEST_ROOT, "specs");
const FIXTURES_DEST = path.join(TEMP_TEST_ROOT, "fixtures");

function runWithRetry<T>(fn: () => T, actionName: string, maxAttempts = 5, delayMs = 250): T {
  let attempt = 0;
  while (true) {
    try {
      return fn();
    } catch (error: any) {
      attempt++;
      const isTransient = error && (error.code === "EBUSY" || error.code === "EPERM");
      if (isTransient && attempt < maxAttempts) {
        console.warn(`  ⚠️  Transient lock error (${error.code}) during "${actionName}". Retrying in ${delayMs}ms (Attempt ${attempt}/${maxAttempts})...`);
        try {
          const sab = new SharedArrayBuffer(4);
          const int32 = new Int32Array(sab);
          Atomics.wait(int32, 0, 0, delayMs);
        } catch {
          const start = Date.now();
          while (Date.now() - start < delayMs) {}
        }
        continue;
      }
      if (isTransient) {
        console.error(`\n❌  Failed after ${maxAttempts} attempts due to persistent transient lock error (${error.code}) during "${actionName}".`);
      }
      throw error;
    }
  }
}

function copyDirSync(src: string, dest: string) {
  runWithRetry(() => {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  }, `mkdir ${dest}`);

  const entries = runWithRetry(() => fs.readdirSync(src, { withFileTypes: true }), `readdir ${src}`);

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else if (entry.isFile()) {
      // Ordinary files — copy directly.
      runWithRetry(() => {
        fs.copyFileSync(srcPath, destPath);
      }, `copyFile ${srcPath} -> ${destPath}`);
    } else {
      // Reparse point / OneDrive stub — read via content (follows the reparse)
      // and write as a plain file to the temp location.
      try {
        const content = runWithRetry(() => fs.readFileSync(srcPath), `read ${srcPath}`);
        runWithRetry(() => fs.writeFileSync(destPath, content), `write ${destPath}`);
      } catch (error: any) {
        if (error && (error.code === "EBUSY" || error.code === "EPERM")) {
          throw error;
        }
        console.warn(`  ⚠️  Could not materialize: ${srcPath} — skipping`);
      }
    }
  }
}

function materializeSpecs() {
  if (!fs.existsSync(SPECS_SRC)) {
    console.error(`\n❌  Test specs directory not found: ${SPECS_SRC}\n`);
    process.exit(1);
  }

  fs.mkdirSync(TEMP_TEST_ROOT, { recursive: true });

  // Create a node_modules symlink in the temp root so that imports like
  // `@playwright/test` resolve to the project's actual node_modules.
  const tempNodeModules = path.join(TEMP_TEST_ROOT, "node_modules");
  const projectNodeModules = path.join(process.cwd(), "node_modules");
  if (!fs.existsSync(tempNodeModules)) {
    fs.symlinkSync(projectNodeModules, tempNodeModules, "junction");
  }

  // Write a minimal package.json so that TypeScript/ESM transforms recognize
  // this temp directory as an ES module package (required for import.meta.url).
  const tempPkg = path.join(TEMP_TEST_ROOT, "package.json");
  if (!fs.existsSync(tempPkg)) {
    fs.writeFileSync(tempPkg, JSON.stringify({ type: "module" }, null, 2));
  }

  copyDirSync(SPECS_SRC, SPECS_DEST);

  // Fixtures are referenced by helpers.ts via relative paths from FIXTURES_SRC.
  // Copy them into the same relative position expected by the materialized specs.
  if (fs.existsSync(FIXTURES_SRC)) {
    copyDirSync(FIXTURES_SRC, FIXTURES_DEST);
  }
}

assertDockerStackRunning();
materializeSpecs();

export default defineConfig({
  // Use the materialized (non-OneDrive) copy of spec files so that
  // Playwright's collectFilesForProject() can discover them via lstat().
  testDir: TEMP_TEST_ROOT,
  timeout: 90000,
  workers: 2,
  reporter: [
    ["html"],
    ["json", { outputFile: "test-results/results.json" }]
  ],
  use: {
    // Frontend is served by the Docker container on port 8080.
    // No local dev server is needed — the full stack runs via Docker Compose.
    baseURL: "http://localhost:8080",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  // webServer block intentionally removed: the full stack (frontend, backend, redis)
  // is managed by Docker Compose (`docker compose up -d`). Spawning a redundant
  // `npm run dev` process here would race against the container and waste resources.
});
