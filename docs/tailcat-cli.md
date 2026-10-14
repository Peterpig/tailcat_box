# tailcat CLI 适配层

本文档描述 Tailcat Box 如何调用官方 `tailcat` CLI：使用哪些子命令与参数、
如何拼装参数数组、如何解析输出、以及如何把失败映射为
`UserFacingError.code`。

> **事实来源**：`tailcat --help`、`tailcat readme`、`tailcat <cmd> --help`
> 以及在本机（macOS arm64，Homebrew，`tailcat` **v0.7.0**）于 **2026-10-14**
> 的实际运行结果。
> 与 [`development-conventions.md`](development-conventions.md) 第 5 节保持一致。
> **不得假设未列出的参数。**
>
> ⚠️ **最低版本**：本文描述的是 **v0.7.0** 的 CLI。v0.7.0 新增了 `forward` /
> `browse` 子命令、`--psk` 标志、`wo+` 文件模式与 `ssh` / `exec` 服务，并修好了
> `ping`；使用更早的版本时这些能力不存在。发布前请用实际分发的版本重新核对
> 参数与输出格式。

---

## 1. 调用总原则

1. **参数数组**：一律以 argv 数组启动子进程（Rust `Command::new(bin).args([...])`），
   **禁止**拼接 shell 字符串，也禁止把用户输入交给 `sh -c`。
2. **标志在位置参数之前**：tailcat 的 flag 解析要求 `serve` 的 `--allow` /
   `--files` / `--full-address` / `--psk` 等必须写在端口与服务名**之前**。
3. **地址令牌区分大小写**：任何大小写归一化都会破坏令牌，必须原样透传。
4. **不解析未知输出**：只依赖下表列出的稳定格式；其余输出一律作为诊断文本
   原样保留在 `UserFacingError.detail` 或日志中。
5. **不伪造**：拿不到地址、进度、速率时显示 `—`，不得估算或补一个「好看」的值。
6. **凭据不入日志**：argv 摘要在写入 `TaskInfo.argsSummary` 前必须脱敏
   （地址令牌替换为占位符）。

---

## 2. 引擎探测

### 2.1 解析二进制路径

优先级由 `Settings.preferBundled` 与 `Settings.tailcatPath` 决定，结果写入
`EngineStatus.source`：

| `source` | 含义 |
| --- | --- |
| `bundled` | 随应用分发的二进制（`SystemInfo.bundledTailcatPath`） |
| `path` | 系统 `PATH` 中找到的 `tailcat` |
| `custom` | 用户在设置中显式指定的路径（`Settings.tailcatPath`） |
| `missing` | 均未找到 → `ENGINE_NOT_FOUND` |

### 2.2 读取版本

```text
argv: ["version"]
```

实测输出（stdout，单行）：`v0.7.0` → 去掉前导 `v` 写入
`EngineStatus.version`。执行失败 → `ENGINE_VERSION_FAILED`。

### 2.3 读取密钥状态

```text
argv: ["genkey", "--list"]
```

实测：**没有任何已保存密钥时输出为空且退出码为 0**，因此「无输出」是正常状态，
不能当作错误。每行一个密钥名，据此填充 `EngineStatus.savedKeys`，并据此判定
`hasDefaultKey`（存在 `default`）与 `hasClientKey`（存在 `client-default`）。

密钥目录为 `$CONFIG/tailcat/keys`；macOS 实测为
`~/Library/Application Support/tailcat/keys/<name>.private.json`，写入
`EngineStatus.keysDir`。

---

## 3. 各子命令的调用与解析

### 3.1 `serve` — 监听服务 / 目录共享

```text
argv: ["serve", "--json", <flags...>, <targets...>]

  flags:   --key <name|new>
           --allow <list|none>
           --files <dir[:ro|:rw|:wo|:wo+]>
           --ssh-authorized-keys <keys>     （仅 ssh 服务需要）
           --psk <bool>                     （默认 true，见 §3.14）
           --full-address
           --derpmap-url <url>
           --verbose
  targets: 端口 / 端口范围 / 服务名，如 "8080"、"8000-8010"、
           "all"、"exit-node"、"ssh"、"no-auth-ssh"、"files"、"exec"
  exec:    "exec" 服务（或任意端口）的命令写在 `--` 之后
```

示例（本项目实际会生成的形态）：

```jsonc
["serve", "--json", "8080"]                                  // 端口监听
["serve", "--json", "--files", "/Users/me/pub:ro", "files"]   // 只读目录共享
["serve", "--json", "--files", "/Users/me/inbox:wo", "files"] // 只写投递箱
["serve", "--json", "--key", "default", "--allow", "nodekey:…", "22"]
```

**`--files` 的四种模式**（v0.7.0）：`:ro`（只读，默认）/ `:rw`（读写）/
`:wo`（**扁平**只写投递箱）/ `:wo+`（**递归**只写投递箱）。`wo` 与 `wo+` 都
不允许发送方列目录、读回或覆盖已有文件；区别是 `wo+` 允许客户端创建子目录。
给出 `--files` 即隐含 `files` 服务。

**`serve` 服务名完整列表**（v0.7.0）：`all` / `exit-node` / `ssh` /
`no-auth-ssh` / `files` / `exec`。其中 `ssh` 需要 `--ssh-authorized-keys`
（授权公钥来源：authorized_keys 文件路径、字面公钥行，或 `alice@github`
这类从 GitHub 拉取的名字）；`exec` 需要在 `--` 之后给出命令，对每个连接以
该连接作为 stdin/stdout 运行（类似 inetd）。

**输出解析（三条路径，按优先级）**：

1. **首选 `--json`**：stdout 输出单行 JSON

   ```json
   {"listenAddr":"tco2FwWCBTIkS2JAbd8Zu-nRX6Kh6ejMZVFqnLc4xPc7uqvCl_EWFrWCCXh-2CI9MEFZTYNBU_vPUP_yvEpPw4nCN7gOewHOHgFWFpGQEw"}
   ```

   取 `listenAddr` 写入 `TaskInfo.address`。注意：这个字段名是
   `listenAddr`，但值是**连接令牌**，不是网络地址。

2. **兜底解析 stderr**：未启用 `--json` 时，tailcat 把地址写在 stderr，形如

   ```text
   # 🐈 Server listening with new address: tco2FwWCBTIkS2JAbd8Zu-…
   ```

   匹配 `new address:` 之后的 `tc` 开头的连续 token（emoji 与中英文环境差异
   都不影响该锚点）。

3. **`TAILCAT_ADDR_FILE`**：设置该环境变量后 tailcat 会把同一地址写入文件
   （或 `tcp:host:port`）。适配层把它指向一个临时文件，作为与终端渲染无关的
   稳定通道读取。

**其他 stderr 行的处理**：

```text
# Selected bootstrap relay region 304, Tokyo
```

这是诊断信息（`stream = "stderr"`，`level = "info"/"warn"`），只进日志面板，
**不得**当作错误，也不得弹错误提示。

**生命周期**：`serve` 常驻，直到用户停止任务或进程异常退出。无参数时它只接受
一个连接并退出，因此本项目**永远显式给出 target**，避免误用该模式。

### 3.2 `recv` — 文件接收（只写投递箱）

```text
argv: ["recv", "--json", <dir>]
```

等价于 `tailcat serve --files=<dir>:wo files`。地址解析规则与 `serve` 相同：
`--json` 是**顶层标志**，`recv` 同样接受它（实测 v0.7.0：`tailcat recv --json <dir>`
在 stdout 输出单行 `{"listenAddr":"tc…"}`，与 `serve --json` 同形）；同时地址也
出现在 stderr 的 `new address:` 行与 `TAILCAT_ADDR_FILE` 指向的文件中，适配层
三者都可作为稳定通道。

`wo`（扁平只写投递箱）表示发送方不能列目录、不能读回、不能改已有文件；
若需要客户端创建子目录，应在 `serve` 中显式使用 `:wo+`——这一点必须在界面上
如实说明。

### 3.3 `cp` — 发送 / 拉取文件

```text
argv: ["cp", "-r", "-p", "foo.txt", "<addrblob>:"]
argv: ["cp", "-r", "-p", "<addrblob>:photos", "./photos"]
```

映射到 `SendRequest`：`sources` → 源路径数组；`address` + `remotePath` →
目标写作 `<address>:<remotePath>`（`remotePath` 为空时即 `<address>:`）；
`recursive` → `-r`；`preserveTimes` → `-p`。

**解析**：实际传输由**系统 `scp`** 完成，因此进度与速率来自 scp 的 stderr。
只有在 scp 确实输出进度时才展示进度；否则显示「不可用 / —」，**不得伪造百分比**。
退出码非 0 → 按 §4 映射（常见为 `PERMISSION_DENIED`、`DISK_FULL`、
`NETWORK_ERROR`、`CONNECT_FAILED`）。

**方向与接线现状**：发送方向映射到 `SendRequest`，已接入应用命令面；**取回
方向**（`<addrblob>:<path>` 在前、本地目标在后）目前只有适配层的
`spec::cp_fetch_spec()`，`TaskRequest` 里还没有对应任务类型，界面也没有入口。
该方向的 argv 形态由 `src-tauri/src/e2e.rs` 的只读共享目录测试对着真实 CLI
验证（见文件末尾的测试状态说明），但这**不等于**应用已提供「从远端共享目录
拉取文件」的功能。

### 3.4 `ls` — 列远端文件

```text
argv: ["ls", "-l", "<addrblob>[:path]"]
```

直接讲 SFTP，不需要系统 `ssh`/`sftp`。输出用于填充 `RemoteListing`：

```ts
interface RemoteEntry { name; size; mode; modified; isDir }
```

无法从某行可靠解析出某个字段时该字段置 `null`，界面显示 `—`。

### 3.5 `socks` — SOCKS5 代理（**本项目不使用该模式**）

```text
argv: ["socks", "--listen=<addr:port>", <addrblob>, <cmd>, <args...>]
```

`tailcat socks <blob> <cmd>` 会在 `<cmd>` 生命周期内提供 SOCKS5 代理。

**本项目不使用 CLI 的 SOCKS5 代理模式**：本地端口转发改用官方 **`forward`**
子命令（§3.6），由 CLI 自己持有监听，无需自制桥接，也不需要 SOCKS 客户端配合。
`SocksRequest` 类型保留在契约中，但 Rust 侧的 `Socks` 任务一律返回
`UNSUPPORTED`，界面不得把它显示为已支持。

### 3.6 `forward` — 本地端口转发（**v0.7.0 原生，本项目采用**）

```text
argv: ["forward", "--bind=<addr>", "<addrblob>", "<local>:<remote>", ...]
```

`forward` 在本地监听 TCP 端口并把连接转发到服务端，由 CLI 自己持有监听与隧道，
**不需要**本项目再派生「每连接一个子进程」的桥接。

映射写法：

| 形态 | 含义 |
| --- | --- |
| `<port>` | 本地与远端使用**同一个**端口 |
| `<local>:<remote>` | 本地端口 `local` → 远端 `remote` |
| `<local>:<remote-ip>:<remote-port>` | 转发到远端网络的另一个主机（要求服务端是 `exit-node`） |

要点：

- `--bind` 默认 `127.0.0.1`；改为其他网卡必须由用户主动开启并提示暴露风险。
- **本地端口写 `0` 表示由系统分配**，但必须写成 `local:remote` 形式。
- 实测反例：`tailcat forward <blob> 0` 会被拒绝——
  `mapping "0" is invalid: local port: invalid port "0"`（单端口写法表示本地与
  远端端口相同，`0` 对远端无意义）。因此本项目**始终生成 `<local>:<remote>`**。
- 监听就绪后 CLI 把实际地址写到 **stderr**：

  ```text
  # forwarding 127.0.0.1:54348 -> remote localhost:18080
  ```

  适配层用正则 `^#?\s*forwarding\s+(\S+):(\d+)\s+->\s+remote\s+(\S+):(\d+)`
  解析（`src-tauri/src/tailcat/parse.rs` 的 `parse_forward_line()`），把
  `<host>:<port>` 写入 `TaskInfo.listenAddr`，从而把 `localPort=0` 解析成系统
  实际分配的端口。
- 实测（v0.7.0）：`tailcat forward <blob> 0:18080` 打印
  `# forwarding 127.0.0.1:54348 -> remote localhost:18080`，随后
  `curl http://127.0.0.1:54348/` 能真实取回内容，**链路可用**。
- 服务端必须已经 `serve` 了对应的远端端口。

### 3.6.1 `browse` — 用浏览器打开对端 80 端口

```text
argv: ["browse", "<addrblob>"]
```

等价于 `tailcat forward --open-browser <tc-addr> 0:80`：监听就绪后打开
`http://127.0.0.1:<port>/` 并持续转发，直到被中断。本项目在「服务访问」场景
中用它实现「一键打开浏览器」。

### 3.7 `ping` — 路径探测（**v0.7.0 可正常使用**）

```text
argv: ["ping", "--timeout=10s", "<addrblob>"]
argv: ["ping", "--until-direct", "--timeout=30s", "<addrblob>"]
```

pong 行形如：

```text
pong in 42.1ms via DERP(sfo)
pong in 1.2ms via 203.0.113.7:41641
```

解析：`in <rtt>ms` → `PingResult.pongs[].rttMs`；`via DERP(<region>)` →
`direct = false`，`via = "DERP(<region>)"`；`via <ip>:<port>` → `direct = true`。

> ✅ **实测（v0.7.0，2026-10-14，macOS arm64）**：`tailcat ping --timeout=8s
> <blob>` 正常输出 `pong in 150.69ms via DERP(tok)`，退出码 0。**0.7.0 的
> `ping` 已可正常工作**，可用于路径探测与连通性判断（展示 RTT 与走 DERP 还是
> 直连）。
>
> 说明：`--until-direct` 在超时内没有直连路径时仍会以非 0 退出——这是**预期的
> 探测结果**（「当前没有直连」），不是「无法连接」。

### 3.8 `ssh` — 内嵌 SSH（**仅记录，不实现**）

```text
argv: ["ssh", "-p", "<port|ip:port>", "[user@]<addrblob>", "<command>", "<args...>"]
```

tailcat 的 `ssh` 会 exec 系统 `ssh`，因此它依赖用户机器上存在 OpenSSH
客户端。`SshRequest` 类型保留在契约中，但本项目**未实现内嵌 SSH 客户端**，
界面不得把它显示为已支持。

### 3.9 `genkey` — 生成 / 列出 / 删除密钥

```text
argv: ["genkey", "--key=<name>", "--client", "--force",
       "--region=<auto|list|ID|code|substring|host,host>",
       "--fixed-region", "--embed-derp-map", "--psk=<bool>"]
argv: ["genkey", "--list"]
argv: ["genkey", "--delete", "--key=<name>"]
argv: ["genkey", "--region=list"]
```

解析：

| 调用 | stdout 内容 | 映射到 |
| --- | --- | --- |
| `genkey --key=<name>`（服务端密钥） | `tc...` 地址令牌 | `KeyCreateResult.address` |
| `genkey --client --key=<name>` | `nodekey:...` 公钥 | `KeyCreateResult.publicKey` |
| `genkey --list` | 每行一个密钥名（可能为空） | `EngineStatus.savedKeys` |
| `genkey --region=list` | 每行形如 `  301 nyc New York City` | `engine_regions` 列表 |

`genkey` 也有 `--psk <bool>`（默认 `true`，见 §3.14）：服务端密钥默认把 WireGuard
预共享密钥写进地址，**生成的地址只与 v0.5.1 及以上的客户端互通**。

区域行的解析规则：`^\s*(\d+)\s+(\S+)\s+(.+)$` → `id` / `code` / `name`。
实测样例（前 4 行）：

```text
  301 nyc New York City
  302 sfo San Francisco
  303 fra Frankfurt
  304 tok Tokyo
```

`--force` 覆盖已存在的密钥：界面必须在覆盖前二次确认，因为这会**永久失效**该
密钥对应的旧地址令牌。密钥名必须通过 `validateKeyName`（只允许
`[A-Za-z0-9._-]`，且不得以 `.` 开头或包含 `..`）。

### 3.10 `parse` — 令牌解码（地址合法性的权威判定）

```text
argv: ["parse", "<addrblob>"]
```

实测输出（4 空格缩进的 JSON，**键名为首字母大写**）：

```json
{
    "ServerPublic": "nodekey:532244b62406ddf19bbe9d15fa2a1e9e8cc65516a9cb738c4f73bbaabc297f11",
    "ServerDiscoPublic": "discokey:9787ed8223d3041594d834153fbcf50fff2bc4a4fc389c237b80e7b01ce1e015",
    "PresharedKey": "psk:9f2c…",
    "RegionID": 304
}
```

映射到前端 `ParsedAddress`：

| CLI JSON 字段 | `ParsedAddress` 字段 |
| --- | --- |
| `ServerPublic` | `serverPublicKey` |
| `RegionID` | `regionId` |
| （输入本身） | `input`、`blob` |

**v0.7.0 新增 `PresharedKey` 字段**（形如 `psk:…`）。适配层只读已知键
（`ServerPublic` / `ServerDiscoPublic` / `RegionID`），**其余未知键一律安全忽略**，
因此 `PresharedKey` 不会破坏解析，也不写入契约。`ServerDiscoPublic`、以及
自包含长令牌（`--full-address` / `resolve` 产生）可能带有的额外字段同样按未知
字段忽略。`dnsName` / `regionHosts` / `selfContained` 只在输入是 DNS 名或令牌为
自包含形态时才填充。

失败示例（实测）：`tailcat parse tcNOTVALID` → stderr
`CBOR unmarshal: cbor: 5 bytes of extraneous data starting at index 1`，
退出码 1 → `ADDRESS_INVALID`。

### 3.11 `resolve` — 展开为自包含长令牌

```text
argv: ["resolve", "<addrblob>"]
```

stdout 输出内嵌 DERP 节点信息的长令牌。用于「分享给对端、让对方少一次 DERP map
拉取」的场景。解析失败 → `ADDRESS_UNRESOLVED`。

### 3.12 `printpub` / `version` / `readme`

```text
argv: ["printpub"]   // stdout: nodekey:... （当前客户端密钥的公钥）
argv: ["version"]    // stdout: v0.7.0
argv: ["readme"]     // stdout: 完整 README 文本（仅用于「查看文档」入口）
```

`printpub` 用于把本机客户端公钥填进服务端 `--allow` 白名单。

### 3.13 隐式子命令 `serve`（无参数）

`tailcat` 不带参数运行时等价于 `tailcat serve`（接受**一个**连接后写 stdout 并
退出）。本项目不使用该模式，因为它与「常驻监听」的用户预期不符。

### 3.14 `--psk` — 地址中的预共享密钥（**兼容性关键**）

```text
argv: ["serve", "--psk=<true|false>", ...]
argv: ["genkey", "--key=<name>", "--psk=<true|false>"]
```

`--psk` 控制是否在 tailcat 地址中纳入 WireGuard 预共享密钥（PSK）。**默认
`true`**，即 0.7.0 生成的地址默认带 PSK，安全性更高。

**这是重要的兼容性说明**：

- 默认（`--psk=true`）生成的地址**只能与 tailcat v0.5.1 及以上的客户端互通**；
- 只有显式设置 `--psk=false`，生成的地址才能被 **v0.5.0 及更早**的客户端连接，
  代价是地址更短、但**安全性更弱**；
- 因此「本应用生成的服务端地址」与「对方机器上的老版本 tailcat 客户端」默认
  **不互通**。要么对方升级到 v0.5.1+，要么本应用显式使用 `--psk=false`。

本应用不得在界面上把「带 PSK 的地址」描述成「与任意版本兼容」。

---

## 4. 错误与退出码映射

### 4.1 tailcat 的失败形态（实测）

- tailcat 是 Go 程序，绝大多数错误经 `log.Fatal` 输出，表现为：
  **stderr 一行带时间戳的文本 + 退出码 1**。

  ```text
  2026/10/14 10:56:43 argument "serve --help" is neither a "tc"-prefixed address blob nor a DNS name
  CBOR unmarshal: cbor: 5 bytes of extraneous data starting at index 1
  ```

- 因此**不能只靠退出码区分原因**：必须结合「子命令 + 退出码 + stderr 文本 +
  是否收到过有效地址」综合判断。
- `ping --until-direct` 在超时内没有直连路径时也会以非 0 退出——这是**预期的
  探测结果**，不是错误（见 §3.7）。

### 4.2 映射表

下表是适配层必须实现的映射，目标是把任意失败收敛到 `src/lib/types.ts` 的
`ErrorCode` 之一（共 27 个）：

| 触发条件 | `UserFacingError.code` | 面向用户的 hint（示例） |
| --- | --- | --- |
| 找不到 `tailcat` 二进制 | `ENGINE_NOT_FOUND` | 「安装 tailcat，或在设置中指定路径」 |
| 二进制存在但不可执行 / 平台不匹配 | `ENGINE_UNUSABLE` | 「重新安装对应平台的 tailcat」 |
| `tailcat version` 执行失败 | `ENGINE_VERSION_FAILED` | 「检查二进制是否完整」 |
| 官方未发布当前平台 / 架构的 tailcat 产物（macOS、`x86`、`riscv64` 等） | `ENGINE_UNSUPPORTED_PLATFORM` | 「用 Homebrew 安装，或手动指定路径」 |
| 引擎下载失败（HTTP 非 2xx、网络错误、`checksums.txt` 缺条目、解压或安装失败） | `ENGINE_DOWNLOAD_FAILED` | 「检查网络后重试，或到官方 Releases 手动下载」 |
| 下载产物的 SHA256 与官方 `checksums.txt` 不一致 | `ENGINE_CHECKSUM_MISMATCH` | 「重试；持续失败请手动下载并核对 SHA256」 |
| `parse` 失败（CBOR/格式错误） | `ADDRESS_INVALID` | 「检查地址是否被截断或改了大小写」 |
| DNS 名无 `tailcat=` TXT 记录 / 解析失败 | `ADDRESS_UNRESOLVED` | 「改用地址令牌，或检查 DNS 记录」 |
| 本地监听端口被占用（`EADDRINUSE`） | `PORT_IN_USE` | 「换一个端口，或让系统自动分配」 |
| 端口越界 / 非数字 | `PORT_INVALID` | 「端口范围是 0-65535」 |
| 路径不在用户授权范围内 | `PATH_NOT_ALLOWED` | 「重新选择目录」 |
| 路径不存在 | `PATH_NOT_FOUND` | 「检查路径」 |
| 远端路径含 `..` 或为绝对路径；下载的归档里含 `..` / 绝对路径条目 | `PATH_TRAVERSAL` | 「只能使用相对路径」 |
| `EACCES` / `EPERM` / scp 权限拒绝 | `PERMISSION_DENIED` | 「检查文件权限」 |
| `ENOSPC` | `DISK_FULL` | 「清理磁盘空间后重试」 |
| DNS 查询失败、连接被重置、TLS 错误 | `NETWORK_ERROR` | 「检查网络后重试」 |
| DERP 中继不可达 / ping 超时 | `DERP_UNREACHABLE` | 「尝试更换 DERP 区域或自建 DERP」 |
| 远端端口拒绝连接 | `CONNECT_FAILED` | 「确认服务端已 `serve` 该端口」 |
| 其他非 0 退出码 | `PROCESS_FAILED` | 「查看诊断详情」 |
| 任务 ID 不存在 | `TASK_NOT_FOUND` | — |
| 对已结束的任务执行 stop | `TASK_NOT_RUNNING` | — |
| 重复启动同一任务 | `TASK_ALREADY_RUNNING` | — |
| 当前环境不支持该能力（如预览模式） | `UNSUPPORTED` | 「启动桌面应用」 |
| 用户主动取消 | `CANCELLED` | — |
| 设置文件损坏 / 版本不兼容 | `CONFIG_ERROR` | 「恢复默认设置」 |
| 其他文件系统错误 | `IO_ERROR` | — |
| 兜底 | `INTERNAL` | — |

映射结果通过 IPC 以 `UserFacingError` JSON 返回；`src/lib/errors.ts` 的
`normalizeError` 会在前端再次校验 `code` 是否在已知集合内，未知值降级为
`INTERNAL`，`detail` 保存原始 stderr 供用户按需展开。

### 4.3 当前已落地的实现

| 位置 | 已实现的内容 |
| --- | --- |
| `src/lib/types.ts` | 全部 27 个 `ErrorCode`、`UserFacingError` 结构 |
| `src-tauri/src/error.rs` | `AppError` + 全部 `code` 常量；`From<std::io::Error>`（`PermissionDenied`/`NotFound`/`AddrInUse` → `PERMISSION_DENIED`/`PATH_NOT_FOUND`/`PORT_IN_USE`，其余 `IO_ERROR`）；`From<serde_json::Error>` 与 `From<tauri::Error>` → `INTERNAL`；`classify_stderr()` 覆盖上表中的 `PORT_IN_USE`、`PERMISSION_DENIED`、`DISK_FULL`、`DERP_UNREACHABLE`、`ADDRESS_INVALID`、`PATH_NOT_FOUND`、`PROCESS_FAILED` |
| `src-tauri/src/{commands,engine,task,tailcat}/**` | 子命令调用点与错误映射：`ENGINE_NOT_FOUND`、`ENGINE_UNUSABLE`、`ENGINE_VERSION_FAILED`、`ADDRESS_INVALID`、`ADDRESS_UNRESOLVED`、`NETWORK_ERROR`、`PATH_NOT_ALLOWED`、`TASK_NOT_FOUND`、`TASK_ALREADY_RUNNING`、`UNSUPPORTED`、`CONFIG_ERROR`、`IO_ERROR`、`INTERNAL` 等 |
| `src-tauri/src/engine_download.rs` | 引擎下载路径的错误：`ENGINE_UNSUPPORTED_PLATFORM`（官方无当前平台产物）、`ENGINE_DOWNLOAD_FAILED`（HTTP / 网络 / 缺校验和 / 解压安装失败）、`ENGINE_CHECKSUM_MISMATCH`（SHA256 不匹配）、`PATH_TRAVERSAL`（归档条目不安全）、`NETWORK_ERROR`（请求本身失败） |
| `src/lib/errors.ts` | 前端归一化与降级 |

**尚未产出**：`PORT_INVALID`、`CONNECT_FAILED`、`TASK_NOT_RUNNING` 这 3 个错误码
虽然在 `src/lib/types.ts` 与
`src-tauri/src/error.rs` 中都有定义，但 Rust 侧目前没有任何调用点会产出它们
（端口与远端路径的非法输入在前端校验阶段就被拦下）。它们需要与相应的失败路径
一起补齐，在补齐之前不得在界面上把它们表现为已支持。

> （`PATH_TRAVERSAL` 已不再是「尚未产出」：引擎下载解压时用它拒绝不安全的归档
> 条目，见上表。）

> 测试状态（2026-10-14 实测）：`cargo test` **56 passed / 0 failed**；其中 4 个
> 真实端到端测试位于 `src-tauri/src/e2e.rs`（本地端口转发、投递箱接收文件、
> 只读共享目录取回文件）与 `src-tauri/src/cleanup.rs`（停止任务后端口释放），
> 默认自跳过，设置 `TAILCAT_E2E=1` 后已在**单机**执行通过（不含双机互通）。
> 另有 17 个引擎下载测试（`engine_download.rs` 10 个 + `engine_download_tests.rs`
> 7 个）全部**离线**运行，不访问外网。
> `cargo check --all-targets` **0 error / 0 warning**；`cargo fmt --all -- --check`
> 与 `cargo clippy --all-targets --all-features -- -D warnings` 也均通过。

---

## 5. 关键事实：本地端口转发由 CLI 的 `forward` 子命令完成

### 5.1 事实（v0.7.0）

- **v0.7.0 原生提供 `tailcat forward`**，由 CLI 自己持有本地监听与隧道；本项目
  **不再自行绑定端口、也不再为每个连接派生 `tailcat <blob> <port>` 子进程**。
- 本项目**不使用** CLI 的 `socks` 代理模式；Rust 侧的 `Socks` 任务一律返回
  `UNSUPPORTED`。

### 5.2 采用方案（CLI 持有监听）

`TaskRequest::Forward` 与 `TaskRequest::Service` 都通过
`src-tauri/src/tailcat/spec.rs` 的 `forward_spec()` 生成同一个形态的 argv：

```text
tailcat [--derpmap-url=<url>] [--key=<name>] forward --bind=<host> <addr> <localPort>:<remotePort>
```

```text
ForwardRequest { address, remotePort, localPort, bindHost }
        │
        ▼
  spec::forward_spec(...)  →  argv: forward --bind=<host> <addr> <local>:<remote>
        │
        ▼
  CLI 自己监听 <host>:<localPort>（localPort=0 → 系统分配）
        │  stderr: "# forwarding <host>:<port> -> remote <host>:<port>"
        ▼
  parse_forward_line() 解析出真实端口 → 写入 TaskInfo.listenAddr
```

要点：

- **动态端口**：`localPort=0` 时真实端口来自 CLI 的 stderr（`# forwarding …`），
  由 `parse_forward_line()` 解析，而不是由本项目绑定后回报。
- **映射必须写成 `local:remote`**：单端口写法（`tailcat forward <addr> 0`）会被
  CLI 拒绝（见 §3.6）。
- 服务端映射（把远端 localhost 端口暴露出来）只能通过
  `tailcat serve <port>`；转发任务要求服务端**已经** `serve` 了该 `remotePort`。
- 本地监听默认绑定 `127.0.0.1`；绑定其他网卡必须由用户主动开启。
- 任务由后端持有，界面关闭不影响监听；应用退出时统一回收子进程。

### 5.3 与旧方案相比

旧实现（自建本地监听 + 每连接派生一个子进程）已经**移除**，因此：

- **不再有旧方案的额外延迟**：监听与隧道由 CLI 常驻持有，连接不需要每条都重新
  建一次隧道；
- 不再有「连接数多时产生大量短命子进程」的开销；
- 仍然不提供系统级代理设置，也不修改系统路由或 DNS。

---

## 6. 本项目**未**采用或未实现的部分

| 项 | 说明 |
| --- | --- |
| CLI 的 SOCKS5 代理模式（`tailcat socks`） | 本项目不使用；本地转发改用官方 `forward`（§3.5、§3.6） |
| 内嵌 SSH 客户端 | `tailcat ssh` 会 exec 系统 ssh；本项目仅记录该能力（§3.8） |
| 引擎下载 / 安装（**不是** tailcat 子命令，是应用自有能力） | **已实现**：从官方 GitHub release 取产物与 `checksums.txt`，先校验 SHA256 再解压安装到 `<app 数据目录>/engine/<version>/`；只允许 https + 官方域名（每一跳重定向复检），不经过 shell、不执行任何脚本；官方无 macOS 产物，macOS 返回「不支持」并提示 Homebrew。真实 GitHub 链路未验证（见 `limitations.md` §4.2、§7） |
| 交叉编译 | 构建脚本只面向当前平台 |
| `serve` 的 `ssh` / `no-auth-ssh` / `exit-node` / `all` / `exec` 服务 | 未在界面暴露（高暴露或需独立设计，见 `capability-matrix.md`） |
