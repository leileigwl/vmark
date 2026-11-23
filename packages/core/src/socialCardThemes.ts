import { cardDesignHeight, contentBoxFor, type CardContentBox, type CardContentInsets } from './socialCardLayout.ts';

/**
 * Social Card Templates & Design Tokens
 * Modeled after xhs-textcard.site/editor's clean light templates:
 * 1. ios-memo (苹果备忘录 / 笔记本 — 2026版 iOS 极致还原)
 * 2. minimalist-magazine (极简杂志 — 现代社论排版美学)
 * 3. blank (空白模板 — 纯净极简背景，回归文字本质)
 * 4. elegant-book (书籍内页 — 优雅泛黄纸张与衬线体出版物)
 * 5. fresh-gradient (清新渐变 — 薄荷到淡紫的柔和渐变底 + 半透明白卡)
 */

export type ContentGenre = 'essay' | 'travel' | 'reading' | 'tech';

export type PlatformCoverRatio = '3:4' | '2:3' | '9:16' | '16:9' | '2.35:1';

export type CardTemplateChrome =
  | 'ios-memo'
  | 'minimalist-magazine'
  | 'blank'
  | 'elegant-book'
  | 'fresh-gradient';

export interface SocialCardTokens {
  id: string;
  name: string;
  chrome: CardTemplateChrome;
  kicker: string;
  footerSignature: string;
  description: string;
  paper: string;
  sheetBg: string;
  ruledLineColor: string;
  ink: string;
  headingInk: string;
  textSecondary: string;
  textMuted: string;
  line: string;
  lineStrong: string;
  accent: string;
  accentInk: string;
  accentSurface: string;
  highlightBg: string;
  cardBg: string;
  quoteBg: string;
  codeBg: string;
  codeInk: string;
  codeBorder: string;
  windowDotRed: string;
  windowDotYellow: string;
  windowDotGreen: string;
  fontDisplay: string;
  fontBody: string;
  fontCode: string;
  letterSpacing: string;
}

export const GENRE_META: Record<
  ContentGenre,
  { kicker: string; badge: string; footerTag: string; defaultTags: string[]; defaultTheme: string }
> = {
  travel: {
    kicker: 'TRAVEL & LIFESTYLE',
    badge: '旅行手记',
    footerTag: '备忘录 · 旅途随手记',
    defaultTags: ['旅行日记', '城市漫游', '生活记录'],
    defaultTheme: 'ios-memo',
  },
  essay: {
    kicker: 'PERSONAL NOTES',
    badge: '个人随笔',
    footerTag: '备忘录 · 日常思考',
    defaultTags: ['个人随笔', '日常思考', '生活碎片'],
    defaultTheme: 'ios-memo',
  },
  reading: {
    kicker: 'READING DIGEST',
    badge: '读书札记',
    footerTag: '极简杂志 · 阅读摘录',
    defaultTags: ['读书笔记', '深度阅读', '个人成长'],
    defaultTheme: 'minimalist-magazine',
  },
  tech: {
    kicker: 'TECH NOTES',
    badge: '技术实践',
    footerTag: '技术笔记 · 工程实践',
    defaultTags: ['技术分享', '工程实践', '效率工具'],
    defaultTheme: 'ios-memo',
  },
};

export const PLATFORM_COVER_SPECS: Record<
  PlatformCoverRatio,
  { width: number; height: number; label: string; platforms: string }
> = {
  '3:4': {
    width: 1242,
    height: 1656,
    label: '小红书 3:4 (1242×1656)',
    platforms: '小红书标准 3:4 图文 / 抖音图文',
  },
  '2:3': {
    width: 1080,
    height: 1620,
    label: '小红书长文 2:3 (1080×1620)',
    platforms: 'xhs-textcard 标准长文画幅 (500×750 同比例高清)',
  },
  '9:16': {
    width: 1080,
    height: 1920,
    label: '短视频 9:16 (1080×1920)',
    platforms: '抖音全屏图文 / 快拍竖屏画幅',
  },
  '16:9': {
    width: 1280,
    height: 720,
    label: '专栏横版 16:9 (1280×720)',
    platforms: '知乎专栏 / 百家号 / B站专栏封面',
  },
  '2.35:1': {
    width: 1080,
    height: 460,
    label: '公众号头条 2.35:1 (1080×460)',
    platforms: '微信公众号首图横幅',
  },
};

export const SOCIAL_CARD_PRESETS: Record<string, SocialCardTokens> = {
  'ios-memo': {
    id: 'ios-memo',
    name: '苹果备忘录 (Apple Notes)',
    chrome: 'ios-memo',
    kicker: '备忘录',
    footerSignature: 'iOS Notes • 苹果备忘录',
    description: '2026版 iOS 备忘录极致还原，浅灰底配圆角横线白纸与经典暖橙标题高亮，小红书最高频爆款模板',
    paper: '#F2F2F7',
    sheetBg: '#FFFFFF',
    ruledLineColor: '#F2F2F7',
    ink: '#1C1C1E',
    headingInk: '#1C1C1E',
    textSecondary: '#3A3A3C',
    textMuted: '#8E8E93',
    line: 'rgba(28, 28, 30, 0.08)',
    lineStrong: '#FF9500',
    accent: '#FF9500',
    accentInk: '#E08200',
    accentSurface: 'rgba(255, 149, 0, 0.14)',
    highlightBg: 'rgba(255, 149, 0, 0.16)',
    cardBg: '#FFFFFF',
    quoteBg: 'rgba(255, 149, 0, 0.08)',
    codeBg: '#F7F7FA',
    codeInk: '#1C1C1E',
    codeBorder: 'rgba(28, 28, 30, 0.12)',
    windowDotRed: '#ff5f56',
    windowDotYellow: '#ffbd2e',
    windowDotGreen: '#27c93f',
    fontDisplay: "'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', 'Source Han Sans SC', 'Microsoft YaHei', -apple-system, sans-serif",
    fontBody: "'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', 'Source Han Sans SC', 'Microsoft YaHei', -apple-system, sans-serif",
    fontCode: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace",
    letterSpacing: '0px',
  },
  'minimalist-magazine': {
    id: 'minimalist-magazine',
    name: '极简杂志 (Minimalist)',
    chrome: 'minimalist-magazine',
    kicker: 'MINIMAL MAGAZINE',
    footerSignature: 'Minimalist Magazine • 现代社论排版',
    description: '现代社论排版美学，纯白画布配上下极细分割线、宋刻衬线体与学院绛红强调色，让文字拥有纸质出版物的高级感',
    paper: '#FFFFFF',
    sheetBg: '#FFFFFF',
    ruledLineColor: 'transparent',
    ink: '#1A1A1A',
    headingInk: '#8C3A3A',
    textSecondary: '#3D3535',
    textMuted: '#999999',
    line: 'rgba(26, 26, 26, 0.12)',
    lineStrong: '#8C3A3A',
    accent: '#8C3A3A',
    accentInk: '#8C3A3A',
    accentSurface: 'rgba(140, 58, 58, 0.12)',
    highlightBg: 'rgba(140, 58, 58, 0.15)',
    cardBg: '#FFFFFF',
    quoteBg: 'rgba(140, 58, 58, 0.07)',
    codeBg: '#FAF8F7',
    codeInk: '#2B2222',
    codeBorder: 'rgba(140, 58, 58, 0.18)',
    windowDotRed: '#ff5f56',
    windowDotYellow: '#ffbd2e',
    windowDotGreen: '#27c93f',
    fontDisplay: "'Songti SC', 'Noto Serif SC', 'Source Han Serif SC', 'STSong', 'SimSun', Georgia, serif",
    fontBody: "'Songti SC', 'Noto Serif SC', 'Source Han Serif SC', 'STSong', 'SimSun', Georgia, serif",
    fontCode: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace",
    letterSpacing: '0.4px',
  },
  blank: {
    id: 'blank',
    name: '空白模板 (Pure Blank)',
    chrome: 'blank',
    kicker: 'PURE TEXT',
    footerSignature: 'Pure Blank • 回归文字本质',
    description: '纯净极简背景，零顶栏、零分割线、零多余装饰框，克制冷灰标题配纯黑正文，专注文字本身的力量',
    paper: '#FFFFFF',
    sheetBg: '#FFFFFF',
    ruledLineColor: 'transparent',
    ink: '#1A1A1A',
    headingInk: '#111111',
    textSecondary: '#4A4A4A',
    textMuted: '#B0B0B0',
    line: 'rgba(26, 26, 26, 0.08)',
    lineStrong: '#999999',
    accent: '#8A8A8A',
    accentInk: '#666666',
    accentSurface: 'rgba(153, 153, 153, 0.14)',
    highlightBg: 'rgba(153, 153, 153, 0.20)',
    cardBg: '#FFFFFF',
    quoteBg: 'rgba(153, 153, 153, 0.09)',
    codeBg: '#F7F7F7',
    codeInk: '#1A1A1A',
    codeBorder: 'rgba(0, 0, 0, 0.10)',
    windowDotRed: '#d4d4d4',
    windowDotYellow: '#bdbdbd',
    windowDotGreen: '#9e9e9e',
    fontDisplay: "'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', 'Source Han Sans SC', 'Microsoft YaHei', -apple-system, sans-serif",
    fontBody: "'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', 'Source Han Sans SC', 'Microsoft YaHei', -apple-system, sans-serif",
    fontCode: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace",
    letterSpacing: '0.3px',
  },
  'elegant-book': {
    id: 'elegant-book',
    name: '书籍内页 (Book Page)',
    chrome: 'elegant-book',
    kicker: 'BOOK PAGE',
    footerSignature: 'Classic Book Page • 纸质书内页',
    description: '优雅的泛黄暖纸张与左侧书脊微阴影，复刻经典实体出版物阅读质感，适合读书笔记与长文随笔',
    paper: '#FDFBF7',
    sheetBg: '#FDFBF7',
    ruledLineColor: 'transparent',
    ink: '#2B2B2B',
    headingInk: '#8C3A3A',
    textSecondary: '#4A433C',
    textMuted: '#9E9488',
    line: 'rgba(43, 43, 43, 0.10)',
    lineStrong: '#8C3A3A',
    accent: '#8C3A3A',
    accentInk: '#782E2E',
    accentSurface: 'rgba(140, 58, 58, 0.12)',
    highlightBg: 'rgba(140, 58, 58, 0.15)',
    cardBg: '#FDFBF7',
    quoteBg: 'rgba(140, 58, 58, 0.07)',
    codeBg: '#F4EFE6',
    codeInk: '#2B2520',
    codeBorder: 'rgba(140, 58, 58, 0.16)',
    windowDotRed: '#ff5f56',
    windowDotYellow: '#ffbd2e',
    windowDotGreen: '#27c93f',
    fontDisplay: "'Songti SC', 'Noto Serif SC', 'Source Han Serif SC', 'STSong', 'SimSun', Georgia, serif",
    fontBody: "'Songti SC', 'Noto Serif SC', 'Source Han Serif SC', 'STSong', 'SimSun', Georgia, serif",
    fontCode: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace",
    letterSpacing: '0.8px',
  },
  'fresh-gradient': {
    id: 'fresh-gradient',
    name: '清新渐变 (Fresh Gradient)',
    chrome: 'fresh-gradient',
    kicker: 'FRESH NOTES',
    footerSignature: 'Fresh Gradient • 清新渐变',
    description: '薄荷绿到淡紫的柔和弥散渐变背景，正文放在半透明白色圆角卡片里，青绿色强调，适合生活方式与干货清单',
    paper: 'linear-gradient(160deg, #DDF6EE 0%, #E3EEFF 55%, #F1E6FF 100%)',
    sheetBg: 'rgba(255, 255, 255, 0.82)',
    ruledLineColor: 'transparent',
    ink: '#1F2A37',
    headingInk: '#0F766E',
    textSecondary: '#3B4A5A',
    textMuted: '#7C8A99',
    line: 'rgba(15, 118, 110, 0.14)',
    lineStrong: '#14B8A6',
    accent: '#0D9488',
    accentInk: '#0F766E',
    accentSurface: 'rgba(20, 184, 166, 0.12)',
    highlightBg: 'rgba(250, 204, 21, 0.38)',
    cardBg: 'rgba(255, 255, 255, 0.82)',
    quoteBg: 'rgba(20, 184, 166, 0.08)',
    codeBg: '#F4FAF9',
    codeInk: '#1F2A37',
    codeBorder: 'rgba(15, 118, 110, 0.16)',
    windowDotRed: '#ff5f56',
    windowDotYellow: '#ffbd2e',
    windowDotGreen: '#27c93f',
    fontDisplay: "'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', 'Source Han Sans SC', 'Microsoft YaHei', -apple-system, sans-serif",
    fontBody: "'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', 'Source Han Sans SC', 'Microsoft YaHei', -apple-system, sans-serif",
    fontCode: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace",
    letterSpacing: '0.3px',
  },
};

const THEME_ALIASES: Record<string, string> = {
  'editorial-coral': 'ios-memo',
  'warm-note': 'ios-memo',
  'ink-classic': 'minimalist-magazine',
  'modern-minimal': 'blank',
  'forest-journal': 'elegant-book',
  'travel-forest': 'elegant-book',
  'mint-gradient': 'fresh-gradient',
  'swiss-slate': 'minimalist-magazine',
  'academic-blue': 'minimalist-magazine',
};

export function getSocialCardTheme(id?: string): SocialCardTokens {
  if (id) {
    if (Object.prototype.hasOwnProperty.call(SOCIAL_CARD_PRESETS, id)) {
      return SOCIAL_CARD_PRESETS[id];
    }
    const resolved = THEME_ALIASES[id];
    if (resolved && SOCIAL_CARD_PRESETS[resolved]) {
      return SOCIAL_CARD_PRESETS[resolved];
    }
  }
  return SOCIAL_CARD_PRESETS['ios-memo'];
}

/** Content-box insets per template chrome (design px on the 1242px-wide canvas). */
export const CARD_CHROME_INSETS: Record<CardTemplateChrome, CardContentInsets> = {
  'ios-memo': { x: 100, top: 186, bottom: 150 },
  'minimalist-magazine': { x: 104, top: 168, bottom: 150 },
  blank: { x: 100, top: 128, bottom: 140 },
  'elegant-book': { x: 120, top: 160, bottom: 150 },
  'fresh-gradient': { x: 112, top: 160, bottom: 196 },
};

/** Size of the flowing content box for a theme and output ratio (design px). */
export function getCardContentBox(themeId?: string, ratio: PlatformCoverRatio = '3:4'): CardContentBox {
  const spec = PLATFORM_COVER_SPECS[ratio] || PLATFORM_COVER_SPECS['3:4'];
  const insets = CARD_CHROME_INSETS[getSocialCardTheme(themeId).chrome];
  return contentBoxFor(insets, cardDesignHeight(spec.width, spec.height));
}
