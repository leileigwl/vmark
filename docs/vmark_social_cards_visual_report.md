# Vmark 小红书 & 抖音社交媒体卡片排版全景实测报告（多题材满版比例升级版）

> **交互式 HTML 原型与需求记录图鉴**：[`docs/requirement-journal.html`](requirement-journal.html)（支持浏览器直接打开，含桌面端 `PlatformPreviewPane` 交互原型、3:4 / 9:16 / 16:9 / 2.35:1 多平台封面比例切换器与需求整改时间轴）
> **排版设计标杆**：深度融合 **[op7418/guizang-social-card-skill](https://github.com/op7418/guizang-social-card-skill)** (Editorial 杂志网格系统)、**[raycast/ray-so](https://github.com/raycast/ray-so)** (macOS 不断词工业级代码窗口) 与 **小红书/抖音官方 UGC 满版图文封面模板**。

---

## 📱 一、 小红书平台专属实测配套图（Coral Ivory 珊瑚白茶 · 旅行日记 & 极客混排）

针对个人创作者高频场景（**旅行手记、生活随笔、读书分享、技术实践**），消除旧版垂直居中造成的上下大片留白，升级为 **82% 黄金满版杂志网格**（顶栏刊头 + 题材胶囊与大标题 + 核心题记引语框 + 01~04 看点导览卡 + 话题胶囊 + 底部核心看点条带）：

- 封面卡片（京都深秋旅行手记 UGC 封面）：[`assets/screenshots/social_cards/xhs-card-01-cover.png`](assets/screenshots/social_cards/xhs-card-01-cover.png)
- 正文观点卡片（岚山奥嵯峨漫游步径）：[`assets/screenshots/social_cards/xhs-card-02-content.png`](assets/screenshots/social_cards/xhs-card-02-content.png)
- Ray.so 代码窗体卡片（智能字号 + 词边界换行不劈词）：[`assets/screenshots/social_cards/xhs-card-03-code.png`](assets/screenshots/social_cards/xhs-card-03-code.png)
- 旅行路线正文卡片（哲学之道至南禅寺）：[`assets/screenshots/social_cards/xhs-card-04-content.png`](assets/screenshots/social_cards/xhs-card-04-content.png)
- 安全准则总结卡片（本地优先与反风控）：[`assets/screenshots/social_cards/xhs-card-05-content.png`](assets/screenshots/social_cards/xhs-card-05-content.png)

---

## 🎬 二、 抖音平台专属实测配套图（Ray Dark 极客暗夜 · 高对比满版图文）

针对抖音图文高对比度、移动端满屏视觉冲击力需求，采用 **深空黑（`#0d1117`）** 搭配 **科技流光蓝（`#58a6ff`）**：

- 极客暗夜封面（自动识别技术实践题材）：[`assets/screenshots/social_cards/douyin-card-01-cover.png`](assets/screenshots/social_cards/douyin-card-01-cover.png)
- 架构设计正文卡片：[`assets/screenshots/social_cards/douyin-card-02-content.png`](assets/screenshots/social_cards/douyin-card-02-content.png)
- 核心代码卡片（行号顶对齐 + 零断词）：[`assets/screenshots/social_cards/douyin-card-03-code.png`](assets/screenshots/social_cards/douyin-card-03-code.png)
- 暗夜旅行漫游混排卡片：[`assets/screenshots/social_cards/douyin-card-04-content.png`](assets/screenshots/social_cards/douyin-card-04-content.png)
- 生产总结与防风控卡片：[`assets/screenshots/social_cards/douyin-card-05-content.png`](assets/screenshots/social_cards/douyin-card-05-content.png)

---

## 🎨 三、 个人博客随笔 & 瑞士工科大师色板对比（Ink Classic & Swiss Slate）

- 墨水经典 (Ink Classic · 个人数字花园随笔封面)：[`assets/screenshots/social_cards/theme-ink-classic-cover.png`](assets/screenshots/social_cards/theme-ink-classic-cover.png)
- 瑞士工科 (Swiss Slate · 结构化工程观点正文)：[`assets/screenshots/social_cards/theme-swiss-slate-content.png`](assets/screenshots/social_cards/theme-swiss-slate-content.png)

---

## 📐 四、 多平台封面比例自适应与物理指标

| 平台类别 | 封面比例规格 | 物理像素 | 封面生成策略 |
| :--- | :--- | :--- | :--- |
| **小红书图文 / 抖音图文** | `3:4` 竖版黄金画幅 | `1080 × 1440` | 若文章设置 `cover:` 则优先关联；未设置则按题材自动生成满版 UGC 杂志封面 |
| **抖音全屏快拍** | `9:16` 全屏竖版画幅 | `1080 × 1920` | 自动拉伸正文导览区与底部题记条带，无黑边满屏适配 |
| **知乎 / 百家号 / B站 / 掘金** | `16:9` 宽屏专栏封面 | `1280 × 720` | 自动切换为横版杂志大字报布局（标题 + 核心引语 + 5 枚话题胶囊） |
| **微信公众号头条** | `2.35:1` 影院横幅首图 | `1080 × 460` | 紧凑高对比横幅排版，适配公众号列表页首图裁切安全区 |
