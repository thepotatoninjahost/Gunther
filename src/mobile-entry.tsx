import { createRoot } from "react-dom/client";
import { WorkbenchShell } from "@/components/workbench/shell";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Gunther failed to mount");
createRoot(root).render(<WorkbenchShell />);
