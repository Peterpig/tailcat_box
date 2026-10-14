import * as React from "react";
import { cn } from "@/lib/utils";

/** Standard scrollable screen body used by every page. */
export function ScreenBody({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto", className)} {...props}>
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-4 px-6 py-5">
        {children}
      </div>
    </div>
  );
}

export function ScreenColumns({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
