import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const htmlPath = join("android/app/src/main/assets/www/index.html");
if (!existsSync(htmlPath)) throw new Error(`missing ${htmlPath}`);

const root = dirname(htmlPath);
let html = readFileSync(htmlPath, "utf8");
let cssBytes = 0;

html = html.replace(/<link[^>]*rel="stylesheet"[^>]*>/g, (full) => {
  const href = full.match(/href="([^"]+)"/)?.[1];
  if (!href || href.startsWith("http")) return full;
  const file = join(root, href.replace(/^\.\//, ""));
  if (!existsSync(file)) throw new Error(`missing css ${file}`);
  const css = readFileSync(file, "utf8").replace(/<\/style/gi, "<\\/style");
  cssBytes = css.length;
  return `<style>\n${css}\n</style>`;
});

if (cssBytes < 12_000) {
  throw new Error(`CSS too small (${cssBytes} bytes) — Tailwind did not see the workbench classes`);
}

writeFileSync(htmlPath, html);
console.log(`inlined CSS ${Math.round(cssBytes / 1024)}kb → ${htmlPath}`);
