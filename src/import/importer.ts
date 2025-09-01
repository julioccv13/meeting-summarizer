import { DecodedAudio, ImportedItem, FileValidation, ImportProgress } from '../types'
import { resampleTo16kMono } from '../audio/resampler'
import { storeImportedItem } from '../store/db'

/**
 * Audio/Video file importer with offline decoding capabilities
 * Supports common formats and provides fallback options
 */

// Supported MIME types (may vary by browser)
const SUPPORTED_AUDIO_TYPES = [
  'audio/wav',
  'audio/wave', 
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
  'audio/flac'
]

const SUPPORTED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/avi',
  'video/mov',
  'video/quicktime'
]

const ALL_SUPPORTED_TYPES = [...SUPPORTED_AUDIO_TYPES, ...SUPPORTED_VIDEO_TYPES]

/**
 * Validate if a file can potentially be imported
 */
export function validateFile(file: File): FileValidation {
  // Check file size (limit to 500MB for browser memory constraints)
  const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB
  if (file.size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: `File too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum size is 500MB.`,
      supportedCodec: false
    }
  }

  // Check MIME type
  const isKnownType = ALL_SUPPORTED_TYPES.includes(file.type)
  const isSupportedExtension = /\.(wav|mp3|m4a|aac|ogg|flac|mp4|webm|avi|mov)$/i.test(file.name)

  if (!isKnownType && !isSupportedExtension) {
    return {
      isValid: false,
      error: `Unsupported file type: ${file.type || 'unknown'}. Supported: WAV, MP3, M4A, AAC, OGG, FLAC, MP4, WebM.`,
      supportedCodec: false
    }
  }

  return {
    isValid: true,
    supportedCodec: isKnownType || isSupportedExtension
  }
}

/**
 * Decode audio/video file to PCM using Web Audio API
 */
export async function decodeToPCM(buffer: ArrayBuffer, filename?: string): Promise<DecodedAudio> {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    
    // Attempt to decode with Web Audio API
    const audioBuffer = await audioContext.decodeAudioData(buffer.slice(0))
    
    const sampleRate = audioBuffer.sampleRate
    const channels = audioBuffer.numberOfChannels
    const length = audioBuffer.length
    const durationSec = audioBuffer.duration

    // Extract PCM data
    let pcm: Float32Array

    if (channels === 1) {
      // Already mono
      pcm = audioBuffer.getChannelData(0)
    } else {
      // Mix multiple channels to mono
      pcm = new Float32Array(length)
      for (let i = 0; i < length; i++) {
        let sum = 0
        for (let ch = 0; ch < channels; ch++) {
          sum += audioBuffer.getChannelData(ch)[i]
        }
        pcm[i] = sum / channels
      }
    }

    // Close the audio context to free resources
    await audioContext.close()

    return {
      pcm,
      sampleRate,
      channels,
      durationSec
    }

  } catch (error) {
    console.error('Failed to decode audio with Web Audio API:', error)
    
    // Provide more specific error messages
    let errorMessage = 'Failed to decode audio file'
    
    if (error instanceof DOMException) {
      if (error.name === 'NotSupportedError') {
        errorMessage = `Audio codec not supported in this browser. File: ${filename || 'unknown'}`
      } else if (error.name === 'EncodingError') {
        errorMessage = `Audio file appears to be corrupted or invalid. File: ${filename || 'unknown'}`
      }
    }
    
    throw new Error(errorMessage)
  }
}

/**
 * Process a single file: validate, decode, resample, and optionally store
 */
export async function processFile(
  file: File, 
  store: boolean = true,
  storeOriginal: boolean = false,
  onProgress?: (progress: number) => void
): Promise<ImportedItem> {
  try {
    // Validate file
    onProgress?.(0)
    const validation = validateFile(file)
    if (!validation.isValid) {
      throw new Error(validation.error)
    }

    // Read file as ArrayBuffer
    onProgress?.(10)
    const buffer = await readFileAsArrayBuffer(file)
    
    // Decode to PCM
    onProgress?.(30)
    const decodedAudio = await decodeToPCM(buffer, file.name)
    
    // Resample to 16kHz mono
    onProgress?.(70)
    const mono16k = resampleTo16kMono(decodedAudio.pcm, decodedAudio.sampleRate)
    
    onProgress?.(90)
    
    let meta
    if (store) {
      // Store in IndexedDB
      meta = await storeImportedItem(file, mono16k, decodedAudio, storeOriginal)
    } else {
      // Create temporary metadata without storing
      meta = {
        id: `temp_${Date.now()}`,
        name: file.name,
        size: file.size,
        mimeType: file.type,
        durationSec: decodedAudio.durationSec,
        originalSampleRate: decodedAudio.sampleRate,
        originalChannels: decodedAudio.channels,
        importedAt: new Date()
      }
    }
    
    onProgress?.(100)

    return {
      meta,
      pcm: mono16k,
      originalFile: storeOriginal ? file : undefined
    }

  } catch (error) {
    console.error('Failed to process file:', file.name, error)
    throw error
  }
}

/**
 * Import multiple files with progress tracking
 */
export async function importFiles(
  files: FileList | File[],
  options: {
    storeOriginals?: boolean
    onProgress?: (progress: ImportProgress) => void
    onFileComplete?: (item: ImportedItem, index: number) => void
    onFileError?: (error: Error, file: File, index: number) => void
  } = {}
): Promise<ImportedItem[]> {
  const {
    storeOriginals = false,
    onProgress,
    onFileComplete,
    onFileError
  } = options

  const fileArray = Array.from(files)
  const results: ImportedItem[] = []
  const total = fileArray.length

  onProgress?.({
    total,
    completed: 0,
    current: undefined
  })

  for (let i = 0; i < fileArray.length; i++) {
    const file = fileArray[i]
    
    onProgress?.({
      total,
      completed: i,
      current: file.name
    })

    try {
      const item = await processFile(file, true, storeOriginals, (fileProgress) => {
        // Report individual file progress as part of overall progress
        const overallProgress = (i + fileProgress / 100) / total * 100
        onProgress?.({
          total,
          completed: i,
          current: `${file.name} (${Math.round(fileProgress)}%)`
        })
      })

      results.push(item)
      onFileComplete?.(item, i)

    } catch (error) {
      console.error(`Failed to import file ${file.name}:`, error)
      onFileError?.(error as Error, file, i)
      
      // Continue with other files even if one fails
      continue
    }
  }

  onProgress?.({
    total,
    completed: total,
    current: undefined
  })

  return results
}

/**
 * Helper function to read file as ArrayBuffer
 */
function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to read file as ArrayBuffer'))
      }
    }
    
    reader.onerror = () => {
      reject(new Error(`Failed to read file: ${reader.error}`))
    }
    
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.')
  return parts.length > 1 ? parts.pop()!.toLowerCase() : ''
}

/**
 * Check if browser likely supports a file type
 */
export function isLikelySupportedType(file: File): boolean {
  // Check MIME type
  if (ALL_SUPPORTED_TYPES.includes(file.type)) {
    return true
  }
  
  // Check file extension as fallback
  const ext = getFileExtension(file.name)
  const supportedExtensions = ['wav', 'mp3', 'm4a', 'aac', 'ogg', 'flac', 'mp4', 'webm']
  return supportedExtensions.includes(ext)
}

/**
 * Create a preview/validation summary for files before import
 */
export function validateFiles(files: FileList | File[]): {
  valid: File[]
  invalid: { file: File; reason: string }[]
  totalSize: number
  estimatedProcessingTime: number
} {
  const fileArray = Array.from(files)
  const valid: File[] = []
  const invalid: { file: File; reason: string }[] = []
  let totalSize = 0

  for (const file of fileArray) {
    const validation = validateFile(file)
    
    if (validation.isValid) {
      valid.push(file)
      totalSize += file.size
    } else {
      invalid.push({ file, reason: validation.error || 'Unknown error' })
    }
  }

  // Rough estimate: ~10MB per second processing time
  const estimatedProcessingTime = Math.max(1, Math.round(totalSize / (10 * 1024 * 1024)))

  return {
    valid,
    invalid,
    totalSize,
    estimatedProcessingTime
  }
}