import { useMemo, useState } from "react";
import {
  FileUp,
  FolderOpen,
  ScrollText,
  Send,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/lib/i18n";
import { truncateMiddle } from "@/lib/format";
import { selectLogs, selectTasksByKind, useAppStore } from "@/store/app";
import { useShallow } from "zustand/react/shallow";
import { validateAddress, validateRemotePath } from "@/lib/validation";
import type { TaskInfo } from "@/lib/types";
import { validationMessage } from "./messages";
import { pickDirectories, pickFiles } from "./picker";
import { parseScpProgress } from "./progress";
import { TaskLogPanel, TaskRow, taskUptime, useNow } from "./task-row";

interface SendMeta {
  sources: string[];
  address: string;
  remotePath: string;
  recursive: boolean;
}

interface FormErrors {
  sources?: string;
  address?: string;
  remotePath?: string;
}

function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-2"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-[color:var(--info)] transition-[width] duration-[var(--motion-duration)] ease-[var(--motion-ease)]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="t-mono w-10 shrink-0 text-right text-[12px] text-foreground">
        {percent}%
      </span>
    </div>
  );
}

/** Progress for one send task, parsed from that task's own scp stderr. */
function SendTaskRow({
  task,
  meta,
  now,
}: {
  task: TaskInfo;
  meta?: SendMeta;
  now: number;
}) {
  const t = useT();
  const stopTask = useAppStore((state) => state.stopTask);
  const removeTask = useAppStore((state) => state.removeTask);
  const lines = useAppStore(useShallow(selectLogs(task.id)));
  const [showLogs, setShowLogs] = useState(false);

  const progress = useMemo(() => parseScpProgress(lines), [lines]);
  const detail = progress
    ? [progress.file, progress.transferred, progress.rate, progress.eta]
        .filter((part): part is string => Boolean(part))
        .join(" · ")
    : "";

  const running = task.status === "running" || task.status === "starting";

  return (
    <TaskRow
      task={task}
      meta={
        <>
          <span>
            {t("transfer.send.target")}{" "}
            <span className="font-mono">
              {meta?.address ? truncateMiddle(meta.address, 8, 6) : "—"}:
              {meta?.remotePath ? meta.remotePath : "/"}
            </span>
          </span>
          <span>
            {t("common.uptime")} {taskUptime(task, now)}
          </span>
        </>
      }
      actions={
        <>
          {running ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("transfer.action.stop")}
              onClick={() => void stopTask(task.id)}
            >
              <Square />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={
              showLogs ? t("transfer.action.hideLogs") : t("transfer.action.logs")
            }
            onClick={() => setShowLogs((value) => !value)}
          >
            <ScrollText />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("transfer.action.remove")}
            onClick={() => void removeTask(task.id)}
          >
            <Trash2 />
          </Button>
        </>
      }
    >
      <div className="mt-2 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="t-caption shrink-0 text-muted-foreground">
            {t("transfer.send.progressTitle")}
          </span>
          {progress ? (
            <ProgressBar
              percent={progress.percent}
              label={t("transfer.send.progressTitle")}
            />
          ) : (
            <span className="t-caption text-warning">
              {t("transfer.send.progressUnavailable")}
            </span>
          )}
        </div>
        {detail ? (
          <p className="t-mono break-all text-[11.5px] text-[color:var(--body)]">
            {detail}
          </p>
        ) : null}
        <p className="t-caption text-muted-foreground">
          {t("transfer.send.progressSource")}
        </p>
        {showLogs ? <TaskLogPanel id={task.id} /> : null}
      </div>
    </TaskRow>
  );
}

/**
 * Send view: `tailcat cp [-r] [-p] <sources...> <addr>:<path>`.
 *
 * Progress is never estimated: it comes from scp's stderr only.
 */
export function SendPanel() {
  const t = useT();
  const startTask = useAppStore((state) => state.startTask);
  const failToast = useAppStore((state) => state.failToast);
  const tasks = useAppStore(useShallow(selectTasksByKind("send")));
  const now = useNow();

  const [sources, setSources] = useState<string[]>([]);
  const [knownDirs, setKnownDirs] = useState<string[]>([]);
  const [address, setAddress] = useState("");
  const [remotePath, setRemotePath] = useState("");
  const [recursive, setRecursive] = useState(false);
  const [preserveTimes, setPreserveTimes] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [taskMeta, setTaskMeta] = useState<Record<string, SendMeta>>({});

  const addSources = (picked: string[], areDirectories: boolean) => {
    if (picked.length === 0) return;
    setSources((prev) => [...prev, ...picked.filter((item) => !prev.includes(item))]);
    if (areDirectories) {
      setKnownDirs((prev) => [...prev, ...picked.filter((item) => !prev.includes(item))]);
      // A directory cannot be sent without `-r`; scp would just fail.
      setRecursive(true);
    }
    setErrors((prev) => ({ ...prev, sources: undefined }));
  };

  const handlePickFiles = async () => {
    try {
      addSources(await pickFiles(t("transfer.send.pickFiles")), false);
    } catch (error) {
      failToast(t("transfer.pick.failed"), error);
    }
  };

  const handlePickDirs = async () => {
    try {
      addSources(await pickDirectories(t("transfer.send.pickDirs")), true);
    } catch (error) {
      failToast(t("transfer.pick.failed"), error);
    }
  };

  const removeSource = (path: string) => {
    setSources((prev) => prev.filter((item) => item !== path));
    setKnownDirs((prev) => prev.filter((item) => item !== path));
  };

  const handleStart = async () => {
    const next: FormErrors = {};
    if (sources.length === 0) {
      next.sources = t("transfer.validation.sources.empty");
    } else if (!recursive && sources.some((item) => knownDirs.includes(item))) {
      next.sources = t("transfer.send.validation.recursiveRequired");
    }

    const addressResult = validateAddress(address);
    if (!addressResult.ok) {
      next.address = validationMessage(
        t,
        "transfer.validation.address",
        addressResult.reason,
      );
    }

    const pathResult = validateRemotePath(remotePath);
    if (!pathResult.ok) {
      next.remotePath = validationMessage(
        t,
        "transfer.validation.remotePath",
        pathResult.reason,
      );
    }

    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setBusy(true);
    try {
      const trimmedPath = remotePath.trim();
      const task = await startTask({
        kind: "send",
        sources,
        address: address.trim(),
        remotePath: trimmedPath,
        recursive,
        preserveTimes,
      });
      if (task) {
        setTaskMeta((prev) => ({
          ...prev,
          [task.id]: {
            sources,
            address: address.trim(),
            remotePath: trimmedPath,
            recursive,
          },
        }));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Panel>
        <PanelHeader
          title={t("transfer.send.title")}
          description={t("transfer.send.description")}
        />
        <PanelBody className="flex flex-col gap-3.5">
          <Field
            label={t("transfer.send.sourcesLabel")}
            hint={t("transfer.send.sourcesHint")}
            error={errors.sources}
          >
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => void handlePickFiles()}>
                  <FileUp />
                  {t("transfer.send.pickFiles")}
                </Button>
                <Button variant="secondary" onClick={() => void handlePickDirs()}>
                  <FolderOpen />
                  {t("transfer.send.pickDirs")}
                </Button>
              </div>
              {sources.length === 0 ? (
                <p className="t-caption text-[color:var(--ash)]">
                  {t("transfer.send.noSources")}
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {sources.map((path) => (
                    <li
                      key={path}
                      className="flex items-center gap-2 rounded-sm border border-border bg-[color:var(--surface-inset)] px-2 py-1"
                    >
                      <span
                        className="t-mono min-w-0 flex-1 truncate text-[11.5px] text-foreground"
                        title={path}
                      >
                        {path}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${t("transfer.send.removeSource")} ${path}`}
                        onClick={() => removeSource(path)}
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Field>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field
              label={t("transfer.send.addressLabel")}
              htmlFor="transfer-send-address"
              hint={t("transfer.send.addressHint")}
              error={errors.address}
              required
            >
              <Input
                id="transfer-send-address"
                mono
                value={address}
                invalid={Boolean(errors.address)}
                placeholder="tc…"
                onChange={(event) => {
                  setAddress(event.target.value);
                  setErrors((prev) => ({ ...prev, address: undefined }));
                }}
              />
            </Field>
            <Field
              label={t("transfer.send.remotePathLabel")}
              htmlFor="transfer-send-remote-path"
              hint={t("transfer.send.remotePathHint")}
              error={errors.remotePath}
            >
              <Input
                id="transfer-send-remote-path"
                mono
                value={remotePath}
                invalid={Boolean(errors.remotePath)}
                placeholder="/"
                onChange={(event) => {
                  setRemotePath(event.target.value);
                  setErrors((prev) => ({ ...prev, remotePath: undefined }));
                }}
              />
            </Field>
          </div>

          <div className="flex flex-col gap-2.5">
            <p className="t-overline">{t("transfer.send.optionsLabel")}</p>
            <div className="flex items-start gap-2.5">
              <Switch
                id="transfer-send-recursive"
                checked={recursive}
                onCheckedChange={setRecursive}
              />
              <div className="min-w-0">
                <Label htmlFor="transfer-send-recursive">
                  {t("transfer.send.recursive")}
                </Label>
                <p className="t-caption text-muted-foreground">
                  {t("transfer.send.recursiveHint")}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Switch
                id="transfer-send-preserve-times"
                checked={preserveTimes}
                onCheckedChange={setPreserveTimes}
              />
              <div className="min-w-0">
                <Label htmlFor="transfer-send-preserve-times">
                  {t("transfer.send.preserveTimes")}
                </Label>
                <p className="t-caption text-muted-foreground">
                  {t("transfer.send.preserveTimesHint")}
                </p>
              </div>
            </div>
          </div>

          <Callout tone="warning">{t("transfer.send.stopNote")}</Callout>

          <div>
            <Button
              variant="primary"
              loading={busy}
              onClick={() => void handleStart()}
            >
              <Send />
              {t("transfer.send.start")}
            </Button>
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title={t("transfer.send.listTitle")} />
        <PanelBody>
          {tasks.length === 0 ? (
            <EmptyState
              icon={<Send />}
              title={t("transfer.send.emptyTitle")}
              description={t("transfer.send.emptyDescription")}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {tasks.map((task) => (
                <SendTaskRow
                  key={task.id}
                  task={task}
                  meta={taskMeta[task.id]}
                  now={now}
                />
              ))}
            </ul>
          )}
        </PanelBody>
      </Panel>
    </>
  );
}
