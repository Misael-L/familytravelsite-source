/** Versioned data preservation, not an executable command or a restore/replay API. */
export const ORIGINAL_WORK_FORMAT = 'family.original-work.v2';
export const ORIGINAL_WORK_MAX_BYTES = 32 * 1024 * 1024;
export const ORIGINAL_WORK_MAX_BINARY_BYTES = 16 * 1024 * 1024;
export const ORIGINAL_WORK_MAX_ROWS = 5000;
const MAX_NODES = 100000;
type Value =
  | ['null']
  | ['undefined']
  | ['boolean', boolean]
  | ['string', string]
  | ['number', number | string]
  | ['bigint', string]
  | ['ref', number];
type Entries = Array<[string, Value]>;
type Node =
  | { kind: 'object'; prototype: 'object' | 'null'; entries: Entries }
  | { kind: 'array'; length: number; entries: Entries }
  | { kind: 'date'; milliseconds: Value }
  | {
      kind: 'blob' | 'file' | 'array-buffer';
      bytes: string;
      size: number;
      sha256: string;
      type?: string;
      name?: string;
      lastModified?: number;
    };
export class OriginalWorkExportError extends Error {
  constructor(
    message = 'This original work cannot be exported without losing data or exposing credentials. Nothing was removed.'
  ) {
    super(message);
    this.name = 'OriginalWorkExportError';
  }
}
const secretKey =
  /^(authorization|cookie|setcookie|accesstoken|refreshtoken|apikey|servicerolekey|secretkey|password)$/i;
const secretText =
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_secret_[A-Za-z0-9_-]+|[?&](?:token|access_token|apikey|api_key)=|:\/\/[^\s/@:]+:[^\s/@]+@/i;
const refuse = (): never => {
  throw new OriginalWorkExportError();
};
function safeText(value: string) {
  if (secretText.test(value)) refuse();
  return value;
}
const bufferLengthGetter = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')?.get;
function bufferLength(value: object): number | null {
  try {
    return bufferLengthGetter ? (Reflect.apply(bufferLengthGetter, value, []) as number) : null;
  } catch {
    return null;
  }
}
function dateValue(value: object): number | null {
  try {
    return Date.prototype.getTime.call(value);
  } catch {
    return null;
  }
}
function primitive(value: unknown, text: (value: string) => string): Value | null {
  if (value === undefined) return ['undefined'];
  if (value === null) return ['null'];
  if (typeof value === 'boolean') return ['boolean', value];
  if (typeof value === 'string') return ['string', text(value)];
  if (typeof value === 'number')
    return ['number', Object.is(value, -0) ? '-0' : Number.isFinite(value) ? value : String(value)];
  if (typeof value === 'bigint') return ['bigint', text(value.toString())];
  return null;
}
/** Graph references preserve cycles, shared identity, undefined and sparse-array slots. */
export async function encodeOriginalWork(value: unknown, assertCurrent: () => void) {
  const nodes: Node[] = [],
    seen = new Map<object, number>();
  let binaryBytes = 0,
    estimatedBytes = 0;
  const budget = (bytes: number) => {
    estimatedBytes += bytes;
    if (estimatedBytes > ORIGINAL_WORK_MAX_BYTES)
      throw new OriginalWorkExportError('The original-work export exceeds its bound. Nothing was removed.');
  };
  const text = (value: string) => {
    safeText(value);
    budget(new TextEncoder().encode(value).length + 16);
    return value;
  };
  async function binary(value: object, arrayBuffer: number | null): Promise<Node> {
    if (Object.keys(value).length) return refuse();
    const isBlob = value instanceof Blob;
    const size = isBlob ? value.size : (arrayBuffer ?? 0);
    binaryBytes += size;
    if (binaryBytes > ORIGINAL_WORK_MAX_BINARY_BYTES)
      throw new OriginalWorkExportError('The binary original-work export exceeds its bound. Nothing was removed.');
    budget(Math.ceil(size / 3) * 4 + 200);
    const bytes = new Uint8Array(isBlob ? await value.arrayBuffer() : ArrayBuffer.prototype.slice.call(value, 0));
    assertCurrent();
    safeText(new TextDecoder().decode(bytes));
    let encoded = '';
    for (let offset = 0; offset < bytes.length; offset += 0x6000)
      encoded += btoa(String.fromCharCode(...bytes.subarray(offset, offset + 0x6000)));
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
      b.toString(16).padStart(2, '0')
    ).join('');
    assertCurrent();
    const file = typeof File !== 'undefined' && value instanceof File ? value : null;
    return {
      kind: file ? 'file' : isBlob ? 'blob' : 'array-buffer',
      bytes: encoded,
      size,
      sha256,
      ...(isBlob ? { type: text(value.type) } : {}),
      ...(file ? { name: text(file.name), lastModified: file.lastModified } : {}),
    };
  }
  async function entries(value: object, depth: number): Promise<Node> {
    const array = Array.isArray(value),
      proto = Object.getPrototypeOf(value);
    if (array && value.length > MAX_NODES) return refuse();
    if (!array && proto !== Object.prototype && proto !== null) return refuse();
    const entries: Entries = [];
    for (const key of Reflect.ownKeys(value)) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string' || secretKey.test(key.replace(/[-_]/g, ''))) return refuse();
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return refuse();
      entries.push([text(key), await encode(descriptor.value, depth + 1)]);
    }
    return array
      ? { kind: 'array', length: value.length, entries }
      : { kind: 'object', prototype: proto === null ? 'null' : 'object', entries };
  }
  async function encode(value: unknown, depth: number): Promise<Value> {
    assertCurrent();
    budget(8);
    const scalar = primitive(value, text);
    if (scalar) return scalar;
    if (value === null || typeof value !== 'object') return refuse();
    const known = seen.get(value);
    if (known !== undefined) return ['ref', known];
    if (depth > 100 || nodes.length >= MAX_NODES) return refuse();
    const id = nodes.length;
    seen.set(value, id);
    // Reserve before recursion so a reference can point back to its parent.
    nodes.push({ kind: 'object', prototype: 'object', entries: [] });
    const arrayBuffer = bufferLength(value),
      date = dateValue(value);
    if (value instanceof Blob || arrayBuffer !== null) {
      nodes[id] = await binary(value, arrayBuffer);
    } else if (date !== null) {
      if (Reflect.ownKeys(value).length) return refuse();
      nodes[id] = { kind: 'date', milliseconds: await encode(date, depth + 1) };
    } else {
      nodes[id] = await entries(value, depth);
    }
    return ['ref', id];
  }
  const root = await encode(value, 0);
  assertCurrent();
  return { root, nodes, binary_bytes: binaryBytes };
}
