import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  FolderSync,
  Globe,
  Play,
  RadioTower,
  RefreshCw,
  Square,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { ScreenBody, ScreenColumns } from "@/components/layout/screen";
import {
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
  SectionTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { ErrorNote } from "@/components/ui/error-note";
import { StatusDot } from "@/components/ui/status-dot";
import { AddressField } from "@/components/ui/address-field";
import { CopyButton } from "@/components/ui/copy-button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { KeyValue, KeyValueList } from "@/components/ui/kv";
import { LogView } from "@/components/ui/log-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { normalizeError } from "@/lib/errors";
import { formatRtt, formatUptime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import {
  isLoopbackHost,
  parseServeTargets,
  validateAddress,
  validateBindHost,
  validateListenPort,
  validateRemotePort,
  validateServeTarget,
  type ValidationResult,
} from "@/lib/validation";
import { useAppStore } from "@/store/app";
import type {
  LogLine,
  ParsedAddress,
  PingResult,
  SavedKey,
  TaskInfo,
  TaskStatus,
  UserFacingError,
} from "@/lib/types";
import type { ScreenProps } from "@/App";
import "./messages";

const EMPTY_LOGS: LogLine[] = [];

const SERVICE_CHIPS = ["files", "no-auth-ssh", "exit-node", "all"] as const;

/** Extra explanation for the two service names whose effect is not obvious. */
const SERVICE_HINTS = [
  { value: "files", hintKey: "connections.listen.service.files.hint" },
  { value: "no-auth-ssh", hintKey: "connections.listen.service.no-auth-ssh.hint" },
] as const;

const FILE_MODES = ["ro", "rw", "wo", "wo+"] as const;
type FileMode = (typeof FILE_MODES)[number];

const HTTPS_PORTS = new Set([443, 8443, 9443]);
const HTTP_PORTS = new Set([80, 3000, 5000, 8000, 8008, 8080, 8081, 8888, 9000, 9090]);

function guessScheme(port: number | null): "http" | "https" | null {
  if (port === null) return null;
  if (HTTPS_PORTS.has(port)) return "https";
  if (HTTP_PORTS.has(port)) return "http";
  return null;
}

/** 0.0.0.0 / :: are valid binds but useless in a browser URL. */
function browserHost(hostPort: string): string {
  return hostPort
    .replace(/^0\.0\.0\.0:/, "127.0.0.1:")
    .replace(/^\[::\]:/, "[::1]:");
}

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export default function ConnectionsScreen({ onNavigate }: ScreenProps) {
  const t = useT();
  const engineReady = useAppStore((state) => Boolean(state.engine?.found));

  return (
    <>
      <PageHeader
        title={t("connections.title")}
        description={t("connections.description")}
      />
      <ScreenBody>
        <Tabs defaultValue="listen" className="flex flex-col gap-4">
          <TabsList>
            <TabsTrigger value="listen">{t("connections.tab.listen")}</TabsTrigger>
            <TabsTrigger value="connect">{t("connections.tab.connect")}</TabsTrigger>
          </TabsList>

          <TabsContent value="listen" className="flex flex-col gap-4">
            <ListenTab engineReady={engineReady} onNavigate={onNavigate} />
          </TabsContent>
          <TabsContent value="connect" className="flex flex-col gap-4">
            <ConnectTab engineReady={engineReady} onNavigate={onNavigate} />
          </TabsContent>
        </Tabs>
      </ScreenBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared                                                                     */
/* -------------------------------------------------------------------------- */

function reasonText(t: ReturnType<typeof useT>, result: ValidationResult): string {
  if (result.reason) return t(`connections.reason.${result.reason}`);
  return result.message ?? t("connections.reason.unknown");
}

function EngineMissingCallout({ onNavigate }: { onNavigate: ScreenProps["onNavigate"] }) {
  const t = useT();
  return (
    <Callout
      tone="warning"
      title={t("connections.engineMissing.title")}
      actions={
        <Button size="sm" variant="secondary" onClick={() => onNavigate("settings")}>
          {t("connections.goSettings")}
        </Button>
      }
    >
      {t("connections.engineMissing.body")}
    </Callout>
  );
}

function statusMeta(status: TaskStatus): {
  key: string;
  tone: "neutral" | "success" | "warning" | "danger";
} {
  switch (status) {
    case "running":
      return { key: "common.running", tone: "success" };
    case "starting":
      return { key: "common.starting", tone: "warning" };
    case "stopping":
      return { key: "common.stopping", tone: "warning" };
    case "failed":
      return { key: "common.failed", tone: "danger" };
    default:
      return { key: "common.stopped", tone: "neutral" };
  }
}

/** Live task row used by both tabs; reads the task back out of the store. */
function TaskResult({
  task,
  logs,
  children,
  onStop,
  onReloadLogs,
  stopLabel,
}: {
  task: TaskInfo;
  logs: LogLine[];
  children?: ReactNode;
  onStop: () => void;
  onReloadLogs: () => void;
  stopLabel: string;
}) {
  const t = useT();
  const now = useNow();
  const redact = useAppStore((state) => state.settings.redactAddresses);
  const meta = statusMeta(task.status);
  const stoppable = task.status === "running" || task.status === "starting";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusDot status={task.status} pulse />
        <Badge tone={meta.tone}>{t(meta.key)}</Badge>
        <span className="t-caption text-muted-foreground">
          {t("common.uptime")} {formatUptime(task.startedAt, now)}
        </span>
        {task.pid !== null ? (
          <span className="t-caption text-muted-foreground">
            {t("common.pid")} {task.pid}
          </span>
        ) : null}
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={onReloadLogs}
          aria-label={t("common.refresh")}
        >
          <RefreshCw />
        </Button>
        <Button variant="dangerGhost" size="sm" disabled={!stoppable} onClick={onStop}>
          <Square />
          {stopLabel}
        </Button>
      </div>

      {children}

      {task.address ? <AddressField address={task.address} masked={redact} /> : null}

      <LogView lines={logs} className="h-56 rounded-md border border-border" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tab 1 - create a listener                                                  */
/* -------------------------------------------------------------------------- */

function ListenTab({
  engineReady,
  onNavigate,
}: {
  engineReady: boolean;
  onNavigate: ScreenProps["onNavigate"];
}) {
  const t = useT();
  const startTask = useAppStore((state) => state.startTask);
  const stopTask = useAppStore((state) => state.stopTask);
  const loadLogs = useAppStore((state) => state.loadLogs);
  const failToast = useAppStore((state) => state.failToast);

  const [targetInput, setTargetInput] = useState("");
  const [filesDir, setFilesDir] = useState<string | null>(null);
  const [filesMode, setFilesMode] = useState<FileMode>("ro");
  const [keyMode, setKeyMode] = useState<"temp" | "saved">("temp");
  const [savedKeyName, setSavedKeyName] = useState("");
  const [savedKeys, setSavedKeys] = useState<SavedKey[]>([]);
  const [keysError, setKeysError] = useState<UserFacingError | null>(null);
  const [allowInput, setAllowInput] = useState("");
  const [fullAddress, setFullAddress] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);

  const targets = useMemo(() => parseServeTargets(targetInput), [targetInput]);
  const invalidTargets = useMemo(
    () =>
      targets
        .map((value) => ({ value, result: validateServeTarget(value) }))
        .filter((item) => !item.result.ok),
    [targets],
  );
  const hasFiles = targets.includes("files");
  const allowList = useMemo(
    () => allowInput.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean),
    [allowInput],
  );

  const task = useAppStore((state) =>
    taskId ? (state.tasks.find((item) => item.id === taskId) ?? null) : null,
  );
  const logs = useAppStore((state) =>
    taskId ? (state.logs[taskId] ?? EMPTY_LOGS) : EMPTY_LOGS,
  );

  useEffect(() => {
    if (!engineReady) return;
    let cancelled = false;
    api
      .engineKeys()
      .then((keys) => {
        if (cancelled) return;
        // Only server keys can sign a listener; client identities are for the
        // dialing side and would be rejected by `tailcat serve --key`.
        setSavedKeys(keys.filter((key) => !key.client));
        setKeysError(null);
      })
      .catch((error) => {
        if (!cancelled) setKeysError(normalizeError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [engineReady]);

  const targetError = invalidTargets.length
    ? invalidTargets
        .map((item) =>
          t("connections.listen.targets.invalid", {
            value: item.value,
            reason: reasonText(t, item.result),
          }),
        )
        .join("；")
    : null;

  const missingFilesDir = hasFiles && !filesDir;
  const canSubmit =
    engineReady && !submitting && targets.length > 0 && !targetError && !missingFilesDir;

  function appendTarget(value: string) {
    setTargetInput((current) => {
      const existing = parseServeTargets(current);
      if (existing.includes(value)) return current;
      return existing.length ? `${existing.join(" ")} ${value}` : value;
    });
  }

  async function pickDirectory() {
    try {
      const picked = await open({ directory: true, multiple: false });
      if (typeof picked === "string") setFilesDir(picked);
    } catch (error) {
      failToast(t("common.selectDirectory"), error);
    }
  }

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const created = await startTask({
        kind: "serve",
        targets,
        filesDir: hasFiles ? filesDir : null,
        filesMode: hasFiles ? filesMode : undefined,
        keyName: keyMode === "temp" ? "new" : savedKeyName || null,
        allow: allowList,
        fullAddress,
      });
      if (created) {
        setTaskId(created.id);
        void loadLogs(created.id, true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!engineReady ? <EngineMissingCallout onNavigate={onNavigate} /> : null}

      <Panel>
        <PanelHeader
          title={t("connections.tab.listen")}
          description={t("connections.listen.targets.hint")}
        />
        <PanelBody className="flex flex-col gap-4">
          <Field
            label={t("connections.listen.targets.label")}
            htmlFor="serve-targets"
            required
            error={targetError ?? (missingFilesDir ? t("connections.listen.files.dirRequired") : null)}
          >
            <Input
              id="serve-targets"
              value={targetInput}
              mono
              invalid={Boolean(targetError) || missingFilesDir}
              placeholder={t("connections.listen.targets.placeholder")}
              onChange={(event) => setTargetInput(event.target.value)}
            />
          </Field>

          <div className="flex flex-col gap-2">
            <p className="t-caption text-muted-foreground">
              {t("connections.listen.services.label")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SERVICE_CHIPS.map((chip) => (
                <Button
                  key={chip}
                  variant="secondary"
                  size="sm"
                  onClick={() => appendTarget(chip)}
                >
                  {t(`connections.listen.service.${chip}`)}
                </Button>
              ))}
            </div>
            <p className="t-caption text-muted-foreground">
              {t("connections.listen.services.exposure")}
            </p>
            <ul className="flex flex-col gap-0.5">
              {SERVICE_HINTS.map((hint) => (
                <li key={hint.value} className="t-caption text-muted-foreground">
                  <span className="font-mono text-foreground">{hint.value}</span>{" "}
                  {t(hint.hintKey)}
                </li>
              ))}
            </ul>
          </div>

          {hasFiles ? (
            <div className="flex flex-col gap-3 rounded-md border border-border bg-[color:var(--surface-inset)] p-3">
              <SectionTitle>{t("connections.listen.files.title")}</SectionTitle>
              <Field
                label={t("connections.listen.files.dir")}
                htmlFor="serve-files-dir"
                hint={t("connections.listen.files.dirHint")}
                required
              >
                <div className="flex items-center gap-2">
                  <Input
                    id="serve-files-dir"
                    value={filesDir ?? ""}
                    mono
                    invalid={missingFilesDir}
                    placeholder={t("common.selectDirectory")}
                    onChange={(event) =>
                      setFilesDir(event.target.value.length ? event.target.value : null)
                    }
                  />
                  <Button variant="secondary" onClick={() => void pickDirectory()}>
                    <FolderOpen />
                    {t("common.browse")}
                  </Button>
                </div>
              </Field>

              <Field label={t("connections.listen.files.mode")}>
                <div className="flex flex-wrap gap-1.5">
                  {FILE_MODES.map((mode) => (
                    <Button
                      key={mode}
                      variant={filesMode === mode ? "primary" : "secondary"}
                      size="sm"
                      aria-pressed={filesMode === mode}
                      onClick={() => setFilesMode(mode)}
                    >
                      {t(`connections.listen.files.mode.${mode}`)}
                    </Button>
                  ))}
                </div>
              </Field>
              <p className="t-caption text-muted-foreground">
                {t(`connections.listen.files.mode.${filesMode}.desc`)}
              </p>
              {filesMode === "rw" ? (
                <Callout
                  tone="risk"
                  title={t("connections.listen.files.rwRisk.title")}
                >
                  {t("connections.listen.files.rwRisk.body")}
                </Callout>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <SectionTitle>{t("connections.listen.key.label")}</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              <Button
                variant={keyMode === "temp" ? "primary" : "secondary"}
                size="sm"
                aria-pressed={keyMode === "temp"}
                onClick={() => setKeyMode("temp")}
              >
                {t("connections.listen.key.temp")}
              </Button>
              <Button
                variant={keyMode === "saved" ? "primary" : "secondary"}
                size="sm"
                aria-pressed={keyMode === "saved"}
                onClick={() => setKeyMode("saved")}
              >
                {t("connections.listen.key.saved")}
              </Button>
            </div>
            <p className="t-caption text-muted-foreground">
              {keyMode === "temp"
                ? t("connections.listen.key.temp.desc")
                : t("connections.listen.key.saved.desc")}
            </p>
            {keyMode === "saved" ? (
              keysError ? (
                <ErrorNote error={keysError} />
              ) : savedKeys.length === 0 ? (
                <p className="t-caption text-warning">
                  {t("connections.listen.key.none")}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {savedKeys.map((key) => (
                    <Button
                      key={key.name}
                      variant={savedKeyName === key.name ? "primary" : "secondary"}
                      size="sm"
                      aria-pressed={savedKeyName === key.name}
                      onClick={() => setSavedKeyName(key.name)}
                    >
                      <span className="font-mono">{key.name}</span>
                      {key.isDefault ? <Badge tone="outline">default</Badge> : null}
                    </Button>
                  ))}
                </div>
              )
            ) : null}
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((value) => !value)}
            >
              {advancedOpen ? <ChevronDown /> : <ChevronRight />}
              {t("connections.listen.advanced")}
            </Button>

            {advancedOpen ? (
              <div className="flex flex-col gap-3">
                <Field
                  label={t("connections.listen.allow.label")}
                  htmlFor="serve-allow"
                  hint={t("connections.listen.allow.hint")}
                >
                  <Textarea
                    id="serve-allow"
                    value={allowInput}
                    rows={3}
                    placeholder={t("connections.listen.allow.placeholder")}
                    onChange={(event) => setAllowInput(event.target.value)}
                  />
                </Field>
                <label className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-3.5 accent-[color:var(--info)]"
                    checked={fullAddress}
                    onChange={(event) => setFullAddress(event.target.checked)}
                  />
                  <span>
                    <span className="t-subtitle block">
                      {t("connections.listen.fullAddress.label")}
                    </span>
                    <span className="t-caption block text-muted-foreground">
                      {t("connections.listen.fullAddress.hint")}
                    </span>
                  </span>
                </label>
              </div>
            ) : null}
          </div>
        </PanelBody>
        <PanelFooter>
          <Button
            variant="primary"
            loading={submitting}
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            <RadioTower />
            {submitting ? t("connections.listen.starting") : t("connections.listen.start")}
          </Button>
        </PanelFooter>
      </Panel>

      {task ? (
        <Panel>
          <PanelHeader
            title={t("connections.listen.result.title")}
            description={task.label}
          />
          <PanelBody>
            <TaskResult
              task={task}
              logs={logs}
              stopLabel={t("connections.listen.stop")}
              onStop={() => void stopTask(task.id)}
              onReloadLogs={() => void loadLogs(task.id, true)}
            >
              <div className="flex flex-col gap-2">
                <SectionTitle
                  action={
                    task.address ? (
                      <CopyButton
                        variant="secondary"
                        size="sm"
                        value={t("connections.listen.shareText", { address: task.address })}
                        label={t("connections.listen.result.copyShare")}
                      />
                    ) : null
                  }
                >
                  {t("connections.listen.result.address")}
                </SectionTitle>
                {task.address ? null : (
                  <p className="t-caption text-muted-foreground">
                    {t("connections.listen.result.addressPending")}
                  </p>
                )}
              </div>
              <p className="t-caption text-muted-foreground">
                {t("connections.listen.psk.note")}
              </p>
            </TaskResult>
          </PanelBody>
        </Panel>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tab 2 - connect to a peer                                                  */
/* -------------------------------------------------------------------------- */

function ConnectTab({
  engineReady,
  onNavigate,
}: {
  engineReady: boolean;
  onNavigate: ScreenProps["onNavigate"];
}) {
  const t = useT();
  const startTask = useAppStore((state) => state.startTask);
  const stopTask = useAppStore((state) => state.stopTask);
  const loadLogs = useAppStore((state) => state.loadLogs);
  const refreshHistory = useAppStore((state) => state.refreshHistory);
  const pushToast = useAppStore((state) => state.pushToast);
  const allowNonLoopback = useAppStore((state) => state.settings.allowNonLoopbackBind);
  const updateSettings = useAppStore((state) => state.updateSettings);

  const [address, setAddress] = useState("");
  const [touched, setTouched] = useState(false);
  const [parsed, setParsed] = useState<ParsedAddress | null>(null);
  const [parseError, setParseError] = useState<UserFacingError | null>(null);
  const [parsing, setParsing] = useState(false);
  const [ping, setPing] = useState<PingResult | null>(null);
  const [pinging, setPinging] = useState(false);
  const [remotePort, setRemotePort] = useState("");
  const [localPort, setLocalPort] = useState("0");
  const [bindHost, setBindHost] = useState("127.0.0.1");
  const [starting, setStarting] = useState(false);
  const [forwardId, setForwardId] = useState<string | null>(null);
  const forwardRef = useRef<HTMLDivElement>(null);

  const forwardTask = useAppStore((state) =>
    forwardId ? (state.tasks.find((item) => item.id === forwardId) ?? null) : null,
  );
  const logs = useAppStore((state) =>
    forwardId ? (state.logs[forwardId] ?? EMPTY_LOGS) : EMPTY_LOGS,
  );

  const addressResult = validateAddress(address);
  const remotePortResult = validateRemotePort(remotePort);
  const localPortResult = validateListenPort(localPort);
  const bindHostResult = validateBindHost(bindHost);

  const showAddressError = touched && address.trim().length > 0 && !addressResult.ok;
  const loopback = isLoopbackHost(bindHost);
  // Convention §6: exposing a listener beyond loopback needs an explicit opt-in.
  const blockedBind = !loopback && !allowNonLoopback;
  const canForward =
    engineReady &&
    !starting &&
    !blockedBind &&
    addressResult.ok &&
    remotePortResult.ok &&
    localPortResult.ok &&
    bindHostResult.ok;

  async function runParse(): Promise<boolean> {
    setParsing(true);
    setParseError(null);
    try {
      const result = await api.engineParse(address.trim());
      setParsed(result);
      return true;
    } catch (error) {
      setParsed(null);
      setParseError(normalizeError(error));
      return false;
    } finally {
      setParsing(false);
    }
  }

  async function verify() {
    setTouched(true);
    if (!addressResult.ok) return;
    await runParse();
  }

  async function testReachability() {
    setTouched(true);
    if (!addressResult.ok) return;
    setPinging(true);
    setPing(null);
    try {
      setPing(await api.enginePing(address.trim()));
    } catch (error) {
      setPing({
        ok: false,
        direct: false,
        pongs: [],
        error: normalizeError(error),
      });
    } finally {
      setPinging(false);
    }
  }

  async function saveToHistory() {
    setTouched(true);
    if (!addressResult.ok) return;
    if (await runParse()) {
      pushToast({
        tone: "info",
        title: t("connections.connect.address.saved"),
        description: t("connections.connect.address.savedDesc"),
      });
      forwardRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    }
  }

  async function startForward() {
    setTouched(true);
    if (!canForward) return;
    setStarting(true);
    try {
      const created = await startTask({
        kind: "forward",
        address: address.trim(),
        remotePort: Number(remotePort),
        localPort: Number(localPort),
        bindHost: bindHost.trim(),
      });
      if (created) {
        setForwardId(created.id);
        void loadLogs(created.id, true);
        // The backend records the address in history when a task starts; we
        // only re-read the list so the home screen stays in sync.
        await refreshHistory();
      }
    } finally {
      setStarting(false);
    }
  }

  const port = Number(remotePort);
  const scheme = remotePortResult.ok ? guessScheme(port) : null;
  // 本地监听由官方 `tailcat forward` 子命令持有，端口（填 0 时）由系统分配，
  // 因此只把后端回报的 listenAddr 当作真实监听地址，未回报前不猜测。
  const localListenAddr = forwardTask?.listenAddr ?? null;
  const browserUrl =
    localListenAddr && scheme ? `${scheme}://${browserHost(localListenAddr)}` : null;

  return (
    <div className="flex flex-col gap-4">
      {!engineReady ? <EngineMissingCallout onNavigate={onNavigate} /> : null}

      <ScreenColumns>
        <Panel>
          <PanelHeader
            title={t("connections.connect.address.label")}
            description={t("connections.connect.address.hint")}
          />
          <PanelBody className="flex flex-col gap-3">
            <Field
              label={t("connections.connect.address.label")}
              htmlFor="peer-address"
              required
              error={showAddressError ? reasonText(t, addressResult) : null}
            >
              <Input
                id="peer-address"
                value={address}
                mono
                invalid={showAddressError}
                spellCheck={false}
                autoComplete="off"
                placeholder={t("connections.connect.address.placeholder")}
                onChange={(event) => {
                  setAddress(event.target.value);
                  setParsed(null);
                  setPing(null);
                }}
                onBlur={() => setTouched(true)}
              />
            </Field>

            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                loading={parsing}
                disabled={!engineReady || !addressResult.ok}
                onClick={() => void verify()}
              >
                {t("connections.connect.address.verify")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                loading={pinging}
                disabled={!engineReady || !addressResult.ok}
                onClick={() => void testReachability()}
              >
                <Play />
                {t("connections.connect.ping")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                loading={parsing}
                disabled={!engineReady || !addressResult.ok}
                onClick={() => void saveToHistory()}
              >
                {t("connections.connect.address.save")}
              </Button>
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="t-caption text-muted-foreground">
                {t("connections.connect.ping.notice")}
              </p>
              <p className="t-caption text-muted-foreground">
                {t("connections.connect.address.saveHint")}
              </p>
            </div>

            {parseError ? <ErrorNote error={parseError} /> : null}

            {parsed ? (
              <div className="flex flex-col gap-2 rounded-md border border-border bg-[color:var(--surface-inset)] p-3">
                <SectionTitle>{t("connections.connect.parsed.title")}</SectionTitle>
                <Badge tone="success">{t("connections.connect.address.verified")}</Badge>
                <KeyValueList>
                  <KeyValue label={t("connections.connect.parsed.key")} mono>
                    {parsed.serverPublicKey ?? "—"}
                  </KeyValue>
                  <KeyValue label={t("connections.connect.parsed.region")}>
                    {parsed.regionId ?? "—"}
                  </KeyValue>
                  <KeyValue label={t("connections.connect.parsed.selfContained")}>
                    {parsed.selfContained
                      ? t("connections.connect.parsed.yes")
                      : t("connections.connect.parsed.no")}
                  </KeyValue>
                  <KeyValue label={t("connections.connect.parsed.dns")} mono>
                    {parsed.dnsName ?? "—"}
                  </KeyValue>
                  <KeyValue label={t("connections.connect.parsed.token")}>
                    <AddressField address={parsed.blob} />
                  </KeyValue>
                </KeyValueList>
              </div>
            ) : null}

            {ping ? (
              <div className="flex flex-col gap-2 rounded-md border border-border bg-[color:var(--surface-inset)] p-3">
                <SectionTitle>{t("connections.connect.ping")}</SectionTitle>
                {ping.pongs.length > 0 ? (
                  <KeyValueList>
                    {ping.pongs.map((pong, index) => (
                      <KeyValue
                        key={`${pong.via}-${index}`}
                        label={t("connections.connect.ping.path")}
                      >
                        <span className="font-mono">{formatRtt(pong.rttMs)}</span>
                        {" · "}
                        {pong.direct
                          ? t("connections.connect.ping.direct")
                          : `${t("connections.connect.ping.derp")} ${pong.via}`}
                      </KeyValue>
                    ))}
                  </KeyValueList>
                ) : (
                  // 探测失败就是真实失败：直接用后端归一化的错误码与文案呈现，
                  // 不再降级成中性的「仅供参考」。
                  <>
                    {ping.error ? (
                      <ErrorNote error={ping.error} />
                    ) : (
                      <p className="t-caption text-muted-foreground">
                        {t("connections.connect.ping.noResponse")}
                      </p>
                    )}
                  </>
                )}
              </div>
            ) : null}
          </PanelBody>
        </Panel>

        <div ref={forwardRef}>
          <Panel>
            <PanelHeader
              title={t("connections.connect.forward.title")}
              description={t("connections.connect.forward.desc")}
            />
            <PanelBody className="flex flex-col gap-3">
              <Field
                label={t("connections.connect.forward.remotePort")}
                htmlFor="remote-port"
                required
                hint={t("connections.connect.forward.remotePortHint")}
                error={
                  touched && !remotePortResult.ok
                    ? reasonText(t, remotePortResult)
                    : null
                }
              >
                <Input
                  id="remote-port"
                  value={remotePort}
                  mono
                  inputMode="numeric"
                  invalid={touched && !remotePortResult.ok}
                  placeholder="8080"
                  onChange={(event) => setRemotePort(event.target.value)}
                />
              </Field>

              <Field
                label={t("connections.connect.forward.localPort")}
                htmlFor="local-port"
                hint={t("connections.connect.forward.localPortHint")}
                error={
                  touched && !localPortResult.ok ? reasonText(t, localPortResult) : null
                }
              >
                <Input
                  id="local-port"
                  value={localPort}
                  mono
                  inputMode="numeric"
                  invalid={touched && !localPortResult.ok}
                  onChange={(event) => setLocalPort(event.target.value)}
                />
              </Field>

              <Field
                label={t("connections.connect.forward.bindHost")}
                htmlFor="bind-host"
                hint={t("connections.connect.forward.bindHostHint")}
                error={touched && !bindHostResult.ok ? reasonText(t, bindHostResult) : null}
              >
                <Input
                  id="bind-host"
                  value={bindHost}
                  mono
                  invalid={touched && !bindHostResult.ok}
                  onChange={(event) => setBindHost(event.target.value)}
                />
              </Field>

              {!loopback ? (
                <Callout
                  tone="risk"
                  title={t("connections.connect.forward.risk.title")}
                  actions={
                    blockedBind ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void updateSettings({ allowNonLoopbackBind: true })}
                      >
                        {t("connections.connect.forward.risk.allow")}
                      </Button>
                    ) : null
                  }
                >
                  <p>
                    {t("connections.connect.forward.risk.body", {
                      host: bindHost.trim(),
                    })}
                  </p>
                  {blockedBind ? (
                    <p className="mt-0.5">
                      {t("connections.connect.forward.risk.blocked")}
                    </p>
                  ) : null}
                </Callout>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <Button
                  variant="primary"
                  loading={starting}
                  disabled={!canForward}
                  onClick={() => void startForward()}
                >
                  <Globe />
                  {t("connections.connect.forward.start")}
                </Button>
                {!engineReady ? (
                  <p className="t-caption text-warning">
                    {t("connections.engineMissing.body")}
                  </p>
                ) : null}
              </div>
            </PanelBody>
          </Panel>
        </div>
      </ScreenColumns>

      {forwardTask ? (
        <Panel>
          <PanelHeader
            title={t("connections.connect.forward.result.title")}
            description={forwardTask.label}
          />
          <PanelBody>
            <TaskResult
              task={forwardTask}
              logs={logs}
              stopLabel={t("connections.connect.forward.stop")}
              onStop={() => void stopTask(forwardTask.id)}
              onReloadLogs={() => void loadLogs(forwardTask.id, true)}
            >
              <div className="flex flex-col gap-2">
                {localListenAddr ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="t-mono rounded-md border border-border bg-[color:var(--surface-inset)] px-2 py-1.5 text-foreground">
                        {localListenAddr}
                      </span>
                      <CopyButton
                        variant="secondary"
                        size="sm"
                        value={localListenAddr}
                        label={t("connections.connect.forward.result.copy")}
                      />
                      {browserUrl ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void api.openUrl(browserUrl)}
                        >
                          <Globe />
                          {t("connections.connect.forward.result.open")}
                        </Button>
                      ) : null}
                    </div>
                    {browserUrl ? (
                      <p className="t-caption text-muted-foreground">
                        {t("connections.connect.forward.result.openHint", {
                          scheme: scheme ?? "",
                        })}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="t-caption text-muted-foreground">
                    {t("connections.connect.forward.result.pending")}
                  </p>
                )}
              </div>
            </TaskResult>
          </PanelBody>
        </Panel>
      ) : null}

      <Panel>
        <PanelHeader
          title={t("connections.connect.next.title")}
          description={t("connections.connect.next.hint")}
        />
        <PanelBody className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => onNavigate("transfer")}>
            <FolderSync />
            {t("connections.connect.next.transfer")}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onNavigate("share")}>
            <FolderOpen />
            {t("connections.connect.next.share")}
          </Button>
        </PanelBody>
        <div className="border-t border-border px-4 py-2.5">
          <p className="t-caption text-muted-foreground">
            {t("connections.connect.forward.latency")}
          </p>
        </div>
      </Panel>
    </div>
  );
}
