import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

interface FieldProps {
  label?: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  optional?: boolean;
  optionalLabel?: string;
  className?: string;
  children: React.ReactNode;
}

/** Label + control + hint/error, with a single consistent vertical rhythm. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  optional,
  optionalLabel = "可选",
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor={htmlFor}>
            {label}
            {required ? <span className="text-danger">*</span> : null}
          </Label>
          {optional ? (
            <span className="t-caption text-[color:var(--ash)]">{optionalLabel}</span>
          ) : null}
        </div>
      ) : null}
      {children}
      {error ? (
        <p className="t-caption text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}
