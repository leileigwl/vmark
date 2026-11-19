# 第二阶段规划：多平台发布与分发效果（Phase 2 Roadmap）

- **当前状态**：第一阶段（Markdown IR 沉浸编辑、图片资产、本地工作区、19 项 Playwright E2E 门禁与 GitHub CI/CD）已全部闭环。
- **建议功能分支**：`feature-phase2-weixin-publish-20261117`（从 `master` 切出，联调合入 `test`，CI 全绿后 PR 合入 `master`）。

---

## 一、第二阶段核心目标（首期闭环：微信公众号）

解决长文在编辑器里写得很漂亮、但发到微信公众号后**“样式丢失、代码块变形、图片防盗链裂图、不知道草稿箱是否送达”**的痛点。

### 1. 主题内联 CSS 排版引擎（Inline Style Renderer）
- **背景**：微信公众号后台会过滤 `<style>` 标签与外部 CSS 类名，只保留元素行内 `style="..."`。
- **方案**：
  - 在 `packages/core` 新增 `renderWeixinHtml(markdown, themeTokens)`；
  - 读取当前选中的 Bloom / Apple Light 主题 CSS 变量（字体、行高、主色、Callout 渐变卡片、代码块 mac 圆点与 `hljs` 语法高亮色值、表格边框与斑马纹），自动内联计算为兼容公众号编辑器的纯行内样式 HTML；
  - 将 Mermaid 流程图 / KaTeX 公式在发布前自动转存为高清 PNG/SVG 图片，确保公众号 100% 原样展示。

### 2. 图片自动转存与防盗链闭环（Image Pipeline）
- 扫描文章内引用的 `./assets/*.png` 本地图片与外链图片；
- 发布前按 5 步可观测流水线自动上传至公众号素材库（或用户配置的图床），将 Markdown/HTML 中的本地路径替换为真实可访问的 HTTPS URL（本地原 `.md` 文件保持零污染）。

### 3. 微信公众号草稿箱送达 & 一键富文本复制兜底
- **通道 A（Partition Cookie 独立沙箱）**：在 Electron 独立 Session 中检测公众号登录态（`checkAuth()`），上传图片素材并推送至**公众号草稿箱**（`mode: 'draft'`），返回可点击预览链接与 `verifyDelivery` 校验结果；
- **通道 B（一键带样式复制兜底）**：在 PublishModal 提供“预览公众号效果”与“一键复制为公众号富文本（含内联样式）”按钮，即便未登录沙箱也能零失真粘贴到公众号后台。

---

## 二、后续扩展平台（Phase 2.2）

| 阶段 | 目标平台 | 认证方式 | 交付策略 |
| :--- | :--- | :--- | :--- |
| **Phase 2.1（首期）** | 微信公众号 | Partition Cookie 独立沙箱 + 富文本兜底 | 仅推送草稿箱（人工二次确认防误发） |
| **Phase 2.2** | GitHub 静态博客（Hexo/Hugo/Astro） | Git Token / 本地 Git | 直接提交并触发静态站点 CI/CD |
| **Phase 2.3** | 知乎 / 掘金 / 博客园 / 小红书 | Partition Cookie / MetaWeblog | 各自独立适配器实现 5 步送达契约 |

---

## 三、验收与测试计划

1. **单测（`packages/core` / `packages/adapters`）**：覆盖内联 CSS 转换、本地图片路径替换、Mock 5 步送达状态机与失败重试。
2. **Playwright E2E**：覆盖 PublishModal 公众号预览样式一致性校验、一键复制富文本剪贴板验证、草稿箱模拟推送状态流转。
3. **CI/CD 门禁**：所有 PR 必须通过 `.github/workflows/ci.yml`（Typecheck + 单测 + Build + Playwright E2E）方可合入 `master`。
