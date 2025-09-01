/**
 * IndexedDB storage for summary persistence
 * Manages saving, loading, and organizing summary history
 */

import type { SummaryResult } from '../nlp/textrank'

export interface SummaryItem {
  id: string
  transcriptId?: string
  title: string
  summary: SummaryResult
  metadata: {
    createdAt: Date
    modifiedAt: Date
    format: 'bullets' | 'paragraph'
    options: any // Original summarization options
    source: 'manual' | 'auto' // How the summary was generated
    tags?: string[]
  }
}

export interface SummarySearchResult {
  item: SummaryItem
  matches: Array<{
    index: number
    text: string
    context: string
  }>
}

const SUMMARY_DB_NAME = 'SummaryDB'
const SUMMARY_DB_VERSION = 1
const SUMMARY_STORE_NAME = 'summaries'

let summaryDB: IDBDatabase | null = null

/**
 * Initialize the summary database
 */
async function initSummaryDB(): Promise<IDBDatabase> {
  if (summaryDB) return summaryDB

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SUMMARY_DB_NAME, SUMMARY_DB_VERSION)

    request.onerror = () => reject(new Error('Failed to open summary database'))
    
    request.onsuccess = () => {
      summaryDB = request.result
      resolve(summaryDB)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains(SUMMARY_STORE_NAME)) {
        const store = db.createObjectStore(SUMMARY_STORE_NAME, { keyPath: 'id' })
        store.createIndex('transcriptId', 'transcriptId', { unique: false })
        store.createIndex('createdAt', 'metadata.createdAt', { unique: false })
        store.createIndex('modifiedAt', 'metadata.modifiedAt', { unique: false })
        store.createIndex('title', 'title', { unique: false })
        store.createIndex('source', 'metadata.source', { unique: false })
      }
    }
  })
}

/**
 * Generate a unique ID for a summary
 */
function generateSummaryId(): string {
  return `summary_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Generate a default title from summary text
 */
function generateDefaultTitle(summary: SummaryResult): string {
  if (!summary.sentences || summary.sentences.length === 0) {
    return 'Empty Summary'
  }

  // Use first sentence, truncated if too long
  const firstSentence = summary.sentences[0].replace(/^[•\d\.\s]+/, '').trim()
  
  if (firstSentence.length > 50) {
    return firstSentence.substring(0, 47) + '...'
  }
  
  return firstSentence
}

/**
 * Save a summary to IndexedDB
 */
export async function saveSummary(
  summary: SummaryResult,
  options: {
    transcriptId?: string
    title?: string
    format?: 'bullets' | 'paragraph'
    source?: 'manual' | 'auto'
    tags?: string[]
    originalOptions?: any
    id?: string // For updating existing summary
  } = {}
): Promise<SummaryItem> {
  const db = await initSummaryDB()
  
  const {
    transcriptId,
    title = generateDefaultTitle(summary),
    format = 'bullets',
    source = 'manual',
    tags,
    originalOptions,
    id
  } = options

  const now = new Date()

  const summaryItem: SummaryItem = {
    id: id || generateSummaryId(),
    transcriptId,
    title,
    summary,
    metadata: {
      createdAt: id ? (await getSummary(id))?.metadata.createdAt || now : now,
      modifiedAt: now,
      format,
      options: originalOptions || {},
      source,
      tags
    }
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SUMMARY_STORE_NAME], 'readwrite')
    const store = transaction.objectStore(SUMMARY_STORE_NAME)
    const request = store.put(summaryItem)

    request.onsuccess = () => resolve(summaryItem)
    request.onerror = () => reject(new Error(`Failed to save summary: ${request.error}`))
  })
}

/**
 * Get a summary by ID
 */
export async function getSummary(id: string): Promise<SummaryItem | null> {
  try {
    const db = await initSummaryDB()
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SUMMARY_STORE_NAME], 'readonly')
      const store = transaction.objectStore(SUMMARY_STORE_NAME)
      const request = store.get(id)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(new Error(`Failed to get summary: ${request.error}`))
    })
  } catch (error) {
    console.error('Failed to get summary:', error)
    return null
  }
}

/**
 * List all summaries with optional sorting and filtering
 */
export async function listSummaries(options: {
  sortBy?: 'createdAt' | 'modifiedAt' | 'title'
  sortOrder?: 'asc' | 'desc'
  transcriptId?: string
  source?: 'manual' | 'auto'
  limit?: number
} = {}): Promise<SummaryItem[]> {
  try {
    const db = await initSummaryDB()
    const {
      sortBy = 'modifiedAt',
      sortOrder = 'desc',
      transcriptId,
      source,
      limit
    } = options
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SUMMARY_STORE_NAME], 'readonly')
      const store = transaction.objectStore(SUMMARY_STORE_NAME)
      
      // Use index if available
      let indexSource: IDBObjectStore | IDBIndex = store
      if (transcriptId) {
        indexSource = store.index('transcriptId')
      } else if (source) {
        indexSource = store.index('source')
      } else if (sortBy !== 'id') {
        try {
          indexSource = store.index(`metadata.${sortBy}`)
        } catch {
          // Fallback to main store if index doesn't exist
          indexSource = store
        }
      }

      const request = indexSource.getAll()

      request.onsuccess = () => {
        let results = request.result || []

        // Filter if needed
        if (transcriptId && !indexSource.name?.includes('transcriptId')) {
          results = results.filter(item => item.transcriptId === transcriptId)
        }
        if (source && !indexSource.name?.includes('source')) {
          results = results.filter(item => item.metadata.source === source)
        }

        // Sort
        results.sort((a, b) => {
          let valueA: any, valueB: any

          switch (sortBy) {
            case 'createdAt':
              valueA = a.metadata.createdAt
              valueB = b.metadata.createdAt
              break
            case 'modifiedAt':
              valueA = a.metadata.modifiedAt
              valueB = b.metadata.modifiedAt
              break
            case 'title':
              valueA = a.title.toLowerCase()
              valueB = b.title.toLowerCase()
              break
            default:
              valueA = a.id
              valueB = b.id
          }

          if (valueA < valueB) return sortOrder === 'asc' ? -1 : 1
          if (valueA > valueB) return sortOrder === 'asc' ? 1 : -1
          return 0
        })

        // Apply limit
        if (limit && limit > 0) {
          results = results.slice(0, limit)
        }

        resolve(results)
      }

      request.onerror = () => reject(new Error(`Failed to list summaries: ${request.error}`))
    })
  } catch (error) {
    console.error('Failed to list summaries:', error)
    return []
  }
}

/**
 * Delete a summary by ID
 */
export async function deleteSummary(id: string): Promise<void> {
  const db = await initSummaryDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SUMMARY_STORE_NAME], 'readwrite')
    const store = transaction.objectStore(SUMMARY_STORE_NAME)
    const request = store.delete(id)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error(`Failed to delete summary: ${request.error}`))
  })
}

/**
 * Search summaries by text content
 */
export async function searchSummaries(
  query: string,
  options: {
    caseSensitive?: boolean
    searchInTitle?: boolean
    searchInContent?: boolean
    limit?: number
  } = {}
): Promise<SummarySearchResult[]> {
  if (!query.trim()) return []

  const { 
    caseSensitive = false, 
    searchInTitle = true, 
    searchInContent = true,
    limit = 50 
  } = options
  
  const summaries = await listSummaries()
  const results: SummarySearchResult[] = []

  const searchQuery = caseSensitive ? query : query.toLowerCase()

  for (const summaryItem of summaries) {
    const summaryText = summaryItem.summary.summary
    const titleText = summaryItem.title
    
    const searchableTitle = caseSensitive ? titleText : titleText.toLowerCase()
    const searchableContent = caseSensitive ? summaryText : summaryText.toLowerCase()

    const matches: SummarySearchResult['matches'] = []

    // Search in title
    if (searchInTitle && searchableTitle.includes(searchQuery)) {
      matches.push({
        index: searchableTitle.indexOf(searchQuery),
        text: titleText,
        context: 'Title'
      })
    }

    // Search in summary content
    if (searchInContent) {
      let startIndex = 0
      while (startIndex < searchableContent.length) {
        const index = searchableContent.indexOf(searchQuery, startIndex)
        if (index === -1) break

        // Get context around the match
        const contextStart = Math.max(0, index - 40)
        const contextEnd = Math.min(searchableContent.length, index + searchQuery.length + 40)
        const context = summaryText.substring(contextStart, contextEnd)

        matches.push({
          index,
          text: summaryText.substring(index, index + searchQuery.length),
          context: (contextStart > 0 ? '...' : '') + context + (contextEnd < summaryText.length ? '...' : '')
        })

        startIndex = index + 1
      }
    }

    if (matches.length > 0) {
      results.push({ item: summaryItem, matches })
    }

    if (results.length >= limit) break
  }

  return results
}

/**
 * Get summaries linked to a specific transcript
 */
export async function getSummariesForTranscript(transcriptId: string): Promise<SummaryItem[]> {
  return listSummaries({ transcriptId, sortBy: 'createdAt', sortOrder: 'desc' })
}

/**
 * Get summary statistics
 */
export async function getSummaryStats(): Promise<{
  totalSummaries: number
  summariesBySource: Record<string, number>
  averageCompressionRatio: number
  averageProcessingTime: number
  languageBreakdown: Record<string, number>
  oldestSummary?: Date
  newestSummary?: Date
  totalSentencesOriginal: number
  totalSentencesSummarized: number
}> {
  try {
    const summaries = await listSummaries()
    
    if (summaries.length === 0) {
      return {
        totalSummaries: 0,
        summariesBySource: {},
        averageCompressionRatio: 0,
        averageProcessingTime: 0,
        languageBreakdown: {},
        totalSentencesOriginal: 0,
        totalSentencesSummarized: 0
      }
    }

    let totalCompressionRatio = 0
    let totalProcessingTime = 0
    let totalOriginalSentences = 0
    let totalSummarizedSentences = 0
    
    const summariesBySource: Record<string, number> = {}
    const languageBreakdown: Record<string, number> = {}
    let oldestDate: Date | undefined
    let newestDate: Date | undefined

    for (const summaryItem of summaries) {
      const { summary, metadata } = summaryItem
      
      totalCompressionRatio += summary.compressionRatio
      totalProcessingTime += summary.processingTimeMs
      totalOriginalSentences += summary.originalSentenceCount
      totalSummarizedSentences += summary.summarySentenceCount

      // Source breakdown
      const source = metadata.source
      summariesBySource[source] = (summariesBySource[source] || 0) + 1

      // Language breakdown
      const lang = summary.language || 'unknown'
      languageBreakdown[lang] = (languageBreakdown[lang] || 0) + 1

      // Date tracking
      const createdAt = metadata.createdAt
      if (!oldestDate || createdAt < oldestDate) {
        oldestDate = createdAt
      }
      if (!newestDate || createdAt > newestDate) {
        newestDate = createdAt
      }
    }

    return {
      totalSummaries: summaries.length,
      summariesBySource,
      averageCompressionRatio: totalCompressionRatio / summaries.length,
      averageProcessingTime: Math.round(totalProcessingTime / summaries.length),
      languageBreakdown,
      oldestSummary: oldestDate,
      newestSummary: newestDate,
      totalSentencesOriginal: totalOriginalSentences,
      totalSentencesSummarized: totalSummarizedSentences
    }
  } catch (error) {
    console.error('Failed to get summary stats:', error)
    return {
      totalSummaries: 0,
      summariesBySource: {},
      averageCompressionRatio: 0,
      averageProcessingTime: 0,
      languageBreakdown: {},
      totalSentencesOriginal: 0,
      totalSentencesSummarized: 0
    }
  }
}

/**
 * Clear all summaries (for cleanup/reset)
 */
export async function clearAllSummaries(): Promise<void> {
  const db = await initSummaryDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SUMMARY_STORE_NAME], 'readwrite')
    const store = transaction.objectStore(SUMMARY_STORE_NAME)
    const request = store.clear()

    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error(`Failed to clear summaries: ${request.error}`))
  })
}

/**
 * Export summary as different formats
 */
export function exportSummary(summaryItem: SummaryItem, format: 'txt' | 'json'): Blob {
  let content: string
  let mimeType: string

  switch (format) {
    case 'txt':
      const formattedSummary = summaryItem.metadata.format === 'bullets' 
        ? summaryItem.summary.sentences.map(s => `• ${s}`).join('\n')
        : summaryItem.summary.sentences.join(' ')
        
      content = `${summaryItem.title}\n${'='.repeat(summaryItem.title.length)}\n\n${formattedSummary}\n\n--- Details ---\nLanguage: ${summaryItem.summary.language}\nCompression: ${Math.round(summaryItem.summary.compressionRatio * 100)}%\nSentences: ${summaryItem.summary.summarySentenceCount}/${summaryItem.summary.originalSentenceCount}\nProcessing time: ${summaryItem.summary.processingTimeMs}ms\nGenerated: ${summaryItem.metadata.createdAt.toLocaleString()}`
      mimeType = 'text/plain'
      break

    case 'json':
      content = JSON.stringify(summaryItem, null, 2)
      mimeType = 'application/json'
      break

    default:
      throw new Error(`Unsupported export format: ${format}`)
  }

  return new Blob([content], { type: `${mimeType};charset=utf-8` })
}

/**
 * Update summary tags
 */
export async function updateSummaryTags(summaryId: string, tags: string[]): Promise<SummaryItem | null> {
  const summary = await getSummary(summaryId)
  if (!summary) return null

  const updatedSummary = {
    ...summary,
    metadata: {
      ...summary.metadata,
      tags,
      modifiedAt: new Date()
    }
  }

  return saveSummary(updatedSummary.summary, {
    ...updatedSummary,
    id: summaryId
  })
}

/**
 * Batch operations for summaries
 */
export async function batchDeleteSummaries(ids: string[]): Promise<void> {
  const db = await initSummaryDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SUMMARY_STORE_NAME], 'readwrite')
    const store = transaction.objectStore(SUMMARY_STORE_NAME)
    
    let completed = 0
    let hasError = false

    for (const id of ids) {
      const request = store.delete(id)
      
      request.onsuccess = () => {
        completed++
        if (completed === ids.length && !hasError) {
          resolve()
        }
      }
      
      request.onerror = () => {
        if (!hasError) {
          hasError = true
          reject(new Error(`Failed to delete summary ${id}: ${request.error}`))
        }
      }
    }

    if (ids.length === 0) {
      resolve()
    }
  })
}