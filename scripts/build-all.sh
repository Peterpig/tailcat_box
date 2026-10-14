#!/usr/bin/env bash
#
# build-all.sh - build Tailcat Box for the host platform.
#
# Runs the same pipeline a release build needs, in order:
#   1. detect platform + verify the toolchain
#   2. pnpm install
#   3. pnpm run typecheck
#   4. pnpm run test
#   5. pnpm tauri:build
# and finally prints where the produced artifacts landed.
#
# Usage: ./scripts/build-all.sh [--help] [--skip-install] [--skip-tests] [--debug]

set -euo pipefail

readonly SCRIPT_NAME="${0##*/}"
readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

skip_install=0
skip_tests=0
profile="release"

usage() {
  cat <<'EOF'
用法: ./scripts/build-all.sh [选项]

在**当前平台**上构建 Tailcat Box 安装包，依次执行：
  1. 平台检测与工具链检查
  2. pnpm install
  3. pnpm run typecheck
  4. pnpm run test
  5. pnpm tauri:build

选项:
  -h, --help        显示本帮助
      --skip-install  跳过 pnpm install（依赖已就绪时使用）
      --skip-tests    跳过 pnpm run test
      --debug         以 debug 配置构建（默认 release）

说明:
  * 本脚本不交叉编译：产物始终面向当前操作系统与架构。
  * 需要 src-tauri/（Tauri 2 工程）。若该目录不存在，脚本会在执行
    pnpm tauri:build 前明确报错并退出。
  * 运行前可先执行 ./scripts/check-env.sh 检查工具链。

退出码:
  0  构建成功
  1  工具链缺失 / 前置条件不满足
  2  参数错误
  其它  由失败的具体命令决定
EOF
}

for arg in "$@"; do
  case "$arg" in
    -h | --help)
      usage
      exit 0
      ;;
    --skip-install)
      skip_install=1
      ;;
    --skip-tests)
      skip_tests=1
      ;;
    --debug)
      profile="debug"
      ;;
    *)
      echo "$SCRIPT_NAME: 未知参数: $arg" >&2
      echo "运行 '$SCRIPT_NAME --help' 查看用法。" >&2
      exit 2
      ;;
  esac
done

step() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf '\n错误: %s\n' "$1" >&2
  exit 1
}

cd "$REPO_ROOT"

# --- 1. platform -------------------------------------------------------------

step "检测平台"

case "$(uname -s)" in
  Darwin) platform="macos" ;;
  Linux) platform="linux" ;;
  MINGW* | MSYS* | CYGWIN*) platform="windows" ;;
  *) fail "不支持的操作系统: $(uname -s)（仅支持 macOS / Linux / Windows）" ;;
esac

arch="$(uname -m)"
case "$arch" in
  arm64 | aarch64) arch="aarch64" ;;
  x86_64 | amd64) arch="x86_64" ;;
esac

echo "  平台: ${platform}-${arch}"

# --- 2. toolchain ------------------------------------------------------------

step "检查工具链"

# 与 check-env.sh 一致：rustup 把 cargo / rustc 装在 ~/.cargo/bin，该目录
# 常常不在 PATH 中。若存在则补进 PATH，避免误报「未找到」。
cargo_bin="${CARGO_HOME:-$HOME/.cargo}/bin"
if [ -d "$cargo_bin" ]; then
  case ":${PATH}:" in
    *":${cargo_bin}:"*) ;;
    *) PATH="${cargo_bin}:${PATH}" ;;
  esac
  export PATH
fi

require() {
  local cmd="$1" suggestion="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    fail "未找到 '$cmd'。$suggestion"
  fi
  printf '  %-8s %s\n' "$cmd" "$("$cmd" --version 2>&1 | head -n 1)"
}

require node "安装 Node.js 20+：https://nodejs.org/"
require pnpm "安装 pnpm：'corepack enable pnpm'"
require cargo "安装 Rust：https://rustup.rs"
require rustc "随 Rust 工具链安装（rustup 默认包含）"

if command -v tailcat >/dev/null 2>&1; then
  printf '  %-8s %s\n' "tailcat" "$(tailcat version 2>&1 | head -n 1)"
else
  echo "  提示: 未检测到 tailcat 二进制。构建仍可完成，但打包前请确认"
  echo "        发布策略（随包分发或要求用户自行安装），详见 docs/packaging.md。"
fi

# --- 3. dependencies ---------------------------------------------------------

if [ "$skip_install" -eq 1 ]; then
  step "跳过 pnpm install（--skip-install）"
else
  step "安装依赖 (pnpm install)"
  pnpm install
fi

# --- 4. frontend checks ------------------------------------------------------

step "类型检查 (pnpm run typecheck)"
pnpm run typecheck

if [ "$skip_tests" -eq 1 ]; then
  step "跳过测试（--skip-tests）"
else
  step "测试 (pnpm run test)"
  pnpm run test
fi

# --- 5. tauri build ----------------------------------------------------------

step "打包 (pnpm tauri:build)"

if [ ! -d "$REPO_ROOT/src-tauri" ]; then
  fail "找不到 src-tauri/ 目录。pnpm tauri:build 需要 Tauri 2 工程（Rust 侧尚未入库）。"
fi

if [ "$profile" = "debug" ]; then
  pnpm tauri:build --debug
else
  pnpm tauri:build
fi

# --- 6. artifacts ------------------------------------------------------------

step "构建产物"

bundle_root="$REPO_ROOT/src-tauri/target/$profile/bundle"

if [ ! -d "$bundle_root" ]; then
  echo "  未找到 bundle 目录: $bundle_root"
  echo "  请检查 tauri.conf.json 的 bundle 配置。"
  exit 0
fi

# Collect artifacts outside a pipeline so the array survives the loop.
artifacts=()
case "$platform" in
  macos)
    bundle_dirs=(dmg macos)
    find_expr=(-maxdepth 1 \( -name '*.dmg' -o -name '*.app' \))
    ;;
  linux)
    bundle_dirs=(deb rpm appimage)
    find_expr=(-maxdepth 1 \( -name '*.deb' -o -name '*.rpm' -o -name '*.AppImage' \))
    ;;
  windows)
    bundle_dirs=(msi nsis)
    find_expr=(-maxdepth 1 \( -name '*.msi' -o -name '*.exe' \))
    ;;
esac

for dir in "${bundle_dirs[@]}"; do
  [ -d "$bundle_root/$dir" ] || continue
  while IFS= read -r item; do
    [ -n "$item" ] && artifacts+=("$item")
  done < <(find "$bundle_root/$dir" "${find_expr[@]}" -print | sort)
done

if [ "${#artifacts[@]}" -eq 0 ]; then
  echo "  bundle 目录存在但没有识别到安装包，请手动检查: $bundle_root"
else
  for item in "${artifacts[@]}"; do
    printf '  %s\n' "$item"
  done
  echo
  echo "  提示: 发布前请确认安装包内含 LICENSE 与 THIRD_PARTY_NOTICES.md。"
fi

printf '\n完成: %s-%s 构建流程结束。\n' "$platform" "$arch"
