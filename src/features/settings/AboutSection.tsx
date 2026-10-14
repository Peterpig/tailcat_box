import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/store/app";
import type { SystemInfo } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { KeyValue, KeyValueList } from "@/components/ui/kv";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";

const OS_LABEL: Record<SystemInfo["os"], string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
  unknown: "—",
};

export function AboutSection() {
  const t = useT();
  const system = useAppStore((state) => state.system);
  const [licenseOpen, setLicenseOpen] = useState(false);

  const configDir = system?.configDir ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHeader
          title={t("settings.about.title")}
          description={t("settings.about.description")}
          actions={
            <Button size="sm" variant="secondary" onClick={() => setLicenseOpen(true)}>
              {t("settings.about.license")}
            </Button>
          }
        />
        <PanelBody>
          <KeyValueList>
            <KeyValue label={t("settings.about.app")}>Tailcat Box</KeyValue>
            <KeyValue label={t("settings.about.version")}>
              {system?.appVersion ?? "—"}
            </KeyValue>
            <KeyValue label={t("settings.about.platform")}>
              {system ? OS_LABEL[system.os] : "—"}
            </KeyValue>
            <KeyValue label={t("settings.about.arch")}>
              {system?.arch ?? "—"}
            </KeyValue>
            <KeyValue label={t("settings.about.configDir")} mono>
              {configDir ?? "—"}
            </KeyValue>
          </KeyValueList>

          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={!configDir}
              onClick={() => {
                if (configDir) void api.openPath(configDir);
              }}
            >
              <FolderOpen aria-hidden />
              {t("settings.about.openConfig")}
            </Button>
          </div>
        </PanelBody>
      </Panel>

      <Callout tone="info" title={t("settings.about.disclaimer.title")}>
        {t("settings.about.disclaimer.body")}
      </Callout>

      <Dialog open={licenseOpen} onOpenChange={setLicenseOpen}>
        <DialogContent size="md">
          <DialogHeader
            title={t("settings.about.licenseTitle")}
            description={t("settings.about.licenseName")}
          />
          <DialogBody className="flex flex-col gap-4">
            <div>
              <p className="t-subtitle">BSD-3-Clause</p>
              <p className="t-caption mt-1 text-muted-foreground">
                {t("settings.about.licenseBody")}
              </p>
            </div>
            <div className="border-t border-border pt-3">
              <p className="t-subtitle">{t("settings.about.thirdParty")}</p>
              <p className="t-caption mt-1 text-muted-foreground">
                {t("settings.about.thirdPartyBody")}
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setLicenseOpen(false)}>
              {t("settings.about.licenseClose")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
