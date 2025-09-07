// Shared binary detection (web + desktop workers + UI).
// Strategy:
//  1) Extension hints (cheap).
//  2) Magic-byte signatures.
//  3) UTF-8 text heuristic on a small sample.
//  4) SVG special-case (XML-ish text).
//
// Keep fast and dependency-free.

export const SNIFF_BYTES = 8192

// Pragmatic denylist; not authoritative, just an early-out.
const BINARY_EXTS = new Set([
  '.png','.jpg','.jpeg','.gif','.bmp','.webp','.ico',
  '.pdf','.zip','.rar','.7z','.tar','.gz','.tgz',
  '.mp3','.wav','.flac',
  '.mp4','.mov','.avi','.mkv','.webm',
  '.exe','.dll','.bin','.dmg','.pkg','.iso',
  '.woff','.woff2','.ttf','.otf',
  '.so','.dylib','.class','.jar',
  '.psd','.ai','.sketch',
  '.wasm',
  // SVG is special-cased below; keep here so we early-out unless the content proves XML-ish
  '.svg',
])

export function isBinaryPath(path: string): boolean {
  const i = path.lastIndexOf('.')
  if (i < 0) return false
  const ext = path.slice(i).toLowerCase()
  return BINARY_EXTS.has(ext)
}

function startsWith(bytes: Uint8Array, ascii: string, offset = 0): boolean {
  if (offset + ascii.length > bytes.length) return false
  for (let i = 0; i < ascii.length; i++) {
    if (bytes[offset + i] !== ascii.charCodeAt(i)) return false
  }
  return true
}

// Spot common binary formats by signature (magic bytes).
export function hasBinaryMagic(bytes: Uint8Array): boolean {
  const b = bytes
  const len = b.length
  if (len >= 8) {
    // PNG
    if (
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 &&
      b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A
    ) return true
  }
  if (len >= 3) {
    // JPEG
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return true
  }
  // GIF
  if (startsWith(b, 'GIF87a') || startsWith(b, 'GIF89a')) return true
  // PDF
  if (startsWith(b, '%PDF-')) return true
  // ZIP (also covers many Office docs, apk, jar)
  if (len >= 4 && b[0] === 0x50 && b[1] === 0x4B && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07) && (b[3] === 0x04 || b[3] === 0x06 || b[3] === 0x08)) return true
  // GZIP
  if (len >= 3 && b[0] === 0x1F && b[1] === 0x8B && b[2] === 0x08) return true
  // MP3 (ID3)
  if (startsWith(b, 'ID3')) return true
  // MP4/ISO BMFF
  if (len >= 12 && startsWith(b, 'ftyp', 4)) return true
  // OGG
  if (startsWith(b, 'OggS')) return true
  // Matroska/WebM
  if (len >= 4 && b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) return true
  // WOFF/WOFF2
  if (startsWith(b, 'wOFF') || startsWith(b, 'wOF2')) return true
  // TTF/OTF
  if (len >= 4 && ((b[0] === 0x00 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) || startsWith(b, 'OTTO'))) return true
  // Windows MZ / ELF
  if (startsWith(b, 'MZ') || (len >= 4 && b[0] === 0x7F && b[1] === 0x45 && b[2] === 0x4C && b[3] === 0x46)) return true
  return false
}

// SVG often lives in repos as text; detect text-y SVG even if extension is .svg.
function isXmlSvgText(bytes: Uint8Array): boolean {
  // Skip leading whitespace / BOM, then expect '<'
  let i = 0
  while (i < bytes.length && (bytes[i] === 0xEF || bytes[i] === 0xBB || bytes[i] === 0xBF || bytes[i] <= 0x20)) i++
  if (i >= bytes.length || bytes[i] !== 0x3C /* '<' */) return false
  // Look for "<?xml" or "<svg"
  return startsWith(bytes, '?xml', i + 1) || startsWith(bytes, 'svg', i + 1) || startsWith(bytes, '!DOCTYPE svg', i + 1)
}

// Heuristic: treat as binary if many NUL/control chars in the sample.
export function looksBinaryHeuristic(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, SNIFF_BYTES)
  if (n === 0) return false
  let suspicious = 0
  for (let i = 0; i < n; i++) {
    const c = bytes[i]
    if (c === 0) { suspicious += 2; continue }
    // control chars outside common whitespace range
    if (c < 7 || (c > 13 && c < 32)) suspicious++
  }
  return suspicious / n > 0.30
}

export function detectBinaryByContent(sample: Uint8Array, path?: string): boolean {
  // path hint
  if (path && isBinaryPath(path)) {
    // Allow SVG override if it looks like XML
    if (path.toLowerCase().endsWith('.svg') && isXmlSvgText(sample)) return false
    return true
  }
  if (hasBinaryMagic(sample)) return true
  // SVG override if no magic but looks like XML text
  if (isXmlSvgText(sample)) return false
  return looksBinaryHeuristic(sample)
}

// Convenience: decide with or without sample.
export function shouldTreatAsBinary(path: string, sample?: Uint8Array): boolean {
  if (!sample) return isBinaryPath(path)
  return detectBinaryByContent(sample, path)
}

export { BINARY_EXTS }
