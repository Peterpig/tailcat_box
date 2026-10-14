import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        "peer inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border border-transparent",
        "transition-colors duration-[var(--motion-duration)] ease-[var(--motion-ease)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=unchecked]:bg-border-strong",
        "data-[state=checked]:bg-info",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-3.5 rounded-full bg-switch-thumb shadow-sm ring-0",
          "transition-transform duration-[var(--motion-duration)] ease-[var(--motion-ease)]",
          "data-[state=unchecked]:translate-x-[2px]",
          "data-[state=checked]:translate-x-[16px]",
        )}
      />
    </SwitchPrimitive.Root>
  );
});
