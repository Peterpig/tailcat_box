import { useState } from "react";
import { ChevronDown, ChevronRight, Copy } from "lucide-react";
import type { UserFacingError } from "@/lib/types";
import { Button } from "./button";
import { writeClipboard } from "@/lib/clipboard";
import { useAppStore } from "@/store/app";
import { cn } from "@/lib/utils";

/**
 * Renders a normalised backend error: the message always, the raw diagnostic
 * only when the user asks for it. Raw process output is never shown by default.
 */
export function ErrorNote({
  error,
  className,
  compact = false,
}: {
  error: UserFacingError;
  className?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pushToast = useAppStore((state) => state.pushToast);
  const hasDetail = Boolean(error.detail);

  return (
    <div
      className={cn(
        "rounded-md bg-danger-soft px-3 py-2.5 text-danger",
        className,
      )}
      role="alert"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="t-subtitle break-words">{error.message}</p>
          {error.hint ? (
            <p className="t-caption mt-0.5 opacity-90">{error.hint}</p>
          ) : null}
          <p className="t-caption mt-1 font-mono text-[11px] opacity-70">
            {error.code}
          </p>
        </div>
        {hasDetail ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-danger hover:bg-danger-soft"
              aria-label={open ? "收起错误详情" : "展开错误详情"}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <ChevronDown /> : <ChevronRight />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-danger hover:bg-danger-soft"
              aria-label="复制错误详情"
              onClick={async () => {
                const result = await writeClipboard(
                  `${error.code}: ${error.message}\n${error.detail ?? ""}`,
                );
                if (result.ok) pushToast({ tone: "success", title: "已复制错误详情" });
              }}
            >
              <Copy />
            </Button>
          </div>
        ) : null}
      </div>
      {open && hasDetail ? (
        <pre className="t-mono mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-surface-inset p-2 text-[11.5px] text-[color:var(--body)]">
          {error.detail}
        </pre>
      ) : null}
      {!compact && null}
    </div>
  );
}
