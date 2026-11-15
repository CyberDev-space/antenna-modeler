import { defineConfig } from "@playwright/test";

/*
 * Tests of the page in a browser: the production build, served as it would
 * be, in the Chrome of the system. Run with `npm run e2e`.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    channel: "chrome",
    viewport: { width: 1600, height: 900 },
    locale: "uk-UA",
  },
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
