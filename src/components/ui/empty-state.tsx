import * as React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-0.5 flex size-9 items-center justify-center rounded-md bg-secondary text-muted-foreground [&_svg]:size-4">
          {icon}
        </div>
      ) : null}
      <p className="t-title">{title}</p>
      {description ? (
        <p className="t-caption max-w-md text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2 flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
