import { useEffect, useState } from "react";
import { Radar, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { normalizeError } from "@/lib/errors";
import { useT } from "@/lib/i18n";
import { formatRtt } from "@/lib/format";
import { validateAddress, validateUrl } from "@/lib/validation";
import { useAppStore } from "@/store/app";
import type { EngineSource, PingResult, UserFacingError } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { ErrorNote } from "@/components/ui/error-note";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { KeyValue, KeyValueList } from "@/components/ui/kv";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { DownloadPanel } from "./DownloadPanel";
import { KeyManager } from "./KeyManager";
import "./messages";

const RELEASES_URL = "https://github.com/tailscale/tailcat/releases";

const SOURCE_KEY: Record<EngineSource, string> = {
  bundled: "engine.source.bundled",
  path: "engine.source.path",
  custom: "engine.source.custom",
  missing: "engine.source.missing",
};

/**
 * Engine detection, binary path and DERP map configuration.
 *
 * Everything that changes engine state goes through `api.engine*`; the store
 * is updated from the returned `EngineStatus` so the sidebar summary stays in
 * sync with what the CLI actually reports.
 */
export function EnginePanel() {
  const t = useT();
  const engine = useAppStore((state) => state.engine);
  const engineBusy = useAppStore((state) => state.engineBusy);
  const refreshEngine = useAppStore((state) => state.refreshEngine);
  const pushToast = useAppStore((state) => state.pushToast);

  const [path, setPath] = useState(engine?.configuredPath ?? "");
  const [pathError, setPathError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<UserFacingError | null>(null);

  const [derp, setDerp] = useState(engine?.derpMapUrl ?? "");
  const [derpError, setDerpError] = useState<string | null>(null);
  const [derpBusy, setDerpBusy] = useState(false);

  const [probe, setProbe] = useState("");
  const [probeError, setProbeError] = useState<string | null>(null);
  const [probeBusy, setProbeBusy] = useState(false);
  const [probeResult, setProbeResult] = useState<PingResult | null>(null);

  const configuredPath = engine?.configuredPath ?? null;
  const derpMapUrl = engine?.derpMapUrl ?? null;

  // Mirror engine state into the inputs when it changes underneath us (a
  // refresh, a backend push event, or another screen editing the setting).
  useEffect(() => {
    setPath(configuredPath ?? "");
  }, [configuredPath]);

  useEffect(() => {
    setDerp(derpMapUrl ?? "");
  }, [derpMapUrl]);

  async function handleDetect() {
    setActionError(null);
    const value = path.trim();
    if (!value) {
      setPathError(t("engine.path.empty"));
      return;
    }
    setPathError(null);
    setBusy(true);
    try {
      const status = await api.engineDetect(value);
      useAppStore.setState({ engine: status });
      pushToast({ tone: "success", title: t("engine.path.saved") });
    } catch (error) {
      setActionError(normalizeError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleUseSystemPath() {
    setActionError(null);
    setPathError(null);
    setBusy(true);
    try {
      const status = await api.engineSetPath(null);
      useAppStore.setState({ engine: status });
      setPath("");
      pushToast({ tone: "success", title: t("engine.path.systemCleared") });
    } catch (error) {
      setActionError(normalizeError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveDerp() {
    setActionError(null);
    const value = derp.trim();
    if (value) {
      const result = validateUrl(value);
      if (!result.ok) {
        setDerpError(result.message ?? t("engine.derp.invalid"));
        return;
      }
      if (!value.toLowerCase().startsWith("https://")) {
        setDerpError(t("engine.derp.https"));
        return;
      }
    }
    setDerpError(null);
    setDerpBusy(true);
    try {
      const status = await api.engineSetDerpMap(value ? value : null);
      useAppStore.setState({ engine: status });
      pushToast({
        tone: "success",
        title: value ? t("engine.derp.saved") : t("engine.derp.cleared"),
      });
    } catch (error) {
      setActionError(normalizeError(error));
    } finally {
      setDerpBusy(false);
    }
  }

  async function handleProbe() {
    setActionError(null);
    setProbeResult(null);
    const value = probe.trim();
    if (!value) {
      setProbeError(t("engine.ping.empty"));
      return;
    }
    const validation = validateAddress(value);
    if (!validation.ok) {
      setProbeError(validation.message ?? t("engine.ping.empty"));
      return;
    }
    setProbeError(null);
    setProbeBusy(true);
    try {
      setProbeResult(await api.enginePing(value));
    } catch (error) {
      setActionError(normalizeError(error));
    } finally {
      setProbeBusy(false);
    }
  }

  const found = engine?.found ?? false;

  return (
    <div className="flex flex-col gap-4">
      {actionError ? <ErrorNote error={actionError} /> : null}

      <Panel>
        <PanelHeader
          title={t("engine.status.title")}
          description={t("engine.status.description")}
          actions={
            <Button
              size="sm"
              variant="secondary"
              loading={engineBusy}
              onClick={() => void refreshEngine()}
            >
              <RefreshCw aria-hidden />
              {t("common.refresh")}
            </Button>
          }
        />
        <PanelBody className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            {engine ? (
              <Badge tone={found ? "success" : "warning"}>
                {found ? t("engine.status.found") : t("engine.status.missing")}
              </Badge>
            ) : (
              <span className="t-caption text-muted-foreground">
                {t("engine.status.unknown")}
              </span>
            )}
            {found && engine?.version ? (
              <span className="t-caption text-muted-foreground">
                tailcat {engine.version}
              </span>
            ) : null}
          </div>
          <p className="t-caption text-muted-foreground">
            {t("engine.status.readiness")}
          </p>

          <KeyValueList>
            <KeyValue label={t("engine.status.source")}>
              {engine ? t(SOURCE_KEY[engine.source]) : "—"}
            </KeyValue>
            <KeyValue label={t("engine.status.version")}>
              {engine?.version ?? "—"}
            </KeyValue>
            <KeyValue label={t("engine.status.binary")} mono>
              {engine?.path ?? "—"}
            </KeyValue>
            <KeyValue label={t("engine.status.keysDir")} mono>
              {engine?.keysDir ?? "—"}
            </KeyValue>
            <KeyValue label={t("engine.status.derp")} mono>
              {engine?.derpMapUrl ?? t("engine.status.derpDefault")}
            </KeyValue>
          </KeyValueList>

          {!found ? (
            <Callout
              tone="warning"
              title={t("engine.missing.title")}
              actions={
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void api.openUrl(RELEASES_URL)}
                >
                  {t("engine.missing.openReleases")}
                </Button>
              }
            >
              <p>{t("engine.missing.body")}</p>
              <ul className="mt-1.5 flex flex-col gap-1">
                <li>· {t("engine.missing.brew")}</li>
                <li>· {t("engine.missing.releases")}</li>
                <li>· {t("engine.missing.customPath")}</li>
              </ul>
              <p className="mt-1.5 opacity-90">{t("engine.missing.noScript")}</p>
            </Callout>
          ) : null}

          {engine?.error ? <ErrorNote error={engine.error} compact /> : null}
        </PanelBody>
      </Panel>

      <DownloadPanel />

      <Panel>
        <PanelHeader title={t("engine.path.title")} />
        <PanelBody className="flex flex-col gap-3">
          <Field
            label={t("engine.path.label")}
            htmlFor="engine-path"
            hint={t("engine.path.hint")}
            error={pathError}
          >
            <div className="flex items-center gap-2">
              <Input
                id="engine-path"
                mono
                value={path}
                invalid={Boolean(pathError)}
                placeholder={t("engine.path.placeholder")}
                onChange={(event) => setPath(event.target.value)}
              />
              <Button
                variant="secondary"
                loading={busy}
                onClick={() => void handleDetect()}
              >
                {t("engine.path.detect")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => void handleUseSystemPath()}
              >
                {t("engine.path.useSystem")}
              </Button>
            </div>
          </Field>

        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title={t("engine.derp.title")} />
        <PanelBody className="flex flex-col gap-3">
          <Field
            label={t("engine.derp.label")}
            htmlFor="engine-derp"
            hint={t("engine.derp.hint")}
            error={derpError}
          >
            <div className="flex items-center gap-2">
              <Input
                id="engine-derp"
                mono
                value={derp}
                invalid={Boolean(derpError)}
                placeholder={t("engine.derp.placeholder")}
                onChange={(event) => setDerp(event.target.value)}
              />
              <Button loading={derpBusy} onClick={() => void handleSaveDerp()}>
                {t("engine.derp.save")}
              </Button>
            </div>
          </Field>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title={t("engine.ping.title")}
          description={t("engine.ping.description")}
        />
        <PanelBody className="flex flex-col gap-3">
          <Field
            label={t("engine.ping.address")}
            htmlFor="engine-probe"
            error={probeError}
          >
            <div className="flex items-center gap-2">
              <Input
                id="engine-probe"
                mono
                value={probe}
                invalid={Boolean(probeError)}
                placeholder={t("engine.ping.placeholder")}
                onChange={(event) => setProbe(event.target.value)}
              />
              <Button loading={probeBusy} onClick={() => void handleProbe()}>
                <Radar aria-hidden />
                {t("engine.ping.run")}
              </Button>
            </div>
          </Field>

          {probeResult && probeResult.pongs.length > 0 ? (
            <div className="flex flex-col gap-1.5 rounded-md bg-info-soft px-3 py-2.5 text-info">
              <p className="t-subtitle">
                {t("engine.ping.ok", { count: probeResult.pongs.length })}
              </p>
              <ul className="flex flex-col gap-0.5">
                {probeResult.pongs.map((pong, index) => (
                  <li key={`${pong.via}-${index}`} className="t-mono">
                    {formatRtt(pong.rttMs)} · {t("engine.ping.via")} {pong.via} ·{" "}
                    {pong.direct
                      ? t("engine.ping.direct")
                      : t("engine.ping.relay")}
                  </li>
                ))}
              </ul>
            </div>
          ) : probeResult?.error ? (
            // 探测失败按真实错误呈现，不再标注「仅供参考」。
            <ErrorNote error={probeResult.error} />
          ) : probeResult ? (
            <p className="t-caption text-muted-foreground">
              {t("engine.ping.noResponse")}
            </p>
          ) : null}
        </PanelBody>
      </Panel>

      <KeyManager />
    </div>
  );
}
