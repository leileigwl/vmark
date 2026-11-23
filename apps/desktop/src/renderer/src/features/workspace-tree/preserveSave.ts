/**
 * Minimal-diff save: write only what the user changed, keep every other byte of the file.
 *
 * Vditor rebuilds Markdown from its DOM on every `getValue()`, so its output is a
 * *normalized* rendering of the file (`| --- |` → `| - |`, CRLF → LF, trailing spaces of
 * hard breaks dropped, blank lines collapsed, an indented code block even vanishes…).
 * Writing that back rewrites lines the user never touched.
 *
 * Three texts are compared line by line:
 *   original   — the bytes on disk the editor was loaded from (or last saved)
 *   baseline   — the editor's normalized rendering of `original`
 *   current    — the editor's rendering now, after the user's edits
 * Every hunk that turns `baseline` into `current` is replayed onto `original`. A hunk that
 * touches a block the editor had normalized replaces that whole block (the only lines whose
 * original form cannot be kept); everything else keeps its original bytes and line endings.
 */

interface Segment {
  oStart: number;
  oEnd: number;
  bStart: number;
  bEnd: number;
  equal: boolean;
}

interface Hunk {
  bStart: number;
  bEnd: number;
  cStart: number;
  cEnd: number;
}

/** Myers diff: index pairs [i, j] of lines that are equal in `a` and `b`, in order. */
export function matchLines(a: string[], b: string[]): Array<[number, number]> {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const A = a.slice(pre, a.length - suf);
  const B = b.slice(pre, b.length - suf);
  const n = A.length;
  const m = B.length;
  const max = n + m;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = n === 0 || m === 0;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && A[x] === B[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }
  const middle: Array<[number, number]> = [];
  if (n > 0 && m > 0) {
    let x = n;
    let y = m;
    for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
      const vv = trace[d];
      const k = x - y;
      const prevK = k === -d || (k !== d && vv[offset + k - 1] < vv[offset + k + 1]) ? k + 1 : k - 1;
      const prevX = d === 0 ? 0 : vv[offset + prevK];
      const prevY = prevX - prevK;
      while (x > prevX && y > prevY) {
        x--;
        y--;
        middle.push([x, y]);
      }
      if (d > 0) {
        x = prevX;
        y = prevY;
      }
    }
    middle.reverse();
  }
  const out: Array<[number, number]> = [];
  for (let i = 0; i < pre; i++) out.push([i, i]);
  for (const [x, y] of middle) out.push([x + pre, y + pre]);
  for (let i = 0; i < suf; i++) out.push([a.length - suf + i, b.length - suf + i]);
  return out;
}

function segmentsOf(oLen: number, bLen: number, pairs: Array<[number, number]>): Segment[] {
  const segs: Segment[] = [];
  let o = 0;
  let b = 0;
  const push = (s: Segment) => {
    const last = segs[segs.length - 1];
    if (last && last.equal === s.equal) {
      last.oEnd = s.oEnd;
      last.bEnd = s.bEnd;
    } else segs.push(s);
  };
  for (const [po, pb] of [...pairs, [oLen, bLen] as [number, number]]) {
    if (po > o || pb > b) push({ oStart: o, oEnd: po, bStart: b, bEnd: pb, equal: false });
    if (po < oLen) push({ oStart: po, oEnd: po + 1, bStart: pb, bEnd: pb + 1, equal: true });
    o = po + 1;
    b = pb + 1;
  }
  return segs;
}

function hunksOf(bLen: number, cLen: number, pairs: Array<[number, number]>): Hunk[] {
  const hunks: Hunk[] = [];
  let b = 0;
  let c = 0;
  for (const [pb, pc] of [...pairs, [bLen, cLen] as [number, number]]) {
    if (pb > b || pc > c) hunks.push({ bStart: b, bEnd: pb, cStart: c, cEnd: pc });
    b = pb + 1;
    c = pc + 1;
  }
  return hunks;
}

/** Grows each hunk over every normalized (non-equal) block it overlaps, merging hunks that meet. */
function expandHunks(hunks: Hunk[], segs: Segment[]): Hunk[] {
  const out: Hunk[] = [];
  for (const h0 of hunks) {
    const h = { ...h0 };
    for (const s of segs) {
      if (s.equal || s.bStart === s.bEnd) continue;
      const overlaps = h.bStart === h.bEnd ? s.bStart < h.bStart && h.bStart < s.bEnd : s.bStart < h.bEnd && h.bStart < s.bEnd;
      if (!overlaps) continue;
      if (s.bStart < h.bStart) {
        h.cStart -= h.bStart - s.bStart;
        h.bStart = s.bStart;
      }
      if (s.bEnd > h.bEnd) {
        h.cEnd += s.bEnd - h.bEnd;
        h.bEnd = s.bEnd;
      }
    }
    const last = out[out.length - 1];
    // A later hunk that reaches an earlier one always ends at or after it (both grew over the
    // same normalized block), and its own end offset is the right one.
    if (last && h.bStart <= last.bEnd) {
      last.bEnd = h.bEnd;
      last.cEnd = h.cEnd;
    } else out.push(h);
  }
  return out;
}

/**
 * For each baseline boundary b: `lo[b]` is the original index before any original-only lines
 * sitting at b, `hi[b]` the index after them. Hunks start at `hi` and end at `lo`, so lines the
 * editor dropped (and the user never saw) are kept.
 */
function boundaryMaps(segs: Segment[], bLen: number): { lo: Int32Array; hi: Int32Array } {
  const lo = new Int32Array(bLen + 1).fill(-1);
  const hi = new Int32Array(bLen + 1);
  const add = (b: number, o: number) => {
    if (lo[b] < 0) lo[b] = o;
    hi[b] = o;
  };
  for (const s of segs) {
    add(s.bStart, s.oStart);
    if (s.equal) for (let b = s.bStart + 1; b < s.bEnd; b++) add(b, s.oStart + (b - s.bStart));
    add(s.bEnd, s.oEnd);
  }
  return { lo, hi };
}

export function preserveUntouched(original: string, baseline: string, current: string): string {
  if (current === baseline) return original;
  if (original === baseline) return current;
  const crlf = /\r\n/.test(original) && !/(^|[^\r])\n/.test(original);
  const oLines = original.split('\n');
  const oKeys = oLines.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  const bLines = baseline.split('\n');
  const cLines = current.split('\n');
  const segs = segmentsOf(oLines.length, bLines.length, matchLines(oKeys, bLines));
  const hunks = expandHunks(hunksOf(bLines.length, cLines.length, matchLines(bLines, cLines)), segs);
  const { lo, hi } = boundaryMaps(segs, bLines.length);
  const out: string[] = [];
  let o = 0;
  for (const h of hunks) {
    const oS = hi[h.bStart];
    const oE = Math.max(oS, lo[h.bEnd]);
    out.push(...oLines.slice(o, oS));
    const replacement = cLines.slice(h.cStart, h.cEnd);
    const isTail = h.cEnd === cLines.length;
    out.push(...(crlf ? replacement.map((l, i) => (isTail && i === replacement.length - 1 ? l : `${l}\r`)) : replacement));
    o = oE;
  }
  out.push(...oLines.slice(o));
  return out.join('\n');
}
