import type { SiteContent } from './types';

export const contentZh: SiteContent = {
  meta: {
    title: 'Vmark（维记）— 本地优先 Markdown 笔记编辑器与多平台创作工作台',
    description:
      'Vmark（维记）是一款面向创作者与开发者的 Local-First 本地优先桌面端 Markdown 笔记与文档编辑器。打开本地目录即可纯净记笔记，支持即时渲染、24 套 Bloom 主题、Mermaid 与 KaTeX，写完一键合规分发至多平台。',
  },
  brand: {
    name: 'Vmark',
    subname: '维记',
  },
  nav: {
    items: [
      { label: '核心体验', href: '#workbench' },
      { label: '能力矩阵', href: '#features' },
      { label: '多平台分发', href: '#platforms' },
      { label: '常见问题', href: '#faq' },
    ],
    download: '下载客户端',
    github: 'GitHub',
    langToggleLabel: 'EN',
  },
  hero: {
    eyebrow: 'Local-First · macOS · Windows · Linux 开源工作台',
    titleLine1: '安静写好每一篇本地笔记，',
    titleLine2: '写完顺手分发到全平台。',
    subtitle:
      'Vmark（维记）首先是一座纯粹的本地优先 Markdown 笔记与文档编辑器——打开任意文件夹即刻写作，即时渲染、大纲检索、流程图与数学公式一气呵成；需要分享时，内置防盗链图片管线与平台级排版编译，一键推入草稿箱，告别复制粘贴。',
    primaryCta: '下载 Vmark 最新版',
    secondaryCta: '查看 GitHub 源码',
    osNote: '支持 macOS (.dmg) · Windows (.exe) · Linux (.AppImage / .deb)，无需注册账号，打开即写',
    previewLightLabel: '浅色笔记写作态',
    previewDarkLabel: '暗黑代码与流程图',
    previewLightAlt: 'Vmark 白色沉浸 Markdown 笔记界面，含文件树、实时大纲与 Callout 提示块',
    previewDarkAlt: 'Vmark 暗黑 Bloom 主题界面，含代码高亮与 Mermaid 流程图即时渲染',
    pillars: [
      {
        tag: '01 · 资产主权',
        title: '100% 本地 .md + ./assets/',
        description: '目录即工作区，粘贴图片自动落盘相对路径，完全离线可用，天然适配 Git 与任意网盘。',
      },
      {
        tag: '02 · 专注写作',
        title: '即时渲染 IR · 零分屏割裂',
        description: '所写即所得的 Markdown 笔记体验，配合文件树、大纲、全文字词统计与 Callout 提示块。',
      },
      {
        tag: '03 · 一键成稿',
        title: '24 套 Bloom 主题 & 草稿箱直推',
        description: '内置明暗护眼主题与自定义 CSS，写完无需切后台排版，安全推入各平台草稿箱。',
      },
    ],
  },
  showcase: {
    eyebrow: 'WORKBENCH SHOWCASE',
    title: '从落笔思考，到管理与成稿呈现',
    subtitle: '把复杂的工具链隐藏在克制的界面之下，每一次打开都直奔内容本身。',
    tabs: [
      {
        id: 'editor',
        label: '沉浸笔记编辑',
        badge: 'Markdown Instant Rendering',
        title: '所写即所得的桌面文档编辑器',
        description:
          '左侧可折叠文件树、大纲与全局搜索，右侧是呼吸感十足的纯净画布。支持 GitHub 风格 Callout（[!NOTE] / [!TIP]）、代码块语法着色、KaTeX 公式与 Mermaid 流程图原生即时渲染。',
        highlights: [
          '无强加模板，新建即是一张干净的空白文档',
          'Apple Light 苹果白与 24 套 Bloom 主题，支持导入自定义 CSS',
          '自动保存与本地资产追踪，断网环境下 100% 流畅读写',
        ],
      },
      {
        id: 'manager',
        label: '本地文章管理台',
        badge: 'Local Archive & Reverse Import',
        title: '清点本地知识库，支持平台草稿反向回流',
        description:
          '一眼总览工作区文章数量、字数统计、本地配图引用与最近修改时间。还能一键将你此前散落在各平台后台的历史草稿拉取回本地，自动转为标准 Markdown 并转存防盗链图片。',
        highlights: [
          '目录级文章资产盘点，支持快速定位编辑与直达分发',
          '反向导入平台历史文章后即切断云端强绑定，恢复离线独立存储',
          '纯文本与相对路径结构，随时迁移无任何数据库锁定',
        ],
      },
      {
        id: 'cards',
        label: '3:4 视觉卡片与预览',
        badge: 'Editorial Visual Engine',
        title: '技术长文一键化为 3:4 高清图文卡片',
        description:
          '针对小红书、抖音与朋友圈等视觉阅读场景，Vmark 内置 1080×1440 卡片渲染引擎。自动拆分封面、正文摘要与深色磨砂代码块卡片，无需打开设计软件。',
        highlights: [
          '支持多套精选卡片视觉预设（Ink Classic / Swiss Slate / 备忘录风等）',
          '代码片段独立成卡，自动保持等宽排版与高对比度高亮',
          '推送前可切换预览不同平台渲染效果，所见即所得后再推稿',
        ],
      },
    ],
    cardLabels: {
      xhsCover: '极简漫游手记封面 (3:4)',
      inkCover: 'Ink Classic 杂志封面',
      swissContent: 'Swiss Slate 正文排版卡',
      douyinCode: '深色磨砂代码卡片',
    },
  },
  bento: {
    eyebrow: 'CRAFTED FOR WRITERS',
    title: '为长期记笔记而设计，顺便解决分发难题',
    subtitle: '70% 的打磨献给安静写字的每一分钟，30% 的工程能力帮你省下跨平台排版的枯燥时间。',
    items: [
      {
        id: 'local-first',
        category: 'Local-First 存储架构',
        title: '你的文档永远属于你，本地目录即一切',
        description:
          '没有专有数据库，没有强制注册登录，也不做脆弱的云端双向覆盖同步。打开任意电脑文件夹即可开始记笔记，所有图片按哈希自动保存至同级 ./assets/ 目录。',
        span: 'wide',
        icon: 'folder',
        bullets: ['标准 .md 纯文本', './assets/ 相对路径配图', '天然兼容 Git / iCloud / 网盘'],
      },
      {
        id: 'instant-render',
        category: '即时渲染写作体验',
        title: '告别左右分屏，专注行云流水的输入',
        description:
          '所写即所得的即时渲染引擎，配合实时文档大纲、字数统计与快捷键保护，无论是日常随手记、读书笔记还是万字长文，都保持轻快顺滑。',
        span: 'normal',
        icon: 'sparkles',
        bullets: ['文件树 + 大纲 + 搜索三合一侧栏', '⌘+S 零丢失保存守卫'],
      },
      {
        id: 'tech-blocks',
        category: '技术与结构化表达',
        title: '流程图、公式与 Callout 提示块开箱即用',
        description:
          '原生解析 Mermaid 架构图与流程图、KaTeX 数学公式、标准表格与 [!NOTE] / [!TIP] 高亮提示块，技术文档与学习笔记表现力拉满。',
        span: 'normal',
        icon: 'diagram',
        bullets: ['Mermaid 实时渲染', 'KaTeX 公式', 'Callout 提示块'],
      },
      {
        id: 'bloom-themes',
        category: '视觉与个性化',
        title: '24 套 Bloom 护眼主题，更支持导入你的 CSS',
        description:
          '从通透的 Apple Light 苹果白到沉稳的暗黑模式，内置 24 套精心调校的主题配色；想要专属排版风格，直接一键导入任意自定义 CSS 文件。',
        span: 'normal',
        icon: 'palette',
        bullets: ['24 套明暗主题切换', '自定义 CSS 样式注入'],
      },
      {
        id: 'image-pipeline',
        category: '防盗链图片管线',
        title: '写完不用手动传图，原文件一尘不染',
        description:
          '分发时自动识别本地图片与外链防盗链图片，携带源站策略抓取并转存至平台素材库或你的自建图床（GitHub / SM.MS / PicGo），全程仅在内存替换，绝不污染本地 .md 源码。',
        span: 'normal',
        icon: 'image',
        bullets: ['平台原生素材直传', '三级弹性图床降级'],
      },
      {
        id: 'sandbox-draft',
        category: '隐私隔离与合规安全',
        title: '本地独立沙箱鉴权，默认只推草稿箱',
        description:
          '每个平台账号运行在独立的本地沙箱分区，Cookie 与凭据通过系统级安全存储落盘本地，绝不经过第三方服务器。推送默认进草稿箱，由你最终确认发布。',
        span: 'wide',
        icon: 'shield',
        bullets: ['零第三方中转服务器', '独立分区不串号', '推送后校验直达草稿链接'],
      },
    ],
  },
  platforms: {
    eyebrow: 'MULTI-PLATFORM ENGINE',
    title: '一篇本地笔记，精准适配多平台原生规则',
    subtitle: '针对不同平台的 HTML/Markdown 限制做 AST 级编译渲染，而非粗暴粘贴。',
    groups: [
      {
        mode: '推入草稿箱（推荐安全模式）',
        badge: 'Draft-First',
        description: '自动转存图片并适配平台排版规则，安全推入你的账号草稿箱，保留人工最终审核权。',
        platforms: [
          { name: '微信公众号', detail: '纯内联样式 · Token 级代码着色 · Mac 顶栏 · 外链转脚注' },
          { name: '知乎专栏', detail: 'H1 自动降级 H2 · Prism 代码块 · 标准 figure 图片结构' },
          { name: '稀土掘金', detail: '自动鉴权签名 · 平台分类与标签适配' },
          { name: 'CSDN', detail: 'HMAC 请求签名 · GFM 规范与 Frontmatter 剥离' },
          { name: '百家号', detail: '防盗链图片转存 · 16:9 封面适配' },
          { name: 'B 站专栏', detail: '专栏草稿直推 · 跨站图片转存' },
          { name: '小红书 / 抖音 / 微博', detail: '正文适配与图文草稿箱投递' },
        ],
      },
      {
        mode: '静态博客与直发',
        badge: 'Direct / Git',
        description: '面向开发者个人博客与开放接口平台，一键推送或直发并回查链接。',
        platforms: [
          { name: 'GitHub 静态博客', detail: '适配 Hexo / Hugo / VitePress / Astro，一键 Push 触发 CI/CD' },
          { name: '博客园', detail: '官方接口直发与结果直达回查' },
        ],
      },
      {
        mode: '3:4 高清视觉卡片导出',
        badge: '1080×1440 Cards',
        description: '将结构化笔记自动切分渲染为高对比封面、正文卡与深色代码卡。',
        platforms: [
          { name: '小红书图文卡片', detail: '自动分页 · 封面 + 正文 + 代码卡批量导出' },
          { name: '抖音 / 朋友圈长图', detail: '多套主题视觉预设 · 离线高保真光栅化' },
        ],
      },
    ],
    safetyNote: '所有授权数据均在本地独立分区运行并加密落盘，Vmark 绝不收集稿件内容或上传你的平台 Cookie。',
  },
  faq: {
    eyebrow: 'FAQ',
    title: '常见问题',
    subtitle: '关于本地笔记体验、数据归属、分发机制与开源授权的直白解答。',
    items: [
      {
        question: '我平时只用来记笔记、写技术文档，不发公众号或自媒体，适合用 Vmark 吗？',
        answer:
          '非常适合。Vmark 首先是一款纯粹的桌面端 Markdown 笔记与文档编辑器。打开本地目录即可写作，拥有文件树、实时大纲、全文搜索、即时渲染、Mermaid 流程图、KaTeX 公式、Callout 提示块以及 24 套 Bloom 主题。你可以完全不绑定任何发布平台，纯当本地笔记软件使用。',
      },
      {
        question: '我的笔记和粘贴的图片存储在哪里？断网可用吗？',
        answer:
          '100% 存储在你指定的本地磁盘目录中。每篇笔记都是标准 .md 纯文本文件，粘贴或拖入的图片会自动以哈希命名保存在同级 ./assets/ 文件夹内，采用标准相对路径引用，断网状态下 100% 正常浏览与编辑。',
      },
      {
        question: '为什么 Vmark 不做自己的云端账号和双向同步？',
        answer:
          '为了彻底消除云端绑定和同步冲突风险。Vmark 不要求注册任何软件账号，也不维持脆弱的云端双向覆盖。你可以自由选择 Git、iCloud Drive、OneDrive 或 Syncthing 来备份和跨设备同步你的本地笔记目录。',
      },
      {
        question: '多平台分发时，我的平台 Cookie 和图床密钥安全吗？',
        answer:
          '安全。Vmark 是纯本地桌面端应用，没有第三方后端中转服务器。每个发布平台运行在本地独立的沙箱分区中（互不串号），敏感凭据仅在本地通过操作系统级加密存储保护，绝不向外部上传。',
      },
      {
        question: '为什么绝大多数平台默认只推入「草稿箱」，而不是全自动一键发布？',
        answer:
          '一方面遵循各内容平台合规规范，避免触发自动化风控；另一方面让创作者在正式发布前保留封面微调、标签确认与最终预览的掌控权。发布前你还可以在 Vmark 内直接预览各平台的实际渲染效果。',
      },
      {
        question: 'Vmark 的开源与商业授权协议是怎么规定的？',
        answer:
          'Vmark 采用 GNU AGPL-3.0-only 与商业授权双协议模式。个人使用、学习研究以及遵守 AGPL-3.0 条款完整开源衍生源码的场景均可免费使用；若用于闭源集成或商业发行，请联系仓库版权方获取商业授权。',
      },
    ],
  },
  footer: {
    ctaTitle: '把专注还给笔记，把繁琐交给工作台。',
    ctaSubtitle: '下载 Vmark（维记）桌面客户端，支持 macOS、Windows 与 Linux，开源透明、本地优先。',
    ctaDownload: '前往 Releases 下载',
    ctaRepo: 'GitHub 仓库',
    license: 'GNU AGPL-3.0-only / Commercial Dual License',
    links: {
      releases: '下载安装包',
      source: 'GitHub 源码',
      llms: 'llms.txt (AI 索引)',
      license: '开源协议',
    },
    copyright: '© 2026 Vmark（维记）. Local-First Markdown Note & Publishing Workbench.',
  },
};
