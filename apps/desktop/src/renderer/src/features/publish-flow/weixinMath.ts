/**
 * 公众号「复制富文本」里的公式：用编辑器自带的 MathJax（vditor 资源里的 tex-svg-full.js）在渲染进程里
 * 把 TeX 转成内联 SVG。公众号会删 class 和 <style>，KaTeX 的 HTML 贴进去会散架；SVG 只靠自身属性，
 * fontCache: 'none' 让每个 SVG 自带字形路径，不依赖页面里的 <defs>。
 * 加载或转换失败时返回 null / undefined，渲染器会退回到原样保留 $ 源码。
 */
export type WeixinMathRenderer = (tex: string, display: boolean) => string | undefined;

interface MathJaxApi {
  tex2svg?: (tex: string, options: { display: boolean }) => HTMLElement;
  startup?: { promise?: Promise<unknown>; typeset?: boolean };
  svg?: Record<string, unknown>;
}

let loading: Promise<WeixinMathRenderer | null> | null = null;

function toSvgRenderer(mj: MathJaxApi): WeixinMathRenderer {
  return (tex, display) => {
    try {
      const svg = mj.tex2svg?.(tex, { display }).querySelector('svg');
      if (!svg || svg.querySelector('[data-mml-node="merror"]')) return undefined;
      svg.removeAttribute('class');
      svg.style.maxWidth = '100%';
      return svg.outerHTML;
    } catch (err) {
      console.warn('[weixin-math] 公式转 SVG 失败，保留源码', err);
      return undefined;
    }
  };
}

/** 只加载一次；返回的渲染函数可以同步调用。 */
export function loadWeixinMath(): Promise<WeixinMathRenderer | null> {
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const w = window as unknown as { MathJax?: MathJaxApi };
    const finish = async () => {
      try {
        await w.MathJax?.startup?.promise;
      } catch (err) {
        console.warn('[weixin-math] MathJax 启动失败', err);
      }
      resolve(w.MathJax?.tex2svg ? toSvgRenderer(w.MathJax) : null);
    };
    if (w.MathJax?.tex2svg) {
      void finish();
      return;
    }
    w.MathJax = { ...w.MathJax, startup: { ...w.MathJax?.startup, typeset: false }, svg: { ...w.MathJax?.svg, fontCache: 'none' } };
    const base = window.location.protocol === 'file:' ? './vditor' : '/vditor';
    const script = document.createElement('script');
    script.src = `${base}/dist/js/mathjax/tex-svg-full.js`;
    script.async = true;
    script.onload = () => void finish();
    script.onerror = () => {
      console.warn('[weixin-math] 加载 MathJax 失败，公式保留源码');
      loading = null;
      resolve(null);
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** 正文里可能有公式（有 $）才需要加载 MathJax。 */
export function mayHaveMath(markdown: string): boolean {
  return markdown.includes('$');
}
