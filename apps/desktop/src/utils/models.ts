import type { ModelInfo } from '../types/models'
import { STORAGE_KEY_MODELS_CACHE, STORAGE_KEY_MODELS_FETCH_TIME } from '../types/models'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

async function fetchModelsFromApi(): Promise<ModelInfo[] | null> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', { headers: { 'Content-Type': 'application/json' } })
    if (!res.ok) return null
    const apiResponse = await res.json()
    if (!apiResponse || !Array.isArray(apiResponse.data)) return null
    const models: ModelInfo[] = apiResponse.data.map((apiModel: any) => ({
      id: apiModel.id,
      name: apiModel.name || apiModel.id,
      description: apiModel.description || '',
      context_length: apiModel.context_length || 0,
      pricing: apiModel.pricing || '',
      available: apiModel.available !== false,
    }))
    return models
  } catch {
    return null
  }
}

export async function getModels(forceRefresh = false): Promise<ModelInfo[] | null> {
  try {
    const now = Date.now()
    const lastFetchRaw = localStorage.getItem(STORAGE_KEY_MODELS_FETCH_TIME)
    const cachedRaw = localStorage.getItem(STORAGE_KEY_MODELS_CACHE)

    if (!forceRefresh && lastFetchRaw && cachedRaw) {
      const lastFetch = Number(lastFetchRaw)
      if (!Number.isNaN(lastFetch) && now - lastFetch < ONE_DAY_MS) {
        try {
          const cached = JSON.parse(cachedRaw) as ModelInfo[]
          if (Array.isArray(cached) && cached.length > 0) return cached
        } catch {
          // fallthrough to refetch
        }
      }
    }

    let models: ModelInfo[] | null = null

    // For Tauri, we could add a backend fetch in future
    // For now, just use direct fetch
    models = await fetchModelsFromApi()

    if (models && Array.isArray(models)) {
      localStorage.setItem(STORAGE_KEY_MODELS_CACHE, JSON.stringify(models))
      localStorage.setItem(STORAGE_KEY_MODELS_FETCH_TIME, String(now))
      return models
    }

    return cachedRaw ? (JSON.parse(cachedRaw) as ModelInfo[]) : null
  } catch {
    return null
  }
}
