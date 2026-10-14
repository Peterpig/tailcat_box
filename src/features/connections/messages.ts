import { registerMessages } from "@/lib/i18n";

/** Copy for the connections screen. Keys are namespaced with `connections.`. */
registerMessages({
  "connections.title": { "zh-CN": "连接", en: "Connections" },
  "connections.description": {
    "zh-CN": "创建监听服务把本机能力暴露给对端，或连接一个已有的对端地址。",
    en: "Expose something from this machine, or connect to an existing peer address.",
  },
  "connections.tab.listen": { "zh-CN": "创建监听服务", en: "Create a listener" },
  "connections.tab.connect": { "zh-CN": "连接对端", en: "Connect to a peer" },
  "connections.engineMissing.title": {
    "zh-CN": "无法启动任务：未检测到 tailcat 引擎",
    en: "Cannot start tasks: tailcat engine not found",
  },
  "connections.engineMissing.body": {
    "zh-CN": "请先在设置中配置 tailcat 二进制文件路径，然后再回到这里。",
    en: "Configure the tailcat binary in Settings, then come back here.",
  },
  "connections.goSettings": { "zh-CN": "前往设置", en: "Open settings" },

  /* --- listen: targets --------------------------------------------------- */
  "connections.listen.targets.label": { "zh-CN": "服务目标", en: "Serve targets" },
  "connections.listen.targets.placeholder": {
    "zh-CN": "例如 8080 或 8000-8010 或 files",
    en: "e.g. 8080, 8000-8010 or files",
  },
  "connections.listen.targets.hint": {
    "zh-CN":
      "可以填写端口、端口范围或服务名，用空格或逗号分隔。端口会被代理到服务端同一个 localhost 端口。",
    en: "Ports, port ranges or service names, separated by spaces or commas. Ports are proxied to the same localhost port on the server.",
  },
  "connections.listen.targets.invalid": {
    "zh-CN": "“{value}”：{reason}",
    en: "“{value}”: {reason}",
  },
  /* --- validation reasons ------------------------------------------------ */
  "connections.reason.empty": { "zh-CN": "不能为空", en: "must not be empty" },
  "connections.reason.bad_chars": { "zh-CN": "包含非法字符", en: "contains invalid characters" },
  "connections.reason.too_short": { "zh-CN": "内容太短", en: "is too short" },
  "connections.reason.too_long": { "zh-CN": "内容太长", en: "is too long" },
  "connections.reason.out_of_range": { "zh-CN": "超出允许范围", en: "is out of range" },
  "connections.reason.not_absolute": {
    "zh-CN": "必须是相对路径",
    en: "must be a relative path",
  },
  "connections.reason.bad_host": {
    "zh-CN": "不是合法的 IP 或主机名",
    en: "is not a valid IP or host name",
  },
  "connections.reason.bad_port_range": {
    "zh-CN": "端口范围不合法",
    en: "is not a valid port range",
  },
  "connections.reason.reversed_range": {
    "zh-CN": "端口范围起止顺序颠倒",
    en: "has its range bounds reversed",
  },
  "connections.reason.bad_scheme": {
    "zh-CN": "带有协议前缀，请只填写地址令牌或 DNS 名称",
    en: "has a URL scheme prefix; use only the token or DNS name",
  },
  "connections.reason.unknown": { "zh-CN": "格式不合法", en: "is not valid" },
  "connections.listen.services.label": { "zh-CN": "服务名快捷填写", en: "Service shortcuts" },
  "connections.listen.services.exposure": {
    "zh-CN":
      "all = 暴露服务端所有已声明的服务；exit-node = 让对端把本机当作出口节点（其全部流量经本机出网），风险最高；ssh = 需要额外提供 --ssh-authorized-keys 授权公钥，本应用不提供该输入，因此这里不给快捷填写；exec = 需要在 -- 之后给出要执行的命令，本应用不提供该入口。",
    en: "all = expose every service the server declares; exit-node = let the peer route all of its traffic through this machine (highest risk); ssh = additionally requires --ssh-authorized-keys, which this app does not collect, so no shortcut is offered; exec = requires the command to run after --, which this app does not provide.",
  },
  "connections.listen.service.files": { "zh-CN": "files", en: "files" },
  "connections.listen.service.no-auth-ssh": { "zh-CN": "no-auth-ssh", en: "no-auth-ssh" },
  "connections.listen.service.exit-node": { "zh-CN": "exit-node", en: "exit-node" },
  "connections.listen.service.all": { "zh-CN": "all", en: "all" },
  "connections.listen.service.files.hint": {
    "zh-CN": "目录服务，需要选择共享目录与读写模式。",
    en: "Directory service; pick a folder and an access mode.",
  },
  "connections.listen.service.no-auth-ssh.hint": {
    "zh-CN": "允许对端免认证 SSH 登录本机（tailcat 会直接调用系统 sshd 语义）。",
    en: "Allows unauthenticated SSH logins to this machine.",
  },

  /* --- listen: files ----------------------------------------------------- */
  "connections.listen.files.title": { "zh-CN": "目录服务（files）", en: "Directory service (files)" },
  "connections.listen.files.dir": { "zh-CN": "共享目录", en: "Shared folder" },
  "connections.listen.files.dirHint": {
    "zh-CN": "只有这个目录内的文件会被暴露，符号链接与上级路径不可访问。",
    en: "Only files inside this folder are exposed; symlinks and parent paths stay out of reach.",
  },
  "connections.listen.files.dirRequired": {
    "zh-CN": "选择了 files 服务时必须先指定共享目录。",
    en: "The files service requires a shared folder.",
  },
  "connections.listen.files.mode": { "zh-CN": "访问模式", en: "Access mode" },
  "connections.listen.files.mode.ro": { "zh-CN": "只读（ro）", en: "Read-only (ro)" },
  "connections.listen.files.mode.rw": { "zh-CN": "读写（rw）", en: "Read-write (rw)" },
  "connections.listen.files.mode.wo": { "zh-CN": "只写（wo）", en: "Write-only (wo)" },
  "connections.listen.files.mode.woPlus": {
    "zh-CN": "递归只写（wo+）",
    en: "Recursive write-only (wo+)",
  },
  "connections.listen.files.mode.ro.desc": {
    "zh-CN": "对端只能读取目录内容，不能修改或删除。",
    en: "Peers can only read; nothing can be modified or deleted.",
  },
  "connections.listen.files.mode.rw.desc": {
    "zh-CN": "对端可以读取、写入、覆盖和删除目录内容。",
    en: "Peers can read, write, overwrite and delete inside the folder.",
  },
  "connections.listen.files.mode.wo.desc": {
    "zh-CN": "只写投递箱：对端只能上传文件，无法列出或读取已有内容。",
    en: "Write-only drop box: peers can upload, but cannot list or read existing files.",
  },
  "connections.listen.files.mode.woPlus.desc": {
    "zh-CN":
      "递归只写投递箱：对端可以用 tailcat cp -r 投递整个目录树，代价是发送端能够创建并探测目录与部分文件名是否存在，隐私性弱于扁平的只写（wo）。",
    en: "Recursive write-only drop box: peers can deliver a whole directory tree with tailcat cp -r, at the cost of letting the sender create and probe directories and some file names, which is less private than the flat wo mode.",
  },
  "connections.listen.files.rwRisk.title": {
    "zh-CN": "读写共享会让对端修改本机文件",
    en: "Read-write sharing lets the peer modify local files",
  },
  "connections.listen.files.rwRisk.body": {
    "zh-CN":
      "对端可以在这个目录内创建、覆盖和删除文件。请只共享专用的交换目录，不要共享主目录或系统目录。",
    en: "The peer can create, overwrite and delete files in this folder. Share a dedicated exchange folder, never your home or system directories.",
  },

  /* --- listen: keys ------------------------------------------------------ */
  "connections.listen.key.label": { "zh-CN": "服务端密钥", en: "Server key" },
  "connections.listen.key.temp": { "zh-CN": "临时密钥", en: "Ephemeral key" },
  "connections.listen.key.temp.desc": {
    "zh-CN": "每次启动生成一次性密钥，停止后地址即失效（默认）。",
    en: "A one-off key per run; the address dies with the task (default).",
  },
  "connections.listen.key.saved": { "zh-CN": "使用已保存密钥", en: "Use a saved key" },
  "connections.listen.key.saved.desc": {
    "zh-CN": "复用 tailcat 密钥目录中的服务端密钥，地址在重启后仍然有效。",
    en: "Reuse a server key from the tailcat key directory; the address survives restarts.",
  },
  "connections.listen.key.none": {
    "zh-CN": "还没有已保存的服务端密钥，可在设置中创建。",
    en: "No saved server key yet; create one in Settings.",
  },
  /* --- listen: advanced -------------------------------------------------- */
  "connections.listen.advanced": { "zh-CN": "高级选项", en: "Advanced" },
  "connections.listen.allow.label": { "zh-CN": "公钥白名单（--allow）", en: "Public key allow-list (--allow)" },
  "connections.listen.allow.placeholder": {
    "zh-CN": "每行或用逗号分隔一个 nodekey:… 公钥",
    en: "One nodekey:… public key per line or comma-separated",
  },
  "connections.listen.allow.hint": {
    "zh-CN":
      "留空表示允许任何持有该地址的对端连接。填写后只有列表中的公钥可以通过。`none` 会原样传给 CLI。",
    en: "Empty means anyone holding the address may connect. When filled, only the listed keys are accepted. `none` is passed to the CLI as-is.",
  },
  "connections.listen.fullAddress.label": {
    "zh-CN": "生成自包含长地址（--full-address）",
    en: "Embed DERP node info (--full-address)",
  },
  "connections.listen.fullAddress.hint": {
    "zh-CN":
      "地址内嵌 DERP 节点信息，对端不需要额外解析即可连接，代价是地址更长。",
    en: "Embeds DERP node metadata so peers can connect without extra resolution; the token gets longer.",
  },

  /* --- listen: submit & result ------------------------------------------ */
  "connections.listen.start": { "zh-CN": "启动监听服务", en: "Start listener" },
  "connections.listen.starting": { "zh-CN": "正在启动…", en: "Starting…" },
  "connections.listen.result.title": { "zh-CN": "监听已启动", en: "Listener running" },
  "connections.listen.result.address": { "zh-CN": "分享给对端", en: "Share with the peer" },
  "connections.listen.result.addressPending": {
    "zh-CN": "等待服务端输出地址令牌…",
    en: "Waiting for the server to print its address token…",
  },
  "connections.listen.result.copyShare": { "zh-CN": "复制分享文本", en: "Copy share text" },
  "connections.listen.psk.note": {
    "zh-CN":
      "兼容性提示：tailcat 0.7.0 生成的地址默认包含预共享密钥（PSK），与 ≤ v0.5.0 的客户端不互通；如需兼容旧客户端要在 CLI 侧加 --psk=false，代价是降低安全性。本应用不提供该开关。",
    en: "Compatibility: addresses generated by tailcat 0.7.0 include a pre-shared key (PSK) by default and do not interoperate with tailcat ≤ v0.5.0 clients. Supporting old clients requires --psk=false on the CLI side, which lowers security. This app exposes no such switch.",
  },
  "connections.listen.shareText": {
    "zh-CN":
      "Tailcat 服务地址：\n{address}\n\n对端可直接把该地址用于 tailcat ssh / cp / ls 等命令。",
    en: "Tailcat service address:\n{address}\n\nThe peer can use it directly with tailcat ssh / cp / ls.",
  },
  "connections.listen.stop": { "zh-CN": "停止监听", en: "Stop listener" },
  /* --- connect: address -------------------------------------------------- */
  "connections.connect.address.label": { "zh-CN": "对端地址", en: "Peer address" },
  "connections.connect.address.placeholder": {
    "zh-CN": "tc 开头的地址令牌，或带 tailcat TXT 记录的 DNS 名称",
    en: "A tc… token, or a DNS name with a tailcat TXT record",
  },
  "connections.connect.address.hint": {
    "zh-CN":
      "地址令牌是连接凭据，界面默认脱敏展示，复制时复制完整值，也不会写入日志。",
    en: "Tokens are credentials: masked in the UI, copied in full, and never written to logs.",
  },
  "connections.connect.address.verify": { "zh-CN": "校验地址", en: "Verify address" },
  "connections.connect.address.verified": {
    "zh-CN": "已通过 tailcat parse 校验",
    en: "Verified with tailcat parse",
  },
  "connections.connect.address.save": { "zh-CN": "保存到历史", en: "Save to history" },
  "connections.connect.address.saveHint": {
    "zh-CN":
      "历史记录由后端在启动连接任务时写入，这里只做校验与跳转。",
    en: "History is written by the backend when a connection task starts; this only verifies and jumps there.",
  },
  "connections.connect.address.saved": {
    "zh-CN": "地址已通过校验",
    en: "Address verified",
  },
  "connections.connect.address.savedDesc": {
    "zh-CN": "启动转发后，这条地址会自动出现在首页的历史记录里。",
    en: "Once you start a forward, this address shows up in the home history automatically.",
  },
  "connections.connect.parsed.title": { "zh-CN": "解析结果", en: "Parse result" },
  "connections.connect.parsed.key": { "zh-CN": "服务端公钥", en: "Server public key" },
  "connections.connect.parsed.region": { "zh-CN": "Region ID", en: "Region ID" },
  "connections.connect.parsed.selfContained": { "zh-CN": "自包含地址", en: "Self-contained" },
  "connections.connect.parsed.dns": { "zh-CN": "DNS 名称", en: "DNS name" },
  "connections.connect.parsed.token": { "zh-CN": "地址令牌", en: "Address token" },
  "connections.connect.parsed.yes": { "zh-CN": "是", en: "Yes" },
  "connections.connect.parsed.no": { "zh-CN": "否", en: "No" },

  /* --- connect: ping ----------------------------------------------------- */
  "connections.connect.ping": { "zh-CN": "路径探测", en: "Path probe" },
  "connections.connect.ping.notice": {
    "zh-CN":
      "路径探测调用 tailcat ping：成功时显示每跳 RTT 以及 DERP(...) 或直连路径，是有效的连通性证据；失败时按真实错误报告。",
    en: "The path probe runs tailcat ping: on success it shows each hop's RTT plus the DERP(...) or direct path as valid connectivity evidence; on failure it reports the real error.",
  },
  "connections.connect.ping.noResponse": {
    "zh-CN": "tailcat ping 未返回任何响应。",
    en: "tailcat ping returned no response.",
  },
  "connections.connect.ping.direct": { "zh-CN": "直连", en: "Direct" },
  "connections.connect.ping.derp": { "zh-CN": "DERP", en: "DERP" },
  "connections.connect.ping.path": { "zh-CN": "路径", en: "Path" },

  /* --- connect: forward -------------------------------------------------- */
  "connections.connect.forward.title": { "zh-CN": "发起连接", en: "Start a connection" },
  "connections.connect.forward.desc": {
    "zh-CN":
      "在本机开一个监听端口，把流量转发到对端 tailcat serve 暴露的端口。",
    en: "Open a local listener and forward it to a port exposed by the peer's tailcat serve.",
  },
  "connections.connect.forward.remotePort": { "zh-CN": "远端端口", en: "Remote port" },
  "connections.connect.forward.remotePortHint": {
    "zh-CN": "对端 tailcat serve 正在服务的端口（服务端不会监听 0 端口）。",
    en: "The port the peer's tailcat serve is serving (a server never listens on 0).",
  },
  "connections.connect.forward.localPort": { "zh-CN": "本地端口", en: "Local port" },
  "connections.connect.forward.localPortHint": {
    "zh-CN": "填 0 表示由系统自动分配一个空闲端口。",
    en: "Use 0 to let the OS assign a free port.",
  },
  "connections.connect.forward.bindHost": { "zh-CN": "监听地址", en: "Listen address" },
  "connections.connect.forward.bindHostHint": {
    "zh-CN": "默认 127.0.0.1，只有本机可以访问这个转发。",
    en: "Defaults to 127.0.0.1, so only this machine can reach the forward.",
  },
  "connections.connect.forward.risk.title": {
    "zh-CN": "非回环地址会把转发暴露到局域网",
    en: "A non-loopback address exposes the forward to your network",
  },
  "connections.connect.forward.risk.body": {
    "zh-CN":
      "监听 {host} 时，同一网络内的其他设备可以直接访问该端口，并且不会经过 tailcat 的地址校验。",
    en: "Binding {host} lets other devices on your network reach this port directly, bypassing tailcat's address check.",
  },
  "connections.connect.forward.risk.blocked": {
    "zh-CN":
      "非回环监听默认关闭。请点击「允许非回环监听」显式开启后再启动转发。",
    en: "Non-loopback binds are off by default. Use “Allow non-loopback bind” to opt in before starting.",
  },
  "connections.connect.forward.risk.allow": {
    "zh-CN": "允许非回环监听",
    en: "Allow non-loopback bind",
  },
  "connections.connect.forward.start": { "zh-CN": "启动转发", en: "Start forward" },
  "connections.connect.forward.result.title": { "zh-CN": "本地访问地址", en: "Local address" },
  "connections.connect.forward.result.pending": {
    "zh-CN": "等待后端分配本地端口…",
    en: "Waiting for the backend to assign a local port…",
  },
  "connections.connect.forward.result.copy": { "zh-CN": "复制", en: "Copy" },
  "connections.connect.forward.result.open": { "zh-CN": "在浏览器打开", en: "Open in browser" },
  "connections.connect.forward.result.openHint": {
    "zh-CN": "远端端口看起来像 {scheme} 服务，可在浏览器中打开。",
    en: "The remote port looks like a {scheme} service, so it can be opened in a browser.",
  },
  "connections.connect.forward.stop": { "zh-CN": "停止转发", en: "Stop forward" },
  "connections.connect.forward.latency": {
    "zh-CN":
      "本地转发按连接建立隧道：每个新连接都会新建一次隧道，首个数据包的延迟会略高于后续数据。",
    en: "Local forwards build a tunnel per connection, so the first packet of each connection is slower than the rest.",
  },

  /* --- connect: cross-links --------------------------------------------- */
  "connections.connect.next.title": { "zh-CN": "继续", en: "Next steps" },
  "connections.connect.next.transfer": { "zh-CN": "发送文件", en: "Send files" },
  "connections.connect.next.share": { "zh-CN": "共享目录", en: "Share a folder" },
  "connections.connect.next.hint": {
    "zh-CN": "已经验证过地址？可以直接跳到文件传输或目录共享。",
    en: "Already verified the address? Jump straight to file transfer or directory sharing.",
  },
});
