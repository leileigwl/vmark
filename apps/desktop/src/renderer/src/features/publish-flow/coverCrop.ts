import { RATIO_VALUE, type CoverRatio } from './platformSpecs.ts';

const OUTPUT_WIDTH: Record<CoverRatio, number> = { '2.35:1': 1080, '16:9': 1280, '3:4': 1080, '1:1': 1080 };

/** 渲染进程里可显示的图片地址：相对路径走 vcat-asset 协议。 */
export function previewSrc(src: string): string {
  if (!src) return '';
  if (/^(https?:|data:|blob:|vcat-asset:)/i.test(src)) return src;
  return `vcat-asset://local/${src.replace(/^\.\//, '')}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = previewSrc(src);
  });
}

/** 按焦点把封面裁成指定比例，保存到工作区 assets，返回相对路径。 */
export async function cropCover(src: string, ratio: CoverRatio, focus: { x: number; y: number }): Promise<string> {
  const img = await loadImage(src);
  const target = RATIO_VALUE[ratio];
  const srcRatio = img.naturalWidth / img.naturalHeight;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (srcRatio > target) sw = sh * target;
  else sh = sw / target;
  const sx = Math.min(Math.max(0, (img.naturalWidth * focus.x) / 100 - sw / 2), img.naturalWidth - sw);
  const sy = Math.min(Math.max(0, (img.naturalHeight * focus.y) / 100 - sh / 2), img.naturalHeight - sh);
  const outW = Math.min(OUTPUT_WIDTH[ratio], Math.round(sw));
  const outH = Math.round(outW / target);
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  const base64 = dataUrl.split(',')[1] ?? '';
  if (!window.electronAPI?.saveLocalImage) throw new Error('当前环境无法保存图片');
  const saved = await window.electronAPI.saveLocalImage(base64, 'jpg');
  return saved.relativeMarkdownPath.replace(/^\.\//, '');
}

/** 从本地选择图片并保存到工作区，返回相对路径。 */
export async function importLocalImage(file: File): Promise<string> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  if (!window.electronAPI?.saveLocalImage) throw new Error('当前环境无法保存图片');
  const saved = await window.electronAPI.saveLocalImage(base64, ext);
  return saved.relativeMarkdownPath.replace(/^\.\//, '');
}
