import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '../public');
mkdirSync(publicDir, { recursive: true });

const rawUrl = process.env.VITE_SITE_URL || 'https://vmark.pages.dev';
const siteUrl = rawUrl.replace(/\/+$/, '');
const today = new Date().toISOString().slice(0, 10);

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <xhtml:link rel="alternate" hreflang="zh-CN" href="${siteUrl}/" />
    <xhtml:link rel="alternate" hreflang="en" href="${siteUrl}/?lang=en" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${siteUrl}/" />
  </url>
</urlset>
`;

const robots = `User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
# LLMs dossier: ${siteUrl}/llms.txt
`;

const llms = `# Vmark（维记）

> Local-First desktop Markdown note-taking editor and multi-platform publishing workbench for macOS, Windows, and Linux.

Official Site: ${siteUrl}/
Source Repository: https://github.com/leileigwl/vmark
Latest Releases (macOS / Windows / Linux): https://github.com/leileigwl/vmark/releases/latest
Full Documentation for AI Systems: ${siteUrl}/llms-full.txt

Vmark (\`V\` = Verified, \`Mark\` = Markdown) is an open-source, offline-first desktop application designed first and foremost for calm, reliable Markdown note-taking and long-form technical writing — with one-click, draft-first publishing and 3:4 visual card generation built in when you are ready to share.

## Core Identity: A Calm Local-First Note & Document Editor
- **Folder as Workspace**: Open any local folder on your machine. Every note is a clean, standard \`.md\` file, and pasted images are stored locally under \`./assets/\` with relative paths.
- **Zero Cloud Lock-in**: 100% offline-capable. No Vmark account required. Compatible with Git, iCloud Drive, OneDrive, or any local backup workflow.
- **Instant Rendering (IR) Writing**: Clean editing with live outline, workspace file tree, full-text search, word count, and distraction-free focus.
- **Technical Expressiveness**: Native support for Mermaid diagrams, KaTeX math formulas, GitHub-style Callouts (\`[!NOTE]\`, \`[!TIP]\`), tables, and code blocks.
- **24 Bloom Themes & Custom CSS**: Includes light and dark Bloom themes plus one-click custom CSS stylesheet import.
- **Article Manager & Reverse Import**: Manage local notes in a clean table view, and import existing drafts/articles from connected platforms back into clean local Markdown + \`./assets/\`.

## Multi-Platform Publishing & Visual Cards (When You Publish)
- **Draft-First Safety**: Pushes formatted drafts to WeChat Official Accounts, Zhihu, Juejin, CSDN, Baijiahao, Bilibili, Xiaohongshu, Douyin, and Weibo for human review before publishing.
- **Direct & Static Blog Support**: Supports direct publishing / Git push workflows for GitHub static blogs (Hexo, Hugo, VitePress, Astro) and Cnblogs.
- **Platform-Native AST Rendering**: Inline styles & token-level code highlighting for WeChat, Prism \`<pre><code>\` & \`<figure>\` for Zhihu, Frontmatter handling for CSDN.
- **Anti-Hotlink Image Pipeline**: Resolves local \`./assets/\` and cross-origin images on the fly, uploading to platform media libraries or user-configured image hosts (GitHub, SM.MS, PicGo) without mutating local Markdown source files.
- **3:4 Social Visual Cards**: Converts long-form notes into crisp 1080x1440 visual cards (cover, content, code) for Xiaohongshu and Douyin.
- **Local Privacy & Isolation**: Isolated local browser partitions per platform; credentials stay on your device without any third-party relay server.

## License
Dual-licensed under GNU AGPL-3.0-only and Commercial License.
`;

writeFileSync(resolve(publicDir, 'sitemap.xml'), sitemap, 'utf8');
writeFileSync(resolve(publicDir, 'robots.txt'), robots, 'utf8');
writeFileSync(resolve(publicDir, 'llms.txt'), llms, 'utf8');

console.log(`[sync-seo] Synced sitemap.xml, robots.txt, llms.txt -> ${siteUrl}`);
