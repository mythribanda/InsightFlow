import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/automation_scripts",
  use: {
    baseURL: "http://localhost:8081",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:8081",
    reuseExistingServer: !process.env.CI,
    env: {
      E2E_AUTH_BYPASS: "1",
    },
  },
});
