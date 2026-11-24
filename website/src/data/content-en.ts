import type { SiteContent } from './types';

export const contentEn: SiteContent = {
  meta: {
    title: 'Vmark — Local-First Markdown Note Editor & Multi-Platform Workbench',
    description:
      'Vmark is a calm, Local-First desktop Markdown note-taking and document editor for creators and developers. Folders become clean workspaces with instant rendering, Mermaid, KaTeX, 24 Bloom themes, and draft-first multi-platform publishing.',
  },
  brand: {
    name: 'Vmark',
    subname: 'Local-First Notes',
  },
  nav: {
    items: [
      { label: 'Workbench', href: '#workbench' },
      { label: 'Features', href: '#features' },
      { label: 'Publishing', href: '#platforms' },
      { label: 'FAQ', href: '#faq' },
    ],
    download: 'Download',
    github: 'GitHub',
    langToggleLabel: '中文',
  },
  hero: {
    eyebrow: 'Local-First · macOS · Windows · Linux · Open Source',
    titleLine1: 'Write calm, local-first notes.',
    titleLine2: 'Publish anywhere in one click.',
    subtitle:
      'Vmark is built first as a pure, offline-first Markdown note-taking and document workbench. Open any local folder and write with instant rendering, outlines, Mermaid diagrams, and KaTeX — then compile and dispatch drafts cleanly to 10+ platforms when you are ready.',
    primaryCta: 'Download Latest Release',
    secondaryCta: 'View on GitHub',
    osNote: 'Available for macOS (.dmg), Windows (.exe), and Linux (.AppImage / .deb). No account required.',
    previewLightLabel: 'Light Note Workspace',
    previewDarkLabel: 'Dark Code & Mermaid',
    previewLightAlt: 'Vmark light Markdown workspace showing folder tree, live outline, and callout blocks',
    previewDarkAlt: 'Vmark dark Bloom theme showing syntax-highlighted code and rendered Mermaid diagram',
    pillars: [
      {
        tag: '01 · OWNERSHIP',
        title: '100% Local .md + ./assets/',
        description: 'Your folder is your workspace. Pasted images save locally with relative paths — Git-friendly and offline-ready.',
      },
      {
        tag: '02 · WRITING CRAFT',
        title: 'Instant Rendering · Zero Clutter',
        description: 'Distraction-free Markdown editing with collapsible file tree, outline, full-text search, and Callout blocks.',
      },
      {
        tag: '03 · READY TO SHARE',
        title: '24 Bloom Themes & Draft Dispatch',
        description: 'Switch between 24 curated themes or custom CSS, then push formatted drafts safely without manual re-styling.',
      },
    ],
  },
  showcase: {
    eyebrow: 'WORKBENCH SHOWCASE',
    title: 'From quiet daily notes to publication-ready output',
    subtitle: 'Complex formatting pipelines stay out of your way until the moment you decide to share.',
    tabs: [
      {
        id: 'editor',
        label: 'Focused Note Editor',
        badge: 'Markdown Instant Rendering',
        title: 'A desktop document editor built for flow',
        description:
          'Keep your folder tree, heading outline, and search neatly docked on the left while writing on a breathable canvas. Native support for GitHub-style Callouts ([!NOTE] / [!TIP]), syntax highlighting, KaTeX math, and Mermaid diagrams.',
        highlights: [
          'Zero forced templates — start every thought on a clean blank sheet',
          'Apple Light and 24 Bloom themes, plus custom CSS stylesheet import',
          'Reliable local auto-save and asset tracking that works 100% offline',
        ],
      },
      {
        id: 'manager',
        label: 'Local Article Manager',
        badge: 'Archive & Reverse Import',
        title: 'Audit your local notes and pull old drafts back home',
        description:
          'Review word counts, local image references, and modification timestamps across your workspace in one table. You can also reverse-import existing drafts from connected platforms into clean local Markdown with downloaded ./assets/ images.',
        highlights: [
          'Directory-wide note overview with instant jump to edit or publish',
          'Reverse-imported drafts stay decoupled offline — zero cloud lock-in',
          'Plain files and relative paths only, free from proprietary databases',
        ],
      },
      {
        id: 'cards',
        label: '3:4 Visual Cards',
        badge: 'Editorial Visual Engine',
        title: 'Turn structured notes into crisp 3:4 social cards',
        description:
          'Built-in 1080×1440 visual card engine automatically paginates long-form Markdown into high-contrast cover cards, editorial content slides, and frosted dark code cards for Xiaohongshu and Douyin.',
        highlights: [
          'Multiple curated visual presets (Ink Classic, Swiss Slate, Note style)',
          'Dedicated code cards preserve monospace readability and contrast',
          'Preview platform-specific rendering before pushing to draft boxes',
        ],
      },
    ],
    cardLabels: {
      xhsCover: 'Minimal Note Cover (3:4)',
      inkCover: 'Ink Classic Cover',
      swissContent: 'Swiss Slate Content Card',
      douyinCode: 'Frosted Dark Code Card',
    },
  },
  bento: {
    eyebrow: 'CRAFTED FOR WRITERS',
    title: 'Engineered for daily note-taking, supercharged when you publish',
    subtitle: 'Most of your time is spent thinking and writing; Vmark respects that with speed, silence, and local control.',
    items: [
      {
        id: 'local-first',
        category: 'Local-First Architecture',
        title: 'Plain files on your disk. Never locked in the cloud.',
        description:
          'No proprietary database, no mandatory sign-up, and no fragile two-way cloud overwrite sync. Point Vmark at any local directory and every image you paste is saved cleanly into ./assets/.',
        span: 'wide',
        icon: 'folder',
        bullets: ['Standard .md plain text', 'Local ./assets/ relative images', 'Works with Git / iCloud / Sync'],
      },
      {
        id: 'instant-render',
        category: 'Instant Rendering',
        title: 'Write without split-screen noise',
        description:
          'Inline instant rendering keeps Markdown syntax invisible while typing, backed by live document outlines, word counts, and save guards.',
        span: 'normal',
        icon: 'sparkles',
        bullets: ['Tree, outline & search sidebar', 'Protected ⌘+S auto-save'],
      },
      {
        id: 'tech-blocks',
        category: 'Technical Depth',
        title: 'Mermaid, KaTeX, and Callouts built right in',
        description:
          'Render architecture flowcharts, mathematical formulas, GFM tables, and [!NOTE] / [!TIP] callout blocks seamlessly inline.',
        span: 'normal',
        icon: 'diagram',
        bullets: ['Inline Mermaid diagrams', 'KaTeX math', 'Rich Callout blocks'],
      },
      {
        id: 'bloom-themes',
        category: 'Visual Craft',
        title: '24 Bloom themes plus custom CSS support',
        description:
          'Switch effortlessly between crisp Apple Light and dark Bloom palettes, or load your own CSS stylesheet for tailored typography.',
        span: 'normal',
        icon: 'palette',
        bullets: ['24 light & dark themes', 'One-click custom CSS import'],
      },
      {
        id: 'image-pipeline',
        category: 'Anti-Hotlink Pipeline',
        title: 'Automatic image migration without mutating source files',
        description:
          'Resolves local ./assets/ and cross-origin images with source Referer during dispatch, uploading to platform media APIs or your image host (GitHub / SM.MS / PicGo) in memory only.',
        span: 'normal',
        icon: 'image',
        bullets: ['Native platform media upload', 'Image host fallback chain'],
      },
      {
        id: 'sandbox-draft',
        category: 'Privacy & Draft-First Safety',
        title: 'Isolated local browser partitions & draft-first dispatch',
        description:
          'Each platform session lives in its own isolated local partition with OS-level credential protection — zero third-party relay servers. Posts land in platform draft boxes for your final review.',
        span: 'wide',
        icon: 'shield',
        bullets: ['Zero third-party servers', 'Per-platform session isolation', 'Post-dispatch URL verification'],
      },
    ],
  },
  platforms: {
    eyebrow: 'MULTI-PLATFORM ENGINE',
    title: 'One local note, compiled natively for each platform',
    subtitle: 'Dedicated AST renderers handle platform quirks automatically instead of fragile clipboard HTML.',
    groups: [
      {
        mode: 'Draft-First Dispatch (Recommended)',
        badge: 'Draft-First',
        description: 'Migrates images and compiles native markup into your account draft box for final human review.',
        platforms: [
          { name: 'WeChat Official Account', detail: 'Inline styles · Token code highlighting · Mac header · Footnote links' },
          { name: 'Zhihu Column', detail: 'H1-to-H2 hierarchy · Prism code blocks · Standard figure captions' },
          { name: 'Juejin', detail: 'Signed session requests · Category & tag mapping' },
          { name: 'CSDN', detail: 'HMAC request signing · GFM formatting & Frontmatter handling' },
          { name: 'Baijiahao', detail: 'Anti-hotlink image re-hosting · 16:9 cover guidance' },
          { name: 'Bilibili Column', detail: 'Draft box sync · Cross-origin image proxy' },
          { name: 'Xiaohongshu / Douyin / Weibo', detail: 'Dedicated copy & draft delivery' },
        ],
      },
      {
        mode: 'Static Blogs & Direct Publish',
        badge: 'Direct / Git',
        description: 'Push directly to static site repositories or open publishing APIs with link verification.',
        platforms: [
          { name: 'GitHub Static Blogs', detail: 'Hexo / Hugo / VitePress / Astro push & CI/CD trigger' },
          { name: 'Cnblogs', detail: 'Direct publishing & post link verification' },
        ],
      },
      {
        mode: '3:4 Visual Card Export',
        badge: '1080×1440 Cards',
        description: 'Rasterize long-form Markdown into high-DPI cover, content, and code slides offline.',
        platforms: [
          { name: 'Xiaohongshu Slides', detail: 'Auto-paginated cover, body & code cards' },
          { name: 'Douyin / Social Carousel', detail: 'Multiple editorial themes · Crisp retina PNG output' },
        ],
      },
    ],
    safetyNote: 'All platform sessions and credentials remain strictly on your device; Vmark never uploads your notes or cookies to any relay server.',
  },
  faq: {
    eyebrow: 'FAQ',
    title: 'Frequently Asked Questions',
    subtitle: 'Clear answers about local note-taking, privacy, multi-platform publishing, and licensing.',
    items: [
      {
        question: 'Can I use Vmark purely as a local Markdown note-taking app without publishing?',
        answer:
          'Yes. Vmark is built first and foremost as a calm, offline-first desktop Markdown note and document editor. You get a workspace file tree, live outline, full-text search, instant rendering, Mermaid, KaTeX, Callouts, and 24 Bloom themes without ever connecting any publishing account.',
      },
      {
        question: 'Where are my notes and images stored? Does it work offline?',
        answer:
          'Everything stays 100% on your local disk. Notes are standard .md files and pasted images are automatically saved under ./assets/ in the same workspace with relative paths, making your archive completely portable and usable offline.',
      },
      {
        question: 'Why does Vmark not offer its own cloud account or two-way sync?',
        answer:
          'To protect you from vendor lock-in and sync conflicts. Vmark requires no user registration and avoids fragile cloud-overwrites-local sync. You can pair your local folder freely with Git, iCloud Drive, OneDrive, or Syncthing.',
      },
      {
        question: 'Are my platform cookies and image-host keys safe?',
        answer:
          'Yes. Vmark runs strictly locally on your desktop with zero third-party backend servers. Each platform uses an isolated local session partition, and sensitive credentials are protected via OS-level encrypted storage.',
      },
      {
        question: 'Why do most platforms default to pushing into the Draft Box instead of auto-publishing?',
        answer:
          'Draft-first publishing respects platform compliance boundaries and keeps you in full control for final cover tweaks, topic tags, and visual inspection before going live.',
      },
      {
        question: 'How is Vmark licensed?',
        answer:
          'Vmark is dual-licensed under GNU AGPL-3.0-only and a Commercial License. Personal use, academic research, and AGPL-3.0 compliant open-source derivatives are free; closed-source or commercial distributions require a commercial license.',
      },
    ],
  },
  footer: {
    ctaTitle: 'Quiet focus for your notes. Zero friction when you publish.',
    ctaSubtitle: 'Download Vmark for macOS, Windows, or Linux — open source and Local-First.',
    ctaDownload: 'Download from Releases',
    ctaRepo: 'GitHub Repository',
    license: 'GNU AGPL-3.0-only / Commercial Dual License',
    links: {
      releases: 'Releases',
      source: 'GitHub',
      llms: 'llms.txt',
      license: 'License',
    },
    copyright: '© 2026 Vmark. Local-First Markdown Note & Publishing Workbench.',
  },
};
