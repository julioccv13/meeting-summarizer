# Whisper WebAssembly Setup

This app can run on-device Whisper transcription using the upstream ggml-org/whisper.cpp WebAssembly build. Follow these steps to produce the WASM artifacts and place them under `public/whisper/`.

## Prerequisites
- Emscripten SDK (emsdk) installed, activated, and the environment sourced.
- CMake and a working compiler toolchain.

## Build Steps
```
# 1) Install emscripten (see https://emscripten.org/docs/getting_started/downloads.html)
#    Then activate and source the environment
#    e.g., on macOS/Linux:
#    git clone https://github.com/emscripten-core/emsdk.git
#    cd emsdk && ./emsdk install latest && ./emsdk activate latest
#    source ./emsdk_env.sh

# 2) Clone whisper.cpp
git clone https://github.com/ggml-org/whisper.cpp
cd whisper.cpp

# 3) (Optional) checkout a known-good commit from 2025Q1+
# git checkout <commit>

# 4) Configure WASM build
mkdir build-wasm && cd build-wasm
emcmake cmake .. -DWHISPER_WASM_SINGLE_FILE=0

# 5) Build
cmake --build . --target whisper.wasm -j

# 6) Copy artifacts into the app
#    The upstream scripts typically place outputs under bin/
#    Copy:
#      bin/whisper.wasm/*            -> <app>/public/whisper/
#      bin/libmain.worker.js (if any)-> <app>/public/whisper/
```

## Notes
- SIMD and threads: Build will enable SIMD. Threading requires SharedArrayBuffer and cross-origin isolation; Safari/iOS often lacks threads so the app falls back to single-thread mode.
- Single-file mode: Make sure to pass `-DWHISPER_WASM_SINGLE_FILE=0` so the build produces a separate `.wasm` file. The app references `whisper/whisper.wasm` directly.
- Service Worker: The app’s SW caches `public/whisper/*` and `.wasm` assets cache-first for offline use.
- Paths: The app loads `${BASE_URL}whisper/whisper.wasm` and (if present) `${BASE_URL}whisper/libmain.worker.js`.

## Verifying
- After copying files to `public/whisper/`, run:
  - `npm run dev` and open the app; the worker will attempt to load the WASM.
  - Watch console for “Loading WASM module” and any errors.
- On Pages: push and deploy; the SW should cache `whisper/` assets on first use.

## Troubleshooting
- If the worker logs that glue isn’t found, ensure `libmain.worker.js` is present (some builds emit it) or adjust `locateFile` to the correct wasm location.
- On Safari/iOS, threads are not available: performance will be lower; the app falls back to single-thread.
- If you see range/OOB errors, confirm the artifacts match the expected layout and that the WASM file is accessible under the correct URL.

