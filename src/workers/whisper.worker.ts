/**
 * Whisper.cpp WebAssembly Worker for offline transcription
 * 
 * Message Protocol:
 * From main thread:
 *   - { type: 'init', modelName: string, modelData: ArrayBuffer }
 *   - { type: 'transcribe', pcm: Float32Array, options: TranscribeOptions }
 *   - { type: 'cancel' }
 * 
 * To main thread:
 *   - { type: 'ready' }
 *   - { type: 'status', progress: number, message: string }
 *   - { type: 'segment', text: string, start: number, end: number }
 *   - { type: 'done', text: string, segments: Segment[] }
 *   - { type: 'error', message: string }
 */

interface TranscribeOptions {
  language?: string // 'auto', 'en', 'es', etc.
  temperature?: number // 0.0 to 1.0
  maxTokens?: number
  wordTimestamps?: boolean
  translate?: boolean // translate to English
}

interface Segment {
  text: string
  start: number // seconds
  end: number // seconds
  tokens?: any[]
}

interface WhisperContext {
  model: any
  isReady: boolean
  isTranscribing: boolean
  shouldCancel: boolean
}

let whisperContext: WhisperContext = {
  model: null,
  isReady: false,
  isTranscribing: false,
  shouldCancel: false
}

// Import Whisper WASM module (this would be the actual whisper.cpp WASM build)
// For now, we'll simulate the API structure that whisper.cpp WASM typically provides
let WhisperModule: any = null

/**
 * Initialize the Whisper WASM module and load model
 */
async function initializeWhisper(modelName: string, modelData: ArrayBuffer): Promise<void> {
  try {
    postMessage({ type: 'status', progress: 0.1, message: 'Loading WASM module...' })

    // In a real implementation, you would load the whisper.cpp WASM module here
    // For example: WhisperModule = await import('/whisper.js')
    // For now, we'll create a mock implementation
    
    if (!WhisperModule) {
      // Simulate loading time
      await new Promise(resolve => setTimeout(resolve, 500))
      WhisperModule = createMockWhisperModule()
    }

    postMessage({ type: 'status', progress: 0.3, message: 'WASM module loaded' })

    // Initialize the module
    await WhisperModule.ready

    postMessage({ type: 'status', progress: 0.5, message: 'Loading model...' })

    // Load the model from the ArrayBuffer
    const modelBuffer = WhisperModule._malloc(modelData.byteLength)
    WhisperModule.HEAPU8.set(new Uint8Array(modelData), modelBuffer)

    // Initialize Whisper context with the model
    const ctx = WhisperModule._whisper_init_from_buffer(modelBuffer, modelData.byteLength)
    
    if (!ctx) {
      throw new Error('Failed to initialize Whisper context')
    }

    whisperContext.model = ctx
    whisperContext.isReady = true

    // Free the temporary buffer
    WhisperModule._free(modelBuffer)

    postMessage({ type: 'status', progress: 1.0, message: 'Model loaded successfully' })
    postMessage({ type: 'ready' })

  } catch (error) {
    console.error('Failed to initialize Whisper:', error)
    postMessage({ 
      type: 'error', 
      message: `Failed to initialize: ${error instanceof Error ? error.message : 'Unknown error'}` 
    })
  }
}

/**
 * Transcribe audio PCM data
 */
async function transcribeAudio(pcm: Float32Array, options: TranscribeOptions = {}): Promise<void> {
  if (!whisperContext.isReady || !whisperContext.model) {
    postMessage({ type: 'error', message: 'Whisper not initialized' })
    return
  }

  if (whisperContext.isTranscribing) {
    postMessage({ type: 'error', message: 'Already transcribing' })
    return
  }

  try {
    whisperContext.isTranscribing = true
    whisperContext.shouldCancel = false

    postMessage({ type: 'status', progress: 0.0, message: 'Preparing audio...' })

    // Default options
    const {
      language = 'auto',
      temperature = 0.0,
      maxTokens = 0,
      wordTimestamps = true,
      translate = false
    } = options

    // Allocate memory for PCM data
    const pcmBuffer = WhisperModule._malloc(pcm.length * 4) // 4 bytes per float32
    WhisperModule.HEAPF32.set(pcm, pcmBuffer / 4)

    postMessage({ type: 'status', progress: 0.1, message: 'Starting transcription...' })

    // Set up whisper parameters (mock structure)
    const params = {
      language: language === 'auto' ? 'auto' : language,
      temperature: temperature,
      max_tokens: maxTokens,
      word_timestamps: wordTimestamps,
      translate: translate
    }

    // Run transcription (this is where the real whisper.cpp WASM would be called)
    const result = await runWhisperTranscription(
      whisperContext.model, 
      pcmBuffer, 
      pcm.length, 
      params
    )

    // Free the PCM buffer
    WhisperModule._free(pcmBuffer)

    whisperContext.isTranscribing = false

    if (whisperContext.shouldCancel) {
      postMessage({ type: 'status', progress: 0, message: 'Transcription cancelled' })
      return
    }

    postMessage({ 
      type: 'done', 
      text: result.text,
      segments: result.segments 
    })

  } catch (error) {
    console.error('Transcription failed:', error)
    whisperContext.isTranscribing = false
    postMessage({ 
      type: 'error', 
      message: `Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
    })
  }
}

/**
 * Mock Whisper transcription (replace with real whisper.cpp calls)
 */
async function runWhisperTranscription(
  ctx: any, 
  pcmBuffer: number, 
  pcmLength: number, 
  params: any
): Promise<{ text: string; segments: Segment[] }> {
  // This is a mock implementation - in reality this would call whisper.cpp WASM functions
  
  // Simulate processing time based on audio length
  const durationSeconds = pcmLength / 16000 // 16kHz sample rate
  const processingTime = Math.max(500, durationSeconds * 100) // Simulate ~10x realtime

  // Report progress periodically
  const progressInterval = setInterval(() => {
    if (!whisperContext.shouldCancel) {
      const progress = Math.min(0.9, Math.random() * 0.1 + 0.5)
      postMessage({ 
        type: 'status', 
        progress, 
        message: 'Processing audio...' 
      })
    }
  }, 200)

  await new Promise(resolve => setTimeout(resolve, processingTime))
  clearInterval(progressInterval)

  if (whisperContext.shouldCancel) {
    throw new Error('Transcription cancelled')
  }

  // Mock result - in reality this would come from whisper.cpp
  const mockText = `This is a mock transcription result for ${durationSeconds.toFixed(1)} seconds of audio. In a real implementation, this would be the actual transcription from Whisper.cpp WASM.`
  
  const mockSegments: Segment[] = [
    { text: 'This is a mock transcription result', start: 0.0, end: 2.0 },
    { text: `for ${durationSeconds.toFixed(1)} seconds of audio.`, start: 2.0, end: 4.0 },
    { text: 'In a real implementation, this would be', start: 4.0, end: 6.0 },
    { text: 'the actual transcription from Whisper.cpp WASM.', start: 6.0, end: Math.max(8.0, durationSeconds) }
  ]

  return {
    text: mockText,
    segments: mockSegments
  }
}

/**
 * Create mock Whisper module (replace with real whisper.cpp WASM import)
 */
function createMockWhisperModule(): any {
  return {
    ready: Promise.resolve(),
    _malloc: (size: number) => size, // Mock malloc
    _free: (ptr: number) => {}, // Mock free
    HEAPU8: new Uint8Array(1024 * 1024), // Mock heap
    HEAPF32: new Float32Array(256 * 1024), // Mock float heap
    _whisper_init_from_buffer: (buffer: number, size: number) => ({ id: 'mock_context' }), // Mock init
  }
}

/**
 * Cancel current transcription
 */
function cancelTranscription(): void {
  if (whisperContext.isTranscribing) {
    whisperContext.shouldCancel = true
    postMessage({ type: 'status', progress: 0, message: 'Cancelling...' })
  }
}

// Handle messages from main thread
self.onmessage = async (event: MessageEvent) => {
  const { type, ...data } = event.data

  try {
    switch (type) {
      case 'init':
        await initializeWhisper(data.modelName, data.modelData)
        break

      case 'transcribe':
        await transcribeAudio(data.pcm, data.options)
        break

      case 'cancel':
        cancelTranscription()
        break

      default:
        postMessage({ 
          type: 'error', 
          message: `Unknown message type: ${type}` 
        })
    }
  } catch (error) {
    console.error('Worker error:', error)
    postMessage({ 
      type: 'error', 
      message: `Worker error: ${error instanceof Error ? error.message : 'Unknown error'}` 
    })
  }
}

// Handle worker errors
self.onerror = (error) => {
  console.error('Worker global error:', error)
  postMessage({ 
    type: 'error', 
    message: `Worker global error: ${error.message}` 
  })
}

// Export type for main thread
export type { TranscribeOptions, Segment }
