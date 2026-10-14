import { FlaskConical } from "lucide-react";
import { useAppStore } from "@/store/app";
import { useT } from "@/lib/i18n";

/**
 * Shown only when the frontend runs outside the Tauri shell. It makes it
 * impossible to mistake preview data for a real connection.
 */
export function PreviewBanner() {
  const system = useAppStore((state) => state.system);
  const t = useT();
  if (!system || system.native) return null;

  return (
    <div className="flex items-center gap-2 border-b border-border bg-warning-soft px-4 py-1.5 text-warning">
      <FlaskConical className="size-3.5 shrink-0" aria-hidden />
      <p className="t-caption">
        <span className="font-medium">{t("common.previewMode")}</span>
        <span className="ml-1.5 opacity-90">{t("common.previewHint")}</span>
      </p>
    </div>
  );
}
