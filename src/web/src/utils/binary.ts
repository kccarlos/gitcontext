// Centralized binary-file heuristics to keep UI, workers, and counters in sync.
// Note: We treat SVG as binary here for safety/perf (often very large).
const BINARY_EXTS = [
  '.png','.jpg','.jpeg','.gif','.bmp','.webp','.ico',
  '.pdf','.zip','.rar','.7z','.tar','.gz','.tgz',
  '.mp3','.wav','.flac',
  '.mp4','.mov','.avi','.mkv','.webm',
  '.exe','.dll','.bin','.dmg','.pkg','.iso',
  '.woff','.woff2','.ttf','.otf',
  '.svg'
]

export function isBinaryPath(p: string): boolean {
  const lower = p.toLowerCase()
  return BINARY_EXTS.some(ext => lower.endsWith(ext))
}

export { BINARY_EXTS }
