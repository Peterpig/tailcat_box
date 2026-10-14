import {
  FolderOpen,
  FolderSync,
  Home,
  PlugZap,
  Settings,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { registerMessages } from "@/lib/i18n";

export type Route =
  | "home"
  | "connections"
  | "forwards"
  | "transfer"
  | "share"
  | "settings";

registerMessages({
  "nav.home": { "zh-CN": "首页", en: "Home" },
  "nav.connections": { "zh-CN": "连接", en: "Connections" },
  "nav.forwards": { "zh-CN": "端口转发", en: "Port forwarding" },
  "nav.transfer": { "zh-CN": "文件传输", en: "File transfer" },
  "nav.share": { "zh-CN": "文件共享", en: "File sharing" },
  "nav.settings": { "zh-CN": "设置", en: "Settings" },
  "nav.section.main": { "zh-CN": "工作区", en: "Workspace" },
  "nav.section.system": { "zh-CN": "系统", en: "System" },
});

export interface RouteDefinition {
  id: Route;
  labelKey: string;
  icon: LucideIcon;
  /** Displayed as a hint; wired to Cmd/Ctrl+1..6 in the shell. */
  shortcut: string;
  group: "main" | "system";
}

export const ROUTES: RouteDefinition[] = [
  { id: "home", labelKey: "nav.home", icon: Home, shortcut: "1", group: "main" },
  {
    id: "connections",
    labelKey: "nav.connections",
    icon: PlugZap,
    shortcut: "2",
    group: "main",
  },
  {
    id: "forwards",
    labelKey: "nav.forwards",
    icon: Waypoints,
    shortcut: "3",
    group: "main",
  },
  {
    id: "transfer",
    labelKey: "nav.transfer",
    icon: FolderSync,
    shortcut: "4",
    group: "main",
  },
  {
    id: "share",
    labelKey: "nav.share",
    icon: FolderOpen,
    shortcut: "5",
    group: "main",
  },
  {
    id: "settings",
    labelKey: "nav.settings",
    icon: Settings,
    shortcut: "6",
    group: "system",
  },
];

export const DEFAULT_ROUTE: Route = "home";
