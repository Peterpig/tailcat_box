import { useEffect, useState } from "react";
import { Download, Trash2, Upload } from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { api } from "@/lib/api";
import { setLocale, useT } from "@/lib/i18n";
import { applyTheme } from "@/lib/theme";
import { useAppStore } from "@/store/app";
import type { HistoryEntry } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { NumberSetting } from "./number-setting";

const JSON_FILTER = [{ name: "JSON", extensions: ["json"] }];

export function DataSection() {
  const t = useT();
  const settings = useAppStore((state) => state.settings);
  const history = useAppStore((state) => state.history);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const refreshHistory = useAppStore((state) => state.refreshHistory);
  const resetSettings = useAppStore((state) => state.resetSettings);
  const pushToast = useAppStore((state) => state.pushToast);
  const failToast = useAppStore((state) => state.failToast);

  const [clearOpen, setClearOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    try {
      const path = await save({
        defaultPath: "tailcat-box-settings.json",
        filters: JSON_FILTER,
      });
      if (!path) return;
      await api.exportSettings(path);
      pushToast({ tone: "success", title: t("settings.data.exported") });
    } catch (error) {
      failToast(t("settings.data.transfer.title"), error);
    }
  }

  async function handleImport() {
    try {
      const picked = await open({ multiple: false, filters: JSON_FILTER });
      if (typeof picked !== "string") return;
      const imported = await api.importSettings(picked);
      useAppStore.setState({ settings: imported });
      applyTheme(imported.theme);
      setLocale(imported.language);
      pushToast({ tone: "success", title: t("settings.data.imported") });
    } catch (error) {
      failToast(t("settings.data.transfer.title"), error);
    }
  }

  async function handleClear() {
    setBusy(true);
    try {
      await api.clearHistory();
      await refreshHistory();
      setClearOpen(false);
      pushToast({ tone: "success", title: t("settings.data.history.cleared") });
    } catch (error) {
      failToast(t("settings.data.history.clear"), error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHeader
          title={t("settings.data.history.title")}
          actions={
            <Button
              size="sm"
              variant="dangerGhost"
              disabled={history.length === 0}
              onClick={() => setClearOpen(true)}
            >
              <Trash2 aria-hidden />
              {t("settings.data.history.clear")}
            </Button>
          }
        />
        <PanelBody className="flex flex-col gap-3">
          {history.length === 0 ? (
            <EmptyState title={t("settings.data.history.empty")} />
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
              {history.map((entry) => (
                <HistoryRow key={entry.id} entry={entry} />
              ))}
            </ul>
          )}

          <NumberSetting
            id="settings-history-limit"
            label={t("settings.data.history.limit")}
            hint={t("settings.data.history.limitHint")}
            invalidMessage={t("settings.data.history.limitInvalid")}
            min={1}
            max={1000}
            value={settings.historyLimit}
            onCommit={(value) => void updateSettings({ historyLimit: value })}
          />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title={t("settings.data.transfer.title")} />
        <PanelBody className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void handleExport()}>
            <Upload aria-hidden />
            {t("settings.data.export")}
          </Button>
          <Button variant="secondary" onClick={() => void handleImport()}>
            <Download aria-hidden />
            {t("settings.data.import")}
          </Button>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title={t("settings.data.reset.title")}
          description={t("settings.data.reset.description")}
          actions={
            <Button
              size="sm"
              variant="dangerGhost"
              onClick={() => setResetOpen(true)}
            >
              {t("settings.data.reset.button")}
            </Button>
          }
        />
      </Panel>

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent size="sm">
          <DialogHeader
            title={t("settings.data.history.clearTitle")}
            description={t("settings.data.history.clearBody")}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setClearOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => void handleClear()}
            >
              {t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent size="sm">
          <DialogHeader
            title={t("settings.data.reset.dialogTitle")}
            description={t("settings.data.reset.dialogBody")}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setResetOpen(false);
                void resetSettings();
              }}
            >
              {t("settings.data.reset.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const t = useT();
  const pushToast = useAppStore((state) => state.pushToast);
  const failToast = useAppStore((state) => state.failToast);
  const refreshHistory = useAppStore((state) => state.refreshHistory);
  const [note, setNote] = useState(entry.note ?? "");

  useEffect(() => {
    setNote(entry.note ?? "");
  }, [entry.note]);

  const dirty = note !== (entry.note ?? "");

  async function rename() {
    try {
      await api.renameHistory(entry.id, note.trim() ? note.trim() : null);
      await refreshHistory();
      pushToast({ tone: "success", title: t("settings.data.history.rename") });
    } catch (error) {
      failToast(t("settings.data.history.rename"), error);
    }
  }

  async function remove() {
    try {
      await api.removeHistory(entry.id);
      await refreshHistory();
    } catch (error) {
      failToast(t("settings.data.history.delete"), error);
    }
  }

  return (
    <li className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Badge tone="outline">{entry.kind}</Badge>
        <span className="t-caption min-w-0 flex-1 truncate text-foreground">
          {entry.label || entry.address}
        </span>
        <span className="t-caption shrink-0 text-[color:var(--ash)]">
          ×{entry.useCount}
        </span>
        <Button
          variant="dangerGhost"
          size="icon-sm"
          aria-label={t("settings.data.history.delete")}
          onClick={() => void remove()}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
      <Field label={t("settings.data.history.note")} htmlFor={`note-${entry.id}`}>
        <div className="flex items-center gap-2">
          <Input
            id={`note-${entry.id}`}
            value={note}
            placeholder={t("settings.data.history.notePlaceholder")}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && dirty) void rename();
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={!dirty}
            onClick={() => void rename()}
          >
            {t("settings.data.history.rename")}
          </Button>
        </div>
      </Field>
    </li>
  );
}

