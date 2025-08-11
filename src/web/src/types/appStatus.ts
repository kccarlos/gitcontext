export type AppStatus =
  | { state: 'IDLE' }
  | {
      state: 'LOADING'
      task: 'repo' | 'diff' | 'refresh'
      message: string
      progress: number | 'indeterminate'
    }
  | { state: 'READY'; message: string }
  | { state: 'ERROR'; message: string }

export type StatusLogEntry = {
  time: number
  source: string
  status: AppStatus
}


