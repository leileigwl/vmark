import { ArrowUpRight, Download } from 'lucide-react';
import type { SiteContent } from '../data/types';

interface FooterCtaProps {
  content: SiteContent;
}

const RELEASES_URL = 'https://github.com/leileigwl/vmark/releases/latest';
const REPO_URL = 'https://github.com/leileigwl/vmark';
const LICENSE_URL = 'https://github.com/leileigwl/vmark/blob/master/LICENSE';

export function FooterCta({ content }: FooterCtaProps) {
  const { footer } = content;

  return (
    <footer className="bg-white dark:bg-[#141210]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="craft-cta-wash rounded-3xl border border-stone-200/90 px-6 py-12 text-center shadow-sm sm:px-12 sm:py-16 dark:border-stone-800">
          <h2 className="mx-auto max-w-2xl text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl dark:text-stone-50">
            {footer.ctaTitle}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-stone-600 sm:text-base dark:text-stone-300">
            {footer.ctaSubtitle}
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1C1917] px-6 text-sm font-medium text-white shadow-sm transition-colors hover:bg-stone-800 sm:w-auto dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200"
            >
              <Download className="h-4 w-4" />
              <span>{footer.ctaDownload}</span>
            </a>

            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-stone-200/90 bg-white/90 px-6 text-sm font-medium text-stone-800 transition-colors hover:bg-white sm:w-auto dark:border-stone-700 dark:bg-[#1E1C1A]/90 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              <span>{footer.ctaRepo}</span>
              <ArrowUpRight className="h-4 w-4 text-stone-400" />
            </a>
          </div>

          <p className="mt-5 font-mono text-xs text-stone-500 dark:text-stone-400">
            {footer.license}
          </p>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-stone-200/80 pt-8 text-xs text-stone-500 sm:flex-row dark:border-stone-800 dark:text-stone-400">
          <span>{footer.copyright}</span>

          <div className="flex flex-wrap items-center gap-5">
            <a
              href={RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-stone-900 dark:hover:text-stone-200"
            >
              {footer.links.releases}
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-stone-900 dark:hover:text-stone-200"
            >
              {footer.links.source}
            </a>
            <a
              href="/llms.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-stone-900 dark:hover:text-stone-200"
            >
              {footer.links.llms}
            </a>
            <a
              href={LICENSE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-stone-900 dark:hover:text-stone-200"
            >
              {footer.links.license}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
