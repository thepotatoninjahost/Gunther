import { createFileRoute } from "@tanstack/react-router";
import { WorkbenchShell } from "@/components/workbench/shell";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <WorkbenchShell />;
}
