/**
 * Social Card Design Tokens & Theme Presets
 * Inspired by Guizang Editorial x Swiss Design System (8.2k★), Ray.so (2.4k★),
 * and Xiaohongshu / Douyin UGC Magazine Templates.
 */

export type ContentGenre = 'essay' | 'travel' | 'reading' | 'tech';

export type PlatformCoverRatio = '3:4' | '9:16' | '16:9' | '2.35:1';

export interface SocialCardTokens {
  id: string;
  name: string;
  kicker: string;
  footerSignature: string;
  description: string;
  paper: string;
  ink: string;
  textSecondary: string;
  textMuted: string;
  line: string;
  lineStrong: string;
  accent: string;
  accentInk: string;
  accentSurface: string;
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
}

export const GENRE_META: Record<
  ContentGenre,
  { kicker: string; badge: string; footerTag: string; defaultTags: string[]; defaultTheme: string }
> = {
  travel: {
    kicker: 'TRAVEL & LIFESTYLE LOG',
    badge: '旅行手记',
    footerTag: 'Travel & City Walk Journal • 旅途见闻录',
    defaultTags: ['旅行日记', '城市漫游', '生活记录'],
    defaultTheme: 'editorial-coral',
  },
  essay: {
    kicker: 'PERSONAL ESSAY & NOTES',
    badge: '个人随笔',
    footerTag: 'Personal Essay & Reflection • 独立博客随笔',
    defaultTags: ['个人随笔', '日常思考', '生活碎片'],
    defaultTheme: 'ink-classic',
  },
  reading: {
    kicker: 'READING & BOOK DIGEST',
    badge: '读书札记',
    footerTag: 'Book Digest & Takeaways • 阅读与思辨',
    defaultTags: ['读书笔记', '深度阅读', '个人成长'],
    defaultTheme: 'ink-classic',
  },
  tech: {
    kicker: 'ENGINEERING & TECH DIGEST',
    badge: '技术实践',
    footerTag: 'Editorial × Ray.so Spec • 工程与架构笔记',
    defaultTags: ['技术分享', '工程实践', '效率工具'],
    defaultTheme: 'ray-dark',
  },
};

export const PLATFORM_COVER_SPECS: Record<
  PlatformCoverRatio,
  { width: number; height: number; label: string; platforms: string }
> = {
  '3:4': {
    width: 1080,
    height: 1440,
    label: '3:4 竖版黄金画幅 (1080×1440)',
    platforms: '小红书图文 / 抖音图文黄金比例',
  },
  '9:16': {
    width: 1080,
    height: 1920,
    label: '9:16 全屏沉浸画幅 (1080×1920)',
    platforms: '抖音全屏图文 / 快拍竖屏封面',
  },
  '16:9': {
    width: 1280,
    height: 720,
    label: '16:9 宽屏专栏画幅 (1280×720)',
    platforms: '知乎专栏 / 百家号 / B站专栏 / 掘金封面',
  },
  '2.35:1': {
    width: 1080,
    height: 460,
    label: '2.35:1 影院横幅首图 (1080×460)',
    platforms: '微信公众号头条大图封面',
  },
};

export const SOCIAL_CARD_PRESETS: Record<string, SocialCardTokens> = {
  'editorial-coral': {
    id: 'editorial-coral',
    name: '珊瑚白茶 (Editorial Coral)',
    kicker: 'CREATOR MAGAZINE',
    footerSignature: 'Editorial Magazine • 创作者图文志',
    description: '小红书高赞爆款温润白茶底色，融合暖珊瑚红提亮，适合旅行日记、生活方式与个人分享',
    paper: '#fdfaf6',
    ink: '#261f1b',
    textSecondary: '#63534a',
    textMuted: '#968378',
    line: 'rgba(38, 31, 27, 0.11)',
    lineStrong: '#e05338',
    accent: '#e05338',
    accentInk: '#be3a21',
    accentSurface: '#fde9df',
    cardBg: '#ffffff',
    quoteBg: '#fbf3ec',
    codeBg: '#231c19',
    codeInk: '#fde2d9',
    codeBorder: '#e6d3c5',
    windowDotRed: '#ff6259',
    windowDotYellow: '#ffc107',
    windowDotGreen: '#28a745',
    fontDisplay: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', sans-serif",
    fontBody: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    fontCode: "'JetBrains Mono', 'SF Mono', Consolas, monospace",
  },
  'ink-classic': {
    id: 'ink-classic',
    name: '墨水经典 (Ink Classic)',
    kicker: 'EDITORIAL ESSAY',
    footerSignature: 'Guizang Editorial • 纸墨人文随笔',
    description: '归藏经典暖燕麦纸墨质感，典雅克制，适合个人博客随笔、读书笔记与深度长文',
    paper: '#f3efe9',
    ink: '#161412',
    textSecondary: '#524b44',
    textMuted: '#857b71',
    line: 'rgba(22, 20, 18, 0.13)',
    lineStrong: '#26221f',
    accent: '#8c3f2b',
    accentInk: '#6e2e1d',
    accentSurface: '#e7e0d6',
    cardBg: '#faf8f5',
    quoteBg: '#ece6dd',
    codeBg: '#181614',
    codeInk: '#e8e2d8',
    codeBorder: 'rgba(22, 20, 18, 0.18)',
    windowDotRed: '#ff5f56',
    windowDotYellow: '#ffbd2e',
    windowDotGreen: '#27c93f',
    fontDisplay: "-apple-system, BlinkMacSystemFont, 'Songti SC', 'Noto Serif SC', 'PingFang SC', serif",
    fontBody: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'SF Pro Text', sans-serif",
    fontCode: "'JetBrains Mono', 'SF Mono', Consolas, monospace",
  },
  'forest-journal': {
    id: 'forest-journal',
    name: '森系手记 (Forest Journal)',
    kicker: 'TRAVEL & LIFE LOG',
    footerSignature: 'Field Notes & Travelogue • 漫游手记',
    description: '清新松针绿配暖米白纸感，专为旅行游记、徒步露营、摄影探店与周末生活记录打造',
    paper: '#f4f7f4',
    ink: '#16241c',
    textSecondary: '#43584b',
    textMuted: '#758b7d',
    line: 'rgba(22, 36, 28, 0.11)',
    lineStrong: '#1f6f50',
    accent: '#1f6f50',
    accentInk: '#16563d',
    accentSurface: '#e0efe7',
    cardBg: '#ffffff',
    quoteBg: '#eaf3ee',
    codeBg: '#132019',
    codeInk: '#c8f0dc',
    codeBorder: '#c5dcd0',
    windowDotRed: '#ff5f56',
    windowDotYellow: '#ffbd2e',
    windowDotGreen: '#27c93f',
    fontDisplay: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', sans-serif",
    fontBody: "-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif",
    fontCode: "'JetBrains Mono', 'SF Mono', Consolas, monospace",
  },
  'swiss-slate': {
    id: 'swiss-slate',
    name: '瑞士工科 (Swiss Slate)',
    kicker: 'SYSTEM BLUEPRINT',
    footerSignature: 'Swiss Grid System • 结构化知识卡',
    description: '瑞士国际主义网格系统，冷调理性，适合方法论清单、效率复盘与架构推导',
    paper: '#f8fafc',
    ink: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#64748b',
    line: 'rgba(15, 23, 42, 0.11)',
    lineStrong: '#2563eb',
    accent: '#2563eb',
    accentInk: '#1d4ed8',
    accentSurface: '#e8f0fe',
    cardBg: '#ffffff',
    quoteBg: '#f1f5f9',
    codeBg: '#0f172a',
    codeInk: '#bfdbfe',
    codeBorder: '#cbd5e1',
    windowDotRed: '#ef4444',
    windowDotYellow: '#f59e0b',
    windowDotGreen: '#10b981',
    fontDisplay: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', sans-serif",
    fontBody: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', sans-serif",
    fontCode: "'JetBrains Mono', 'Fira Code', monospace",
  },
  'ray-dark': {
    id: 'ray-dark',
    name: '极客暗夜 (Ray Dark)',
    kicker: 'CREATOR SPOTLIGHT',
    footerSignature: 'Ray.so Dark Aesthetic • 极夜高对比图文',
    description: '高对比暗夜流光美学，抖音图文爆款吸睛背景与代码块渲染首选',
    paper: '#0d1117',
    ink: '#f0f6fc',
    textSecondary: '#9ca3af',
    textMuted: '#6e7681',
    line: 'rgba(240, 246, 252, 0.14)',
    lineStrong: '#58a6ff',
    accent: '#58a6ff',
    accentInk: '#79c0ff',
    accentSurface: 'rgba(56, 139, 253, 0.18)',
    cardBg: '#161b22',
    quoteBg: '#1c2330',
    codeBg: '#010409',
    codeInk: '#a5d6ff',
    codeBorder: '#30363d',
    windowDotRed: '#ff5f56',
    windowDotYellow: '#ffbd2e',
    windowDotGreen: '#27c93f',
    fontDisplay: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif",
    fontBody: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'SF Pro Text', sans-serif",
    fontCode: "'JetBrains Mono', 'Monaco', Consolas, monospace",
  },
};

const THEME_ALIASES: Record<string, string> = {
  'geek-dark': 'ray-dark',
  'warm-note': 'editorial-coral',
  'modern-minimal': 'ink-classic',
  'academic-blue': 'swiss-slate',
  'travel-forest': 'forest-journal',
};

export function getSocialCardTheme(id?: string): SocialCardTokens {
  if (id) {
    if (SOCIAL_CARD_PRESETS[id]) return SOCIAL_CARD_PRESETS[id];
    const resolved = THEME_ALIASES[id];
    if (resolved && SOCIAL_CARD_PRESETS[resolved]) return SOCIAL_CARD_PRESETS[resolved];
  }
  return SOCIAL_CARD_PRESETS['editorial-coral'];
}
