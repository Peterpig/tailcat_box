import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "./button";
import { CopyButton } from "./copy-button";
import { cn } from "@/lib/utils";
import { truncateMiddle } from "@/lib/format";
import { t } from "@/lib/i18n";

/**
 * Displays a tailcat connection token.
 *
 * A token is a connection credential, so it is masked by default; the copy
 * button always copies the full, unmasked value.
 */
export function AddressField({
  address,
  masked = true,
  className,
  label = t("common.address"),
  emptyLabel = "—",
}: {
  address: string | null;
  masked?: boolean;
  className?: string;
  label?: string;
  emptyLabel?: string;
}) {
  const [revealed, setRevealed] = useState(!masked);

  if (!address) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="t-mono text-[color:var(--ash)]">{emptyLabel}</span>
      </div>
    );
  }

  const display = revealed ? address : truncateMiddle(address, 8, 6);

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border border-border bg-surface-inset px-2 py-1.5",
        className,
      )}
    >
      <span className="t-caption shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          "t-mono min-w-0 flex-1 select-all break-all text-foreground",
          !revealed && "tracking-tight",
        )}
        title={revealed ? undefined : "地址已脱敏，点击眼睛图标查看完整内容"}
      >
        {display}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={revealed ? t("common.hide") : t("common.reveal")}
          onClick={() => setRevealed((value) => !value)}
        >
          {revealed ? <EyeOff /> : <Eye />}
        </Button>
        <CopyButton
          variant="ghost"
          size="icon-sm"
          value={address}
          aria-label={t("common.copy")}
          successTitle="已复制完整地址"
        />
      </div>
    </div>
  );
}
