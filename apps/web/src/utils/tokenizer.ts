import { get_encoding, Tiktoken } from '@dqbd/tiktoken'

let encoder: Tiktoken | null = null

export async function getEncoder(): Promise<Tiktoken> {
  if (encoder) return encoder
  // cl100k_base works for GPT-4/3.5; extend later for profiles
  encoder = get_encoding('cl100k_base')
  return encoder
}

export function freeEncoder() {
  try {
    encoder?.free()
  } catch {}
  encoder = null
}

export async function countTokens(text: string): Promise<number> {
  const enc = await getEncoder()
  return enc.encode(text).length
}


