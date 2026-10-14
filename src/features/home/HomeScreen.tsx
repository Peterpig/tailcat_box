import { useEffect, useState } from "react";
import {
  Cpu,
  FolderOpen,
  FolderSync,
  Globe,
  Inbox,
  Pencil,
  PlugZap,
  RadioTower,
  RefreshCw,
  Send,
  Server,
  Square,
  Terminal,
  Trash2,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ScreenBody } from "@/components/layout/screen";
import { Panel, PanelBody, PanelHeader, SectionTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/ui/status-dot";
import { AddressField } from "@/components/ui/address-field";
import { KeyValue, KeyValueList } from "@/components/ui/kv";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { formatTimestamp, formatUptime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { selectRunningTasks, useAppStore } from "@/store/app";
import { useShallow } from "zustand/react/shallow";
import type { EngineSource, HistoryEntry, TaskInfo, TaskKind } from "@/lib/types";
import type { ScreenProps } from "@/App";
import "./messages";

const KIND_ICON: Record<TaskKind, LucideIcon> = {
  serve: RadioTower,
  forward: Waypoints,
  service: Globe,
  recv: Inbox,
  share: FolderOpen,
  send: Send,
  ssh: Terminal,
};

const SOURCE_KEY: Record<EngineSource, string> = {
  bundled: "home.engine.source.bundled",
  custom: "home.engine.source.custom",
  path: "home.engine.source.path",
  missing: "home.engine.source.missing",
};

/** Re-renders once a second so uptime counters stay live without polling. */
function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export default function HomeScreen({ onNavigate }: ScreenProps) {
  const t = useT();
  const now = useNow();

  const engine = useAppStore((state) => state.engine);
  const engineBusy = useAppStore((state) => state.engineBusy);
  const refreshEngine = useAppStore((state) => state.refreshEngine);
  // `selectRunningTasks` builds a new array; useShallow keeps the snapshot
  // reference stable so useSyncExternalStore does not re-render forever.
  const running = useAppStore(useShallow(selectRunningTasks));
  const history = useAppStore((state) => state.history);
  const stopTask = useAppStore((state) => state.stopTask);
  const refreshHistory = useAppStore((state) => state.refreshHistory);
  const failToast = useAppStore((state) => state.failToast);
  const redact = useAppStore((state) => state.settings.redactAddresses);

  const [renameTarget, setRenameTarget] = useState<HistoryEntry | null>(null);
  const [renameNote, setRenameNote] = useState("");
  const [removeTarget, setRemoveTarget] = useState<HistoryEntry | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);

  const engineReady = Boolean(engine?.found);

  const quickActions = [
    {
      id: "connections",
      icon: RadioTower,
      title: t("home.actions.listen.title"),
      desc: t("home.actions.listen.desc"),
    },
    {
      id: "connections",
      icon: PlugZap,
      title: t("home.actions.connect.title"),
      desc: t("home.actions.connect.desc"),
    },
    {
      id: "forwards",
      icon: Waypoints,
      title: t("home.actions.forward.title"),
      desc: t("home.actions.forward.desc"),
    },
    {
      id: "transfer",
      icon: FolderSync,
      title: t("home.actions.transfer.title"),
      desc: t("home.actions.transfer.desc"),
    },
    {
      id: "share",
      icon: FolderOpen,
      title: t("home.actions.share.title"),
      desc: t("home.actions.share.desc"),
    },
  ] as const;

  async function submitRename() {
    if (!renameTarget) return;
    setHistoryBusy(true);
    try {
      const note = renameNote.trim();
      await api.renameHistory(renameTarget.id, note.length > 0 ? note : null);
      await refreshHistory();
      setRenameTarget(null);
    } catch (error) {
      failToast(t("home.history.rename.failed"), error);
    } finally {
      setHistoryBusy(false);
    }
  }

  async function submitRemove() {
    if (!removeTarget) return;
    setHistoryBusy(true);
    try {
      await api.removeHistory(removeTarget.id);
      await refreshHistory();
      setRemoveTarget(null);
    } catch (error) {
      failToast(t("home.history.remove.failed"), error);
    } finally {
      setHistoryBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={t("home.title")} description={t("home.description")} />
      <ScreenBody>
        <div data-stagger className="flex flex-col gap-4">
          {/* --- engine ------------------------------------------------------ */}
          <Panel>
            <PanelHeader
              title={t("home.engine.title")}
              actions={
                <Button
                  variant="ghost"
                  size="sm"
                  loading={engineBusy}
                  onClick={() => void refreshEngine()}
                >
                  <RefreshCw />
                  {t("home.engine.redetect")}
                </Button>
              }
            />
            <PanelBody>
              {engineBusy || engine === null ? (
                <div className="flex flex-col gap-2.5">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-72" />
                  <Skeleton className="h-4 w-60" />
                </div>
              ) : engine.found ? (
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-2">
                    <Cpu className="size-3.5 text-success" aria-hidden />
                    <Badge tone="success">{t("home.engine.found")}</Badge>
                  </div>
                  <KeyValueList>
                    <KeyValue label={t("home.engine.version")} mono>
                      {engine.version ?? "—"}
                    </KeyValue>
                    <KeyValue label={t("home.engine.source")}>
                      {t(SOURCE_KEY[engine.source])}
                    </KeyValue>
                    <KeyValue label={t("home.engine.path")} mono>
                      {engine.path ?? "—"}
                    </KeyValue>
                    {engine.keysDir ? (
                      <KeyValue label={t("home.engine.keysDir")} mono>
                        {engine.keysDir}
                      </KeyValue>
                    ) : null}
                  </KeyValueList>
                </div>
              ) : (
                <Callout
                  tone="warning"
                  title={t("home.engine.missing.title")}
                  actions={
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onNavigate("settings")}
                    >
                      {t("home.engine.missing.action")}
                    </Button>
                  }
                >
                  <p>{engine?.error?.message ?? t("home.engine.missing.body")}</p>
                  {engine?.error?.hint ? <p className="mt-0.5">{engine.error.hint}</p> : null}
                </Callout>
              )}
            </PanelBody>
          </Panel>

          {/* --- quick actions ---------------------------------------------- */}
          <section>
            <SectionTitle>{t("home.actions.title")}</SectionTitle>
            {engine !== null && !engine.found ? (
              <p className="t-caption mb-2.5 text-warning">{t("home.actions.blocked")}</p>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.title}
                    type="button"
                    disabled={!engineReady}
                    onClick={() => onNavigate(action.id)}
                    className="flex items-start gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors duration-[var(--motion-duration)] ease-[var(--motion-ease)] hover:border-border-strong hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                  >
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                      <Icon className="size-3.5" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="t-subtitle block truncate">{action.title}</span>
                      <span className="t-caption block text-muted-foreground">
                        {action.desc}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* --- running tasks ---------------------------------------------- */}
          <Panel>
            <PanelHeader title={t("home.running.title")} />
            <PanelBody>
              {running.length === 0 ? (
                <EmptyState
                  icon={<RadioTower />}
                  title={t("home.running.empty.title")}
                  description={t("home.running.empty.desc")}
                />
              ) : (
                <ul className="flex flex-col gap-2">
                  {running.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      now={now}
                      redact={redact}
                      onStop={() => void stopTask(task.id)}
                    />
                  ))}
                </ul>
              )}
            </PanelBody>
          </Panel>

          {/* --- history ---------------------------------------------------- */}
          <Panel>
            <PanelHeader
              title={t("home.history.title")}
              actions={
                <Button variant="ghost" size="sm" onClick={() => void refreshHistory()}>
                  <RefreshCw />
                  {t("common.refresh")}
                </Button>
              }
            />
            <PanelBody>
              {history.length === 0 ? (
                <EmptyState
                  icon={<Server />}
                  title={t("home.history.empty.title")}
                  description={t("home.history.empty.desc")}
                />
              ) : (
                <ul className="flex flex-col gap-2">
                  {history.map((entry) => (
                    <HistoryRow
                      key={entry.id}
                      entry={entry}
                      redact={redact}
                      onRename={() => {
                        setRenameTarget(entry);
                        setRenameNote(entry.note ?? "");
                      }}
                      onRemove={() => setRemoveTarget(entry)}
                    />
                  ))}
                </ul>
              )}
            </PanelBody>
          </Panel>
        </div>
      </ScreenBody>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent size="sm">
          <DialogHeader
            title={t("home.history.rename.title")}
            description={t("home.history.rename.desc")}
          />
          <DialogBody>
            <Field
              label={t("home.history.rename.label")}
              htmlFor="history-note"
              hint={t("home.history.rename.hint")}
            >
              <Input
                id="history-note"
                value={renameNote}
                onChange={(event) => setRenameNote(event.target.value)}
                placeholder={t("home.history.rename.placeholder")}
                maxLength={120}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" loading={historyBusy} onClick={() => void submitRename()}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <DialogContent size="sm">
          <DialogHeader
            title={t("home.history.remove.title")}
            description={t("home.history.remove.desc")}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoveTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" loading={historyBusy} onClick={() => void submitRemove()}>
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TaskRow({
  task,
  now,
  redact,
  onStop,
}: {
  task: TaskInfo;
  now: number;
  redact: boolean;
  onStop: () => void;
}) {
  const t = useT();
  const Icon = KIND_ICON[task.kind];

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-card px-3 py-2.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <StatusDot status={task.status} pulse />
          <span className="t-subtitle min-w-0 truncate">{task.label}</span>
          <Badge tone="neutral">{t(`home.kind.${task.kind}`)}</Badge>
        </div>
        <div className="t-caption mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground">
          <span>
            {t("common.uptime")} {formatUptime(task.startedAt, now)}
          </span>
          {task.listenAddr ? (
            <span className="font-mono text-foreground">{task.listenAddr}</span>
          ) : null}
          {task.pid !== null ? (
            <span>
              {t("common.pid")} {task.pid}
            </span>
          ) : null}
        </div>
      </div>
      {task.address ? (
        <AddressField
          address={task.address}
          masked={redact}
          className="w-full max-w-[260px] shrink-0"
        />
      ) : null}
      <Button variant="dangerGhost" size="sm" onClick={onStop}>
        <Square />
        {t("home.running.stop")}
      </Button>
    </li>
  );
}

function HistoryRow({
  entry,
  redact,
  onRename,
  onRemove,
}: {
  entry: HistoryEntry;
  redact: boolean;
  onRename: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  const Icon = KIND_ICON[entry.kind];

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-card px-3 py-2.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="t-subtitle min-w-0 truncate">{entry.label}</span>
          <Badge tone="outline">{t(`home.kind.${entry.kind}`)}</Badge>
        </div>
        <div className="t-caption mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground">
          <span className={entry.note ? "text-foreground" : undefined}>
            {entry.note ?? t("home.history.noNote")}
          </span>
          <span>
            {t("home.history.lastUsed")} {formatTimestamp(entry.lastUsedAt)}
          </span>
          <span>{t("home.history.useCount", { count: entry.useCount })}</span>
        </div>
      </div>
      <AddressField
        address={entry.address}
        masked={redact}
        className="w-full max-w-[260px] shrink-0"
      />
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label={t("home.history.rename")} onClick={onRename}>
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("home.history.remove")}
          className="text-danger hover:bg-danger-soft"
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}
