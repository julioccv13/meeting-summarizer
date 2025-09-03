/**
 * Main thread API wrapper for Whisper Worker
 * Provides a clean interface for transcription with progress tracking
 */

import type { TranscribeOptions, Segment } from '../workers/whisper.worker'
import { loadModel, AVAILABLE_MODELS } from './loader'

export type { TranscribeOptions, Segment }

interface TranscriptionProgress {
  progress: number // 0 to 1
  message: string
}

interface TranscriptionResult {
  text: string
  segments: Segment[]
  duration: number // seconds
}

interface TranscriptionCallbacks {
  onProgress?: (progress: TranscriptionProgress) => void
  onSegment?: (segment: Segment) => void
  onError?: (error: Error) => void
}

export class WhisperAPI {
  private worker: Worker | null = null
  private isInitialized = false
  private isTranscribing = false
  private currentCallbacks: TranscriptionCallbacks | null = null
  private initPromise: Promise<void> | null = null

  /**
   * Initialize Whisper with a specific model
   */
  async init(modelName: string = 'tiny', onProgress?: (progress: TranscriptionProgress) => void): Promise<void> {
    // Prevent multiple concurrent initializations
    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = this._init(modelName, onProgress)
    return this.initPromise
  }

  private async _init(modelName: string, onProgress?: (progress: TranscriptionProgress) => void): Promise<void> {
    try {
      // Clean up existing worker
      if (this.worker) {
        this.worker.terminate()
        this.worker = null
        this.isInitialized = false
      }

      onProgress?.({ progress: 0.0, message: 'Loading model...' })

      onProgress?.({ progress: 0.5, message: 'Starting worker...' })

      // Create and configure worker
      this.worker = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), {
        type: 'module'
      })

      // Set up worker message handling
      this.worker.onmessage = this.handleWorkerMessage.bind(this)
      this.worker.onerror = this.handleWorkerError.bind(this)

      onProgress?.({ progress: 0.6, message: 'Initializing Whisper...' })

      // Initialize worker with WASM URL
      const wasmURL = `${import.meta.env.BASE_URL}whisper/whisper.wasm`
      const glueURL = `${import.meta.env.BASE_URL}whisper/libmain.worker.js`
      await this.sendMessageToWorker({ type: 'init', wasmURL, glueURL, preferThreads: true }, (m)=>{
        if (m.type === 'progress') {
          const stage = m.stage === 'Initialize' ? 0.6 : 0.7
          const p = typeof m.value === 'number' ? m.value/100 : 0
          onProgress?.({ progress: stage + p*0.2, message: m.note || m.stage })
        }
      })

      // Load model inside worker by URL (respect BASE_URL)
      const modelInfo = AVAILABLE_MODELS[modelName]
      if (!modelInfo) throw new Error(`Unknown model: ${modelName}`)
      await this.sendMessageToWorker({ type: 'loadModel', modelId: modelName, modelURL: modelInfo.url }, (m)=>{
        if (m.type === 'progress') {
          const p = typeof m.value === 'number' ? m.value/100 : 0
          onProgress?.({ progress: 0.8 + p*0.2, message: m.note || 'Loading model…' })
        }
      })

      this.isInitialized = true
      onProgress?.({ progress: 1.0, message: 'Ready for transcription' })

    } catch (error) {
      this.initPromise = null
      throw error
    }
  }

  /**
   * Transcribe audio PCM data
   */
  async transcribe(
    pcm: Float32Array, 
    options: TranscribeOptions = {},
    callbacks: TranscriptionCallbacks = {}
  ): Promise<TranscriptionResult> {
    if (!this.isInitialized || !this.worker) {
      throw new Error('Whisper not initialized. Call init() first.')
    }

    if (this.isTranscribing) {
      throw new Error('Already transcribing. Cancel current transcription first.')
    }

    this.isTranscribing = true
    this.currentCallbacks = callbacks

    try {
      const startTime = Date.now()
      
      callbacks.onProgress?.({ progress: 0.0, message: 'Starting transcription...' })

      const id = `job_${Date.now()}`
      const result = await this.sendMessageToWorker(
        { type: 'transcribe', id, pcm, sampleRate: 16000, opts: {} },
        (m)=>{
          if (m.type === 'progress') callbacks.onProgress?.({ progress: (m.value ?? 0)/100, message: m.stage })
          if (m.type === 'language' && m.code) callbacks.onProgress?.({ progress: 0.5, message: `Language: ${m.code}` })
        }
      )

      const duration = (Date.now() - startTime) / 1000

      return { text: result.text, segments: result.segments || [], duration }

    } finally {
      this.isTranscribing = false
      this.currentCallbacks = null
    }
  }

  /**
   * Cancel current transcription
   */
  async cancel(): Promise<void> {
    if (!this.worker || !this.isTranscribing) {
      return
    }

    this.worker.postMessage({ type: 'cancel' })
    this.isTranscribing = false
    this.currentCallbacks = null
  }

  /**
   * Check if Whisper is initialized and ready
   */
  get ready(): boolean {
    return this.isInitialized && !!this.worker
  }

  /**
   * Check if currently transcribing
   */
  get busy(): boolean {
    return this.isTranscribing
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    
    this.isInitialized = false
    this.isTranscribing = false
    this.currentCallbacks = null
    this.initPromise = null
  }

  /**
   * Send message to worker and wait for response
   */
  private sendMessageToWorker(
    message: any, 
    progressHandler?: (message: any) => void
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not available'))
        return
      }

      const handleMessage = (event: MessageEvent) => {
        const { type, ...data } = event.data

        switch (type) {
          case 'modelLoaded':
            this.worker!.removeEventListener('message', handleMessage)
            resolve({ type: 'modelLoaded' })
            break

          case 'result':
            this.worker!.removeEventListener('message', handleMessage)
            resolve({ text: data.text, segments: data.segments })
            break

          case 'error':
            this.worker!.removeEventListener('message', handleMessage)
            reject(new Error(data.message))
            break

          case 'progress':
          case 'language':
            progressHandler?.(event.data)
            break

          default:
            console.warn('Unknown worker message type:', type)
        }
      }

      this.worker.addEventListener('message', handleMessage)
      this.worker.postMessage(message)

      // Timeout for long operations
      setTimeout(() => {
        this.worker?.removeEventListener('message', handleMessage)
        reject(new Error('Worker operation timeout'))
      }, 300000) // 5 minutes timeout
    })
  }

  /**
   * Handle worker messages during transcription
   */
  private handleTranscriptionMessage(message: any): void {
    const { type, ...data } = message

    switch (type) {
      case 'status':
        this.currentCallbacks?.onProgress?.({
          progress: data.progress || 0,
          message: data.message || ''
        })
        break

      case 'segment':
        this.currentCallbacks?.onSegment?.({
          text: data.text,
          start: data.start,
          end: data.end
        })
        break
    }
  }

  /**
   * Handle worker messages (general)
   */
  private handleWorkerMessage(event: MessageEvent): void {
    // This handles messages not caught by sendMessageToWorker
    const { type, ...data } = event.data
    
    if (type === 'error') {
      console.error('Worker error:', data.message)
      this.currentCallbacks?.onError?.(new Error(data.message))
    }
  }

  /**
   * Handle worker errors
   */
  private handleWorkerError(error: ErrorEvent): void {
    console.error('Worker error:', error)
    this.currentCallbacks?.onError?.(new Error(`Worker error: ${error.message}`))
  }
}

// Global instance for easy access
let globalWhisperAPI: WhisperAPI | null = null

/**
 * Get or create the global Whisper API instance
 */
export function getWhisperAPI(): WhisperAPI {
  if (!globalWhisperAPI) {
    globalWhisperAPI = new WhisperAPI()
  }
  return globalWhisperAPI
}

/**
 * Initialize Whisper with default model
 */
export async function initWhisper(
  modelName: string = 'tiny',
  onProgress?: (progress: TranscriptionProgress) => void
): Promise<WhisperAPI> {
  const api = getWhisperAPI()
  await api.init(modelName, onProgress)
  return api
}

/**
 * Quick transcription function with default options
 */
export async function transcribeAudio(
  pcm: Float32Array,
  options: TranscribeOptions & TranscriptionCallbacks = {}
): Promise<TranscriptionResult> {
  const api = getWhisperAPI()
  
  if (!api.ready) {
    throw new Error('Whisper not initialized. Call initWhisper() first.')
  }

  const { onProgress, onSegment, onError, ...transcribeOptions } = options

  return api.transcribe(pcm, transcribeOptions, { onProgress, onSegment, onError })
}

/**
 * Utility to format transcription segments as SRT subtitles
 */
export function formatAsSRT(segments: Segment[]): string {
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
 * Utility to estimate transcription time
 */
export function estimateTranscriptionTime(audioLengthSeconds: number, modelName: string = 'tiny'): number {
  // Rough estimates based on model performance
  const speedMultipliers: Record<string, number> = {
    'tiny': 30,      // ~30x realtime
    'tiny.en': 35,   // ~35x realtime  
    'base': 15,      // ~15x realtime
    'base.en': 18,   // ~18x realtime
    'small': 6       // ~6x realtime
  }

  const multiplier = speedMultipliers[modelName] || 10
  return Math.max(1, audioLengthSeconds / multiplier)
}
