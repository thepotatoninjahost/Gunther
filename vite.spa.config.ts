import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(rootDir, "spa"),
  plugins: [tailwindcss(), viteReact()],
  base: "./",
  publicDir: path.resolve(rootDir, "public"),
  resolve: {
    alias: {
      "@/lib/agent/llm": path.resolve(rootDir, "src/lib/agent/llm-spa.ts"),
      "@": path.resolve(rootDir, "src"),
    },
  },
  build: {
    outDir: path.resolve(rootDir, "android/app/src/main/assets/www"),
    emptyOutDir: true,
  },
});
