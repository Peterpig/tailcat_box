import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { normalizeError } from "@/lib/errors";
import { useT, type TranslateParams } from "@/lib/i18n";
import { formatBytes } from "@/lib/format";
import { useAppStore } from "@/store/app";
import type {
  EngineDownloadInfo,
  EngineDownloadProgress,
  EngineStatus,
  UserFacingError,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { ErrorNote } from "@/components/ui/error-note";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { KeyValue, KeyValueList } from "@/components/ui/kv";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import "./messages";

type Translate = (key: string, params?: TranslateParams) => string;

/**
 * Downloads and installs the official tailcat binary for this machine.
 *
 * The panel is deliberately honest about what upstream offers: on platforms
 * with no official artifact (macOS) it hides the button and repeats the
 * backend's reason instead of pretending a download could work. Progress comes
 * only from `tailcat://engine-download`; when the server omits
 * `Content-Length` the bar stays indeterminate rather than inventing a
 * percentage.
 */
export function DownloadPanel() {
  const t = useT();
  const pushToast = useAppStore((state) => state.pushToast);

  const [info, setInfo] = useState<EngineDownloadInfo | null>(null);
  const [infoError, setInfoError] = useState<UserFacingError | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);

  const [version, setVersion] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<EngineDownloadProgress | null>(null);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [installed, setInstalled] = useState<EngineStatus | null>(null);

  const loadInfo = useCallback(async () => {
    setLoadingInfo(true);
    setInfoError(null);
    try {
      setInfo(await api.engineDownloadInfo());
    } catch (cause) {
      setInfoError(normalizeError(cause));
    } finally {
      setLoadingInfo(false);
    }
  }, []);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  async function handleDownload() {
    // The backend shares one `.part` file per version, so a second concurrent
    // download would corrupt the first: refuse to start while one is running.
    if (busy) return;
    setError(null);
    setProgress(null);
    setInstalled(null);
    setBusy(true);
    let unsubscribe: (() => void) | null = null;
    try {
      // Subscribe before invoking so no progress event can be missed.
      unsubscribe = await api.onEngineDownload((event) => setProgress(event));
      const status = await api.engineDownload(version.trim() || null);
      useAppStore.setState({ engine: status });
      setInstalled(status);
      pushToast({
        tone: "success",
        title: t("engine.download.done"),
        description: status.path ?? undefined,
      });
    } catch (cause) {
      setError(normalizeError(cause));
    } finally {
      unsubscribe?.();
      setBusy(false);
    }
  }

  return (
    <Panel>
      <PanelHeader
        title={t("engine.download.title")}
        description={t("engine.download.description")}
        actions={
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void loadInfo()}
          >
            <RefreshCw aria-hidden />
            {t("common.refresh")}
          </Button>
        }
      />
      <PanelBody className="flex flex-col gap-3">
        {loadingInfo ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : infoError ? (
          <ErrorNote error={infoError} />
        ) : info ? (
          <>
            <KeyValueList>
              <KeyValue label={t("engine.download.platform")}>
                {info.platform} · {info.arch}
              </KeyValue>
              <KeyValue label={t("engine.download.latest")}>
                {info.version ?? t("engine.download.unknown")}
              </KeyValue>
              <KeyValue label={t("engine.download.asset")} mono>
                {info.assetName ?? "—"}
              </KeyValue>
            </KeyValueList>

            {!info.supported ? (
              <Callout
                tone="warning"
                title={t("engine.download.unsupportedTitle")}
              >
                <p className="break-words">
                  {info.reason ?? t("engine.download.unknown")}
                </p>
              </Callout>
            ) : (
              <>
                {info.reason ? (
                  <Callout
                    tone="info"
                    title={t("engine.download.feedWarning")}
                  >
                    <p className="break-words">{info.reason}</p>
                  </Callout>
                ) : null}

                <Field
                  label={t("engine.download.versionLabel")}
                  htmlFor="engine-download-version"
                  hint={t("engine.download.versionHint")}
                >
                  <div className="flex items-center gap-2">
                    <Input
                      id="engine-download-version"
                      mono
                      value={version}
                      disabled={busy}
                      placeholder={t("engine.download.versionPlaceholder")}
                      onChange={(event) => setVersion(event.target.value)}
                    />
                    <Button
                      loading={busy}
                      disabled={busy}
                      onClick={() => void handleDownload()}
                    >
                      <Download aria-hidden />
                      {t("engine.download.submit")}
                    </Button>
                  </div>
                </Field>

                {progress ? <ProgressView progress={progress} t={t} /> : null}
                {error ? <ErrorNote error={error} /> : null}
                {installed ? (
                  <Callout tone="success" title={t("engine.download.done")}>
                    <p className="break-words">
                      {t("engine.download.installedPath")}：
                      <span className="t-mono break-all">
                        {installed.path ?? "—"}
                      </span>
                    </p>
                  </Callout>
                ) : null}
              </>
            )}
          </>
        ) : null}
      </PanelBody>
    </Panel>
  );
}

/**
 * Live download state. The bar is determinate only when the backend reported a
 * real total; otherwise it pulses and no percentage is shown.
 */
function ProgressView({
  progress,
  t,
}: {
  progress: EngineDownloadProgress;
  t: Translate;
}) {
  const { phase, downloaded, total, version, message } = progress;
  const hasTotal = typeof total === "number" && total > 0;
  const percent = hasTotal
    ? Math.min(100, Math.round((downloaded / total) * 100))
    : null;

  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-info-soft px-3 py-2.5 text-info">
      <div className="flex items-baseline justify-between gap-2">
        <span className="t-subtitle">{t(`engine.download.phase.${phase}`)}</span>
        {version ? (
          <span className="t-mono text-[12px]">v{version}</span>
        ) : null}
      </div>
      <div
        className="flex items-center gap-2"
        role="progressbar"
        aria-label={t("engine.download.title")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
      >
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-card">
          {percent === null ? (
            <div className="h-full w-full animate-pulse rounded-full bg-[color:var(--info)] opacity-60" />
          ) : (
            <div
              className="h-full rounded-full bg-[color:var(--info)] transition-[width] duration-[var(--motion-duration)] ease-[var(--motion-ease)]"
              style={{ width: `${percent}%` }}
            />
          )}
        </div>
        {percent === null ? null : (
          <span className="t-mono w-10 shrink-0 text-right text-[12px]">
            {t("engine.download.percent", { percent })}
          </span>
        )}
      </div>
      <p className="t-caption opacity-90">
        {hasTotal
          ? t("engine.download.bytes", {
              done: formatBytes(downloaded),
              total: formatBytes(total),
            })
          : t("engine.download.bytesUnknown")}
      </p>
      {message ? (
        <p className="t-caption break-words opacity-90">{message}</p>
      ) : null}
    </div>
  );
}
