/**
 * Types for LLM model information
 */

/**
 * Interface defining a model's information including context window size
 */
export interface ModelInfo {
  id: string
  name: string
  description?: string
  context_length: number
  pricing?: string
  available?: boolean
}

/**
 * Storage key for caching models in local storage
 */
export const STORAGE_KEY_MODELS_CACHE = 'llm-models-cache'

/**
 * Storage key for last models fetch timestamp
 */
export const STORAGE_KEY_MODELS_FETCH_TIME = 'llm-models-fetch-time'


