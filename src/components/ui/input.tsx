import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  /** Renders the value in the monospace face (tokens, ports, paths). */
  mono?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, invalid, mono, ...props }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "h-8 w-full rounded-md border border-input bg-card px-2.5 text-[13px] text-foreground",
          "transition-colors duration-[var(--motion-duration)] ease-[var(--motion-ease)]",
          "placeholder:text-[color:var(--ash)]",
          "hover:border-border-strong",
          "focus-visible:border-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          mono && "font-mono text-[12.5px]",
          invalid && "border-danger focus-visible:ring-danger-soft",
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full rounded-md border border-input bg-card px-2.5 py-2 text-[13px] text-foreground",
        "placeholder:text-[color:var(--ash)] focus-visible:border-info",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        invalid && "border-danger",
        className,
      )}
      {...props}
    />
  );
});
