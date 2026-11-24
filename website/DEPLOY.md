# Vmark 官网部署与搜索引擎提交指南

本目录 (`website/`) 为完全独立的 Vite + React + Tailwind 静态官网，原生适配 **Cloudflare Pages** 根路径部署，并内置 `VITE_SITE_URL` 单一环境变量联动机制。

---

## 1. 更换最终域名时，如何自动同步 Sitemap / SEO / GEO？

无需手动修改多个文件。构建脚本会在 `pnpm build` 前自动读取环境变量 `VITE_SITE_URL`：
- 自动重写 `public/sitemap.xml`
- 自动重写 `public/robots.txt`
- 自动重写 `public/llms.txt`
- 自动替换 `index.html` 中的 `<link rel="canonical">`、`hreflang`、`og:url`、`og:image`、`twitter:image` 与 JSON-LD 结构化数据 URL

示例（替换为你绑定后的正式域名）：

```bash
VITE_SITE_URL=https://vmark.yourdomain.com pnpm --dir website build
```

---

## 2. 推荐部署方案：Cloudflare Pages（两种方式任选）

### 方式 A：Cloudflare 控制台连 GitHub 自动部署（推荐，改代码自动更新）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) → 左侧 **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
2. 选择仓库 `leileigwl/vmark`，配置构建参数：
   - **Root directory (根目录)**：`website`
   - **Build command (构建命令)**：`pnpm install && pnpm build`
   - **Build output directory (输出目录)**：`dist`
3. 在 **Environment variables（环境变量）** 中添加：
   - `NODE_VERSION` = `20`
   - `VITE_SITE_URL` = `https://vmark.pages.dev`（绑定自有域名后改成你的域名并点一次 Retry deployment，即可同步更新 `sitemap.xml`）
4. 部署完成后，可在 **Custom domains** 一键绑定自己的域名（自动签发 HTTPS 证书）。

### 方式 B：命令行一键推送部署（适合本地快速上线）

```bash
# 1. 首次登录 Cloudflare（会打开浏览器授权）
npx wrangler login

# 2. 按你的域名构建并直接部署到 Cloudflare Pages
VITE_SITE_URL=https://vmark.pages.dev pnpm --dir website build
npx wrangler pages deploy website/dist --project-name vmark
```

---

## 3. 部署上线后，去哪里提交收录？（SEO + GEO 收录清单）

网站上线拿到正式域名（如 `https://vmark.pages.dev` 或自有域名）后，按顺序完成以下 4 项提交：

1. **Google Search Console**（[search.google.com/search-console](https://search.google.com/search-console)）
   - 添加站点并完成 DNS TXT 或 HTML 验证。
   - 在左侧 **Sitemaps** 提交：`https://你的域名/sitemap.xml`。
2. **Bing Webmaster Tools**（[www.bing.com/webmasters](https://www.bing.com/webmasters)）
   - 支持直接从 Google Search Console 一键导入验证。
   - 提交 `https://你的域名/sitemap.xml`（Bing 收录会直接喂给 ChatGPT Search / Copilot）。
3. **百度搜索资源平台**（[ziyuan.baidu.com](https://ziyuan.baidu.com)）
   - 若绑定了自有域名，建议添加验证并提交 `sitemap.xml` 与首页 URL。
4. **GitHub 仓库主页关联（提升 GitHub SEO 与 AI 检索权重）**
   - 打开 `https://github.com/leileigwl/vmark` 右上角 **About (齿轮图标)**：
     - **Website** 填入你的官网正式 URL。
     - **Topics** 添加：`markdown-editor`、`note-taking`、`local-first`、`electron`、`wechat-official-account`、`multi-platform-publisher`。
   - 同时可向 [Product Hunt](https://www.producthunt.com/)、GitHub Trending / 阮一峰科技爱好者周刊 / V2EX / Linux.do 等社区分享，加速品牌词进入 AI 检索信源（GEO）。
