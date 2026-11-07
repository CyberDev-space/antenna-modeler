import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // The engine finds its WebAssembly file next to its module; the
  // dependency optimizer of the development server would move the module.
  optimizeDeps: { exclude: ["nec2-wasm"] },
  worker: { format: "es" },
  // The view in space is one large chunk, three.js, that is loaded after the page.
  build: { chunkSizeWarningLimit: 700 },
  test: { environment: "node" },
});
