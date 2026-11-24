<div align="center">

<img src="apps/desktop/build/icon.svg" alt="Vmark Logo" width="88" height="88" />

# Vmark

[简体中文](README.md) | **English**

### Write calm, local-first Markdown notes — publish anywhere without copy-paste

**`V` (Verified) + `Mark` (Markdown): A 100% Local-First desktop Markdown note-taking editor and multi-platform publishing workbench. Open any local folder for focused writing with instant rendering, live outlines, Mermaid diagrams, KaTeX math, and 24 Bloom themes — then migrate images and dispatch formatted drafts to 10+ platforms in one click.**

[![License: AGPL-3.0 / Commercial](https://img.shields.io/badge/License-AGPL--3.0%20%2F%20Commercial-1c1917.svg)](LICENSE)
[![Platform: macOS | Windows | Linux](https://img.shields.io/badge/OS-macOS%20%7C%20Windows%20%7C%20Linux-3b7cc4.svg)](https://github.com/leileigwl/vmark/releases/latest)
[![Local-First](https://img.shields.io/badge/Storage-100%25%20Local--First-2ea44f.svg)](#-why-vmark-for-note-taking)
[![TypeScript](https://img.shields.io/badge/TypeScript-Monorepo-3178C6.svg)](#-architecture--monorepo-layout)

[Download Latest](https://github.com/leileigwl/vmark/releases/latest) · [Note-Taking Core](#-why-vmark-for-note-taking) · [Multi-Platform Publishing](#-publish-to-10-platforms--34-visual-cards) · [Website & Deploy](website/DEPLOY.md) · [FAQ](#-faq)

<br />

| Light Note Workspace (Apple Light · File Tree + Outline + Callouts) | Dark Theme (Bloom Dark · Code Highlighting + Mermaid) |
| :---: | :---: |
| ![Vmark Light Note Workspace](docs/assets/screenshots/1-editor-light.png) | ![Vmark Dark Mode and Mermaid](docs/assets/screenshots/2-editor-dark-mermaid.png) |

</div>

---

## ✨ Why Vmark for Note-Taking?

First and foremost, Vmark is a **quiet, offline-capable, Local-First desktop Markdown note and document editor** where you keep complete ownership of your files:

- **📂 Folder as Workspace (100% Local-First)**: No mandatory account registration and no proprietary database lock-in. Open any local directory to start writing clean `.md` files. Pasted images are saved automatically under `./assets/` with relative paths — 100% usable offline and naturally friendly to Git, iCloud Drive, or any sync folder.
- **✍️ Instant Rendering (IR), Zero Split-Pane Clutter**: Type Markdown naturally and watch formatting appear inline. A collapsible left sidebar unifies your **file tree, live heading outline, and full-text search**, alongside live word count and protected auto-save.
- **📐 Built for Technical & Structured Thinking**: Native inline rendering for **Mermaid flowcharts & sequence diagrams**, **KaTeX math expressions**, GFM tables, syntax-highlighted code blocks, and `[!NOTE]` / `[!TIP]` callout blocks.
- **🎨 24 Bloom Themes + Custom CSS**: Includes 24 curated light and dark themes out of the box, plus one-click custom CSS stylesheet import.
- **🗂️ Local Article Manager & Reverse Import**: Inspect word counts, local image counts, and timestamps across your workspace, or pull existing drafts from connected platforms back into clean local `.md` + `./assets/` with zero ongoing cloud coupling.

<div align="center">

![Vmark Local Article Manager](docs/assets/screenshots/3-article-manager.png)

</div>

---

## 🚀 Publish to 10+ Platforms & 3:4 Visual Cards

When a note is ready to share publicly, Vmark removes the friction of manual image uploads and broken web-editor formatting:

1. **Platform-Native AST Compilation**:
   - **WeChat Official Account**: Converts Markdown into pure inline styles with token-level syntax highlighting, a clean window header bar, and automatic footnote extraction for external links.
   - **Zhihu Column**: Normalizes heading levels, generates Prism-compatible code blocks, and wraps images in clean `<figure>` tags.
   - **Juejin / CSDN / Baijiahao / Bilibili**: Handles platform-specific Frontmatter, request signing, and summary constraints.
2. **Anti-Hotlink Image Pipeline**:
   - Resolves local `./assets/` and cross-origin images in memory at publish time, uploading directly to platform media libraries or your configured image host (GitHub / SM.MS / PicGo) without mutating your local `.md` files.
3. **Isolated Local Sessions & Draft-First Safety**:
   - Every platform session runs in its own isolated local partition with OS-level credential protection and zero third-party relay servers. Most platforms default to **pushing into your Draft Box** so you keep final editorial control.
4. **3:4 Visual Card Engine**:
   - Automatically paginates long-form notes into crisp **1080×1440** cover, content, and frosted dark code cards for Xiaohongshu, Douyin, and social feeds.

<div align="center">

| Minimal Cover Card (3:4) | Ink Classic Cover | Frosted Dark Code Card |
| :---: | :---: | :---: |
| <img src="docs/assets/screenshots/social_cards/xhs-card-01-cover.png" width="240" alt="Xiaohongshu 3:4 cover card" /> | <img src="docs/assets/screenshots/social_cards/theme-ink-classic-cover.png" width="240" alt="Ink Classic cover card" /> | <img src="docs/assets/screenshots/social_cards/douyin-card-03-code.png" width="240" alt="Dark code card" /> |

</div>

### Supported Platform Matrix

| Dispatch Mode | Platforms | Mechanism |
| :--- | :--- | :--- |
| **Draft-First (Recommended)** | **WeChat Official Account**, **Zhihu**, **Juejin**, **CSDN**, **Baijiahao**, **Bilibili**, **Xiaohongshu**, **Douyin**, **Weibo** | Re-hosts images + compiles platform-native markup directly into your draft box with link verification |
| **Static Blogs & Direct** | **GitHub Static Blogs** (Hexo / Hugo / VitePress / Astro), **Cnblogs** | One-click Git push for CI/CD or direct publishing with live URL check |
| **3:4 Visual Card Export** | **Xiaohongshu**, **Douyin**, **Social Carousel** | Offline high-DPI rasterization across multiple editorial & code card themes |

---

## 📦 Download & Local Development

### Desktop Installers

Download the installer for your OS from [GitHub Releases](https://github.com/leileigwl/vmark/releases/latest):

| OS | Format | Notes |
| :--- | :--- | :--- |
| **macOS** (Apple Silicon / Intel) | `.dmg` / `.zip` | Drag into `Applications`; if Gatekeeper warns on unsigned builds, allow via System Settings → Privacy & Security |
| **Windows** (x64) | `.exe` | Standard installer; credentials protected via Windows DPAPI (`safeStorage`) |
| **Linux** (Ubuntu / Debian) | `.AppImage` / `.deb` | Make `.AppImage` executable or install via `dpkg -i` |

### Local Development

Prerequisites: **Node.js >= 20.0.0** and **pnpm >= 9.0.0** (`pnpm` only across the repository).

```bash
# 1. Clone and install dependencies
git clone https://github.com/leileigwl/vmark.git
cd vmark
pnpm install

# 2. Run desktop app in development mode (Electron + Vite HMR)
pnpm dev

# 3. Typecheck, test, and build
pnpm typecheck
pnpm test
pnpm build
```

> **Showcase Website (`website/`)**: An independent bilingual product showcase built with Vite, React, and Tailwind CSS, ready for Cloudflare Pages with automatic `sitemap.xml` / `robots.txt` / `llms.txt` URL syncing. See [website/DEPLOY.md](website/DEPLOY.md).

---

## 🏗️ Architecture & Monorepo Layout

Built as a layered `pnpm workspace + Turborepo` monorepo. See [PRODUCT.md](docs/PRODUCT.md) and [ARCHITECTURE.md](docs/ARCHITECTURE.md).

<details>
<summary>Expand Monorepo Structure</summary>

```text
vmark/
├── apps/
│   └── desktop/                  # Electron + Vite + React 18 desktop app
│       ├── src/main/             # Main process: filesystem, IPC, isolated sessions, health checks
│       ├── src/preload/          # Secure preload bridge
│       └── src/renderer/         # Renderer: Vditor IR editor, Bloom themes, manager, publish flow
├── packages/
│   ├── shared/                   # Shared TypeScript contracts and platform models
│   ├── core/                     # Directory scan, outline parser, AST renderers & card engine
│   ├── image-pipeline/           # Local ./assets/ manager, anti-hotlink proxy & fallback hosts
│   └── adapters/                 # Multi-platform auth checks & draft dispatch adapters
├── website/                      # Official showcase site (SEO / GEO / Cloudflare Pages)
├── docs/                         # Product specs, UI guidelines & design docs
└── openspec/                     # Spec-driven change proposals
```

</details>

---

## ❓ FAQ

- **Q: Can I use Vmark purely as a local Markdown note-taking app without publishing anything?**  
  A: Yes. Vmark is designed first as a clean, offline-first desktop Markdown note editor. File tree, outline, search, instant rendering, Mermaid, KaTeX, and 24 Bloom themes all work without connecting any external account.
- **Q: Why does Vmark not have its own cloud account or two-way cloud sync?**  
  A: To avoid vendor lock-in and sync conflicts. Your notes stay as plain `.md` files and `./assets/` folders that work cleanly with Git, iCloud Drive, OneDrive, or Syncthing.
- **Q: Are my platform cookies and image-host keys uploaded anywhere?**  
  A: Never. Vmark is a local desktop application with no third-party relay servers; sessions are isolated locally and credentials are protected via OS-level encrypted storage.

---

## 📄 Dual Licensing (AGPL-3.0 / Commercial)

- **Open Source**: Free under [LICENSE](LICENSE) (GNU AGPL-3.0-only) for personal use, research, and AGPL-3.0 compliant open-source derivatives.
- **Commercial**: Closed-source integrations or commercial distributions require a commercial license. See [LICENSE-COMMERCIAL.md](LICENSE-COMMERCIAL.md).
