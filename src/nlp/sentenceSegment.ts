/**
 * Sentence segmentation for text processing
 * Uses Intl.Segmenter with regex fallbacks for cross-browser compatibility
 */

/**
 * Sentence segmentation options
 */
export interface SegmentationOptions {
  locale?: string
  minLength?: number
  maxLength?: number
  cleanWhitespace?: boolean
}

/**
 * Sentence boundary patterns for different languages
 */
const SENTENCE_PATTERNS = {
  en: /[.!?]+(?:\s+|$)/g,
  es: /[.!?¡¿]+(?:\s+|$)/g,
  fr: /[.!?]+(?:\s+|$)/g
} as const

/**
 * Common abbreviations that shouldn't trigger sentence breaks
 */
const ABBREVIATIONS = {
  en: new Set([
    'dr', 'mr', 'mrs', 'ms', 'prof', 'vs', 'etc', 'inc', 'ltd', 'corp',
    'co', 'jr', 'sr', 'st', 'ave', 'blvd', 'dept', 'govt', 'min', 'max',
    'approx', 'est', 'ref', 'fig', 'no', 'vol', 'pp', 'ch', 'sec'
  ]),
  es: new Set([
    'dr', 'dra', 'sr', 'sra', 'srta', 'prof', 'etc', 'pág', 'págs',
    'cap', 'art', 'inc', 'ltd', 'cia', 'cía', 'min', 'max', 'aprox',
    'est', 'ref', 'fig', 'no', 'núm', 'vol', 'sec'
  ]),
  fr: new Set([
    'dr', 'mr', 'mme', 'mlle', 'prof', 'etc', 'inc', 'ltd', 'cie',
    'min', 'max', 'env', 'est', 'ref', 'fig', 'no', 'vol', 'sec'
  ])
} as const

/**
 * Check if Intl.Segmenter is supported
 */
function isSegmenterSupported(): boolean {
  try {
    return typeof Intl !== 'undefined' && 'Segmenter' in Intl
  } catch {
    return false
  }
}

/**
 * Segment text using Intl.Segmenter (modern browsers)
 */
function segmentWithIntl(text: string, locale: string): string[] {
  try {
    const segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' })
    const segments = Array.from(segmenter.segment(text))
    
    return segments
      .filter(segment => segment.isWordLike || segment.segment.trim().length > 0)
      .map(segment => segment.segment.trim())
      .filter(sentence => sentence.length > 0)
  } catch (error) {
    console.warn('Intl.Segmenter failed, falling back to regex:', error)
    return segmentWithRegex(text, locale)
  }
}

/**
 * Segment text using regex patterns (fallback)
 */
function segmentWithRegex(text: string, locale: string): string[] {
  const lang = locale.toLowerCase().substring(0, 2) as keyof typeof SENTENCE_PATTERNS
  const pattern = SENTENCE_PATTERNS[lang] || SENTENCE_PATTERNS.en
  const abbreviations = ABBREVIATIONS[lang] || ABBREVIATIONS.en
  
  // Split by sentence boundaries
  const rawSentences = text.split(pattern)
  const sentences: string[] = []
  
  for (let i = 0; i < rawSentences.length; i++) {
    let sentence = rawSentences[i]?.trim()
    if (!sentence) continue
    
    // Check for false positives (abbreviations)
    const words = sentence.split(/\s+/)
    const lastWord = words[words.length - 1]?.toLowerCase().replace(/\.$/, '')
    
    // If this might be an abbreviation, check if we should merge with next sentence
    if (lastWord && abbreviations.has(lastWord) && i < rawSentences.length - 1) {
      const nextSentence = rawSentences[i + 1]?.trim()
      if (nextSentence && nextSentence[0]?.toLowerCase() === nextSentence[0]) {
        // Next sentence starts with lowercase, likely continuation
        sentence += '. ' + nextSentence
        i++ // Skip the next sentence as we've merged it
      }
    }
    
    sentences.push(sentence)
  }
  
  return sentences.filter(s => s.length > 0)
}

/**
 * Clean and normalize sentence text
 */
function cleanSentence(sentence: string, options: SegmentationOptions): string {
  let cleaned = sentence.trim()
  
  if (options.cleanWhitespace) {
    // Normalize whitespace
    cleaned = cleaned.replace(/\s+/g, ' ')
    
    // Remove extra punctuation
    cleaned = cleaned.replace(/[.!?]+$/, match => match[0])
    
    // Clean up quotes and brackets
    cleaned = cleaned.replace(/["']([^"']*?)["']/g, '"$1"')
    cleaned = cleaned.replace(/\s*([.!?])\s*/g, '$1 ')
  }
  
  return cleaned
}

/**
 * Filter sentences by length constraints
 */
function filterSentences(sentences: string[], options: SegmentationOptions): string[] {
  const minLength = options.minLength || 5
  const maxLength = options.maxLength || 1000
  
  return sentences.filter(sentence => {
    const length = sentence.trim().length
    return length >= minLength && length <= maxLength
  })
}

/**
 * Main sentence segmentation function
 */
export function segment(text: string, options: SegmentationOptions = {}): string[] {
  if (!text || text.trim().length === 0) {
    return []
  }
  
  const locale = options.locale || 'en'
  
  // Try modern Intl.Segmenter first
  let sentences: string[]
  if (isSegmenterSupported()) {
    sentences = segmentWithIntl(text, locale)
  } else {
    sentences = segmentWithRegex(text, locale)
  }
  
  // Clean sentences
  if (options.cleanWhitespace) {
    sentences = sentences.map(sentence => cleanSentence(sentence, options))
  }
  
  // Filter by length
  sentences = filterSentences(sentences, options)
  
  return sentences
}

/**
 * Segment text and return with metadata
 */
export interface SentenceSegment {
  text: string
  index: number
  startOffset: number
  endOffset: number
  wordCount: number
  charCount: number
}

export function segmentWithMetadata(text: string, options: SegmentationOptions = {}): SentenceSegment[] {
  const sentences = segment(text, options)
  const segments: SentenceSegment[] = []
  
  let currentOffset = 0
  
  sentences.forEach((sentence, index) => {
    // Find the actual position in original text
    const startOffset = text.indexOf(sentence, currentOffset)
    const endOffset = startOffset + sentence.length
    
    const wordCount = sentence.trim().split(/\s+/).length
    const charCount = sentence.length
    
    segments.push({
      text: sentence,
      index,
      startOffset: startOffset >= 0 ? startOffset : currentOffset,
      endOffset: startOffset >= 0 ? endOffset : currentOffset + sentence.length,
      wordCount,
      charCount
    })
    
    currentOffset = endOffset
  })
  
  return segments
}

/**
 * Quick sentence count without full segmentation
 */
export function countSentences(text: string, locale: string = 'en'): number {
  if (!text || text.trim().length === 0) return 0
  
  const lang = locale.toLowerCase().substring(0, 2) as keyof typeof SENTENCE_PATTERNS
  const pattern = SENTENCE_PATTERNS[lang] || SENTENCE_PATTERNS.en
  
  const matches = text.match(pattern)
  return matches ? matches.length : 1
}

/**
 * Split text into chunks with sentence boundaries preserved
 */
export function chunkBySentences(text: string, maxChunkSize: number, options: SegmentationOptions = {}): string[] {
  const sentences = segment(text, options)
  const chunks: string[] = []
  let currentChunk = ''
  
  for (const sentence of sentences) {
    const testChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence
    
    if (testChunk.length <= maxChunkSize) {
      currentChunk = testChunk
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim())
        currentChunk = sentence
      } else {
        // Single sentence is too long, split it
        chunks.push(sentence)
      }
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk.trim())
  }
  
  return chunks
}

/**
 * Validate sentence segmentation quality
 */
export interface SegmentationStats {
  totalSentences: number
  averageLength: number
  minLength: number
  maxLength: number
  emptyCount: number
  shortCount: number
  longCount: number
}

export function analyzeSegmentation(sentences: string[]): SegmentationStats {
  if (sentences.length === 0) {
    return {
      totalSentences: 0,
      averageLength: 0,
      minLength: 0,
      maxLength: 0,
      emptyCount: 0,
      shortCount: 0,
      longCount: 0
    }
  }
  
  const lengths = sentences.map(s => s.length)
  const totalLength = lengths.reduce((sum, len) => sum + len, 0)
  
  return {
    totalSentences: sentences.length,
    averageLength: Math.round(totalLength / sentences.length),
    minLength: Math.min(...lengths),
    maxLength: Math.max(...lengths),
    emptyCount: sentences.filter(s => s.trim().length === 0).length,
    shortCount: sentences.filter(s => s.trim().length < 10).length,
    longCount: sentences.filter(s => s.length > 200).length
  }
}
