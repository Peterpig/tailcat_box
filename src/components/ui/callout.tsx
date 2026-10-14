import * as React from "react";
import { AlertTriangle, Info, OctagonAlert, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  info: {
    icon: Info,
    className: "border-transparent bg-info-soft text-info",
    iconClass: "text-info",
  },
  warning: {
    icon: AlertTriangle,
    className: "border-transparent bg-warning-soft text-warning",
    iconClass: "text-warning",
  },
  danger: {
    icon: OctagonAlert,
    className: "border-transparent bg-danger-soft text-danger",
    iconClass: "text-danger",
  },
  risk: {
    icon: ShieldAlert,
    className: "border-transparent bg-danger-soft text-danger",
    iconClass: "text-danger",
  },
  success: {
    icon: Info,
    className: "border-transparent bg-success-soft text-success",
    iconClass: "text-success",
  },
} as const;

export function Callout({
  tone = "info",
  title,
  children,
  className,
  actions,
}: {
  tone?: keyof typeof TONES;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}) {
  const config = TONES[tone];
  const Icon = config.icon;
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-md px-3 py-2.5",
        config.className,
        className,
      )}
      role={tone === "danger" || tone === "risk" ? "alert" : "note"}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", config.iconClass)} aria-hidden />
      <div className="min-w-0 flex-1">
        {title ? <p className="t-subtitle">{title}</p> : null}
        {children ? (
          <div className={cn("t-caption", title && "mt-0.5")}>{children}</div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}
