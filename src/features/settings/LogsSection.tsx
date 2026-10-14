import { FolderOpen } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/store/app";
import type { LogLevelName } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NumberSetting } from "./number-setting";

const LEVELS: { value: LogLevelName; labelKey: string }[] = [
  { value: "error", labelKey: "settings.logs.level.error" },
  { value: "warn", labelKey: "settings.logs.level.warn" },
  { value: "info", labelKey: "settings.logs.level.info" },
  { value: "debug", labelKey: "settings.logs.level.debug" },
];

export function LogsSection() {
  const t = useT();
  const settings = useAppStore((state) => state.settings);
  const system = useAppStore((state) => state.system);
  const updateSettings = useAppStore((state) => state.updateSettings);

  const logDir = system?.logDir ?? settings.logDir ?? null;

  return (
    <Panel>
      <PanelHeader
        title={t("settings.logs.title")}
        description={t("settings.logs.description")}
      />
      <PanelBody className="flex flex-col gap-5">
        <Field label={t("settings.logs.level")} htmlFor="settings-log-level">
          <Select
            value={settings.logLevel}
            onValueChange={(value) =>
              void updateSettings({ logLevel: value as LogLevelName })
            }
          >
            <SelectTrigger id="settings-log-level" className="max-w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map((level) => (
                <SelectItem key={level.value} value={level.value}>
                  {t(level.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={t("settings.logs.dir")}>
          <div className="flex items-center gap-2">
            <span className="t-mono min-w-0 flex-1 truncate rounded-md border border-border bg-[color:var(--surface-inset)] px-2 py-1.5 text-foreground">
              {logDir ?? "—"}
            </span>
            <Button
              variant="secondary"
              disabled={!logDir}
              onClick={() => {
                if (logDir) void api.openPath(logDir);
              }}
            >
              <FolderOpen aria-hidden />
              {t("settings.logs.openDir")}
            </Button>
          </div>
        </Field>

        <NumberSetting
          id="settings-max-log-lines"
          label={t("settings.logs.maxLines")}
          hint={t("settings.logs.maxLinesHint")}
          invalidMessage={t("settings.logs.maxLinesInvalid")}
          min={100}
          max={20000}
          value={settings.maxLogLines}
          onCommit={(value) => void updateSettings({ maxLogLines: value })}
        />
      </PanelBody>
    </Panel>
  );
}
