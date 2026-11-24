// node --test 里没有 Electron 运行时：把 `electron` 解析到假实现，
// 并给主进程里不带扩展名的相对导入（'./browserStealth'）补上 .ts。只在测试里 register。
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const STUB_URL = new URL('./electronStub.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'electron') return { url: STUB_URL, shortCircuit: true };
  if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier) && context.parentURL?.endsWith('.ts')) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
