import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
  },
  projects: [
    {
      name: "chromium",
      use: { channel: "chromium" },
    },
  ],
  webServer: {
    command: "NODE_ENV=production node --env-file=.env dist/app.js",
    port: 3000,
    reuseExistingServer: true,
  },
});
