import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const htmlPath = join("android/app/src/main/assets/www/index.html");
if (!existsSync(htmlPath)) {
  throw new Error(`missing ${htmlPath}`);
}

const root = dirname(htmlPath);
let html = readFileSync(htmlPath, "utf8");
const scripts = [];

html = html.replace(
  /<script[^>]*src="([^"]+)"[^>]*><\/script>/g,
  (_full, src) => {
    const file = join(root, src.replace(/^\.\//, ""));
    if (!existsSync(file)) throw new Error(`missing script ${file}`);
    const js = readFileSync(file, "utf8").replace(/<\/script/gi, "<\\/script");
    scripts.push(`<script>\n${js}\n</script>`);
    return "";
  },
);

html = html.replace(/<link[^>]*rel="stylesheet"[^>]*>/g, (full) => {
  const href = full.match(/href="([^"]+)"/)?.[1];
  if (!href || href.startsWith("http")) return full;
  const file = join(root, href.replace(/^\.\//, ""));
  if (!existsSync(file)) throw new Error(`missing css ${file}`);
  return `<style>\n${readFileSync(file, "utf8")}\n</style>`;
});

html = html.replace(/\scrossorigin(="[^"]*")?/g, "");

if (!html.includes("Loading Gunther")) {
  html = html.replace(
    '<div id="root"></div>',
    '<div id="root">Loading Gunther…</div>',
  );
}

if (!html.includes("</body>")) {
  html += "</body></html>";
}
html = html.replace("</body>", `${scripts.join("\n")}\n</body>`);

writeFileSync(htmlPath, html);
console.log("inlined spa →", htmlPath, `${Math.round(html.length / 1024)}kb`);
