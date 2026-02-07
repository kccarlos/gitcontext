export type ModelInfo = {
  id: string
  name: string
  description?: string
  context_length?: number
  pricing?: string
  available?: boolean
}

export const STORAGE_KEY_MODELS_CACHE = 'gc.models.cache'
export const STORAGE_KEY_MODELS_FETCH_TIME = 'gc.models.fetchedAt'

