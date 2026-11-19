# editor/wysiwyg-editor Specification

## Purpose
提供基于 Vditor 即时渲染（IR）的沉浸式纯净 Markdown 写作环境（Apple Light / 24 套 Bloom 主题），坚持无多余内置写作模板原则，专注于流畅排版、代码块高亮、LaTeX 公式、Mermaid 图表与本地插图体验。

## Requirements

### Requirement: 类 Typora 即时渲染 Markdown 核心
系统 SHALL 提供无缝的即时渲染（IR 模式）编辑能力，用户输入 Markdown 标记后光标离开即刻转为富文本排版，支持代码块高亮、数学公式、Mermaid 与表格操作。

#### Scenario: 实时富文本渲染
- **WHEN** 用户在编辑器中键入二级标题 `## 核心架构设计` 并回车
- **THEN** 编辑器立即将其渲染为 H2 富文本样式，光标进入该行时才显示源码标记

#### Scenario: 快捷贴图自动关联
- **WHEN** 用户从剪贴板粘贴图片或拖入图片文件至编辑区
- **THEN** 系统自动将图片保存至本地 `assets/` 目录，并在文档中插入相对路径 Markdown 图片语法

### Requirement: 无内置模板限制的沉浸式多主题写作
系统 SHALL 保持纯净的空白文档写作体验与可定制外观主题（Apple Light / Bloom 24 主题及自定义 CSS 导入），不强加内置写作模板束缚创作者。

#### Scenario: 切换 Bloom 护眼主题与导入自定义 CSS
- **WHEN** 用户在设置页切换外观主题或导入外部 `.css` 样式文件
- **THEN** 编辑区与侧边栏立即实时应用对应配色与排版样式，不改写原始 `.md` 文档内容
