import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "muted",
  children,
}: {
  className?: string;
  tone?: "muted" | "accent" | "warn" | "danger";
  children: ReactNode;
}) {
  const tones = {
    muted: "text-muted border-border",
    accent: "text-accent border-accent/40",
    warn: "text-warn border-warn/40",
    danger: "text-danger border-danger/40",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
