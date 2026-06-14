import { Link, useRouterState } from "@tanstack/react-router";
import { ListChecks, MessageSquare, Terminal, FolderTree, Settings, Rocket } from "lucide-react";

const tabs = [
  { to: "/tasks", label: "Tasks", icon: ListChecks, match: ["/tasks", "/dashboard", "/"] },
  { to: "/missions", label: "Missions", icon: Rocket, match: ["/missions"] },
  { to: "/chat", label: "Chat", icon: MessageSquare, match: ["/chat"] },
  { to: "/terminal", label: "Terminal", icon: Terminal, match: ["/terminal"] },
  { to: "/files", label: "Files", icon: FolderTree, match: ["/files"] },
  { to: "/settings", label: "Settings", icon: Settings, match: ["/settings"] },
] as const;

export function BottomTabs() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-md"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
      aria-label="Primary"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-6">
        {tabs.map((t) => {
          const active = t.match.some((m) => path === m || (m !== "/" && path.startsWith(m + "/")));
          const Icon = t.icon;
          return (
            <li key={t.to}>
              <Link
                to={t.to}
                className={`relative flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium tracking-tight transition-colors active:scale-95 ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span
                  className={`grid h-7 w-12 place-items-center rounded-lg transition-colors ${active ? "bg-primary/12" : ""}`}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.8} />
                </span>
                <span>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
