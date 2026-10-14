import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { Badge } from "@/components/ui/badge";
import { ErrorNote } from "@/components/ui/error-note";
import { LogView } from "@/components/ui/log-view";
import { StatusDot } from "@/components/ui/status-dot";
import { formatUptime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { selectLogs, useAppStore } from "@/store/app";
import type { TaskInfo, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Ticking clock so a running task's uptime does not freeze between updates. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Uptime of a finished task stops at its end time; "—" when unknown. */
export function taskUptime(task: TaskInfo, now: number): string {
  const end = task.endedAt ? Date.parse(task.endedAt) : Number.NaN;
  return formatUptime(task.startedAt, Number.isNaN(end) ? now : end);
}

const STATUS_TONE: Record<
  TaskStatus,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  starting: "warning",
  running: "success",
  stopping: "warning",
  stopped: "neutral",
  failed: "danger",
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const t = useT();
  return <Badge tone={STATUS_TONE[status]}>{t(`transfer.status.${status}`)}</Badge>;
}

/** One row of a task list: status, label, meta line, body, actions. */
export function TaskRow({
  task,
  meta,
  actions,
  children,
}: {
  task: TaskInfo;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="rounded-md border border-border bg-card px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <StatusDot status={task.status} pulse className="mt-1.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="t-subtitle min-w-0 break-all">{task.label}</span>
            <TaskStatusBadge status={task.status} />
          </div>
          {meta ? (
            <div className="t-caption mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
              {meta}
            </div>
          ) : null}
          {children}
          {task.error ? <ErrorNote error={task.error} className="mt-2" compact /> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        ) : null}
      </div>
    </li>
  );
}

/** Log console for a task, seeded from the backend on mount. */
export function TaskLogPanel({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  const t = useT();
  const loadLogs = useAppStore((state) => state.loadLogs);
  const lines = useAppStore(useShallow(selectLogs(id)));

  useEffect(() => {
    void loadLogs(id, true);
  }, [id, loadLogs]);

  return (
    <LogView
      lines={lines}
      emptyLabel={t("transfer.logs.empty")}
      className={cn("h-56 overflow-hidden rounded-md border border-border", className)}
    />
  );
}
