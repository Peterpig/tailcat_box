import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { api } from "@/lib/api";
import { formatHostPort } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { TaskInfo } from "@/lib/types";
import { useAppStore } from "@/store/app";

/**
 * The port the backend actually bound.
 *
 * Port 0 only ever appears in the request; the assigned port arrives in
 * `listenAddr`, so an unparsable address stays "unknown" instead of being
 * invented.
 */
export function listenPort(task: TaskInfo): number | null {
  const addr = task.listenAddr;
  if (!addr) return null;
  const match = /:(\d+)$/.exec(addr);
  if (!match) return null;
  const port = Number(match[1]);
  return Number.isFinite(port) && port > 0 ? port : null;
}

function listenHost(task: TaskInfo): string {
  const addr = task.listenAddr;
  if (!addr) return "127.0.0.1";
  const index = addr.lastIndexOf(":");
  if (index <= 0) return addr;
  return addr.slice(0, index).replace(/^\[/, "").replace(/\]$/, "");
}

export function serviceScheme(task: TaskInfo): "http" | "https" {
  return task.detail.scheme === "https" ? "https" : "http";
}

/** `http://127.0.0.1:<port>` — null until the backend reports a real port. */
export function serviceUrl(task: TaskInfo): string | null {
  const port = listenPort(task);
  if (port === null) return null;
  return `${serviceScheme(task)}://${formatHostPort(listenHost(task), port)}`;
}

export function ServiceAddress({ task }: { task: TaskInfo }) {
  const t = useT();
  const failToast = useAppStore((state) => state.failToast);
  const url = serviceUrl(task);

  return (
    <div className="mt-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="t-mono min-w-0 flex-1 truncate text-foreground">
          {url ?? "—"}
        </span>
        <CopyButton
          size="sm"
          variant="secondary"
          value={url ?? ""}
          label={t("forwards.action.copyUrl")}
          disabled={!url}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={!url}
          onClick={() => {
            if (!url) return;
            void api.openUrl(url).catch((error) => {
              failToast(t("forwards.action.openBrowser"), error);
            });
          }}
        >
          <ExternalLink />
          {t("forwards.action.openBrowser")}
        </Button>
      </div>
      {url ? null : (
        <p className="t-caption mt-1 text-muted-foreground">
          {t("forwards.service.notReady")}
        </p>
      )}
    </div>
  );
}
