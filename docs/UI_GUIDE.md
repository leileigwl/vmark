# UI 规范（Vmark）

> 新界面一律遵守。审查时按此检查。

## 1. 组件与令牌
- 基础组件只从 `apps/desktop/src/renderer/src/ui` 引入：Button、Input、Textarea、Field、Dialog、MoreMenu、Checkbox、Switch、Badge、Tooltip。
- 颜色只用语义类：`bg-canvas`（页面）、`bg-surface`（侧栏/底栏）、`bg-hover`、`border-line`、`text-ink`、`text-muted`、`bg-primary`/`text-primary`、`success` / `warning` / `danger` 及其 `-soft`。定义见 `styles/ui-tokens.css`，自动跟随全部主题和深色模式。
- 不写十六进制颜色、不写行内 style；唯一例外是动态几何（宽高比、焦点位置、缩放）和平台品牌色。

## 2. 交互硬规则
- 每屏 / 每步只有一个主按钮（`variant="primary"`）。
- 按钮文字不换行；放不下就缩短文案或改图标按钮 + Tooltip。
- 不常用和危险操作（退出登录、删除）放进 `MoreMenu`（“⋯”）。
- 异步内容必须有：加载中、成功、空、失败（含重试）四种状态；检测类操作必须有超时。
- 提交类按钮用 `loading`，自动禁用防重复点击。
- 同一份数据只有一个来源、只在一个地方管理；其他地方只显示状态并链接过去。
- 界面上不出现技术术语和内部路径（沙箱、Cookie、persist、references/、指纹）。
- 默认值能直接用，高级选项收起。
- 浅色、深色都要截图检查。

## 3. 关键结构

## 4. 参考方向
- 编辑器：Typora / Bear / Obsidian 的安静写作感。
- 设置与账号：Linear / Raycast 设置页，一行一项、右侧一个操作。
