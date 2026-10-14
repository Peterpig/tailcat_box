import { useT } from "@/lib/i18n";
import { useAppStore } from "@/store/app";
import { Callout } from "@/components/ui/callout";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function StartupSection() {
  const t = useT();
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <Panel>
      <PanelHeader
        title={t("settings.startup.title")}
        description={t("settings.startup.description")}
      />
      <PanelBody className="flex flex-col gap-5">
        <Field
          label={t("settings.startup.startScreen")}
          htmlFor="settings-start-screen"
        >
          <Select
            value={settings.startScreen}
            onValueChange={(value) =>
              void updateSettings({
                startScreen: value as typeof settings.startScreen,
              })
            }
          >
            <SelectTrigger id="settings-start-screen" className="max-w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="home">
                {t("settings.startup.startScreen.home")}
              </SelectItem>
              <SelectItem value="last">
                {t("settings.startup.startScreen.last")}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="settings-confirm-quit">
              {t("settings.startup.confirmOnQuit")}
            </Label>
            <p className="field-hint mt-0.5">
              {t("settings.startup.confirmOnQuitHint")}
            </p>
          </div>
          <Switch
            id="settings-confirm-quit"
            checked={settings.confirmOnQuit}
            onCheckedChange={(checked) =>
              void updateSettings({ confirmOnQuit: checked })
            }
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="settings-non-loopback">
                {t("settings.startup.nonLoopback")}
              </Label>
              <p className="field-hint mt-0.5">
                {t("settings.startup.nonLoopbackHint")}
              </p>
            </div>
            <Switch
              id="settings-non-loopback"
              checked={settings.allowNonLoopbackBind}
              onCheckedChange={(checked) =>
                void updateSettings({ allowNonLoopbackBind: checked })
              }
            />
          </div>
          {settings.allowNonLoopbackBind ? (
            <Callout tone="risk" title={t("settings.startup.risk.title")}>
              {t("settings.startup.risk.body")}
            </Callout>
          ) : null}
        </div>
      </PanelBody>
    </Panel>
  );
}
