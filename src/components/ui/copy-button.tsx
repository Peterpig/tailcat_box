import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button, type ButtonProps } from "./button";
import { writeClipboard } from "@/lib/clipboard";
import { useAppStore } from "@/store/app";
import { t } from "@/lib/i18n";

export function CopyButton({
  value,
  label,
  successTitle = t("common.copied"),
  ...props
}: {
  value: string;
  label?: string;
  successTitle?: string;
} & Omit<ButtonProps, "onClick" | "children">) {
  const [copied, setCopied] = useState(false);
  const pushToast = useAppStore((state) => state.pushToast);
  const failToast = useAppStore((state) => state.failToast);

  return (
    <Button
      {...props}
      onClick={async () => {
        const result = await writeClipboard(value);
        if (result.ok) {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
          pushToast({ tone: "success", title: successTitle });
        } else {
          failToast("复制失败", result.error);
        }
      }}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
      {label}
    </Button>
  );
}
