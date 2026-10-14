import { AlertTriangle, CheckCircle2, Info, OctagonAlert, X } from "lucide-react";
import { useAppStore, type ToastTone } from "@/store/app";
import { cn } from "@/lib/utils";

const TONE = {
  info: { icon: Info, className: "text-info" },
  success: { icon: CheckCircle2, className: "text-success" },
  warning: { icon: AlertTriangle, className: "text-warning" },
  danger: { icon: OctagonAlert, className: "text-danger" },
} satisfies Record<ToastTone, { icon: typeof Info; className: string }>;

export function Toaster() {
  const toasts = useAppStore((state) => state.toasts);
  const dismiss = useAppStore((state) => state.dismissToast);

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
      role="region"
      aria-live="polite"
      aria-label="通知"
    >
      {toasts.map((toast) => {
        const config = TONE[toast.tone];
        const Icon = config.icon;
        return (
          <div
            key={toast.id}
            className="animate-rise-in pointer-events-auto flex items-start gap-2.5 rounded-lg border border-border bg-popover px-3 py-2.5 shadow-popover"
          >
            <Icon className={cn("mt-0.5 size-4 shrink-0", config.className)} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="t-subtitle break-words">{toast.title}</p>
              {toast.description ? (
                <p className="t-caption mt-0.5 break-words text-muted-foreground">
                  {toast.description}
                </p>
              ) : null}
              {toast.error?.detail ? (
                <details className="mt-1">
                  <summary className="t-caption cursor-pointer text-[color:var(--ash)] hover:text-foreground">
                    技术细节
                  </summary>
                  <pre className="t-mono mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-surface-inset p-2 text-[11px] text-[color:var(--body)]">
                    {toast.error.detail}
                  </pre>
                </details>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="关闭通知"
              className="rounded-sm p-0.5 text-[color:var(--ash)] transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
