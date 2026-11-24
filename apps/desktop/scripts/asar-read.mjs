// 只读解析 Electron 的 app.asar（不引入额外依赖），供发布流水线检查打包产物。
// 格式：[uint32 4][uint32 头部 pickle 长度][uint32 载荷长度][uint32 JSON 长度][JSON 头][文件数据…]
import { closeSync, openSync, readSync } from 'node:fs';

function readAt(fd, length, position) {
  const buf = Buffer.alloc(length);
  const n = readSync(fd, buf, 0, length, position);
  if (n !== length) throw new Error(`asar 文件过短：想读 ${length} 字节，只读到 ${n}`);
  return buf;
}

/** 读出 asar 头：返回 { header, dataOffset }。 */
export function readAsarHeader(asarPath) {
  const fd = openSync(asarPath, 'r');
  try {
    const sizeBuf = readAt(fd, 8, 0);
    const headerPickleSize = sizeBuf.readUInt32LE(4);
    const headerBuf = readAt(fd, headerPickleSize, 8);
    const jsonLength = headerBuf.readUInt32LE(4);
    const header = JSON.parse(headerBuf.subarray(8, 8 + jsonLength).toString('utf8'));
    return { header, dataOffset: 8 + headerPickleSize };
  } finally {
    closeSync(fd);
  }
}

/** 列出 asar 里所有文件（不含目录），路径用 / 分隔；unpacked 标记为 true 的文件在 app.asar.unpacked 里。 */
export function listAsarFiles(asarPath) {
  const { header } = readAsarHeader(asarPath);
  const out = [];
  const walk = (node, prefix) => {
    for (const [name, child] of Object.entries(node.files ?? {})) {
      const p = prefix ? `${prefix}/${name}` : name;
      if (child.files) walk(child, p);
      else out.push({ path: p, size: Number(child.size ?? 0), unpacked: child.unpacked === true });
    }
  };
  walk(header, '');
  return out;
}

/** 读取 asar 内某个（未 unpack 的）文件内容。 */
export function readAsarFile(asarPath, filePath) {
  const { header, dataOffset } = readAsarHeader(asarPath);
  let node = header;
  for (const part of filePath.split('/')) {
    node = node.files?.[part];
    if (!node) throw new Error(`asar 里没有 ${filePath}`);
  }
  if (node.files) throw new Error(`${filePath} 是目录`);
  if (node.unpacked) throw new Error(`${filePath} 在 app.asar.unpacked 里`);
  const fd = openSync(asarPath, 'r');
  try {
    return readAt(fd, Number(node.size), dataOffset + Number(node.offset));
  } finally {
    closeSync(fd);
  }
}
