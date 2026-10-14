import { useEffect, useState } from "react";
import { FolderOpen, ScrollText, Share2, Square, Trash2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { AddressField } from "@/components/ui/address-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorNote } from "@/components/ui/error-note";
import { Field } from "@/components/ui/field";
import { LogView } from "@/components/ui/log-view";
import { StatusDot } from "@/components/ui/status-dot";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ScreenBody } from "@/components/layout/screen";
import { formatUptime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { selectLogs, selectTasksByKind, useAppStore } from "@/store/app";
import { useShallow } from "zustand/react/shallow";
import type { ScreenProps } from "@/App";
import type { TaskInfo, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import "./messages";

type ShareMode = "ro" | "rw" | "wo" | "wo+";

interface ShareMeta {
  dir: string | null;
  mode: ShareMode | null;
}

const MODES: { value: ShareMode; labelKey: string; hintKey: string }[] = [
  { value: "ro", labelKey: "share.mode.ro", hintKey: "share.mode.roHint" },
  { value: "rw", labelKey: "share.mode.rw", hintKey: "share.mode.rwHint" },
  { value: "wo", labelKey: "share.mode.wo", hintKey: "share.mode.woHint" },
  { value: "wo+", labelKey: "share.mode.woPlus", hintKey: "share.mode.woPlusHint" },
];

const MODE_BADGE: Record<ShareMode, string> = {
  ro: "share.mode.roBadge",
  rw: "share.mode.rwBadge",
  wo: "share.mode.woBadge",
  "wo+": "share.mode.woPlusBadge",
};

const MODE_TONE: Record<ShareMode, "neutral" | "danger" | "warning"> = {
  ro: "neutral",
  rw: "danger",
  wo: "warning",
  "wo+": "warning",
};

const STATUS_TONE: Record<
  TaskStatus,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  starting: "warning",
  running: "success",
  stopping: "warning",
  stopped: "neutral",
  failed: "danger",
};

/** Ticking clock so a running task's uptime does not freeze between updates. */
function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function shareUptime(task: TaskInfo, now: number): string {
  const end = task.endedAt ? Date.parse(task.endedAt) : Number.NaN;
  return formatUptime(task.startedAt, Number.isNaN(end) ? now : end);
}

/**
 * Directory and mode come from what the user picked; when a task was restored
 * from the backend we fall back to the facts it reports in `detail`.
 */
function shareMeta(task: TaskInfo, local: Record<string, ShareMeta>): ShareMeta {
  const known = local[task.id];
  if (known) return known;
  const detail = task.detail;
  const mode =
    detail.mode === "ro" ||
    detail.mode === "rw" ||
    detail.mode === "wo" ||
    detail.mode === "wo+"
      ? detail.mode
      : null;
  return {
    dir: typeof detail.dir === "string" ? detail.dir : null,
    mode,
  };
}

function ShareLogPanel({ id }: { id: string }) {
  const t = useT();
  const loadLogs = useAppStore((state) => state.loadLogs);
  const lines = useAppStore(useShallow(selectLogs(id)));

  useEffect(() => {
    void loadLogs(id, true);
  }, [id, loadLogs]);

  return (
    <LogView
      lines={lines}
      emptyLabel={t("share.logs.empty")}
      className="mt-2 h-56 overflow-hidden rounded-md border border-border"
    />
  );
}

function ShareTaskRow({
  task,
  meta,
  now,
  redact,
}: {
  task: TaskInfo;
  meta: ShareMeta;
  now: number;
  redact: boolean;
}) {
  const t = useT();
  const stopTask = useAppStore((state) => state.stopTask);
  const removeTask = useAppStore((state) => state.removeTask);
  const [showLogs, setShowLogs] = useState(false);
  const running = task.status === "running" || task.status === "starting";

  return (
    <li className="rounded-md border border-border bg-card px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <StatusDot status={task.status} pulse className="mt-1.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="t-subtitle min-w-0 break-all">{task.label}</span>
            {meta.mode ? (
              <Badge tone={MODE_TONE[meta.mode]}>{t(MODE_BADGE[meta.mode])}</Badge>
            ) : (
              <Badge tone="outline">{t("common.notAvailable")}</Badge>
            )}
            <Badge tone={STATUS_TONE[task.status]}>
              {t(`share.status.${task.status}`)}
            </Badge>
          </div>
          <div className="t-caption mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
            <span>
              {t("share.dirLabel")}{" "}
              <span className="font-mono">{meta.dir ?? "—"}</span>
            </span>
            <span>
              {t("common.uptime")} {shareUptime(task, now)}
            </span>
          </div>
          <div className="mt-2 flex flex-col gap-1.5">
            <AddressField
              address={task.address}
              masked={redact}
              label={t("share.addressLabel")}
            />
            {task.address ? (
              <p className="t-caption text-muted-foreground">
                {t("share.addressHint")}
              </p>
            ) : null}
          </div>
          {task.error ? <ErrorNote error={task.error} className="mt-2" compact /> : null}
          {showLogs ? <ShareLogPanel id={task.id} /> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {running ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("share.action.stop")}
              onClick={() => void stopTask(task.id)}
            >
              <Square />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={
              showLogs ? t("share.action.hideLogs") : t("share.action.logs")
            }
            onClick={() => setShowLogs((value) => !value)}
          >
            <ScrollText />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("share.action.remove")}
            onClick={() => void removeTask(task.id)}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </li>
  );
}

export default function ShareScreen(_props: ScreenProps) {
  const t = useT();
  const startTask = useAppStore((state) => state.startTask);
  const failToast = useAppStore((state) => state.failToast);
  const redact = useAppStore((state) => state.settings.redactAddresses);
  const tasks = useAppStore(useShallow(selectTasksByKind("share")));
  const now = useNow();

  const [dir, setDir] = useState<string | null>(null);
  const [mode, setMode] = useState<ShareMode>("ro");
  const [dirError, setDirError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [taskMeta, setTaskMeta] = useState<Record<string, ShareMeta>>({});

  const handlePick = async () => {
    try {
      const picked = await open({
        directory: true,
        multiple: false,
        title: t("share.dir.pick"),
      });
      if (typeof picked === "string" && picked.length > 0) {
        setDir(picked);
        setDirError(null);
      }
    } catch (error) {
      failToast(t("share.pick.failed"), error);
    }
  };

  const handleStart = async () => {
    if (!dir) {
      setDirError(t("share.validation.dir.empty"));
      return;
    }
    setDirError(null);
    setBusy(true);
    try {
      const task = await startTask({ kind: "share", dir, mode });
      if (task) {
        setTaskMeta((prev) => ({ ...prev, [task.id]: { dir, mode } }));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t("share.title")} description={t("share.description")} />
      <ScreenBody>
        <Panel>
          <PanelHeader
            title={t("share.configTitle")}
            description={t("share.startCommand")}
          />
          <PanelBody className="flex flex-col gap-3.5">
            <Field
              label={t("share.dir.label")}
              hint={t("share.dir.hint")}
              error={dirError}
            >
              <div className="flex items-center gap-2">
                <div
                  title={dir ?? undefined}
                  className="t-mono min-w-0 flex-1 truncate rounded-md border border-border bg-[color:var(--surface-inset)] px-2.5 py-1.5 text-[12px] text-foreground"
                >
                  {dir ?? t("share.dir.none")}
                </div>
                <Button variant="secondary" onClick={() => void handlePick()}>
                  <FolderOpen />
                  {t("share.dir.pick")}
                </Button>
              </div>
            </Field>

            <div className="flex flex-col gap-2">
              <p className="t-overline">{t("share.mode.label")}</p>
              <div
                role="radiogroup"
                aria-label={t("share.mode.label")}
                className="flex flex-col gap-2"
              >
                {MODES.map((option) => {
                  const selected = option.value === mode;
                  return (
                    <label
                      key={option.value}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5",
                        "transition-colors duration-[var(--motion-duration)] ease-[var(--motion-ease)]",
                        selected
                          ? "border-[color:var(--info)] bg-info-soft"
                          : "border-border bg-card hover:border-border-strong",
                      )}
                    >
                      <input
                        type="radio"
                        name="share-mode"
                        value={option.value}
                        checked={selected}
                        onChange={() => setMode(option.value)}
                        className="mt-0.5 size-3.5 shrink-0 accent-[color:var(--info)]"
                      />
                      <span className="min-w-0">
                        <span className="t-subtitle block text-foreground">
                          {t(option.labelKey)}
                        </span>
                        <span className="t-caption block text-muted-foreground">
                          {t(option.hintKey)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {mode === "rw" ? (
              <Callout tone="risk" title={t("share.risk.rw.title")}>
                {t("share.risk.rw.body")}
              </Callout>
            ) : null}
            {mode === "wo" ? <Callout tone="warning">{t("share.wo.note")}</Callout> : null}
            {mode === "wo+" ? (
              <Callout tone="warning">{t("share.woPlus.note")}</Callout>
            ) : null}

            <Callout tone="info">{t("share.root.note")}</Callout>
            <p className="t-caption text-muted-foreground">{t("share.pskNote")}</p>

            <div>
              <Button
                variant="primary"
                loading={busy}
                onClick={() => void handleStart()}
              >
                <Share2 />
                {t("share.start")}
              </Button>
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title={t("share.listTitle")}
            description={t("share.listDescription")}
          />
          <PanelBody>
            {tasks.length === 0 ? (
              <EmptyState
                icon={<Share2 />}
                title={t("share.emptyTitle")}
                description={t("share.emptyDescription")}
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {tasks.map((task) => (
                  <ShareTaskRow
                    key={task.id}
                    task={task}
                    meta={shareMeta(task, taskMeta)}
                    now={now}
                    redact={redact}
                  />
                ))}
              </ul>
            )}
          </PanelBody>
        </Panel>
      </ScreenBody>
    </>
  );
}
