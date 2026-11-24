import fs from 'node:fs';
import path from 'node:path';

/** 按 asar 格式写一个最小包：[4][头 pickle 长度][载荷长度][JSON 长度][JSON][数据]，供检查打包产物的脚本做测试夹具。 */
export function writeAsar(file: string, entries: Record<string, string>): void {
  type AsarNode = { files: Record<string, AsarNode> } | { size: number; offset: string };
  const files: Record<string, AsarNode> = {};
  const chunks: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const data = Buffer.from(content, 'utf8');
    const parts = name.split('/');
    let dir = files;
    for (const part of parts.slice(0, -1)) {
      const next = dir[part] ?? { files: {} };
      dir[part] = next;
      if (!('files' in next)) throw new Error(`${part} 不是目录`);
      dir = next.files;
    }
    dir[parts[parts.length - 1]] = { size: data.length, offset: String(offset) };
    chunks.push(data);
    offset += data.length;
  }
  const json = Buffer.from(JSON.stringify({ files }), 'utf8');
  const padded = Math.ceil(json.length / 4) * 4;
  const headerPickle = Buffer.alloc(8 + padded);
  headerPickle.writeUInt32LE(4 + padded, 0);
  headerPickle.writeUInt32LE(json.length, 4);
  json.copy(headerPickle, 8);
  const sizePickle = Buffer.alloc(8);
  sizePickle.writeUInt32LE(4, 0);
  sizePickle.writeUInt32LE(headerPickle.length, 4);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([sizePickle, headerPickle, ...chunks]));
}
