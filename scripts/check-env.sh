#!/usr/bin/env bash
#
# check-env.sh - verify the toolchain Tailcat Box needs on this machine.
#
# Prints the version of every required tool, and an install suggestion for the
# ones that are missing. Exit code 0 means "everything required is present";
# any non-zero exit code means at least one required tool is missing.
#
# Usage: ./scripts/check-env.sh [--help]

set -euo pipefail

readonly SCRIPT_NAME="${0##*/}"

usage() {
  cat <<'EOF'
用法: ./scripts/check-env.sh

检查 Tailcat Box 的开发/构建工具链是否就绪，并打印各工具版本：
  node    必需  >= 20
  pnpm    必需  >= 9
  cargo   构建桌面外壳所需（Tauri 2）
  rustc   构建桌面外壳所需（Rust stable）
  tailcat 运行时引擎（缺失时应用仍可启动，但无法建立连接）

选项:
  -h, --help   显示本帮助

说明:
  rustup 默认把 cargo / rustc 安装到 ~/.cargo/bin，而该目录在非登录 shell
  中常常不在 PATH 里。本脚本会在检查前把它补进 PATH（若目录存在），因此
  「已安装但不在 PATH」不会再被误报为未找到。

退出码:
  0  所有必需工具齐全
  1  缺少必需工具（node / pnpm / cargo / rustc 之一）
EOF
}

for arg in "$@"; do
  case "$arg" in
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "$SCRIPT_NAME: 未知参数: $arg" >&2
      echo "运行 '$SCRIPT_NAME --help' 查看用法。" >&2
      exit 2
      ;;
  esac
done

# Rust 工具链常装在 ~/.cargo/bin，而该目录默认不在 PATH 中（尤其是非登录
# shell）。若存在则补进 PATH，避免把「已安装」误报成「未找到」。
cargo_bin="${CARGO_HOME:-$HOME/.cargo}/bin"
if [ -d "$cargo_bin" ]; then
  case ":${PATH}:" in
    *":${cargo_bin}:"*) ;;
    *) PATH="${cargo_bin}:${PATH}" ;;
  esac
  export PATH
fi

# Collected so the summary can be printed after all checks run.
missing_required=()
missing_optional=()

hr() {
  printf '%s\n' "------------------------------------------------------------"
}

# check <label> <command> <required:yes|no> <suggestion>
check() {
  local label="$1" cmd="$2" required="$3" suggestion="$4"
  if command -v "$cmd" >/dev/null 2>&1; then
    local path version
    path="$(command -v "$cmd")"
    version="$("$cmd" --version 2>&1 | head -n 1 || true)"
    printf '  %-9s ✓  %s\n' "$label" "$version"
    printf '  %-9s    %s\n' "" "$path"
  else
    printf '  %-9s ✗  未找到\n' "$label"
    printf '  %-9s    %s\n' "" "$suggestion"
    if [ "$required" = "yes" ]; then
      missing_required+=("$label")
    else
      missing_optional+=("$label")
    fi
  fi
}

echo "Tailcat Box - 环境检查"
echo "平台: $(uname -s) $(uname -m)"
hr

check "node" "node" "yes" \
  "安装 Node.js 20+：https://nodejs.org/ 或 'brew install node'"
check "pnpm" "pnpm" "yes" \
  "安装 pnpm：'corepack enable pnpm' 或 'npm i -g pnpm'"
check "cargo" "cargo" "yes" \
  "安装 Rust：'curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh'（详见 https://rustup.rs）"
check "rustc" "rustc" "yes" \
  "随 Rust 工具链安装：'rustup component add rustc' 或重装 rustup"
check "tailcat" "tailcat" "no" \
  "安装引擎：'brew install tailcat'（macOS），或从 https://github.com/tailscale/tailcat/releases 下载对应平台二进制"

hr

if [ "${#missing_required[@]}" -gt 0 ]; then
  echo "结果: 缺少 ${#missing_required[@]} 个必需工具 -> ${missing_required[*]}"
  if [ "${#missing_optional[@]}" -gt 0 ]; then
    echo "      另外缺少可选工具 -> ${missing_optional[*]}"
  fi
  echo "请先安装缺失项，再运行 './scripts/build-all.sh'。"
  exit 1
fi

if [ "${#missing_optional[@]}" -gt 0 ]; then
  echo "结果: 必需工具齐全；缺少可选工具 -> ${missing_optional[*]}"
  echo "      应用仍可构建，但在安装 tailcat 之前无法建立任何真实连接。"
  exit 0
fi

echo "结果: 全部工具已就绪 ✓"
exit 0
