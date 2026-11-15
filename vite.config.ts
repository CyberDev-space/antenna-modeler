import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // The engine finds its WebAssembly file next to its module; the
  // dependency optimizer of the development server would move the module.
  optimizeDeps: { exclude: ["nec2-wasm"] },
  worker: { format: "es" },
  // The view in space is one large chunk, three.js, that is loaded after the page.
  build: { chunkSizeWarningLimit: 700 },
  // The tests in a browser are for Playwright, not for Vitest.
  test: { environment: "node", exclude: [...configDefaults.exclude, "e2e/**"] },
});
