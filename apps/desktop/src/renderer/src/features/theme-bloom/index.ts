import { useEffect, useState } from 'react';
import type { ThemeId } from '@vcat/shared';

/** Manages active UI theme state and custom Typora CSS stylesheet import. */
export function useThemeBloom() {
  const [theme, setTheme] = useState<ThemeId>('apple-light');
  const [customThemeName, setCustomThemeName] = useState<string>('');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  async function handleImportTyporaTheme() {
    const res = await window.electronAPI.importTyporaThemeCss();
    if (!res) return;
    const scopedCss = res.css
      .replace(/#write\b/g, '.vditor-ir pre.vditor-reset')
      .replace(/body\b/g, '.vcat-custom-theme-active');
    let styleEl = document.getElementById('vcat-custom-typora-theme') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'vcat-custom-typora-theme';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = scopedCss;
    setCustomThemeName(res.name);
    setTheme('custom-typora');
  }

  return {
    theme,
    setTheme,
    customThemeName,
    handleImportTyporaTheme,
  };
}
