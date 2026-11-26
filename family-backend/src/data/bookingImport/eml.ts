function splitHeaderBody(raw: string): { headers: string; body: string } {
  const m = raw.match(/\r?\n\r?\n/)
  if (!m || m.index == null) return { headers: raw, body: '' }
  return { headers: raw.slice(0, m.index), body: raw.slice(m.index + m[0].length) }
}

function parseHeaders(raw: string): Record<string, string> {
  const unfolded = raw.replace(/\r?\n[ \t]+/g, ' ')
  const out: Record<string, string> = {}
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx < 1) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    out[key] = line.slice(idx + 1).trim()
  }
  return out
}

function headerParam(value: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*"?([^";\\s]+)"?`, 'i')
  return value.match(re)?.[1] ?? null
}

function decodeQuotedPrintable(input: string): string {
  const joined = input.replace(/=\r?\n/g, '')
  const bytes: number[] = []
  for (let i = 0; i < joined.length; i++) {
    if (joined[i] === '=' && /[0-9A-Fa-f]{2}/.test(joined.slice(i + 1, i + 3))) {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16))
      i += 2
    } else {
      bytes.push(joined.charCodeAt(i) & 0xff)
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes))
  } catch {
    return String.fromCharCode(...bytes)
  }
}

function decodeBase64(input: string): string {
  const compact = input.replace(/\s+/g, '')
  try {
    const bin = atob(compact)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    return input
  }
}

function decodeBody(body: string, encoding: string | undefined): string {
  const enc = (encoding ?? '').toLowerCase()
  if (enc.includes('quoted-printable')) return decodeQuotedPrintable(body)
  if (enc.includes('base64')) return decodeBase64(body)
  return body
}

export type EmlParts = { html: string | null; text: string | null }

function parsePart(raw: string): EmlParts {
  const { headers: headerRaw, body: bodyRaw } = splitHeaderBody(raw)
  const headers = parseHeaders(headerRaw)
  const ct = headers['content-type'] ?? 'text/plain'
  const encoding = headers['content-transfer-encoding']
  const boundary = headerParam(ct, 'boundary')

  if (ct.toLowerCase().includes('multipart/') && boundary) {
    let html: string | null = null
    let text: string | null = null
    const token = `--${boundary}`
    for (const chunk of bodyRaw.split(token)) {
      const trimmed = chunk.replace(/^\r?\n/, '')
      if (!trimmed || trimmed.startsWith('--')) continue
      if (!/content-type:/i.test(trimmed)) continue
      const nested = parsePart(trimmed)
      html = html ?? nested.html
      text = text ?? nested.text
    }
    return { html, text }
  }

  const decoded = decodeBody(bodyRaw, encoding)
  if (ct.toLowerCase().includes('text/html')) return { html: decoded, text: null }
  if (ct.toLowerCase().includes('text/plain')) return { html: null, text: decoded }
  return { html: null, text: null }
}

export function parseEml(raw: string): EmlParts {
  return parsePart(raw.replace(/^\uFEFF/, ''))
}
