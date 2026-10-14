#!/usr/bin/env bash
#
# scripts/cross-check.sh —— 本地跨平台编译验证（cargo check --target <triple>）
#
# 作用：在开发机（本项目实测环境为 macOS arm64）上，对「当前机器并非原生目标」
#       的平台做一次 `cargo check --target <triple> --all-features`，用来证明
#       Rust 后端（含 Tauri 2 与全部依赖）在这些目标平台上能通过类型检查与编译。
#
# 覆盖的目标：
#   x86_64-apple-darwin       macOS Intel
#   x86_64-pc-windows-msvc    Windows x64（MSVC）
#   x86_64-unknown-linux-gnu  Linux x86_64（glibc）
#
# 重要限制（务必如实理解本脚本的结论）：
#   1. `cargo check` 只做类型检查 / 元数据生成，**不产出安装包**（.dmg / .msi /
#      .deb / .AppImage 等），也不做链接与打包。安装包必须在目标平台（GitHub
#      runner 或真机 / 虚拟机）上构建。
#   2. 因此本脚本证明的是「代码可编译」，**不能**替代目标平台的真机构建与安装
#      验证。详见 docs/ci.md「本地跨平台编译验证」一节。
#   3. 交叉检查依赖两样本机工具，缺失时会在对应目标上失败，且属于**环境问题**
#      而不是代码问题：
#        - Windows 目标：Tauri 的构建脚本会用 `tauri-winres` 编译资源文件，
#          需要 `llvm-rc`（LLVM 自带；Homebrew 的 llvm 默认不链接到 PATH）。
#        - Linux 目标：GTK / WebKitGTK 的 `*-sys` crate 通过 pkg-config 查找
#          `webkit2gtk-4.1`、`gtk+-3.0` 等系统库的 `.pc` 文件。开发机上没有
#          Linux sysroot，pkg-config 也无法交叉查询，于是这些 crate 的构建脚本
#          直接失败。这是**交叉编译环境缺失系统库**，不是本项目代码的问题。
#          本脚本会明确把这类失败标注为「环境缺失」，不会为了好看而删依赖。
#   4. 本脚本需要联网：首次为某个 target 拉取平台专属依赖时需要访问 crates.io。
#
# 用法: ./scripts/cross-check.sh [--target <triple>]... [--help]

set -euo pipefail

readonly SCRIPT_NAME="${0##*/}"

usage() {
  cat <<'EOF'
用法: ./scripts/cross-check.sh [选项]

对非原生目标执行 `cargo check --target <triple> --all-features`，验证
Rust 后端（含 Tauri 2 与全部依赖）在目标平台上能通过编译。

选项:
  --target <triple>   只检查指定目标（可重复；默认检查下面全部三个）
  -h, --help          显示本帮助

默认目标:
  x86_64-apple-darwin       macOS Intel
  x86_64-pc-windows-msvc    Windows x64（MSVC）
  x86_64-unknown-linux-gnu  Linux x86_64（glibc）

前置条件:
  rustup target add x86_64-pc-windows-msvc x86_64-unknown-linux-gnu x86_64-apple-darwin
  Windows 目标额外需要 `llvm-rc`（macOS: 'brew install llvm'，本脚本会自动
  尝试把它加入 PATH）。
  首次检查某个 target 需要联网（从 crates.io 拉取平台专属依赖）。

说明:
  Linux 目标上的 GTK / WebKitGTK `*-sys` crate 需要系统库的 .pc 文件。开发机
  上没有 Linux sysroot 时它们必然失败——这属于交叉编译环境缺失系统库，不是
  代码问题；本脚本会把这类失败单独标注出来。

退出码:
  0  所有目标检查通过
  1  至少一个目标因代码 / 依赖问题失败
  2  参数错误
  3  工具链或目标缺失（rustup target 未安装），检查未能执行
  4  未发现代码问题，但有目标因本机缺少交叉编译系统库 / 工具而失败
EOF
}

# 目标清单：triple|人类可读名称
readonly -a DEFAULT_TARGETS=(
  "x86_64-apple-darwin|macOS Intel (x86_64)"
  "x86_64-pc-windows-msvc|Windows x64 (MSVC)"
  "x86_64-unknown-linux-gnu|Linux x86_64 (glibc)"
)

requested=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    --target)
      if [ "$#" -lt 2 ]; then
        echo "$SCRIPT_NAME: --target 需要一个 triple 参数" >&2
        exit 2
      fi
      requested+=("$2")
      shift 2
      ;;
    --target=*)
      requested+=("${1#--target=}")
      shift
      ;;
    *)
      echo "$SCRIPT_NAME: 未知参数: $1" >&2
      echo "运行 '$SCRIPT_NAME --help' 查看用法。" >&2
      exit 2
      ;;
  esac
done

# 组装本次要检查的目标（triple|名称）。
targets=()
if [ "${#requested[@]}" -gt 0 ]; then
  for triple in "${requested[@]}"; do
    label="$triple"
    for entry in "${DEFAULT_TARGETS[@]}"; do
      if [ "${entry%%|*}" = "$triple" ]; then
        label="${entry#*|}"
      fi
    done
    targets+=("${triple}|${label}")
  done
else
  targets=("${DEFAULT_TARGETS[@]}")
fi

# 1. 定位仓库根目录（本脚本位于 <repo>/scripts/ 下）。
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
SRC_TAURI="${REPO_ROOT}/src-tauri"
LOG_DIR="${SRC_TAURI}/target/cross-check-logs"

# 2. 补齐 PATH：cargo 常装在 ~/.cargo/bin，而该目录默认不在非登录 shell 的 PATH 中。
cargo_bin="${CARGO_HOME:-$HOME/.cargo}/bin"
if [ -d "$cargo_bin" ]; then
  case ":${PATH}:" in
    *":${cargo_bin}:"*) ;;
    *) PATH="${cargo_bin}:${PATH}" ;;
  esac
  export PATH
fi

hr() {
  printf '%s\n' "------------------------------------------------------------"
}

# 3. 选择 cargo：优先 ${CARGO_HOME:-$HOME/.cargo}/bin/cargo，其次 PATH 中的 cargo。
if [ -n "${CARGO_HOME:-}" ] && [ -x "${CARGO_HOME}/bin/cargo" ]; then
  CARGO="${CARGO_HOME}/bin/cargo"
elif [ -x "${HOME}/.cargo/bin/cargo" ]; then
  CARGO="${HOME}/.cargo/bin/cargo"
elif command -v cargo >/dev/null 2>&1; then
  CARGO="$(command -v cargo)"
else
  echo "错误：找不到 cargo，请先安装 Rust 工具链（https://rustup.rs）。" >&2
  exit 3
fi

echo "Tailcat Box - 本地跨平台编译验证（cargo check）"
echo "主机: $(uname -s) $(uname -m)"
echo "cargo: ${CARGO}"
hr

# 4. Windows 目标需要资源编译器 llvm-rc（tauri-winres 会调用它）。Homebrew 的
#    llvm 默认不链接到 PATH，这里尝试常见的安装位置，避免把「已安装但不在
#    PATH」误报成「缺失」。
ensure_llvm_rc() {
  if command -v llvm-rc >/dev/null 2>&1; then
    return 0
  fi
  local dir prefix
  for dir in \
    /opt/homebrew/opt/llvm/bin \
    /usr/local/opt/llvm/bin \
    /usr/lib/llvm/bin \
    "${HOME}/.local/opt/llvm/bin"; do
    if [ -x "${dir}/llvm-rc" ]; then
      PATH="${dir}:${PATH}"
      export PATH
      return 0
    fi
  done
  if command -v brew >/dev/null 2>&1; then
    prefix="$(brew --prefix llvm 2>/dev/null || true)"
    if [ -n "$prefix" ] && [ -x "${prefix}/bin/llvm-rc" ]; then
      PATH="${prefix}/bin:${PATH}"
      export PATH
      return 0
    fi
  fi
  return 1
}

# 5. 失败原因分类：环境缺失 vs 代码 / 依赖问题。
#    「环境缺失」指本机缺少交叉编译所需的系统库或工具，而非本项目代码问题。
classify_failure() {
  local log="$1" triple="$2"
  case "$triple" in
    *windows*)
      if grep -q -e "llvm-rc" -e "tauri-winres" -e "windres" "$log" 2>/dev/null; then
        echo "env"
        return
      fi
      ;;
    *linux*)
      # pkg-config 无法交叉查询系统库：GTK / WebKitGTK 的 *-sys crate 构建失败。
      if grep -q -e "pkg-config has not been configured to support cross-compilation" \
        -e "PKG_CONFIG_PATH" -e "PKG_CONFIG_SYSROOT_DIR" -e "PKG_CONFIG_ALLOW_CROSS" \
        -e "No package '" -e "was not found in the pkg-config search path" \
        "$log" 2>/dev/null; then
        echo "env"
        return
      fi
      ;;
  esac
  echo "code"
}

# 结果记录：每行 "triple|状态|类别"，类别为 pass / env / code / skipped。
# 这里刻意不用数组累积——macOS 自带的 bash 3.2 在 `set -u` 下展开空数组会报错。
results=""
record() {
  results="${results}${1}|${2}|${3}"$'\n'
}

# 统计某个类别出现几次（grep 无匹配时返回 1，这里用 || true 兜住）。
count_kind() {
  printf '%s' "$results" | grep -c "|${1}$" 2>/dev/null || true
}

# 列出某个类别涉及的目标，空格分隔（去掉结尾多余空格）。
list_kind() {
  printf '%s' "$results" |
    grep "|${1}$" 2>/dev/null |
    cut -d'|' -f1 |
    tr '\n' ' ' |
    sed 's/ *$//' || true
}

mkdir -p "$LOG_DIR"

for entry in "${targets[@]}"; do
  triple="${entry%%|*}"
  label="${entry#*|}"
  log="${LOG_DIR}/${triple}.log"

  echo
  echo "==> 检查 ${triple}（${label}）"

  # 目标标准库必须已安装，否则 cargo 会直接报错。
  if command -v rustup >/dev/null 2>&1 &&
    ! rustup target list --installed 2>/dev/null | grep -qx "$triple"; then
    echo "    跳过：未安装该 target 的标准库。" >&2
    echo "    请先执行：rustup target add ${triple}" >&2
    record "$triple" "跳过（target 未安装）" "skipped"
    continue
  fi

  if [ "$triple" = "x86_64-pc-windows-msvc" ] && ! ensure_llvm_rc; then
    echo "    提示：PATH 中没有 llvm-rc，Tauri 的 Windows 资源编译步骤会失败。" >&2
    echo "    安装方式：'brew install llvm'（macOS）或使用系统包管理器安装 LLVM。" >&2
  fi

  echo "    ${CARGO} check --target ${triple} --all-features"
  if (cd "${SRC_TAURI}" && "${CARGO}" check --target "$triple" --all-features) \
    >"$log" 2>&1; then
    echo "    结果：通过 ✓（日志：${log}）"
    record "$triple" "通过 ✓" "pass"
  else
    status=$?
    kind="$(classify_failure "$log" "$triple")"
    if [ "$kind" = "env" ]; then
      echo "    结果：失败（环境缺失，非代码问题）✗（退出码 ${status}）"
      case "$triple" in
        *linux*)
          echo "    原因：本机没有 Linux sysroot，pkg-config 无法交叉查询 GTK / WebKitGTK"
          echo "          的 .pc 文件（webkit2gtk-4.1、gtk+-3.0 等），于是这些 *-sys"
          echo "          crate 的构建脚本失败。这是交叉编译环境缺失系统库，不是代码问题。"
          ;;
        *windows*)
          echo "    原因：缺少 Windows 资源编译器 llvm-rc（Tauri 构建脚本需要它来编译"
          echo "          .rc 资源 / 图标）。属于本机工具链缺失，不是代码问题。"
          ;;
      esac
      record "$triple" "失败（环境缺失，非代码问题）✗" "env"
    else
      echo "    结果：失败（疑似代码 / 依赖问题）✗（退出码 ${status}）"
      record "$triple" "失败（疑似代码 / 依赖问题）✗" "code"
    fi
    echo "    关键报错（日志尾部，完整日志：${log}）："
    grep -E "^(error|warning: build failed|Caused by)" "$log" 2>/dev/null | head -n 5 || true
    tail -n 3 "$log" 2>/dev/null | sed 's/^/      /' || true
  fi
done

# 6. 汇总。
echo
hr
echo "汇总（日志目录：${LOG_DIR}）"
printf '  %-28s %s\n' "目标" "结果"
for entry in "${targets[@]}"; do
  triple="${entry%%|*}"
  result="$(printf '%s' "$results" | grep "^${triple}|" 2>/dev/null | cut -d'|' -f2 || true)"
  [ -n "$result" ] || result="未执行"
  printf '  %-28s %s\n' "$triple" "$result"
done

echo
echo "说明：本脚本只做 cargo check（类型检查 / 元数据），不产出安装包，也不做链接"
echo "      与打包；它不能替代目标平台的真机构建与安装验证。"

skipped_count="$(count_kind skipped)"
code_count="$(count_kind code)"
env_count="$(count_kind env)"
pass_count="$(count_kind pass)"

if [ "${skipped_count}" -gt 0 ]; then
  echo
  echo "错误：以下 target 的标准库未安装，检查未能执行：$(list_kind skipped)" >&2
  echo "      请执行：rustup target add $(list_kind skipped)" >&2
  exit 3
fi

if [ "${code_count}" -gt 0 ]; then
  echo
  echo "错误：以下目标因疑似代码 / 依赖问题失败：$(list_kind code)" >&2
  echo "      请查看 ${LOG_DIR}/<triple>.log 定位具体报错。" >&2
  exit 1
fi

if [ "${env_count}" -gt 0 ]; then
  echo
  echo "结果：未发现代码问题；以下目标因本机缺少交叉编译系统库 / 工具而失败：$(list_kind env)"
  echo "      这些失败属于环境限制（Linux 需 sysroot 与 GTK / WebKitGTK 开发包；"
  echo "      Windows 需 llvm-rc）。若要让它们变绿，请在对应系统上安装依赖，"
  echo "      或直接使用 .github/workflows/release.yml 在目标 runner 上验证。"
  exit 4
fi

echo
echo "结果：全部目标检查通过 ✓（${pass_count} 个：$(list_kind pass)）"
exit 0
