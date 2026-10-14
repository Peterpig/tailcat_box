import { useState } from "react";
import {
  Cpu,
  Database,
  Info,
  Palette,
  Rocket,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ScreenBody } from "@/components/layout/screen";
import { EnginePanel } from "@/features/engine/EnginePanel";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ScreenProps } from "@/App";
import { AboutSection } from "./AboutSection";
import { AppearanceSection } from "./AppearanceSection";
import { DataSection } from "./DataSection";
import { LogsSection } from "./LogsSection";
import { StartupSection } from "./StartupSection";
import "./messages";

type SectionId = "appearance" | "engine" | "startup" | "logs" | "data" | "about";

const SECTIONS: { id: SectionId; labelKey: string; icon: LucideIcon }[] = [
  { id: "appearance", labelKey: "settings.section.appearance", icon: Palette },
  { id: "engine", labelKey: "settings.section.engine", icon: Cpu },
  { id: "startup", labelKey: "settings.section.startup", icon: Rocket },
  { id: "logs", labelKey: "settings.section.logs", icon: ScrollText },
  { id: "data", labelKey: "settings.section.data", icon: Database },
  { id: "about", labelKey: "settings.section.about", icon: Info },
];

/**
 * Settings screen: a compact section rail on the left, one focused panel on
 * the right. Only the selected section is mounted so each panel's data fetch
 * happens when it is actually shown.
 */
export default function SettingsScreen(_props: ScreenProps) {
  const t = useT();
  const [section, setSection] = useState<SectionId>("appearance");

  return (
    <>
      <PageHeader
        title={t("settings.title")}
        description={t("settings.description")}
      />
      <ScreenBody>
        <div className="grid gap-5 lg:grid-cols-[168px_minmax(0,1fr)]">
          <nav
            aria-label={t("settings.nav")}
            className="lg:sticky lg:top-0 lg:self-start"
          >
            <ul className="flex flex-wrap gap-1 lg:flex-col lg:flex-nowrap">
              {SECTIONS.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={active ? "true" : undefined}
                      onClick={() => setSection(item.id)}
                      className={cn(
                        "flex h-8 w-auto items-center gap-2 rounded-md px-2.5 text-left text-[13px] font-medium lg:w-full",
                        "transition-colors duration-[var(--motion-duration)] ease-[var(--motion-ease)]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <Icon className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{t(item.labelKey)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex min-w-0 flex-col gap-4">
            {section === "appearance" ? <AppearanceSection /> : null}
            {section === "engine" ? <EnginePanel /> : null}
            {section === "startup" ? <StartupSection /> : null}
            {section === "logs" ? <LogsSection /> : null}
            {section === "data" ? <DataSection /> : null}
            {section === "about" ? <AboutSection /> : null}
          </div>
        </div>
      </ScreenBody>
    </>
  );
}
