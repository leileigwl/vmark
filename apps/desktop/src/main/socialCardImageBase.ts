import path from 'node:path';
import { pathToFileURL } from 'node:url';

const IMAGE_SRC_RE = /(!\[[^\]]*\]\()([^)\s]+)/g;
const HAS_SCHEME_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * 卡片在 data: 页面里渲染，正文里的相对路径图片没有基准目录就加载不出来。
 * 把相对路径按 baseDir 解析成 file:// 地址；越出 baseDir、绝对路径、网络/data 图片保持原样。
 */
export function resolveCardImageSources(markdown: string, baseDir: string | undefined): string {
  if (!baseDir) return markdown;
  const root = path.resolve(baseDir);
  return markdown.replace(IMAGE_SRC_RE, (whole, head: string, src: string) => {
    if (HAS_SCHEME_RE.test(src) || src.startsWith('/') || path.isAbsolute(src)) return whole;
    let rel: string;
    try {
      rel = decodeURI(src);
    } catch {
      return whole;
    }
    const abs = path.resolve(root, rel);
    if (!abs.startsWith(`${root}${path.sep}`)) return whole;
    return `${head}${pathToFileURL(abs).href}`;
  });
}
