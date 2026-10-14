import * as React from "react";
import { cn } from "@/lib/utils";

export function KeyValueList({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <dl className={cn("grid grid-cols-[minmax(88px,auto)_1fr] gap-x-4 gap-y-1.5", className)}>
      {children}
    </dl>
  );
}

export function KeyValue({
  label,
  children,
  mono,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <>
      <dt className="t-caption text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "t-caption min-w-0 break-words text-foreground",
          mono && "font-mono text-[12px]",
          className,
        )}
      >
        {children}
      </dd>
    </>
  );
}
