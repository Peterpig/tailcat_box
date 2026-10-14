# 已知限制与未实现功能

本文是**诚实清单**：凡是当前做不到、做不全、或有意不做的事情都列在这里。
界面不得把本文中的「未实现」项显示为已支持；未实现的能力要么隐藏，要么禁用
并说明原因。

> 依据：`tailcat` **v0.7.0**（Homebrew，macOS arm64）于 **2026-10-14** 的实测
> 行为、本仓库现有代码，以及
> [`development-conventions.md`](development-conventions.md) 第 5 节。
>
> **版本**：本文按 v0.7.0 编写。v0.7.0 相对更早版本的关键差异是新增了
> `forward` / `browse` 子命令、`--psk` 标志、`wo+` 文件模式与 `ssh` / `exec`
> 服务，并修好了 `ping`。使用更早版本时，本文的若干结论不成立。

---

## 1. 当前仓库的整体状态

### 1.1 前后端均已落地，静态检查、单元测试与单机端到端测试均通过，但真实双机端到端验收尚未完成

前端（`src/**`）与 Rust 后端（`src-tauri/src/**`）均已入库。Rust 侧包含
`lib.rs` / `main.rs`（入口与命令注册）、`commands.rs`（命令面）、
`config.rs`（设置与历史持久化）、`engine.rs`（引擎探测、版本、密钥）、
`engine_download.rs` 与 `engine_download_tests.rs`（官方引擎下载 / 校验 / 安装，见 §4.2）、
`system.rs`（系统集成）、`tailcat/`（CLI 适配层：`spec` / `parse` / `mod`）、
`task/`（任务注册表与凭据脱敏；本地转发委托给 CLI 的 `forward`）、
`e2e.rs` 与 `cleanup.rs`（默认自跳过的真实端到端测试，见 §1.2）。
`cargo fmt --all -- --check`、`cargo clippy --all-targets --all-features -- -D warnings`
与 `cargo test`（56 passed / 0 failed）均已通过，其中 4 个真实端到端测试
**已在单机上实际执行并全部通过**，新增的 17 个引擎下载测试（10 个单元 +
7 个离线集成）也全部通过（实测命令与输出见 §1.2）。

仍然**没有**完成的是**真实双机端到端验收**：`AGENT.md`「八、测试与验收」要求
两台真实设备通过 GUI 与官方 CLI 互通，本机只有一台设备，该验收未执行（见 §7）。

### 1.2 测试状态

实测（2026-10-14，macOS arm64）：

| 命令 | 结果 |
| --- | --- |
| `pnpm run typecheck` | ✅ 通过 |
| `pnpm run test` | ✅ 10 个测试文件 / 64 个用例全部通过（含引擎下载面板 `src/features/engine/__tests__/DownloadPanel.test.tsx`；`HomeScreen.test.tsx` 的时钟断言已改为在用例内冻结系统时间，不再抖动） |
| `cargo fmt --all -- --check`（`src-tauri/`） | ✅ 退出码 0（无格式差异） |
| `cargo clippy --all-targets --all-features -- -D warnings`（`src-tauri/`） | ✅ 0 error / 0 warning |
| `cargo check --all-targets`（`src-tauri/`） | ✅ 0 error / 0 warning |
| `cargo test`（`src-tauri/`，默认不联网） | ✅ 56 passed / 0 failed（其中 4 个真实端到端测试默认自跳过） |
| `TAILCAT_E2E=1 cargo test`（`src-tauri/`，需联网） | ✅ 56 passed / 0 failed，4 个端到端测试**真实执行**并全部通过（16.4s） |

Rust 侧不只跑过 `cargo check`：格式检查、`clippy -D warnings` 与 56 个测试都已
通过；前端测试（10 文件 / 64 用例）复核时也全部通过。此前 `HomeScreen.test.tsx`
偶发的时钟抖动，已通过在该用例内冻结系统时间消除。

56 个 Rust 测试里有 17 个来自引擎下载模块：`engine_download.rs` 的 10 个单元
测试（资产名映射、`checksums.txt` 解析、SHA256 已知向量、URL 白名单、版本号
校验、归档路径约束）与 `engine_download_tests.rs` 的 7 个**离线**集成测试
（在本机回环地址上起一个假 Release 服务器，跑完「下载 → 校验 → 解压 → 安装」）。
它们不访问外网，因此 `cargo test` 依然可以在离线环境与 CI 中运行；唯一的
网络行为是绑定 `127.0.0.1` 的临时端口。

那 4 个端到端测试只有显式设置 `TAILCAT_E2E=1` 才会真正执行（默认跳过，保证离线
与 CI 下不发网络请求），分别是：

- `e2e::e2e_本地端口转发可访问真实的目标服务`（`src-tauri/src/e2e.rs`）——
  `tailcat serve` + `tailcat forward` 打通「本地监听端口 → 远端 localhost 目标服务」；
- `e2e::e2e_接收投递箱可收到官方_cli_发送的文件`——由 `spec::recv_spec` 启动的
  `tailcat recv` 投递箱，真实收到由 `spec::cp_spec` 生成、官方 CLI 执行发送的
  文件，内容逐字节一致；
- `e2e::e2e_只读共享目录可被官方_cli_列出并取回文件`——`serve --files=<dir>:ro files`
  后经 `ls -l` 列出、并经 `cp` 取回文件，内容逐字节一致；
- `cleanup::e2e_stop_releases_local_listen_port`（`src-tauri/src/cleanup.rs`）——
  `stop` 之后本地监听端口可重新绑定。

这些都是**单机**（客户端与服务端在同一台机器上，经 DERP 中继）的验证，
**不能**替代双机互通验收；`rw` / `wo` / `wo+` 共享模式、文件传输的错误路径
（同名文件、权限不足、磁盘空间不足）也都**没有**端到端覆盖（见 §7）。

### 1.3 macOS 已有本地构建产物，Windows / Linux 仍未产出

`tauri.conf.json` 的 `bundle.icon` 引用的 `src-tauri/icons/` 图标已生成，Rust 侧
`cargo fmt` / `cargo clippy` / `cargo test` 均已通过。本机实际产出了
**未签名、未公证**的 macOS（Apple Silicon）安装包，两份产物都真实存在于构建
目录中：

- `src-tauri/target/release/bundle/macos/Tailcat Box.app`（约 5.9 MB）
- `src-tauri/target/release/bundle/dmg/Tailcat Box_0.1.0_aarch64.dmg`（约 3.4 MB）

但这两份产物**只在本机构建目录里存在**，尚未在干净机器上安装验证，也没有签名
与公证（Gatekeeper 会拦截，打开方式见 [`ci.md`](ci.md) §4）。此外：

- **Windows / Linux 产物仍未产出**，必须在对应平台或多平台 CI runner 上分别
  构建（见 §3.3、§3.4 与 [`packaging.md`](packaging.md) §3）；
- macOS 的 Intel（`x86_64-apple-darwin`）产物与 universal 二进制同样**未产出**。

### 1.3.1 仓库根目录没有 `.git`，CI 工作流从未真正运行

当前工作副本**不是**一个 git 仓库（没有 `.git`），因此 `git status` / `git diff`
无法运行，也没有提交历史。仓库里**已经存在** CI 配置——`.github/workflows/ci.yml`、
`.github/workflows/release.yml` 与 [`ci.md`](ci.md)——但它们只做过 YAML 语法
校验，**从未在真实的 GitHub runner 上执行过**（CI 由 git 事件触发，而当前副本
既没有 git 历史也没有远端）。`scripts/build-all.sh` 同样需要在**真正的 git
仓库**中运行才有意义；本文**不声称**任何 CI 已经跑通。

### 1.4 平台覆盖未验证

本仓库的全部实测结论均来自 **macOS arm64**。Windows / Linux / ARM64 的构建与
运行行为**未在本机验证**，必须在对应平台或多平台 CI runner 上构建验证之后
才能声称可用（见 §3.4）。

---

## 2. 网络能力限制

### 2.1 本地转发使用 CLI 的 `forward` 子命令（v0.7.0）

v0.7.0 原生提供 `tailcat forward`，**由 CLI 自己持有本地监听与隧道**；本项目
不再自行绑定端口，也不再为每个连接派生 `tailcat <blob> <port>` 子进程。

由此带来的限制：

- 映射必须写成 `local:remote`：单端口写法（`tailcat forward <addr> 0`）会被 CLI
  以 `mapping "0" is invalid: local port: invalid port "0"` 拒绝，因此本项目
  固定生成 `local:remote`。
- `--bind` 默认 `127.0.0.1`；绑定其他网卡必须由用户主动开启并提示暴露风险。
- 转发到远端网络的另一个主机（`local:remote-ip:remote-port`）要求服务端是
  `exit-node`，本应用不在界面提供该形态。
- 不提供系统级代理设置，也不修改系统路由或 DNS。

### 2.2 本项目不使用 CLI 的 SOCKS5 代理模式

`tailcat socks` 在带 `<cmd>` 时可在 `<cmd>` 的生命周期内提供 SOCKS5 代理。

**本项目不使用该模式**：本地端口转发改用官方 `forward` 子命令（§2.1），由 CLI
自己持有监听，无需 SOCKS 客户端配合。`SocksRequest` 类型虽保留在契约中，但
Rust 侧的 `Socks` 任务一律返回 `UNSUPPORTED`，不应在界面上展示为已支持的能力。

### 2.3 转发依赖服务端已 `serve` 对应端口

本地转发只是「把本地端口接到对端已开放的端口」。服务端必须已经运行
`tailcat serve <port>`（或包含该端口的范围 / 服务）；本项目**无法**凭空访问
对端任意端口。远端端口为 `0` 无意义（服务端不会监听 0 端口），必须 > 0。

### 2.4 地址默认带 PSK，与 ≤ v0.5.0 的客户端不互通

v0.7.0 的 `serve` 与 `genkey` 都有 `--psk`，**默认 `true`**：生成的 tailcat
地址中纳入 WireGuard 预共享密钥（PSK）。这更安全，但意味着：

- 本应用默认生成的地址**只能被 tailcat v0.5.1 及以上的客户端连接**；
- 若对端仍在用 **v0.5.0 或更早**的客户端，默认**连不上**——要么对端升级，
  要么本应用显式使用 `--psk=false`（地址更短，但**安全性更弱**）。

界面不得把带 PSK 的地址描述成「与任意版本兼容」；提供「兼容旧客户端」选项时
必须同时说明安全性下降。

### 2.5 公开 DERP 中继有速率限制且无 SLA

默认 DERP map 是官方公共中继（`https://tailcat.dev/derpmap.json`），它是
**免费且限速**的，官方未提供任何可用性承诺（SLA）。首次连接与 NAT 穿透失败时
都依赖它。

影响：连接建立速度、稳定性、并发能力都受公共中继影响；高并发或长期运行场景
可能被限速。缓解方式是在设置中配置自建 DERP（`--derpmap-url`）。

### 2.6 首次连接需要能访问 DERP map

未使用 `--full-address` / `resolve` 的自包含长令牌时，客户端需要拉取 DERP map
才能解析区域 ID。离线或受限网络环境下这一步骤会失败（`DERP_UNREACHABLE` 或
`NETWORK_ERROR`）。

### 2.7 引擎下载会访问官方 GitHub（应用自身唯一的出站请求）

除 tailcat 子进程自己的流量之外，本应用现在还会**主动发起 HTTP 请求**：仅在
用户点击「下载 / 安装引擎」时，向官方 GitHub 域名（`api.github.com`、
`github.com` 及其官方资产跳转域名）请求 release 元数据、`checksums.txt` 与
产物（细节见 §4.2）。除此之外没有任何遥测、上报或自动更新请求；浏览器预览
模式与默认的 `cargo test` 都不会访问外网。

---

## 3. 平台与依赖限制

### 3.1 Windows 下 `cp` / `ssh` 依赖系统 OpenSSH

`tailcat cp` 由**系统 `scp`** 执行，`tailcat ssh` 会 **exec 系统 `ssh`**。
Windows 10 1809+ 自带 OpenSSH 客户端，但：

- 精简版/服务器版 Windows 可能未安装该可选功能；
- 缺少 `scp` 时文件传输直接不可用，错误信息来自系统工具而非 tailcat。

界面需要检测并给出明确提示，而不是显示一个「点了没反应」的按钮。

### 3.2 文件传输进度取决于底层工具

进度与速率来自 scp 的 stderr。若底层没有输出可用进度（例如某些平台/版本、
或传输的是极小的文件），界面必须显示 `—` 或「不可用」，**不得伪造百分比或
速度**。取消操作也只在底层能够安全中断时提供。

### 3.3 不交叉编译

`scripts/build-all.sh` 只面向**当前平台**构建产物，不提供交叉编译。要产出三个
平台的安装包，需要在对应平台上分别运行构建（或在 CI 中配置多平台 runner）。

### 3.4 Windows / Linux / ARM64 未在本机验证

本机是 macOS arm64，**无法交叉编译** Windows 与 Linux 产物，也没有在
Windows / Linux / ARM64 真机上运行过。因此：

- 任何 Windows / Linux / ARM64 的构建结果、安装包与运行行为都属于
  **未验证**，必须在对应平台或 CI 上构建验证后才能声称可用；
- 本文与其它文档中的实测结论（tailcat v0.7.0 行为、路径、DERP 表现等）
  **仅代表 macOS arm64**；
- 跨平台差异（WebView2、WebKitGTK、`patchelf`、OpenSSH 版本、路径分隔符等）
  需要在各自平台上重新核对。

---

## 4. 有意不实现的功能

> 注：§4.2 原本也列在本节（当时「自动下载 / 安装」被有意排除）。该能力现已
> 实现，因此 §4.2 改写为对**已实现能力**的边界说明；本节其余小节仍然是
> 「有意不实现」。

### 4.1 未实现内嵌 SSH 客户端

本项目**不实现**内嵌 SSH 客户端或终端模拟器。`tailcat ssh` 只是 exec 系统
`ssh`，本项目仅**记录**这一 CLI 能力，不将其作为已支持功能展示。
`SshRequest` 类型保留在契约中，用于未来评估，不代表已实现。

### 4.2 引擎下载 / 安装：只装官方产物，且必须先过 SHA256 校验

**已实现**（不再是「有意不实现」）。后端在 `src-tauri/src/engine_download.rs`
里实现了官方引擎的下载与安装，命令面为 `engine_download_info`（只查询，不下载）
与 `engine_download`（执行），进度经 `tailcat://engine-download` 事件推送；
界面入口在 `src/features/engine/DownloadPanel.tsx`（挂在引擎面板内）。

能力边界：

- **只从官方 GitHub 域名取数据**：版本元数据走 `api.github.com` 的
  `repos/tailscale/tailcat/releases`，产物与 `checksums.txt` 走 `github.com`；
  请求必须是 https，且主机名必须落在官方白名单（`OFFICIAL_HOSTS`）内。
  **每一次重定向都会重新做同样的检查**，跳到白名单之外直接拒绝、不跟随。
- **先校验 SHA256，再解压安装**：产物边下边算 SHA256，与**同一个 release** 的
  `checksums.txt` 比对；不一致返回 `ENGINE_CHECKSUM_MISMATCH`（错误信息里同时
  给出期望值与实际值）。校验不通过就中止，**不存在「跳过校验」的开关**；
  `checksums.txt` 里没有对应条目同样直接失败。
- **安装位置与生效方式**：解压到 `<app 数据目录>/engine/<version>/tailcat`
  （Windows 为 `tailcat.exe`），只落地这一个可执行文件，成功后把
  `Settings.tailcatPath` 指向它并刷新引擎状态（`tailcat://engine-changed`）。
- **解压防路径穿越**：归档里含 `..`、绝对路径或盘符的条目被拒绝
  （`PATH_TRAVERSAL`）；只解出普通文件与目录，符号链接与设备节点被丢弃。
- **不执行任何脚本**：全程不经过 shell，也不执行任何安装脚本——这正是
  `AGENT.md`「不允许自动执行来源不明的脚本」允许的边界。本应用也**不**随包
  分发 tailcat（见 [`packaging.md`](packaging.md) §7）。

**macOS 不支持**：官方 release **没有 darwin 产物**（macOS 版本由 Homebrew
从源码构建），因此 macOS 上 `engine_download_info` 直接返回
`supported = false` 与 `ENGINE_UNSUPPORTED_PLATFORM`，界面给出
`brew install tailcat` 指引与「手动指定路径」入口，不会假装能下载。官方未发布
产物的架构（`x86` / `riscv64` 等）走同一条路径。

这条链路**尚未在真实平台与真实 GitHub 上验证**（本机是 macOS，只会返回
「不支持」），未验证项见 §7。

### 4.3 未实现 `exit-node` / `all` / `ssh` / `no-auth-ssh` / `exec` 服务

这些 `serve` 服务名会让本机暴露整个网络、全部端口、认证或非认证 SSH，或对每个
连接执行任意命令（`exec`），风险显著高于常规用法。本项目不在界面上提供一键
开关，需要独立的安全设计与用户明确授权后再评估。

> 注意区分：`tailcat ssh`（客户端，exec 系统 ssh）与 `serve` 的 `ssh` 服务
> （服务端，需要 `--ssh-authorized-keys`）都不是本应用实现的能力。

### 4.4 未实现 `--verbose`

不暴露该开关，避免把大量内部诊断混入用户可见日志。

### 4.5 未实现「查看官方 README」入口

`tailcat readme` 输出很长且与本项目文档重复，不在界面中提供。

---

## 5. 安全边界带来的限制

### 5.1 目录共享的路径限制由 tailcat 保证

本项目**不自行实现**目录访问控制，也不做路径规范化绕过尝试。共享目录的读写
边界最终由 tailcat 自身的 `os.Root` 保证：`scp`/`sftp` 客户端只能访问
`--files=<dir>` 指定的子树，无法路径穿越，也无法通过符号链接访问未授权目录。

本项目额外做的前端校验（`validateRemotePath` 拒绝绝对路径与 `..`）只是**更早
的防御层**，不是权威边界。若 tailcat 未来改变该行为，本项目的校验不会因此
放宽。

### 5.2 只能访问用户明确授权的路径

文件与目录操作只针对用户通过系统文件选择器明确选择的路径；本应用不做全盘扫描，
也不在未授权目录下创建文件。

### 5.3 本地监听默认只绑回环

默认绑定 `127.0.0.1`。绑定其他网卡地址必须由用户主动开启
（`Settings.allowNonLoopbackBind`），并显示暴露风险提示。这意味着**默认情况下
局域网内其他设备无法直接访问本机转发端口**。

### 5.4 不修改系统网络状态

不修改路由表、DNS、防火墙，不写系统代理设置。因此：

- 其他程序不会自动走 tailcat 隧道，需要显式指向本地转发端口；
- 也不会出现「关掉应用后系统网络仍被改写」的残留。

### 5.5 地址令牌是凭据

地址令牌默认脱敏展示，复制时复制完整值，且不得写入日志或任何远程服务。
用户若手动分享令牌，等于把该服务的访问凭据交给了对方。

---

## 6. 预览模式的限制

浏览器预览模式（`pnpm dev`）**不连接真实后端**：

- 使用 `src/lib/preview-backend.ts` 的内存假后端，任务状态与地址令牌都是演示
  数据，不建立任何隧道、不产生任何流量；
- 顶部常驻警告横幅提示当前处于预览模式；
- 无法访问本机文件系统与系统剪贴板（原生插件只在 Tauri 外壳内可用）；
- **不能**用于功能验收或端到端测试。

预览后端受 `import.meta.env.DEV` 保护，不会进入生产构建。

---

## 7. 尚未验证 / 未知的部分

- **真实双机互通未验证**：需要在两台真实设备上通过 GUI 与官方 CLI 互通，才能
  完成 `AGENT.md`「八、测试与验收」中的端到端验收项。
- **端到端测试只覆盖单机场景**：`src-tauri/src/e2e.rs`（3 个）与
  `src-tauri/src/cleanup.rs`（1 个）里的 4 个真实集成测试都已在单机执行通过
  （见 §1.2），但它们把客户端与服务端放在**同一台机器**上、经 DERP 中继互联，
  因此**不能**替代双机互通验收，也**没有**覆盖 `rw` / `wo` / `wo+` 共享模式。
- **应用内的「取回文件」尚未接入命令面**：`spec::cp_fetch_spec`（`tailcat cp
  <blob>:<path> <local>`）目前只被端到端测试使用，`TaskRequest` 里还没有对应的
  任务类型，界面也没有该入口。共享目录的读取方向因此**只在 CLI 参数层被验证**，
  不代表应用已经提供该功能。
- **「退出应用后没有残留子进程」只在测试层验证，未做真实 GUI 运行验证**：
  `src-tauri/src/cleanup.rs` 已用「shim 冒充 tailcat + 断言 PID 被回收」覆盖
  `stop` / `stop_all` / `shutdown`，并在 `TAILCAT_E2E=1` 时用真实 `tailcat`
  断言停止后端口可重新绑定；但 `tailcat://quit-requested` 事件 →
  `api.onQuitRequested` → `src/store/app.ts` 的订阅 → 退出确认对话框这条**界面
  路径**尚未在真实 GUI 运行中验证，也没有覆盖 Windows（`cleanup.rs` 整体
  `cfg(unix)` 跳过）。
- **`resolve` 输出与自包含长令牌的 JSON 字段未观测**：`tailcat parse` 的实测
  输出含 `ServerPublic` / `ServerDiscoPublic` / `PresharedKey` / `RegionID`；
  `--full-address` / `resolve` 产生的令牌可能带有更多字段，其稳定形态尚未确认，
  当前按未知字段忽略处理。
- **`--psk` 的兼容性未做双版本实测**：v0.7.0 的 `--help` 明确说明默认 `--psk=true`
  生成的地址只兼容 v0.5.1+ 客户端；本机没有旧版客户端，未实测「默认地址 vs
  老客户端」的失败形态。
- **引擎下载没有对真实 GitHub 跑过完整链路**：17 个引擎下载测试全部离线——
  集成测试用 `tokio::net::TcpListener` 在本机回环地址上起一个假服务器冒充官方
  Release（`releases/latest` JSON、`checksums.txt`、`tar.gz` / `zip` 产物都是
  测试自己造的），**没有**对 `api.github.com` / `github.com` 发过真实请求。
  因此真实的 `assets[].browser_download_url`、真实 `checksums.txt` 的排版、
  真实 release 的资产命名都**未被端到端验证**。
- **重定向白名单未用真实 302 验证**：`OFFICIAL_HOSTS` 白名单与「每一跳都重新
  校验」的逻辑只有单元测试覆盖，没有用真实的重定向响应（例如
  `github.com` → `objects.githubusercontent.com`）验证过。
- **解压用的是自造归档，不是官方真实产物**：测试里的 `tar.gz` / `zip` 由测试
  自己打包，因此官方归档的目录层级（`find_binary()` 假设「最浅的同名文件」）、
  文件名大小写、是否附带 LICENSE / README 等**都未与真实产物核对**。
- **真实平台上的下载链路从未跑过**：本机是 macOS，`engine_download` 在这里必然
  返回「不支持」（`ENGINE_UNSUPPORTED_PLATFORM`），所以「下载 → 校验 → 解压 →
  安装 → 切换 `tailcatPath`」这条链路**只在离线假服务器的测试里跑过**；
  Windows / Linux 真机上的行为（路径、`tailcat.exe` 权限、杀软拦截等）未验证。
- **并发下载没有互斥**：后端没有「同一版本只允许一个下载」的锁，两次并发
  `engine_download` 会共用同一个 `<version>.part` 临时文件而互相破坏。界面侧
  已在下载中禁用按钮（`DownloadPanel` 的 `busy` 判断），但**后端本身没有防护**，
  也没有覆盖并发场景的测试。
- **Linux / Windows 平台行为未在本机验证**：本文的所有实测结论均来自
  macOS arm64。
- **文件传输只验证了顺利路径**：投递箱接收与只读共享目录取回的**顺利路径**已在
  单机端到端测试中跑通（见 §1.2），但同名文件、权限不足、磁盘空间不足等**错误
  路径**尚未实测，错误码映射（见 [`tailcat-cli.md`](tailcat-cli.md) §4）仍需用
  真实失败场景校准。
