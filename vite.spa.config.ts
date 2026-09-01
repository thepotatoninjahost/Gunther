import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(rootDir, "spa"),
  plugins: [
    tailwindcss(),
    viteReact(),
    {
      name: "webview-html",
      transformIndexHtml(html) {
        const scripts: string[] = [];
        html = html.replace(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g, (_match, src: string) => {
          scripts.push(`<script src="${src}"></script>`);
          return "";
        });
        html = html.replace(/\scrossorigin(="[^"]*")?/g, "");
        if (!html.includes("</body>")) html += "</body></html>";
        return html.replace("</body>", `${scripts.join("\n")}\n</body>`);
      },
    },
  ],
  base: "./",
  publicDir: path.resolve(rootDir, "public"),
  resolve: {
    alias: {
      "@/lib/agent/llm": path.resolve(rootDir, "src/lib/agent/llm-spa.ts"),
      [path.resolve(rootDir, "src/lib/agent/llm.ts")]: path.resolve(rootDir, "src/lib/agent/llm-spa.ts"),
      "@": path.resolve(rootDir, "src"),
    },
  },
  build: {
    outDir: path.resolve(rootDir, "android/app/src/main/assets/www"),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
