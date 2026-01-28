import { countTokens } from '../utils/tokenizer'
import type { TokenizerEngine } from './types'

function isElectron(): boolean {
  // same heuristic as in gitFactory
  // @ts-ignore
  const isRenderer = typeof window !== 'undefined' && typeof window.process !== 'undefined' && (window.process as any).type === 'renderer'
  // @ts-ignore
  const hasFlag = typeof window !== 'undefined' && (window as any).isElectron
  return isRenderer || hasFlag
}

function createWebTokenizer(): TokenizerEngine {
  return {
    async count(text: string) { return countTokens(text) },
    async warmup() { /* no-op */ },
  }
}

function createDesktopTokenizer(): TokenizerEngine {
  // Placeholder for Phase 4 — use web path until IPC is in place
  return createWebTokenizer()
}

export function createTokenizer(): TokenizerEngine {
  return isElectron() ? createDesktopTokenizer() : createWebTokenizer()
}


