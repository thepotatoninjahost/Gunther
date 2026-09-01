import { FileCode2, GitPullRequest, Globe, MessageSquare, Terminal } from "lucide-react";
import type { SurfaceTab } from "@/lib/agent/types";
import { cn } from "@/lib/utils";

const TABS: { id: SurfaceTab; label: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "files", label: "Files", icon: FileCode2 },
  { id: "review", label: "Review", icon: GitPullRequest },
  { id: "terminal", label: "Terminal", icon: Terminal },
  { id: "research", label: "Research", icon: Globe },
];

export function TabBar({
  tab,
  onTab,
  pendingCount,
}: {
  tab: SurfaceTab;
  onTab: (tab: SurfaceTab) => void;
  pendingCount: number;
}) {
  return (
    <nav className="flex border-t border-border bg-surface md:border-t-0 md:border-b">
      {TABS.map((item) => {
        const active = tab === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onTab(item.id)}
            className={cn(
              "relative flex h-14 min-h-11 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] tracking-wide transition-colors duration-(--motion-quick)",
              active ? "text-accent" : "text-muted hover:text-fg",
            )}
          >
            <Icon className="size-4" />
            <span>{item.label}</span>
            {item.id === "review" && pendingCount > 0 ? (
              <span className="absolute right-1/4 top-2 size-1.5 rounded-full bg-warn" />
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
