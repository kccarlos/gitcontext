export type LoggedError = { message: string; timestamp: number; source: string }

export const errorLog: LoggedError[] = []

export function logError(source: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  try {
    // Keep console noise low but still visible for devs
    console.error(`[${source}]`, error)
  } catch {}
  errorLog.push({ message, timestamp: Date.now(), source })
  if (errorLog.length > 100) {
    errorLog.shift()
  }
}


