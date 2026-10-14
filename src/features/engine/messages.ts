import { registerMessages } from "@/lib/i18n";

/** Strings owned by the engine-management components. */
registerMessages({
  "engine.status.title": { "zh-CN": "引擎状态", en: "Engine status" },
  "engine.status.description": {
    "zh-CN": "Tailcat Box 通过调用官方 tailcat CLI 工作。",
    en: "Tailcat Box drives the official tailcat CLI.",
  },
  "engine.status.found": { "zh-CN": "已就绪", en: "Ready" },
  "engine.status.missing": { "zh-CN": "未检测到", en: "Not found" },
  "engine.status.version": { "zh-CN": "版本", en: "Version" },
  "engine.status.source": { "zh-CN": "来源", en: "Source" },
  "engine.status.binary": { "zh-CN": "二进制文件", en: "Binary" },
  "engine.status.keysDir": { "zh-CN": "密钥目录", en: "Keys directory" },
  "engine.status.derp": { "zh-CN": "DERP Map", en: "DERP map" },
  "engine.status.derpDefault": {
    "zh-CN": "官方默认（https://tailcat.dev/derpmap.json）",
    en: "Official default (https://tailcat.dev/derpmap.json)",
  },
  "engine.status.unknown": { "zh-CN": "检测中…", en: "Detecting…" },
  "engine.status.readiness": {
    "zh-CN": "引擎是否可用以 tailcat version 能否执行为准。",
    en: "Engine readiness is judged by whether tailcat version runs.",
  },
  "engine.source.bundled": { "zh-CN": "随应用内置", en: "Bundled with app" },
  "engine.source.path": { "zh-CN": "系统 PATH", en: "System PATH" },
  "engine.source.custom": { "zh-CN": "自定义路径", en: "Custom path" },
  "engine.source.missing": { "zh-CN": "缺失", en: "Missing" },

  "engine.missing.title": { "zh-CN": "未检测到 tailcat", en: "tailcat not found" },
  "engine.missing.body": {
    "zh-CN":
      "连接、转发与文件传输都需要官方 tailcat CLI。请选择下面任一方式安装，然后在下方检测路径。",
    en: "Connections, forwarding and file transfer all need the official tailcat CLI. Install it with any option below, then detect the path.",
  },
  "engine.missing.brew": {
    "zh-CN": "macOS / Linux：使用 Homebrew 安装 brew install tailcat",
    en: "macOS / Linux: install with Homebrew — brew install tailcat",
  },
  "engine.missing.releases": {
    "zh-CN": "从官方 GitHub Releases 下载对应平台的二进制文件",
    en: "Download the binary for your platform from the official GitHub Releases",
  },
  "engine.missing.customPath": {
    "zh-CN": "或在下方的二进制路径中填写本地已存在的 tailcat 路径",
    en: "Or point the binary path below at an existing local tailcat",
  },
  "engine.missing.noScript": {
    "zh-CN":
      "本项目不会自动下载或执行来源不明的脚本，安装与校验由你自行完成。",
    en: "This app never downloads or runs scripts from unverified sources; installation and verification stay in your hands.",
  },
  "engine.missing.openReleases": {
    "zh-CN": "打开官方 Releases",
    en: "Open official Releases",
  },

  "engine.download.title": { "zh-CN": "下载官方引擎", en: "Download official engine" },
  "engine.download.description": {
    "zh-CN":
      "从官方 GitHub Releases 获取当前平台的 tailcat 二进制，校验 SHA256 后安装并自动切换过去。",
    en: "Fetches the tailcat binary for this platform from the official GitHub Releases, verifies its SHA256, installs it and switches the engine over.",
  },
  "engine.download.platform": { "zh-CN": "当前平台", en: "Platform" },
  "engine.download.latest": { "zh-CN": "官方最新版本", en: "Latest official version" },
  "engine.download.asset": { "zh-CN": "产物文件", en: "Asset" },
  "engine.download.unknown": { "zh-CN": "未知", en: "Unknown" },
  "engine.download.checking": {
    "zh-CN": "正在读取官方版本信息…",
    en: "Reading the official release info…",
  },
  "engine.download.unsupportedTitle": {
    "zh-CN": "当前平台不支持自动下载",
    en: "Automatic download is unavailable here",
  },
  "engine.download.feedWarning": {
    "zh-CN": "未能获取官方最新版本",
    en: "Could not read the latest official version",
  },
  "engine.download.versionLabel": { "zh-CN": "安装版本", en: "Version to install" },
  "engine.download.versionPlaceholder": {
    "zh-CN": "留空安装最新版",
    en: "Leave empty for the latest",
  },
  "engine.download.versionHint": {
    "zh-CN":
      "填写官方版本号（例如 0.7.0）可安装指定版本；留空则安装官方最新版。",
    en: "Enter an official version (e.g. 0.7.0) to install a specific release; leave empty for the latest.",
  },
  "engine.download.submit": { "zh-CN": "下载并安装", en: "Download and install" },
  "engine.download.phase.checking": { "zh-CN": "检查官方版本", en: "Checking official release" },
  "engine.download.phase.downloading": { "zh-CN": "下载中", en: "Downloading" },
  "engine.download.phase.verifying": { "zh-CN": "校验中", en: "Verifying" },
  "engine.download.phase.extracting": { "zh-CN": "解压中", en: "Extracting" },
  "engine.download.phase.installing": { "zh-CN": "安装中", en: "Installing" },
  "engine.download.phase.done": { "zh-CN": "完成", en: "Done" },
  "engine.download.phase.error": { "zh-CN": "失败", en: "Failed" },
  "engine.download.percent": { "zh-CN": "{percent}%", en: "{percent}%" },
  "engine.download.bytes": {
    "zh-CN": "已下载 {done} / {total}",
    en: "{done} / {total} downloaded",
  },
  "engine.download.bytesUnknown": {
    "zh-CN": "总大小未知，正在下载…",
    en: "Total size unknown, downloading…",
  },
  "engine.download.done": { "zh-CN": "引擎已安装", en: "Engine installed" },
  "engine.download.installedPath": { "zh-CN": "已安装到", en: "Installed to" },

  "engine.path.title": { "zh-CN": "二进制路径", en: "Binary path" },
  "engine.path.label": { "zh-CN": "自定义 tailcat 路径", en: "Custom tailcat path" },
  "engine.path.placeholder": {
    "zh-CN": "留空则自动检测系统 PATH 与内置二进制",
    en: "Leave empty to auto-detect PATH and bundled binary",
  },
  "engine.path.hint": {
    "zh-CN": "填写绝对路径后点击「检测」，校验通过会立即生效。",
    en: "Enter an absolute path and click Detect; a valid binary takes effect immediately.",
  },
  "engine.path.empty": {
    "zh-CN": "请先填写要检测的二进制路径",
    en: "Enter a binary path to detect first",
  },
  "engine.path.detect": { "zh-CN": "检测", en: "Detect" },
  "engine.path.useSystem": { "zh-CN": "使用系统 PATH", en: "Use system PATH" },
  "engine.path.saved": { "zh-CN": "已切换引擎路径", en: "Engine path updated" },
  "engine.path.systemCleared": {
    "zh-CN": "已恢复自动检测（系统 PATH / 内置二进制）",
    en: "Auto-detection restored (system PATH / bundled binary)",
  },

  "engine.derp.title": { "zh-CN": "DERP Map", en: "DERP map" },
  "engine.derp.label": { "zh-CN": "DERP Map 地址", en: "DERP map URL" },
  "engine.derp.placeholder": { "zh-CN": "https://…/derpmap.json", en: "https://…/derpmap.json" },
  "engine.derp.hint": {
    "zh-CN":
      "留空表示使用官方默认 https://tailcat.dev/derpmap.json；自定义地址必须使用 https。",
    en: "Empty means the official default https://tailcat.dev/derpmap.json; custom URLs must use https.",
  },
  "engine.derp.save": { "zh-CN": "保存", en: "Save" },
  "engine.derp.invalid": { "zh-CN": "不是合法的 URL", en: "Not a valid URL" },
  "engine.derp.https": {
    "zh-CN": "DERP Map 必须使用 https 地址",
    en: "The DERP map URL must use https",
  },
  "engine.derp.saved": { "zh-CN": "已保存 DERP Map", en: "DERP map saved" },
  "engine.derp.cleared": {
    "zh-CN": "已恢复官方默认 DERP Map",
    en: "Official default DERP map restored",
  },

  "engine.ping.title": {
    "zh-CN": "路径探测",
    en: "Path probe",
  },
  "engine.ping.description": {
    "zh-CN":
      "调用 tailcat ping 探测到对端的连通性与路径：成功时显示每跳 RTT 与 DERP/直连路径，失败时按真实错误报告。",
    en: "Runs tailcat ping to probe reachability and the path to a peer: on success it shows each hop's RTT and the DERP/direct path, on failure it reports the real error.",
  },
  "engine.ping.address": { "zh-CN": "地址令牌 / DNS 名称", en: "Address token / DNS name" },
  "engine.ping.placeholder": { "zh-CN": "tc… 或 name.example.com", en: "tc… or name.example.com" },
  "engine.ping.run": { "zh-CN": "探测", en: "Probe" },
  "engine.ping.empty": { "zh-CN": "请填写要探测的地址", en: "Enter an address to probe" },
  "engine.ping.ok": {
    "zh-CN": "收到 {count} 个响应",
    en: "{count} response(s) received",
  },
  "engine.ping.noResponse": {
    "zh-CN": "tailcat ping 未返回任何响应。",
    en: "tailcat ping returned no response.",
  },
  "engine.ping.via": { "zh-CN": "经由", en: "via" },
  "engine.ping.direct": { "zh-CN": "直连", en: "Direct" },
  "engine.ping.relay": { "zh-CN": "中继", en: "Relayed" },

  "engine.keys.title": { "zh-CN": "密钥管理", en: "Key management" },
  "engine.keys.description": {
    "zh-CN": "服务端密钥决定连接地址；客户端身份密钥用于 --allow 白名单。",
    en: "Server keys determine the connection address; client identity keys feed the --allow list.",
  },
  "engine.keys.dir": { "zh-CN": "目录", en: "Directory" },
  "engine.keys.empty": {
    "zh-CN": "还没有保存的密钥",
    en: "No saved keys yet",
  },
  "engine.keys.emptyHint": {
    "zh-CN": "新建一个服务端密钥即可获得稳定的连接地址。",
    en: "Create a server key to get a stable connection address.",
  },
  "engine.keys.new": { "zh-CN": "新建密钥", en: "New key" },
  "engine.keys.badge.server": { "zh-CN": "服务端", en: "Server" },
  "engine.keys.badge.client": { "zh-CN": "客户端", en: "Client" },
  "engine.keys.badge.default": { "zh-CN": "default", en: "default" },
  "engine.keys.delete": { "zh-CN": "删除", en: "Delete" },
  "engine.keys.deleteTitle": {
    "zh-CN": "删除密钥「{name}」？",
    en: "Delete key “{name}”?",
  },
  "engine.keys.deleteBody": {
    "zh-CN":
      "删除后使用该密钥的连接地址将立即失效，正在使用它的对端会无法再连接。此操作不可撤销。",
    en: "Addresses derived from this key stop working immediately and peers using them can no longer connect. This cannot be undone.",
  },
  "engine.keys.deleted": { "zh-CN": "已删除密钥 {name}", en: "Deleted key {name}" },
  "engine.keys.defaultMagic.title": {
    "zh-CN": "default 是魔法名",
    en: "“default” is a magic name",
  },
  "engine.keys.defaultMagic.body": {
    "zh-CN":
      "名为 default 的服务端密钥是 CLI 的魔法名：一旦存在，serve 会自动使用它，因此连接地址会在多次启动之间保持稳定。不要随意删除它。",
    en: "A server key named “default” is a CLI magic name: once it exists, serve uses it automatically, so the connection address stays stable across restarts. Avoid deleting it casually.",
  },

  "engine.keys.create.title": { "zh-CN": "新建密钥", en: "New key" },
  "engine.keys.create.description": {
    "zh-CN": "生成一个新的 tailcat 密钥。",
    en: "Generate a new tailcat key.",
  },
  "engine.keys.create.name": { "zh-CN": "名称", en: "Name" },
  "engine.keys.create.namePlaceholder": { "zh-CN": "例如 server-1", en: "e.g. server-1" },
  "engine.keys.create.nameRequired": {
    "zh-CN": "请填写密钥名称",
    en: "Enter a key name",
  },
  "engine.keys.create.client": {
    "zh-CN": "客户端身份密钥",
    en: "Client identity key",
  },
  "engine.keys.create.clientHint": {
    "zh-CN": "生成公钥而非连接地址，用于服务端 --allow 白名单。",
    en: "Produces a public key instead of an address, for the server-side --allow list.",
  },
  "engine.keys.create.region": { "zh-CN": "DERP 区域", en: "DERP region" },
  "engine.keys.create.regionAuto": { "zh-CN": "自动", en: "Automatic" },
  "engine.keys.create.fixedRegion": {
    "zh-CN": "固定区域（--fixed-region）",
    en: "Pin region (--fixed-region)",
  },
  "engine.keys.create.embedDerpMap": {
    "zh-CN": "内嵌 DERP 节点（--embed-derp-map）",
    en: "Embed DERP node (--embed-derp-map)",
  },
  "engine.keys.create.force": {
    "zh-CN": "覆盖同名密钥（--force）",
    en: "Overwrite same name (--force)",
  },
  "engine.keys.create.submit": { "zh-CN": "创建", en: "Create" },
  "engine.keys.created": { "zh-CN": "密钥已创建", en: "Key created" },
  "engine.keys.result.server": {
    "zh-CN": "服务端地址（交给对端连接）",
    en: "Server address (hand to peers)",
  },
  "engine.keys.result.client": {
    "zh-CN": "客户端公钥（填入服务端 --allow）",
    en: "Client public key (use in server --allow)",
  },
  "engine.keys.result.written": { "zh-CN": "私钥文件", en: "Private key file" },
  "engine.keys.result.done": { "zh-CN": "完成", en: "Done" },
});
