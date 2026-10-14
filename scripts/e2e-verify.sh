#!/usr/bin/env bash
#
# scripts/e2e-verify.sh —— 端到端验证脚本
#
# 作用：调用官方 `tailcat` CLI，真实打通以下链路，用来验证
#       src-tauri/src/e2e.rs 中的 #[tokio::test]：
#         1. 本地端口转发 → 远端 localhost 目标服务；
#         2. 文件接收方向：`tailcat recv` 投递箱 ← `tailcat cp <file> <addrblob>:`；
#         3. 文件共享/读取方向：`tailcat serve --files=<dir>:ro files` →
#            `tailcat ls -l` 列目录，`tailcat cp <addrblob>:<file> <local>` 取回。
#
# 过滤器 `e2e` 按名字匹配 `src-tauri/src/e2e.rs` 里的全部测试
# （`e2e_本地端口转发…` / `e2e_接收投递箱…` / `e2e_只读共享目录…`），
# 新增的测试只要以 `e2e_` 开头就会被跑到。
#
# 重要：本脚本需要联网（tailcat 依赖 DERP 中继完成首次连接）。
#       默认的 `cargo test` 不会执行这些测试；必须显式设置 TAILCAT_E2E=1。

set -euo pipefail

echo "==> tailcat 端到端验证"

# 1. 定位仓库根目录（本脚本位于 <repo>/scripts/ 下）。
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
SRC_TAURI="${REPO_ROOT}/src-tauri"

# 2. 检查 tailcat 是否存在，并打印版本。
if ! command -v tailcat >/dev/null 2>&1; then
  echo "错误：在 PATH 中找不到 tailcat 可执行文件。" >&2
  echo "      请先安装官方 tailcat CLI（v0.7.0 或更高），或把它加入 PATH。" >&2
  echo "      也可以先用 TAILCAT_E2E_BIN=/绝对/路径/tailcat 指定可执行文件。" >&2
  exit 1
fi
TAILCAT_PATH="$(command -v tailcat)"
echo "==> 使用 tailcat：${TAILCAT_PATH}"
echo -n "==> tailcat version: "
tailcat version

# 3. 选择 cargo：优先 ${CARGO_HOME:-$HOME/.cargo}/bin/cargo，其次 PATH 中的 cargo。
if [ -n "${CARGO_HOME:-}" ] && [ -x "${CARGO_HOME}/bin/cargo" ]; then
  CARGO="${CARGO_HOME}/bin/cargo"
elif [ -x "${HOME}/.cargo/bin/cargo" ]; then
  CARGO="${HOME}/.cargo/bin/cargo"
elif command -v cargo >/dev/null 2>&1; then
  CARGO="$(command -v cargo)"
else
  echo "错误：找不到 cargo，请先安装 Rust 工具链（https://rustup.rs）。" >&2
  exit 1
fi
echo "==> 使用 cargo：${CARGO}"

# 4. 运行端到端测试。
echo
echo "==> 注意：本脚本需要联网（tailcat 依赖 DERP 中继完成首次连接）。"
echo "==> 运行：TAILCAT_E2E=1 cargo test -- --nocapture --test-threads=1 e2e"
echo

cd "${SRC_TAURI}"

if TAILCAT_E2E=1 "${CARGO}" test -- --nocapture --test-threads=1 e2e; then
  echo
  echo "==> 端到端验证通过：本地端口转发与文件传输（接收 / 共享读取）均已真实打通官方 tailcat CLI。"
else
  status=$?
  echo
  echo "错误：端到端验证失败（退出码 ${status}）。可排查以下方向：" >&2
  echo "  1. 网络是否可用——tailcat 依赖 DERP 中继，首次连接可能需要数秒到数十秒。" >&2
  echo "  2. tailcat 是否为 v0.7.0 或更高（本测试依赖 forward/recv/cp/ls 子命令与 TAILCAT_ADDR_FILE）。" >&2
  echo "     文件传输由系统 scp 完成，请确认 scp 在 PATH 中可用。" >&2
  echo "  3. 若使用了非标准路径，可用 TAILCAT_E2E_BIN=/绝对/路径/tailcat 重新运行。" >&2
  echo "  4. 测试输出中的 serve / recv / forward stderr 尾部会给出 CLI 的具体报错。" >&2
  exit "${status}"
fi
