/**
 * Social Card Design Tokens & Theme Presets
 * Inspired by Guizang Editorial x Swiss Design System (8.2k★) & Ray.so (2.4k★)
 * Strict contrast checking, semantic tokens, and distraction-free typography.
 */

export interface SocialCardTokens {
  id: string;
  name: string;
  kicker: string;
  description: string;
  paper: string; // Background / Canvas
  ink: string; // Primary Heading & Text
  textSecondary: string; // Lead / Subtitle / Deck
  textMuted: string; // Helper / Metadata / Hairline captions
  line: string; // Hairline rules
  lineStrong: string; // Accent lines / Borders
  accent: string; // Focal highlights
  accentInk: string; // Small text accents
  accentSurface: string; // Pills / Badges / Tags
  cardBg: string; // Elevated content container
  codeBg: string; // Ray.so code window background
  codeInk: string; // Code font color
  codeBorder: string; // Code window frame
  windowDotRed: string;
  windowDotYellow: string;
  windowDotGreen: string;
  fontDisplay: string;
  fontBody: string;
  fontCode: string;
}

export const SOCIAL_CARD_PRESETS: Record<string, SocialCardTokens> = {
  'ink-classic': {
    id: 'ink-classic',
    name: '墨水经典 (Ink Classic)',
    kicker: 'EDITORIAL NOTE',
    description: '归藏经典暖燕麦纸墨质感，典雅克制，适合深度复盘、产品与商业思考长文',
    paper: '#f2eee9',
    ink: '#141210',
    textSecondary: '#5a534c',
    textMuted: '#8c8278',
    line: 'rgba(20, 18, 16, 0.12)',
    lineStrong: 'rgba(20, 18, 16, 0.35)',
    accent: '#26221f',
    accentInk: '#1a1816',
    accentSurface: '#e6e0d8',
    cardBg: '#faf8f5',
    codeBg: '#181614',
    codeInk: '#e8e2d8',
    codeBorder: 'rgba(20, 18, 16, 0.15)',
    windowDotRed: '#ff5f56',
    windowDotYellow: '#ffbd2e',
    windowDotGreen: '#27c93f',
    fontDisplay: "-apple-system, BlinkMacSystemFont, 'Songti SC', 'Noto Serif SC', serif",
    fontBody: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', sans-serif",
    fontCode: "'JetBrains Mono', 'SF Mono', Consolas, monospace",
  },
  'swiss-slate': {
    id: 'swiss-slate',
    name: '瑞士工科 (Swiss Slate)',
    kicker: 'SYSTEM BLUEPRINT',
    description: '瑞士国际主义网格系统，冷调理性，专为系统架构、协议推导与工程设计',
    paper: '#f8fafc',
    ink: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#94a3b8',
    line: 'rgba(15, 23, 42, 0.1)',
    lineStrong: '#2563eb',
    accent: '#2563eb',
    accentInk: '#1d4ed8',
    accentSurface: '#eff6ff',
    cardBg: '#ffffff',
    codeBg: '#0f172a',
    codeInk: '#93c5fd',
    codeBorder: '#cbd5e1',
    windowDotRed: '#ef4444',
    windowDotYellow: '#f59e0b',
    windowDotGreen: '#10b981',
    fontDisplay: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'SF Pro Display', sans-serif",
    fontBody: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif",
    fontCode: "'JetBrains Mono', 'Fira Code', monospace",
  },
  'ray-dark': {
    id: 'ray-dark',
    name: '极客暗夜 (Ray Dark)',
    kicker: 'ENGINEERING SPEC',
    description: 'Ray.so 标杆工业级暗黑代码美学，深邃极客背景与流光边框，代码高亮首选',
    paper: '#0d1117',
    ink: '#f0f6fc',
    textSecondary: '#8b949e',
    textMuted: '#6e7681',
    line: 'rgba(240, 246, 252, 0.12)',
    lineStrong: '#58a6ff',
    accent: '#58a6ff',
    accentInk: '#79c0ff',
    accentSurface: 'rgba(56, 139, 253, 0.16)',
    cardBg: '#161b22',
    codeBg: '#010409',
    codeInk: '#a5d6ff',
    codeBorder: '#30363d',
    windowDotRed: '#ff5f56',
    windowDotYellow: '#ffbd2e',
    windowDotGreen: '#27c93f',
    fontDisplay: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif",
    fontBody: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
    fontCode: "'JetBrains Mono', 'Monaco', Consolas, monospace",
  },
  'editorial-coral': {
    id: 'editorial-coral',
    name: '珊瑚白茶 (Editorial Coral)',
    kicker: 'CREATOR DIGEST',
    description: '小红书高赞爆款温馨白茶底色，融合克制暖珊瑚红，兼具审美与阅读舒适度',
    paper: '#fdfaf7',
    ink: '#2b231f',
    textSecondary: '#6e5d53',
    textMuted: '#9e8b80',
    line: 'rgba(43, 35, 31, 0.1)',
    lineStrong: '#e05338',
    accent: '#e05338',
    accentInk: '#c43d24',
    accentSurface: '#fdead6',
    cardBg: '#ffffff',
    codeBg: '#2a221f',
    codeInk: '#fbd0c8',
    codeBorder: '#ebd9cb',
    windowDotRed: '#ff6259',
    windowDotYellow: '#ffc107',
    windowDotGreen: '#28a745',
    fontDisplay: "-apple-system, BlinkMacSystemFont, 'Hiragino Sans GB', 'PingFang SC', sans-serif",
    fontBody: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Microsoft YaHei', sans-serif",
    fontCode: "'JetBrains Mono', Consolas, monospace",
  },
};

// Backwards compatibility alias mapping
const THEME_ALIASES: Record<string, string> = {
  'geek-dark': 'ray-dark',
  'warm-note': 'editorial-coral',
  'modern-minimal': 'ink-classic',
  'academic-blue': 'swiss-slate',
};

export function getSocialCardTheme(id?: string): SocialCardTokens {
  if (id) {
    if (SOCIAL_CARD_PRESETS[id]) return SOCIAL_CARD_PRESETS[id];
    const resolved = THEME_ALIASES[id];
    if (resolved && SOCIAL_CARD_PRESETS[resolved]) return SOCIAL_CARD_PRESETS[resolved];
  }
  return SOCIAL_CARD_PRESETS['ray-dark'];
}
