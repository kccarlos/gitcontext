import path from 'path-browserify'
import type { PathService } from './types'

function toPosix(p: string): string {
  if (!p) return p
  const replaced = p.replace(/\\+/g, '/').replace(/\/+/, '/')
  return replaced
}

function join(...parts: string[]): string {
  return path.posix.join(...parts)
}

export const paths: PathService = {
  toPosix,
  join,
}


