Place Whisper WebAssembly artifacts here.

Expected files (from ggml-org/whisper.cpp WASM build):
- whisper.wasm                (standalone WASM binary)
- libmain.worker.js           (Emscripten JS glue for worker, if emitted)

After building with emscripten, copy these files into this folder.
The app will load them from `${BASE_URL}whisper/`.

Build outline (see docs/WHISPER_WASM_SETUP.md for details):
1) Install emscripten (emsdk), activate, and source the env.
2) git clone https://github.com/ggml-org/whisper.cpp && cd whisper.cpp
3) Optionally: git checkout <known-good-commit>
4) mkdir build-wasm && cd build-wasm
5) emcmake cmake .. -DWHISPER_WASM_SINGLE_FILE=0
6) cmake --build . --target whisper.wasm -j
7) Copy:
   - bin/whisper.wasm/*  -> public/whisper/
   - bin/libmain.worker.js (if present) -> public/whisper/

