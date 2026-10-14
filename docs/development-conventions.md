# 开发约定（所有贡献者与自动化代理必读）

本文件是代码实现的强制约定。任何页面实现都必须遵循这里的组件、Token、状态与
CLI 事实，不得自造颜色、自造 IPC 命令或自造 CLI 参数。

---

## 1. 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面壳 | Tauri 2（Rust） |
| 前端 | React 19 + TypeScript 5.9 + Vite 7 |
| 样式 | Tailwind CSS 4（CSS-first，`@theme inline`） |
| 组件 | 自建 shadcn 风格组件 + Radix Primitives |
| 图标 | Lucide |
| 状态 | Zustand |
| 测试 | Vitest + Testing Library |
| 包管理 | pnpm |

---

## 2. 设计 Token 规则

**唯一来源**：`src/styles/tokens.css` + `DESIGN.md`。

1. 组件中**禁止**出现裸色值（`#fff`、`rgb(...)`）。必须使用语义 Token。
2. 允许的 Tailwind 语义类（由 `@theme inline` 暴露）：
   - 背景：`bg-background` `bg-card` `bg-popover` `bg-secondary` `bg-accent`
     `bg-sidebar` `bg-surface-inset`
   - 文本：`text-foreground` `text-muted-foreground` `text-card-foreground`
     `text-popover-foreground`
   - 边框：`border-border` `border-border-strong` `border-input`
   - 状态：`text-success` `bg-success-soft` `text-warning` `bg-warning-soft`
     `text-danger` `bg-danger-soft` `text-info` `bg-info-soft`
   - 主按钮：`bg-primary text-primary-foreground`
3. 需要 Token 的**透明度**或**特殊取值**时，用 CSS 变量语法：
   `bg-[color:var(--surface-inset)]`、`text-[color:var(--ash)]`、
   `ring-[color:var(--danger-soft)]`。
4. 圆角只用 `rounded-xs|sm|md|lg|xl|full`（对应 Token）。
5. 深浅主题**必须同时正确**：不要在组件里写 `dark:` 分支，除非确实需要
   「深色下才出现的视觉差异」。主题通过 `<html data-theme="light|dark">` 切换。
6. 排版角色类（`src/styles/globals.css` 已定义）：
   `t-display` `t-title-lg` `t-title` `t-subtitle` `t-body` `t-caption`
   `t-overline` `t-mono`。正文默认 13px，控件默认高 32px。
7. 动效只允许使用已有类：`animate-fade-in` `animate-rise-in`
   `animate-pulse-ring` `animate-spin-slow`，以及 `data-stagger` 容器。
   不要引入新的关键帧或长时动画。

---

## 3. 组件库清单（`src/components/ui`）

实现页面时**优先复用**，缺失时才新增（新增的组件也放进该目录并保持同样的
Token 规则）。

| 组件 | 说明 |
| --- | --- |
| `Button` | `variant`: primary / secondary / subtle / ghost / danger / dangerGhost / link；`size`: sm / md / lg / icon / icon-sm；支持 `loading` |
| `Input` `Textarea` | 支持 `invalid` `mono` |
| `Label` `Field` | `Field` 负责 label + 控件 + hint/error 的垂直节奏 |
| `Badge` | `tone`: neutral / info / success / warning / danger / outline |
| `StatusDot` | 任务状态点，支持 `pulse` |
| `Panel` `PanelHeader` `PanelBody` `PanelFooter` `SectionTitle` | 卡片容器 |
| `Callout` | `tone`: info / warning / danger / risk / success，用于风险与提示 |
| `KeyValueList` `KeyValue` | 详情键值表 |
| `ErrorNote` | 渲染 `UserFacingError`，原始诊断默认折叠 |
| `EmptyState` | 空数据占位 |
| `Skeleton` | 加载占位 |
| `Dialog*` | `DialogHeader` `DialogBody` `DialogFooter` `DialogContent`(size sm/md/lg) |
| `Select*` `Switch` `Tabs*` `Tooltip` `DropdownMenu*` `ScrollArea` `Separator` | Radix 封装 |
| `AddressField` | **脱敏展示地址令牌**，一键查看/复制 |
| `CopyButton` | 复制 + 成功提示 |
| `LogView` | 任务日志控制台（可过滤、可暂停跟随） |
| `PageHeader` | 页面标题区 |
| `ScreenBody` `ScreenColumns` | 页面滚动容器与两栏布局 |
| `Toaster` | 全局通知（挂在 AppShell 中，无需页面自行渲染） |

页面布局骨架：

```tsx
<PageHeader title="…" description="…" actions={<>…</>} />
<ScreenBody>
  <Panel>…</Panel>
</ScreenBody>
```

---

## 4. 状态与 IPC

### 4.1 全局 Store（`src/store/app.ts`）

```ts
const engine      = useAppStore((s) => s.engine);       // EngineStatus | null
const engineBusy  = useAppStore((s) => s.engineBusy);
const settings    = useAppStore((s) => s.settings);     // Settings
const tasks       = useAppStore((s) => s.tasks);        // TaskInfo[]
const history     = useAppStore((s) => s.history);      // HistoryEntry[]
const logs        = useAppStore((s) => s.logs);         // Record<id, LogLine[]>
const system      = useAppStore((s) => s.system);       // SystemInfo | null

await startTask(request);       // TaskRequest -> TaskInfo | null
await stopTask(id);
await removeTask(id);
await stopAllTasks();
await loadLogs(id, reset?);
await updateSettings(patch);
await resetSettings();
await refreshEngine(path?);
await refreshHistory();
pushToast({ tone, title, description? });
failToast(title, error);        // 自动归一化错误
```

选择器：`selectRunningTasks`、`selectTasksByKind(...kinds)`、
`selectTask(id)`、`selectLogs(id)`。

### 4.2 命令门面（`src/lib/api.ts`）

页面**只**通过 `api.*` 访问后端，禁止直接 `invoke`。

可用命令：`systemInfo` `openUrl` `openPath` `revealPath` `quit`、
`engineStatus` `engineDetect` `engineSetPath` `engineSetDerpMap` `engineKeys`
`engineCreateKey` `engineDeleteKey` `engineRegions` `engineParse` `engineResolve`
`enginePing`、`engineDownloadInfo` `engineDownload`、`tasks` `task` `taskLogs`
`startTask` `stopTask` `removeTask`
`stopAllTasks`、`listLocalDir` `homeDir` `listRemote`、`settings`
`updateSettings` `resetSettings` `exportSettings` `importSettings`、`history`
`renameHistory` `removeHistory` `clearHistory`、以及 `onTaskUpdated`
`onTaskLog` `onTaskRemoved` `onEngineChanged` `onEngineDownload` `onSettingsChanged`。

类型定义全部在 `src/lib/types.ts`，**新增字段必须同时改 Rust 侧**
（`src-tauri/src/model.rs`）。

#### 引擎下载（`engineDownloadInfo` / `engineDownload`）的硬约束

这是应用自身**唯一**主动发起 HTTP 请求的能力，实现必须留在
`src-tauri/src/engine_download.rs` 内，并守住：

- 只允许 **https**，且主机名在 `OFFICIAL_HOSTS` 白名单内（`api.github.com` /
  `github.com` / 官方资产跳转域名）；**每一次重定向都要重新校验**。
- 必须与**同一 release** 的 `checksums.txt` 比对 SHA256，不匹配即失败
  （`ENGINE_CHECKSUM_MISMATCH`）；**不得**提供「跳过校验」的开关。
- 解压只走 `safe_relative_path()`：拒绝 `..`、绝对路径、盘符，丢弃符号链接与
  设备节点；整个包只安装 `tailcat` / `tailcat.exe` 一个文件。
- 临时文件 `<version>.part` 与解压目录 `.<version>.extract` 由 `Scratch` 的
  `Drop` 在**每条**退出路径上清理。
- 官方没有 darwin 产物：macOS 必须返回 `ENGINE_UNSUPPORTED_PLATFORM` 并提示
  `brew install tailcat`，不得伪装成「可以下载」。
- 进度事件只上报**真实**已写盘字节；服务端不给 `Content-Length` 时界面显示不确定态，
  **不得**编造百分比。
- 界面在 `src/features/engine/DownloadPanel.tsx`；进度临时订阅（先订阅再 `invoke`）
  放在面板里，不进全局 store。
- 新增测试放 `src-tauri/src/engine_download_tests.rs`：用 `tokio::net::TcpListener`
  在 `127.0.0.1` 上起假 Release 服务器，**不访问外网**——普通 `cargo test` 必须
  保持可离线运行。

### 4.3 表单校验（`src/lib/validation.ts`）

`validateAddress` `validateListenPort` `validateRemotePort`
`validateServeTarget` `parseServeTargets` `validateBindHost` `isLoopbackHost`
`validateRemotePath` `validateUrl` `validateKeyName`。所有用户输入在提交前
必须先本地校验，错误用 `Field` 的 `error` 展示。

### 4.4 工具函数

`src/lib/format.ts`：`formatBytes` `formatUptime` `formatDuration` `formatRtt`
`formatTimestamp` `formatClock` `truncateMiddle` `formatHostPort`。
**禁止伪造进度或速度**：底层没有数据时必须显示 `—` 或“不可用”。

`src/lib/i18n.ts`：在模块内调用 `registerMessages({ "feature.key": { "zh-CN": …, en: … } })`，
页面里用 `const t = useT()`。**每个功能模块自带文案**，不要集中改一个文件。

文件/目录选择器：

```ts
import { open } from "@tauri-apps/plugin-dialog";
const picked = await open({ directory: true, multiple: false });
```

---

## 5. tailcat CLI 事实（已在本机 v0.7.0 实测确认）

> 来源：`tailcat --help`、`tailcat readme`、`tailcat <cmd> --help`，以及 2026-10-14
> 在 macOS arm64 上的真实端到端运行（v0.7.0）。
> **不得假设未列出的参数。**
>
> ⚠️ v0.4.0 → v0.7.0 有破坏性变化（新增 `forward`/`browse` 子命令、`--psk`、
> `ssh`/`exec` 服务、`:wo+` 模式；`ping` 从不可用变为可用）。本文件与
> `docs/tailcat-cli.md` 记录的都是 **v0.7.0** 的行为，不要再引用 0.4.0 的结论。

二进制名 `tailcat`。地址令牌形如 `tc` + base64url(CBOR)，约 95 字节，**区分大小写**。
任何接受 `<addrblob>` 的地方都可以改用「TXT 记录 `tailcat=<blob>` 的 DNS 名称」。

### serve（服务端）
```
tailcat serve [flags] [<port|range|service> ...]
  --allow LIST                 逗号分隔的公钥白名单，或 'none'
  --full-address               输出内嵌 DERP 节点的长地址
  --files DIR[:ro|:rw|:wo|:wo+]  目录服务（隐含 files 服务，默认 :ro）
  --ssh-authorized-keys LIST   ssh 服务所需的公钥来源（文件路径 / 字面公钥 / alice@github）
  --psk BOOL                   地址中是否包含 WireGuard 预共享密钥（默认 true）
  --key NAME|new               使用已保存密钥 / 强制临时密钥
  --verbose
  --json                       向 stdout 输出 {"listenAddr": ...}（也是顶层 flag）
  --derpmap-url URL            自定义 DERP map（等价环境变量 TAILCAT_DERPMAP_URL）
```
- 端口会被代理到服务端**同一个** localhost 端口。
- 服务名：`all`、`exit-node`、`ssh`、`no-auth-ssh`、`files`、`exec`。
  - `ssh` 需要 `--ssh-authorized-keys`；`exec` 需要在 `--` 之后给出命令。
  - 本应用**不提供**这两个服务所需额外参数的输入入口，因此界面上只作说明、不给可选 chip。
- 无参数时接受一个连接并写入 stdout 后退出。
- 地址打印在 **stderr**（`--json` 时 stdout 输出 JSON）。
- 环境变量 `TAILCAT_ADDR_FILE` 可把地址写入文件或 `tcp:host:port`。
- 标志必须写在端口参数**之前**。

### forward（本地端口转发，v0.7.0 新增）
```
tailcat forward [--bind=ADDR] [--open-browser] <tc-addr> \
                <[local:]remote-port|local-port:remote-ip:remote-port> [...]
```
- `--bind` 默认 `127.0.0.1`，用于「映射只写端口」的情形。
- 本地端口写 `0` → 由系统分配；**每个 listener 就绪后在 stderr 打印**
  `# forwarding 127.0.0.1:54348 -> remote localhost:18080`（stdout 为空）。
- 映射必须写成 `local:remote`；单端口写法 `tailcat forward <blob> 0` 会被拒绝：
  `mapping "0" is invalid: local port: invalid port "0"`。
- 多个映射可以写在同一条命令里，一个进程持有全部 listener。

### browse（v0.7.0 新增）
`tailcat browse <tc-addr>` 等价于 `tailcat forward --open-browser <tc-addr> 0:80`。

### recv（收文件）
`tailcat recv [dir]` 等价于 `tailcat serve --files=<dir>:wo files`（只写投递箱）。
`--accept-dirs` 可接收目录树（代价：发送端能探测目录/文件名是否存在）。

### cp（发/取文件）
```
tailcat cp [-r] [-p] [-P PORT] <source>... <target>
```
远端写成 `<addrblob>:[path]`。实际由**系统 scp** 执行，因此进度来自 scp 的 stderr。

### ls（列远端文件）
`tailcat ls [-l] <addrblob>[:path]`，直接说 SFTP，不需要 ssh/sftp 二进制。

### socks（SOCKS5 代理）
```
tailcat socks [--listen=[addr]:port] [<addrblob>] [<cmd> [args...]]
```
- 无 `<cmd>` 时独立运行并在 stdout 打印代理地址。
- 目的主机名若本身是地址令牌 → 直连该服务端；魔法主机名 `server.tailcat`
  → 使用命令行给出的 `<addrblob>`；其他主机名 → 需要服务端是 exit-node。
- `--listen`：裸端口=localhost，裸地址=系统分配端口，空主机 `:1080`=所有网卡。
- **本应用不使用这个子命令**：本地转发统一走官方 `forward`。后端对 `socks`
  任务一律返回 `UNSUPPORTED`，界面上也没有 SOCKS 入口。

### ping
`tailcat ping [--until-direct] [--timeout=10s] <addrblob>`，每行 pong 形如
`pong in 42.1ms via DERP(sfo)` 或 `pong in 1.2ms via 203.0.113.7:41641`。
- v0.7.0 实测可用（`pong in 150.69ms via DERP(tok)`，退出码 0）。**它是有效的
  连通性与路径探测手段**，成功就展示 RTT 与 DERP/直连路径，失败按真实错误呈现，
  不再降级为「仅供参考」的中性提示。

### ssh
`tailcat ssh [-p PORT] [user@]<addrblob> [command ...]`，exec 系统 ssh。

### genkey / parse / resolve / printpub / version / readme
```
tailcat genkey --key=NAME [--client] [--force] [--list] [--delete]
               [--region=auto|list|ID|code|substring|host,host]
               [--fixed-region] [--embed-derp-map] [--psk BOOL]
tailcat parse <addrblob>      # 输出 JSON
tailcat resolve <addrblob>    # 输出自包含长令牌
tailcat printpub
tailcat version
tailcat readme
```
密钥目录：`$CONFIG/tailcat/keys`（macOS 为
`~/Library/Application Support/tailcat/keys`）。
`default`（服务端）与 `client-default`（客户端）是魔法名。

### 关键推论（实现必须遵守）
- 本地转发**必须使用官方 `tailcat forward` 子命令**（v0.7.0 起原生支持）。
  后端生成
  `tailcat [--derpmap-url=…] [--key=…] forward --bind=<host> <addr> <local>:<remote>`，
  由 CLI 自己持有 listener；动态端口从 stderr 的 `# forwarding <host>:<port> -> …`
  解析后写入 `TaskInfo.listenAddr`。**不要再实现自制的监听/桥接层**，
  也不要再声称「首包延迟高于常驻代理」。
- 服务端映射（把远端 localhost 端口暴露出来）只能通过 `tailcat serve <port>`。
- 目录共享 = `tailcat serve --files=<dir>:<mode> files`；只读是默认值。
- 地址合法性由 `tailcat parse` 判定，前端只做格式预校验。
- 0.7.0 生成的地址**默认包含 PSK**（`--psk` 默认 true），与 ≤ v0.5.0 的客户端
  **不互通**；界面上必须如实提示，不要把它说成「向后兼容」。

### 实测行为记录（v0.7.0，2026-10-14，macOS arm64）
| 场景 | 结果 |
| --- | --- |
| `tailcat serve --json 18080` | stdout 输出单行 `{"listenAddr":"tc..."}`，进程常驻 |
| `tailcat serve 18080` | stderr 输出 `# 🐈 Server listening with new address: tc...` |
| `TAILCAT_ADDR_FILE=<path>` | 地址被写入该文件（与 stderr 输出并存） |
| `tailcat parse <blob>` | 输出 `{"ServerPublic","ServerDiscoPublic","PresharedKey","RegionID"}` JSON |
| `tailcat genkey --list`（无密钥） | 无输出，退出码 0 |
| `tailcat genkey --region=list` | 每行 `  301 nyc New York City` 形式 |
| `tailcat forward <blob> 0:18080` | ✅ stderr 打印 `# forwarding 127.0.0.1:<port> -> remote localhost:18080`，`curl` 真实取回内容 |
| `tailcat forward <blob> 0` | ❌ `mapping "0" is invalid: local port: invalid port "0"` |
| `tailcat ping --timeout=8s <blob>` | ✅ `pong in 150.69ms via DERP(tok)`，退出码 0 |
| 服务端密钥 JSON | `Public` 含 `ServerPublic`/`ServerDiscoPublic`/`PresharedKey`/`RegionID` |
| 客户端身份密钥 JSON | `Public` 含 `ServerPublic`/`ServerDiscoPublic`/`PresharedKey`，**无 `RegionID`** |

> 区分服务端/客户端密钥仍然靠 `Public.RegionID` 是否存在。
> `parse` 新增的 `PresharedKey` 等未知字段一律安全忽略。

---

## 6. 安全与诚实性约束（硬性）

1. 地址令牌是连接凭据：默认脱敏（`settings.redactAddresses`），复制时复制完整值，
   且**不得写入日志**。
2. 命令行必须以**参数数组**执行，禁止拼接 shell 字符串。
3. 远端路径必须拒绝绝对路径与 `..`（`validateRemotePath`）。
4. 本地监听默认 `127.0.0.1`；改为其他地址必须由用户主动开启并给出
   `Callout tone="risk"` 风险提示。
5. 读写共享必须显式提示风险（`:rw`）。
6. **不得伪造**连接状态、传输进度、速度或测试结果；无数据时显示 `—`。
7. 不允许出现「已支持」但实际未实现的按钮；未实现的能力要么隐藏，要么禁用并
   说明原因。
8. **引擎下载不得伪造验证结论**：只有 SHA256 校验通过才会解压安装；官方没有当前
   平台的产物时如实说明（macOS 指向 Homebrew），不把「下载不可用」显示成可点按钮。
   「下载是否可用」依据后端 `engine_download_info` 的 `supported` 字段，前端不猜测。

---

## 7. 代码风格

- TypeScript `strict`，开启 `verbatimModuleSyntax`，类型导入必须写 `import type`。
- 组件文件用 `PascalCase.tsx`，工具模块用 `camelCase.ts`。
- 路径别名 `@/` → `src/`。
- 注释只解释「为什么」，不复述代码。
- 每个功能模块自带 `messages.ts`（文案）与 `__tests__/`（测试）。
