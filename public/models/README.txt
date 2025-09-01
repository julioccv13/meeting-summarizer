WHISPER MODEL SETUP INSTRUCTIONS
===================================

This directory should contain Whisper GGML model files for offline transcription.

REQUIRED FILES:
- ggml-tiny.bin      (~39MB)  - Fastest, lower accuracy
- ggml-tiny.en.bin   (~39MB)  - English-only, fastest
- ggml-base.bin      (~74MB)  - Better accuracy  
- ggml-base.en.bin   (~74MB)  - English-only, better accuracy
- ggml-small.bin     (~244MB) - Good accuracy (optional)

DOWNLOAD INSTRUCTIONS:
1. Visit: https://huggingface.co/ggerganov/whisper.cpp/tree/main
2. Download the model files you want (start with ggml-tiny.bin)
3. Place them directly in this /public/models/ directory

ALTERNATIVE DOWNLOAD (using curl):
cd public/models/
curl -L -o ggml-tiny.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin
curl -L -o ggml-base.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin

WHISPER.CPP WASM SETUP:
========================

You'll also need the actual whisper.cpp WebAssembly files. This PWA currently uses a mock implementation.

To integrate real Whisper.cpp WASM:

1. BUILD WHISPER.CPP WASM:
   git clone https://github.com/ggerganov/whisper.cpp
   cd whisper.cpp
   
   # Install Emscripten SDK first
   git clone https://github.com/emscripten-core/emsdk.git
   cd emsdk
   ./emsdk install latest
   ./emsdk activate latest
   source ./emsdk_env.sh
   cd ../whisper.cpp
   
   # Build for web
   make clean
   emcmake make -j whisper.js
   
2. COPY WASM FILES to /public/:
   - whisper.js
   - whisper.wasm
   - whisper.worker.js (if generated)

3. UPDATE WORKER CODE:
   In src/workers/whisper.worker.ts, replace the mock implementation with:
   
   ```typescript
   // Replace createMockWhisperModule() with:
   import Module from '/whisper.js'
   
   async function loadWhisperModule() {
     const WhisperModule = await Module()
     return WhisperModule
   }
   ```

4. VERIFY SETUP:
   - Check browser console for any WASM loading errors
   - Test with a short audio file first
   - iOS Safari may need additional SharedArrayBuffer configuration

PERFORMANCE NOTES:
==================

Model Speed Estimates (approximate, varies by device):
- tiny:     ~30-40x realtime (1min audio = ~1-2sec processing)
- base:     ~15-20x realtime (1min audio = ~3-4sec processing)  
- small:    ~5-8x realtime  (1min audio = ~7-12sec processing)

iOS Safari Considerations:
- Prefers smaller models (tiny/base)
- May need cross-origin isolation for SharedArrayBuffer
- Keep screen on during long transcriptions
- Works best when installed to Home Screen

Storage Requirements:
- Models are cached in IndexedDB after first download
- Check available storage before downloading large models
- Clear old models if storage is limited

TROUBLESHOOTING:
================

1. "Model failed to load":
   - Check file exists in /public/models/
   - Verify file isn't corrupted (compare file size)
   - Check browser console for network errors

2. "WASM module failed to initialize":
   - Ensure whisper.wasm is in /public/
   - Check for CORS issues in browser console
   - Try refreshing the page

3. "SharedArrayBuffer is not defined":
   - This is expected with the current mock implementation
   - For real WASM, you may need to serve with proper headers:
     Cross-Origin-Embedder-Policy: require-corp
     Cross-Origin-Opener-Policy: same-origin

4. Transcription is very slow:
   - Try a smaller model (tiny instead of base/small)
   - Check if running in background/tab is inactive
   - Ensure device has sufficient memory

5. iOS Safari specific issues:
   - Install PWA to Home Screen for best performance
   - Keep screen on during transcription
   - Close other browser tabs to free memory
   - Try reloading if worker becomes unresponsive

DEVELOPMENT:
============

The current implementation uses a mock Whisper worker that:
- Simulates model loading and transcription progress
- Returns placeholder transcription text
- Demonstrates the full UI workflow
- Is safe for development and testing

To enable real transcription, follow the WHISPER.CPP WASM SETUP steps above.

For questions or issues:
- Check browser developer console for errors
- Verify all model files are present and correct size
- Test with a short (<30sec) audio file first
