import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/lib/types";

const TONE: Record<TaskStatus, string> = {
  starting: "bg-warning",
  running: "bg-success",
  stopping: "bg-warning",
  stopped: "bg-[color:var(--ash)]",
  failed: "bg-danger",
};

export function StatusDot({
  status,
  pulse = false,
  className,
}: {
  status: TaskStatus;
  pulse?: boolean;
  className?: string;
}) {
  const active = status === "running" && pulse;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        TONE[status],
        active && "animate-pulse-ring",
        className,
      )}
    />
  );
}
