import crypto from 'node:crypto';

function hmacSha256(key: Buffer | string, msg: string): Buffer {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest();
}

function sha256Hex(msg: string): string {
  return crypto.createHash('sha256').update(msg, 'utf8').digest('hex');
}

/** Computes AWS4-HMAC-SHA256 authorization headers for ByteDance ImageX APIs. */
export function signAws4Request(params: {
  method: string;
  url: string;
  accessKeyId: string;
  secretAccessKey: string;
  securityToken?: string;
  region?: string;
  service?: string;
}): Record<string, string> {
  const {
    method,
    url,
    accessKeyId,
    secretAccessKey,
    securityToken,
    region = 'cn-north-1',
    service = 'imagex',
  } = params;

  const parsed = new URL(url);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');

  const sortedQuery = Array.from(parsed.searchParams.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const signedObj: Record<string, string> = { 'x-amz-date': amzDate };
  if (securityToken) {
    signedObj['x-amz-security-token'] = securityToken;
  }

  const signedHeaderNames = Object.keys(signedObj).sort().join(';');
  const canonicalHeaders =
    Object.entries(signedObj)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}:${v.trim()}`)
      .join('\n') + '\n';

  const canonicalRequest = [
    method.toUpperCase(),
    parsed.pathname || '/',
    sortedQuery,
    canonicalHeaders,
    signedHeaderNames,
    sha256Hex(''),
  ].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [algorithm, amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');

  const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = hmacSha256(kSigning, stringToSign).toString('hex');

  return {
    authorization: `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`,
    'x-amz-date': amzDate,
    ...(securityToken ? { 'x-amz-security-token': securityToken } : {}),
  };
}

let crcTable: Uint32Array | null = null;

function getCrc32Table(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[i] = c;
  }
  return crcTable;
}

/** Computes lowercase 8-char hex CRC32 checksum required by ByteDance TOS PUT. */
export function computeCrc32Hex(data: Uint8Array): string {
  const table = getCrc32Table();
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff];
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}
