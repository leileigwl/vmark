# Vmark 多平台排版自适应与沙箱授权治理技术方案

本文档记录 Vmark 针对全平台授权真实性验证、登录沙箱抗反爬白屏治理，以及 Markdown 与图文笔记在微信公众号、知乎、博客园、稀土掘金、小红书等平台的高保真排版设计与实现规范。

## 1. 授权沙箱治理与反爬/白屏解决方案

### 1.1 假授权（虚假已授权）问题与票据白名单
- **根因**：原实现使用 `cookies.length > 0` 判定授权，而任意现代网站（掘金、CSDN、博客园等）在访客首次加载页面时即写入匿名统计与追踪 Cookie（如 `s_v_web_id`、`uuid_tt_dd`、`_c_WBKFRo`）。用户尚未登录关闭窗口，即触发假授权变绿。
- **治理标准**：建立严格的平台会话票据表（Ticket Whitelist），只认核心登录票据：
  - `juejin`: `sessionid`
  - `zhihu`: `z_c0`
  - `cnblogs`: `.CNBlogsCookie` 或 `.Cnblogs.AspNetCore.Cookies`
  - `csdn`: `UserName` 且 `UserToken`
  - `bilibili`: `SESSDATA`
  - `xiaohongshu`: `web_session`
  - `weibo`: `SUB`

### 1.2 企业级 WAF 拦截与白屏排查治理
- **根因**：CSDN `passport.csdn.net/login` 等页面前置 WAF 反爬防护，检测到 Electron 特征（User-Agent 中包含 `Electron/xx.x.x`）后直接拦截前端 JS 执行，导致页面空白。
- **治理标准**：
  1. 会话拦截统一伪装纯净桌面 Chrome User-Agent：
     `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36`。
  2. 窗口挂载 `did-fail-load` 事件，遇到网络抖动或解析超时时，提供具有错误码和一键重试按钮的原生反馈视图。
  3. 挂载实时 `cookies.on('changed')`，捕获到票据时实时响应并自动同步主界面状态。

## 2. 多平台 Markdown 与富媒体图文排版适配矩阵

| 平台 | 输入格式 | 标题处理 | 代码块呈现 | 图片管线 | 外部链接与卡片 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **微信公众号** | 全内联 CSS HTML | 装饰色块与左边框 | Mac 红黄绿圆点深色代码框 | 自动转换为 `mmbiz.qpic.cn` | 外链转文章底部脚注（Footnotes）；Callout 警告框内嵌状态颜色与图标 |
| **知乎专栏** | 知乎专栏专用 HTML | H1 自动降级为 H2 | 原生 `<pre><code class="language-*">` | 自动转换为 `<figure><img ...></figure>` 并上云知乎图床 | 标准超链接，原生引用块 |
| **博客园** | 标准 GFM Markdown | 保持 Markdown 层级 | 原生 fenced code blocks | 通过 MetaWeblog `newMediaObject` 上传至博客园图床 | 原生 Markdown 语法，兼容用户自定义博客园主题 |
| **稀土掘金** | 标准 GFM Markdown | 保持 Markdown 层级 | 原生 fenced code blocks | 走掘金/字节 CDN 接口上传 | 原生 Markdown 语法 |
| **小红书** | 3:4 视觉图集卡片 | 首页大标题与分类徽标 | 磨砂深色独立代码卡片 | 1080×1440 高清渲染输出图集（多张图轮播） | 提炼 800 字以内摘要，自动附带发布 Tag |
