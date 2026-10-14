import { useEffect } from "react";
import { AddressField } from "@/components/ui/address-field";
import { Panel, PanelBody, PanelHeader, SectionTitle } from "@/components/ui/card";
import { ErrorNote } from "@/components/ui/error-note";
import { KeyValue, KeyValueList } from "@/components/ui/kv";
import { LogView } from "@/components/ui/log-view";
import { formatTimestamp } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { LogLine, TaskInfo } from "@/lib/types";
import { useAppStore } from "@/store/app";

const UNKNOWN = "—";
const NO_LOGS: LogLine[] = [];

export function TaskDetail({ task }: { task: TaskInfo }) {
  const t = useT();
  const redactAddresses = useAppStore((state) => state.settings.redactAddresses);
  const loadLogs = useAppStore((state) => state.loadLogs);
  const logs = useAppStore((state) => state.logs[task.id] ?? NO_LOGS);

  useEffect(() => {
    void loadLogs(task.id, true);
  }, [task.id, loadLogs]);

  const args = task.argsSummary.length > 0 ? task.argsSummary.join(" ") : UNKNOWN;

  return (
    <Panel>
      <PanelHeader title={t("forwards.detail.title")} description={task.label} />
      <PanelBody className="flex flex-col gap-3">
        <KeyValueList>
          <KeyValue label={t("forwards.detail.args")} mono>
            {args}
          </KeyValue>
          <KeyValue label={t("common.pid")} mono>
            {task.pid ?? UNKNOWN}
          </KeyValue>
          <KeyValue label={t("forwards.detail.listen")} mono>
            {task.listenAddr ?? UNKNOWN}
          </KeyValue>
          <KeyValue label={t("common.created")}>
            {formatTimestamp(task.createdAt)}
          </KeyValue>
          <KeyValue label={t("forwards.detail.startedAt")}>
            {formatTimestamp(task.startedAt)}
          </KeyValue>
          <KeyValue label={t("forwards.detail.endedAt")}>
            {formatTimestamp(task.endedAt)}
          </KeyValue>
          <KeyValue label={t("common.exitCode")} mono>
            {task.exitCode ?? UNKNOWN}
          </KeyValue>
        </KeyValueList>

        {task.address ? (
          <AddressField
            address={task.address}
            masked={redactAddresses}
            label={t("forwards.detail.address")}
          />
        ) : null}

        {task.error ? <ErrorNote error={task.error} /> : null}
      </PanelBody>
      <PanelBody className="border-t border-border">
        <SectionTitle>{t("common.logs")}</SectionTitle>
        <div className="h-64">
          <LogView lines={logs} />
        </div>
      </PanelBody>
    </Panel>
  );
}
