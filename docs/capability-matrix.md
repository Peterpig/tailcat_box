# 能力矩阵

本表逐一列出 tailcat CLI 的每个子命令与服务，标注 Tailcat Box 的实现状态、
实现方式与限制。

**状态图例**

| 标记 | 含义 |
| --- | --- |
| ✅ | 代码已实现（前端 + Rust 后端均已落地；真实网络端到端验收情况见下方提醒） |
| 🟡 | 部分实现：契约/界面已就绪，但后端调用尚未落地 |
| ❌ | 未实现，界面必须隐藏或禁用并说明原因 |
| ⛔ | 经实测**不可用**或**被有意排除**，不作为实现路径 |

> **全局状态提醒**：前端（`src/features/**`）与 Rust 后端（`src-tauri/src/**`）
> 均已落地。Rust 侧包含 `lib.rs` / `main.rs`（入口与命令注册）、`commands.rs`
> （命令面）、`config.rs`（设置与历史持久化）、`engine.rs`（引擎探测）、
> `engine_download.rs`（官方引擎下载 / 校验 / 安装，见 §5）、
> `system.rs`（系统集成）、`tailcat/`（CLI 适配层）、`task/`（任务注册表、凭据脱敏）
> 与 `e2e.rs` / `cleanup.rs`（默认自跳过的真实端到端测试）；`cargo fmt --all -- --check`、
> `cargo clippy --all-targets --all-features -- -D warnings` 与 `cargo check --all-targets`
> 均通过（0 error / 0 warning），`cargo test` **56 passed / 0 failed**（其中 4 个真实
> 端到端测试默认自跳过，17 个引擎下载测试离线运行）。因此下表中依赖真实进程的行
> 已按实现情况标记为 ✅。
>
> **但 ✅ 只表示「代码已实现」，不表示「已在真实网络上验收通过」**：真实双机
> 端到端验收尚未执行；`e2e.rs`（3 个）与 `cleanup.rs`（1 个）里的端到端测试
> 已在单机执行通过，覆盖本地端口转发、投递箱接收文件、只读共享目录取回文件、
> 停止任务后端口释放，但**都是单机场景**，不含双机互通，也不含 `rw` / `wo` /
> `wo+` 共享模式；前端测试 10 个文件 / 64 个用例全部通过（复核时，
> `HomeScreen.test.tsx` 的时钟断言已改为在用例内冻结系统时间，不再是时序抖动）。
> 引擎下载同理：**离线假服务器**跑通了完整链路，但没有对真实 GitHub 验证过
> （见 [`limitations.md`](limitations.md) §7）。
> 详见 [`limitations.md`](limitations.md)。
>
> **tailcat 版本**：本表依据 **v0.7.0**（2026-10-14 实测）。v0.7.0 新增
> `forward` / `browse` 子命令、`--psk` 标志、`wo+` 文件模式与 `ssh` / `exec`
> 服务，并修好了 `ping`。

---

## 1. 子命令

| 子命令 | 本项目是否实现 | 实现方式 | 限制 |
| --- | --- | --- | --- |
| `serve` | ✅ 已实现 | `argv = ["serve","--json",<flags>,<targets>]`；解析 stdout `{"listenAddr":…}`，兜底解析 stderr 的 `new address:` 行与 `TAILCAT_ADDR_FILE` | 常驻进程；无参数时只接受一个连接，本项目始终显式给 target；flag 必须在端口参数之前；默认 `--psk=true`（见 §4） |
| `recv` | ✅ 已实现 | `argv = ["recv", "--json", <dir>]`，等价 `serve --files=<dir>:wo files`；`--json` 为顶层标志，`recv` 同样接受（stdout 输出 `{"listenAddr":…}`），并可用 stderr / `TAILCAT_ADDR_FILE` 兜底 | `wo`（扁平只写投递箱）语义（不能列目录/读回/覆盖）必须如实说明；需要递归投递箱请改用 `serve --files=…:wo+` |
| `cp` | ✅ 已实现（发送方向） | `argv = ["cp", "-r?", "-p?", <src>…, "<addrblob>:<path>"]` | 实际由**系统 `scp`** 执行；进度只来自 scp stderr，无进度就显示 `—`；Windows 依赖系统 OpenSSH。**取回方向**（`<addrblob>:<path>` 在前）的 `spec::cp_fetch_spec()` 已有端到端测试，但尚未接入任务类型与界面 |
| `ls` | ✅ 已实现 | `argv = ["ls", "-l", "<addrblob>[:path]"]`，直接讲 SFTP | 字段缺失时置 `null` 显示 `—`；不依赖系统 ssh/sftp |
| `forward` | ✅ 已实现 | `argv = ["forward", "--bind=<host>", "<addrblob>", "<local>:<remote>"]`，由 CLI 自己持有监听；真实端口取自 stderr 的 `# forwarding <host>:<port> -> remote …`（`parse_forward_line()`） | **v0.7.0 原生**；映射必须写成 `local:remote`（`0` 单端口写法会被拒绝）；要求服务端已 `serve` 该远端端口 |
| `browse` | ✅ 已实现 | `argv = ["browse", "<addrblob>"]`，等价 `forward --open-browser <addrblob> 0:80` | 仅针对对端 80 端口；用于「一键打开浏览器」 |
| `socks` | ⛔ 本项目不使用 | CLI 带 `<cmd>` 时可在 `<cmd>` 生命周期内提供 SOCKS5 代理 | **本项目不使用该模式**：本地转发改用官方 `forward` 子命令；Rust 侧 `Socks` 任务一律返回 `UNSUPPORTED`，界面不得显示为已支持 |
| `ssh` | ❌ 未实现（仅记录） | 不实现内嵌 SSH 客户端 | `tailcat ssh` 会 exec 系统 `ssh`，依赖用户机器有 OpenSSH；`SshRequest` 保留在契约中，但界面不得显示为已支持 |
| `ping` | ✅ 已实现 | `argv = ["ping", "--timeout=<n>s", "<addrblob>"]`，解析 pong 行 → rtt / direct | **v0.7.0 实测正常**（`pong in 150.69ms via DERP(tok)`，退出码 0）；`--until-direct` 超时无直连时非 0 退出属预期探测结果，不是「无法连接」 |
| `parse` | ✅ 已实现 | `argv = ["parse", <blob>]`，解析 JSON 的 `ServerPublic`/`ServerDiscoPublic`/`RegionID` | 这是地址合法性的**权威判定**；失败 → `ADDRESS_INVALID`；v0.7.0 新增 `PresharedKey` 等未知键**安全忽略**，不写入契约 |
| `resolve` | ✅ 已实现 | `argv = ["resolve", <blob>]`，输出自包含长令牌 | 需要拉取 DERP map；失败 → `ADDRESS_UNRESOLVED` |
| `genkey` | ✅ 已实现 | `["genkey","--key=<name>",…]` / `["genkey","--list"]` / `["genkey","--delete","--key=<name>"]` / `["genkey","--region=list"]` | `--force` 会永久失效旧令牌，必须二次确认；`--list` 无密钥时无输出且退出码 0，属正常；密钥名受限（`validateKeyName`）；默认 `--psk=true`（见 §4） |
| `printpub` | ✅ 已实现 | `argv = ["printpub"]`，输出 `nodekey:…` | 用于填写服务端 `--allow` 白名单 |
| `version` | ✅ 已实现 | `argv = ["version"]`，输出形如 `v0.7.0` → 去掉前导 `v` | 失败 → `ENGINE_VERSION_FAILED` |
| `readme` | ❌ 不实现 | 未在界面中提供「查看官方 README」入口 | 输出很长，且与本项目文档重复；仅在适配层保留可能性 |
| `serve`（无参数隐式模式） | ⛔ 有意排除 | 等价于接受**一个**连接后退出 | 与「常驻监听」的用户预期不符，本项目不使用 |

---

## 2. `serve` 服务名

| 服务名 | 本项目是否实现 | 实现方式 | 限制 |
| --- | --- | --- | --- |
| `files` | ✅ 已实现（文件共享页） | `serve --files=<dir>:<mode> files`；`mode` ∈ `ro`(默认) / `rw` / `wo`（扁平只写）/ `wo+`（递归只写） | `rw`/`wo`/`wo+` 必须显式确认并提示风险；目录访问边界由 tailcat 的 `os.Root` 保证，本项目不绕过 |
| `no-auth-ssh` | ❌ 未实现 | 未在界面暴露 | 提供无密码/无公钥的 SSH 服务，风险较高；需先完成 `ssh` 集成设计 |
| `ssh` | ❌ 未实现 | 未在界面暴露 | 需要 `--ssh-authorized-keys`（authorized_keys 路径 / 字面公钥 / `alice@github`）；与「内嵌 SSH 客户端」是两回事，见 §1 的 `ssh` 行 |
| `exit-node` | ❌ 未实现 | 未在界面暴露 | 会让对端访问本机整个网络，属高暴露能力，需要独立设计与明确授权 |
| `all` | ❌ 未实现 | 未在界面暴露 | 「暴露全部端口」风险极高，不作为一键选项提供 |
| `exec` | ❌ 未实现 | 未在界面暴露 | 在 `--` 后给出命令，对每个连接以其为 stdin/stdout 运行（类似 inetd）；等于对端可在本机执行任意命令，风险极高，不作为一键选项 |

---

## 3. 端口 / 范围参数

| 形态 | 本项目是否实现 | 说明 |
| --- | --- | --- |
| 单个端口 `8080` | ✅ 已实现 | `validateServeTarget` 校验 1-65535 |
| 端口范围 `8000-8010` | ✅ 已实现 | 校验起止顺序与范围 |
| 逗号/空格分隔的多目标 | ✅ 已实现 | `parseServeTargets` 拆分后逐个校验 |
| 本地监听端口 `0` | ✅ 已实现 | 仅对**本地**监听有效，系统分配后必须回填真实端口到 `listenAddr` |

---

## 4. 全局标志与环境变量

| 项 | 本项目是否实现 | 用途 / 限制 |
| --- | --- | --- |
| `--json` | ✅ 已实现 | `serve` 时优先使用：stdout 输出单行 `{"listenAddr":"tc…"}` |
| `--derpmap-url` | ✅ 已实现 | 对应 `Settings.derpMapUrl`；默认使用官方 `https://tailcat.dev/derpmap.json`（有速率限制、无 SLA） |
| `--key` | ✅ 已实现 | `Settings`/任务级密钥名；`new` 表示临时密钥 |
| `--allow` | ✅ 已实现 | 逗号分隔公钥白名单或 `none`；空表示允许所有客户端 |
| `--full-address` | ✅ 已实现 | 输出内嵌 DERP 节点的长令牌，连接更快但更长 |
| `--psk <bool>` | ✅ 已实现 | `serve` / `genkey` 均有，**默认 `true`**：地址纳入 WireGuard 预共享密钥。`false` 才兼容 ≤ v0.5.0 的客户端，但更弱。见 §1 与 [`tailcat-cli.md`](tailcat-cli.md) §3.14 |
| `--ssh-authorized-keys` | ❌ 未实现 | 仅 `ssh` 服务需要；本应用不暴露 `ssh` 服务 |
| `--bind <addr>` | ✅ 已实现 | `forward` 的本地监听地址，默认 `127.0.0.1`；其他网卡需用户主动开启 |
| `--open-browser` | ✅ 已实现 | `forward` 选项，就绪后打开浏览器；`browse` 是其封装 |
| `--verbose` | ❌ 未实现 | 仅作为诊断开关保留可能性 |
| `TAILCAT_ADDR_FILE` | ✅ 已实现 | 把地址写入文件或 `tcp:host:port`；作为与终端渲染无关的稳定解析通道 |
| `TAILCAT_DERPMAP_URL` | ✅ 已实现 | 环境变量形式的默认 DERP map URL，等价于 `--derpmap-url` |

---

## 5. 本项目自有能力（非 tailcat 子命令）

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| 引擎检测 / 路径与版本 | ✅ 已实现 | `bundled` / `path` / `custom` / `missing` 四种来源 |
| 密钥管理（列出/生成/删除） | ✅ 已实现 | 见 `genkey` 行 |
| 本地端口转发 | ✅ 已实现 | 由 CLI 的 `forward` 子命令持有监听（`spec::forward_spec()`），动态端口从 stderr 解析 |
| 任务生命周期管理（启动/停止/移除/全部停止） | ✅ 已实现 | `TaskInfo` 含唯一 ID、状态、PID、启动时间、参数摘要、退出原因 |
| 任务日志（stdout/stderr/app 分流） | ✅ 已实现 | 增量拉取 + 事件推送；凭据已脱敏 |
| 设置持久化与导入导出 | ✅ 已实现 | `settings_get/update/reset/export/import` |
| 历史记录管理 | ✅ 已实现 | 备注、删除、清空；条数上限 `historyLimit` |
| 主题（浅色/深色/跟随系统） | ✅ 已实现 | `data-theme` 驱动，`localStorage` 记忆 |
| 国际化（zh-CN / en） | ✅ 已实现 | 模块级 `registerMessages` + `useT()` |
| 界面外壳与组件库 | ✅ 已实现 | 侧边栏 6 个路由、`Cmd/Ctrl+1..6`、25 个基础组件 |
| 六个功能页面 | ✅ 已实现 | `src/features/{home,connections,forwards,transfer,share,settings}`，含 `messages.ts` 与 `__tests__/` |
| 引擎面板与密钥管理界面 | ✅ 已实现 | `src/features/engine/{EnginePanel,KeyManager}.tsx` |
| 浏览器预览后端 | ✅ 已实现（仅开发期） | 内存假后端 + 常驻警告横幅；不产生真实流量 |
| Rust 错误模型 | ✅ 已落地 | `src-tauri/src/error.rs`：`AppError` + 27 个错误码常量 + `classify_stderr()`；新增 `ENGINE_UNSUPPORTED_PLATFORM` / `ENGINE_DOWNLOAD_FAILED` / `ENGINE_CHECKSUM_MISMATCH`（见 §5 引擎下载行与 [`tailcat-cli.md`](tailcat-cli.md) §4.2） |
| Rust 数据模型 | ✅ 已落地 | `src-tauri/src/model.rs`：与 `src/lib/types.ts` 一一对应的 serde 结构 |
| Rust 进程/任务/引擎/配置模块 | ✅ 已落地 | `lib.rs` / `main.rs` / `commands.rs` / `config.rs` / `engine.rs` / `engine_download.rs` / `system.rs` / `tailcat/` / `task/` / `e2e.rs` / `cleanup.rs`；`cargo fmt` / `cargo clippy -D warnings` / `cargo test`（56 passed）均通过 |
| 应用图标 | ✅ 已生成 | `src-tauri/icons/` 已由 `tauri icon` 生成，`tauri.conf.json` 引用的 5 个图标文件均存在 |
| 引擎下载 / 安装（官方产物） | ✅ 已实现（Windows / Linux；**macOS 不支持**） | 命令 `engine_download_info`（只查询）与 `engine_download`（执行）+ 事件 `tailcat://engine-download`：从官方 GitHub release 取资产与 `checksums.txt`，**校验 SHA256 后**才解压安装到 `<app 数据目录>/engine/<version>/`，并把 `Settings.tailcatPath` 指过去；只接受 https + 官方域名（**每一跳重定向都复检**）；校验不通过即中止（`ENGINE_CHECKSUM_MISMATCH`，无「跳过校验」开关）；解压拒绝路径穿越（`PATH_TRAVERSAL`）；全程不经 shell、不执行任何脚本。**官方没有 macOS 产物**，macOS 返回 `ENGINE_UNSUPPORTED_PLATFORM` 并提示 `brew install tailcat`。真实 GitHub 链路、真实 302 与并发下载未验证，见 [`limitations.md`](limitations.md) §7 |
| 引擎下载界面入口 | ✅ 已实现 | `src/features/engine/DownloadPanel.tsx`（挂在 `EnginePanel` 内）：显示平台/架构/最新版本/资产名，不支持时隐藏按钮并复述后端原因，下载中禁用按钮，进度只来自 `tailcat://engine-download`（无 `Content-Length` 时不显示百分比） |
