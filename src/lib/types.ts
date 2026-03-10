/**
 * Metadata for imported media files
 */
export interface MediaMeta {
  id: string
  name: string
  size: number
  mimeType: string
  durationSec: number
  originalSampleRate: number
  originalChannels: number
  importedAt: Date
}

/**
 * Represents an imported audio/video file with processed PCM data
 */
export interface ImportedItem {
  meta: MediaMeta
  pcm?: Float32Array // 16kHz mono Float32 PCM data
  originalFile?: Blob // Optional: store original file
}

/**
 * Result of audio decoding operation
 */
export interface DecodedAudio {
  pcm: Float32Array
  sampleRate: number
  channels: number
  durationSec: number
}

/**
 * Storage statistics and quota information
 */
export interface StorageInfo {
  usedBytes: number
  availableBytes?: number
  totalItems: number
  pcmItems: number
  originalItems: number
}

/**
 * Import progress information
 */
export interface ImportProgress {
  total: number
  completed: number
  current?: string // Current file being processed
  error?: string
}

/**
 * File validation result
 */
export interface FileValidation {
  isValid: boolean
  error?: string
  supportedCodec: boolean
}