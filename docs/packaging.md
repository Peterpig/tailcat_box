# 打包与分发

本文说明如何为 macOS、Windows、Linux 构建 Tailcat Box 安装包，以及发布时必须
满足的许可证与合规要求。

> **现状提醒**：`src-tauri/` 工程（含 `Cargo.toml`、`build.rs`、`tauri.conf.json`、
> `capabilities/`、`icons/` 与 `src/` 下的 Rust 模块）已入库，
> `cargo fmt --all -- --check`、`cargo clippy --all-targets --all-features -- -D warnings`
> 与 `cargo test` **56 passed / 0 failed**（其中 4 个真实端到端测试默认自跳过，
> 但已在单机执行通过）均已通过。
> 本机**已实际产出** macOS（Apple Silicon）的 `.app` 与 `.dmg`（见 §3），但它们
> **未签名、未公证**，也**没有在干净机器上安装验证**；**Windows / Linux / ARM64
> 的产物仍未产出**——本文中所有非 macOS 的产物说法都属于**待验证的目标流程**，
> 必须按「需在对应平台或 CI 上构建验证」来理解，不得当作已验证。
> 见 [`limitations.md`](limitations.md) 与 [`ci.md`](ci.md)。
>
> ⚠️ **当前工作副本不是 git 仓库**（没有 `.git`）。`./scripts/build-all.sh`
> 可以照常运行，但仓库内已有的 `.github/workflows/{ci,release}.yml`（说明见
> [`ci.md`](ci.md)）需要在一个**真正的 git 仓库**、并推送到 GitHub 之后才会被
> 触发；这两个工作流**从未在真实 runner 上执行过**，本文**不声称**任何 CI 已经
> 跑通。

---

## 1. 构建入口

```sh
# 一键流水线（推荐）：平台检测 -> 依赖 -> 类型检查 -> 测试 -> 打包 -> 打印产物
./scripts/build-all.sh

# 跳过依赖安装 / 跳过测试 / debug 配置
./scripts/build-all.sh --skip-install
./scripts/build-all.sh --skip-tests
./scripts/build-all.sh --debug

# 环境自检
./scripts/check-env.sh

# 真实端到端验证（需联网 + tailcat >= v0.7.0；不参与默认 cargo test）
./scripts/e2e-verify.sh

# 任务停止 / 退出清理验证（离线部分默认即可跑，联网部分需 TAILCAT_E2E=1）
./scripts/cleanup-verify.sh

# 手动分步
pnpm install
pnpm run typecheck
pnpm run test
pnpm tauri:build
```

构建脚本**不交叉编译**：产物始终面向当前操作系统与架构。要产出三平台安装包，
需在各自平台上分别构建（或使用多平台 CI runner）。

---

## 2. 现有 Tauri 配置

`src-tauri/tauri.conf.json` 已确定以下内容（截至当前工作副本）：

| 字段 | 当前值 | 说明 |
| --- | --- | --- |
| `productName` | `Tailcat Box` | 安装包与应用名 |
| `identifier` | `dev.tailcat.box` | **确定后不可随意更改**：macOS 签名/公证与 Windows 升级路径都依赖它 |
| `version` | `0.1.0` | 与 `package.json` 的 `version` 一致 |
| `build.devUrl` | `http://localhost:1420` | 与 `vite.config.ts` 的固定端口一致 |
| `build.frontendDist` | `../dist` | Vite 构建输出 |
| `build.beforeDevCommand` / `beforeBuildCommand` | `pnpm dev` / `pnpm build` | 由 Tauri 自动调用 |
| `app.windows[0]` | 标题 `Tailcat Box`，1200×800，最小 940×620，居中 | 单窗口 `main` |
| `app.security.csp` | `default-src 'self'` 等 | 已显式声明 CSP；新增外部资源时需同步放宽 |
| `bundle.active` / `targets` | `true` / `all` | 生成该平台全部可用包型 |
| `bundle.icon` | `icons/32x32.png` 等 5 个文件 | ✅ 已生成并存在于 `src-tauri/icons/`，见 §4 |
| `bundle.resources` | `../THIRD_PARTY_NOTICES.md`、`../LICENSE` | ✅ 许可证已随包分发，见 §7 |
| `bundle.category` | `DeveloperTool` | |
| `bundle.copyright` | `Copyright (c) 2026 Tailcat Box contributors` | 与 `LICENSE` 一致 |
| `bundle.macOS.minimumSystemVersion` | `10.15` | |
| `bundle.windows.nsis.installMode` | `currentUser` | 按用户安装，不需要管理员权限 |
| `bundle.linux.deb.depends` | `[]` | 若采用策略 B（随包分发 tailcat），此处无需新增依赖 |

`src-tauri/capabilities/default.json` 声明了主窗口的最小权限集：
`core:default`、`core:event:default`、`core:window:default`、`dialog:default`、
`opener:default`、`clipboard-manager:default`、`os:default`、`log:default`。

**权限最小化**：Tauri 2 的能力（capabilities）必须按需声明。不要为了方便开启
任意路径读写或任意 shell 执行；本项目需要的能力只有文件选择器、剪贴板写入、
打开 URL/文件管理器，以及由**本项目自己的 Rust 命令**（而非 shell 插件）启动
`tailcat` 子进程。

---

## 3. 各平台产物

产物位于 `src-tauri/target/release/bundle/`：

| 平台 | 目标 | 路径 | 验证状态 |
| --- | --- | --- | --- |
| macOS | `dmg` | `src-tauri/target/release/bundle/dmg/*.dmg` | ✅ 已产出（Apple Silicon：`Tailcat Box_0.1.0_aarch64.dmg`，未签名 / 未公证）；Intel / universal 未产出 |
| macOS | `app` | `src-tauri/target/release/bundle/macos/*.app` | ✅ 已产出（Apple Silicon：`Tailcat Box.app`，未签名 / 未公证）；未在干净机器上安装验证 |
| Windows | `msi` | `src-tauri/target/release/bundle/msi/*.msi` | ❌ **未验证**；需在 Windows 或 CI 上构建验证 |
| Windows | `nsis` | `src-tauri/target/release/bundle/nsis/*.exe` | ❌ **未验证**；需在 Windows 或 CI 上构建验证 |
| Linux | `deb` | `src-tauri/target/release/bundle/deb/*.deb` | ❌ **未验证**；需在 Linux 或 CI 上构建验证 |
| Linux | `rpm` | `src-tauri/target/release/bundle/rpm/*.rpm` | ❌ **未验证**；需在 Linux 或 CI 上构建验证 |
| Linux | `appimage` | `src-tauri/target/release/bundle/appimage/*.AppImage` | ❌ **未验证**；需在 Linux 或 CI 上构建验证 |

`./scripts/build-all.sh` 会在构建结束后自动扫描上述目录并打印实际产物路径。

架构：至少覆盖 `x86_64` 与 `aarch64`/`arm64`。**本机只在 macOS arm64 上验证到
Rust 侧格式、lint、编译与测试（`cargo fmt --check`、`cargo clippy -D warnings`、
`cargo check --all-targets`、`cargo test`）**，并产出 **Apple Silicon** 的 `.app`
与 `.dmg`；Windows / Linux 的安装包、macOS 的 Intel（`x86_64-apple-darwin`）
产物、以及 macOS 通用二进制（universal，需要在配置中显式声明 target 组合）
都**未在本机产出或验证**，需在对应平台或 CI 上构建验证。

---

## 4. 图标

`tauri.conf.json` 的 `bundle.icon` 引用了 `icons/32x32.png`、`icons/128x128.png`、
`icons/128x128@2x.png`、`icons/icon.icns`、`icons/icon.ico`；这些文件**已存在**
于 `src-tauri/icons/`（该目录另含 Windows Store / iOS / Android 图标集）。

如需替换品牌图标，准备一份基础 PNG（建议 1024×1024，带透明通道）后运行：

```sh
pnpm tauri icon path/to/app-icon.png
```

生成的图标会写入 `src-tauri/icons/`。要求：深浅主题下都可辨识，不要依赖系统
独有字体，也不要把品牌色当作唯一识别手段。

---

## 5. 平台依赖

### macOS

- Xcode Command Line Tools：`xcode-select --install`
- 打包 DMG 由 Tauri 调用系统工具完成

### Linux

Debian/Ubuntu 命名：

```sh
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev \
  librsvg2-dev patchelf build-essential curl wget file
```

其他发行版请替换为对应包名（如 Fedora 的 `webkit2gtk4.1-devel`）。

### Windows

- WebView2 Runtime（Windows 10 1803+ 通常已内置）
- MSVC 生成工具链（Visual Studio Build Tools）
- WiX / NSIS 由 Tauri 在打包时按需准备
- 系统 OpenSSH（`cp` / `ssh` 能力依赖，见 `limitations.md`）

---

## 6. 签名与公证

### macOS

1. 使用 Developer ID Application 证书签名（Tauri 读取
   `APPLE_SIGNING_IDENTITY`）。
2. 公证（notarization）需要 Apple ID 凭据：

   ```sh
   export APPLE_ID="you@example.com"
   export APPLE_PASSWORD="app-specific-password"
   export APPLE_TEAM_ID="TEAMID"
   ```

3. 公证完成后对 DMG 执行 staple，使离线校验也能通过。

未签名/未公证的包在用户机器上会被 Gatekeeper 拦截，因此正式发布必须完成这两步。

### Windows

使用代码签名证书（`signtool` 或 Tauri 的证书配置）。未签名的安装包会触发
SmartScreen 警告。

### Linux

`.deb` / `.rpm` 可选 GPG 签名；`.AppImage` 可选内嵌签名。若通过发行版仓库分发，
请遵循对应发行版的打包规范。

**密钥管理**：签名证书与口令**不得**提交到仓库；在 CI 中使用加密 secret。

---

## 7. 许可证合规（发布前必做）

发布包**必须**包含：

1. `LICENSE` —— 本项目的 MIT 许可（版权行
   `Copyright (c) 2026 Tailcat Box contributors`）。
2. `THIRD_PARTY_NOTICES.md` —— 第三方依赖清单，内含 tailcat 的**完整**
   BSD-3-Clause 文本与字体许可说明。
3. 前端依赖的许可证：pnpm 的传递依赖树较大，建议在打包步骤生成一份
   依赖许可证汇总（例如遍历 `pnpm-lock.yaml` 收集各包的 LICENSE），随包附带。

### 关于 tailcat 二进制：两种分发策略

| 策略 | 做法 | 合规要求 |
| --- | --- | --- |
| **A. 不随包分发**（当前默认） | 要求用户自行安装 `tailcat`（如 `brew install tailcat`） | 只需在文档中说明依赖关系与最低版本；`THIRD_PARTY_NOTICES.md` 中的 BSD-3-Clause 文本用于说明调用关系 |
| **B. 随包分发** | 把对应平台的官方二进制放进 `bundle.resources`，由 `Settings.preferBundled` 优先使用 | **必须**在安装包内附带上游 `LICENSE` 文件，标注所分发的 tailcat 版本号、下载来源与校验信息；不得暗示 Tailscale 为本项目背书（BSD-3-Clause 第 3 条） |

除上述两种策略外，应用还提供**引擎下载**入口（`engine_download`）：它**不随包**
分发、也不执行任何脚本，只在用户点击后从官方 GitHub release 拉取产物，先按
`checksums.txt` 校验 SHA256，再解压安装到**用户数据目录**
（`<app 数据目录>/engine/<version>/`）。因此策略 A 下的合规义务不变；若未来
改用这个入口做**默认**分发方式（在安装包内预置二进制），则按策略 B 的要求补齐
`LICENSE`、版本号与校验信息。macOS 官方无产物，该入口在 macOS 上不可用。
见 `limitations.md` §4.2。

---

## 8. 版本与发布检查表

发布前逐项确认：

- [ ] `package.json` 的 `version`、`src-tauri/tauri.conf.json` 的 `version`、
      `Cargo.toml` 的 `version` 三处一致
- [x] `package.json` 的 `license` 字段为 `MIT`（已与 `LICENSE`、`Cargo.toml` 一致）
- [x] `pnpm run typecheck` 通过
- [x] `pnpm run test` 通过（10 文件 / 64 用例；`HomeScreen.test.tsx` 的时钟断言已改为冻结系统时间，复核时稳定通过）
- [x] `cargo fmt --all -- --check` 通过（无格式差异）
- [x] `cargo clippy --all-targets --all-features -- -D warnings` 通过（0 error / 0 warning）
- [x] `cargo test` 通过（`src-tauri/`：56 passed / 0 failed；4 个真实端到端测试默认自跳过，`TAILCAT_E2E=1` 时在单机执行通过；17 个引擎下载测试离线运行）
- [ ] 三平台安装包均已产出并**在干净机器上安装验证**过
      （本机已产出 macOS Apple Silicon 的 `.app` / `.dmg`（未签名 / 未公证，未在干净机器上安装验证）；
      Windows / Linux 与 macOS Intel 产物仍需在对应平台或 CI 上构建验证）
- [ ] 安装包内含 `LICENSE` 与 `THIRD_PARTY_NOTICES.md`
- [ ] 安装包能发起引擎下载所需的出站 https 请求（只到 `api.github.com` /
      `github.com` 等官方域名）；**未在真实 GitHub 上验证过**，见
      `limitations.md` §7
- [ ] 采用策略 B 时，另附 tailcat 的 `LICENSE` 与版本/校验信息
- [ ] 深色 / 浅色主题切换正常，六个页面均可用
- [ ] 关闭应用后没有残留的 `tailcat` 子进程与本地监听端口
- [ ] 没有伪造的连接状态、传输进度或测试结果

---

## 9. CI 流程

仓库里**已有**可用的工作流：`.github/workflows/ci.yml`（push / PR / 手动触发，
跑前端类型检查、单测、构建与后端格式 / lint / 单测）和
`.github/workflows/release.yml`（打 tag 后三平台打包并创建 draft Release）。
它们的触发条件、构建矩阵与产物位置见 [`ci.md`](ci.md)。

> 注意：这两个工作流**只做过 YAML 语法校验，从未在真实 GitHub runner 上执行过**
> （当前副本没有 `.git`，也没有远端）。下面这段是最初的目标流程描述，保留作为
> 设计参考：

```text
push / tag
   │
   ├─ job: frontend-checks   (pnpm install → typecheck → test)
   │
   └─ matrix: [macos-latest, windows-latest, ubuntu-latest]
         └─ ./scripts/build-all.sh --skip-install
               └─ 上传 src-tauri/target/release/bundle/** 为构建产物
```

签名凭据只在发布 tag 上注入；PR 构建不签名，仅验证「能构建」。
