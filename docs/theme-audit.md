# 主题与 UI 一致性审计报告

审计对象：`src/styles/tokens.css`、`src/styles/globals.css`、`src/components/ui/**`、
`src/components/layout/**`（仅视觉/主题层）。
审计基准：`docs/development-conventions.md` §2「设计 Token 规则」与根目录 `AGENT.md`
§四/§十一。

审计日期：2026-10-14

---

## 1. 结论摘要

| 项目 | 结果 |
| --- | --- |
| 硬编码颜色（裸色/调色板类）违规 | **1 处**（`switch.tsx` 的 `bg-white`），已修复 |
| `dark:` 前缀写死颜色 | 0 处 |
| 调色板带色阶类（`bg-gray-800` 等） | 0 处 |
| 新增语义 Token | 1 个（`--switch-thumb`，浅/深各一值） |
| 顺带规范化的原始变量用法 | 16 处（`[color:var(--x)]` → 已有语义类） |
| 状态补齐 | 2 个组件（`Tabs` 禁用态、`DropdownMenu` 复选项禁用/高亮态） |
| 浅/深 Token 覆盖 | 28 / 28，完全对称 |
| `@theme inline` 覆盖 | 组件用到的语义 Token 100% 已映射 |
| 字体跨平台 | 通过（开源字体为主，系统字体仅在回退链末尾） |
| 自测 | `typecheck` / `test` / `build` 三条全部通过 |

---

## 2. 审计方法与命令

任务规定的三条扫描（均在 `/Users/orange/workspace/tailcat_box` 下执行）：

```bash
rg -n "#[0-9a-fA-F]{3,8}\b" src/components src/styles
rg -n "dark:" src/components src/styles
rg -n "(bg|text|border|ring|from|to|via|fill|stroke)-(white|black|gray|slate|zinc|neutral|stone|red|green|blue|yellow|orange|purple|pink|indigo|sky|teal|emerald|amber|violet|rose|cyan|lime|fuchsia)-[0-9]{2,3}" src/components src/styles
```

为覆盖「无后缀」的裸色类（`bg-white`、`text-black`、`bg-transparent` 等）与任意值写法，
额外执行了扩展扫描：

```bash
# A 调色板词级扫描（无后缀也能命中）
rg -nw "white|black|gray|grey|slate|zinc|neutral|stone|indigo|sky|teal|emerald|amber|violet|rose|cyan|lime|fuchsia" src/components src/styles
# B 任意值 Token 写法
rg -n "\[color:var\([^)]*\)\]" src/components
rg -n "\[var\(--" src/components
# C 组件内任意十六进制 / 颜色函数
rg -n "\[#" src
rg -n "rgb\(|rgba\(|hsl\(|oklch\(|color-mix\(" src/components
# D 透明度斜杠写法
rg -n "(bg|text|border|ring)-[a-z0-9\[\]\.\-]+/[0-9]+" src/components
```

分类标准：

- **① 合法**：位于 `tokens.css` 的 Token 定义、`globals.css` 的 `@theme inline` 映射，
  或按 `docs/development-conventions.md` §2.3 明确许可的 `[color:var(--…)]` 写法
  （用于 Token 的透明度/特殊取值），以及 `transparent` / `current` 等非调色板关键字。
- **② 违规**：组件里直接使用裸色值或 Tailwind 调色板类。
- **③ 可疑**：需要判断的灰色地带（本次均按 §2.3 判定为合法，见 §3.3）。

---

## 3. 命中结果与分类

### 3.1 扫描 1：十六进制颜色

命中 **40 行**，全部位于 `src/styles/tokens.css` → **全部 ①合法**（Token 定义本身）。
`src/components/**` 中命中数为 **0**。

浅色块（`[data-theme="light"]`，第 19–44 行）：

| 行 | Token | 值 |
| --- | --- | --- |
| 19 | `--canvas` | `#f4f4f5` |
| 20 | `--surface` | `#ffffff` |
| 21 | `--surface-elevated` | `#ffffff` |
| 22 | `--surface-card` | `#fafafa` |
| 23 | `--surface-inset` | `#efeff1` |
| 24 | `--hairline` | `#e4e4e7` |
| 25 | `--hairline-strong` | `#d3d3d8` |
| 26 | `--ink` | `#131417` |
| 27 | `--body` | `#3d3f45` |
| 28 | `--mute` | `#71737a` |
| 29 | `--ash` | `#9b9da4` |
| 31 | `--primary` | `#131417` |
| 32 | `--primary-pressed` | `#2a2c31` |
| 33 | `--on-primary` | `#ffffff` |
| 35 | `--accent-blue` | `#0b6fd4` |
| 37 | `--accent-green` | `#10794f` |
| 39 | `--accent-yellow` | `#9a6400` |
| 41 | `--accent-red` | `#c62b2b` |
| 43 | `--on-danger` | `#ffffff` |
| 44 | `--switch-thumb` | `#ffffff`（本次新增） |

深色块（`[data-theme="dark"]`，第 56–81 行）：`--canvas #07080a`、`--surface #0d0d0d`、
`--surface-elevated #101111`、`--surface-card #121212`、`--surface-inset #0a0a0b`、
`--hairline #242728`、`--hairline-strong #333739`、`--ink #f4f4f6`、`--body #cdcdcd`、
`--mute #9c9c9d`、`--ash #6a6b6c`、`--primary #ffffff`、`--primary-pressed #e8e8e8`、
`--on-primary #000000`、`--accent-blue #57c1ff`、`--accent-green #59d499`、
`--accent-yellow #ffc533`、`--accent-red #ff6161`、`--on-danger #1b0d0d`、
`--switch-thumb #f4f4f6`（本次新增）。

同时命中的 `rgba(...)`（`--accent-*-soft`、`--overlay`、`--focus-ring`，第 36/38/40/42/46/47/73/75/77/79/83/84 行）
与 `globals.css` 的 `hsl(var(--shadow-color) / …)`（第 54–57 行）→ **①合法**（Token 定义）。

### 3.2 扫描 2：`dark:` 前缀

命中 **0 行**（`src/components`、`src/styles`，乃至整个 `src/`）→ **无违规**。
主题切换完全由 `<html data-theme="light|dark">` + `@custom-variant dark` 驱动，
符合约定 §2.5。

### 3.3 扫描 3 + 扩展扫描：调色板类与任意值

| # | 位置 | 命中内容 | 分类 |
| --- | --- | --- | --- |
| 1 | `src/components/ui/switch.tsx:25` | `bg-white`（开关滑块） | **②违规** → 已修复 |
| 2 | `src/styles/tokens.css:9` | 注释文字 “near-black canvas” | ①合法（词级扫描误报） |
| 3 | `src/components/ui/badge.tsx:10` | `neutral: "border-border bg-secondary …"` | ①合法（`tone` 变体键名，非颜色类） |
| 4 | `src/components/ui/badge.tsx:18` | `defaultVariants: { tone: "neutral" }` | ①合法（同上） |
| 5 | `src/components/ui/input.tsx:19,43` | `placeholder:text-[color:var(--ash)]` | ③可疑 → ①合法（约定 §2.3） |
| 6 | `src/components/ui/select.tsx:28,52,64` | `text-[color:var(--ash)]` | ③可疑 → ①合法（约定 §2.3） |
| 7 | `src/components/ui/status-dot.tsx:8` | `bg-[color:var(--ash)]` | ③可疑 → ①合法（约定 §2.3） |
| 8 | `src/components/ui/dialog.tsx:24` | `bg-[color:var(--overlay)]` | ③可疑 → ①合法（约定 §2.3） |
| 9 | `src/components/ui/dialog.tsx:45` | `text-[color:var(--ash)]` | ③可疑 → ①合法（约定 §2.3） |
| 10 | `src/components/ui/field.tsx:38` | `text-[color:var(--ash)]` | ③可疑 → ①合法（约定 §2.3） |
| 11 | `src/components/ui/toast.tsx:41,54` | `text-[color:var(--ash)]` | ③可疑 → ①合法（约定 §2.3） |
| 12 | `src/components/ui/toast.tsx:44` | `text-[color:var(--body)]` | ③可疑 → ①合法（约定 §2.3） |
| 13 | `src/components/ui/error-note.tsx:73` | `text-[color:var(--body)]` | ③可疑 → ①合法（约定 §2.3） |
| 14 | `src/components/ui/log-view.tsx:10,49,86,93,101` | `text-[color:var(--ash)]` | ③可疑 → ①合法（约定 §2.3） |
| 15 | `src/components/ui/log-view.tsx:11` | `text-[color:var(--body)]` | ③可疑 → ①合法（约定 §2.3） |
| 16 | `src/components/layout/engine-summary.tsx:42,46` | `text-[color:var(--ash)]` | ③可疑 → ①合法（约定 §2.3） |
| 17 | `src/components/ui/address-field.tsx:33` | `text-[color:var(--ash)]` | ③可疑 → ①合法（约定 §2.3） |
| 18 | `src/components/**` 13 处 | `border-transparent` / `bg-transparent` / `border-l-transparent` / `border-t-transparent` | ①合法（`transparent` 非调色板色） |
| 19 | `src/components/**` 11 处 | `duration-[var(--motion-duration)]`、`ease-[var(--motion-ease)]`、`w-[var(--sidebar-width)]`、`h-[var(--radix-select-trigger-height)]`、`bg-[var(--primary-pressed)]` | ①合法（非颜色任意值 / 约定 §2.3） |
| 20 | `src/components/layout/sidebar.tsx:67` | 斜杠透明度 `hover:bg-sidebar-accent/70` | ①合法（语义 Token + 透明度） |
| 21 | `src/components/**` | `[#…]`、`rgb()`、`hsl()` | 0 命中 |

`③可疑` 的判定依据：`docs/development-conventions.md` §2.3 明确允许
「需要 Token 的透明度或特殊取值时，用 CSS 变量语法 `bg-[color:var(--surface-inset)]`、
`text-[color:var(--ash)]`、`ring-[color:var(--danger-soft)]`」。这些写法引用的是
`tokens.css` 里随主题切换的变量（不是裸色值），因此判定为**合法**，予以保留。

---

## 4. 违规项与修复

### 4.1 违规（②）——已全部修复

| # | 文件:行 | 修复前 | 修复后 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | `src/components/ui/switch.tsx:25` | `bg-white` | `bg-switch-thumb` | 开关滑块硬编码纯白；浅/深主题下都是白色，无法随主题调整，且违反「禁止硬编码颜色」。新增语义 Token `--switch-thumb` 后替换。 |

### 4.2 顺带规范化（③→① 的同类替换，零视觉变化）

以下写法本身合法（§2.3），但其引用的变量**已经有等价的语义 Token 类**，
按「优先使用语义 Token class」的原则统一改为语义类。经 `vite build` 产物核对，
每条新类都生成了对应 CSS，取值与替换前完全一致（同一变量）。

| # | 文件:行 | 修复前 | 修复后 |
| --- | --- | --- | --- |
| 1 | `src/components/ui/switch.tsx:17` | `data-[state=unchecked]:bg-[color:var(--border-strong)]` | `data-[state=unchecked]:bg-border-strong` |
| 2 | `src/components/ui/switch.tsx:18` | `data-[state=checked]:bg-[color:var(--info)]` | `data-[state=checked]:bg-info` |
| 3 | `src/components/ui/input.tsx:21` | `focus-visible:border-[color:var(--info)]` | `focus-visible:border-info` |
| 4 | `src/components/ui/input.tsx:24` | `border-[color:var(--danger)]` / `focus-visible:ring-[color:var(--danger-soft)]` | `border-danger` / `focus-visible:ring-danger-soft` |
| 5 | `src/components/ui/input.tsx:43` | `focus-visible:border-[color:var(--info)]` | `focus-visible:border-info` |
| 6 | `src/components/ui/input.tsx:46` | `border-[color:var(--danger)]` | `border-danger` |
| 7 | `src/components/ui/select.tsx:20` | `focus-visible:border-[color:var(--info)]` | `focus-visible:border-info` |
| 8 | `src/components/ui/scroll-area.tsx:41` | `bg-[color:var(--border-strong)]` | `bg-border-strong` |
| 9 | `src/components/ui/address-field.tsx:43` | `bg-[color:var(--surface-inset)]` | `bg-surface-inset` |
| 10 | `src/components/ui/log-view.tsx:81` | `bg-[color:var(--surface-inset)]` | `bg-surface-inset` |
| 11 | `src/components/ui/toast.tsx:44` | `bg-[color:var(--surface-inset)]` | `bg-surface-inset` |
| 12 | `src/components/ui/error-note.tsx:73` | `bg-[color:var(--surface-inset)]` | `bg-surface-inset` |
| 13 | `src/components/layout/sidebar.tsx:25` | `bg-[color:var(--surface-card)]` | `bg-secondary`（`--secondary: var(--surface-card)`） |
| 14 | `src/components/layout/sidebar.tsx:66,67` | `bg-[color:var(--sidebar-accent)]` / `text-[color:var(--sidebar-accent-foreground)]` | `bg-sidebar-accent` / `text-sidebar-accent-foreground` |
| 15 | `src/components/layout/sidebar.tsx:73` | `bg-[color:var(--info)]` | `bg-info` |
| 16 | `src/components/layout/engine-summary.tsx:26` | `hover:bg-[color:var(--sidebar-accent)]` | `hover:bg-sidebar-accent` |

> 未替换的部分：`--ash`、`--body`、`--overlay`、`--primary-pressed` 这 4 个原始调色板
> 变量没有等价的语义别名，按 §2.3 继续使用 `[color:var(--…)]` 写法。详见 §7「遗留与建议」。

---

## 5. 新增 Token

仅新增 1 个，用于替换唯一的硬编码色 `bg-white`（开关滑块）。命名沿用既有风格
（kebab-case、按角色命名，与 `--surface-inset` 一样属于「随主题变化的原始层」变量，
并在 `@theme inline` 中直接映射为颜色工具类）。

| 变量名 | 浅色（`[data-theme="light"]`） | 深色（`[data-theme="dark"]`） | 语义 |
| --- | --- | --- | --- |
| `--switch-thumb` | `#ffffff` | `#f4f4f6` | Switch 滑块（knob）前景色；浅色取纯白，深色取与深色 `--ink` 同级的近白，避免刺眼 |

映射（`src/styles/globals.css` 的 `@theme inline`）：

```css
--color-switch-thumb: var(--switch-thumb);
```

未引入任何与现有 Token 重复或语义冲突的变量：

- 不复用 `--on-primary`（浅 `#ffffff` / 深 `#000000`，深色下会变成黑色滑块，语义不符）。
- 不复用 `--surface`（深色下为 `#0d0d0d`，会变成深色滑块）。
- `--surface-card` / `--surface-inset` / `--hairline` 等均已被语义别名
  （`--secondary` / `--muted` / `--accent` / `--sidebar-accent` / `--border`）覆盖，
  故未重复新增。

---

## 6. 主题完整性核对

### 6.1 浅/深 Token 对称性

脚本比对两个主题块中定义的变量名集合（去重排序后取差集）：

```
浅色块定义数：28
深色块定义数：28
仅浅色有：无
仅深色有：无
```

结论：**完全对称**，每个浅色 Token 都有同名深色值，反之亦然。

覆盖的 28 个变量：`--canvas --surface --surface-elevated --surface-card --surface-inset
--hairline --hairline-strong --ink --body --mute --ash --primary --primary-pressed
--on-primary --accent-blue --accent-blue-soft --accent-green --accent-green-soft
--accent-yellow --accent-yellow-soft --accent-red --accent-red-soft --on-danger
--switch-thumb --overlay --focus-ring --shadow-color --shadow-strength`。

### 6.2 `@theme inline` 覆盖核对

把 `src/components/**` 中用到的每个颜色类 / `var(--…)` 与 `globals.css` 的
`@theme inline` 声明逐项比对：

- 组件用到的**语义类**：`bg-background`、`bg-card`、`bg-popover`、`bg-secondary`、
  `bg-accent`、`bg-primary`、`bg-sidebar`、`bg-sidebar-accent`、`bg-surface-inset`、
  `bg-border-strong`、`bg-info`、`bg-danger`、`bg-success`、`bg-warning`、
  `bg-*-soft`、`bg-switch-thumb`、`text-foreground`、`text-muted-foreground`、
  `text-popover-foreground`、`text-accent-foreground`、`text-sidebar-foreground`、
  `text-sidebar-accent-foreground`、`text-primary-foreground`、`text-danger-foreground`、
  `text-info` / `text-success` / `text-warning` / `text-danger`、
  `border-border` / `border-border-strong` / `border-input` / `border-info` / `border-danger`、
  `ring-ring` / `ring-danger-soft`、`shadow-panel` / `shadow-popover`
  → **全部已在 `@theme inline` 中声明**（含本次新增的 `--color-switch-thumb`）。
- 组件通过 `[color:var(--…)]` 引用的变量：`--ash`、`--body`、`--overlay`、
  `--surface-inset`、`--border-strong`、`--info`、`--danger`、`--sidebar-accent`、
  `--sidebar-accent-foreground`、`--surface-card`、`--primary-pressed`、`--motion-*`、
  `--sidebar-width`、`--radix-*`
  → **全部在 `tokens.css` 中已定义**（不存在未定义变量；`--radix-*` 由 Radix 运行时注入）。
- 非颜色 Token（`--radius-*`、`--control-height-*`、`--motion-*`、`--font-*`）
  均已在 `tokens.css` 定义；`--radius-*` 与 `--font-*` 已在 `@theme inline` 中映射。

结论：**没有组件使用到未定义或未映射的 Token**。

---

## 7. 交互状态覆盖核对（`src/components/ui/**`）

| 组件 | `focus-visible` 焦点环 | `disabled` 态 | `loading` 态 | `invalid`/错误态 |
| --- | --- | --- | --- | --- |
| `Button` | ✅ `focus-visible:ring-2 ring-ring` | ✅ `disabled:pointer-events-none disabled:opacity-45` | ✅ `loading` prop：`aria-busy` + `Loader2` 旋转 + 强制 `disabled` | n/a |
| `Input` | ✅ `border-info` + `ring-ring` | ✅ `cursor-not-allowed opacity-50` | n/a | ✅ `invalid` → `border-danger` + `ring-danger-soft` |
| `Textarea` | ✅ `border-info` + `ring-ring` | ✅ `cursor-not-allowed opacity-50` | n/a | ✅ `invalid` → `border-danger` |
| `SelectTrigger` | ✅ `border-info` + `ring-ring` | ✅ `cursor-not-allowed opacity-50` | n/a | 由外层 `Field` 承载 |
| `SelectItem` | ✅ Radix `data-highlighted` 高亮 | ✅ `data-[disabled]:pointer-events-none opacity-50` | n/a | n/a |
| `Switch` | ✅ `ring-ring` | ✅ `cursor-not-allowed opacity-50` | n/a | n/a |
| `TabsTrigger` | ✅ `ring-ring` | ✅ `pointer-events-none opacity-50`（本次补齐 `pointer-events-none`） | n/a | n/a |
| `Dialog` 关闭按钮 | ✅ `ring-ring` | n/a | n/a | n/a |
| `DropdownMenuItem` | ✅ Radix `data-highlighted`（键盘高亮即焦点指示） | ✅ `data-[disabled]:pointer-events-none opacity-50` | n/a | ✅ `tone="danger"` |
| `DropdownMenuCheckboxItem` | ✅ `data-highlighted`（本次补齐 `text-accent-foreground`） | ✅ `pointer-events-none opacity-50`（本次补齐） | n/a | n/a |
| `Label` | n/a | ✅ `peer-disabled:cursor-not-allowed opacity-60` | n/a | n/a |
| `Toaster` 关闭按钮 | ✅ `ring-ring` | n/a | n/a | ✅ 4 种 `tone` |
| `LogView` / `AddressField` / `CopyButton` / `ErrorNote` | 复用 `Button` / `Input` | 复用 | 复用 | ✅ `ErrorNote` 渲染 `UserFacingError` |
| `Callout` / `Badge` / `StatusDot` / `Skeleton` / `EmptyState` | 非交互 | n/a | `Skeleton` 为加载占位 | ✅ `danger` / `warning` 等 tone |

本次实际改动：

- `src/components/ui/tabs.tsx:35`：`disabled:opacity-50` → `disabled:pointer-events-none disabled:opacity-50`
  （与 `Button` 一致；Radix 的 `disabled` 属性已阻止点击，此处补上指针语义）。
- `src/components/ui/dropdown-menu.tsx:41`：`DropdownMenuCheckboxItem` 高亮态补 `data-[highlighted]:text-accent-foreground`，与 `DropdownMenuItem` 对齐。
- `src/components/ui/dropdown-menu.tsx:62`：`DropdownMenuCheckboxItem` 禁用态补 `data-[disabled]:pointer-events-none`。

未改动任何组件的公开 props 签名。

---

## 8. 跨平台字体核对

`src/styles/tokens.css` 第 143–146 行：

```css
--font-sans: "Inter Variable", "Inter", system-ui, "Segoe UI", "Noto Sans SC", sans-serif;
--font-mono: "JetBrains Mono Variable", "JetBrains Mono", ui-monospace,
  SFMono-Regular, Menlo, Consolas, monospace;
```

结论：**通过**。

- 主字体均为开源可替代字体，且通过 `src/main.tsx` 的
  `@fontsource-variable/inter` 与 `@fontsource-variable/jetbrains-mono` 随应用打包，
  不依赖系统已安装字体。
- `system-ui` / `"Segoe UI"` / `SFMono-Regular` / `Menlo` / `Consolas` 只出现在**回退链末尾**，
  不会成为唯一选项；三平台（macOS / Windows / Linux）均可回退到通用族。
- 代码字体（`t-mono`、`code`、`kbd`、`pre`、`samp`、`.font-mono`）走 `--font-mono`，
  以 JetBrains Mono 为主，符合「开源等宽字体」要求。
- 未出现 `-apple-system`、`BlinkMacSystemFont`、`Roboto`、`Helvetica Neue` 等单一平台专属
  字体名作为主选项。

---

## 9. 交付前自测（真实执行）

| 命令 | 结果 |
| --- | --- |
| `pnpm run typecheck` | ✅ 退出码 0（`tsc --noEmit` 无报错） |
| `pnpm test` | ✅ 退出码 0（`Test Files 9 passed (9)`，`Tests 59 passed (59)`） |
| `pnpm test`（复核，2026-10-14，加入引擎下载面板后） | ✅ 退出码 0（`Test Files 10 passed (10)`，`Tests 64 passed (64)`） |
| `pnpm run build` | ✅ 退出码 0（`tsc --noEmit && vite build`，产物 `dist/assets/index-*.css`） |

产物核对：在构建产物 `dist/assets/index-*.css` 中确认以下类均已生成（本次新增/替换）：
`.bg-switch-thumb`、`.data-[state=unchecked]:bg-border-strong`、`.data-[state=checked]:bg-info`、
`.bg-surface-inset`、`.bg-border-strong`、`.bg-info`、`.border-info`、`.border-danger`、
`.ring-danger-soft`、`.bg-sidebar-accent`、`.hover:bg-sidebar-accent/70`、
`.text-sidebar-accent-foreground`、`.bg-secondary`；并确认 `--switch-thumb:#fff`（浅）与
`--switch-thumb:#f4f4f6`（深）两套值均写入产物。

### 9.1 关于测试期间出现过的一次抖动（非本任务文件，现已恢复）

审计中期的一次全量运行里，`src/features/home/__tests__/HomeScreen.test.tsx:144`
（`expect(screen.getByText(/1m 05s/))`）曾短暂失败：

```
FAIL src/features/home/__tests__/HomeScreen.test.tsx > HomeScreen > shows running tasks with a masked token and stops them
TestingLibraryElementError: Unable to find an element with the text: /1m 05s/.
```

分析：

1. 该用例单独运行 `npx vitest run src/features/home/__tests__/HomeScreen.test.tsx` → 5/5 通过，
   仅全量并行时失败，属时序抖动：`runningTask.startedAt` 在**模块导入时**用
   `Date.now() - 65_000` 计算，断言在测试执行时才比对固定字符串，收集阶段耗时会使其漂移。
2. 与本次改动无关：失败文件位于 `src/features/**`（本任务禁止修改），
   且 `vitest.config.ts` 中 `css: false`，样式文件不参与测试运行。
3. 该文件由其它子代理修复后已恢复通过。复核时确认：用例内已冻结系统时间
   （`vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime(...)`），
   断言不再依赖真实时钟。连续 3 次单独运行 `HomeScreen.test.tsx` 与 1 次全量
   运行均为 **9/9 文件、59/59 用例全部通过**（本次复审时新增了引擎下载面板测试，
   当前总量为 **10/10 文件、64/64 用例**，见上表）。

---

## 10. 遗留与建议（未在本任务范围内修改）

1. **`--ash` / `--body` / `--overlay` / `--primary-pressed` 无语义别名**：共 22 行仍在用
   `[color:var(--…)]`。这是 `docs/development-conventions.md` §2.3 明确许可的写法，故保留；
   若希望组件层做到 100% 语义类化，可后续在 `tokens.css` 增加对应别名
   （如 `--color-ash: var(--ash)` 等）并在 `@theme inline` 映射，同时更新 §2 的允许清单。
   注意 `--surface-card` 已被 `--secondary` / `--muted` / `--accent` / `--sidebar-accent`
   覆盖，**不应**再新增重复变量。
2. **`docs/development-conventions.md` §2.3 的示例**仍写着 `bg-[color:var(--surface-inset)]`，
   本次已把该写法换成语义类 `bg-surface-inset`；建议同步更新文档示例。
3. `Switch` 滑块在浅色主题的未选中态（滑块 `#ffffff` on 轨道 `#d3d3d8`）对比度偏低，
   如需更强的可辨识度，可在后续设计评审中为滑块加一圈 `--hairline-strong` 描边。
4. `DropdownMenu*` 依赖 Radix 的 `data-highlighted` 作为键盘焦点指示（未额外加 `ring`），
   这是菜单类组件的通行做法，判定为可接受；若设计规范要求统一的 `ring` 焦点环，可后续统一。

---

## 11. 改动文件清单

```
src/styles/tokens.css                     +2  新增 --switch-thumb（浅/深）
src/styles/globals.css                    +1  新增 --color-switch-thumb 映射
src/components/ui/switch.tsx              3   bg-white → bg-switch-thumb；轨道改语义类
src/components/ui/input.tsx               4   焦点/错误态改语义类
src/components/ui/select.tsx              1   焦点态改语义类
src/components/ui/scroll-area.tsx         1   滑块改语义类
src/components/ui/address-field.tsx       1   bg-surface-inset
src/components/ui/log-view.tsx            1   bg-surface-inset
src/components/ui/toast.tsx               1   bg-surface-inset
src/components/ui/error-note.tsx          1   bg-surface-inset
src/components/ui/tabs.tsx                1   补齐 disabled:pointer-events-none
src/components/ui/dropdown-menu.tsx        2   补齐高亮/禁用态
src/components/layout/sidebar.tsx         4   改语义类（logo 底、选中态、指示条）
src/components/layout/engine-summary.tsx  1   hover 态改语义类
docs/theme-audit.md                      新建  本报告
```

未触碰：`src/features/**`、`src/store/**`、`src/lib/**`、`src/App.tsx`、`src-tauri/**`、
`package.json`、`src/components/layout/quit-guard*`（由其它子代理负责）。
