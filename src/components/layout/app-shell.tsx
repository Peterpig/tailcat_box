import { useEffect } from "react";
import { Sidebar } from "./sidebar";
import { EngineSummary } from "./engine-summary";
import { PreviewBanner } from "./preview-banner";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ROUTES, type Route } from "@/app/routes";

export function AppShell({
  route,
  onNavigate,
  children,
}: {
  route: Route;
  onNavigate: (route: Route) => void;
  children: React.ReactNode;
}) {
  // Cmd/Ctrl + 1..6 jumps between primary screens.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const match = ROUTES.find((item) => item.shortcut === event.key);
      if (!match) return;
      event.preventDefault();
      onNavigate(match.id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNavigate]);

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
        <Sidebar
          route={route}
          onNavigate={onNavigate}
          engineSummary={<EngineSummary onOpenSettings={() => onNavigate("settings")} />}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <PreviewBanner />
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
        </div>
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
