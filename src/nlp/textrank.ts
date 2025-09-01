/**
 * TextRank implementation for extractive text summarization
 * Uses PageRank algorithm on sentence similarity graph
 */

import { segment, type SegmentationOptions } from './sentenceSegment'
import { removeStopwords, detectLanguage, getStopwords } from './stopwords'

/**
 * Summarization options
 */
export interface SummarizationOptions {
  locale?: 'en' | 'es' | 'fr'
  maxSentences?: number
  maxChars?: number
  dampingFactor?: number
  maxIterations?: number
  convergenceThreshold?: number
  similarityThreshold?: number
  removeNearDuplicates?: boolean
  segmentationOptions?: SegmentationOptions
}

/**
 * Summary result
 */
export interface SummaryResult {
  sentences: string[]
  summary: string
  originalSentenceCount: number
  summarySentenceCount: number
  compressionRatio: number
  processingTimeMs: number
  language: string
  scores: number[]
}

/**
 * Term frequency data structure
 */
interface TermFrequency {
  [term: string]: number
}

/**
 * Inverse document frequency data structure
 */
interface InverseDocumentFrequency {
  [term: string]: number
}

/**
 * Sentence vector representation
 */
interface SentenceVector {
  terms: TermFrequency
  magnitude: number
}

/**
 * Tokenize text into words, removing punctuation and stopwords
 */
function tokenize(text: string, language: string): string[] {
  // Convert to lowercase and extract words
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 0)
  
  // Remove stopwords
  return removeStopwords(words, language)
}

/**
 * Calculate term frequency for a sentence
 */
function calculateTermFrequency(tokens: string[]): TermFrequency {
  const tf: TermFrequency = {}
  const totalTerms = tokens.length
  
  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1
  }
  
  // Normalize by total terms (optional - can use raw counts)
  for (const term in tf) {
    tf[term] = tf[term] / totalTerms
  }
  
  return tf
}

/**
 * Calculate inverse document frequency for all terms
 */
function calculateIDF(sentenceTokens: string[][]): InverseDocumentFrequency {
  const idf: InverseDocumentFrequency = {}
  const totalDocuments = sentenceTokens.length
  
  // Count how many sentences contain each term
  const termDocumentCount: { [term: string]: number } = {}
  
  for (const tokens of sentenceTokens) {
    const uniqueTerms = new Set(tokens)
    for (const term of uniqueTerms) {
      termDocumentCount[term] = (termDocumentCount[term] || 0) + 1
    }
  }
  
  // Calculate IDF
  for (const term in termDocumentCount) {
    idf[term] = Math.log(totalDocuments / termDocumentCount[term])
  }
  
  return idf
}

/**
 * Create sentence vector with TF-IDF
 */
function createSentenceVector(tokens: string[], idf: InverseDocumentFrequency): SentenceVector {
  const tf = calculateTermFrequency(tokens)
  const vector: TermFrequency = {}
  let magnitude = 0
  
  for (const term in tf) {
    const tfIdfScore = tf[term] * (idf[term] || 0)
    vector[term] = tfIdfScore
    magnitude += tfIdfScore * tfIdfScore
  }
  
  magnitude = Math.sqrt(magnitude)
  
  return { terms: vector, magnitude }
}

/**
 * Calculate cosine similarity between two sentence vectors
 */
function cosineSimilarity(vector1: SentenceVector, vector2: SentenceVector): number {
  if (vector1.magnitude === 0 || vector2.magnitude === 0) {
    return 0
  }
  
  let dotProduct = 0
  const terms1 = new Set(Object.keys(vector1.terms))
  const terms2 = new Set(Object.keys(vector2.terms))
  
  for (const term of terms1) {
    if (terms2.has(term)) {
      dotProduct += vector1.terms[term] * vector2.terms[term]
    }
  }
  
  return dotProduct / (vector1.magnitude * vector2.magnitude)
}

/**
 * Build similarity matrix between sentences
 */
function buildSimilarityMatrix(vectors: SentenceVector[], threshold: number = 0.1): number[][] {
  const n = vectors.length
  const matrix: number[][] = Array(n).fill(0).map(() => Array(n).fill(0))
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        const similarity = cosineSimilarity(vectors[i], vectors[j])
        // Apply threshold to reduce noise
        matrix[i][j] = similarity > threshold ? similarity : 0
      }
    }
  }
  
  return matrix
}

/**
 * Normalize similarity matrix rows to create transition matrix
 */
function normalizeMatrix(matrix: number[][]): number[][] {
  const n = matrix.length
  const normalized: number[][] = Array(n).fill(0).map(() => Array(n).fill(0))
  
  for (let i = 0; i < n; i++) {
    const rowSum = matrix[i].reduce((sum, val) => sum + val, 0)
    
    if (rowSum > 0) {
      for (let j = 0; j < n; j++) {
        normalized[i][j] = matrix[i][j] / rowSum
      }
    } else {
      // If no outgoing links, distribute equally
      const equalWeight = 1 / n
      for (let j = 0; j < n; j++) {
        normalized[i][j] = equalWeight
      }
    }
  }
  
  return normalized
}

/**
 * Run PageRank algorithm on similarity matrix
 */
function pagerank(
  matrix: number[][], 
  dampingFactor: number = 0.85,
  maxIterations: number = 100,
  convergenceThreshold: number = 1e-6
): number[] {
  const n = matrix.length
  
  if (n === 0) return []
  if (n === 1) return [1.0]
  
  // Initialize scores equally
  let scores = Array(n).fill(1 / n)
  const newScores = Array(n).fill(0)
  
  for (let iter = 0; iter < maxIterations; iter++) {
    // Calculate new scores
    for (let i = 0; i < n; i++) {
      newScores[i] = (1 - dampingFactor) / n
      
      for (let j = 0; j < n; j++) {
        newScores[i] += dampingFactor * scores[j] * matrix[j][i]
      }
    }
    
    // Check for convergence
    let maxDiff = 0
    for (let i = 0; i < n; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(newScores[i] - scores[i]))
    }
    
    if (maxDiff < convergenceThreshold) {
      break
    }
    
    // Swap arrays
    [scores, newScores] = [newScores, scores]
  }
  
  return scores
}

/**
 * Select top sentences based on scores and constraints
 */
function selectSentences(
  sentences: string[],
  scores: number[],
  options: SummarizationOptions
): { selectedSentences: string[], selectedIndices: number[] } {
  const maxSentences = options.maxSentences || Math.max(1, Math.floor(sentences.length * 0.3))
  const maxChars = options.maxChars || 2000
  
  // Create scored sentence pairs
  const scoredSentences = sentences.map((sentence, index) => ({
    sentence,
    score: scores[index],
    index,
    length: sentence.length
  }))
  
  // Sort by score descending
  scoredSentences.sort((a, b) => b.score - a.score)
  
  const selected: typeof scoredSentences = []
  let totalChars = 0
  
  // Remove near-duplicates if requested
  if (options.removeNearDuplicates) {
    const threshold = options.similarityThreshold || 0.7
    
    for (const candidate of scoredSentences) {
      let isDuplicate = false
      
      // Check against already selected sentences
      for (const existing of selected) {
        const similarity = calculateStringSimilarity(candidate.sentence, existing.sentence)
        if (similarity > threshold) {
          isDuplicate = true
          break
        }
      }
      
      if (!isDuplicate && 
          selected.length < maxSentences && 
          totalChars + candidate.length <= maxChars) {
        selected.push(candidate)
        totalChars += candidate.length
      }
      
      if (selected.length >= maxSentences || totalChars >= maxChars) {
        break
      }
    }
  } else {
    // Simple selection without duplicate removal
    for (const candidate of scoredSentences) {
      if (selected.length < maxSentences && 
          totalChars + candidate.length <= maxChars) {
        selected.push(candidate)
        totalChars += candidate.length
      }
      
      if (selected.length >= maxSentences || totalChars >= maxChars) {
        break
      }
    }
  }
  
  // Sort selected sentences by original order
  selected.sort((a, b) => a.index - b.index)
  
  return {
    selectedSentences: selected.map(item => item.sentence),
    selectedIndices: selected.map(item => item.index)
  }
}

/**
 * Simple string similarity calculation
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.toLowerCase().split(/\s+/))
  const words2 = new Set(str2.toLowerCase().split(/\s+/))
  
  const intersection = new Set([...words1].filter(word => words2.has(word)))
  const union = new Set([...words1, ...words2])
  
  return intersection.size / union.size
}

/**
 * Format sentences as bullet points
 */
function formatAsBullets(sentences: string[]): string {
  return sentences.map(sentence => `• ${sentence}`).join('\n')
}

/**
 * Format sentences as paragraph
 */
function formatAsParagraph(sentences: string[]): string {
  return sentences.join(' ')
}

/**
 * Main summarization function
 */
export function summarize(text: string, options: SummarizationOptions = {}): SummaryResult {
  const startTime = Date.now()
  
  // Detect language if not specified
  const language = options.locale || detectLanguage(text)
  
  // Default options
  const opts: Required<SummarizationOptions> = {
    locale: language,
    maxSentences: options.maxSentences || Math.max(1, Math.floor(text.length / 1000)),
    maxChars: options.maxChars || 2000,
    dampingFactor: options.dampingFactor || 0.85,
    maxIterations: options.maxIterations || 100,
    convergenceThreshold: options.convergenceThreshold || 1e-6,
    similarityThreshold: options.similarityThreshold || 0.7,
    removeNearDuplicates: options.removeNearDuplicates ?? true,
    segmentationOptions: options.segmentationOptions || {}
  }
  
  // Segment text into sentences
  const sentences = segment(text, {
    locale: language,
    cleanWhitespace: true,
    minLength: 10,
    ...opts.segmentationOptions
  })
  
  if (sentences.length === 0) {
    return {
      sentences: [],
      summary: '',
      originalSentenceCount: 0,
      summarySentenceCount: 0,
      compressionRatio: 0,
      processingTimeMs: Date.now() - startTime,
      language,
      scores: []
    }
  }
  
  if (sentences.length === 1) {
    return {
      sentences,
      summary: sentences[0],
      originalSentenceCount: 1,
      summarySentenceCount: 1,
      compressionRatio: 1,
      processingTimeMs: Date.now() - startTime,
      language,
      scores: [1.0]
    }
  }
  
  // Tokenize sentences
  const sentenceTokens = sentences.map(sentence => tokenize(sentence, language))
  
  // Calculate IDF
  const idf = calculateIDF(sentenceTokens)
  
  // Create sentence vectors
  const vectors = sentenceTokens.map(tokens => createSentenceVector(tokens, idf))
  
  // Build similarity matrix
  const similarityMatrix = buildSimilarityMatrix(vectors, 0.1)
  
  // Normalize to create transition matrix
  const transitionMatrix = normalizeMatrix(similarityMatrix)
  
  // Run PageRank
  const scores = pagerank(
    transitionMatrix,
    opts.dampingFactor,
    opts.maxIterations,
    opts.convergenceThreshold
  )
  
  // Select top sentences
  const { selectedSentences } = selectSentences(sentences, scores, opts)
  
  // Format summary
  const summary = selectedSentences.length > 3 
    ? formatAsBullets(selectedSentences)
    : formatAsParagraph(selectedSentences)
  
  const processingTime = Date.now() - startTime
  
  return {
    sentences: selectedSentences,
    summary,
    originalSentenceCount: sentences.length,
    summarySentenceCount: selectedSentences.length,
    compressionRatio: selectedSentences.length / sentences.length,
    processingTimeMs: processingTime,
    language,
    scores
  }
}

/**
 * Chunk long text and summarize in parts
 */
export function summarizeLongText(text: string, options: SummarizationOptions = {}): SummaryResult {
  const maxChunkSize = 8000 // Characters per chunk
  
  if (text.length <= maxChunkSize) {
    return summarize(text, options)
  }
  
  const language = options.locale || detectLanguage(text)
  
  // Split into chunks preserving sentence boundaries
  const chunks: string[] = []
  const sentences = segment(text, { locale: language, cleanWhitespace: true })
  
  let currentChunk = ''
  for (const sentence of sentences) {
    const testChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence
    
    if (testChunk.length <= maxChunkSize) {
      currentChunk = testChunk
    } else {
      if (currentChunk) {
        chunks.push(currentChunk)
        currentChunk = sentence
      } else {
        // Single sentence is too long, add it anyway
        chunks.push(sentence)
      }
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk)
  }
  
  // Summarize each chunk
  const chunkSummaries = chunks.map(chunk => 
    summarize(chunk, {
      ...options,
      maxSentences: Math.max(1, Math.floor((options.maxSentences || 10) / chunks.length))
    })
  )
  
  // Combine summaries
  const combinedSentences = chunkSummaries.flatMap(result => result.sentences)
  const combinedText = combinedSentences.join(' ')
  
  // Final summarization of combined summaries
  if (combinedText.length > maxChunkSize || combinedSentences.length > (options.maxSentences || 10)) {
    return summarize(combinedText, options)
  }
  
  // Return combined result
  return {
    sentences: combinedSentences,
    summary: combinedSentences.length > 3 
      ? formatAsBullets(combinedSentences)
      : formatAsParagraph(combinedSentences),
    originalSentenceCount: sentences.length,
    summarySentenceCount: combinedSentences.length,
    compressionRatio: combinedSentences.length / sentences.length,
    processingTimeMs: chunkSummaries.reduce((sum, result) => sum + result.processingTimeMs, 0),
    language,
    scores: chunkSummaries.flatMap(result => result.scores)
  }
}

/**
 * Extract key phrases from text
 */
export function extractKeyPhrases(text: string, language: string = 'en', maxPhrases: number = 10): string[] {
  const sentences = segment(text, { locale: language })
  const allTokens = sentences.flatMap(sentence => tokenize(sentence, language))
  
  // Count term frequency
  const termFreq: { [term: string]: number } = {}
  for (const token of allTokens) {
    termFreq[token] = (termFreq[token] || 0) + 1
  }
  
  // Sort by frequency and return top terms
  return Object.entries(termFreq)
    .sort(([, freqA], [, freqB]) => freqB - freqA)
    .slice(0, maxPhrases)
    .map(([term]) => term)
}

/**
 * Get summary statistics
 */
export interface SummaryStats {
  originalWordCount: number
  summaryWordCount: number
  originalCharCount: number
  summaryCharCount: number
  compressionRatio: number
  avgSentenceLength: number
  readingTimeMinutes: number
}

export function getSummaryStats(originalText: string, summary: string): SummaryStats {
  const originalWords = originalText.trim().split(/\s+/).length
  const summaryWords = summary.trim().split(/\s+/).length
  const avgSentenceLength = summary.split(/[.!?]+/).filter(Boolean).length
  
  return {
    originalWordCount: originalWords,
    summaryWordCount: summaryWords,
    originalCharCount: originalText.length,
    summaryCharCount: summary.length,
    compressionRatio: summaryWords / originalWords,
    avgSentenceLength: summaryWords / Math.max(1, avgSentenceLength),
    readingTimeMinutes: Math.ceil(summaryWords / 200) // ~200 words per minute
  }
}
