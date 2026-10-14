# Tailcat Box 设计规范

> 本文档是 Tailcat Box 桌面 GUI 的**权威设计规范**，描述的是**已经实现**的设计系统。
>
> 唯一事实来源（冲突时以代码为准，本文档与代码不一致即视为缺陷）：
>
> | 来源 | 内容 |
> | --- | --- |
> | `src/styles/tokens.css` | 浅色 / 深色语义 Token 的唯一事实来源 |
> | `src/styles/globals.css` | Tailwind v4 `@theme inline` 映射、`t-*` 排版角色、动效 |
> | `src/components/ui/**` | 基础组件与真实 props |
> | `src/components/layout/**` | 应用外壳与页面骨架 |
> | `docs/development-conventions.md` | 强制开发约定 |

---

## 1. 设计原则与视觉方向

1. **开发者工具气质**：界面本身是工具，不是宣传页。信息密度优先于留白，控件尺寸紧凑（默认控件高 32px、正文 13px）。
2. **克制**：近黑 / 近白的中性画布 + 1px 发丝边框 + 单一高对比主色。强调色只用于状态，不用于装饰。
3. **层级靠表面阶梯，不靠装饰**：画布 → 面板 → 浮层通过 `--canvas / --surface / --surface-elevated` 的细微明度差表达层级，而不是靠大阴影或渐变。
4. **诚实**：任何数值没有真实数据时显示 `—`，不得伪造进度、速度、连接状态或测试结果。
5. **可迁移**：不依赖 macOS 独有字体或系统控件；深浅两套主题都必须完整可用。

### 与 Raycast 的关系（明确边界）

- **借鉴**：暗色克制语言、发丝 1px 边框、命令面板式紧凑行高、表面阶梯、状态强调色点缀。
- **不使用**：Raycast 的品牌标识、Logo、红色斜条纹 hero、营销网站式的整页截图布局、96px 级别的营销区块间距、任何营销文案结构。
- 本项目是**桌面应用界面**，不是营销页；所有布局规则见第 6 节。

---

## 2. 主题机制

- 主题由 `<html>` 上的 `data-theme="light" | "dark"` 驱动，**不是**靠 `prefers-color-scheme` 媒体查询直接切换。
- `settings.theme` 有三个值：`light` / `dark` / `system`；`system` 由 `src/lib/theme.ts` 解析为具体值后再写入 DOM，因此**每个页面同时翻转**。
- `index.html` 预置 `data-theme="dark"`，`main.tsx` 在 React 挂载前调用 `applyStoredTheme()`，避免首帧闪烁；`color-scheme` 随主题同步。
- 组件内**禁止**用 `dark:` 分支写死颜色。只在确实需要「深色下才有差异」时使用，并且差异必须来自 Token。

---

## 3. 设计 Token

`src/styles/tokens.css` 共 **109 处变量声明**：浅色原始色板 28 + 深色原始色板 28 + 语义别名 32 + 圆角 8 + 字体 4 + 密度 6 + 动效 3（含 `prefers-reduced-motion` 覆盖）。去重后为 **80 个唯一变量名**，下表逐条覆盖，不多不少。

### 3.1 画布 / 侧边栏 / 面板 / 浮层

| 变量 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `--canvas` | `#f4f4f5` | `#07080a` | 应用最底层画布 |
| `--surface` | `#ffffff` | `#0d0d0d` | 面板 / 卡片默认底色 |
| `--surface-elevated` | `#ffffff` | `#101111` | 浮层底色（Dialog / Dropdown / Select / Toast） |
| `--surface-card` | `#fafafa` | `#121212` | 次级底色：Tab 列表、图标座、hover 底色 |
| `--surface-inset` | `#efeff1` | `#0a0a0b` | 内嵌凹陷区：侧边栏、日志、代码块、脱敏地址框 |
| `--overlay` | `rgba(19, 20, 23, 0.36)` | `rgba(0, 0, 0, 0.6)` | 模态遮罩 |
| `--background` | → `--canvas` | → `--canvas` | 页面背景（`bg-background`） |
| `--foreground` | → `--ink` | → `--ink` | 默认文字（`text-foreground`） |
| `--card` | → `--surface` | → `--surface` | 面板底色（`.panel`、`bg-card`） |
| `--card-foreground` | → `--ink` | → `--ink` | 面板内文字 |
| `--popover` | → `--surface-elevated` | → `--surface-elevated` | 浮层底色（`bg-popover`） |
| `--popover-foreground` | → `--ink` | → `--ink` | 浮层内文字 |
| `--secondary` | → `--surface-card` | → `--surface-card` | 次级底色（`bg-secondary`） |
| `--secondary-foreground` | → `--ink` | → `--ink` | 次级底色上的文字 |
| `--muted` | → `--surface-card` | → `--surface-card` | 弱化底色 |
| `--accent` | → `--surface-card` | → `--surface-card` | 通用 hover 底色（`bg-accent`） |
| `--accent-foreground` | → `--ink` | → `--ink` | hover 底色上的文字 |
| `--sidebar` | → `--surface-inset` | → `--surface-inset` | 左侧导航底色（`bg-sidebar`） |
| `--sidebar-foreground` | → `--body` | → `--body` | 导航默认文字 |
| `--sidebar-accent` | → `--surface-card` | → `--surface-card` | 导航 hover / 选中底色 |
| `--sidebar-accent-foreground` | → `--ink` | → `--ink` | 导航选中文字 |
| `--sidebar-border` | → `--hairline` | → `--hairline` | 导航右侧 1px 分隔线 |

### 3.2 边框与分隔线

| 变量 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `--hairline` | `#e4e4e7` | `#242728` | 1px 默认边框 / 分隔线 |
| `--hairline-strong` | `#d3d3d8` | `#333739` | 强边框、滚动条滑块、hover 边框 |
| `--border` | → `--hairline` | → `--hairline` | 边框 Token（`border-border`） |
| `--border-strong` | → `--hairline-strong` | → `--hairline-strong` | 强边框（`border-border-strong`） |
| `--input` | → `--hairline-strong` | → `--hairline-strong` | 输入类控件边框（`border-input`） |

### 3.3 文本层级

| 变量 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `--ink` | `#131417` | `#f4f4f6` | 主文本 / 标题 |
| `--body` | `#3d3f45` | `#cdcdcd` | 次文本 / 正文 |
| `--mute` | `#71737a` | `#9c9c9d` | 弱文本：说明、副标题 |
| `--ash` | `#9b9da4` | `#6a6b6c` | 禁用 / 占位符 / 极弱信息（时间戳、图标） |
| `--muted-foreground` | → `--mute` | → `--mute` | 弱文本语义别名（`text-muted-foreground`） |

> 「禁用」不引入独立色值：统一用 `opacity-45`（按钮）或 `opacity-50`（输入、开关）叠加在弱文本之上。

### 3.4 强调色与交互态

| 变量 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `--primary` | `#131417` | `#ffffff` | 主按钮底色（浅色为墨黑，深色为纯白） |
| `--primary-pressed` | `#2a2c31` | `#e8e8e8` | 主按钮 hover / active |
| `--on-primary` | `#ffffff` | `#000000` | 主按钮文字 |
| `--primary-bg` | → `--primary` | → `--primary` | 主按钮底色别名（`bg-primary`） |
| `--primary-foreground` | → `--on-primary` | → `--on-primary` | 主按钮文字别名 |
| `--switch-thumb` | `#ffffff` | `#f4f4f6` | Switch 滑块颜色（`bg-switch-thumb`） |
| `--focus-ring` | `rgba(11, 111, 212, 0.55)` | `rgba(87, 193, 255, 0.6)` | 焦点环颜色 |
| `--ring` | → `--focus-ring` | → `--focus-ring` | 焦点环别名（`ring-ring`） |

### 3.5 状态色与柔和底色

| 变量 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `--accent-blue` | `#0b6fd4` | `#57c1ff` | 信息 / 选中标记 / 链接 |
| `--accent-blue-soft` | `rgba(11, 111, 212, 0.1)` | `rgba(87, 193, 255, 0.15)` | 信息柔和底色；也是 `::selection` 底色 |
| `--accent-green` | `#10794f` | `#59d499` | 成功 / 运行中 |
| `--accent-green-soft` | `rgba(16, 121, 79, 0.1)` | `rgba(89, 212, 153, 0.15)` | 成功柔和底色 |
| `--accent-yellow` | `#9a6400` | `#ffc533` | 警告 / 启动中 / 预览模式 |
| `--accent-yellow-soft` | `rgba(154, 100, 0, 0.12)` | `rgba(255, 197, 51, 0.15)` | 警告柔和底色 |
| `--accent-red` | `#c62b2b` | `#ff6161` | 危险 / 失败 |
| `--accent-red-soft` | `rgba(198, 43, 43, 0.1)` | `rgba(255, 97, 97, 0.15)` | 危险柔和底色 |
| `--on-danger` | `#ffffff` | `#1b0d0d` | 实心危险按钮文字 |
| `--success` | → `--accent-green` | → `--accent-green` | `text-success` |
| `--success-soft` | → `--accent-green-soft` | → `--accent-green-soft` | `bg-success-soft` |
| `--warning` | → `--accent-yellow` | → `--accent-yellow` | `text-warning` |
| `--warning-soft` | → `--accent-yellow-soft` | → `--accent-yellow-soft` | `bg-warning-soft` |
| `--danger` | → `--accent-red` | → `--accent-red` | `text-danger` |
| `--danger-soft` | → `--accent-red-soft` | → `--accent-red-soft` | `bg-danger-soft` |
| `--danger-foreground` | → `--on-danger` | → `--on-danger` | `text-danger-foreground` |
| `--info` | → `--accent-blue` | → `--accent-blue` | `text-info` |
| `--info-soft` | → `--accent-blue-soft` | → `--accent-blue-soft` | `bg-info-soft` |

### 3.6 阴影参数

| 变量 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `--shadow-color` | `220 20% 20%` | `0 0% 0%` | 阴影 HSL 色相分量 |
| `--shadow-strength` | `0.08` | `0.5` | 阴影强度系数（浅色几乎不可见，深色更重） |

### 3.7 圆角

| 变量 | 值 | 用途 |
| --- | --- | --- |
| `--radius-none` | `0px` | 无圆角 |
| `--radius-xs` | `4px` | Badge、快捷键 `kbd` |
| `--radius-sm` | `6px` | Tooltip、Select / Dropdown 选项、Skeleton、代码块、Dialog 关闭按钮 |
| `--radius-md` | `8px` | Button、Input、Textarea、Callout、ErrorNote、SelectTrigger、TabsList、侧边栏项、AddressField |
| `--radius-lg` | `10px` | `.panel`、Toast、EmptyState 容器 |
| `--radius-xl` | `16px` | DialogContent |
| `--radius-full` | `9999px` | Switch、StatusDot、滚动条滑块、侧边栏激活指示条 |
| `--radius` | → `--radius-md` | 默认圆角（8px） |

### 3.8 字体

| 变量 | 值 | 用途 |
| --- | --- | --- |
| `--font-sans` | `"Inter Variable", "Inter", system-ui, "Segoe UI", "Noto Sans SC", sans-serif` | 界面字体；Inter 为开源可替代字体，回退到各平台系统无衬线 |
| `--font-mono` | `"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | 代码 / 地址 / 端口 / 路径；JetBrains Mono 为开源等宽字体，回退到通用等宽 |
| `--font-feature-sans` | `"calt", "kern", "liga", "ss03"` | 界面字体 OpenType 特性 |
| `--font-feature-mono` | `"calt", "kern", "liga"` | 等宽字体 OpenType 特性（不含 `ss03`） |

### 3.9 密度

| 变量 | 值 | 用途 |
| --- | --- | --- |
| `--control-height-sm` | `28px` | 小控件高度刻度 |
| `--control-height` | `32px` | 默认控件高度刻度（按钮 / 输入 / 下拉） |
| `--control-height-lg` | `36px` | 大控件高度刻度 |
| `--control-height-xl` | `44px` | 超大控件高度刻度 |
| `--sidebar-width` | `232px` | 左侧导航宽度 |
| `--titlebar-height` | `40px` | 自定义标题栏 / 拖拽区高度刻度 |

### 3.10 动效

| 变量 | 值 | 用途 |
| --- | --- | --- |
| `--motion-duration` | `140ms` | 统一过渡时长；`prefers-reduced-motion: reduce` 时覆盖为 `0ms` |
| `--motion-ease` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | 统一缓动曲线 |

---

## 4. 排版

### 4.1 字体族策略

- 界面：`--font-sans`。Inter 为开源可替代字体，缺失时逐级回退到 `system-ui` / `Segoe UI` / `Noto Sans SC`，**不绑定任何平台独有字体**。
- 代码 / 地址 / 端口 / 路径 / 日志：`--font-mono`（JetBrains Mono，开源等宽），缺失时回退 `ui-monospace` / `SFMono-Regular` / `Menlo` / `Consolas`。
- `code`、`kbd`、`pre`、`samp`、`.font-mono` 在 `globals.css` 全局绑定等宽字体。
- `body` 基础字号 13px / 行高 1.5，启用 `-webkit-font-smoothing: antialiased`。

### 4.2 排版角色类（`t-*`）

定义在 `src/styles/globals.css` 的 `@layer components`，按密度从 `DESIGN.md` 基线压缩而来。

| 类 | 字号 | 字重 | 行高 | 字距 | 用途 |
| --- | --- | --- | --- | --- | --- |
| `t-display` | 24px | 600 | 1.25 | -0.01em | 极少使用的大标题 |
| `t-title-lg` | 18px | 600 | 1.35 | -0.005em | 页面标题（`PageHeader`）、Dialog 标题 |
| `t-title` | 15px | 600 | 1.4 | 0 | 面板标题（`PanelHeader`）、空态标题 |
| `t-subtitle` | 13px | 500 | 1.45 | 0 | 表单标签、Callout 标题、Toast 标题 |
| `t-body` | 13px | 400 | 1.55 | 0 | 正文段落 |
| `t-caption` | 12px | 400 | 1.45 | 0.01em | 说明文字、键值表、时间戳 |
| `t-overline` | 11px | 600 | 1.4 | 0.08em（大写） | 分组标题，自动着色 `--muted-foreground` |
| `t-mono` | 12.5px | — | 1.5 | 0 | 等宽内容，关闭连字（`font-variant-ligatures: none`） |

规则：

- 正文默认 13px；辅助信息一律 `t-caption`；不要用内联 `text-[Npx]` 替代角色类，除非该处是组件内部的局部刻度。
- `t-display` 与 `t-body` 在实际页面中使用极少；优先 `t-title-lg` / `t-title` / `t-subtitle` / `t-caption`。

### 4.3 组件内局部字号（已被组件封装，页面不要重复设置）

| 场景 | 字号 |
| --- | --- |
| Button `sm` | 12px |
| Button `md` / `lg` | 13px |
| Badge | 11px |
| Input / Textarea / SelectTrigger | 13px（`mono` 为 12.5px） |
| TabsTrigger | 12px |
| Tooltip | 12px |
| DropdownMenu / SelectItem | 13px |
| LogView 行 | 11.5px（时间戳/流标记同宽） |
| ErrorNote 代码 | 11px（正文）/ 11.5px（详情块） |

---

## 5. 间距 / 圆角 / 控件高度 / 阴影 / 边框

### 5.1 间距刻度（实际使用值，4px 基准）

| 值 | 用途示例 |
| --- | --- |
| 2px | 标签与内容、列表项之间（`gap-0.5`） |
| 4px | 图标与文字（`gap-1`） |
| 6px | 按钮组、Field 内部（`gap-1.5`） |
| 8px | 常规元素间距（`gap-2`）、`px-2` |
| 10px | 卡片内边距（`px-2.5`）、Callout 图标间距（`gap-2.5`） |
| 12px | `px-3 py-3`、`gap-3` |
| 14px | `PanelBody` 纵向内边距（`py-3.5`）、侧边栏头 `px-3.5` |
| 16px | `px-4 py-4`、区块间距（`gap-4`）、`ScreenBody` 区块间距 |
| 20px | Dialog 内边距（`px-5`）、`ScreenBody` 纵向内边距（`py-5`） |
| 24px | 页面水平内边距（`px-6`）、`PageHeader` 内边距 |
| 40px | 空态纵向留白（`py-10`） |

### 5.2 圆角

只用 `rounded-xs | sm | md | lg | xl | full`（对应 Token）。映射见 3.7。禁止使用未在 Token 中定义的任意圆角值。

### 5.3 控件高度

| 控件 | 高度 |
| --- | --- |
| Button `sm` / `icon-sm` | 28px（`h-7` / `size-7`） |
| Button `md` / `icon` | 32px（`h-8` / `size-8`） |
| Button `lg` | 36px（`h-9`） |
| Input / Textarea 行高 / SelectTrigger | 32px（`h-8`） |
| TabsTrigger | 24px（`h-6`） |
| Switch | 18px（`h-[18px] w-8`，thumb 14px） |
| 侧边栏导航项 | 32px（`h-8`） |
| 侧边栏头部 | 48px（`h-12`） |

### 5.4 阴影

阴影 Token 定义在 `globals.css` 的 `@theme inline`，由 `--shadow-color` / `--shadow-strength` 派生：

| Token | 定义 | 使用位置 |
| --- | --- | --- |
| `shadow-panel` | `0 1px 2px hsl(… / strength×0.6), 0 8px 24px hsl(… / strength)` | 面板级浮起（谨慎使用） |
| `shadow-popover` | `0 2px 6px hsl(… / strength×0.7), 0 16px 40px hsl(… / strength×1.2)` | Dialog、Toast、DropdownMenu、Select、Tooltip |
| Tailwind `shadow-sm` | 极轻投影 | Tabs 激活态、Switch thumb |

浅色 `--shadow-strength: 0.08`（几乎不可见），深色 `0.5`。禁止新增装饰性阴影。

### 5.5 边框宽度

| 宽度 | 用途 |
| --- | --- |
| 1px | 所有边框、分隔线（`border`、`hairline-divider`、`Separator`） |
| 2px | 焦点环（`:focus-visible` outline / `ring-2`）、侧边栏激活指示条 |

滚动条：`scrollbar-width: thin`，WebKit 宽/高 10px，滑块用 `--border-strong`，hover 用 `--ash`，轨道透明，滑块圆角 `--radius-full`。

---

## 6. 组件规则

以下组件全部导出自 `src/components/ui/**`，名称与导出名一致。使用页面时优先复用，缺失才新增（新组件同样放该目录并遵守本规范）。

### 6.1 操作与反馈

| 导出 | 用途 | 关键 props | 尺寸 / 变体 | 状态要求 |
| --- | --- | --- | --- | --- |
| `Button` | 所有操作入口 | `variant`、`size`、`loading`、`asChild`、`disabled` | variant：`primary` / `secondary` / `subtle` / `ghost` / `danger` / `dangerGhost` / `link`；size：`sm`(28px/12px) / `md`(32px/13px) / `lg`(36px/13px) / `icon`(32px) / `icon-sm`(28px) | 默认 `secondary`；hover 按变体（primary → `--primary-pressed`，secondary → `border-strong`+`bg-accent`）；active 同 hover；focus-visible `ring-2 ring-ring`；disabled `opacity-45` + `pointer-events-none`；loading 时自动 disabled，并把图标换成 `animate-spin-slow` 的加载图标，同时置 `aria-busy` |
| `ButtonProps` | `Button` 的 props 类型（含 `asChild`、`loading`） | — | — | — |
| `CopyButton` | 复制到剪贴板 + 成功反馈 | `value`、`label`、`successTitle`，其余透传 `ButtonProps` | 继承 `Button` | 成功：图标切换为对勾（`text-success`）+ Toast，1.4s 后复位；失败：`failToast`；禁用/加载继承 `Button` |
| `Badge` | 状态 / 分类标签（纯展示） | `tone` | `neutral` / `info` / `success` / `warning` / `danger` / `outline`；11px、`rounded-xs`、`px-1.5 py-0.5` | 无交互态；不得用作按钮 |
| `BadgeProps` | `Badge` 的 props 类型 | — | — | — |
| `StatusDot` | 任务状态圆点 | `status`、`pulse` | 8px（`size-2`）、`rounded-full` | `starting`/`stopping` → `bg-warning`；`running` → `bg-success`（`pulse` 时 `animate-pulse-ring`）；`stopped` → `--ash`；`failed` → `bg-danger`；始终 `aria-hidden`，语义由相邻文本承担 |
| `Callout` | 风险 / 提示块 | `tone`、`title`、`actions`、`children` | `info` / `warning` / `danger` / `risk` / `success`；`rounded-md px-3 py-2.5` | `danger` / `risk` 使用 `role="alert"`，其余 `role="note"`；底色为对应 `*-soft`，文字与图标为对应状态色 |
| `ErrorNote` | 渲染归一化后的后端错误对象（类型见 `src/lib/types.ts`） | `error`、`compact` | `rounded-md bg-danger-soft px-3 py-2.5 text-danger` | `role="alert"`；默认只显示 `message` / `hint` / `code`，`detail` 折叠（点击展开 + 复制）；**原始进程输出默认不展示** |
| `Toaster` | 全局通知容器（挂在 `AppShell`，页面不自行渲染） | 无 | `bottom-4 right-4`、宽 `min(360px, 100vw-2rem)`、`rounded-lg`、`shadow-popover` | `aria-live="polite"`；tone：`info` / `success` / `warning` / `danger`；入场 `animate-rise-in`；`detail` 折叠在「技术细节」中；每条可单独关闭 |
| `EmptyState` | 空数据占位 | `icon`、`title`、`description`、`action` | `rounded-lg` + `border-dashed`、`px-6 py-10` | 纯展示；`title` 用 `t-title`，`description` 用 `t-caption text-muted-foreground` |
| `Skeleton` | 加载占位 | `className` | `rounded-sm bg-secondary` + `animate-pulse` | 必须 `aria-hidden`；尺寸由调用方通过 `className` 指定（与最终内容同高） |

### 6.2 表单控件

| 导出 | 用途 | 关键 props | 尺寸 / 变体 | 状态要求 |
| --- | --- | --- | --- | --- |
| `Input` | 单行输入 | `invalid`、`mono`，其余透传原生 input | `h-8`、`rounded-md`、13px（`mono` 12.5px） | hover `border-border-strong`；focus `border-info` + `ring-2 ring-ring`；`invalid` 时 `border-danger` + `ring-danger-soft` 并置 `aria-invalid`；disabled `opacity-50` + `cursor-not-allowed`；placeholder 用 `--ash` |
| `Textarea` | 多行输入 | `invalid` | `rounded-md`、`px-2.5 py-2`、13px | 同 `Input` 的 focus / invalid / disabled 规则 |
| `InputProps` | `Input` 的 props 类型 | — | — | — |
| `Label` | 表单标签 | Radix `Label` props | `t-subtitle`、`text-foreground`、`select-none` | 控件 disabled 时 `peer-disabled:opacity-60` |
| `Field` | label + 控件 + hint/error 的垂直节奏容器 | `label`、`htmlFor`、`hint`、`error`、`required`、`optional`、`optionalLabel` | `flex-col gap-1.5` | `error` 优先于 `hint`，`text-danger` 且 `role="alert"`；`required` 追加 `*`（`text-danger`）；`optional` 显示右侧弱化标记 |
| `Select` | 下拉选择根节点 | Radix `Select` props | — | — |
| `SelectGroup` | 选项分组 | Radix | — | — |
| `SelectValue` | 当前值占位 | Radix | 自动截断 | — |
| `SelectTrigger` | 下拉触发器 | Radix `SelectTrigger` | `h-8`、`rounded-md`、13px、右侧下拉箭头图标 | hover `border-border-strong`；focus `border-info` + `ring-2 ring-ring`；disabled `opacity-50` |
| `SelectContent` | 下拉浮层 | `position`（默认 `popper`） | `rounded-md`、`bg-popover`、`shadow-popover`、`max-h-72` | 打开时 `animate-fade-in`；含上下滚动按钮 |
| `SelectLabel` | 选项组标题 | Radix | `t-overline` | — |
| `SelectItem` | 选项 | Radix | `rounded-sm py-1.5 pl-2 pr-7`、13px | 高亮 `bg-accent`；选中显示勾选图标（`text-info`）；disabled `opacity-50` |
| `SelectSeparator` | 选项分隔线 | Radix | `h-px bg-border` | — |
| `Switch` | 布尔开关 | Radix `Switch` props | 18px × 32px，thumb 14px（`bg-switch-thumb`） | 关 `bg-[--border-strong]`、开 `bg-[--info]`；thumb 位移 `2px → 16px`，过渡 `--motion-duration`；focus-visible `ring-2 ring-ring`；disabled `opacity-50` |

### 6.3 容器与结构

| 导出 | 用途 | 关键 props | 尺寸 / 变体 | 状态要求 |
| --- | --- | --- | --- | --- |
| `Panel` | 标准卡片容器（`.panel`） | 原生 `div` props | `--card` 底 + 1px `--border` + `radius-lg` | 纯展示 |
| `PanelHeader` | 面板标题区 | `title`、`description`、`actions` | `px-4 py-3` + 底部 1px 分隔线；标题 `t-title` | 标题截断；actions 右侧固定 |
| `PanelBody` | 面板内容区 | 原生 `div` props | `px-4 py-3.5` | — |
| `PanelFooter` | 面板底部操作区 | 原生 `div` props | `px-4 py-3` + 顶部 1px 分隔线；内容右对齐 | — |
| `SectionTitle` | 区块小标题 | `children`、`action` | `t-overline` + 右侧 action，`mb-2.5` | — |
| `Separator` | 分隔线 | `orientation`（默认 `horizontal`）、`decorative` | 1px、`bg-border` | 默认装饰性（不进入无障碍树） |
| `ScrollArea` | 自定义滚动容器 | Radix `ScrollArea` props | `relative overflow-hidden` | 配合 `ScrollBar` 使用 |
| `ScrollBar` | 滚动条 | `orientation` | 8px 宽，thumb `--border-strong`、`rounded-full` | — |
| `Tabs` | 标签页根节点 | Radix `Tabs` props | — | — |
| `TabsList` | 标签容器 | Radix | `rounded-md` + `bg-secondary` + `p-0.5` | — |
| `TabsTrigger` | 单个标签 | Radix | `h-6`、`rounded-sm`、12px | 默认 `text-muted-foreground`；hover `text-foreground`；激活 `bg-card` + `shadow-sm`；focus-visible `ring-2 ring-ring`；disabled `opacity-50` |
| `TabsContent` | 标签内容 | Radix | — | 自身不显示焦点轮廓 |
| `KeyValueList` | 键值表容器（`dl`） | 原生 props | 两列网格 `[minmax(88px,auto)_1fr]`，`gap-x-4 gap-y-1.5` | 与 `KeyValue` 成对使用 |
| `KeyValue` | 单个键值对 | `label`、`mono` | 键 `t-caption text-muted-foreground`；值 `t-caption text-foreground`（`mono` 12px） | 无数据时值为 `—` |
| `PageHeader` | 页面标题区 | `title`、`description`、`actions` | `px-6 py-4` + 底部 1px 分隔线；标题 `t-title-lg` | 标题截断；description `t-caption` 限宽 |

### 6.4 浮层与菜单

| 导出 | 用途 | 关键 props | 尺寸 / 变体 | 状态要求 |
| --- | --- | --- | --- | --- |
| `Dialog` | 模态根节点 | Radix `Dialog` props | — | — |
| `DialogTrigger` | 打开触发器 | Radix | — | — |
| `DialogClose` | 关闭按钮（可复用） | Radix | — | — |
| `DialogContent` | 模态内容 | `size`、`hideClose` | size：`sm`(max-w-sm) / `md`(max-w-lg) / `lg`(max-w-2xl)；`rounded-xl`、`bg-popover`、`shadow-popover`、`max-h-[88vh]` | 遮罩 `--overlay` + `backdrop-blur-[1px]`，打开 `animate-fade-in`；内容 `animate-rise-in`；右上角关闭按钮（`hideClose` 可隐藏） |
| `DialogHeader` | 模态标题区 | `title`、`description` | `px-5 py-4` + 底部分隔线；标题 `t-title-lg` | 必须提供 `title`（Radix 无障碍要求） |
| `DialogBody` | 模态内容区（可滚动） | 原生 props | `px-5 py-4`、`overflow-y-auto` | — |
| `DialogFooter` | 模态底部操作区 | 原生 props | `px-5 py-3.5` + 顶部分隔线；右对齐 | — |
| `DropdownMenu` | 菜单根节点 | Radix | — | — |
| `DropdownMenuTrigger` | 菜单触发器 | Radix | — | — |
| `DropdownMenuGroup` | 菜单分组 | Radix | — | — |
| `DropdownMenuContent` | 菜单浮层 | `sideOffset`（默认 4） | `rounded-md`、`bg-popover`、`shadow-popover`、`min-w-[10rem]` | 打开时 `animate-fade-in` |
| `DropdownMenuItem` | 菜单项 | `tone`（`default` / `danger`） | `rounded-sm px-2 py-1.5`、13px | 高亮 `bg-accent`（danger 为 `bg-danger-soft` + `text-danger`）；disabled `opacity-50` + `pointer-events-none` |
| `DropdownMenuCheckboxItem` | 可勾选菜单项 | Radix | 同 `DropdownMenuItem`，左侧留勾选图标槽 | 高亮 `bg-accent`；勾选显示勾选图标（`text-info`）；disabled `opacity-50` |
| `DropdownMenuLabel` | 菜单分组标题 | Radix | `t-overline px-2 py-1.5` | — |
| `DropdownMenuSeparator` | 菜单分隔线 | Radix | `h-px bg-border` | — |
| `TooltipProvider` | Tooltip 全局 Provider（`AppShell` 中配置 `delayDuration={400}`） | Radix | — | — |
| `TooltipRoot` | Tooltip 根节点 | Radix | — | — |
| `TooltipTrigger` | Tooltip 触发器 | Radix | — | — |
| `TooltipContent` | Tooltip 浮层 | `sideOffset`（默认 6） | `rounded-sm`、`bg-popover`、`shadow-popover`、12px、`max-w-xs` | 打开时 `animate-fade-in` |
| `Tooltip` | 「图标按钮 + 文案」便捷封装 | `label`、`side`（默认 `top`） | 同上 | 仅用于补充说明，不承载唯一信息 |

### 6.5 领域组件

| 导出 | 用途 | 关键 props | 尺寸 / 变体 | 状态要求 |
| --- | --- | --- | --- | --- |
| `AddressField` | 展示 tailcat 地址令牌，默认脱敏，可查看 / 复制完整值 | `address`、`masked`（默认 `true`）、`label`、`emptyLabel`、`className` | `rounded-md` + `bg-[--surface-inset]` + `px-2 py-1.5`；内容 `t-mono` | 无地址时显示 `—`（`t-mono --ash`）；默认 `truncateMiddle(addr, 8, 6)`；眼睛按钮切换明文；`CopyButton` **始终复制完整未脱敏值**；明文时 `select-all` 便于手动选取 |
| `LogView` | 任务日志控制台 | `lines`、`className`、`emptyLabel` | 顶部工具条 + 可滚动日志区；日志行 11.5px `t-mono` | `role="log"` + `aria-live="polite"`；支持关键字过滤（`aria-label="过滤日志"`）与暂停/恢复自动滚动；用户手动阅读历史时**不自动滚动**；stderr 行用 `text-warning` 并加 `!` 标记；debug/info/warn/error 分别用 `--ash` / `--body` / `warning` / `danger` |

---

## 7. 页面布局规则

### 7.1 应用外壳

```
AppShell
├── Sidebar（左，固定 232px，bg-sidebar，右侧 1px 分隔线）
│   ├── 品牌头 h-12
│   ├── 分组导航（t-overline 分组标题 + 32px 导航项，可滚动）
│   └── EngineSummary（底部固定，border-t）
└── 右侧主区（flex-1，min-w-0）
    ├── PreviewBanner（仅预览模式显示）
    └── main（flex-1，overflow-hidden）→ 页面
```

> `AppShell` / `Sidebar` / `EngineSummary` / `PreviewBanner` / `ScreenBody` / `ScreenColumns` 来自 `src/components/layout/`，**不是** `src/components/ui/` 的组件；它们只负责骨架，不定义新的颜色或圆角。

- 侧边栏导航项：默认 `--sidebar-foreground`，hover / 激活 `bg-[--sidebar-accent]` + `--sidebar-accent-foreground`；激活项左侧 2px `--info` 指示条并置 `aria-current="page"`。
- `Cmd/Ctrl + 1..6` 在主要页面间跳转（`AppShell` 注册）。
- `Toaster` 挂在 `AppShell`，页面不得自行渲染。

### 7.2 页面骨架

每个页面固定使用以下结构，**不要自造头部或滚动容器**：

```tsx
<PageHeader title="…" description="…" actions={<>…</>} />
<ScreenBody>
  <Panel>…</Panel>
</ScreenBody>
```

| 骨架 | 规则 |
| --- | --- |
| 页面头部 | `PageHeader`：`px-6 py-4`，标题 `t-title-lg` + 可选 `t-caption` 描述 + 右侧 actions；底部 1px 分隔线，头部本身不滚动 |
| 滚动区域 | `ScreenBody`：唯一纵向滚动容器（`overflow-y-auto`），内容居中、`max-w-[1080px]`、`px-6 py-5`、区块间距 `gap-4` |
| 区块与分栏 | 区块一律用 `Panel`；两栏用 `ScreenColumns`（`grid gap-4`，`lg` 以上为 `1.15fr : 1fr`，窄屏自动堆叠为单列） |
| 分区标题 | 面板内分组用 `SectionTitle`（`t-overline`）；面板之间不叠加额外大标题 |
| 区块间距 | 统一 `gap-4`（16px），不得出现 24px 以上的营销式留白 |

---

## 8. 状态设计

| 状态 | 呈现约定 |
| --- | --- |
| 加载中 | 与最终内容**同尺寸**的 `Skeleton` 占位（列表项用 `h-9 w-full` 等）；按钮用 `Button loading`（`Loader2` 旋转 + 自动禁用 + `aria-busy`）；引擎检测中在侧边栏显示「检测引擎…」 |
| 空数据 | `EmptyState`（`icon` + `title` + `description` + 可选 `action`），虚线边框、居中、`py-10`；文案说明「为什么空」和「下一步做什么」 |
| 连接中 | 任务状态点 `StatusDot status="starting"`（`bg-warning`）；操作按钮进入 loading 态；不显示虚假进度条 |
| 连接成功 | `StatusDot status="running"`（`bg-success`，可 `pulse`）；连接信息用 `KeyValueList` 展示真实值 |
| 连接失败 | `ErrorNote` 渲染归一化错误（`message` + `hint` + `code`，原始输出折叠）；任务行同时显示 `StatusDot status="failed"`；不使用弹窗打断 |
| 引擎缺失 | 侧边栏底部摘要（`src/components/layout/engine-summary.tsx`）显示警告图标 + 「未检测到 tailcat」+「点击前往设置」；`src/features/engine/EnginePanel.tsx` 显示 `Badge tone="warning"` + `Callout tone="warning"`（含安装途径与「不要运行脚本」提示）；首页用 `EmptyState` 引导 |
| 预览模式 | 非 Tauri 环境显示预览横幅（`src/components/layout/preview-banner.tsx`，`bg-warning-soft` + 试管图标），使预览数据不可能被误认为真实连接 |
| 无数据字段 | 一律显示 `—`；禁止用 `0`、假进度或假速度占位 |
| 连通性探测 | `tailcat ping` 自 v0.7.0 起可用：成功时展示每跳 RTT 与 `DERP(...)`/直连路径，作为**有效**连通性证据；失败时按真实错误（`ErrorNote` + `error.code`）呈现，不再降级为中性提示 |

---

## 9. 无障碍与跨平台

- **焦点可见**：全局 `:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px }`；组件内改用 `focus-visible:ring-2 ring-ring` 时不得移除轮廓而不给替代。
- **键盘可达**：所有交互元素必须是原生 `button` / `input` / Radix 组件；侧边栏、Tabs、菜单、Dialog、Select 均支持方向键与 Esc；`Cmd/Ctrl + 1..6` 跳转主页面。
- **语义与播报**：`Callout` 的 danger/risk 用 `role="alert"`；`ErrorNote` 用 `role="alert"`；`LogView` 用 `role="log"` + `aria-live="polite"`；`Toaster` 用 `aria-live="polite"`；纯装饰元素（`StatusDot`、图标）用 `aria-hidden`；仅图标按钮必须有 `aria-label`。
- **不依赖平台独有字体或控件**：只用 `--font-sans` / `--font-mono` 及其开源回退链；滚动条、开关、下拉全部自绘或由 Radix 提供，不依赖 macOS 原生外观。
- **深浅主题一致**：任何页面在 `data-theme="light"` 与 `"dark"` 下都必须可读、层级正确；不得出现只在单一主题下可见的边框、文字或图标。
- **对比度**：正文与背景对比不低于 4.5:1；`--ash` 只用于非关键的极弱信息。

---

## 10. 动效

只允许使用 `globals.css` 中已有关键帧与工具类，**不得新增关键帧或长时动画**。

| 类 / 关键帧 | 时长 | 缓动 | 用途 |
| --- | --- | --- | --- |
| `animate-fade-in`（`tc-fade-in`） | `--motion-duration`（140ms） | `--motion-ease` | 浮层遮罩、Tooltip、Dropdown、Select 入场 |
| `animate-rise-in`（`tc-rise-in`） | `--motion-duration` | `--motion-ease` | Dialog 内容、Toast 入场（`translateY(6px)` → 0） |
| `animate-pulse-ring`（`tc-pulse-ring`） | 2000ms，无限循环 | `--motion-ease` | 运行中任务的 `StatusDot` 呼吸环 |
| `animate-spin-slow`（`tc-spin`） | 900ms，线性，无限循环 | linear | 按钮 loading 态的旋转加载图标 |
| `data-stagger` 容器 | 子项依次 0 / 40 / 80 / 120 / 160 / 200 / 240ms 延迟 | `--motion-ease` | 页面载入时的分层浮现（子项加 `data-stagger`） |
| Tailwind `animate-pulse` | 默认 | 默认 | 仅 `Skeleton` 加载占位 |

约束：

- 过渡统一写 `transition-colors` / `transition-transform` 并显式带上 `duration-[var(--motion-duration)] ease-[var(--motion-ease)]`。
- `prefers-reduced-motion: reduce` 下 `--motion-duration` 为 `0ms`，所有过渡立即生效；不要为单个组件绕过该变量。
- **不做无意义装饰动效**：不做视差、不做循环漂浮、不做 hover 缩放、不做页面切换转场。动效只用于表达「状态变化」与「层级出现」。

---

## 11. 反面清单（Don'ts）

| 禁止 | 正确做法 |
| --- | --- |
| 组件里出现裸色值（`#fff`、`rgb(...)`、`hsl(...)`） | 使用语义 Token / `@theme inline` 暴露的类 |
| 用 `dark:` 分支写死颜色 | 主题由 Token 驱动，写 `dark:` 只在确有深色专属差异时使用 |
| 大面积渐变、渐变按钮、渐变卡片 | 纯色表面阶梯 + 1px 边框 |
| 装饰性阴影、发光、玻璃拟态 | 仅 `shadow-panel` / `shadow-popover` / `shadow-sm` 三档 |
| 过度圆角（任意 px、`rounded-2xl`+） | 只用 `xs / sm / md / lg / xl / full` Token |
| 营销式大留白（≥24px 的区块间距） | 区块间距固定 `gap-4` |
| 使用平台独有字体或原生控件外观 | `--font-sans` / `--font-mono` 开源回退链 + Radix 自绘控件 |
| 新增关键帧或长时装饰动画 | 只用第 10 节的 4 个关键帧 + `data-stagger` |
| 用 `0`、假进度或假速度填补缺失数据 | 显示 `—` 或「不可用」 |
| 伪造连接状态、测试结果或「已支持」但未实现的按钮 | 未实现的能力隐藏或禁用并说明原因 |
| 在组件内直接 `invoke` 后端命令 | 一律走 `api.*` 门面 |
| 把地址令牌写入日志或默认明文展示 | 默认脱敏，复制时复制完整值 |
| 页面自行渲染 `Toaster` 或自造滚动容器 | 复用 `AppShell` / `ScreenBody` |

---

## 12. Review Checklist

提交任何 UI 改动前逐条确认：

1. 是否只用了 `src/styles/tokens.css` 中存在的 Token？有无裸色值？
2. 浅色与深色下都正确吗？有无 `dark:` 写死颜色？
3. 排版是否使用 `t-*` 角色类，而非随意内联字号？
4. 圆角是否只用 `rounded-xs|sm|md|lg|xl|full`？控件高度是否落在 28 / 32 / 36 三档？
5. 是否复用了 `src/components/ui/**` 的既有组件与 `Panel` / `PageHeader` / `ScreenBody` / `ScreenColumns` 骨架？
6. 每个交互元素是否有 hover / active / focus-visible / disabled 状态？异步操作是否有 loading？
7. 加载、空、错误三种状态是否分别用 `Skeleton` / `EmptyState` / `ErrorNote` 表达？
8. 图标按钮是否有 `aria-label`？装饰元素是否 `aria-hidden`？
9. 缺失数据是否显示 `—`？是否存在伪造进度或状态？
10. 动效是否只用了既有的 4 个关键帧与 `data-stagger`？
