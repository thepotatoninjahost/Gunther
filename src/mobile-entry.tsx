import { createRoot } from "react-dom/client";
import { WorkbenchShell } from "@/components/workbench/shell";
import "./styles.css";

function showBootError(err: unknown) {
  const msg =
    err instanceof Error ? err.stack || err.message : typeof err === "string" ? err : "Could not start Gunther";
  const target = document.body || document.documentElement;
  target.innerHTML = `<main style="padding:24px;font-family:sans-serif;color:#3dff6b;background:#0b0c0b;min-height:100vh">
    <p style="font-size:18px;font-weight:600">Gunther hit a problem</p>
    <pre style="white-space:pre-wrap;margin-top:12px;font-size:13px;line-height:1.45;color:#d8f3d4">${String(msg).replace(/[<>&]/g, "")}</pre>
  </main>`;
}

function mount() {
  const root = document.getElementById("root");
  if (!root) throw new Error("Gunther failed to mount");
  createRoot(root).render(<WorkbenchShell />);
}

window.addEventListener("error", (event) => {
  showBootError(event.error || event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  showBootError(event.reason);
});

const start = () => {
  try {
    mount();
  } catch (error) {
    showBootError(error);
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
