import { registerMessages } from "@/lib/i18n";

/** Copy for the home screen. Keys are namespaced with `home.`. */
registerMessages({
  "home.title": { "zh-CN": "首页", en: "Home" },
  "home.description": {
    "zh-CN": "查看引擎状态、活动任务与最近使用记录，快速开始一次连接。",
    en: "Check the engine, running tasks and recent connections, then start quickly.",
  },

  /* --- engine ------------------------------------------------------------ */
  "home.engine.title": { "zh-CN": "引擎状态", en: "Engine status" },
  "home.engine.redetect": { "zh-CN": "重新检测", en: "Re-detect" },
  "home.engine.found": { "zh-CN": "已找到 tailcat", en: "tailcat found" },
  "home.engine.version": { "zh-CN": "版本", en: "Version" },
  "home.engine.source": { "zh-CN": "来源", en: "Source" },
  "home.engine.path": { "zh-CN": "路径", en: "Path" },
  "home.engine.keysDir": { "zh-CN": "密钥目录", en: "Keys directory" },
  "home.engine.source.bundled": { "zh-CN": "内置二进制", en: "Bundled" },
  "home.engine.source.custom": { "zh-CN": "自定义路径", en: "Custom path" },
  "home.engine.source.path": { "zh-CN": "系统 PATH", en: "System PATH" },
  "home.engine.source.missing": { "zh-CN": "未检测到", en: "Not found" },
  "home.engine.missing.title": {
    "zh-CN": "未检测到 tailcat 引擎",
    en: "tailcat engine not found",
  },
  "home.engine.missing.body": {
    "zh-CN":
      "没有可用的 tailcat 二进制文件，创建监听、转发与共享都无法启动。",
    en: "No tailcat binary is available, so listeners, forwards and shares cannot start.",
  },
  "home.engine.missing.action": { "zh-CN": "前往设置", en: "Open settings" },

  /* --- quick actions ----------------------------------------------------- */
  "home.actions.title": { "zh-CN": "快捷操作", en: "Quick actions" },
  "home.actions.blocked": {
    "zh-CN": "以下操作都需要可用的 tailcat 引擎，请先在设置中配置。",
    en: "These actions all need a working tailcat engine. Configure it in Settings first.",
  },
  "home.actions.listen.title": { "zh-CN": "创建监听服务", en: "Create a listener" },
  "home.actions.listen.desc": {
    "zh-CN": "生成地址，把本机端口或服务暴露给对端",
    en: "Generate a token and expose a local port or service",
  },
  "home.actions.connect.title": { "zh-CN": "连接到对端", en: "Connect to a peer" },
  "home.actions.connect.desc": {
    "zh-CN": "校验对端地址、测试连通性并建立转发",
    en: "Verify a peer token, test reachability and open a forward",
  },
  "home.actions.forward.title": { "zh-CN": "端口转发", en: "Port forwarding" },
  "home.actions.forward.desc": {
    "zh-CN": "把远端端口映射到本机 127.0.0.1",
    en: "Map a remote port onto a local 127.0.0.1 listener",
  },
  "home.actions.transfer.title": { "zh-CN": "文件传输", en: "File transfer" },
  "home.actions.transfer.desc": {
    "zh-CN": "通过 tailcat 收发文件与目录",
    en: "Send and receive files over tailcat",
  },
  "home.actions.share.title": { "zh-CN": "目录共享", en: "Directory sharing" },
  "home.actions.share.desc": {
    "zh-CN": "共享目录，默认只读",
    en: "Share a directory, read-only by default",
  },

  /* --- running tasks ----------------------------------------------------- */
  "home.running.title": { "zh-CN": "活动任务", en: "Running tasks" },
  "home.running.empty.title": { "zh-CN": "暂无活动任务", en: "No running tasks" },
  "home.running.empty.desc": {
    "zh-CN": "创建监听服务或发起一次转发后，任务会出现在这里。",
    en: "Listeners and forwards you start will show up here.",
  },
  "home.running.stop": { "zh-CN": "停止", en: "Stop" },

  /* --- task kinds -------------------------------------------------------- */
  "home.kind.serve": { "zh-CN": "监听", en: "Listen" },
  "home.kind.forward": { "zh-CN": "转发", en: "Forward" },
  "home.kind.service": { "zh-CN": "服务", en: "Service" },
  "home.kind.recv": { "zh-CN": "接收", en: "Receive" },
  "home.kind.share": { "zh-CN": "共享", en: "Share" },
  "home.kind.send": { "zh-CN": "发送", en: "Send" },
  "home.kind.ssh": { "zh-CN": "SSH", en: "SSH" },

  /* --- history ----------------------------------------------------------- */
  "home.history.title": { "zh-CN": "最近使用记录", en: "Recent connections" },
  "home.history.empty.title": { "zh-CN": "还没有历史记录", en: "No history yet" },
  "home.history.empty.desc": {
    "zh-CN": "启动过监听或连接任务后，地址会自动记录在这里。",
    en: "Addresses are recorded here automatically after you start a task.",
  },
  "home.history.noNote": { "zh-CN": "未添加备注", en: "No note" },
  "home.history.lastUsed": { "zh-CN": "最近使用", en: "Last used" },
  "home.history.useCount": { "zh-CN": "使用 {count} 次", en: "Used {count} times" },
  "home.history.rename": { "zh-CN": "重命名备注", en: "Rename note" },
  "home.history.remove": { "zh-CN": "删除记录", en: "Delete entry" },
  "home.history.rename.title": { "zh-CN": "编辑备注", en: "Edit note" },
  "home.history.rename.desc": {
    "zh-CN": "备注只保存在本机，不会发送给对端。",
    en: "Notes stay on this machine and are never sent to the peer.",
  },
  "home.history.rename.label": { "zh-CN": "备注", en: "Note" },
  "home.history.rename.placeholder": {
    "zh-CN": "例如：家里的 NAS",
    en: "e.g. NAS at home",
  },
  "home.history.rename.hint": {
    "zh-CN": "留空表示清除备注。",
    en: "Leave empty to clear the note.",
  },
  "home.history.rename.failed": { "zh-CN": "保存备注失败", en: "Could not save note" },
  "home.history.remove.title": { "zh-CN": "删除这条记录？", en: "Delete this entry?" },
  "home.history.remove.desc": {
    "zh-CN": "只会删除本机的历史记录，不会影响对端或已运行的任务。",
    en: "Only the local history entry is removed; peers and running tasks are untouched.",
  },
  "home.history.remove.failed": { "zh-CN": "删除记录失败", en: "Could not delete entry" },
});
