import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Pause, Play, Search } from "lucide-react";
import type { LogLine } from "@/lib/types";
import { Button } from "./button";
import { Input } from "./input";
import { cn } from "@/lib/utils";
import { formatClock } from "@/lib/format";

const LEVEL_CLASS: Record<LogLine["level"], string> = {
  debug: "text-[color:var(--ash)]",
  info: "text-[color:var(--body)]",
  warn: "text-warning",
  error: "text-danger",
};

/**
 * Log console for a task. Diagnostics are visually separated from ordinary
 * output and the view never auto-scrolls while the user is reading history.
 */
export function LogView({
  lines,
  className,
  emptyLabel = "暂无日志输出",
}: {
  lines: LogLine[];
  className?: string;
  emptyLabel?: string;
}) {
  const [follow, setFollow] = useState(true);
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = query
    ? lines.filter((line) =>
        line.text.toLowerCase().includes(query.toLowerCase()),
      )
    : lines;

  useEffect(() => {
    if (!follow) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [filtered.length, follow]);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[color:var(--ash)]" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="过滤日志…"
            className="h-7 pl-7 text-[12px]"
            aria-label="过滤日志"
          />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={follow ? "暂停自动滚动" : "恢复自动滚动"}
          onClick={() => setFollow((value) => !value)}
        >
          {follow ? <Pause /> : <Play />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="滚动到底部"
          onClick={() => {
            setFollow(true);
            const node = scrollRef.current;
            if (node) node.scrollTop = node.scrollHeight;
          }}
        >
          <ArrowDownToLine />
        </Button>
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto bg-surface-inset px-2 py-1.5"
        role="log"
        aria-live="polite"
      >
        {filtered.length === 0 ? (
          <p className="t-caption px-1 py-2 text-[color:var(--ash)]">{emptyLabel}</p>
        ) : (
          filtered.map((line) => (
            <div
              key={line.seq}
              className="t-mono flex gap-2 whitespace-pre-wrap break-words py-[1px] text-[11.5px]"
            >
              <span className="shrink-0 text-[color:var(--ash)]">
                {formatClock(line.ts)}
              </span>
              <span
                className={cn(
                  "shrink-0",
                  line.stream === "stderr"
                    ? "text-warning"
                    : "text-[color:var(--ash)]",
                )}
              >
                {line.stream === "stderr" ? "!" : line.stream === "app" ? "·" : " "}
              </span>
              <span className={cn("min-w-0", LEVEL_CLASS[line.level])}>{line.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
