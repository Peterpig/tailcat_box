# 架构说明

本文描述 Tailcat Box 的分层架构、任务生命周期、进程与日志处理、事件通道、
配置存储位置与安全边界。

> **准确性声明**：本文只描述**当前仓库中真实存在的代码**。前端（`src/**`）与
> Rust 后端（`src-tauri/src/**`）均已入库：命令面、任务注册表、CLI 适配层、
> 配置持久化、引擎探测与引擎下载模块都已实现，`cargo fmt` / `cargo clippy -D warnings` /
> `cargo check --all-targets` / `cargo test`（56 passed）均已通过。未实现的
> 能力一律不写成已实现，未验证项与差异汇总见
> [`limitations.md`](limitations.md)。

---

## 1. 分层架构

整体分为五层，与 `AGENT.md`「五、架构要求」一致。

```text
┌──────────────────────────────────────────────────────────────┐
│ UI 层            src/App.tsx, src/features/**, components/** │
│                  页面、组件、状态展示、用户交互              │
├──────────────────────────────────────────────────────────────┤
│ 应用服务层       src/store/app.ts（Zustand）                 │
│                  任务编排、设置、历史、通知                  │
├──────────────────────────────────────────────────────────────┤
│ IPC 契约 + 命令门面                                          │
│                  src/lib/types.ts（唯一真源）                │
│                  src/lib/api.ts（门面） src/lib/ipc.ts（传输）│
├──────────────────────────────────────────────────────────────┤
│ tailcat 适配层   src-tauri/src/{tailcat,task,engine,error}   │
│                  参数数组拼装、子进程生命周期、stdout/stderr │
│                  解析、退出码到 UserFacingError 的映射       │
├──────────────────────────────────────────────────────────────┤
│ 配置层 / 系统集成层   src-tauri/src/{config,system}.rs       │
│                  设置持久化、历史记录、文件选择、剪贴板、    │
│                  打开浏览器、平台逻辑                        │
└──────────────────────────────────────────────────────────────┘
```

### 1.1 UI 层

**已实现**。

- 入口：`src/main.tsx` 挂载 `src/App.tsx`；六个页面通过 `React.lazy` 懒加载，
  加载期间显示 `Skeleton` 骨架屏。
- 路由：`src/app/routes.ts` 定义 `Route` 联合类型与 `ROUTES` 数组（home /
  connections / forwards / transfer / share / settings），每项带 Lucide 图标、
  i18n 文案 key、`Cmd/Ctrl + N` 快捷键与分组（main / system）。
- 外壳：`src/components/layout/app-shell.tsx` 组合侧边栏、预览横幅、内容区与
  全局 `Toaster`，并注册键盘快捷键监听。
- 组件库：`src/components/ui/` 下 25 个基础组件（Button、Input、Field、Badge、
  StatusDot、Panel、Callout、KeyValueList、ErrorNote、EmptyState、Skeleton、
  Dialog、Select、Switch、Tabs、Tooltip、DropdownMenu、ScrollArea、Separator、
  AddressField、CopyButton、LogView、PageHeader、Toaster 等）。
- 样式：设计 Token 在 `src/styles/tokens.css`，通过 `src/styles/globals.css` 的
  `@theme inline` 暴露为 Tailwind 语义类；主题由 `<html data-theme="light|dark">`
  驱动。

六个页面本体已实现（`src/features/*/…Screen.tsx`），并按约定拆分为子组件与
模块级文案：

| 页面 | 主要组件 |
| --- | --- |
| 首页 | `HomeScreen`（引擎状态、活动任务、最近记录、快捷操作） |
| 连接 | `ConnectionsScreen`（创建监听、地址解析、ping 探测、连接历史） |
| 端口转发 | `ForwardsScreen` + `ForwardForm` / `ServiceForm` / `TaskList` / `TaskDetail` / `ServiceAddress` |
| 文件传输 | `TransferScreen` + `RecvPanel` / `SendPanel` / `BrowsePanel` / `progress.ts` / `picker.ts` |
| 文件共享 | `ShareScreen`（目录选择、只读/读写/只写模式与风险提示） |
| 设置 | `SettingsScreen` + `AppearanceSection` / `StartupSection` / `LogsSection` / `DataSection` / `AboutSection`（引擎面板 `EnginePanel` 与 `KeyManager` 来自 `src/features/engine/`） |

页面统一通过 `api.*` 与 store 交互，不直接 `invoke`，也不拼接 CLI 命令。

### 1.2 应用服务层

**已实现（前端侧）**：`src/store/app.ts`，基于 Zustand 的单一 store。

职责：

- 启动流程 `bootstrap()`：先按本地存储应用主题（避免首屏闪烁），再并行拉取
  `system_info` 与 `settings_get`，随后并行拉取引擎状态、任务列表与历史记录；
  任一失败都会归一化为 toast，而不是让界面崩溃。
- 任务编排：`startTask` / `stopTask` / `removeTask` / `stopAllTasks`，以及
  日志增量拉取 `loadLogs(id, reset?)`（用 `logSeq[id]` 记录游标）。
- 设置：`updateSettings(patch)` 采用**乐观更新 + 失败回滚**；`resetSettings()`。
- 通知：`pushToast` / `dismissToast` / `failToast`（自动归一化错误）。
- 选择器：`selectRunningTasks`、`selectTasksByKind(...)`、`selectTask(id)`、
  `selectLogs(id)`。

约束：页面只能通过 `src/lib/api.ts` 访问后端，禁止直接 `invoke`；也不允许在
页面里拼接 CLI 命令。

### 1.3 IPC 契约与命令门面

**已实现**。

- `src/lib/types.ts` 是跨语言契约的**唯一真源**，定义了 `ErrorCode`、
  `UserFacingError`、`EngineStatus`、`TaskInfo`、`LogLine`、各类 `*Request`、
  `Settings`、`HistoryEntry`、`SystemInfo` 与 `EVENTS`。Rust 侧需在
  `src-tauri/src/model.rs` 中镜像这些结构，两侧必须同一次提交一起修改。
- `src/lib/api.ts` 把每个 Tauri 命令包装成类型化方法，并把任何异常交给
  `normalizeError` 归一化，保证 UI 只会看到 `UserFacingError`。
- `src/lib/ipc.ts` 是传输层：在 Tauri 外壳内调用 `@tauri-apps/api` 的
  `invoke` / `listen`；在浏览器预览中（且仅在 `import.meta.env.DEV` 下）回退到
  `src/lib/preview-backend.ts` 的内存后端。

### 1.4 tailcat 适配层（Rust，已落地）

`src-tauri/src/` 当前包含以下文件与目录：

| 文件 / 目录 | 内容 |
| --- | --- |
| `lib.rs` | 应用入口：初始化 `ConfigStore` 与 `TaskRegistry`，注册 Tauri 插件与全部命令，处理窗口关闭事件（存在运行中任务且 `confirmOnQuit` 时发出 `quit-requested`，否则回收子进程），并在 `RunEvent::Exit` 时调用 `registry.shutdown()` |
| `main.rs` | 调用 `tailcat_box_lib::run()`；release 构建在 Windows 上抑制多余控制台窗口 |
| `commands.rs` | Tauri 命令面，与 `src/lib/api.ts` 一一对应：系统 / 引擎 / 任务 / 文件系统 / 设置 / 历史 |
| `config.rs` | `ConfigStore`：配置目录解析、`Settings` 与历史记录的读写、导入导出 |
| `engine.rs` | 引擎二进制定位：`bundled`（随包）/ `path`（`PATH`）/ `custom`（设置指定）/ `missing` |
| `engine_download.rs` | 官方引擎下载：只允许 https + 官方 GitHub 域名（每一跳重定向复检）、从同一 release 取 `checksums.txt`、边下边算 SHA256、校验通过后解压安装到 `<app 数据目录>/engine/<version>/`，全程不经 shell；macOS 无官方产物，直接返回「不支持」 |
| `engine_download_tests.rs` | 引擎下载的**离线**集成测试：在本机回环地址上起假 Release 服务器，跑完「下载 → 校验 → 解压 → 安装」，并断言校验和失败与路径穿越被拒 |
| `system.rs` | `system_info` 所需的平台信息，以及打开 URL / 路径 / 文件管理器 |
| `error.rs` | `AppError`（`code`/`message`/`hint`/`detail`，camelCase 序列化）、与 `src/lib/types.ts` 的 `ERROR_CODES` 一一对应的 `code` 常量、`From<io::Error>` / `From<serde_json::Error>` / `From<tauri::Error>` 转换，以及 `classify_stderr()` —— 把 tailcat 的 stderr 文本归类为面向用户的错误码 |
| `model.rs` | 与 `src/lib/types.ts` 一一对应的 serde 模型：`EngineSource` / `EngineStatus` / `SavedKey` / `KeyCreateRequest` / `KeyCreateResult` / `ParsedAddress` / `PingPong` / `PingResult` / `TaskKind` / `TaskStatus` / `FilesMode` / `TaskInfo` / `LogStream` / `LogLevel` / `LogLine` / `TaskLogPage` / `TaskEvent` / `LogEvent` / `RemovedEvent` / `TaskRequest`（按 `kind` 内部标签的枚举），以及 `EVENT_*` 事件名常量 |
| `tailcat/` | CLI 适配层：`spec.rs`（参数数组拼装，含 `forward_spec()`）、`parse.rs`（stdout/stderr 解析，含 `parse_forward_line()`）、`mod.rs`（进程执行、超时与输出采集） |
| `task/` | 任务注册表：`mod.rs`（生命周期、日志缓冲、事件推送、从 stderr 回填 `forward` 的监听地址）、`redact.rs`（凭据脱敏） |
| `e2e.rs` / `cleanup.rs` | 真实端到端集成测试（默认自跳过，`TAILCAT_E2E=1` 才运行）：转发 / 投递箱接收 / 只读共享取回，以及停止任务后的子进程回收与端口释放 |

适配层负责的职责（均已实现）：

1. 以**参数数组**拼装 `tailcat` 调用（绝不经过 shell 字符串）。
2. 解析引擎位置与版本（`tailcat version`）、密钥（`tailcat genkey --list`）。
3. 启动/停止长驻子进程，记录 PID、启动时间与参数摘要。
4. 分流 stdout / stderr，按行产出 `LogLine`。
5. 把退出码、信号与 stderr 文本映射为 `UserFacingError.code`。
6. 本地端口转发委托给 CLI 的 `forward` 子命令，并从其 stderr 解析动态分配的
   本地端口回填 `TaskInfo.listenAddr`（见
   [`tailcat-cli.md`](tailcat-cli.md) §5）。
7. 引擎下载 / 安装（`engine_download.rs`）：这是本应用**唯一**主动发起 HTTP
   请求的地方，命令为 `engine_download_info` / `engine_download`，进度经
   `tailcat://engine-download` 推送（见 §4 与 §6.2 第 10 条）。

工程与配置骨架同样就位：`Cargo.toml`（Tauri 2 + tokio + uuid + regex + chrono，
以及引擎下载用的 reqwest/rustls + sha2 + flate2 + tar + zip + futures-util）、
`build.rs`（`tauri_build::build()`）、`tauri.conf.json`（窗口、CSP、bundle 与随包
资源）、`capabilities/default.json`（最小化权限声明）、`icons/`（应用图标）。

**验证状态**：`cargo fmt --all -- --check` 与
`cargo clippy --all-targets --all-features -- -D warnings` 均通过，
`cargo check --all-targets` 为 0 error / 0 warning，`cargo test`
**56 passed / 0 failed**；其中 4 个真实端到端测试（`TAILCAT_E2E=1`）已在单机
执行通过，17 个引擎下载测试离线运行，但**真实双机**端到端验收尚未执行
（见 [`limitations.md`](limitations.md)）。

调用面与解析规则见 [`tailcat-cli.md`](tailcat-cli.md)，能力覆盖见
[`capability-matrix.md`](capability-matrix.md)。

### 1.5 配置层与系统集成层（Rust，已落地）

已实现：

- 配置持久化：`ConfigStore`（`config.rs`）负责 `Settings` 的读写、导入导出、
  恢复默认；配置文件路径由 `ConfigStore::app_dir()` 决定。
- 历史记录：`HistoryEntry` 的增删改查与条数上限（`historyLimit`）。
- 系统集成：`system_info`、`system_open_url`、`system_open_path`、
  `system_reveal`、`app_quit`；文件/目录选择使用 Tauri 的
  `@tauri-apps/plugin-dialog`，剪贴板使用 `plugin-clipboard-manager`
  （均已在 `Cargo.toml` 与 `capabilities/default.json` 中声明）。

> 前端在 `bootstrap()` 中直接依赖 `system_info` 与 `settings_get`；在预览后端下
> 这两者返回标注为「预览模式」的假值，且 `SystemInfo.native=false`，用于点亮
> 预览横幅。

---

## 2. 任务生命周期

任务的权威数据结构是 `TaskInfo`（`src/lib/types.ts`）。每个任务必须携带：

| 字段 | 含义 |
| --- | --- |
| `id` | 唯一 ID（前端乐观条目使用 `newId()`，权威 ID 由后端分配） |
| `kind` | `serve` / `forward` / `service` / `recv` / `share` / `send` / `socks` / `ssh`（`forward` 与 `service` 委托给 CLI 的 `forward` 子命令，`socks` 返回 `UNSUPPORTED`，见 §2.1） |
| `status` | `starting` → `running` → `stopping` → `stopped`，异常路径为 `failed` |
| `label` | 面向用户的标签，如「端口转发 127.0.0.1:3306」 |
| `pid` | 进程号；进程退出后为 `null` |
| `createdAt` / `startedAt` / `endedAt` | 创建、真正启动、结束的 ISO 时间戳 |
| `argsSummary` | 实际执行的 argv 摘要，**凭据类参数已脱敏** |
| `address` | 该任务持有的连接令牌（敏感，默认隐藏） |
| `listenAddr` | 本地监听地址，如 `127.0.0.1:8080` |
| `detail` | 与 kind 相关的附加事实（字符串/数字/布尔/null） |
| `exitCode` / `exitSignal` | **退出原因**：正常退出码或终止信号 |
| `error` | 归一化后的 `UserFacingError`，仅失败时非空 |

状态机：

```text
        start            spawn ok
  ──▶ starting ─────────────────▶ running ──┐
         │                          │       │ stop()
         │ spawn 失败                │ 进程自行退出
         ▼                          ▼       ▼
      failed                    stopped ◀ stopping
         ▲                          │
         └──── 非 0 退出码/信号 ─────┘
```

约定：

- 长驻任务（监听、转发、共享、SOCKS）由**后端**持有，不依赖前端页面是否打开；
  关闭窗口时必须显式处理仍在运行的任务（`settings.confirmOnQuit`，默认开启），
  不允许静默留下无法控制的后台进程。
- 端口 `0` 表示由操作系统分配；任务进入 `running` 后必须回填真实监听端口到
  `listenAddr`，界面只显示这个真实值。
- 前端侧 `sortTasks()` 按 `createdAt` 倒序展示，最新的任务在最上方。

当前实现程度：前端（任务列表、状态展示、乐观更新与页面交互）与 Rust 侧的
`TaskRegistry`（`src-tauri/src/task/mod.rs`）均已实现——后端负责分配 ID、
创建/回收子进程、记录 PID 与退出原因，并通过 `tailcat://task-updated` 事件
推送变化。子进程回收与端口释放已有 `cleanup.rs` 的测试覆盖（离线 shim + 真实
tailcat 两种），但**真实双机**端到端验收尚未执行（见 [`limitations.md`](limitations.md)）。

### 2.1 本地端口转发（`forward` / `service`）的进程模型

**v0.7.0 起，监听由 tailcat CLI 自己持有**。这两个任务不再自行绑定端口，也不再
为每个连接派生 `tailcat <blob> <port>` 子进程；`TaskRequest::Forward` 与
`TaskRequest::Service` 都通过 `spec::forward_spec()`
（`src-tauri/src/tailcat/spec.rs`）生成：

```text
tailcat [--derpmap-url=<url>] [--key=<name>] forward --bind=<host> <addr> <localPort>:<remotePort>
```

```text
  UI 请求 forward(localPort, bindHost, remotePort, address)
        │
        ▼
  spec::forward_spec(...) → argv: forward --bind=<host> <addr> <local>:<remote>
        │
        ▼
  CLI 自己监听 <host>:<localPort>（localPort=0 → 系统分配）
        │  stderr: "# forwarding <host>:<port> -> remote <host>:<port>"
        ▼
  parse_forward_line() 解析真实端口 → 写入 TaskInfo.listenAddr
```

要点：

- **动态端口**：`localPort=0` 时，真实端口由 CLI 写到 stderr，由
  `src-tauri/src/tailcat/parse.rs` 的 `parse_forward_line()` 解析后回填
  `TaskInfo.listenAddr`。
- **映射必须写成 `local:remote`**：单端口写法（`tailcat forward <addr> 0`）会被
  CLI 拒绝，因此适配层始终生成 `local:remote`。
- 监听与隧道由 CLI 常驻持有，因此**不再有「每条连接重新建隧道」的开销**。
- 任务本身由后端持有，界面关闭不影响已建立的监听；应用退出时统一回收子进程。

---

## 3. 进程与日志处理

### 3.1 流的分流

`LogLine.stream` 只有三种取值：

| `stream` | 来源 | 展示方式 |
| --- | --- | --- |
| `stdout` | 子进程标准输出（如 `serve --json` 的 `{"listenAddr": …}`） | 普通日志 |
| `stderr` | 子进程标准错误（tailcat 把地址行、进度、诊断都写这里） | 以 `!` 前缀 + 警告色区分 |
| `app` | 本应用自身的说明性记录 | 以 `·` 前缀 |

`LogLevel` 为 `debug` / `info` / `warn` / `error`。`LogLine` 的 `text` 在进入
前端之前**已经由后端完成凭据脱敏**，界面不做二次清洗。

日志以 `seq` 单调递增编号，`TaskLogPage.nextSeq` 必须原样回传给
`task_logs` 的 `sinceSeq`，实现增量拉取；前端还会用
`settings.maxLogLines`（默认 2000）截断内存中的日志长度。

### 3.2 面向用户的错误 vs 诊断信息

后端不允许把进程输出直接倾倒给用户，必须区分：

- **面向用户的错误**：`UserFacingError` 的 `message`（一句可直接展示的说明）与
  `hint`（可执行的下一步，如「换一个端口」）。
- **诊断信息**：`UserFacingError.detail`，保存原始输出；界面**默认折叠**，由
  `ErrorNote` 组件提供「展开」与「复制」按钮。

Rust 侧的归类逻辑已经落地在 `src-tauri/src/error.rs`：

- `From<std::io::Error>`：`PermissionDenied → PERMISSION_DENIED`、
  `NotFound → PATH_NOT_FOUND`、`AddrInUse → PORT_IN_USE`，其余 `IO_ERROR`。
- `classify_stderr()`：按 stderr 文本匹配 `address in use` → `PORT_IN_USE`、
  `permission denied` → `PERMISSION_DENIED`、`no space left` → `DISK_FULL`、
  `context deadline exceeded` / `timeout` → `DERP_UNREACHABLE`、
  `is neither a` / `invalid` → `ADDRESS_INVALID`、
  `no such file` / `cannot find` → `PATH_NOT_FOUND`，兜底 `PROCESS_FAILED`。
- `AppError::with_detail()` 只在 detail 非空白时保留原始输出，避免把空字符串
  当成诊断信息塞给界面。

前端的 `src/lib/errors.ts` 负责另一半：把后端返回的 JSON、字符串或原生 `Error`
归一化成 `UserFacingError`；只有 `code` 落在已知 `ErrorCode` 集合内、且
`message` 为字符串时才会被采信，否则降级为 `INTERNAL`。

### 3.3 界面呈现

`src/components/ui/log-view.tsx` 提供任务日志控制台：可按关键字过滤、可暂停
自动滚动（用户阅读历史时不会被打断）、可一键滚到底部。`src/lib/format.ts`
中的 `formatBytes` / `formatUptime` / `formatDuration` / `formatRtt` /
`formatTimestamp` / `formatClock` 在缺少数据时返回 `—`，**绝不伪造 0 或进度**。

---

## 4. 事件通道

事件名集中在 `src/lib/types.ts` 的 `EVENTS` 常量中：

| 事件 | 载荷 | 用途 |
| --- | --- | --- |
| `tailcat://task-updated` | `{ task: TaskInfo }` | 任务创建/状态变化/结束 |
| `tailcat://task-log` | `{ id, line: LogLine }` | 单行日志推送 |
| `tailcat://task-removed` | `{ id }` | 任务被移除，前端清理日志 |
| `tailcat://engine-changed` | `EngineStatus` | 引擎路径/版本/DERP 变化 |
| `tailcat://engine-download` | `EngineDownloadProgress` | 引擎下载进度：`phase`（checking / downloading / verifying / extracting / installing / done / error）、**真实**已写盘字节数 `downloaded`、可选的 `total` |
| `tailcat://settings-changed` | `Settings` | 设置被后端改写 |
| `tailcat://quit-requested` | 无 | 后端请求前端确认退出 |

订阅入口是 `src/lib/api.ts` 的 `onTaskUpdated` / `onTaskLog` / `onTaskRemoved` /
`onEngineChanged` / `onSettingsChanged` / `onQuitRequested`，统一由
`src/store/app.ts` 的 `wireBackendEvents()` 挂载（在 `App.tsx` 的 `useEffect`
中注册，卸载时释放）。事件到达后，store 会同步更新任务列表、日志缓冲、
引擎状态与设置，并对设置变化重新应用主题与语言。

例外：`tailcat://engine-download` 不进 `wireBackendEvents()`，而是由
`src/features/engine/DownloadPanel.tsx` 在下载开始时用 `api.onEngineDownload`
**临时订阅**（先订阅再 `invoke`，避免漏掉进度事件），下载结束即退订——进度是
瞬时的，没必要跨页面保留。

**注意**：`quit-requested` 通道已在契约、`api` 与 Rust 侧接通：Rust 在「存在
运行中任务且 `settings.confirmOnQuit` 为真」时发出该事件，`src/store/app.ts`
的 `wireBackendEvents()` 已订阅它并弹出退出确认对话框。Rust 侧的
`TaskRegistry::shutdown()` 子进程回收已由 `cleanup.rs` 的测试覆盖，但**这条
界面路径**（事件 → 对话框 → 退出）**尚未在真实 GUI 运行中验证**
（见 [`limitations.md`](limitations.md)）。

---

## 5. 配置存储位置

### 5.1 应用自身配置

配置形状由 `Settings`（`src/lib/types.ts`）定义，`DEFAULT_SETTINGS` 给出默认值：

```ts
{ version: 1, theme: "system", language: "zh-CN", tailcatPath: null,
  preferBundled: true, derpMapUrl: null, startScreen: "home", logLevel: "info",
  logDir: null, redactAddresses: true, confirmOnQuit: true,
  allowNonLoopbackBind: false, maxLogLines: 2000, historyLimit: 50 }
```

配置文件的**实际落盘位置由 Rust 侧决定**：`ConfigStore`（`src-tauri/src/config.rs`）
通过 `dirs` 解析平台配置目录，并由 `app_dir()` / `log_dir()` 给出设置、历史与
日志路径；这些路径经 `SystemInfo.configDir` / `SystemInfo.logDir` 上报给界面
（设置页展示这两个路径）。

前端目前**唯一**持久化的两处状态（均在浏览器 `localStorage`，与后端无关）：

| key | 内容 | 写入点 |
| --- | --- | --- |
| `tailcat-box.theme` | 主题模式 `light` / `dark` / `system` | `src/lib/theme.ts` |
| `tailcat-box.last-route` | 上次所在页面 | `src/App.tsx`（仅在 `startScreen === "last"` 时读取） |

### 5.2 tailcat 自身的密钥目录

密钥**不属于**本应用的配置，而是 tailcat CLI 的：

- 目录：`$CONFIG/tailcat/keys`
- macOS 实测路径：`~/Library/Application Support/tailcat/keys/<name>.private.json`
- 魔法名：`default`（服务端，服务端模式自动加载）与 `client-default`（客户端）。

`EngineStatus.keysDir` 与 `EngineStatus.savedKeys` / `hasDefaultKey` /
`hasClientKey` 就是这份信息的只读视图（数据来源 `tailcat genkey --list`）。

---

## 6. 安全边界

### 6.1 信任边界

```text
用户输入 ──▶ 前端校验（UX 快路径）──▶ IPC ──▶ 后端校验（权威）──▶ argv 数组 ──▶ tailcat
                     │                              │
                     └── 地址合法性最终由 tailcat parse 判定 ──┘
```

- 前端校验（`src/lib/validation.ts`）只是**体验优化**，后端必须重新校验。
- 地址令牌的权威判定是 `tailcat parse`：只有它能确认一个字符串是不是合法令牌。

### 6.2 具体边界

1. **命令执行**：一律使用参数数组，禁止 shell 字符串拼接；用户输入不得成为
   shell 元字符的一部分。
2. **地址令牌**：视为连接凭据。默认脱敏展示（`AddressField` 只显示首尾字符），
   复制时复制完整值，禁止写入日志或任何远程服务。
3. **监听暴露**：本地监听默认绑定 `127.0.0.1`；绑定其他网卡必须由用户主动开启
   （`allowNonLoopbackBind`），并显示风险提示（`Callout tone="risk"`）。
4. **目录共享**：默认只读；`:rw` / `:wo` 需要显式确认并提示风险。目录访问的
   最终边界由 tailcat 的 `os.Root` 保证，本项目不绕过、不自行实现路径解析。
5. **远端路径**：拒绝绝对路径与 `..`（`validateRemotePath`），并拒绝空字符。
6. **文件系统访问**：只操作用户通过系统文件选择器明确授权的路径。
7. **不修改系统状态**：不改路由表、DNS、防火墙，不写系统代理设置。
8. **进程清理**：应用退出时必须回收自身创建的子进程；不静默遗留后台进程。
9. **不夸大**：不得宣称 tailcat 提供了未经验证的访问控制、身份认证、审计或
   SLA 能力；未实现的能力要么隐藏，要么禁用并说明原因。
10. **出站网络请求**：应用自身**唯一**主动发起的 HTTP 请求是「引擎下载」
    （`engine_download.rs`）——只允许 https + 官方 GitHub 域名（含每一跳重定向
    复检），且只在用户显式触发下载时发生；没有遥测、上报或自动更新请求。
    tailcat 子进程到 DERP 中继的流量不经过本应用的网络代码。

### 6.3 预览模式的安全含义

浏览器预览后端**不接触**真实网络、文件系统或 tailcat；它存在的唯一目的是让
界面可以在没有 Rust 外壳时被设计与走查。`PreviewBanner` 会在顶部常驻提示，
且该后端被 `import.meta.env.DEV` 保护，不会进入生产构建。
