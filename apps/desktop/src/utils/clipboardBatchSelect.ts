export const INVALID_CLIPBOARD_FORMAT_MESSAGE =
  'Invalid clipboard format. Paste one file path per line (relative or absolute path inside this repo). Example:\nsrc/App.tsx\napps/desktop/src/App.tsx'

export const NO_MATCHING_FILES_MESSAGE =
  'No matching files were found in this repository. Paste one file path per line (relative or absolute inside the opened repo).'

const DRIVE_LETTER_ABS = /^[a-zA-Z]:\//
const WINDOWS_UNC_ABS = /^\/\//

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/')
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '')
}

function stripLeadingSlashes(value: string): string {
  return value.replace(/^\/+/, '')
}

function stripLeadingDotSlash(value: string): string {
  return value.replace(/^\.\/+/, '')
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || DRIVE_LETTER_ABS.test(value) || WINDOWS_UNC_ABS.test(value)
}

function equalForFs(a: string, b: string): boolean {
  const driveA = DRIVE_LETTER_ABS.test(a)
  const driveB = DRIVE_LETTER_ABS.test(b)
  if (driveA || driveB) return a.toLowerCase() === b.toLowerCase()
  return a === b
}

function startsWithForFs(path: string, prefix: string): boolean {
  const drivePath = DRIVE_LETTER_ABS.test(path)
  const drivePrefix = DRIVE_LETTER_ABS.test(prefix)
  if (drivePath || drivePrefix) return path.toLowerCase().startsWith(prefix.toLowerCase())
  return path.startsWith(prefix)
}

export function parseClipboardPathLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

export function normalizeClipboardPath(line: string, repoRoot: string): string | null {
  const normalizedRepoRoot = stripTrailingSlashes(normalizeSlashes(repoRoot.trim()))
  if (!normalizedRepoRoot) return null

  const normalizedLine = normalizeSlashes(line.trim())
  if (!normalizedLine) return null

  if (isAbsolutePath(normalizedLine)) {
    const repoPrefix = `${normalizedRepoRoot}/`
    if (equalForFs(normalizedLine, normalizedRepoRoot)) return null
    if (!startsWithForFs(normalizedLine, repoPrefix)) return null
    return stripLeadingSlashes(normalizedLine.slice(repoPrefix.length))
  }

  const relative = stripLeadingDotSlash(stripLeadingSlashes(normalizedLine))
  return relative || null
}

export function resolveSelectablePaths(
  lines: string[],
  repoRoot: string,
  selectableSet: Set<string>
): { matched: string[]; invalidCount: number; outsideRepoCount: number } {
  const matched = new Set<string>()
  let invalidCount = 0
  let outsideRepoCount = 0

  for (const line of lines) {
    const normalized = normalizeClipboardPath(line, repoRoot)
    if (!normalized) {
      if (isAbsolutePath(normalizeSlashes(line.trim()))) outsideRepoCount++
      else invalidCount++
      continue
    }
    const repoRelativePath = normalizeSlashes(normalized)
    if (selectableSet.has(repoRelativePath)) {
      matched.add(repoRelativePath)
    } else {
      outsideRepoCount++
    }
  }

  return {
    matched: Array.from(matched),
    invalidCount,
    outsideRepoCount,
  }
}
