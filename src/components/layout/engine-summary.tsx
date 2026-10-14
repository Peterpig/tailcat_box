import { AlertTriangle, ChevronRight, Cpu } from "lucide-react";
import { useAppStore } from "@/store/app";
import { cn } from "@/lib/utils";
import { registerMessages, useT } from "@/lib/i18n";

registerMessages({
  "engine.missingShort": { "zh-CN": "未检测到 tailcat", en: "tailcat not found" },
  "engine.openSettings": { "zh-CN": "点击前往设置", en: "Open settings" },
});

/** Compact engine state pinned to the bottom of the sidebar. */
export function EngineSummary({ onOpenSettings }: { onOpenSettings: () => void }) {
  const engine = useAppStore((state) => state.engine);
  const engineBusy = useAppStore((state) => state.engineBusy);
  const t = useT();

  const found = engine?.found ?? false;

  return (
    <button
      type="button"
      onClick={onOpenSettings}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left",
        "transition-colors duration-[var(--motion-duration)] ease-[var(--motion-ease)]",
        "hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {found ? (
        <Cpu className="size-3.5 shrink-0 text-success" aria-hidden />
      ) : (
        <AlertTriangle className="size-3.5 shrink-0 text-warning" aria-hidden />
      )}
      <span className="min-w-0 flex-1">
        <span className="t-caption block truncate font-medium text-foreground">
          {engineBusy
            ? "检测引擎…"
            : found
              ? `tailcat ${engine?.version ?? ""}`.trim()
              : t("engine.missingShort")}
        </span>
        <span className="t-caption block truncate text-[color:var(--ash)]">
          {found ? sourceLabel(engine?.source) : t("engine.openSettings")}
        </span>
      </span>
      <ChevronRight className="size-3.5 shrink-0 text-[color:var(--ash)]" aria-hidden />
    </button>
  );
}

function sourceLabel(source: string | undefined): string {
  switch (source) {
    case "bundled":
      return "内置二进制";
    case "custom":
      return "自定义路径";
    case "path":
      return "系统 PATH";
    default:
      return "未检测到";
  }
}
