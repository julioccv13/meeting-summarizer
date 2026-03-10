import { MediaMeta, ImportedItem, StorageInfo } from '../types'

/**
 * IndexedDB wrapper for PWA media storage
 * Stores original files, processed PCM data, and metadata
 */

const DB_NAME = 'PWATranscribeDB'
const DB_VERSION = 1

// Object store names
const STORES = {
  MANIFEST: 'manifest',    // MediaMeta objects
  ORIGINALS: 'originals',  // Original file Blobs
  PCM: 'pcm'              // Float32Array PCM data
} as const

let db: IDBDatabase | null = null

/**
 * Initialize the IndexedDB database
 */
export async function initDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(new Error('Failed to open IndexedDB'))
    
    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result

      // Create manifest store for metadata
      if (!database.objectStoreNames.contains(STORES.MANIFEST)) {
        const manifestStore = database.createObjectStore(STORES.MANIFEST, { keyPath: 'id' })
        manifestStore.createIndex('importedAt', 'importedAt', { unique: false })
        manifestStore.createIndex('name', 'name', { unique: false })
      }

      // Create originals store for source files
      if (!database.objectStoreNames.contains(STORES.ORIGINALS)) {
        database.createObjectStore(STORES.ORIGINALS)
      }

      // Create PCM store for processed audio data
      if (!database.objectStoreNames.contains(STORES.PCM)) {
        database.createObjectStore(STORES.PCM)
      }
    }
  })
}

/**
 * Generate a unique ID for an imported item
 */
function generateId(): string {
  return `item_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Store original file blob
 */
export async function putOriginal(id: string, file: File | Blob): Promise<void> {
  const database = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.ORIGINALS], 'readwrite')
    const store = transaction.objectStore(STORES.ORIGINALS)
    const request = store.put(file, id)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error(`Failed to store original file: ${request.error}`))
  })
}

/**
 * Store processed PCM data
 */
export async function putPCM(id: string, pcm: Float32Array): Promise<void> {
  const database = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.PCM], 'readwrite')
    const store = transaction.objectStore(STORES.PCM)
    
    // Store as ArrayBuffer to maintain precision
    const request = store.put(pcm.buffer.slice(0), id)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error(`Failed to store PCM data: ${request.error}`))
  })
}

/**
 * Store metadata for an imported item
 */
export async function putMeta(meta: MediaMeta): Promise<void> {
  const database = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.MANIFEST], 'readwrite')
    const store = transaction.objectStore(STORES.MANIFEST)
    const request = store.put(meta)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error(`Failed to store metadata: ${request.error}`))
  })
}

/**
 * Get metadata for a specific item
 */
export async function getMeta(id: string): Promise<MediaMeta | null> {
  const database = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.MANIFEST], 'readonly')
    const store = transaction.objectStore(STORES.MANIFEST)
    const request = store.get(id)

    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(new Error(`Failed to get metadata: ${request.error}`))
  })
}

/**
 * Get original file blob
 */
export async function getOriginal(id: string): Promise<Blob | null> {
  const database = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.ORIGINALS], 'readonly')
    const store = transaction.objectStore(STORES.ORIGINALS)
    const request = store.get(id)

    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(new Error(`Failed to get original file: ${request.error}`))
  })
}

/**
 * Get processed PCM data
 */
export async function getPCM(id: string): Promise<Float32Array | null> {
  const database = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.PCM], 'readonly')
    const store = transaction.objectStore(STORES.PCM)
    const request = store.get(id)

    request.onsuccess = () => {
      const arrayBuffer = request.result
      if (arrayBuffer) {
        resolve(new Float32Array(arrayBuffer))
      } else {
        resolve(null)
      }
    }
    request.onerror = () => reject(new Error(`Failed to get PCM data: ${request.error}`))
  })
}

/**
 * Get complete imported item (metadata + PCM + optional original)
 */
export async function getItem(id: string, includeOriginal = false): Promise<ImportedItem | null> {
  try {
    const meta = await getMeta(id)
    if (!meta) return null

    const pcm = await getPCM(id)
    const originalFile = includeOriginal ? await getOriginal(id) : undefined

    return {
      meta,
      pcm: pcm || undefined,
      originalFile
    }
  } catch (error) {
    console.error('Failed to get item:', error)
    return null
  }
}

/**
 * List all imported items metadata
 */
export async function listItems(): Promise<MediaMeta[]> {
  const database = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.MANIFEST], 'readonly')
    const store = transaction.objectStore(STORES.MANIFEST)
    const request = store.getAll()

    request.onsuccess = () => {
      const items = request.result || []
      // Sort by import date, newest first
      items.sort((a, b) => b.importedAt.getTime() - a.importedAt.getTime())
      resolve(items)
    }
    request.onerror = () => reject(new Error(`Failed to list items: ${request.error}`))
  })
}

/**
 * Delete an imported item completely (metadata, PCM, and original)
 */
export async function deleteItem(id: string): Promise<void> {
  const database = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.MANIFEST, STORES.PCM, STORES.ORIGINALS], 'readwrite')
    
    let completed = 0
    const total = 3
    
    const checkComplete = () => {
      completed++
      if (completed === total) resolve()
    }

    // Delete from all three stores
    const manifestStore = transaction.objectStore(STORES.MANIFEST)
    const pcmStore = transaction.objectStore(STORES.PCM)
    const originalsStore = transaction.objectStore(STORES.ORIGINALS)

    manifestStore.delete(id).onsuccess = checkComplete
    pcmStore.delete(id).onsuccess = checkComplete
    originalsStore.delete(id).onsuccess = checkComplete

    transaction.onerror = () => reject(new Error(`Failed to delete item: ${transaction.error}`))
  })
}

/**
 * Store a complete imported item
 */
export async function storeImportedItem(
  file: File,
  pcm: Float32Array,
  decodedInfo: { sampleRate: number; channels: number; durationSec: number },
  storeOriginal = true
): Promise<MediaMeta> {
  const id = generateId()
  
  const meta: MediaMeta = {
    id,
    name: file.name,
    size: file.size,
    mimeType: file.type,
    durationSec: decodedInfo.durationSec,
    originalSampleRate: decodedInfo.sampleRate,
    originalChannels: decodedInfo.channels,
    importedAt: new Date()
  }

  // Store metadata
  await putMeta(meta)
  
  // Store PCM data
  await putPCM(id, pcm)
  
  // Optionally store original file
  if (storeOriginal) {
    await putOriginal(id, file)
  }

  return meta
}

/**
 * Get storage statistics
 */
export async function getStorageInfo(): Promise<StorageInfo> {
  try {
    const items = await listItems()
    let usedBytes = 0
    let pcmItems = 0
    let originalItems = 0

    // Calculate storage usage
    for (const item of items) {
      // Estimate PCM size: 4 bytes per float32 sample * 16000 samples/sec * duration
      const estimatedPCMSize = Math.ceil(item.durationSec * 16000 * 4)
      usedBytes += estimatedPCMSize
      pcmItems++

      // Add original file size if it exists
      try {
        const original = await getOriginal(item.id)
        if (original) {
          usedBytes += original.size
          originalItems++
        }
      } catch {
        // Ignore errors for individual files
      }
    }

    // Try to get quota information (may not be supported in all browsers)
    let availableBytes: number | undefined
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate()
        if (estimate.quota && estimate.usage) {
          availableBytes = estimate.quota - estimate.usage
        }
      }
    } catch {
      // Quota info not available
    }

    return {
      usedBytes,
      availableBytes,
      totalItems: items.length,
      pcmItems,
      originalItems
    }
  } catch (error) {
    console.error('Failed to get storage info:', error)
    return {
      usedBytes: 0,
      totalItems: 0,
      pcmItems: 0,
      originalItems: 0
    }
  }
}

/**
 * Clear all stored data (for debugging/reset purposes)
 */
export async function clearAllData(): Promise<void> {
  const database = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.MANIFEST, STORES.PCM, STORES.ORIGINALS], 'readwrite')
    
    let completed = 0
    const total = 3

    const checkComplete = () => {
      completed++
      if (completed === total) resolve()
    }

    transaction.objectStore(STORES.MANIFEST).clear().onsuccess = checkComplete
    transaction.objectStore(STORES.PCM).clear().onsuccess = checkComplete
    transaction.objectStore(STORES.ORIGINALS).clear().onsuccess = checkComplete

    transaction.onerror = () => reject(new Error(`Failed to clear data: ${transaction.error}`))
  })
}

/**
 * Format bytes for display
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Format duration for display
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}