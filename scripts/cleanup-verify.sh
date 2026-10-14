#!/usr/bin/env bash
#
# scripts/cleanup-verify.sh —— 任务停止与退出清理验证脚本
#
# 作用：为 AGENT.md 安全要求第 10 条「应用退出时能够可靠地清理自身创建的子进程」
#       与验收条件「停止任务后，相关子进程和本地监听端口均能正确释放」提供可执行
#       证据，对应 src-tauri/src/cleanup.rs 中的测试。
#
# 分两步：
#   1) 离线部分（默认 cargo test 也会跑）：用一个 shim 脚本冒充 tailcat，
#      断言 stop / stop_all / shutdown 之后子进程 PID 已被回收（不是僵尸进程）。
#   2) 联网部分（TAILCAT_E2E=1）：起真实 tailcat serve + forward，断言 stop 之后
#      本地监听端口可以重新绑定。
#
# 注意：第 2 步需要联网（tailcat 依赖 DERP 中继完成首次连接），并且会真实占用
#       一个本地回环端口。只想跑离线部分时用 CLEANUP_OFFLINE_ONLY=1。
# 注意：清理验证只在 macOS / Linux 上有实测证据；Windows 上 sleep / 信号语义
#       不同，src-tauri/src/cleanup.rs 整体用 cfg(unix) 跳过。

set -euo pipefail

echo "==> tailcat 任务停止与退出清理验证"

# 1. 定位仓库根目录（本脚本位于 <repo>/scripts/ 下）。
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
SRC_TAURI="${REPO_ROOT}/src-tauri"

# 2. 选择 cargo：优先 ${CARGO_HOME:-$HOME/.cargo}/bin/cargo，其次 PATH 中的 cargo。
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

cd "${SRC_TAURI}"

# 3. 第一步：离线部分。不需要 tailcat，也不需要网络。
echo
echo "==> [1/2] 离线验证：stop / stop_all / shutdown 之后子进程被回收"
echo "==> 运行：cargo test --lib cleanup"
if "${CARGO}" test --lib cleanup -- --nocapture --test-threads=1; then
  echo "==> 离线验证通过：停止任务后子进程均已被回收（不是僵尸进程）。"
else
  status=$?
  echo "错误：离线清理验证失败（退出码 ${status}）。" >&2
  echo "  请查看 src-tauri/src/cleanup.rs 中断言失败的具体输出。" >&2
  exit "${status}"
fi

# 4. 第二步：联网部分。需要真实 tailcat，并会真实占用一个本地回环端口。
if [ "${CLEANUP_OFFLINE_ONLY:-0}" = "1" ]; then
  echo
  echo "==> 已设置 CLEANUP_OFFLINE_ONLY=1，跳过联网部分。"
  exit 0
fi

if [ -z "${TAILCAT_E2E_BIN:-}" ] && ! command -v tailcat >/dev/null 2>&1; then
  echo
  echo "错误：在 PATH 中找不到 tailcat 可执行文件，无法运行端口释放验证。" >&2
  echo "      请先安装官方 tailcat CLI（v0.7.0 或更高），或把它加入 PATH；" >&2
  echo "      也可以用 TAILCAT_E2E_BIN=/绝对/路径/tailcat 指定可执行文件。" >&2
  echo "      若只想跑离线部分，请用 CLEANUP_OFFLINE_ONLY=1。" >&2
  exit 1
fi
TAILCAT_PATH="${TAILCAT_E2E_BIN:-$(command -v tailcat)}"
echo
echo "==> 使用 tailcat：${TAILCAT_PATH}"
echo -n "==> tailcat version: "
"${TAILCAT_PATH}" version

echo
echo "==> [2/2] 联网验证：stop 之后本地监听端口被释放"
echo "==> 注意：本步骤需要联网（tailcat 依赖 DERP 中继完成首次连接）。"
echo "==> 运行：TAILCAT_E2E=1 cargo test --lib cleanup -- --nocapture --test-threads=1"
if TAILCAT_E2E=1 TAILCAT_E2E_BIN="${TAILCAT_PATH}" "${CARGO}" test --lib cleanup -- --nocapture --test-threads=1; then
  echo "==> 联网验证通过：停止任务后本地监听端口已释放，可以重新绑定。"
else
  status=$?
  echo "错误：端口释放验证失败（退出码 ${status}）。可排查以下方向：" >&2
  echo "  1. 网络是否可用——tailcat 依赖 DERP 中继，首次连接可能需要数秒到数十秒。" >&2
  echo "  2. tailcat 是否为 v0.7.0 或更高（本测试依赖 forward 子命令与 TAILCAT_ADDR_FILE）。" >&2
  echo "  3. 若使用了非标准路径，可用 TAILCAT_E2E_BIN=/绝对/路径/tailcat 重新运行。" >&2
  echo "  4. 测试输出中的 serve / forward stderr 尾部会给出 CLI 的具体报错。" >&2
  exit "${status}"
fi
