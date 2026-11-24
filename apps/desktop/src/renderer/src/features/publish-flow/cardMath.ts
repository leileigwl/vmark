import katex from 'katex';
import katexCss from 'katex/dist/katex.min.css?inline';
import { createKatexCardMath } from '@vcat/core';

/**
 * 缩略图用的 KaTeX：样式以字符串内联进卡片 iframe，字体由构建产出到应用资源目录
 * （iframe 需 allow-same-origin 才能加载这些字体；仍禁止脚本）。
 */
export const cardMath = createKatexCardMath(katex, katexCss);
