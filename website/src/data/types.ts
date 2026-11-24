export type Lang = 'zh' | 'en';
export type Theme = 'light' | 'dark';

export interface NavItem {
  label: string;
  href: string;
}

export interface PillarItem {
  title: string;
  description: string;
  tag: string;
}

export interface ShowcaseTab {
  id: 'editor' | 'manager' | 'cards';
  label: string;
  badge: string;
  title: string;
  description: string;
  highlights: string[];
}

export interface BentoFeature {
  id: string;
  category: string;
  title: string;
  description: string;
  span: 'wide' | 'normal';
  icon: 'folder' | 'sparkles' | 'diagram' | 'palette' | 'image' | 'shield';
  bullets: string[];
}

export interface PlatformGroup {
  mode: string;
  badge: string;
  description: string;
  platforms: {
    name: string;
    detail: string;
  }[];
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface SiteContent {
  meta: {
    title: string;
    description: string;
  };
  brand: {
    name: string;
    subname: string;
  };
  nav: {
    items: NavItem[];
    download: string;
    github: string;
    langToggleLabel: string;
  };
  hero: {
    eyebrow: string;
    titleLine1: string;
    titleLine2: string;
    subtitle: string;
    primaryCta: string;
    secondaryCta: string;
    osNote: string;
    previewLightLabel: string;
    previewDarkLabel: string;
    previewLightAlt: string;
    previewDarkAlt: string;
    pillars: PillarItem[];
  };
  showcase: {
    eyebrow: string;
    title: string;
    subtitle: string;
    tabs: ShowcaseTab[];
    cardLabels: {
      xhsCover: string;
      inkCover: string;
      swissContent: string;
      douyinCode: string;
    };
  };
  bento: {
    eyebrow: string;
    title: string;
    subtitle: string;
    items: BentoFeature[];
  };
  platforms: {
    eyebrow: string;
    title: string;
    subtitle: string;
    groups: PlatformGroup[];
    safetyNote: string;
  };
  faq: {
    eyebrow: string;
    title: string;
    subtitle: string;
    items: FaqItem[];
  };
  footer: {
    ctaTitle: string;
    ctaSubtitle: string;
    ctaDownload: string;
    ctaRepo: string;
    license: string;
    links: {
      releases: string;
      source: string;
      llms: string;
      license: string;
    };
    copyright: string;
  };
}
