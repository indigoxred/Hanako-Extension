import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import manifest from "./src/manifest.js";

function manifestPlugin(): Plugin {
  return {
    name: "hanako-extension-manifest",
    async closeBundle() {
      const outputPath = resolve("dist/manifest.json");
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
  };
}

export default defineConfig({
  plugins: [react(), manifestPlugin()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        "background/service-worker": "src/background/service-worker.ts",
        "content/content-entry": "src/content/content-entry.ts",
        "options/options": "src/options/options.html",
        "popup/popup": "src/popup/popup.html"
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
