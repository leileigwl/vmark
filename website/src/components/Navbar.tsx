import { ArrowUpRight, Globe, Moon, Sun } from 'lucide-react';
import type { Lang, SiteContent, Theme } from '../data/types';

interface NavbarProps {
  content: SiteContent;
  lang: Lang;
  theme: Theme;
  onToggleLang: () => void;
  onToggleTheme: () => void;
}

const RELEASES_URL = 'https://github.com/leileigwl/vmark/releases/latest';
const REPO_URL = 'https://github.com/leileigwl/vmark';

export function Navbar({
  content,
  lang,
  theme,
  onToggleLang,
  onToggleTheme,
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-[#FBF8F3]/85 backdrop-blur-md dark:border-stone-800/80 dark:bg-[#141210]/85">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a
          href="#"
          className="flex items-center gap-2.5 text-stone-900 transition-opacity hover:opacity-85 dark:text-stone-50"
        >
          <img
            src="/favicon.svg"
            alt="Vmark Logo"
            className="h-8 w-8 rounded-lg shadow-xs"
            width={32}
            height={32}
          />
          <span className="text-base font-semibold tracking-tight">
            {content.brand.name}
          </span>
          <span className="hidden rounded-md border border-stone-200 bg-white px-2 py-0.5 text-xs font-medium text-stone-600 sm:inline-block dark:border-stone-800 dark:bg-[#1C1B1A] dark:text-stone-400">
            {content.brand.subname}
          </span>
        </a>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
          {content.nav.items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-stone-600 transition-colors hover:text-stone-950 dark:text-stone-400 dark:hover:text-stone-50"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleLang}
            aria-label={lang === 'zh' ? 'Switch to English' : '切换为中文'}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-100 dark:border-stone-800 dark:bg-[#1C1B1A] dark:text-stone-300 dark:hover:bg-stone-800"
          >
            <Globe className="h-3.5 w-3.5 text-stone-500 dark:text-stone-400" />
            <span>{content.nav.langToggleLabel}</span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-700 transition-colors hover:bg-stone-100 dark:border-stone-800 dark:bg-[#1C1B1A] dark:text-stone-300 dark:hover:bg-stone-800"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>

          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden h-9 items-center gap-1 rounded-lg px-3 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-200/60 hover:text-stone-950 sm:inline-flex dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-50"
          >
            <span>{content.nav.github}</span>
            <ArrowUpRight className="h-3.5 w-3.5 opacity-60" />
          </a>

          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center rounded-lg bg-[#1C1917] px-3.5 text-sm font-medium text-white shadow-xs transition-colors hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200"
          >
            {content.nav.download}
          </a>
        </div>
      </div>
    </header>
  );
}
