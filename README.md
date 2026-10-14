# Tailcat Box

Tailcat Box 是官方开源工具 [tailcat](https://github.com/tailscale/tailcat) 的跨平台
桌面图形客户端。它把 tailcat 的命令行能力（监听服务、端口转发、文件收发、
目录共享、网络服务访问）封装成可视化界面，目标用户是不想记忆命令行参数、
但需要在不同设备之间建立加密连接、转发端口和传文件的开发者。

产品定位：**轻量级、无需 Tailscale 账号、无需修改系统路由的点对点加密连接工具。**

> 本项目**不重新实现** tailcat 的底层网络协议，也不修改上游源码：Rust 侧作为
> 适配层以子进程方式调用官方 `tailcat` 二进制，参数以数组传递，绝不拼接 shell
> 字符串。

---

## 目录

- [当前实现状态](#当前实现状态)
- [功能概览](#功能概览)
- [前置条件](#前置条件)
- [开发运行](#开发运行)
- [测试](#测试)
- [构建与打包](#构建与打包)
- [目录结构](#目录结构)
- [安全说明](#安全说明)
- [已知限制](#已知限制)
- [文档索引](#文档索引)
- [许可证](#许可证)

---

## 当前实现状态

**重要且诚实的前置说明**：本仓库的**前端与 Rust 后端均已落地**，Rust 侧
`cargo fmt` / `cargo clippy -D warnings` / `cargo test`（56 passed）全部通过，
其中 4 个真实端到端测试已在单机执行通过；macOS 已产出**未签名、未公证**的
`.app` 与 `.dmg`，但 **Windows / Linux 产物尚未产出**，且**真实双机端到端验收
尚未完成**。因此：

| 部分 | 状态 |
| --- | --- |
| 界面外壳（侧边栏导航、主题、国际化、通知、组件库） | ✅ 已实现 |
| 六个功能页面（首页 / 连接 / 端口转发 / 文件传输 / 文件共享 / 设置） | ✅ 已实现 |
| 引擎管理面板与密钥管理（`src/features/engine/`） | ✅ 已实现 |
| IPC 契约与命令门面（`src/lib/types.ts`、`src/lib/api.ts`、`src/lib/ipc.ts`） | ✅ 已实现 |
| 浏览器预览后端（仅开发期，演示数据） | ✅ 已实现 |
| 输入校验、格式化、错误归一化、剪贴板 | ✅ 已实现 |
| Rust 侧错误模型与数据模型（`src-tauri/src/error.rs`、`model.rs`） | ✅ 已落地 |
| Rust 侧 Tauri 配置（`tauri.conf.json`、`capabilities/`、`build.rs`） | ✅ 已落地 |
| Rust 侧进程/任务/引擎/配置模块（`lib.rs`、`main.rs`、`commands.rs`、`config.rs`、`engine.rs`、`engine_download.rs`、`system.rs`、`tailcat/`、`task/`、`e2e.rs`、`cleanup.rs`） | ✅ 已落地（`cargo fmt` / `cargo clippy -D warnings` 均通过，`cargo test` 56 passed） |
| 引擎下载 / 安装（`engine_download_info`、`engine_download`、`tailcat://engine-download`，界面 `src/features/engine/DownloadPanel.tsx`） | ✅ 已实现（Windows / Linux；**macOS 官方无产物**，返回「不支持」并提示 `brew install tailcat`）。只从官方 GitHub 域名取产物，**先校验 SHA256 再解压安装**；真实 GitHub 链路尚未验证（见 [`docs/limitations.md`](docs/limitations.md) §7） |
| 应用图标（`src-tauri/icons/`） | ✅ 已生成 |
| 自动化测试 | ✅ Rust 56 passed / 0 failed（含 4 个默认自跳过的端到端测试，已在本机执行通过；17 个引擎下载测试离线运行）；`pnpm run typecheck` 通过；前端测试 10 文件 / 64 用例全部通过（见下） |
| 真实双机端到端验收（GUI 与官方 CLI 互通） | ❌ 尚未执行 |
| macOS 安装包（Apple Silicon） | ✅ 已产出（`Tailcat Box.app`、`Tailcat Box_0.1.0_aarch64.dmg`；未签名 / 未公证，未在干净机器上安装验证） |
| Windows / Linux 安装包 | ❌ 尚未产出（需在对应平台或 CI 上构建） |

因此现在可以运行的是：**完整桌面应用（前端 + Rust 外壳）**，以及仅用于界面
走查的**浏览器预览模式**。真实的**双机**互通需要**两台设备**才能验收，本机未
执行；单机场景下已有 4 个真实端到端测试在本机执行通过（本地端口转发、投递箱
接收文件、只读共享目录取回文件、停止任务后端口释放，详见下文「测试」一节）。
完整清单见
[`docs/limitations.md`](docs/limitations.md)。

---

## 功能概览

界面按左侧导航分为六个工作区：

| 导航 | 目标能力 | 依据的 tailcat 能力 |
| --- | --- | --- |
| 首页 | 引擎状态、活动任务、最近记录、快捷操作 | `tailcat version` / `genkey --list` |
| 连接 | 创建监听服务、生成并复制地址令牌、连接对端 | `tailcat serve` |
| 端口转发 | 本地端口转发与服务访问 | `tailcat forward`（v0.7.0 原生，由 CLI 持有监听） |
| 文件传输 | 接收目录、发送文件/目录、远端文件列表 | `tailcat recv` / `tailcat cp` / `tailcat ls` |
| 文件共享 | 目录只读/读写/只写共享 | `tailcat serve --files=<dir>:<mode> files` |
| 设置 | 主题、语言、引擎路径、**引擎下载/安装**、DERP、日志、历史、导入导出 | `--derpmap-url`、`genkey`；引擎下载走官方 GitHub release + `checksums.txt`（非 tailcat 子命令，见下） |

**关于引擎下载**：Windows / Linux 上可以从官方 GitHub release 直接下载并安装
tailcat——后端先取同一 release 的 `checksums.txt` 校验 SHA256，校验通过才解压
安装到 `<app 数据目录>/engine/<version>/`，并把 `Settings.tailcatPath` 指过去；
只允许 https + 官方 GitHub 域名，每一次重定向都会重新校验，全程不经过 shell、
不执行任何脚本。**macOS 官方没有 darwin 产物**（macOS 版本由 Homebrew 从源码
构建），因此 macOS 上界面只给出 `brew install tailcat` 指引与「手动指定路径」
入口。该链路目前只在离线假服务器的测试中跑通过，**没有对真实 GitHub 验证过**，
详见 [`docs/limitations.md`](docs/limitations.md) §4.2 与 §7。

**关于本地端口转发的关键事实**：**tailcat v0.7.0 原生提供 `forward` 子命令**，
由 CLI 自己持有本地监听与隧道。本项目直接使用它，不再自行绑定端口、也不再为
每个连接派生桥接子进程：

```sh
tailcat forward --bind=127.0.0.1 <addrblob> <localPort>:<remotePort>
```

`localPort` 写 `0` 表示由系统分配，真实端口由 CLI 写到 stderr
（`# forwarding 127.0.0.1:54348 -> remote localhost:18080`），适配层解析后回填到
界面。映射**必须**写成 `local:remote`（单端口写法 `tailcat forward <addr> 0` 会被
CLI 拒绝）。本项目**不使用** CLI 的 `socks` 代理模式。详见
[`docs/tailcat-cli.md`](docs/tailcat-cli.md) 与 [`docs/limitations.md`](docs/limitations.md)。

功能与 CLI 子命令的逐条对应关系见
[`docs/capability-matrix.md`](docs/capability-matrix.md)。

---

## 前置条件

| 依赖 | 版本要求 | 说明 |
| --- | --- | --- |
| Node.js | 20+ | 前端构建（本机实测 v26 亦可） |
| pnpm | 9+ | 包管理，仓库内提供 `pnpm-lock.yaml` |
| Rust | stable（`cargo` + `rustc`），MSRV **1.82** | Tauri 2 桌面外壳；`src-tauri/Cargo.toml` 的 `rust-version` 为 `1.82` |
| tailcat | **0.7.0 及以上** | 运行时网络引擎，**不由本仓库分发**（本机 Homebrew 实测 v0.7.0）。本项目的本地转发依赖 0.7.0 新增的 `forward` 子命令，见下。Windows / Linux 上也可以在应用内从官方 release 下载安装（校验 SHA256 后才安装）；macOS 需自行安装 |

平台依赖：

- **macOS**：Xcode Command Line Tools（`xcode-select --install`）。打包 DMG 需要。
- **Linux**：WebKitGTK 4.1 开发包、`libssl-dev`、`libayatana-appindicator3-dev`、
  `librsvg2-dev`、`patchelf`（Debian/Ubuntu 命名，其他发行版对应包名不同）。
  文件传输依赖系统 `scp`/`sftp`（`openssh-client`）。
- **Windows**：WebView2 Runtime（Windows 10 1803+ 通常已内置）、MSVC 生成工具链。
  `cp`/`ls`/`ssh` 依赖系统 OpenSSH 客户端（Windows 10 1809+ 自带）。

安装 tailcat（本机实测命令）：

```sh
# macOS
brew install tailcat

# 其它平台：从官方 Releases 下载对应二进制
# https://github.com/tailscale/tailcat/releases
# 或者直接在应用内「设置 → 引擎 → 引擎下载」安装（Windows / Linux；
# 会先校验官方 checksums.txt 里的 SHA256）
```

> ⚠️ **需要 0.7.0**：本文与 [`docs/tailcat-cli.md`](docs/tailcat-cli.md)、
> [`docs/limitations.md`](docs/limitations.md) 中的 tailcat 行为结论均在
> **v0.7.0**（Homebrew，macOS arm64，2026-10-14）上实测得到。本地端口转发
> 依赖 v0.7.0 的 `forward` 子命令；更早版本不具备该能力。
>
> ⚠️ **兼容性**：v0.7.0 的 `serve` / `genkey` 默认 `--psk=true`，生成的地址
> **只与 tailcat v0.5.1 及以上的客户端互通**。对端若仍在用 v0.5.0 或更早的
> 客户端，默认连不上——需要对方升级，或本应用显式使用 `--psk=false`（地址更短，
> 但安全性更弱）。见 [`docs/limitations.md`](docs/limitations.md) §2.4。

一键自检：

```sh
./scripts/check-env.sh
```

该脚本逐个检查 `node` / `pnpm` / `cargo` / `rustc` / `tailcat`，打印版本与安装
建议；缺少必需工具时以非 0 退出码结束。rustup 默认把 `cargo` / `rustc` 装在
`~/.cargo/bin`（该目录常常不在非登录 shell 的 `PATH` 里），脚本会在检查前
自动把它补进 `PATH`，因此「已安装但不在 `PATH`」不会再被误报为未找到。

---

## 开发运行

```sh
# 1. 安装前端依赖
pnpm install

# 2. 启动完整桌面应用（前端 + Rust 外壳）
pnpm tauri:dev

# 3. 仅启动浏览器预览（不连接真实后端）
pnpm dev
```

### 关于 `pnpm dev` 浏览器预览模式

`pnpm dev` 会在 <http://localhost:1420> 启动 Vite 开发服务器。此时应用运行在
**预览模式**：

- 顶部会常驻一条警告横幅（`PreviewBanner`），明确标注「预览模式（未连接本机
  tailcat）」。
- IPC 调用会走 `src/lib/preview-backend.ts` 提供的**内存假后端**：它不建立任何
  隧道、不产生任何流量，任务状态与地址令牌都是演示数据。
- 该后端由 `import.meta.env.DEV` 保护，生产构建中会被摇树移除。

**限制**：预览模式仅用于界面设计与走查，**不能**用来验证 tailcat 连接、
端口转发或文件传输。`pnpm dev` 也无法访问本机文件系统或系统剪贴板
（原生插件仅在 Tauri 外壳内可用）。

### 快捷键

`Cmd/Ctrl + 1..6` 在六个页面之间切换。

---

## 测试

```sh
# TypeScript 类型检查
pnpm run typecheck

# 前端单元/组件测试（Vitest）
pnpm run test

# Rust 侧测试
cd src-tauri && cargo test
```

现状（2026-10-14 实测，macOS arm64）：

| 命令 | 结果 |
| --- | --- |
| `pnpm run typecheck` | ✅ 通过 |
| `pnpm run test` | ✅ 10 个测试文件 / 64 个用例全部通过 |
| `cargo fmt --all -- --check`（`src-tauri/`） | ✅ 退出码 0（无格式差异） |
| `cargo clippy --all-targets --all-features -- -D warnings`（`src-tauri/`） | ✅ 0 error / 0 warning |
| `cargo check --all-targets`（`src-tauri/`） | ✅ 0 error / 0 warning |
| `cargo test`（`src-tauri/`，默认不联网） | ✅ 56 passed / 0 failed（其中 4 个真实端到端测试默认自跳过） |
| `TAILCAT_E2E=1 cargo test`（`src-tauri/`，需联网） | ✅ 56 passed / 0 failed，4 个端到端测试**真实执行**并全部通过（16.4s） |

Rust 侧不只是「`cargo check` 通过」：格式检查、`clippy -D warnings` 与全部
56 个测试都已通过；前端测试复核时也全部通过（10 文件 / 64 用例）。此前
`src/features/home/__tests__/HomeScreen.test.tsx` 有一条依赖真实时钟（`/1m 05s/`）
的断言会偶发抖动，现已改为在用例内冻结系统时间，不再依赖真实时钟。

56 个测试里有 17 个属于引擎下载：`src-tauri/src/engine_download.rs` 的 10 个
单元测试与 `src-tauri/src/engine_download_tests.rs` 的 7 个**离线**集成测试
（在 `127.0.0.1` 上起假 Release 服务器，跑完「下载 → 校验 → 解压 → 安装」）。
它们不访问外网；`cargo test` 依然可以在离线环境与 CI 中运行。

真实的端到端验证脚本是 [`scripts/e2e-verify.sh`](scripts/e2e-verify.sh)
（对应 `src-tauri/src/e2e.rs`）与 [`scripts/cleanup-verify.sh`](scripts/cleanup-verify.sh)
（对应 `src-tauri/src/cleanup.rs`）。这两个文件里共有 **4 个**真实集成测试，
它们会启动真实的 `tailcat serve` / `forward` / `recv` 子进程并依赖 DERP 中继
联网，要求 **`tailcat >= v0.7.0`**，**默认不参与 CI**（只有显式设置
`TAILCAT_E2E=1` 时才真正运行）。默认的 `cargo test` 不会访问外网：唯一的
「网络」行为是引擎下载的离线集成测试会在 `127.0.0.1` 上绑定一个临时端口，
由测试自己充当假 Release 服务器。

4 个端到端测试分别验证：

| 测试 | 验证内容 |
| --- | --- |
| `e2e::e2e_本地端口转发可访问真实的目标服务` | 本地监听端口 → 远端 localhost 目标服务，取回固定响应体 |
| `e2e::e2e_接收投递箱可收到官方_cli_发送的文件` | `tailcat recv` 投递箱收到官方 CLI 发来的文件，内容逐字节一致 |
| `e2e::e2e_只读共享目录可被官方_cli_列出并取回文件` | `serve --files=<dir>:ro files` 后 `ls -l` 列出、`cp` 取回文件，内容逐字节一致 |
| `cleanup::e2e_stop_releases_local_listen_port` | `stop` 之后本地监听端口可重新绑定 |

这些测试都已在 **2026-10-14** 于本机（macOS arm64、tailcat v0.7.0）执行通过。
但它们都是**单机**场景（客户端与服务端同机，经 DERP 中继），**不能**替代
双机互通验收；`rw` / `wo` / `wo+` 共享模式与文件传输的错误路径仍无端到端覆盖。

测试约定见 [`docs/development-conventions.md`](docs/development-conventions.md)：
每个功能模块自带 `__tests__/` 目录与 `messages.ts` 文案。

测试原则：**区分模拟测试与真实网络集成测试**，不得用 Mock 测试冒充端到端测试；
界面不得展示伪造的连接状态、传输进度或测试结果。

---

## 构建与打包

```sh
# 一键：平台检测 -> 依赖 -> 类型检查 -> 测试 -> 打包
./scripts/build-all.sh

# 或手动分步
pnpm install
pnpm run typecheck
pnpm run test
pnpm tauri:build
```

产物位于 `src-tauri/target/release/bundle/` 下，按平台区分：

| 平台 | 产物路径 |
| --- | --- |
| macOS | `src-tauri/target/release/bundle/dmg/*.dmg`、`src-tauri/target/release/bundle/macos/*.app` |
| Windows | `src-tauri/target/release/bundle/msi/*.msi`、`src-tauri/target/release/bundle/nsis/*.exe` |
| Linux | `src-tauri/target/release/bundle/deb/*.deb`、`src-tauri/target/release/bundle/rpm/*.rpm`、`src-tauri/target/release/bundle/appimage/*.AppImage` |

> 上述路径是 Tauri 2 的标准输出位置。`src-tauri/` 工程（`Cargo.toml`、
> `build.rs`、`tauri.conf.json`、`capabilities/`、`icons/` 与 `src/` 下的
> Rust 模块）已入库，`cargo fmt` / `cargo clippy` / `cargo test` 均已通过，且
> 本机已实际产出 macOS（Apple Silicon）的 `.app` 与 `.dmg`（**未签名、未公证**）：
> `src-tauri/target/release/bundle/macos/Tailcat Box.app`、
> `src-tauri/target/release/bundle/dmg/Tailcat Box_0.1.0_aarch64.dmg`。
> 但这两份产物**尚未在干净机器上安装验证**，**Windows / Linux / ARM64 的产物
> 仍未产出**，必须在对应操作系统或多平台 CI runner 上构建后才能声称可用。
> 完整的打包说明、签名与公证要点见 [`docs/packaging.md`](docs/packaging.md)，
> 安装包签名现状见 [`docs/ci.md`](docs/ci.md) §4。

> ⚠️ **没有 `.git`**：当前工作副本**不是** git 仓库，因此 `git status` / `git diff`
> 无法运行，也没有提交历史。仓库内**已有** CI 配置
> （[`.github/workflows/ci.yml`](.github/workflows/ci.yml)、
> [`.github/workflows/release.yml`](.github/workflows/release.yml)）与
> [`docs/ci.md`](docs/ci.md)，但它们**从未在真实的 GitHub runner 上执行过**；
> 本文**不声称**任何 CI 已经跑通。

发布包必须包含 `LICENSE` 与 `THIRD_PARTY_NOTICES.md`，并按 BSD-3-Clause 的
要求随包提供 tailcat 的许可证说明。

---

## 目录结构

```text
tailcat_box/
├── AGENT.md                       # 项目开发任务书
├── DESIGN.md                      # 视觉设计基线（设计 Token 来源）
├── README.md                      # 本文件
├── LICENSE                        # 本项目 MIT 许可
├── THIRD_PARTY_NOTICES.md         # 第三方依赖与 tailcat 的 BSD-3-Clause 全文
├── index.html                     # Vite 入口（默认 data-theme="dark"）
├── package.json / pnpm-lock.yaml  # 前端依赖与脚本
├── vite.config.ts                 # 开发服务器固定 1420 端口、忽略 src-tauri
├── vitest.config.ts               # jsdom + Testing Library 测试环境
├── docs/
│   ├── development-conventions.md # 开发约定（Token、组件、CLI 事实）
│   ├── architecture.md            # 分层架构与任务生命周期
│   ├── tailcat-cli.md             # tailcat CLI 适配层文档
│   ├── capability-matrix.md       # CLI 子命令能力矩阵
│   ├── limitations.md             # 已知限制与未实现功能
│   ├── packaging.md               # 打包与分发
│   └── ci.md                      # CI / Release 工作流与签名现状
├── .github/workflows/
│   ├── ci.yml                     # 日常检查（类型、单测、构建、lint、测试）
│   └── release.yml                # 打 tag 后三平台打包并创建 draft Release
├── scripts/
│   ├── check-env.sh               # 工具链自检
│   ├── build-all.sh               # 跨平台构建流水线
│   ├── e2e-verify.sh              # 真实端到端验证（`TAILCAT_E2E=1`，需联网）
│   └── cleanup-verify.sh          # 任务停止 / 退出清理验证
├── src-tauri/                     # Tauri 2 / Rust 工程
│   ├── Cargo.toml                 # Rust 依赖与 release 配置
│   ├── build.rs                   # tauri-build 入口
│   ├── tauri.conf.json            # 窗口、CSP、bundle、随包资源
│   ├── capabilities/default.json  # Tauri 2 权限（最小化声明）
│   ├── icons/                     # 应用图标（`pnpm tauri icon` 生成）
│   └── src/
│       ├── lib.rs / main.rs       # 应用入口、插件与命令注册
│       ├── commands.rs            # Tauri 命令面（对应 src/lib/api.ts）
│       ├── config.rs              # 设置与历史记录持久化
│       ├── engine.rs              # 引擎探测、版本、密钥、DERP
│       ├── engine_download.rs     # 官方引擎下载 / SHA256 校验 / 解压安装
│       ├── engine_download_tests.rs # 引擎下载的离线集成测试（本机假 Release）
│       ├── system.rs              # 系统信息、打开 URL / 路径
│       ├── error.rs               # AppError + ErrorCode + stderr 归类
│       ├── model.rs               # 与 src/lib/types.ts 一一对应的 serde 模型
│       ├── tailcat/               # CLI 适配层（spec / parse / mod）
│       ├── task/                  # 任务注册表与凭据脱敏（转发委托 CLI 的 forward）
│       ├── e2e.rs                 # 真实端到端测试（转发 / 投递箱 / 共享取回）
│       └── cleanup.rs             # 子进程回收与端口释放验证（`cfg(unix)`）
└── src/
    ├── main.tsx / App.tsx         # 入口、路由懒加载与启动流程
    ├── app/routes.ts              # 六个路由定义与快捷键
    ├── components/
    │   ├── layout/                # AppShell、Sidebar、PreviewBanner、EngineSummary、Screen
    │   └── ui/                    # 25 个 shadcn 风格基础组件
    ├── features/                  # home / connections / forwards / transfer / share / settings / engine
    ├── lib/                       # types、api、ipc、errors、validation、format、i18n、theme…
    ├── store/app.ts               # Zustand 全局状态与事件订阅
    ├── styles/                    # tokens.css + globals.css
    └── test/setup.ts              # 测试环境准备
```

每个功能模块自带 `messages.ts`（文案）与 `__tests__/`（测试），例如
`src/features/forwards/{ForwardForm,ServiceForm,TaskList,TaskDetail}.tsx`。

---

## 安全说明

1. **不实现自研加密**：所有加密与 NAT 穿透由官方 tailcat 完成。
2. **不需要 Tailscale 账号**，默认不需要管理员权限。
3. **不修改系统路由表、DNS 或防火墙**；不写系统代理设置。
4. **地址令牌即凭据**：界面默认脱敏展示（`settings.redactAddresses`，默认开启），
   复制时复制完整值，且不得写入日志或任何远程服务。
5. **参数数组执行**：CLI 以参数数组启动，禁止拼接 shell 字符串，杜绝命令注入。
6. **本地监听默认 `127.0.0.1`**：改为其他网卡地址必须由用户主动开启
   （`settings.allowNonLoopbackBind`），并显示暴露风险提示。
7. **目录共享默认只读**：切换为 `:rw` 或 `:wo` 必须显式确认并展示风险提示。
8. **路径约束**：远端路径拒绝绝对路径与 `..`（`validateRemotePath`）；目录访问
   的最终边界由 tailcat 自身的 `os.Root` 保证，本项目不绕过它。
9. **不执行来源不明的脚本**：引擎下载只从**官方 GitHub 域名**取产物（https，
   每一次重定向都重新校验），必须先通过官方 `checksums.txt` 的 **SHA256 校验**
   才会解压安装，全程不经过 shell、不执行任何安装脚本；校验不通过即中止。
   官方没有 macOS 产物，因此 macOS 上不提供下载，只给 Homebrew 指引。
10. **不夸大能力**：不宣称 tailcat 提供了未经验证的访问控制、身份认证、
    审计或 SLA 能力。

完整的安全边界描述见 [`docs/architecture.md`](docs/architecture.md)。

---

## 已知限制

主要限制（完整清单见 [`docs/limitations.md`](docs/limitations.md)）：

- **地址默认带 PSK，与 ≤ v0.5.0 的客户端不互通**：v0.7.0 的 `serve` / `genkey`
  默认 `--psk=true`，生成的地址只能被 tailcat v0.5.1+ 的客户端连接；要兼容更早
  的客户端必须显式 `--psk=false`（安全性更弱）。
- 本地转发使用 CLI 的 `forward` 子命令，**依赖服务端 `serve` 已开放对应端口**；
  映射必须写成 `local:remote`。
- 本项目**不使用** CLI 的 `socks` 代理模式。
- 浏览器预览模式不连接真实后端，不能用于功能验收。
- 未实现内嵌 SSH 客户端（仅记录 `tailcat ssh` 的 CLI 能力）；`serve` 的 `ssh` /
  `no-auth-ssh` / `exit-node` / `all` / `exec` 服务也不在界面暴露。
- 公开 DERP 中继有速率限制且无 SLA。
- Windows 下 `cp`/`ssh` 依赖系统 OpenSSH。
- **引擎下载只在 Windows / Linux 可用**：官方没有 macOS 产物，macOS 上返回
  「不支持」并提示 `brew install tailcat`。该链路**尚未对真实 GitHub 验证**
  （测试用的是本机假 Release 服务器），重定向白名单未用真实 302 验证，解压用的
  是自造归档，且后端没有并发下载互斥（界面已禁用按钮）。
- 传输进度与速度仅在底层提供数据时显示，否则显示 `—`。
- **端到端测试都是单机场景**：客户端与服务端同机、经 DERP 中继互联，
  **双机互通尚未验收**；`rw` / `wo` / `wo+` 共享模式与文件传输错误路径也无覆盖。
- **应用内「取回文件」尚未接入命令面**：`spec::cp_fetch_spec` 目前只被端到端
  测试使用，界面没有对应入口，不代表应用已提供从远端共享目录拉取文件的功能。
- **Windows / Linux / ARM64 未在本机验证**：本仓库的全部实测结论均来自
  macOS arm64；其它平台需在对应平台或 CI 上构建与验证。

---

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [`docs/architecture.md`](docs/architecture.md) | 分层架构、任务生命周期、进程与日志、事件通道、配置存储、安全边界 |
| [`docs/tailcat-cli.md`](docs/tailcat-cli.md) | CLI 适配层：子命令、参数数组、输出解析、错误码映射 |
| [`docs/capability-matrix.md`](docs/capability-matrix.md) | 每个 tailcat 子命令的实现状态矩阵 |
| [`docs/limitations.md`](docs/limitations.md) | 已知限制与未实现功能清单 |
| [`docs/packaging.md`](docs/packaging.md) | 三平台打包、签名、分发与许可证合规 |
| [`docs/ci.md`](docs/ci.md) | GitHub Actions 工作流（CI / Release）、安装包签名现状与发布步骤 |
| [`docs/development-conventions.md`](docs/development-conventions.md) | 开发约定（设计 Token、组件库、状态与 IPC、CLI 事实） |
| [`DESIGN.md`](DESIGN.md) | 视觉设计基线 |

---

## 许可证

本项目以 **MIT** 许可发布，版权行为 `Copyright (c) 2026 Tailcat Box contributors`，
见 [`LICENSE`](LICENSE)。

第三方依赖声明、tailcat 的完整 BSD-3-Clause 文本以及字体许可说明见
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。

本项目不分发 tailcat 源码，仅调用其官方二进制；使用前请自行安装 tailcat 并遵守
其许可证。
