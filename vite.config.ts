import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [tailwindcss(), tanstackStart({ srcDirectory: "src" }), viteReact(), nitro()],
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
});
