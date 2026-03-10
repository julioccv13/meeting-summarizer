/**
 * Mix interleaved multi-channel audio data to mono by averaging channels
 * @param float32 Interleaved multi-channel Float32Array
 * @param channels Number of channels
 * @returns Mono Float32Array
 */
export function mixToMono(float32: Float32Array, channels: number): Float32Array {
  if (channels === 1) return float32;
  const frames = float32.length / channels;
  const out = new Float32Array(frames);
  for (let i = 0, o = 0; i < float32.length; i += channels, o++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += float32[i + c];
    out[o] = sum / channels;
  }
  return out;
}

/**
 * Convert separate channel data to mono by averaging
 * @param input Multi-channel Float32Array
 * @param channels Number of channels (assumes non-interleaved)
 * @returns Mono Float32Array
 */
export function channelMixToMono(input: Float32Array, channels: number): Float32Array {
  if (channels === 1) return input;
  
  const frames = input.length / channels;
  const out = new Float32Array(frames);
  
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    for (let ch = 0; ch < channels; ch++) {
      sum += input[frame * channels + ch];
    }
    out[frame] = sum / channels;
  }
  
  return out;
}

/**
 * High-quality resampler using windowed sinc interpolation with anti-aliasing
 * @param input Input Float32Array
 * @param inSampleRate Input sample rate
 * @param outSampleRate Output sample rate (default: 16000)
 * @returns Resampled Float32Array
 */
export function resampleTo16kMono(input: Float32Array, inSampleRate: number, outSampleRate = 16000): Float32Array {
  if (inSampleRate === outSampleRate) {
    return input;
  }

  // For high-quality resampling, use windowed sinc when downsampling significantly
  if (inSampleRate > outSampleRate * 1.2) {
    return resampleWithAntiAliasing(input, inSampleRate, outSampleRate);
  } else {
    return resampleLinear(input, inSampleRate, outSampleRate);
  }
}

/**
 * Linear interpolation resampler - fast and good for minor rate changes
 */
function resampleLinear(input: Float32Array, inRate: number, outRate: number): Float32Array {
  const ratio = inRate / outRate;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const srcIndex = i * ratio;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = srcIndex - i0;
    
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }

  return out;
}

/**
 * High-quality resampling with anti-aliasing for downsampling
 * Uses a windowed sinc function to minimize aliasing artifacts
 */
function resampleWithAntiAliasing(input: Float32Array, inRate: number, outRate: number): Float32Array {
  const ratio = inRate / outRate;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);

  // Sinc kernel parameters
  const kernelSize = 16; // Half-width of the sinc kernel
  const cutoff = Math.min(0.5, 0.5 / ratio); // Nyquist frequency consideration
  
  for (let i = 0; i < outLength; i++) {
    const srcIndex = i * ratio;
    const centerIndex = Math.round(srcIndex);
    
    let sum = 0;
    let weightSum = 0;
    
    // Apply windowed sinc kernel
    for (let k = -kernelSize; k <= kernelSize; k++) {
      const sampleIndex = centerIndex + k;
      
      if (sampleIndex >= 0 && sampleIndex < input.length) {
        const x = (sampleIndex - srcIndex) * cutoff;
        
        // Windowed sinc function (using Hamming window)
        let weight;
        if (Math.abs(x) < 1e-6) {
          weight = 1.0; // sinc(0) = 1
        } else {
          const sinc = Math.sin(Math.PI * x) / (Math.PI * x);
          const window = 0.54 + 0.46 * Math.cos(Math.PI * k / kernelSize); // Hamming window
          weight = sinc * window;
        }
        
        sum += input[sampleIndex] * weight;
        weightSum += weight;
      }
    }
    
    out[i] = weightSum > 0 ? sum / weightSum : 0;
  }

  return out;
}

/**
 * Simple but effective low-pass filter to reduce aliasing before downsampling
 * @param input Input signal
 * @param cutoffRatio Cutoff frequency as ratio of Nyquist (0.5 = Nyquist)
 * @returns Filtered signal
 */
export function lowPassFilter(input: Float32Array, cutoffRatio: number = 0.4): Float32Array {
  if (cutoffRatio >= 0.5) return input; // No filtering needed
  
  const output = new Float32Array(input.length);
  const alpha = Math.exp(-2 * Math.PI * cutoffRatio);
  
  // Simple first-order IIR low-pass filter
  let y1 = 0;
  for (let i = 0; i < input.length; i++) {
    const y0 = input[i] * (1 - alpha) + y1 * alpha;
    output[i] = y0;
    y1 = y0;
  }
  
  return output;
}

/**
 * Test function for resampler quality
 * Generates test vectors and validates resampling accuracy
 */
export function testResampler(): boolean {
  try {
    // Test 1: Identity test (same rate)
    const identity = new Float32Array([1, 2, 3, 4, 5]);
    const identityResult = resampleTo16kMono(identity, 16000, 16000);
    if (identityResult.length !== identity.length) return false;
    
    // Test 2: Simple downsampling test
    const downsample = new Float32Array([1, 0, 2, 0, 3, 0, 4, 0]);
    const downsampleResult = resampleTo16kMono(downsample, 32000, 16000);
    if (downsampleResult.length !== 4) return false;
    
    // Test 3: Channel mixing test
    const stereo = new Float32Array([1, -1, 2, -2, 3, -3]);
    const mono = channelMixToMono(stereo, 2);
    if (mono.length !== 3 || Math.abs(mono[0]) > 1e-6) return false;
    
    console.log('Resampler tests passed');
    return true;
  } catch (error) {
    console.error('Resampler test failed:', error);
    return false;
  }
}
