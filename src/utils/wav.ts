/**
 * Convert Float32Array to 16-bit PCM with proper clipping and dithering
 * @param float32 Input Float32Array (values should be in range -1.0 to 1.0)
 * @param addDither Add triangular dithering to reduce quantization noise
 * @returns Int16Array with 16-bit PCM samples
 */
export function floatTo16BitPCM(float32: Float32Array, addDither: boolean = false): Int16Array {
  const out = new Int16Array(float32.length);
  
  for (let i = 0; i < float32.length; i++) {
    let sample = Math.max(-1, Math.min(1, float32[i]));
    
    // Add triangular dithering to reduce quantization noise
    if (addDither) {
      const dither = (Math.random() - Math.random()) * (1 / 32768);
      sample += dither;
      sample = Math.max(-1, Math.min(1, sample));
    }
    
    // Convert to 16-bit integer
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
  }
  
  return out;
}

/**
 * Convert Float32Array to 32-bit float PCM (for high-quality WAV files)
 * @param float32 Input Float32Array
 * @returns Float32Array (copy for consistency)
 */
export function floatTo32BitPCM(float32: Float32Array): Float32Array {
  const out = new Float32Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    out[i] = Math.max(-1, Math.min(1, float32[i]));
  }
  return out;
}

/**
 * Write a WAV file with 16-bit PCM audio data
 * @param mono16k Float32Array containing mono audio at 16kHz
 * @param sampleRate Sample rate (default: 16000)
 * @param addDither Whether to add dithering for better quality
 * @returns Blob containing WAV file data
 */
export function writeWavPCM16(mono16k: Float32Array, sampleRate = 16000, addDither = false): Blob {
  const samples = floatTo16BitPCM(mono16k, addDither);
  return createWavFile(samples.buffer, {
    sampleRate,
    numChannels: 1,
    bitsPerSample: 16,
    isFloat: false
  });
}

/**
 * Write a WAV file with 32-bit float PCM audio data (higher quality)
 * @param mono16k Float32Array containing mono audio at 16kHz
 * @param sampleRate Sample rate (default: 16000)
 * @returns Blob containing WAV file data
 */
export function writeWavPCM32Float(mono16k: Float32Array, sampleRate = 16000): Blob {
  const samples = floatTo32BitPCM(mono16k);
  return createWavFile(samples.buffer, {
    sampleRate,
    numChannels: 1,
    bitsPerSample: 32,
    isFloat: true
  });
}

/**
 * WAV file format configuration
 */
interface WavConfig {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  isFloat: boolean;
}

/**
 * Create a properly formatted WAV file from audio buffer
 * @param audioBuffer ArrayBuffer containing the audio samples
 * @param config WAV file configuration
 * @returns Blob containing complete WAV file
 */
function createWavFile(audioBuffer: ArrayBuffer, config: WavConfig): Blob {
  const { sampleRate, numChannels, bitsPerSample, isFloat } = config;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  
  // WAV header is 44 bytes
  const headerLength = 44;
  const totalLength = headerLength + audioBuffer.byteLength;
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);

  // Helper function to write ASCII strings
  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  let offset = 0;

  // RIFF chunk descriptor
  writeString(offset, 'RIFF'); offset += 4;
  view.setUint32(offset, totalLength - 8, true); offset += 4; // File size - 8
  writeString(offset, 'WAVE'); offset += 4;

  // fmt sub-chunk
  writeString(offset, 'fmt '); offset += 4;
  view.setUint32(offset, 16, true); offset += 4; // PCM chunk size (16 for basic format)
  
  // Audio format (1 = PCM, 3 = IEEE float)
  view.setUint16(offset, isFloat ? 3 : 1, true); offset += 2;
  
  view.setUint16(offset, numChannels, true); offset += 2; // Number of channels
  view.setUint32(offset, sampleRate, true); offset += 4; // Sample rate
  view.setUint32(offset, byteRate, true); offset += 4; // Byte rate
  view.setUint16(offset, blockAlign, true); offset += 2; // Block align
  view.setUint16(offset, bitsPerSample, true); offset += 2; // Bits per sample

  // data sub-chunk
  writeString(offset, 'data'); offset += 4;
  view.setUint32(offset, audioBuffer.byteLength, true); offset += 4; // Data size

  // Copy audio data
  const audioView = new Uint8Array(audioBuffer);
  const targetView = new Uint8Array(buffer, headerLength);
  targetView.set(audioView);

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Create a stereo WAV file from two mono channels
 * @param leftChannel Left channel Float32Array
 * @param rightChannel Right channel Float32Array
 * @param sampleRate Sample rate
 * @param bitsPerSample Bits per sample (16 or 32)
 * @returns Blob containing stereo WAV file
 */
export function writeStereoWav(
  leftChannel: Float32Array, 
  rightChannel: Float32Array, 
  sampleRate = 16000, 
  bitsPerSample = 16
): Blob {
  const length = Math.min(leftChannel.length, rightChannel.length);
  
  if (bitsPerSample === 16) {
    const interleavedSamples = new Int16Array(length * 2);
    const leftPCM = floatTo16BitPCM(leftChannel.slice(0, length));
    const rightPCM = floatTo16BitPCM(rightChannel.slice(0, length));
    
    for (let i = 0; i < length; i++) {
      interleavedSamples[i * 2] = leftPCM[i];
      interleavedSamples[i * 2 + 1] = rightPCM[i];
    }
    
    return createWavFile(interleavedSamples.buffer, {
      sampleRate,
      numChannels: 2,
      bitsPerSample: 16,
      isFloat: false
    });
  } else {
    const interleavedSamples = new Float32Array(length * 2);
    
    for (let i = 0; i < length; i++) {
      interleavedSamples[i * 2] = Math.max(-1, Math.min(1, leftChannel[i]));
      interleavedSamples[i * 2 + 1] = Math.max(-1, Math.min(1, rightChannel[i]));
    }
    
    return createWavFile(interleavedSamples.buffer, {
      sampleRate,
      numChannels: 2,
      bitsPerSample: 32,
      isFloat: true
    });
  }
}

/**
 * Analyze WAV file header information
 * @param arrayBuffer ArrayBuffer containing WAV file data
 * @returns WAV file information or null if invalid
 */
export function analyzeWavFile(arrayBuffer: ArrayBuffer): WavConfig | null {
  if (arrayBuffer.byteLength < 44) return null;
  
  const view = new DataView(arrayBuffer);
  
  // Check RIFF header
  const riff = String.fromCharCode(...new Uint8Array(arrayBuffer, 0, 4));
  const wave = String.fromCharCode(...new Uint8Array(arrayBuffer, 8, 4));
  
  if (riff !== 'RIFF' || wave !== 'WAVE') return null;
  
  const audioFormat = view.getUint16(20, true);
  const numChannels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);
  
  return {
    sampleRate,
    numChannels,
    bitsPerSample,
    isFloat: audioFormat === 3
  };
}
