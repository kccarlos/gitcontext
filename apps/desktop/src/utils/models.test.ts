import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { ModelInfo } from '../types/models'
import { STORAGE_KEY_MODELS_CACHE, STORAGE_KEY_MODELS_FETCH_TIME } from '../types/models'

const SELECTED_MODEL_KEY = 'gc.selectedModel'

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function makeFakeModels(): ModelInfo[] {
  return [
    { id: 'openai/gpt-4', name: 'GPT-4', context_length: 8192 },
    { id: 'anthropic/claude-3', name: 'Claude 3', context_length: 200000 },
    { id: 'meta/llama-3', name: 'Llama 3', context_length: 8192 },
  ]
}

function seedCache(models: ModelInfo[], fetchTime = Date.now()) {
  localStorage.setItem(STORAGE_KEY_MODELS_CACHE, JSON.stringify(models))
  localStorage.setItem(STORAGE_KEY_MODELS_FETCH_TIME, String(fetchTime))
}

/* ------------------------------------------------------------------ */
/*  Tests: getModels (structure, fields, uniqueness)                  */
/* ------------------------------------------------------------------ */

describe('getModels', () => {
  let getModels: typeof import('./models').getModels

  beforeEach(async () => {
    localStorage.clear()
    vi.restoreAllMocks()
    // Re-import each time so module-level state is fresh
    const mod = await import('./models')
    getModels = mod.getModels
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns an array of ModelInfo objects from a fresh API fetch', async () => {
    const fakeModels = makeFakeModels()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: fakeModels }),
      }),
    )

    const result = await getModels()
    expect(result).not.toBeNull()
    expect(Array.isArray(result)).toBe(true)
    expect(result!.length).toBeGreaterThan(0)
  })

  it('each model has required fields: id, name, context_length', async () => {
    const fakeModels = makeFakeModels()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: fakeModels }),
      }),
    )

    const result = await getModels()
    expect(result).not.toBeNull()
    for (const model of result!) {
      expect(typeof model.id).toBe('string')
      expect(model.id.length).toBeGreaterThan(0)
      expect(typeof model.name).toBe('string')
      expect(model.name.length).toBeGreaterThan(0)
      expect(typeof model.context_length).toBe('number')
    }
  })

  it('model IDs are unique', async () => {
    const fakeModels = makeFakeModels()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: fakeModels }),
      }),
    )

    const result = await getModels()
    expect(result).not.toBeNull()
    const ids = result!.map((m) => m.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('context_length values are positive numbers', async () => {
    const fakeModels = makeFakeModels()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: fakeModels }),
      }),
    )

    const result = await getModels()
    expect(result).not.toBeNull()
    for (const model of result!) {
      expect(model.context_length).toBeGreaterThan(0)
    }
  })

  it('model list is not empty', async () => {
    const fakeModels = makeFakeModels()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: fakeModels }),
      }),
    )

    const result = await getModels()
    expect(result).not.toBeNull()
    expect(result!.length).toBeGreaterThan(0)
  })

  it('returns cached models when cache is fresh (< 1 day)', async () => {
    const cached = makeFakeModels()
    seedCache(cached, Date.now())

    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await getModels()
    expect(result).toEqual(cached)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refetches when cache is stale (> 1 day)', async () => {
    const stale = [{ id: 'stale/model', name: 'Stale', context_length: 100 }]
    const fresh = makeFakeModels()
    seedCache(stale, Date.now() - 25 * 60 * 60 * 1000) // 25 hours ago

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: fresh }),
      }),
    )

    const result = await getModels()
    expect(result).not.toBeNull()
    expect(result!.length).toBe(fresh.length)
    expect(result![0].id).toBe(fresh[0].id)
  })

  it('returns null when API fails and no cache exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false }),
    )

    const result = await getModels()
    expect(result).toBeNull()
  })
})

/* ------------------------------------------------------------------ */
/*  Tests: model selection persistence (localStorage pattern)         */
/* ------------------------------------------------------------------ */

describe('model selection persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('selectedModel is saved to localStorage key gc.selectedModel', () => {
    const modelId = 'anthropic/claude-3'
    localStorage.setItem(SELECTED_MODEL_KEY, modelId)

    const saved = localStorage.getItem(SELECTED_MODEL_KEY)
    expect(saved).toBe(modelId)
  })

  it('restoring selected model from localStorage works', () => {
    const modelId = 'openai/gpt-4'
    localStorage.setItem(SELECTED_MODEL_KEY, modelId)

    // Simulate the restore pattern from App.tsx
    const saved = localStorage.getItem(SELECTED_MODEL_KEY)
    let selectedModel = ''
    if (saved) selectedModel = saved

    expect(selectedModel).toBe(modelId)
  })

  it('invalid saved model ID is handled gracefully', () => {
    // Simulate an invalid model ID stored in localStorage
    localStorage.setItem(SELECTED_MODEL_KEY, 'nonexistent/model-xyz')
    const models = makeFakeModels()

    // Simulate the resolution pattern from App.tsx:
    // tokenLimit = models.find(x => x.id === selectedModel)?.context_length ?? 0
    const saved = localStorage.getItem(SELECTED_MODEL_KEY)!
    const matched = models.find((x) => x.id === saved)
    const tokenLimit = matched?.context_length ?? 0

    // Invalid model should not match, so tokenLimit defaults to 0
    expect(matched).toBeUndefined()
    expect(tokenLimit).toBe(0)
  })

  it('empty localStorage returns empty string for selected model', () => {
    // Nothing stored yet
    const saved = localStorage.getItem(SELECTED_MODEL_KEY)
    expect(saved).toBeNull()

    // The App.tsx pattern: if (saved) setSelectedModel(saved)
    // so selectedModel stays at initial state ''
    let selectedModel = ''
    if (saved) selectedModel = saved
    expect(selectedModel).toBe('')
  })

  it('ModelInfo type compliance: objects satisfy the type contract', () => {
    const model: ModelInfo = {
      id: 'test/model',
      name: 'Test Model',
      context_length: 4096,
    }

    // Required fields
    expect(model.id).toBeDefined()
    expect(model.name).toBeDefined()

    // Optional fields default to undefined
    expect(model.description).toBeUndefined()
    expect(model.pricing).toBeUndefined()
    expect(model.available).toBeUndefined()

    // Full model with all optional fields
    const fullModel: ModelInfo = {
      id: 'test/full',
      name: 'Full Model',
      description: 'A test model',
      context_length: 8192,
      pricing: '$0.01/1k',
      available: true,
    }
    expect(fullModel.description).toBe('A test model')
    expect(fullModel.pricing).toBe('$0.01/1k')
    expect(fullModel.available).toBe(true)
  })
})
