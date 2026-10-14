import { useState } from "react";
import { FolderOpen, ScrollText, Square, Trash2 } from "lucide-react";
import { AddressField } from "@/components/ui/address-field";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { truncateMiddle } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { selectTasksByKind, useAppStore } from "@/store/app";
import { useShallow } from "zustand/react/shallow";
import { pickDirectory } from "./picker";
import { TaskLogPanel, TaskRow, taskUptime, useNow } from "./task-row";

/**
 * Receive view: `tailcat recv <dir>` — a write-only drop box that writes into
 * exactly one local directory.
 */
export function RecvPanel() {
  const t = useT();
  const startTask = useAppStore((state) => state.startTask);
  const stopTask = useAppStore((state) => state.stopTask);
  const removeTask = useAppStore((state) => state.removeTask);
  const failToast = useAppStore((state) => state.failToast);
  const redact = useAppStore((state) => state.settings.redactAddresses);
  const tasks = useAppStore(useShallow(selectTasksByKind("recv")));
  const now = useNow();

  const [dir, setDir] = useState<string | null>(null);
  const [dirError, setDirError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Directory per task id: the UI knows what the user picked, `TaskInfo` does not. */
  const [taskDirs, setTaskDirs] = useState<Record<string, string>>({});
  const [logsFor, setLogsFor] = useState<string | null>(null);

  const active =
    tasks.find(
      (task) =>
        task.address !== null &&
        (task.status === "running" || task.status === "starting"),
    ) ??
    tasks.find((task) => task.address !== null) ??
    null;

  const address = active?.address ?? null;
  // The command shown on screen follows the redaction setting; the copy button
  // always writes the full token to the clipboard.
  const shownAddress =
    address && redact ? truncateMiddle(address, 8, 6) : address;
  const cpCommand = address
    ? `tailcat cp <${t("transfer.recv.cpPlaceholder")}> ${address}:`
    : "";
  const cpDisplay = address
    ? `tailcat cp <${t("transfer.recv.cpPlaceholder")}> ${shownAddress}:`
    : "";

  const handlePick = async () => {
    try {
      const picked = await pickDirectory(t("transfer.recv.dirLabel"));
      if (!picked) return;
      setDir(picked);
      setDirError(null);
    } catch (error) {
      failToast(t("transfer.pick.failed"), error);
    }
  };

  const handleStart = async () => {
    if (!dir) {
      setDirError(t("transfer.validation.dir.empty"));
      return;
    }
    setDirError(null);
    setBusy(true);
    try {
      const task = await startTask({ kind: "recv", dir });
      if (task) {
        setTaskDirs((prev) => ({ ...prev, [task.id]: dir }));
        setLogsFor(task.id);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Panel>
        <PanelHeader
          title={t("transfer.recv.title")}
          description={t("transfer.recv.description")}
        />
        <PanelBody className="flex flex-col gap-3">
          <Field
            label={t("transfer.recv.dirLabel")}
            hint={t("transfer.recv.dirHint")}
            error={dirError}
          >
            <div className="flex items-center gap-2">
              <div
                title={dir ?? undefined}
                className="t-mono min-w-0 flex-1 truncate rounded-md border border-border bg-[color:var(--surface-inset)] px-2.5 py-1.5 text-[12px] text-foreground"
              >
                {dir ?? t("transfer.recv.noDir")}
              </div>
              <Button variant="secondary" onClick={() => void handlePick()}>
                <FolderOpen />
                {t("common.selectDirectory")}
              </Button>
            </div>
          </Field>
          <p className="t-caption text-muted-foreground">
            {t("transfer.recv.modeNote")}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              loading={busy}
              onClick={() => void handleStart()}
            >
              {t("transfer.recv.start")}
            </Button>
            {active && active.status !== "stopped" && active.status !== "failed" ? (
              <Button
                variant="secondary"
                onClick={() => void stopTask(active.id)}
              >
                <Square />
                {t("transfer.action.stop")}
              </Button>
            ) : null}
          </div>

          {active?.address ? (
            <div className="flex flex-col gap-2.5 rounded-md border border-border bg-[color:var(--surface-inset)] p-3">
              <AddressField
                address={address}
                masked={redact}
                label={t("transfer.recv.addressLabel")}
                className="border-transparent bg-transparent px-0 py-0"
              />
              <div className="flex flex-wrap items-center gap-2">
                <CopyButton
                  value={cpCommand}
                  variant="secondary"
                  size="sm"
                  label={t("transfer.recv.copyCommand")}
                  successTitle={t("transfer.recv.copyCommandDone")}
                />
                <span className="t-caption text-muted-foreground">
                  {t("transfer.recv.peerHint")}
                </span>
              </div>
              <p className="t-mono break-all rounded-sm bg-[color:var(--surface-card)] px-2 py-1.5 text-[11.5px] text-[color:var(--body)]">
                {cpDisplay}
              </p>
              {redact ? (
                <p className="t-caption text-muted-foreground">
                  {t("transfer.recv.maskedNote")}
                </p>
              ) : null}
              <p className="t-caption text-muted-foreground">
                {t("transfer.recv.pskNote")}
              </p>
            </div>
          ) : null}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title={t("transfer.recv.listTitle")}
          description={t("transfer.recv.listDescription")}
        />
        <PanelBody>
          {tasks.length === 0 ? (
            <EmptyState
              icon={<FolderOpen />}
              title={t("transfer.recv.emptyTitle")}
              description={t("transfer.recv.emptyDescription")}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  meta={
                    <>
                      <span>
                        {t("transfer.recv.dir")}{" "}
                        <span className="font-mono">
                          {taskDirs[task.id] ?? "—"}
                        </span>
                      </span>
                      <span>
                        {t("common.uptime")} {taskUptime(task, now)}
                      </span>
                    </>
                  }
                  actions={
                    <>
                      {task.status === "running" || task.status === "starting" ? (
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
                          logsFor === task.id
                            ? t("transfer.action.hideLogs")
                            : t("transfer.action.logs")
                        }
                        onClick={() =>
                          setLogsFor((prev) => (prev === task.id ? null : task.id))
                        }
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
                  {logsFor === task.id ? (
                    <div className="mt-2">
                      <TaskLogPanel id={task.id} />
                    </div>
                  ) : null}
                </TaskRow>
              ))}
            </ul>
          )}
        </PanelBody>
      </Panel>
    </>
  );
}
