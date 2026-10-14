import { Cat } from "lucide-react";
import { ROUTES, type Route } from "@/app/routes";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

export function Sidebar({
  route,
  onNavigate,
  engineSummary,
}: {
  route: Route;
  onNavigate: (route: Route) => void;
  engineSummary: React.ReactNode;
}) {
  const t = useT();
  const groups: ("main" | "system")[] = ["main", "system"];

  return (
    <nav
      className="flex w-[var(--sidebar-width)] shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
      aria-label={t("nav.section.main")}
    >
      <div className="flex h-12 items-center gap-2 px-3.5">
        <span className="flex size-6 items-center justify-center rounded-md bg-secondary text-foreground">
          <Cat className="size-3.5" aria-hidden />
        </span>
        <span className="t-subtitle font-semibold tracking-tight">Tailcat Box</span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {groups.map((group) => {
          const items = ROUTES.filter((item) => item.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="mb-1">
              <p className="t-overline px-2 pb-1 pt-3">
                {group === "main" ? t("nav.section.main") : t("nav.section.system")}
              </p>
              <ul className="flex flex-col gap-0.5">
                {items.map((item) => {
                  const active = route === item.id;
                  const Icon = item.icon;
                  return (
                    <li key={item.id}>
                      <Tooltip
                        side="right"
                        label={
                          <span className="flex items-center gap-2">
                            {t(item.labelKey)}
                            <kbd className="t-mono rounded-xs bg-secondary px-1 text-[10px] text-muted-foreground">
                              ⌘{item.shortcut}
                            </kbd>
                          </span>
                        }
                      >
                        <button
                          type="button"
                          onClick={() => onNavigate(item.id)}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "relative flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium",
                            "transition-colors duration-[var(--motion-duration)] ease-[var(--motion-ease)]",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            active
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                          )}
                        >
                          {active ? (
                            <span
                              aria-hidden
                              className="absolute -left-2 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-info"
                            />
                          ) : null}
                          <Icon className="size-4 shrink-0" aria-hidden />
                          <span className="truncate">{t(item.labelKey)}</span>
                        </button>
                      </Tooltip>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="border-t border-sidebar-border p-2">{engineSummary}</div>
    </nav>
  );
}
