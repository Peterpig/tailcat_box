import { registerMessages } from "@/lib/i18n";

/**
 * Copy for the port-forwarding / service-access screen.
 *
 * Keys are namespaced `forwards.*` so this module owns its own strings instead
 * of editing the shared bundle in `src/lib/messages.ts`.
 */
registerMessages({
  "forwards.title": { "zh-CN": "端口转发", en: "Port forwarding" },
  "forwards.description": {
    "zh-CN":
      "把对端用 tailcat serve <端口> 暴露的服务映射到本机端口，也可以在本机直接打开对端的 HTTP 服务。",
    en: "Map a service the peer exposes with tailcat serve <port> onto a local port, or open a peer HTTP service locally.",
  },
  "forwards.tab.forward": { "zh-CN": "端口转发", en: "Port forwarding" },
  "forwards.tab.service": { "zh-CN": "服务访问", en: "Service access" },

  /* --- engine ------------------------------------------------------------ */
  "forwards.engine.missing.title": {
    "zh-CN": "未检测到 tailcat 引擎",
    en: "tailcat engine not found",
  },
  "forwards.engine.missing.body": {
    "zh-CN": "需要先安装 tailcat CLI，或在设置中指定可执行文件路径，之后才能启动任务。",
    en: "Install the tailcat CLI, or point the app at a binary in Settings, before starting tasks.",
  },
  "forwards.engine.missing.openSettings": {
    "zh-CN": "前往设置",
    en: "Open settings",
  },

  /* --- forward form ------------------------------------------------------ */
  "forwards.forward.form.title": { "zh-CN": "新建端口转发", en: "New port forward" },
  "forwards.forward.form.description": {
    "zh-CN": "对端需要先运行 tailcat serve <端口> 把服务暴露出来。",
    en: "The peer must run tailcat serve <port> to expose the service first.",
  },
  "forwards.field.address": { "zh-CN": "远端地址", en: "Remote address" },
  "forwards.field.address.hint": {
    "zh-CN": "对端的 tailcat 地址令牌（tc…）或指向它的 DNS 名称。",
    en: "The peer's tailcat token (tc…) or a DNS name that resolves to one.",
  },
  "forwards.field.remotePort": { "zh-CN": "远端端口", en: "Remote port" },
  "forwards.field.remotePort.hint": {
    "zh-CN": "需要服务端用 tailcat serve <端口> 暴露该端口。",
    en: "The peer must expose this port with tailcat serve <port>.",
  },
  "forwards.field.localPort": { "zh-CN": "本地端口", en: "Local port" },
  "forwards.field.localPort.hint": {
    "zh-CN": "本机监听端口；0 表示由系统自动分配，真实端口由后端回报。",
    en: "Local listener port; 0 lets the OS assign one, and the real port comes back from the backend.",
  },
  "forwards.field.bindHost": { "zh-CN": "监听地址", en: "Listen address" },
  "forwards.field.bindHost.hint": {
    "zh-CN": "默认 127.0.0.1，只有本机可以访问。",
    en: "Defaults to 127.0.0.1, reachable only from this machine.",
  },
  "forwards.field.label": { "zh-CN": "备注名称", en: "Label" },
  "forwards.field.label.hint": {
    "zh-CN": "可选，用来区分多个转发任务。",
    en: "Optional; helps tell several forwards apart.",
  },
  "forwards.forward.submit": { "zh-CN": "启动转发", en: "Start forward" },
  "forwards.forward.note": {
    "zh-CN":
      "本地监听由官方 tailcat forward 子命令自己持有（tailcat forward --bind=<监听地址> <地址> <本地端口>:<远端端口>）。本地端口填 0 时由系统分配，真实端口一律以后端回报的 listenAddr 为准，界面不会自行推测。",
    en: "The local listener is owned by the official `tailcat forward` subcommand (tailcat forward --bind=<host> <address> <local>:<remote>). Local port 0 is assigned by the OS, and the real port always comes from the backend's listenAddr — the UI never guesses it.",
  },

  /* --- non-loopback risk -------------------------------------------------- */
  "forwards.risk.title": {
    "zh-CN": "监听地址不是回环地址",
    en: "Listen address is not loopback",
  },
  "forwards.risk.body": {
    "zh-CN": "局域网内其他设备可访问此端口。",
    en: "Other devices on your local network can reach this port.",
  },
  "forwards.risk.blocked": {
    "zh-CN": "已禁止提交：请在「设置」中开启「允许非回环监听」后再试。",
    en: "Submission is blocked: enable non-loopback listening in Settings first.",
  },
  "forwards.risk.openSettings": { "zh-CN": "前往设置", en: "Open settings" },

  /* --- service form ------------------------------------------------------- */
  "forwards.service.form.title": { "zh-CN": "新建服务访问", en: "New service access" },
  "forwards.service.form.description": {
    "zh-CN": "在本机开一个端口，用来访问对端暴露的服务。",
    en: "Open a local port that reaches the service the peer exposes.",
  },
  "forwards.field.targetPort": { "zh-CN": "目标端口", en: "Target port" },
  "forwards.field.targetPort.hint": {
    "zh-CN": "对端用 tailcat serve <端口> 暴露的端口。",
    en: "The port the peer exposes with tailcat serve <port>.",
  },
  "forwards.field.scheme": { "zh-CN": "访问协议", en: "Scheme" },
  "forwards.service.submit": { "zh-CN": "启动访问", en: "Start access" },
  "forwards.service.bindNote": {
    "zh-CN": "本地监听固定为 127.0.0.1，仅本机可访问。",
    en: "The local listener is pinned to 127.0.0.1 and is reachable only from this machine.",
  },
  "forwards.service.note.title": {
    "zh-CN": "关于服务访问",
    en: "About service access",
  },
  "forwards.service.note.body": {
    "zh-CN":
      "只有对端服务本身是 HTTP(S) 时，浏览器打开才有意义；SSH、数据库等其他协议请用对应客户端连接上面的本地地址。",
    en: "Opening in a browser only makes sense when the peer service itself speaks HTTP(S); for SSH, databases and other protocols, point the matching client at the local address above.",
  },
  "forwards.service.note.ssh": {
    "zh-CN": "tailcat CLI 自带 ssh 子命令；本界面不提供 SSH 客户端。",
    en: "The tailcat CLI ships an ssh subcommand; this screen does not provide an SSH client.",
  },
  "forwards.service.note.psk": {
    "zh-CN":
      "兼容性提示：tailcat 0.7.0 生成的地址默认包含预共享密钥（PSK），与 ≤ v0.5.0 的客户端不互通；如需兼容旧客户端要在 CLI 侧加 --psk=false，代价是降低安全性。本应用不提供该开关。",
    en: "Compatibility: addresses generated by tailcat 0.7.0 include a pre-shared key (PSK) by default and do not interoperate with tailcat ≤ v0.5.0 clients. Supporting old clients requires --psk=false on the CLI side, which lowers security. This app exposes no such switch.",
  },
  "forwards.service.notReady": {
    "zh-CN": "任务尚未就绪，端口分配完成后可用。",
    en: "The task is not ready yet; this becomes available once a port is assigned.",
  },

  /* --- task list ---------------------------------------------------------- */
  "forwards.list.forward.title": { "zh-CN": "转发任务", en: "Forward tasks" },
  "forwards.list.forward.description": {
    "zh-CN": "监听地址与运行时长均来自后端回报的真实数据。",
    en: "Listen addresses and uptimes come from the backend, never from the UI.",
  },
  "forwards.list.service.title": { "zh-CN": "服务访问任务", en: "Service tasks" },
  "forwards.list.service.description": {
    "zh-CN": "端口分配完成后即可复制本地访问地址。",
    en: "Copy the local address once a port has been assigned.",
  },
  "forwards.empty.forward.title": {
    "zh-CN": "暂无端口转发任务",
    en: "No port forwards yet",
  },
  "forwards.empty.forward.description": {
    "zh-CN":
      "前置条件：对端先执行 tailcat serve <端口> 暴露服务，然后在上面的表单里创建本地转发。",
    en: "Prerequisite: the peer runs tailcat serve <port> first, then create the local forward above.",
  },
  "forwards.empty.service.title": {
    "zh-CN": "暂无服务访问任务",
    en: "No service access tasks yet",
  },
  "forwards.empty.service.description": {
    "zh-CN":
      "前置条件：对端用 tailcat serve <端口> 暴露服务，然后在上面的表单里创建本地访问地址。",
    en: "Prerequisite: the peer exposes a service with tailcat serve <port>, then create the local address above.",
  },
  "forwards.action.start": { "zh-CN": "启动", en: "Start" },
  "forwards.action.restart": { "zh-CN": "重新启动", en: "Restart" },
  "forwards.action.stop": { "zh-CN": "停止", en: "Stop" },
  "forwards.action.delete": { "zh-CN": "删除", en: "Delete" },
  "forwards.action.copyUrl": { "zh-CN": "复制地址", en: "Copy address" },
  "forwards.action.openBrowser": { "zh-CN": "在浏览器打开", en: "Open in browser" },
  "forwards.action.restart.unavailable": {
    "zh-CN": "显示为「启动」的任务来自上次会话，参数未保留，无法原样重启，请重新创建。",
    en: "Tasks whose start button is disabled came from an earlier session; their parameters were not kept, so recreate them instead.",
  },

  /* --- detail ------------------------------------------------------------- */
  "forwards.detail.title": { "zh-CN": "任务详情", en: "Task detail" },
  "forwards.detail.args": { "zh-CN": "参数摘要", en: "Arguments" },
  "forwards.detail.listen": { "zh-CN": "监听地址", en: "Listen address" },
  "forwards.detail.address": { "zh-CN": "远端地址", en: "Remote address" },
  "forwards.detail.startedAt": { "zh-CN": "启动时间", en: "Started" },
  "forwards.detail.endedAt": { "zh-CN": "结束时间", en: "Ended" },

  /* --- validation --------------------------------------------------------- */
  "forwards.error.address.empty": {
    "zh-CN": "请填写远端地址。",
    en: "Enter the remote address.",
  },
  "forwards.error.address.bad_chars": {
    "zh-CN": "地址格式不合法：请填写 tc 开头的地址令牌或合法的 DNS 名称。",
    en: "Invalid address: use a tc… token or a valid DNS name.",
  },
  "forwards.error.address.too_short": {
    "zh-CN": "地址令牌太短，请检查是否被截断。",
    en: "The token looks truncated.",
  },
  "forwards.error.address.too_long": {
    "zh-CN": "地址令牌过长。",
    en: "The token is too long.",
  },
  "forwards.error.address.bad_scheme": {
    "zh-CN": "请只填写地址令牌或 DNS 名称，不要包含协议前缀。",
    en: "Provide only a token or DNS name, without a scheme prefix.",
  },
  "forwards.error.port.empty": { "zh-CN": "请填写端口。", en: "Enter a port." },
  "forwards.error.port.bad_chars": {
    "zh-CN": "端口必须是数字。",
    en: "A port must be numeric.",
  },
  "forwards.error.port.out_of_range": {
    "zh-CN": "端口范围是 0-65535；远端端口必须大于 0。",
    en: "Ports range from 0 to 65535; the remote port must be greater than 0.",
  },
  "forwards.error.host.empty": {
    "zh-CN": "请填写监听地址。",
    en: "Enter a listen address.",
  },
  "forwards.error.host.bad_chars": {
    "zh-CN": "监听地址不能包含空格。",
    en: "A listen address cannot contain spaces.",
  },
  "forwards.error.host.bad_host": {
    "zh-CN": "监听地址不是合法的 IP 或主机名。",
    en: "Not a valid IP address or host name.",
  },
  "forwards.error.generic": { "zh-CN": "输入不合法。", en: "Invalid input." },

  /* --- toasts ------------------------------------------------------------- */
  "forwards.toast.started": { "zh-CN": "任务已启动", en: "Task started" },
});

/** `forwards.error.<scope>.<reason>` — the key a validation failure maps to. */
export function validationMessageKey(
  scope: "address" | "port" | "host",
  reason?: string,
): string {
  return `forwards.error.${scope}.${reason ?? "unknown"}`;
}
