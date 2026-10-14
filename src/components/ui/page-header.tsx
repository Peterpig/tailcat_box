import * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex items-start justify-between gap-6 border-b border-border px-6 py-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="t-title-lg truncate">{title}</h1>
        {description ? (
          <p className="t-caption mt-0.5 max-w-2xl text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      ) : null}
    </header>
  );
}
