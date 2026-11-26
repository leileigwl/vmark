<div align="center">

<img src="apps/desktop/build/icon.svg" alt="Vmark Logo" width="88" height="88" />

# Vmark

[简体中文](README.md) | **English**

### Write one document, save ready-to-publish drafts everywhere — with automatic image hosting & 3:4 cards for Xiaohongshu / Douyin

**If you write Markdown notes or technical docs, the slow part is rarely writing — it is re-uploading images, fixing broken links across web editors, and making separate picture cards for Xiaohongshu or Douyin.**
**I built and open-sourced Vmark so you can write calmly in one desktop app, then click once to upload images automatically, format content per platform, and drop clean drafts into 10+ platforms — including 3:4 visual cards for Xiaohongshu and Douyin.**

[![License: AGPL-3.0 / Commercial](https://img.shields.io/badge/License-AGPL--3.0%20%2F%20Commercial-1c1917.svg)](LICENSE)
[![Platform: macOS Primary | Win & Linux Experimental](https://img.shields.io/badge/OS-macOS%20(Primary)%20%7C%20Windows%20%C2%B7%20Linux%20(Experimental)-3b7cc4.svg)](https://github.com/leileigwl/vmark/releases/latest)

[Official Website](https://vmark.leileigwl.cn) · [Download Latest](https://github.com/leileigwl/vmark/releases/latest) · [Feature Demos](#-feature-demos) · [Multi-Platform Drafts](#-why-vmark-makes-sharing-articles-effortless) · [Everyday Writing](#-also-a-calm-thoughtful-desktop-writing-app) · [FAQ](#-faq)

<br />

| Light Writing Workspace (Apple Light · File Tree + Outline + Callouts) | Dark Theme (Bloom Dark · Code Highlighting + Diagrams) |
| :---: | :---: |
| ![Vmark Light Note Workspace](docs/assets/screenshots/1-editor-light.png) | ![Vmark Dark Mode and Mermaid](docs/assets/screenshots/2-editor-dark-mermaid.png) |

</div>

---

## 🎬 Feature Demos

| Instant Rendering, Table Tab Jump & 24 Bloom Themes | Multi-Ratio Covers (16:9 · 2.35:1 · 3:4) & Draft Dispatch |
| :---: | :---: |
| ![Editor writing and theme demo](docs/assets/demos/1-editor-writing-theme.gif) | ![Multi-platform publish demo](docs/assets/demos/2-multi-platform-publish.gif) |

<div align="center">

| Workspace Manager · Quick Open (`⇧⌘O`) · Platform Accounts & Update Checker |
| :---: |
| ![Workspace manager and accounts demo](docs/assets/demos/3-workspace-manager.gif) |

</div>

---

## 🚀 Why Vmark Makes Sharing Articles Effortless

1. **Automatic Image Re-Hosting Without Touching Your Source File**
   - Copying Markdown into web editors often leaves broken images behind. When you push drafts, Vmark automatically uploads your local `./assets/` images and external image links to each platform's own media host — leaving your original `.md` file on disk completely untouched.
2. **Built-In Browser Flow for Xiaohongshu & Douyin: 3:4 Visual Cards Ready in Drafts**
   - Plain text screenshots rarely look great on visual feeds. Vmark renders your article directly into crisp **3:4 visual cards** (inspired by the open-source project [geekfoxcharlie/XHS-TextCard](https://github.com/geekfoxcharlie/XHS-TextCard) ([live demo](https://xhs-textcard.site/))), paginating straight from your content without extra filler covers, then fills cards, title, text, and `#tags` into both draft boxes so you are one click away from publishing.
3. **"Select All Ready": Fill Shared Info Once, Keep Platform Options Separate**
   - Automatically checks which platforms are signed in and highlights any missing item (such as a WeChat cover or Juejin category) without blocking the rest;
   - Enter **title, summary, and tags** once to reuse everywhere, while platform-specific options stay cleanly separate; send to all ready platforms at once or pick just one.
4. **Safe by Default: Draft-First & Locally Encrypted Accounts**
   - Each platform stays signed in inside an isolated local browser session encrypted by your OS, with no third-party relay servers; every content platform defaults to **saving into your Draft Box** so you always have the final say.

<div align="center">

| Minimal Cover Card (3:4) | Ink Classic Cover | Frosted Dark Code Card |
| :---: | :---: | :---: |
| <img src="docs/assets/screenshots/social_cards/xhs-card-01-cover.png" width="240" alt="Xiaohongshu 3:4 cover card" /> | <img src="docs/assets/screenshots/social_cards/theme-ink-classic-cover.png" width="240" alt="Ink Classic cover card" /> | <img src="docs/assets/screenshots/social_cards/douyin-card-03-code.png" width="240" alt="Dark code card" /> |

</div>

### Supported Platforms (Growing)

| Mode | Platforms | What It Does |
| :--- | :--- | :--- |
| **Draft Box (Recommended)** | **WeChat Official Account**, **Zhihu**, **Juejin**, **CSDN**, **Cnblogs**, **Baijiahao**, **Weibo**, **Bilibili**, **Xiaohongshu**, **Douyin** | Uploads images automatically, adapts formatting per portal, and saves clean drafts for review |
| **Static Blogs** | **GitHub Static Blogs** (Hexo / Hugo / VitePress / Astro) | One-click Git push for static site workflows |
| **3:4 Card Export** | **Xiaohongshu**, **Douyin**, **Social Carousels** | Exports crisp memo, magazine, and dark code cards offline |

---

## ✍️ Also a Calm, Thoughtful Desktop Writing App

Even when you aren't publishing, Vmark feels clean and pleasant for everyday docs and notes:

- **📖 Edit & Read-Only Modes + Image Zoom**: Switch to a distraction-free **Read-Only Mode** anytime; click any image while reading to **zoom in, zoom out, or reset**.
- **⌨️ Natural Keyboard Flow**: Press **`/`** for the slash command menu, use **`Tab` / `Shift+Tab`** to jump table cells or indent lists, and edit smoothly across blocks.
- **📐 Ready for Technical Notes**: Built-in **Mermaid diagrams**, **KaTeX math**, tables, syntax-highlighted code blocks, `[!NOTE]` / `[!TIP]` callouts, plus smart **16:9 / 2.35:1 / 1:1 / 3:4** cover cropping.
- **🎨 24 Light & Dark Themes + Custom CSS**: Inspired by the color palettes of [webkubor/typora-Bloom-theme](https://github.com/webkubor/typora-Bloom-theme) ([live preview](https://bloom.webkubor.online/)), offering 24 curated light and dark themes plus custom `.css` import — even the login bar adapts live to your theme.
- **🗂️ Clean Folder & File Management**: Switch folders anytime, create blank notes, **batch-delete old drafts**, jump via the **clickable outline**, reveal files in your **OS file manager**, and pull published cloud articles back as plain `.md` files with no cloud lock-in.

<div align="center">

![Vmark Local Article Manager](docs/assets/screenshots/3-article-manager.png)

</div>

---

## 📦 Download & Roadmap

Grab the installer from [GitHub Releases](https://github.com/leileigwl/vmark/releases/latest). **macOS is currently the primary recommended platform** (tested end-to-end across editing and all 10 draft-box workflows). Windows and Linux builds are generated via CI as experimental releases while cross-platform polish continues:

| OS | Status | Format | Notes |
| :--- | :--- | :--- | :--- |
| **macOS** (Apple Silicon / Intel) | **Primary (End-to-End Verified)** | `.dmg` / `.zip` | Drag to `Applications`; if Gatekeeper warns on unsigned builds, allow via System Settings → Privacy & Security |
| **Windows** (x64) | Experimental (Ongoing) | `.exe` | Early CI builds; deeper shortcut & portal polish coming next |
| **Linux** (Ubuntu / Debian) | Experimental (Ongoing) | `.AppImage` / `.deb` | Make `.AppImage` executable or install via `dpkg -i` |

### What's Next
- Deeper real-device testing and ergonomics on **Windows & Linux**;
- More **publishing portals, custom image hosts**, and file import/export refinements;
- Ongoing maintenance as creator portals evolve.

<details>
<summary>👨‍💻 For Developers: Local Setup, Architecture & Website Docs (Click to Expand)</summary>

Prerequisites: **Node.js >= 20.0.0** and **pnpm >= 9.0.0** (`pnpm` only).

```bash
git clone https://github.com/leileigwl/vmark.git
cd vmark
pnpm install
pnpm dev        # Start Electron + Vite HMR
pnpm typecheck && pnpm test && pnpm build
```

- Product & architecture docs: [PRODUCT.md](docs/PRODUCT.md) and [ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Showcase website source & deployment: [website/DEPLOY.md](website/DEPLOY.md).
- Layout: `apps/desktop` + `packages/{shared,core,image-pipeline,adapters}` + `website/` + `docs/` + `openspec/`.

</details>

---

## ❓ FAQ

- **Q: Will automatic image uploading modify my original Markdown file?**  
  A: Never. Images are read and uploaded only during draft dispatch; your `.md` file on disk stays completely untouched.
- **Q: Could one-click dispatch accidentally publish publicly, and are my accounts safe?**  
  A: All 10 content platforms default to saving in your **Draft Box**, so nothing goes public until you click publish yourself. Credentials stay encrypted locally on your machine with no third-party relay server.
- **Q: How do Xiaohongshu & Douyin work, and which OS is best today?**  
  A: Vmark turns your article into **3:4 visual cards** with formatted text and `#tags`, then saves them straight into Xiaohongshu and Douyin's draft boxes via its built-in browser. **macOS** is the primary verified platform right now; Windows and Linux are experimental.

---

## 📚 References

Vmark's card layouts, color palettes, and multi-platform publishing architecture take inspiration from the following open-source projects:

- [geekfoxcharlie/XHS-TextCard](https://github.com/geekfoxcharlie/XHS-TextCard) ([live demo](https://xhs-textcard.site/)): 3:4 visual card layouts and notebook/magazine design reference for Xiaohongshu / Douyin
- [webkubor/typora-Bloom-theme](https://github.com/webkubor/typora-Bloom-theme) ([live preview](https://bloom.webkubor.online/)): 24 light/dark eye-care Bloom theme color palette reference
- [wechatsync/Wechatsync](https://github.com/wechatsync/Wechatsync): Multi-platform article sync mechanism and content adaptation reference
- [crawlab-team/artipub](https://github.com/crawlab-team/artipub): Write-once publish-everywhere workflow and platform integration reference
- [terwer/siyuan-plugin-publisher](https://github.com/terwer/siyuan-plugin-publisher): Open-source desktop publisher architecture and multi-platform adapter reference

---

## 📄 Dual License (Open Source + Commercial)

Vmark is dual-licensed under **GNU AGPL-3.0-only** and a **Commercial License**:

- **Open Source**: Free for personal study, research, and AGPL-3.0 compliant projects under [LICENSE](LICENSE).
- **Commercial**: Closed-source or proprietary commercial use requires a commercial license. See [LICENSE-COMMERCIAL.md](LICENSE-COMMERCIAL.md).

Visit [vmark.leileigwl.cn](https://vmark.leileigwl.cn), drop a **Star** if you find Vmark useful, or open an **Issue** on GitHub with suggestions and feedback!
