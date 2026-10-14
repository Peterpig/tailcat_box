import { useEffect, useState, type ReactNode } from "react";
import { Play, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusDot } from "@/components/ui/status-dot";
import { formatDuration, formatUptime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { TaskInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

const UNKNOWN = "—";

function isActive(task: TaskInfo): boolean {
  return task.status === "running" || task.status === "starting";
}

/** Re-renders once a second while a listed task runs, so uptimes tick. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function uptimeLabel(task: TaskInfo, now: number): string {
  if (isActive(task)) return formatUptime(task.startedAt, now);
  const started = task.startedAt ? Date.parse(task.startedAt) : Number.NaN;
  const ended = task.endedAt ? Date.parse(task.endedAt) : Number.NaN;
  if (!Number.isNaN(started) && !Number.isNaN(ended)) {
    return formatDuration(Math.max(0, ended - started));
  }
  return UNKNOWN;
}

export interface TaskListProps {
  title: string;
  description?: string;
  tasks: TaskInfo[];
  selectedId: string | null;
  emptyTitle: string;
  emptyDescription: string;
  emptyIcon?: ReactNode;
  /** True only when the parameters needed to launch the task again are known. */
  canRestart: (task: TaskInfo) => boolean;
  onSelect: (id: string) => void;
  onStart: (task: TaskInfo) => void;
  onStop: (id: string) => void;
  onRemove: (id: string) => void;
  renderRowExtra?: (task: TaskInfo) => ReactNode;
}

export function TaskList({
  title,
  description,
  tasks,
  selectedId,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  canRestart,
  onSelect,
  onStart,
  onStop,
  onRemove,
  renderRowExtra,
}: TaskListProps) {
  const t = useT();
  const now = useNow(tasks.some(isActive));
  const hasUnrestartable = tasks.some((task) => !isActive(task) && !canRestart(task));

  return (
    <Panel className="flex flex-col">
      <PanelHeader title={title} description={description} />
      <PanelBody className="flex-1">
        {tasks.length === 0 ? (
          <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {tasks.map((task) => {
              const active = isActive(task);
              const restartable = canRestart(task);
              const selected = task.id === selectedId;
              return (
                <li
                  key={task.id}
                  className={cn(
                    "rounded-md border border-border bg-[color:var(--surface-card)] px-2.5 py-2",
                    "transition-colors duration-[var(--motion-duration)] ease-[var(--motion-ease)]",
                    selected && "border-border-strong",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSelect(task.id)}
                      aria-pressed={selected}
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <StatusDot status={task.status} pulse />
                      <span className="min-w-0 flex-1">
                        <span className="t-subtitle block truncate">{task.label}</span>
                        <span className="t-caption flex flex-wrap items-center gap-x-2 text-muted-foreground">
                          <span>
                            {t("common.listenAddr")}{" "}
                            <span className="t-mono text-foreground">
                              {task.listenAddr ?? UNKNOWN}
                            </span>
                          </span>
                          <span>
                            {t("common.uptime")}{" "}
                            <span className="t-mono text-foreground">
                              {uptimeLabel(task, now)}
                            </span>
                          </span>
                        </span>
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      {active ? (
                        <Button size="sm" variant="secondary" onClick={() => onStop(task.id)}>
                          <Square />
                          {t("forwards.action.stop")}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!restartable}
                          title={
                            restartable ? undefined : t("forwards.action.restart.unavailable")
                          }
                          onClick={() => onStart(task)}
                        >
                          <Play />
                          {restartable
                            ? t("forwards.action.restart")
                            : t("forwards.action.start")}
                        </Button>
                      )}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t("forwards.action.delete")}
                        onClick={() => onRemove(task.id)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  {renderRowExtra ? renderRowExtra(task) : null}
                </li>
              );
            })}
          </ul>
        )}
        {hasUnrestartable ? (
          <p className="t-caption mt-2 text-muted-foreground">
            {t("forwards.action.restart.unavailable")}
          </p>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
