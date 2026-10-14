import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { LOCALES, useT } from "@/lib/i18n";
import { useAppStore } from "@/store/app";
import type { LanguageCode, ThemeMode } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const THEMES: { value: ThemeMode; icon: LucideIcon; labelKey: string }[] = [
  { value: "light", icon: Sun, labelKey: "settings.theme.light" },
  { value: "dark", icon: Moon, labelKey: "settings.theme.dark" },
  { value: "system", icon: Monitor, labelKey: "settings.theme.system" },
];

export function AppearanceSection() {
  const t = useT();
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <Panel>
      <PanelHeader
        title={t("settings.appearance.title")}
        description={t("settings.appearance.description")}
      />
      <PanelBody className="flex flex-col gap-5">
        <Field label={t("settings.appearance.theme")}>
          <div className="flex flex-wrap gap-1.5">
            {THEMES.map((theme) => {
              const Icon = theme.icon;
              const active = settings.theme === theme.value;
              return (
                <Button
                  key={theme.value}
                  variant={active ? "primary" : "secondary"}
                  aria-pressed={active}
                  onClick={() => void updateSettings({ theme: theme.value })}
                  className="min-w-[104px]"
                >
                  <Icon aria-hidden />
                  {t(theme.labelKey)}
                </Button>
              );
            })}
          </div>
        </Field>

        <Field
          label={t("settings.appearance.language")}
          htmlFor="settings-language"
        >
          <Select
            value={settings.language}
            onValueChange={(value) =>
              void updateSettings({ language: value as LanguageCode })
            }
          >
            <SelectTrigger id="settings-language" className="max-w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCALES.map((locale) => (
                <SelectItem key={locale.value} value={locale.value}>
                  {locale.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="settings-redact">
                {t("settings.appearance.redact")}
              </Label>
              <p className="field-hint mt-0.5">
                {t("settings.appearance.redactHint")}
              </p>
            </div>
            <Switch
              id="settings-redact"
              checked={settings.redactAddresses}
              onCheckedChange={(checked) =>
                void updateSettings({ redactAddresses: checked })
              }
            />
          </div>
          <Callout tone="info" title={t("settings.appearance.privacy.title")}>
            {t("settings.appearance.privacy.body")}
          </Callout>
        </div>
      </PanelBody>
    </Panel>
  );
}
