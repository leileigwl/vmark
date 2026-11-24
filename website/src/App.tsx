import { useEffect, useState } from 'react';
import { BentoFeatures } from './components/BentoFeatures';
import { FaqSection } from './components/FaqSection';
import { FooterCta } from './components/FooterCta';
import { HeroSection } from './components/HeroSection';
import { Navbar } from './components/Navbar';
import { PlatformMatrix } from './components/PlatformMatrix';
import { WorkbenchShowcase } from './components/WorkbenchShowcase';
import { contentEn } from './data/content-en';
import { contentZh } from './data/content-zh';
import type { Lang, Theme } from './data/types';

function getInitialLang(): Lang {
  if (typeof window === 'undefined') return 'zh';
  const params = new URLSearchParams(window.location.search);
  if (params.get('lang') === 'en') return 'en';
  try {
    const saved = localStorage.getItem('vmark_site_lang');
    if (saved === 'en' || saved === 'zh') return saved;
  } catch {
    // ignore storage errors
  }
  return 'zh';
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function App() {
  const [lang, setLang] = useState<Lang>(getInitialLang);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  const content = lang === 'zh' ? contentZh : contentEn;

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = content.meta.title;
    const descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) {
      descMeta.setAttribute('content', content.meta.description);
    }
    try {
      localStorage.setItem('vmark_site_lang', lang);
    } catch {
      // ignore storage errors
    }
  }, [lang, content.meta.description, content.meta.title]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('vmark_site_theme', theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-stone-900 dark:bg-[#141312] dark:text-stone-100">
      <Navbar
        content={content}
        lang={lang}
        theme={theme}
        onToggleLang={() => setLang((prev) => (prev === 'zh' ? 'en' : 'zh'))}
        onToggleTheme={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
      />
      <main>
        <HeroSection content={content} />
        <WorkbenchShowcase content={content} />
        <BentoFeatures content={content} />
        <PlatformMatrix content={content} />
        <FaqSection content={content} />
      </main>
      <FooterCta content={content} />
    </div>
  );
}

export default App;
