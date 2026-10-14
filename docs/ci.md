# CI 与发布流水线

本文说明 Tailcat Box 的两个 GitHub Actions 工作流：`CI`（日常检查）与
`Release`（打包发布）。

> 状态说明：这两个工作流是在本地编写并做过 YAML 语法校验的，**尚未在真实的
> GitHub runner 上执行过**（仓库此前还没有 `.git`，也没有远端）。首次运行请到
> 仓库的 Actions 页面确认日志。

## 一、工作流总览

| 文件 | 名称 | 触发条件 | 作用 |
| --- | --- | --- | --- |
| `.github/workflows/ci.yml` | CI | push 到任意分支、pull_request、手动触发 | 前端类型检查 / 单测 / 构建，后端格式 / lint / 单测，以及 **macOS / Windows / Linux 三平台原生编译检查**（`cargo check`） |
| `.github/workflows/release.yml` | Release | push tag（`v0.1.0` 这类语义化版本）、手动触发 | 三平台打包，并创建 **draft** Release |

## 二、CI（`.github/workflows/ci.yml`）

### 触发条件

- `push` 到任意分支（tag 推送不触发，tag 由 Release 工作流负责）
- `pull_request`
- `workflow_dispatch`（Actions 页面手动运行）

同一分支上的重复推送会取消上一次未完成的运行（`concurrency` + `cancel-in-progress`）。

### Job 1：`frontend`（ubuntu-latest，超时 20 分钟）

1. `actions/checkout@v4`
2. `pnpm/action-setup@v4`（`run_install: false`，版本显式指定为主版本 10）
3. `actions/setup-node@v4`（Node 22，开启 `cache: pnpm`）
4. `pnpm install --frozen-lockfile`
5. `pnpm run typecheck`
6. `pnpm test`
7. `pnpm run build`

> pnpm 版本：`package.json` 里目前**没有** `packageManager` 字段，所以工作流里显式
> 写死了 pnpm 主版本 `10`。等以后补上 `packageManager` 字段，可以把 workflow 里的
> `version` 去掉，让 `pnpm/action-setup` 直接读取。

### Job 2：`backend`（ubuntu-22.04，超时 45 分钟）

1. `actions/checkout@v4`
2. pnpm + Node 22（用来先生成前端产物，原因见下）
3. `dtolnay/rust-toolchain@stable`（带 `clippy`、`rustfmt` 组件）
4. `Swatinem/rust-cache@v2`（`workspaces: "src-tauri -> target"`）
5. 安装 Linux 系统依赖（webkit2gtk、GTK、AppIndicator、librsvg、patchelf、libxdo、libssl 等）
6. `pnpm install --frozen-lockfile` → `pnpm run build`
7. `cargo fmt --all -- --check`（**阻塞**）
8. `cargo clippy --all-targets --all-features -- -D warnings`（**阻塞**）
9. `cargo test`（在 `src-tauri/` 下执行，**阻塞**）

为什么要先构建前端：Tauri 的 `generate_context!` 在编译期会读取
`build.frontendDist`（即 `../dist`），目录不存在时会直接 panic。所以 `cargo`
相关步骤之前必须先跑一次 `pnpm run build`。

关于 Rust 检查 —— 这几项现在都是**阻塞**的，且已在 macOS 开发机上本地验证通过：

- `cargo fmt --all -- --check`：已对全仓 Rust 代码跑过 `cargo fmt --all`，退出码为 0。
- `cargo clippy --all-targets --all-features -- -D warnings`：**0 error / 0 warning**。
  历史上曾有 6 个 error 级 lint（`clippy::too_many_arguments` 3 处、
  `clippy::field_reassign_with_default` 2 处、`clippy::incompatible_msrv` 1 处），现已全部修掉：
  - `too_many_arguments`：`src/tailcat/spec.rs` 里的 argv 构造器参数与 CLI flag 一一对应，
    聚合成结构体反而降低可读性，因此保留参数列表并加 `#[allow(clippy::too_many_arguments)]`
    与说明注释；
  - `field_reassign_with_default`：两处测试改为结构体字面量 + `..Default::default()`；
  - `incompatible_msrv`：`src/task/mod.rs` 用了 `Option::is_none_or`（需要 Rust 1.82），
    因此把 `src-tauri/Cargo.toml` 的 `rust-version` 提升到 `1.82`。Tauri 2 本身只要求
    `1.77.2`，`1.82` 是本项目自己的下限。
- `cargo check --all-targets`：**0 error / 0 warning**。
- `cargo test`：**56 passed / 0 failed**，其中 4 个是默认自跳过的端到端测试（见下）。
  普通 `cargo test` 在离线环境与 CI 中**不访问外网**；唯一的「网络」行为是 7 个
  引擎下载的离线集成测试会在 `127.0.0.1` 上绑定一个临时端口，由测试自己充当假
  Release 服务器（`src-tauri/src/engine_download_tests.rs`）。

### Job 3：`backend-platforms`（三平台原生编译检查，超时 45 分钟）

验收条件里有「macOS、Windows、Linux 均能构建」这一条。`backend` job 只在
ubuntu-22.04 上跑，也就是说 Linux 之外的平台只有在**打 tag 触发 Release** 时
才会暴露编译回归。`backend-platforms` 把这件事前移到每次 push / PR。

矩阵（`fail-fast: false`，某个平台失败不会中断其它平台）：

| Runner | Rust target | 说明 |
| --- | --- | --- |
| `ubuntu-22.04` | `x86_64-unknown-linux-gnu` | runner 宿主即该 target |
| `windows-latest` | `x86_64-pc-windows-msvc` | runner 宿主即该 target |
| `macos-latest` | `aarch64-apple-darwin` | `macos-latest` 是 Apple Silicon（arm64）宿主 |

每个矩阵项执行：

1. `actions/checkout@v4`
2. `dtolnay/rust-toolchain@stable`（`targets: ${{ matrix.target }}`）
3. `Swatinem/rust-cache@v2`（`workspaces: "src-tauri -> target"`）
4. 仅在 Linux 上安装系统依赖（与 `backend` job、`release.yml` 同一份清单：
   webkit2gtk、GTK、AppIndicator、librsvg、patchelf、libxdo、libssl 等）
5. 仅在 Windows 上做一次**防御性探测**：打印 `llvm-rc` / `rc.exe` 的实际路径，
   两者都找不到时才明确报错
6. `cargo check --target ${{ matrix.target }} --all-features`（在 `src-tauri/` 下执行）

**为什么是原生编译而不是交叉编译**：三个矩阵项的 target 恰好都等于对应 runner 的
宿主 target，所以不需要 sysroot、不需要 pkg-config 交叉配置，也不会出现
`scripts/cross-check.sh` 在 macOS 开发机上检查 Linux 目标时那种
「缺少 Linux sysroot 导致 GTK / WebKitGTK 的 `*-sys` crate 构建失败」的环境问题。

**Windows 的 `llvm-rc`**：Tauri 的构建脚本会用 `tauri-winres` 编译 `.rc` 资源与图标。
GitHub 的 `windows-latest` 镜像自带 LLVM，`llvm-rc` 一般在 PATH 上；原生 MSVC 构建
也可以使用 Windows SDK 的 `rc.exe`。本机是 macOS，无法确认 runner 镜像的 PATH 细节，
因此工作流里只做探测与提示（找到就打印路径，两个都找不到才报错），不做硬性假设。

**为什么这里不需要先生成前端产物**：`src-tauri/Cargo.toml` 目前**没有** `[features]`
段，`--all-features` 只会打开本包的 feature（等于没有），**不会**打开
`tauri/custom-protocol`。而 `tauri-macros` 里是
`dev: cfg!(not(feature = "custom-protocol"))`，即此时处于 dev 模式，编译期不会读取
`build.frontendDist`（`../dist`），所以没有 `dist/` 也能通过。
这与本机脚本 `scripts/cross-check.sh` 执行的是同一条命令。
如果以后给 `src-tauri` 加上 `custom-protocol` feature，需要在这个 job 里补上
`pnpm install --frozen-lockfile && pnpm run build`（`backend` job 里已有先例）。

#### 这个 job 覆盖什么、不覆盖什么

覆盖：

- 本项目的 Rust 代码与全部依赖，在 macOS / Windows / Linux **三个原生平台**上都能
  通过类型检查与编译（`cargo check`）。
- 目标平台专属的 `cfg` 分支（`cfg(windows)` / `cfg(unix)`）与平台专属依赖
  （`windows` / `webview2-com` / `tao` / `wry` 等）能被解析与编译。
- 每次 push / PR 都能发现「只在某个平台上编译不过」的回归，不必等到打 tag。

不覆盖（**不要**把这里的绿灯理解成「三平台已可交付」）：

- **不产出安装包**：没有 `.dmg` / `.msi` / NSIS `.exe` / `.deb` / `.rpm` / `.AppImage`。
- **不做链接**：`cargo check` 只做类型检查与元数据生成，链接期问题（缺少导入库、
  符号解析、Windows 的 `.lib` 导入库等）覆盖不到。
- **不做打包与签名**：没有 Tauri bundler、没有 `tauri build`、没有代码签名与公证。
- **不做安装与启动验证**：WebView2 / WebKitGTK 运行时依赖、装完能不能跑起来，
  都必须在真机或 runner 上人工验证。
- **不验证运行时行为**：界面渲染、真实网络功能、双机互通都不在这里。

也就是说，这个 job 只把「编译」这一步的跨平台回归前移了；**真正的安装包仍然由
`release.yml` 在各平台原生构建**（见本文第三节），安装与启动验证见本文第六节。

### 端到端验证（默认不参与 CI）

真实的端到端验证脚本有两个：`./scripts/e2e-verify.sh`（对应
`src-tauri/src/e2e.rs`）与 `./scripts/cleanup-verify.sh`（对应
`src-tauri/src/cleanup.rs`）。它们会启动真实的 `tailcat serve` / `forward` /
`recv` 子进程并依赖 DERP 中继联网，要求 **`tailcat >= v0.7.0`**。由于需要外网
且耗时，它们**默认不参与 CI**（只有显式设置 `TAILCAT_E2E=1` 时才会真正运行），
CI 中只跑不联网的 `cargo test`。

这两个文件里共有 **4 个**端到端测试，覆盖：本地端口转发（本地监听端口 → 远端
localhost 目标服务）、投递箱接收文件、只读共享目录列出并取回文件、停止任务后
本地监听端口释放。它们已在 **2026-10-14** 于本机（macOS arm64、tailcat v0.7.0）
以 `TAILCAT_E2E=1` 执行通过（16.4s，56 passed / 0 failed）。

但要注意：这 4 个测试都是**单机**场景（客户端与服务端同机，经 DERP 中继互联），
**不能**替代双机互通验收；`rw` / `wo` / `wo+` 共享模式、文件传输的错误路径，
以及 Windows / Linux 上的行为都**没有**端到端覆盖。

引擎下载（`engine_download`）是另一条路：它要访问真实 GitHub（`api.github.com` /
`github.com` / 官方资产跳转域名），而它的 17 个测试**默认离线**（在 `127.0.0.1` 上
自造假 Release 服务器）。因此 CI 里没有「真实 GitHub 下载」任务，默认 `cargo test`
已覆盖除真实网络之外的全部逻辑；真实 GitHub 链路、真实 302 重定向、官方真实产物的
解压形态都**未验证**（见 [`limitations.md`](limitations.md) §7）。若将来在 CI 中
加入真实下载冒烟测试，需要确认 runner 对这些域名可达。

## 三、Release（`.github/workflows/release.yml`）

### 触发条件

- `push` tag：`v[0-9]+.[0-9]+.[0-9]+`（如 `v0.1.0`）或
  `v[0-9]+.[0-9]+.[0-9]+-*`（如 `v0.2.0-rc.1`）。普通分支推送、`v2` 这类非语义化
  tag 都不会触发。
- `workflow_dispatch`：可手动填写 `tag`（留空则使用 `tauri.conf.json` 里的版本号，
  自动拼成 `v<版本>`），并用 `draft` 勾选框控制是否创建草稿 Release（默认勾选）。

权限为 `contents: write`（创建 Release 与上传产物需要）。同一个 tag 只会有一条
流水线在跑（`concurrency`），不会取消已在进行的构建。

### 构建矩阵

| Runner | Rust target | 产物类型 |
| --- | --- | --- |
| `macos-latest` | `aarch64-apple-darwin` | `.app`、`.dmg`（Apple Silicon） |
| `macos-latest` | `x86_64-apple-darwin` | `.app`、`.dmg`（Intel） |
| `ubuntu-22.04` | `x86_64-unknown-linux-gnu` | `.deb`、`.rpm`、`.AppImage` |
| `windows-latest` | `x86_64-pc-windows-msvc` | `.msi`、NSIS `.exe` |

矩阵设置了 `fail-fast: false`，某个平台失败不会中断其它平台。

关于 `bundle.targets`：`src-tauri/tauri.conf.json` 里是 `"all"`，而 `"all"` 会尝试
当前平台支持的**全部**产物类型，在不支持的平台上容易因为其中某一项而失败。
因此工作流通过 `tauri-action` 的 `args` 显式限定各平台产物：

- macOS：`--bundles app,dmg`
- Ubuntu：`--bundles deb,rpm,appimage`
- Windows：`--bundles msi,nsis`

配合 `--target <矩阵 target>` 使用。**没有修改** `tauri.conf.json` 本体。

### 产物名称与下载位置

产物有两个来源：

1. **GitHub Release 附件**：流水线会在 Release 页面（Draft 或已发布）上传安装包。
   文件名由 Tauri 生成，形如：
   - macOS：`Tailcat Box_0.1.0_aarch64.dmg`、`Tailcat Box.app`（打包进 dmg）
   - Linux：`tailcat-box_0.1.0_amd64.deb`、`tailcat-box-0.1.0-1.x86_64.rpm`、
     `tailcat-box_0.1.0_amd64.AppImage`
   - Windows：`Tailcat Box_0.1.0_x64_en-US.msi`、`Tailcat Box_0.1.0_x64-setup.exe`
2. **Actions 运行产物（Artifact）**：名为 `tailcat-box-<rust target>`，
   保留 **7 天**，在 Actions 运行页面底部的 Artifacts 区域下载。
   即使是不带 tag 的手动运行（`workflow_dispatch`），也能在这里拿到安装包。

> Release **默认是 draft（草稿）**：只有仓库维护者进入 Release 页面、检查产物无误后
> 点击 **Publish release**，普通用户才能看到并下载。手动触发时如果不勾选 `draft`，
> 流水线会直接发布 Release，请谨慎使用。

## 四、安装包签名状态（重要）

**当前所有产物都是未签名、未公证（unsigned / unnotarized）的构建。**

- **macOS**：没有 Apple Developer 证书签名，也没有做公证（notarization）。
  用户首次打开会看到「无法打开，因为 Apple 无法检查其是否包含恶意软件」。
  解决办法：
  - 在「访达」里 **右键（或按住 Control 点击）→ 打开 → 再点「打开」**；
  - 或者执行 `xattr -dr com.apple.quarantine "/Applications/Tailcat Box.app"` 之后再打开。
- **Windows**：没有代码签名证书，SmartScreen 会拦截并提示「Windows 已保护你的电脑」。
  需要点击「更多信息 → 仍要运行」。

如果将来要消除这些警告，需要配置 Apple 开发者证书 + 公证（`APPLE_CERTIFICATE`、
`APPLE_ID` 等 secrets）以及 Windows 代码签名证书，这些**目前都还没有配置**。

## 五、Linux 依赖与 AppImage 说明

构建机（Ubuntu 22.04）需要安装的系统依赖已在工作流中列出：
`libwebkit2gtk-4.1-dev`、`libgtk-3-dev`、`libayatana-appindicator3-dev`、
`librsvg2-dev`、`patchelf`、`libxdo-dev`、`libssl-dev`、`build-essential`、
`curl`、`wget`、`file`，另外为打 `.rpm` 额外安装了 `rpm`（提供 `rpmbuild`）。

使用端：

- `.deb`：`sudo apt install ./tailcat-box_0.1.0_amd64.deb`
  （`tauri.conf.json` 中 `bundle.linux.deb.depends` 为空数组，不会自动拉取依赖，
  目标机器需要自行具备 WebKitGTK 4.1 等运行时库）。
- `.rpm`：`sudo rpm -i tailcat-box-0.1.0-1.x86_64.rpm`（或 `dnf install`）。
- `.AppImage`：需要 FUSE。Ubuntu 22.04 上可 `sudo apt install libfuse2` 后
  `chmod +x tailcat-box_0.1.0_amd64.AppImage && ./tailcat-box_0.1.0_amd64.AppImage`；
  没有 FUSE 的环境可以用 `./tailcat-box_0.1.0_amd64.AppImage --appimage-extract` 解包后运行。

## 六、验证范围的如实说明

关于验收条件里的「macOS、Windows、Linux 均能构建」，准确的限定是：

- CI 新增的 `backend-platforms` job 会在三个原生 runner 上执行
  `cargo check --target <triple> --all-features`，它证明的是**代码在三个平台上都能
  通过编译（类型检查）**，**不**证明能产出安装包、能链接、能安装、能启动。
- 真正的安装包由 `release.yml` 在各平台原生构建，产物需要人工下载验证。
- 这两个结论目前都只是「工作流已写好并通过本地 YAML 校验」，**没有任何一次在真实
  runner 上跑过**；第一次跑之前，请不要把 CI 的绿灯当作已验证的结论。
- 开发机是 **macOS arm64**，**无法交叉验证 Windows 与 Linux 产物**。
  这两个平台的安装包必须在对应的 GitHub runner（或对应系统的真机 / 虚拟机）上
  下载并实际安装验证，本文不声称它们「已验证」。
- macOS 的 Intel（`x86_64-apple-darwin`）产物同样没有在 Intel 机器上验证过。
- 两个工作流（含 `backend-platforms`）都还没有在真实 runner 上跑过；
  本仓库此前没有 `.git`，也没有配置远端。
- `backend-platforms` 只覆盖 x86_64 Linux、x86_64 Windows 与 arm64 macOS
  三个原生目标；**Intel macOS（`x86_64-apple-darwin`）不在 CI 矩阵里**，
  它只在 `release.yml` 的打包矩阵中出现。

## 七、如何发布一个新版本

版本号在三处出现，必须保持一致：

1. `package.json` 的 `version`
2. `src-tauri/Cargo.toml` 的 `[package] version`
3. `src-tauri/tauri.conf.json` 的 `version`

步骤：

1. 修改上面三个文件的版本号，例如统一改成 `0.2.0`。
2. 本地验证：`pnpm install --frozen-lockfile && pnpm run typecheck && pnpm test && pnpm run build`，
   以及 `cd src-tauri && cargo fmt --all -- --check && cargo clippy --all-targets --all-features -- -D warnings && cargo test`。
   （想同时跑真实端到端测试时，再加 `TAILCAT_E2E=1`，见
   `./scripts/e2e-verify.sh` 与 `./scripts/cleanup-verify.sh`。）
3. 提交并推送到主分支，等 `CI` 工作流变绿（`frontend`、`backend`、
   `backend-platforms` 三个 job 全部通过）。
4. 打 tag 并推送：
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
5. 到仓库 **Actions → Release** 页面等待四个矩阵任务全部完成
   （约 20–40 分钟，macOS 的两次构建通常是耗时最长的）。
6. 到 **Releases** 页面找到这次生成的 **Draft**，逐个下载并检查产物：
   - macOS：`.dmg` 能挂载、`.app` 能启动（首次需右键打开）
   - Linux：`.deb` / `.rpm` / `.AppImage` 至少各装一个并启动
   - Windows：`.msi` 与 NSIS `.exe` 能安装并启动
   如果某个平台失败，修好代码后删除 tag 重新打（或用手动触发 `workflow_dispatch`
   并填入相同 tag）再跑一次。
7. 检查 `releaseBody` 里的说明是否与本次版本相符，确认无误后点击 **Publish release**。

补充：

- 只是想验证打包流程、不想发版时，直接在 Actions 页面手动运行 `Release`
  工作流即可：tag 留空会按当前版本号创建 draft Release，或者你可以在构建完成后
  只从 Artifacts 区域下载安装包。
- 发布前请确认 `THIRD_PARTY_NOTICES.md` 与 `LICENSE` 是最新的 —— 这两个文件会作为
  `bundle.resources` 被打进安装包。

## 八、本地跨平台编译验证（`scripts/cross-check.sh`）

验收条件里有「macOS、Windows、Linux 均能构建」这一条。开发机是 **macOS arm64**，
产出不了 Windows / Linux 的安装包，但可以用 `cargo check --target <triple>` 证明
**Rust 后端（含 Tauri 2 与全部依赖）在这些目标平台上能通过类型检查与编译**。
`scripts/cross-check.sh` 就是把这件事固定下来的可重复脚本。

### 用法

```bash
# 一次性前置：安装目标平台的标准库（需要联网）
rustup target add x86_64-pc-windows-msvc x86_64-unknown-linux-gnu x86_64-apple-darwin

# 检查全部三个目标（也可以 --target <triple> 只检查一个，可重复传）
./scripts/cross-check.sh
```

脚本在 `src-tauri/` 下对每个目标执行
`cargo check --target <triple> --all-features`，完整日志写到
`src-tauri/target/cross-check-logs/<triple>.log`，最后打印汇总表。

| 退出码 | 含义 |
| --- | --- |
| 0 | 全部目标检查通过 |
| 1 | 至少一个目标因代码 / 依赖问题失败 |
| 2 | 参数错误 |
| 3 | 工具链或目标缺失（`rustup target add` 未装），检查未执行 |
| 4 | 未发现代码问题，但有目标因本机缺少交叉编译系统库 / 工具而失败 |

### 本机实测结果（2026-10-14，macOS arm64，rustc 1.99.0）

| 目标 | 结果 | 说明 |
| --- | --- | --- |
| `x86_64-apple-darwin` | 通过 | 261 个 crate（本项目 lib 与全部依赖）通过类型检查 |
| `x86_64-pc-windows-msvc` | 通过 | 本项目 lib 与 Windows 专属依赖（`windows`、`webview2-com-sys`、`tao`、`wry` 等）均通过 |
| `x86_64-unknown-linux-gnu` | 失败（环境缺失） | 失败发生在 GTK / WebKitGTK 的 `*-sys` crate 构建脚本，不是本项目代码 |

细节：

- **Windows 目标需要 `llvm-rc`**：Tauri 的构建脚本用 `tauri-winres` 编译 `.rc`
  资源，交叉编译时它会在 PATH 里找 `llvm-rc`。Homebrew 装的 llvm 默认不链接到
  PATH，脚本会自动尝试 `/opt/homebrew/opt/llvm/bin`、`/usr/local/opt/llvm/bin`
  以及 `brew --prefix llvm`，找不到时打印安装提示。
  另外，该目标下编译本项目 lib 会出现 2 个 `unused variable: pid` 警告
  （`src-tauri/src/task/mod.rs` 中 `pid` 只在 `cfg(unix)` 分支被使用）。只是警告，
  不影响检查通过，这里如实记录。
- **Linux 目标失败于依赖的系统库**：`glib-sys`、`gobject-sys`、`gio-sys`、
  `gdk-sys`、`gdk-pixbuf-sys`、`pango-sys`、`atk-sys`、`cairo-sys-rs` 的构建脚本
  都报 `pkg-config has not been configured to support cross-compilation`：本机没有
  Linux sysroot，pkg-config 无法交叉查询 `webkit2gtk-4.1`、`gtk+-3.0` 等 `.pc`
  文件。这是**交叉编译环境缺失系统库**，不是代码问题。相应地，
  **该目标下本项目自己的 crate 没有被类型检查到**（依赖先失败了），所以脚本对
  Linux 只给出「未发现代码问题」，而不是「通过」。

### 这个脚本验证了什么

- 本项目的 Rust 代码与全部依赖对目标平台能通过类型检查（`cargo check`）。
- 目标平台专属的 `cfg` 分支（`cfg(windows)`、`cfg(unix)`）能被编译。
- 目标平台专属的依赖（`windows` / `webview2-com` / `tao` / `wry` 等）能解析并编译。

### 这个脚本**不**验证什么

- **不产出安装包**：没有 `.dmg` / `.msi` / `.exe` / `.deb` / `.rpm` / `.AppImage`；
  `cargo check` 也不做链接，因此链接期问题（例如缺少导入库、符号解析）覆盖不到。
- **不替代目标平台的真机构建**：真正的打包、签名、WebView2 / WebKitGTK 运行时
  依赖、安装与启动必须在 Windows / Linux 真机或 GitHub runner 上验证，见
  `.github/workflows/release.yml` 与本文「六、验证范围的如实说明」。
- 不验证 Linux 上的链接与 GTK / WebKitGTK 版本兼容性（本机连依赖编译都没跑通）。
- 不验证运行时行为、界面渲染与真实网络功能。

补充：脚本需要联网（首次为某个目标拉取平台专属依赖），后续有缓存时离线即可。

CI 里也有对应的检查：`.github/workflows/ci.yml` 的 `backend-platforms` job 在三个
**原生** runner 上执行同一条 `cargo check --target <triple> --all-features`
（见本文第二节「Job 3：`backend-platforms`」）。区别在于 CI 上每个 runner 就是
目标平台本身，所以不存在本机交叉编译时那种「缺少 sysroot / pkg-config 交叉配置」
的环境缺失，Linux 与 Windows 目标也能真正跑到通过。
