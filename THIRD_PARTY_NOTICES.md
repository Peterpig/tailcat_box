# 第三方依赖与许可证声明

本文件列出 Tailcat Box 使用或调用的第三方组件及其许可证。

> **分发前提**：本项目**不内嵌、不修改、不分发 tailcat 的源码**，仅通过子进程
> 调用其官方发布的二进制文件（`tailcat`）。因此发布包必须同时满足两件事：
> 一是保留本文件与 `LICENSE`，二是按 BSD-3-Clause 的要求随包提供 tailcat
> 自己的 `LICENSE`（或指向官方发布页/仓库的等价说明）。

---

## 1. tailcat（核心网络引擎）

| 项 | 值 |
| --- | --- |
| 组件 | tailcat（CLI + Go 库） |
| 版权方 | Tailscale Inc. & contributors |
| 许可证 | BSD-3-Clause |
| 上游仓库 | <https://github.com/tailscale/tailcat> |
| 使用方式 | 作为独立子进程调用官方二进制，不链接、不内嵌源码 |
| 用途 | WireGuard®/magicsock 数据平面连接、`serve`/`socks`/`cp`/`ls`/`ssh`/`ping` 等能力 |
| 本机核对的版本 | v0.7.0（Homebrew 安装于 `/opt/homebrew/Cellar/tailcat/0.7.0/`） |

许可证文本来源：`/opt/homebrew/Cellar/tailcat/0.7.0/LICENSE`（Homebrew 安装包内
随附的上游许可证文件），与上游仓库 `LICENSE` 一致；下方引用的文本与当前安装的
v0.7.0 逐字一致。

### BSD 3-Clause License（tailcat）

```text
BSD 3-Clause License

Copyright (c) 2020 Tailscale Inc & contributors.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

> 说明：`tailcat` 内部依赖的 Tailscale 开源组件（magicsock、wireguard-go 等）由
> 上游以各自的 BSD-3-Clause 许可分发；本项目不分发这些源码，相关义务由
> tailcat 官方二进制的发布方承担。

---

## 2. 前端与桌面框架依赖

下表为本项目直接依赖的运行时组件。所有版本以 `package.json` 与
`pnpm-lock.yaml` 为准；完整传递依赖树见 `pnpm-lock.yaml`。

| 组件 | 许可证 | 用途 |
| --- | --- | --- |
| React | MIT | 前端 UI 运行时（组件模型、渲染） |
| Vite | MIT | 前端开发服务器与生产构建 |
| Tailwind CSS | MIT | 原子化样式与设计 Token 落地 |
| Radix UI（`@radix-ui/react-*`） | MIT | 无障碍基础组件（Dialog / Select / Tabs / Switch / Tooltip / Dropdown / ScrollArea / Separator / Label / Popover / Slot） |
| Lucide（`lucide-react`） | ISC | 图标集 |
| Zustand | MIT | 前端状态管理（`src/store/app.ts`） |
| `class-variance-authority` | Apache-2.0 | 组件 variant / size 定义 |
| `clsx` / `tailwind-merge` | MIT | `className` 条件合并与去重 |
| Inter | OFL-1.1 | 界面字体（`@fontsource-variable/inter`） |
| JetBrains Mono | OFL-1.1 | 等宽/代码字体（`@fontsource-variable/jetbrains-mono`） |
| Tauri（`@tauri-apps/api` 及插件 `dialog`/`clipboard-manager`/`opener`/`os`/`log`） | MIT 或 Apache-2.0（双许可，二选一） | 桌面外壳、IPC、系统集成 |

### Rust 侧依赖（`src-tauri/Cargo.toml`）

| 组件 | 许可证 | 用途 |
| --- | --- | --- |
| tauri / tauri-build / tauri-plugin-* | MIT 或 Apache-2.0 | 桌面外壳与插件 |
| tokio | MIT | 异步运行时、进程与 I/O |
| serde / serde_json | MIT 或 Apache-2.0 | IPC 数据的序列化与反序列化 |
| uuid | Apache-2.0 或 MIT | 任务唯一 ID |
| thiserror | MIT 或 Apache-2.0 | 错误类型派生 |
| dirs | MIT 或 Apache-2.0 | 平台配置/日志目录 |
| regex | MIT | CLI 输出解析 |
| once_cell | MIT 或 Apache-2.0 | 全局初始化 |
| log | MIT 或 Apache-2.0 | 日志门面 |
| chrono | MIT | 时间戳 |
| libc（仅 Unix） | MIT 或 Apache-2.0 | 进程信号处理 |
| reqwest 0.12.28 | MIT 或 Apache-2.0 | HTTP 客户端（`rustls-tls` / `stream` / `json` feature），取官方 Release 元数据、`checksums.txt` 与产物 |
| sha2 0.10.9 | MIT 或 Apache-2.0 | 下载产物的 SHA256 计算与比对 |
| flate2 1.1.10 | MIT 或 Apache-2.0 | Linux `tar.gz` 产物解压 |
| tar 0.4.46 | MIT 或 Apache-2.0 | Linux `tar.gz` 归档读取 |
| zip 5.1.1 | MIT | Windows `.zip` 产物解压 |
| futures-util 0.3.34 | MIT 或 Apache-2.0 | 流式读取下载响应体 |

上述许可证字段取自各 crate 源码里的 `Cargo.toml`（本机
`~/.cargo/registry/src/index.crates.io-*/` 下核对），并与其随附的 `LICENSE-*`
文件一致。TLS 通过 reqwest 的 `rustls-tls` feature 走 **rustls**（纯 Rust 实现），
因此下载链路不依赖系统 OpenSSL。

#### Rust 传递依赖：引擎下载子树

下面列出**因引擎下载而新增**的传递依赖（版本与许可证以 `src-tauri/Cargo.lock`
与各 crate 的 `Cargo.toml` 核对；`cargo tree -p <pkg>` 得到子树范围）。
除下文列出的之外，其余 crate 在引擎下载之前就已随 tokio / serde / tauri 进入
依赖图。

| 类别 | 组件（版本） | 许可证 |
| --- | --- | --- |
| HTTP 栈 | reqwest 依赖的 hyper 1.12.0、hyper-util 0.1.21、hyper-rustls 0.27.10、http 1.5.0、http-body 1.1.0、http-body-util 0.1.5、httparse 1.10.1、bytes 1.12.1、tower 0.5.3、tower-http 0.6.11、tower-service 0.3.3、tower-layer 0.3.3、tracing 0.1.44、tracing-core 0.1.36、want 0.3.2、try-lock 0.2.5、mio 1.2.4、socket2 0.6.5、slab 0.4.12、signal-hook-registry 1.4.8、atomic-waker 1.1.2、sync_wrapper 1.0.2、mime 0.3.17 | MIT 或 Apache-2.0（http-body / http-body-util / hyper / hyper-util / tower 系列为 MIT；sync_wrapper 为 Apache-2.0） |
| TLS（rustls） | rustls 0.23.45、rustls-pki-types 1.15.1、rustls-webpki 0.103.15、tokio-rustls 0.26.6、untrusted 0.9.0、ring 0.17.14、subtle 2.6.1、webpki-roots 1.0.9 | rustls / rustls-pki-types / tokio-rustls 为 Apache-2.0 或 MIT；rustls-webpki 与 untrusted 为 ISC；ring 为 Apache-2.0 **且** ISC；subtle 为 BSD-3-Clause；webpki-roots 为 CDLA-Permissive-2.0 |
| 哈希 / 校验 | sha2 依赖的 digest 0.10.7、block-buffer 0.10.4、crypto-common 0.1.7、generic-array 0.14.7、typenum 1.20.1、subtle 2.6.1、zeroize 1.9.1 | MIT 或 Apache-2.0（subtle 为 BSD-3-Clause，见上） |
| 解压 | flate2 依赖的 crc32fast 1.5.2、miniz_oxide 0.9.1、adler2 2.0.1、simd-adler32 0.3.10、zlib-rs 0.6.8；zip 依赖的 zopfli 0.8.4；tar 依赖的 filetime 0.2.29、xattr 1.6.1 | MIT 或 Apache-2.0（miniz_oxide 为 MIT / Zlib / Apache-2.0；adler2 为 0BSD / MIT / Apache-2.0；zlib-rs 为 Zlib；zopfli 为 Apache-2.0） |
| 流式 / 工具 | futures-util 依赖的 futures-core 0.3.34、futures-task 0.3.34（及相关 futures-channel / futures-sink / futures-macro）；以及 base64 0.23.1、percent-encoding 2.3.2、form_urlencoded 1.2.2、idna 1.1.0 与 `idna_adapter` 的 icu 子树（icu_* / litemap / tinystr / writeable / yoke / zerofrom / zerotrie / zerovec 等）、libc 0.2.190、memchr 2.8.3、once_cell 1.21.4、cfg-if 1.0.5、getrandom 0.2.17 | MIT 或 Apache-2.0（memchr 为 Unlicense 或 MIT；icu 子树为 Unicode-3.0；unicode-ident 附带 Unicode-3.0 附加条款） |


> **几个非 MIT/Apache-2.0 的宽松许可证**（出现在上表这几个 crate 里）：
> `memchr` 为 Unlicense 或 MIT；`idna` 的 `idna_adapter` 依赖的 ICU 子树为
> Unicode-3.0；`unicode-ident` 为 MIT 且附带 Unicode-3.0 附加条款；
> `webpki-roots` 为 CDLA-Permissive-2.0；`subtle` 为 BSD-3-Clause；`ring` 为
> Apache-2.0 **与** ISC 双许可证。它们都允许再分发与商业使用，要求保留版权与
> 许可声明；分发安装包时需随附这些 crate 的许可证文本（可由 `cargo metadata` /
> `cargo about` 等工具汇总生成，见 §3 第 3 条）。

### 开发期依赖（不影响最终二进制）

| 组件 | 许可证 | 用途 |
| --- | --- | --- |
| TypeScript | Apache-2.0 | 类型检查与编译期约束 |
| Vitest | MIT | 单元/组件测试运行器 |
| Testing Library（`@testing-library/*`） | MIT | 组件行为测试 |
| jsdom | MIT | 测试环境 DOM 实现 |
| `@tauri-apps/cli` | MIT 或 Apache-2.0（双许可，二选一） | Tauri 构建与打包 CLI |
| `@vitejs/plugin-react` / `@tailwindcss/vite` | MIT | Vite 插件 |

---

## 3. 许可证合规说明

1. 本应用自身以 **MIT** 许可发布，见 `LICENSE`。
2. tailcat 以 **BSD-3-Clause** 分发；本项目仅调用其二进制，不声称对其拥有任何
   版权，也不使用 Tailscale 的名称做背书（BSD-3-Clause 第 3 条）。
3. Inter 与 JetBrains Mono 采用 **SIL Open Font License 1.1**，允许随应用打包
   并在界面中嵌入使用；不得单独售卖字体文件。
4. 若未来改为**随应用分发** tailcat 二进制（而非依赖用户已安装的版本），
   必须在安装包内附带上游 `LICENSE` 文件，并在发布说明中标注所分发的
   tailcat 版本号与下载来源（含校验信息）。
5. **引擎下载只取官方产物，不改写、不再分发**：`engine_download` 从官方
   GitHub release 下载单个 `tailcat` / `tailcat.exe` 到**用户数据目录**，
   不写入安装包、不修改、不随应用再分发。因此它**不**引入新的分发义务；
   上述 4. 的 BSD-3-Clause 要求只在采用「随包分发」策略时才触发。下载得到的
   二进制仍属 tailcat 上游，需遵守其 BSD-3-Clause 许可。
6. 引擎下载依赖的 Rust crate（reqwest / sha2 / flate2 / tar / zip /
   futures-util 及其传递依赖）均为 MIT / Apache-2.0 / ISC / BSD-3-Clause /
   Unicode-3.0 等宽松许可，允许随二进制分发；需随包保留其许可证文本（见
   §2 的传递依赖表）。
7. 本项目不分发任何来自 tailcat 的源码副本，因此不产生源码级 copyleft 义务。

> 许可证字段核对（2026-10-14）：`package.json` 的 `license` 为 `MIT`，
> `src-tauri/Cargo.toml` 的 `license` 为 `MIT`，`LICENSE` 为 MIT 全文，三处
> **一致**。
