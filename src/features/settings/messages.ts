import { registerMessages } from "@/lib/i18n";

/** Strings owned by the settings screen and its sections. */
registerMessages({
  "settings.title": { "zh-CN": "设置", en: "Settings" },
  "settings.description": {
    "zh-CN": "外观、引擎、启动行为、日志与本地数据的集中管理。",
    en: "Appearance, engine, startup behaviour, logs and local data in one place.",
  },
  "settings.nav": { "zh-CN": "设置小节", en: "Settings sections" },
  "settings.section.appearance": { "zh-CN": "外观", en: "Appearance" },
  "settings.section.engine": { "zh-CN": "引擎", en: "Engine" },
  "settings.section.startup": { "zh-CN": "启动与退出", en: "Startup & quit" },
  "settings.section.logs": { "zh-CN": "日志", en: "Logs" },
  "settings.section.data": { "zh-CN": "数据与配置", en: "Data & config" },
  "settings.section.about": { "zh-CN": "关于", en: "About" },

  /* --- appearance ------------------------------------------------------- */
  "settings.appearance.title": { "zh-CN": "外观", en: "Appearance" },
  "settings.appearance.description": {
    "zh-CN": "主题与界面语言会立即生效并保存。",
    en: "Theme and language apply and persist immediately.",
  },
  "settings.appearance.theme": { "zh-CN": "主题", en: "Theme" },
  "settings.theme.light": { "zh-CN": "浅色", en: "Light" },
  "settings.theme.dark": { "zh-CN": "深色", en: "Dark" },
  "settings.theme.system": { "zh-CN": "跟随系统", en: "System" },
  "settings.appearance.language": { "zh-CN": "界面语言", en: "Language" },
  "settings.appearance.redact": {
    "zh-CN": "地址默认脱敏",
    en: "Redact addresses by default",
  },
  "settings.appearance.redactHint": {
    "zh-CN": "关闭后地址令牌会在列表中直接显示完整内容。",
    en: "When off, full address tokens are shown directly in lists.",
  },
  "settings.appearance.privacy.title": {
    "zh-CN": "连接地址属于凭据",
    en: "Connection addresses are credentials",
  },
  "settings.appearance.privacy.body": {
    "zh-CN":
      "开启脱敏后，地址令牌在界面中默认隐藏，点击眼睛图标才能查看；复制时始终复制完整值，且不会写入日志。",
    en: "With redaction on, address tokens stay hidden until you reveal them; copying always uses the full value and addresses never enter logs.",
  },

  /* --- startup ---------------------------------------------------------- */
  "settings.startup.title": { "zh-CN": "启动与退出", en: "Startup & quit" },
  "settings.startup.description": {
    "zh-CN": "控制应用启动页面与退出前的安全确认。",
    en: "Control the start screen and the safety check before quitting.",
  },
  "settings.startup.startScreen": { "zh-CN": "启动页面", en: "Start screen" },
  "settings.startup.startScreen.home": { "zh-CN": "首页", en: "Home" },
  "settings.startup.startScreen.last": {
    "zh-CN": "恢复上次页面",
    en: "Restore last screen",
  },
  "settings.startup.confirmOnQuit": {
    "zh-CN": "有任务运行时退出前确认",
    en: "Confirm before quitting while tasks run",
  },
  "settings.startup.confirmOnQuitHint": {
    "zh-CN": "关闭窗口时若仍有监听、转发或共享任务，会先弹出确认。",
    en: "When listeners, forwards or shares are still running, a confirmation appears before the window closes.",
  },
  "settings.startup.nonLoopback": {
    "zh-CN": "允许监听非回环地址",
    en: "Allow binding to non-loopback addresses",
  },
  "settings.startup.nonLoopbackHint": {
    "zh-CN": "关闭时所有本地监听强制使用 127.0.0.1。",
    en: "When off, every local listener is forced to 127.0.0.1.",
  },
  "settings.startup.risk.title": { "zh-CN": "暴露风险", en: "Exposure risk" },
  "settings.startup.risk.body": {
    "zh-CN":
      "开启后，转发与服务访问可以绑定到局域网或公网可达的地址。同一网络中的其他设备可能直接访问这些端口，请仅在明确需要时开启。",
    en: "With this on, forwards and service access can bind to LAN- or internet-reachable addresses. Other devices on the network may reach those ports, so enable it only when truly needed.",
  },

  /* --- logs ------------------------------------------------------------- */
  "settings.logs.title": { "zh-CN": "日志", en: "Logs" },
  "settings.logs.description": {
    "zh-CN": "日志级别只影响应用与 CLI 的诊断输出。",
    en: "The level only affects diagnostics from the app and the CLI.",
  },
  "settings.logs.level": { "zh-CN": "日志级别", en: "Log level" },
  "settings.logs.level.error": { "zh-CN": "仅错误（error）", en: "Errors only (error)" },
  "settings.logs.level.warn": { "zh-CN": "警告（warn）", en: "Warnings (warn)" },
  "settings.logs.level.info": { "zh-CN": "常规（info）", en: "Normal (info)" },
  "settings.logs.level.debug": { "zh-CN": "调试（debug）", en: "Debug (debug)" },
  "settings.logs.dir": { "zh-CN": "日志目录", en: "Log directory" },
  "settings.logs.openDir": { "zh-CN": "打开目录", en: "Open folder" },
  "settings.logs.maxLines": {
    "zh-CN": "每个任务保留的日志行数",
    en: "Log lines retained per task",
  },
  "settings.logs.maxLinesHint": {
    "zh-CN": "范围 100–20000，超出范围不会保存。",
    en: "Range 100–20000; out-of-range values are not saved.",
  },
  "settings.logs.maxLinesInvalid": {
    "zh-CN": "请输入 100 到 20000 之间的整数",
    en: "Enter an integer between 100 and 20000",
  },

  /* --- data ------------------------------------------------------------- */
  "settings.data.title": { "zh-CN": "数据与配置", en: "Data & config" },
  "settings.data.description": {
    "zh-CN": "历史记录与配置都保存在本机，不会上传。",
    en: "History and configuration stay on this machine and are never uploaded.",
  },
  "settings.data.history.title": { "zh-CN": "历史记录", en: "History" },
  "settings.data.history.empty": { "zh-CN": "暂无历史记录", en: "No history yet" },
  "settings.data.history.note": { "zh-CN": "备注", en: "Note" },
  "settings.data.history.notePlaceholder": {
    "zh-CN": "为这条记录添加备注",
    en: "Add a note to this entry",
  },
  "settings.data.history.rename": { "zh-CN": "保存备注", en: "Save note" },
  "settings.data.history.delete": { "zh-CN": "删除记录", en: "Delete entry" },
  "settings.data.history.clear": { "zh-CN": "清空历史", en: "Clear history" },
  "settings.data.history.clearTitle": {
    "zh-CN": "清空全部历史记录？",
    en: "Clear all history?",
  },
  "settings.data.history.clearBody": {
    "zh-CN": "所有最近连接记录及其备注都会被删除，且无法恢复。",
    en: "Every recent-connection entry and its note is deleted and cannot be recovered.",
  },
  "settings.data.history.cleared": { "zh-CN": "已清空历史记录", en: "History cleared" },
  "settings.data.history.limit": { "zh-CN": "历史记录上限", en: "History limit" },
  "settings.data.history.limitHint": {
    "zh-CN": "范围 1–1000。",
    en: "Range 1–1000.",
  },
  "settings.data.history.limitInvalid": {
    "zh-CN": "请输入 1 到 1000 之间的整数",
    en: "Enter an integer between 1 and 1000",
  },
  "settings.data.transfer.title": {
    "zh-CN": "配置导入 / 导出",
    en: "Import / export configuration",
  },
  "settings.data.export": { "zh-CN": "导出配置…", en: "Export…" },
  "settings.data.import": { "zh-CN": "导入配置…", en: "Import…" },
  "settings.data.exported": { "zh-CN": "配置已导出", en: "Configuration exported" },
  "settings.data.imported": {
    "zh-CN": "配置已导入并生效",
    en: "Configuration imported and applied",
  },
  "settings.data.reset.title": { "zh-CN": "恢复默认设置", en: "Reset settings" },
  "settings.data.reset.description": {
    "zh-CN": "清除所有自定义项，恢复到首次安装的状态。",
    en: "Clears every customisation and returns to the first-run state.",
  },
  "settings.data.reset.button": { "zh-CN": "恢复默认设置", en: "Reset to defaults" },
  "settings.data.reset.dialogTitle": {
    "zh-CN": "恢复默认设置？",
    en: "Reset to defaults?",
  },
  "settings.data.reset.dialogBody": {
    "zh-CN":
      "主题、语言、引擎路径、DERP、启动行为与日志设置都会恢复默认；历史记录不受影响。此操作不可撤销。",
    en: "Theme, language, engine path, DERP, startup behaviour and log settings return to defaults; history is untouched. This cannot be undone.",
  },
  "settings.data.reset.confirm": { "zh-CN": "恢复默认", en: "Reset" },

  /* --- about ------------------------------------------------------------ */
  "settings.about.title": { "zh-CN": "关于", en: "About" },
  "settings.about.description": {
    "zh-CN": "版本信息、运行环境与许可说明。",
    en: "Version, runtime environment and licence information.",
  },
  "settings.about.app": { "zh-CN": "应用", en: "Application" },
  "settings.about.version": { "zh-CN": "版本", en: "Version" },
  "settings.about.platform": { "zh-CN": "平台", en: "Platform" },
  "settings.about.arch": { "zh-CN": "架构", en: "Architecture" },
  "settings.about.configDir": { "zh-CN": "配置目录", en: "Config directory" },
  "settings.about.openConfig": { "zh-CN": "打开配置目录", en: "Open config folder" },
  "settings.about.disclaimer.title": { "zh-CN": "关于本项目", en: "About this app" },
  "settings.about.disclaimer.body": {
    "zh-CN":
      "Tailcat Box 是 tailcat 官方 CLI 的图形外壳，仅调用其命令行接口。tailcat 由 Tailscale 以 BSD-3-Clause 许可发布。本应用不提供任何账号、审计或 SLA 能力，也不使用 Tailscale 控制平面。",
    en: "Tailcat Box is a graphical shell around the official tailcat CLI and only drives its command line. tailcat is published by Tailscale under the BSD-3-Clause licence. This app offers no account, audit or SLA capability, and does not use the Tailscale control plane.",
  },
  "settings.about.license": { "zh-CN": "查看许可证", en: "View licence" },
  "settings.about.licenseTitle": { "zh-CN": "许可证", en: "Licence" },
  "settings.about.licenseName": { "zh-CN": "BSD-3-Clause", en: "BSD-3-Clause" },
  "settings.about.licenseBody": {
    "zh-CN":
      "在保留版权声明与免责声明的前提下，允许以源代码或二进制形式再分发与修改，且不得使用贡献者名义为衍生作品背书。软件按「现状」提供，不附带任何明示或默示担保。",
    en: "Redistribution and use in source and binary forms are permitted provided the copyright notice and disclaimer are retained, and contributor names may not endorse derived products. The software is provided “as is”, without warranty of any kind.",
  },
  "settings.about.thirdParty": { "zh-CN": "第三方依赖", en: "Third-party dependencies" },
  "settings.about.thirdPartyBody": {
    "zh-CN":
      "界面使用 React、Tauri、Tailwind CSS、Radix Primitives、Lucide 与 Zustand 等开源组件，各自遵循其原始许可证。",
    en: "The interface uses open-source components including React, Tauri, Tailwind CSS, Radix Primitives, Lucide and Zustand, each under its own licence.",
  },
  "settings.about.licenseClose": { "zh-CN": "关闭", en: "Close" },
});
