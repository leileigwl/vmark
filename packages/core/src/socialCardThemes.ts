export interface SocialCardTheme {
  id: string;
  name: string;
  description: string;
  background: string;
  textColor: string;
  secondaryTextColor: string;
  primaryColor: string;
  accentColor: string;
  cardBackground: string;
  borderColor: string;
  codeBackground: string;
  codeColor: string;
  tagBackground: string;
  tagTextColor: string;
  fontFamily: string;
}

export const SOCIAL_CARD_THEMES: Record<string, SocialCardTheme> = {
  'geek-dark': {
    id: 'geek-dark',
    name: '极客暗黑 (Geek Dark)',
    description: '针对代码块、终端高亮与公式优化的深色科技感主题',
    background: 'linear-gradient(145deg, #0d1117 0%, #161b22 100%)',
    textColor: '#e6edf3',
    secondaryTextColor: '#8b949e',
    primaryColor: '#58a6ff',
    accentColor: '#3fb950',
    cardBackground: '#161b22',
    borderColor: '#30363d',
    codeBackground: '#0d1117',
    codeColor: '#79c0ff',
    tagBackground: 'rgba(56, 139, 253, 0.15)',
    tagTextColor: '#58a6ff',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'JetBrains Mono', Consolas, sans-serif",
  },
  'warm-note': {
    id: 'warm-note',
    name: '暖奶便签 (Warm Note)',
    description: '小红书高赞爆款温馨治愈手账风格，适合随笔与干货分享',
    background: 'linear-gradient(135deg, #fdfbf7 0%, #f6eee3 100%)',
    textColor: '#3d2e24',
    secondaryTextColor: '#7c685b',
    primaryColor: '#ff6b4a',
    accentColor: '#e07a5f',
    cardBackground: '#ffffff',
    borderColor: '#eee2d5',
    codeBackground: '#f7f1eb',
    codeColor: '#c05621',
    tagBackground: '#ffe8e2',
    tagTextColor: '#e05338',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  },
  'modern-minimal': {
    id: 'modern-minimal',
    name: '现代极简 (Modern Minimal)',
    description: '黑白高对比现代杂志画报风，克制典雅，适合深度长文',
    background: '#f8f9fa',
    textColor: '#1a1a1a',
    secondaryTextColor: '#666666',
    primaryColor: '#000000',
    accentColor: '#2b2d42',
    cardBackground: '#ffffff',
    borderColor: '#e5e7eb',
    codeBackground: '#f1f3f5',
    codeColor: '#111827',
    tagBackground: '#f3f4f6',
    tagTextColor: '#374151',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'SF Pro Text', sans-serif",
  },
  'academic-blue': {
    id: 'academic-blue',
    name: '学术蓝灰 (Academic Blue)',
    description: '低饱和严谨冷调质感，专为技术架构、数学推导与论文笔记设计',
    background: 'linear-gradient(135deg, #f0f4f8 0%, #e2e8f0 100%)',
    textColor: '#1e293b',
    secondaryTextColor: '#64748b',
    primaryColor: '#2563eb',
    accentColor: '#0891b2',
    cardBackground: '#ffffff',
    borderColor: '#cbd5e1',
    codeBackground: '#f8fafc',
    codeColor: '#1d4ed8',
    tagBackground: '#dbeafe',
    tagTextColor: '#1e40af',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans', sans-serif",
  },
};

export function getSocialCardTheme(id?: string): SocialCardTheme {
  if (id && SOCIAL_CARD_THEMES[id]) {
    return SOCIAL_CARD_THEMES[id];
  }
  return SOCIAL_CARD_THEMES['geek-dark'];
}
