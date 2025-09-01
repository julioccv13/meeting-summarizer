import { writeWavPCM16 } from '../utils/wav'
import { resampleTo16kMono, channelMixToMono } from './resampler'

export interface RecorderResult {
  float32Mono16k: Float32Array
  wavBlob: Blob
  durationSec: number
}

export interface RecorderOptions {
  onLevel?: (level: number) => void
  onTime?: (seconds: number) => void
  onError?: (error: Error) => void
}

export interface RecorderEvents {
  onLevel?: (level: number) => void
  onTime?: (seconds: number) => void
  onError?: (error: Error) => void
}

export class RecorderHandle {
  private stream?: MediaStream
  private mediaRecorder?: MediaRecorder
  private audioContext?: AudioContext
  private analyser?: AnalyserNode
  private chunks: Blob[] = []
  private startTime = 0
  private levelIntervalId?: number
  private timeIntervalId?: number
  private events: RecorderEvents

  constructor(events: RecorderEvents = {}) {
    this.events = events
  }

  async start() {
    try {
      // Request microphone access (requires user gesture on iOS)
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100, // Let browser choose, we'll resample later
        } 
      })
      
      this.chunks = []
      this.startTime = Date.now()

      // Set up audio analysis for level meter
      this.setupAudioAnalysis()

      // Try MediaRecorder first (primary strategy)
      if ('MediaRecorder' in window) {
        await this.startMediaRecorder()
      } else {
        // Fallback: AudioWorklet/ScriptProcessor for direct PCM access
        await this.startDirectPCMCapture()
      }

      // Start timing updates
      this.startTimerUpdates()

    } catch (error) {
      this.cleanup()
      const err = error instanceof Error ? error : new Error('Failed to start recording')
      this.events.onError?.(err)
      throw err
    }
  }

  private async startMediaRecorder() {
    if (!this.stream) throw new Error('No stream available')

    // Try different MIME types for better iOS Safari compatibility
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/aac',
      '' // Let browser choose
    ]

    let selectedMimeType = ''
    for (const mimeType of mimeTypes) {
      if (!mimeType || MediaRecorder.isTypeSupported(mimeType)) {
        selectedMimeType = mimeType
        break
      }
    }

    this.mediaRecorder = new MediaRecorder(this.stream, { 
      mimeType: selectedMimeType 
    })

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data)
      }
    }

    this.mediaRecorder.onerror = (event) => {
      const error = new Error('MediaRecorder error: ' + (event as any).error)
      this.events.onError?.(error)
    }

    // Start recording with 1 second chunks
    this.mediaRecorder.start(1000)
  }

  private async startDirectPCMCapture() {
    // Fallback implementation using AudioWorklet or ScriptProcessor
    // This would be more complex and handle cases where MediaRecorder doesn't work
    throw new Error('Direct PCM capture fallback not yet implemented')
  }

  private setupAudioAnalysis() {
    if (!this.stream) return

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const source = this.audioContext.createMediaStreamSource(this.stream)
      this.analyser = this.audioContext.createAnalyser()
      
      this.analyser.fftSize = 256
      source.connect(this.analyser)

      // Start level monitoring
      this.startLevelMonitoring()
    } catch (error) {
      console.warn('Could not set up audio analysis:', error)
    }
  }

  private startLevelMonitoring() {
    if (!this.analyser) return

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount)
    
    const updateLevel = () => {
      if (!this.analyser) return

      this.analyser.getByteFrequencyData(dataArray)
      
      // Calculate RMS level
      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i]
      }
      const rms = Math.sqrt(sum / dataArray.length) / 255
      
      this.events.onLevel?.(rms)
    }

    this.levelIntervalId = window.setInterval(updateLevel, 100) // Update 10 times per second
  }

  private startTimerUpdates() {
    this.timeIntervalId = window.setInterval(() => {
      const elapsed = (Date.now() - this.startTime) / 1000
      this.events.onTime?.(elapsed)
    }, 100) // Update 10 times per second
  }

  async stop(): Promise<RecorderResult> {
    if (!this.stream) {
      throw new Error('Not recording')
    }

    const durationSec = (Date.now() - this.startTime) / 1000

    try {
      // Stop MediaRecorder and wait for final data
      await new Promise<void>((resolve, reject) => {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
          const timeoutId = setTimeout(() => {
            reject(new Error('MediaRecorder stop timeout'))
          }, 5000)

          this.mediaRecorder.onstop = () => {
            clearTimeout(timeoutId)
            resolve()
          }
          this.mediaRecorder.stop()
        } else {
          resolve()
        }
      })

      // Clean up resources
      this.cleanup()

      // Process the recorded audio
      const blob = new Blob(this.chunks, { type: 'audio/webm' })
      const audioBuffer = await this.decodeAudioData(blob)
      
      // Convert to mono Float32Array
      const mono = this.extractMono(audioBuffer)
      
      // Resample to 16kHz
      const mono16k = resampleTo16kMono(mono, audioBuffer.sampleRate)
      
      // Create WAV blob for download
      const wavBlob = writeWavPCM16(mono16k, 16000)

      return { 
        float32Mono16k: mono16k, 
        wavBlob, 
        durationSec 
      }

    } catch (error) {
      this.cleanup()
      const err = error instanceof Error ? error : new Error('Failed to stop recording')
      this.events.onError?.(err)
      throw err
    }
  }

  private async decodeAudioData(blob: Blob): Promise<AudioBuffer> {
    const arrayBuffer = await blob.arrayBuffer()
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    
    try {
      return await audioContext.decodeAudioData(arrayBuffer.slice(0))
    } catch (error) {
      throw new Error('Failed to decode audio data: ' + (error as Error).message)
    }
  }

  private extractMono(audioBuffer: AudioBuffer): Float32Array {
    const channels = audioBuffer.numberOfChannels
    const length = audioBuffer.length

    if (channels === 1) {
      return audioBuffer.getChannelData(0)
    }

    // Mix multiple channels to mono by averaging
    const mono = new Float32Array(length)
    for (let i = 0; i < length; i++) {
      let sum = 0
      for (let c = 0; c < channels; c++) {
        sum += audioBuffer.getChannelData(c)[i]
      }
      mono[i] = sum / channels
    }
    
    return mono
  }

  private cleanup() {
    // Clear intervals
    if (this.levelIntervalId) {
      clearInterval(this.levelIntervalId)
      this.levelIntervalId = undefined
    }
    
    if (this.timeIntervalId) {
      clearInterval(this.timeIntervalId)
      this.timeIntervalId = undefined
    }

    // Stop all tracks
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = undefined
    }

    // Close audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close()
      this.audioContext = undefined
    }

    this.analyser = undefined
    this.mediaRecorder = undefined
  }
}

export async function start(options: RecorderOptions = {}): Promise<RecorderHandle> {
  const handle = new RecorderHandle(options)
  await handle.start()
  return handle
}
