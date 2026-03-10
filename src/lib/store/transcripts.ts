/**
 * IndexedDB storage for transcript persistence
 * Manages saving, loading, and organizing transcript history
 */

import type { Segment } from '../whisper/api'
import type { SummaryResult } from '../nlp/textrank'

export interface TranscriptItem {
  id: string
  title: string
  text: string
  segments?: Segment[]
  summary?: {
    result: SummaryResult
    generatedAt: Date
    options: any
  }
  metadata: {
    duration?: number // seconds of audio
    language?: string
    modelUsed?: string
    audioSource?: string // 'recording' | 'imported' | 'file'
    audioFileName?: string
    createdAt: Date
    modifiedAt: Date
    wordCount: number
    characterCount: number
  }
}

export interface TranscriptSearchResult {
  item: TranscriptItem
  matches: Array<{
    index: number
    text: string
    context: string
  }>
}

const TRANSCRIPT_DB_NAME = 'TranscriptDB'
const TRANSCRIPT_DB_VERSION = 1
const TRANSCRIPT_STORE_NAME = 'transcripts'

let transcriptDB: IDBDatabase | null = null

/**
 * Initialize the transcript database
 */
async function initTranscriptDB(): Promise<IDBDatabase> {
  if (transcriptDB) return transcriptDB

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(TRANSCRIPT_DB_NAME, TRANSCRIPT_DB_VERSION)

    request.onerror = () => reject(new Error('Failed to open transcript database'))
    
    request.onsuccess = () => {
      transcriptDB = request.result
      resolve(transcriptDB)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains(TRANSCRIPT_STORE_NAME)) {
        const store = db.createObjectStore(TRANSCRIPT_STORE_NAME, { keyPath: 'id' })
        store.createIndex('createdAt', 'metadata.createdAt', { unique: false })
        store.createIndex('modifiedAt', 'metadata.modifiedAt', { unique: false })
        store.createIndex('title', 'title', { unique: false })
        store.createIndex('language', 'metadata.language', { unique: false })
        store.createIndex('audioSource', 'metadata.audioSource', { unique: false })
      }
    }
  })
}

/**
 * Generate a unique ID for a transcript
 */
function generateTranscriptId(): string {
  return `transcript_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Generate a default title from transcript text
 */
function generateDefaultTitle(text: string): string {
  if (!text || text.trim().length === 0) {
    return 'Empty Transcript'
  }

  // Take first meaningful sentence or first 50 characters
  const firstSentence = text.split(/[.!?]/, 1)[0]?.trim()
  
  if (firstSentence && firstSentence.length > 0) {
    return firstSentence.length > 50 
      ? firstSentence.substring(0, 47) + '...'
      : firstSentence
  }

  // Fallback to first 50 characters
  return text.substring(0, 47).trim() + '...'
}

/**
 * Calculate text statistics
 */
function calculateTextStats(text: string): { wordCount: number; characterCount: number } {
  const characterCount = text.length
  const wordCount = text.trim().split(/\s+/).filter(word => word.length > 0).length
  
  return { wordCount, characterCount }
}

/**
 * Save a transcript to IndexedDB
 */
export async function saveTranscript(
  text: string,
  options: {
    title?: string
    segments?: Segment[]
    summary?: {
      result: SummaryResult
      generatedAt: Date
      options: any
    }
    duration?: number
    language?: string
    modelUsed?: string
    audioSource?: string
    audioFileName?: string
    id?: string // For updating existing transcript
  } = {}
): Promise<TranscriptItem> {
  const db = await initTranscriptDB()
  
  const {
    title = generateDefaultTitle(text),
    segments,
    summary,
    duration,
    language,
    modelUsed,
    audioSource,
    audioFileName,
    id
  } = options

  const textStats = calculateTextStats(text)
  const now = new Date()

  const transcript: TranscriptItem = {
    id: id || generateTranscriptId(),
    title,
    text,
    segments,
    summary,
    metadata: {
      duration,
      language,
      modelUsed,
      audioSource,
      audioFileName,
      createdAt: id ? (await getTranscript(id))?.metadata.createdAt || now : now,
      modifiedAt: now,
      ...textStats
    }
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TRANSCRIPT_STORE_NAME], 'readwrite')
    const store = transaction.objectStore(TRANSCRIPT_STORE_NAME)
    const request = store.put(transcript)

    request.onsuccess = () => resolve(transcript)
    request.onerror = () => reject(new Error(`Failed to save transcript: ${request.error}`))
  })
}

/**
 * Get a transcript by ID
 */
export async function getTranscript(id: string): Promise<TranscriptItem | null> {
  try {
    const db = await initTranscriptDB()
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TRANSCRIPT_STORE_NAME], 'readonly')
      const store = transaction.objectStore(TRANSCRIPT_STORE_NAME)
      const request = store.get(id)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(new Error(`Failed to get transcript: ${request.error}`))
    })
  } catch (error) {
    console.error('Failed to get transcript:', error)
    return null
  }
}

/**
 * List all transcripts with optional sorting and filtering
 */
export async function listTranscripts(options: {
  sortBy?: 'createdAt' | 'modifiedAt' | 'title'
  sortOrder?: 'asc' | 'desc'
  language?: string
  audioSource?: string
  limit?: number
} = {}): Promise<TranscriptItem[]> {
  try {
    const db = await initTranscriptDB()
    const {
      sortBy = 'modifiedAt',
      sortOrder = 'desc',
      language,
      audioSource,
      limit
    } = options
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TRANSCRIPT_STORE_NAME], 'readonly')
      const store = transaction.objectStore(TRANSCRIPT_STORE_NAME)
      
      // Use index if available
      let source: IDBObjectStore | IDBIndex = store
      if (language) {
        source = store.index('language')
      } else if (audioSource) {
        source = store.index('audioSource')
      } else if (sortBy !== 'id') {
        source = store.index(`metadata.${sortBy}`)
      }

      const request = source.getAll()

      request.onsuccess = () => {
        let results = request.result || []

        // Filter if needed
        if (language && !source.name.includes('language')) {
          results = results.filter(item => item.metadata.language === language)
        }
        if (audioSource && !source.name.includes('audioSource')) {
          results = results.filter(item => item.metadata.audioSource === audioSource)
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

      request.onerror = () => reject(new Error(`Failed to list transcripts: ${request.error}`))
    })
  } catch (error) {
    console.error('Failed to list transcripts:', error)
    return []
  }
}

/**
 * Delete a transcript by ID
 */
export async function deleteTranscript(id: string): Promise<void> {
  const db = await initTranscriptDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TRANSCRIPT_STORE_NAME], 'readwrite')
    const store = transaction.objectStore(TRANSCRIPT_STORE_NAME)
    const request = store.delete(id)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error(`Failed to delete transcript: ${request.error}`))
  })
}

/**
 * Search transcripts by text content
 */
export async function searchTranscripts(
  query: string,
  options: {
    caseSensitive?: boolean
    limit?: number
  } = {}
): Promise<TranscriptSearchResult[]> {
  if (!query.trim()) return []

  const { caseSensitive = false, limit = 50 } = options
  const transcripts = await listTranscripts()
  const results: TranscriptSearchResult[] = []

  const searchQuery = caseSensitive ? query : query.toLowerCase()

  for (const transcript of transcripts) {
    const searchText = caseSensitive ? transcript.text : transcript.text.toLowerCase()
    const titleText = caseSensitive ? transcript.title : transcript.title.toLowerCase()

    const matches: TranscriptSearchResult['matches'] = []

    // Search in title
    if (titleText.includes(searchQuery)) {
      matches.push({
        index: titleText.indexOf(searchQuery),
        text: transcript.title,
        context: 'Title'
      })
    }

    // Search in transcript text
    let startIndex = 0
    while (startIndex < searchText.length) {
      const index = searchText.indexOf(searchQuery, startIndex)
      if (index === -1) break

      // Get context around the match
      const contextStart = Math.max(0, index - 50)
      const contextEnd = Math.min(searchText.length, index + searchQuery.length + 50)
      const context = transcript.text.substring(contextStart, contextEnd)

      matches.push({
        index,
        text: transcript.text.substring(index, index + searchQuery.length),
        context: contextStart > 0 ? '...' + context : context
      })

      startIndex = index + 1
    }

    if (matches.length > 0) {
      results.push({ item: transcript, matches })
    }

    if (results.length >= limit) break
  }

  return results
}

/**
 * Get transcript statistics
 */
export async function getTranscriptStats(): Promise<{
  totalTranscripts: number
  totalWords: number
  totalCharacters: number
  averageWordsPerTranscript: number
  languageBreakdown: Record<string, number>
  sourceBreakdown: Record<string, number>
  oldestTranscript?: Date
  newestTranscript?: Date
}> {
  try {
    const transcripts = await listTranscripts()
    
    if (transcripts.length === 0) {
      return {
        totalTranscripts: 0,
        totalWords: 0,
        totalCharacters: 0,
        averageWordsPerTranscript: 0,
        languageBreakdown: {},
        sourceBreakdown: {}
      }
    }

    let totalWords = 0
    let totalCharacters = 0
    const languageBreakdown: Record<string, number> = {}
    const sourceBreakdown: Record<string, number> = {}
    let oldestDate: Date | undefined
    let newestDate: Date | undefined

    for (const transcript of transcripts) {
      totalWords += transcript.metadata.wordCount
      totalCharacters += transcript.metadata.characterCount

      // Language breakdown
      const lang = transcript.metadata.language || 'unknown'
      languageBreakdown[lang] = (languageBreakdown[lang] || 0) + 1

      // Source breakdown
      const source = transcript.metadata.audioSource || 'unknown'
      sourceBreakdown[source] = (sourceBreakdown[source] || 0) + 1

      // Date tracking
      const createdAt = transcript.metadata.createdAt
      if (!oldestDate || createdAt < oldestDate) {
        oldestDate = createdAt
      }
      if (!newestDate || createdAt > newestDate) {
        newestDate = createdAt
      }
    }

    return {
      totalTranscripts: transcripts.length,
      totalWords,
      totalCharacters,
      averageWordsPerTranscript: Math.round(totalWords / transcripts.length),
      languageBreakdown,
      sourceBreakdown,
      oldestTranscript: oldestDate,
      newestTranscript: newestDate
    }
  } catch (error) {
    console.error('Failed to get transcript stats:', error)
    return {
      totalTranscripts: 0,
      totalWords: 0,
      totalCharacters: 0,
      averageWordsPerTranscript: 0,
      languageBreakdown: {},
      sourceBreakdown: {}
    }
  }
}

/**
 * Clear all transcripts (for cleanup/reset)
 */
export async function clearAllTranscripts(): Promise<void> {
  const db = await initTranscriptDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TRANSCRIPT_STORE_NAME], 'readwrite')
    const store = transaction.objectStore(TRANSCRIPT_STORE_NAME)
    const request = store.clear()

    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error(`Failed to clear transcripts: ${request.error}`))
  })
}

/**
 * Export transcript as different formats
 */
export function exportTranscript(transcript: TranscriptItem, format: 'txt' | 'srt' | 'json' | 'summary'): Blob {
  let content: string
  let mimeType: string

  switch (format) {
    case 'txt':
      content = `${transcript.title}\n${'='.repeat(transcript.title.length)}\n\n${transcript.text}`
      if (transcript.summary) {
        content += `\n\n--- SUMMARY ---\n${transcript.summary.result.summary}`
      }
      mimeType = 'text/plain'
      break

    case 'srt':
      if (!transcript.segments) {
        throw new Error('SRT export requires segment data')
      }
      content = formatAsSRT(transcript.segments)
      mimeType = 'text/plain'
      break

    case 'summary':
      if (!transcript.summary) {
        throw new Error('Summary export requires summary data')
      }
      content = `${transcript.title} - Summary\n${'='.repeat(transcript.title.length + 10)}\n\n${transcript.summary.result.summary}\n\nGenerated: ${transcript.summary.generatedAt.toLocaleString()}\nCompression: ${Math.round(transcript.summary.result.compressionRatio * 100)}%\nProcessing time: ${transcript.summary.result.processingTimeMs}ms`
      mimeType = 'text/plain'
      break

    case 'json':
      content = JSON.stringify(transcript, null, 2)
      mimeType = 'application/json'
      break

    default:
      throw new Error(`Unsupported export format: ${format}`)
  }

  return new Blob([content], { type: `${mimeType};charset=utf-8` })
}

/**
 * Format segments as SRT subtitles
 */
function formatAsSRT(segments: Segment[]): string {
  return segments
    .map((segment, index) => {
      const startTime = formatSRTTime(segment.start)
      const endTime = formatSRTTime(segment.end)
      return `${index + 1}\n${startTime} --> ${endTime}\n${segment.text.trim()}\n`
    })
    .join('\n')
}

/**
 * Format time in SRT format (HH:MM:SS,mmm)
 */
function formatSRTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const milliseconds = Math.floor((seconds % 1) * 1000)

  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds
    .toString()
    .padStart(3, '0')}`
}

/**
 * Save summary to an existing transcript
 */
export async function saveTranscriptSummary(
  transcriptId: string,
  summary: SummaryResult,
  options: any = {}
): Promise<TranscriptItem | null> {
  const transcript = await getTranscript(transcriptId)
  if (!transcript) {
    throw new Error('Transcript not found')
  }

  const updatedTranscript = {
    ...transcript,
    summary: {
      result: summary,
      generatedAt: new Date(),
      options
    },
    metadata: {
      ...transcript.metadata,
      modifiedAt: new Date()
    }
  }

  return saveTranscript(updatedTranscript.text, {
    ...updatedTranscript,
    id: transcriptId
  })
}

/**
 * Get summaries for multiple transcripts
 */
export async function getTranscriptSummaries(transcriptIds: string[]): Promise<Array<{
  transcriptId: string
  summary: SummaryResult | null
  title: string
}>> {
  const results = []
  
  for (const id of transcriptIds) {
    const transcript = await getTranscript(id)
    results.push({
      transcriptId: id,
      summary: transcript?.summary?.result || null,
      title: transcript?.title || 'Unknown'
    })
  }
  
  return results
}

/**
 * Search transcripts that have summaries
 */
export async function searchTranscriptSummaries(
  query: string,
  options: {
    caseSensitive?: boolean
    limit?: number
  } = {}
): Promise<TranscriptSearchResult[]> {
  if (!query.trim()) return []

  const { caseSensitive = false, limit = 20 } = options
  const transcripts = await listTranscripts()
  const results: TranscriptSearchResult[] = []

  const searchQuery = caseSensitive ? query : query.toLowerCase()

  for (const transcript of transcripts) {
    if (!transcript.summary) continue

    const summaryText = caseSensitive ? transcript.summary.result.summary : transcript.summary.result.summary.toLowerCase()
    const titleText = caseSensitive ? transcript.title : transcript.title.toLowerCase()

    const matches: TranscriptSearchResult['matches'] = []

    // Search in title
    if (titleText.includes(searchQuery)) {
      matches.push({
        index: titleText.indexOf(searchQuery),
        text: transcript.title,
        context: 'Title'
      })
    }

    // Search in summary text
    let startIndex = 0
    while (startIndex < summaryText.length) {
      const index = summaryText.indexOf(searchQuery, startIndex)
      if (index === -1) break

      // Get context around the match
      const contextStart = Math.max(0, index - 30)
      const contextEnd = Math.min(summaryText.length, index + searchQuery.length + 30)
      const context = transcript.summary.result.summary.substring(contextStart, contextEnd)

      matches.push({
        index,
        text: transcript.summary.result.summary.substring(index, index + searchQuery.length),
        context: contextStart > 0 ? '...' + context + '...' : context + '...'
      })

      startIndex = index + 1
    }

    if (matches.length > 0) {
      results.push({ item: transcript, matches })
    }

    if (results.length >= limit) break
  }

  return results
}