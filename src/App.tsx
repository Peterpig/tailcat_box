import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { QuitGuard } from "@/components/layout/quit-guard";
import { DEFAULT_ROUTE, type Route } from "@/app/routes";
import { useAppStore, wireBackendEvents } from "@/store/app";
import { Skeleton } from "@/components/ui/skeleton";

const HomeScreen = lazy(() => import("@/features/home/HomeScreen"));
const ConnectionsScreen = lazy(() => import("@/features/connections/ConnectionsScreen"));
const ForwardsScreen = lazy(() => import("@/features/forwards/ForwardsScreen"));
const TransferScreen = lazy(() => import("@/features/transfer/TransferScreen"));
const ShareScreen = lazy(() => import("@/features/share/ShareScreen"));
const SettingsScreen = lazy(() => import("@/features/settings/SettingsScreen"));

function ScreenFallback() {
  return (
    <div className="flex flex-1 flex-col gap-4 px-6 py-5">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export default function App() {
  const bootstrap = useAppStore((state) => state.bootstrap);
  const settings = useAppStore((state) => state.settings);
  const [route, setRoute] = useState<Route>(DEFAULT_ROUTE);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const dispose = wireBackendEvents();
    void bootstrap();
    return dispose;
  }, [bootstrap]);

  // Honour the "restore last screen" start behaviour once settings arrive.
  useEffect(() => {
    if (restored || settings.version === 0) return;
    if (settings.startScreen === "last") {
      try {
        const stored = window.localStorage.getItem("tailcat-box.last-route");
        if (stored) setRoute(stored as Route);
      } catch {
        /* ignore */
      }
    }
    setRestored(true);
  }, [settings, restored]);

  const navigate = useCallback((next: Route) => {
    setRoute(next);
    try {
      window.localStorage.setItem("tailcat-box.last-route", next);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <>
      <AppShell route={route} onNavigate={navigate}>
        <Suspense fallback={<ScreenFallback />}>
          {route === "home" ? <HomeScreen onNavigate={navigate} /> : null}
          {route === "connections" ? <ConnectionsScreen onNavigate={navigate} /> : null}
          {route === "forwards" ? <ForwardsScreen onNavigate={navigate} /> : null}
          {route === "transfer" ? <TransferScreen onNavigate={navigate} /> : null}
          {route === "share" ? <ShareScreen onNavigate={navigate} /> : null}
          {route === "settings" ? <SettingsScreen onNavigate={navigate} /> : null}
        </Suspense>
      </AppShell>
      {/* 始终挂载：窗口关闭请求可能在任意页面到达。 */}
      <QuitGuard />
    </>
  );
}

export type ScreenProps = { onNavigate: (route: Route) => void };
