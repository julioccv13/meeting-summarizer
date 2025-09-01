/**
 * Whisper model loader with IndexedDB caching for offline operation
 * Handles downloading, caching, and loading of Whisper GGML models
 */

const MODEL_DB_NAME = 'WhisperModelsDB'
const MODEL_DB_VERSION = 1
const MODEL_STORE_NAME = 'models'

interface ModelInfo {
  name: string
  url: string
  size: number
  description: string
  recommended?: boolean
}

interface CachedModel {
  name: string
  data: ArrayBuffer
  size: number
  downloadedAt: Date
  lastUsed: Date
}

interface LoadProgress {
  loaded: number
  total: number
  percentage: number
  status: string
}

// Available Whisper models (URLs should point to actual model files)
export const AVAILABLE_MODELS: Record<string, ModelInfo> = {
  'tiny': {
    name: 'tiny',
    url: `${import.meta.env.BASE_URL}models/ggml-tiny.bin`,
    size: 39 * 1024 * 1024, // ~39MB
    description: 'Fastest, lowest accuracy (~32x realtime)',
    recommended: true
  },
  'tiny.en': {
    name: 'tiny.en',
    url: `${import.meta.env.BASE_URL}models/ggml-tiny.en.bin`,
    size: 39 * 1024 * 1024, // ~39MB
    description: 'English-only, fastest (~32x realtime)'
  },
  'base': {
    name: 'base',
    url: `${import.meta.env.BASE_URL}models/ggml-base.bin`,
    size: 74 * 1024 * 1024, // ~74MB
    description: 'Better accuracy (~16x realtime)'
  },
  'base.en': {
    name: 'base.en',
    url: `${import.meta.env.BASE_URL}models/ggml-base.en.bin`,
    size: 74 * 1024 * 1024, // ~74MB
    description: 'English-only, better accuracy (~16x realtime)'
  },
  'small': {
    name: 'small',
    url: `${import.meta.env.BASE_URL}models/ggml-small.bin`,
    size: 244 * 1024 * 1024, // ~244MB
    description: 'Good accuracy (~6x realtime)'
  }
}

let modelDB: IDBDatabase | null = null

/**
 * Initialize the model database
 */
async function initModelDB(): Promise<IDBDatabase> {
  if (modelDB) return modelDB

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MODEL_DB_NAME, MODEL_DB_VERSION)

    request.onerror = () => reject(new Error('Failed to open model database'))
    
    request.onsuccess = () => {
      modelDB = request.result
      resolve(modelDB)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains(MODEL_STORE_NAME)) {
        const store = db.createObjectStore(MODEL_STORE_NAME, { keyPath: 'name' })
        store.createIndex('downloadedAt', 'downloadedAt', { unique: false })
        store.createIndex('lastUsed', 'lastUsed', { unique: false })
      }
    }
  })
}

/**
 * Check if a model is cached locally
 */
export async function isModelCached(modelName: string): Promise<boolean> {
  try {
    const db = await initModelDB()
    
    return new Promise((resolve) => {
      const transaction = db.transaction([MODEL_STORE_NAME], 'readonly')
      const store = transaction.objectStore(MODEL_STORE_NAME)
      const request = store.get(modelName)

      request.onsuccess = () => resolve(!!request.result)
      request.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}

/**
 * Get cached model data
 */
export async function getCachedModel(modelName: string): Promise<ArrayBuffer | null> {
  try {
    const db = await initModelDB()
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([MODEL_STORE_NAME], 'readwrite')
      const store = transaction.objectStore(MODEL_STORE_NAME)
      const request = store.get(modelName)

      request.onsuccess = () => {
        const cachedModel: CachedModel = request.result
        if (cachedModel) {
          // Update last used timestamp
          cachedModel.lastUsed = new Date()
          store.put(cachedModel)
          resolve(cachedModel.data)
        } else {
          resolve(null)
        }
      }

      request.onerror = () => reject(new Error(`Failed to get cached model: ${request.error}`))
    })
  } catch (error) {
    console.error('Failed to get cached model:', error)
    return null
  }
}

/**
 * Download and cache a model
 */
export async function downloadAndCacheModel(
  modelName: string,
  onProgress?: (progress: LoadProgress) => void
): Promise<ArrayBuffer> {
  const modelInfo = AVAILABLE_MODELS[modelName]
  if (!modelInfo) {
    throw new Error(`Unknown model: ${modelName}`)
  }

  onProgress?.({
    loaded: 0,
    total: modelInfo.size,
    percentage: 0,
    status: 'Starting download...'
  })

  try {
    // Check if already cached
    const cached = await getCachedModel(modelName)
    if (cached) {
      onProgress?.({
        loaded: modelInfo.size,
        total: modelInfo.size,
        percentage: 100,
        status: 'Loaded from cache'
      })
      return cached
    }

    // Download the model
    const response = await fetch(modelInfo.url)
    
    if (!response.ok) {
      throw new Error(`Failed to download model: ${response.status} ${response.statusText}`)
    }

    const contentLength = response.headers.get('content-length')
    const total = contentLength ? parseInt(contentLength) : modelInfo.size

    if (!response.body) {
      throw new Error('Response body is null')
    }

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0

    onProgress?.({
      loaded: 0,
      total,
      percentage: 0,
      status: 'Downloading model...'
    })

    while (true) {
      const { done, value } = await reader.read()
      
      if (done) break

      if (value) {
        chunks.push(value)
        loaded += value.length

        onProgress?.({
          loaded,
          total,
          percentage: (loaded / total) * 100,
          status: 'Downloading model...'
        })
      }
    }

    // Combine chunks into single ArrayBuffer
    const arrayBuffer = new ArrayBuffer(loaded)
    const uint8View = new Uint8Array(arrayBuffer)
    let offset = 0

    for (const chunk of chunks) {
      uint8View.set(chunk, offset)
      offset += chunk.length
    }

    onProgress?.({
      loaded,
      total,
      percentage: 100,
      status: 'Caching model...'
    })

    // Cache the model
    await cacheModel(modelName, arrayBuffer)

    onProgress?.({
      loaded,
      total,
      percentage: 100,
      status: 'Model ready'
    })

    return arrayBuffer

  } catch (error) {
    console.error('Failed to download model:', error)
    throw error
  }
}

/**
 * Cache a model in IndexedDB
 */
async function cacheModel(modelName: string, data: ArrayBuffer): Promise<void> {
  const db = await initModelDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([MODEL_STORE_NAME], 'readwrite')
    const store = transaction.objectStore(MODEL_STORE_NAME)

    const cachedModel: CachedModel = {
      name: modelName,
      data,
      size: data.byteLength,
      downloadedAt: new Date(),
      lastUsed: new Date()
    }

    const request = store.put(cachedModel)
    
    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error(`Failed to cache model: ${request.error}`))
  })
}

/**
 * Load a model (from cache or download)
 */
export async function loadModel(
  modelName: string = 'tiny',
  onProgress?: (progress: LoadProgress) => void
): Promise<ArrayBuffer> {
  try {
    // First try to load from cache
    const cached = await getCachedModel(modelName)
    if (cached) {
      const modelInfo = AVAILABLE_MODELS[modelName]
      onProgress?.({
        loaded: modelInfo.size,
        total: modelInfo.size,
        percentage: 100,
        status: 'Loaded from cache'
      })
      return cached
    }

    // If not cached, download and cache
    return await downloadAndCacheModel(modelName, onProgress)

  } catch (error) {
    console.error('Failed to load model:', error)
    throw error
  }
}

/**
 * Get list of cached models
 */
export async function getCachedModelsList(): Promise<CachedModel[]> {
  try {
    const db = await initModelDB()
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([MODEL_STORE_NAME], 'readonly')
      const store = transaction.objectStore(MODEL_STORE_NAME)
      const request = store.getAll()

      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(new Error(`Failed to get cached models: ${request.error}`))
    })
  } catch (error) {
    console.error('Failed to get cached models list:', error)
    return []
  }
}

/**
 * Delete a cached model
 */
export async function deleteCachedModel(modelName: string): Promise<void> {
  try {
    const db = await initModelDB()
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([MODEL_STORE_NAME], 'readwrite')
      const store = transaction.objectStore(MODEL_STORE_NAME)
      const request = store.delete(modelName)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(new Error(`Failed to delete model: ${request.error}`))
    })
  } catch (error) {
    console.error('Failed to delete cached model:', error)
    throw error
  }
}

/**
 * Get total cached models size
 */
export async function getCachedModelsSize(): Promise<number> {
  try {
    const models = await getCachedModelsList()
    return models.reduce((total, model) => total + model.size, 0)
  } catch {
    return 0
  }
}

/**
 * Clear all cached models
 */
export async function clearAllCachedModels(): Promise<void> {
  try {
    const db = await initModelDB()
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([MODEL_STORE_NAME], 'readwrite')
      const store = transaction.objectStore(MODEL_STORE_NAME)
      const request = store.clear()

      request.onsuccess = () => resolve()
      request.onerror = () => reject(new Error(`Failed to clear models: ${request.error}`))
    })
  } catch (error) {
    console.error('Failed to clear cached models:', error)
    throw error
  }
}

/**
 * Format bytes for display
 */
export function formatModelSize(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  if (bytes === 0) return '0 Bytes'
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
}

/**
 * Estimate transcription speed for a model
 */
export function getModelSpeedEstimate(modelName: string): string {
  switch (modelName) {
    case 'tiny':
    case 'tiny.en':
      return '~30-40x realtime'
    case 'base':
    case 'base.en':
      return '~15-20x realtime'
    case 'small':
      return '~5-8x realtime'
    default:
      return 'Unknown'
  }
}
