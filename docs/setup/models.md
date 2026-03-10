# Whisper Models

Place Whisper GGML model files in `public/models/`.

## Recommended files

- `ggml-base-q5_1.bin`
- `ggml-base.bin`
- `ggml-tiny.bin`

The current app detects available model files automatically and only exposes the ones that actually exist in `public/models/`.

## Download

Models can be downloaded from the `whisper.cpp` model repository on Hugging Face:

`https://huggingface.co/ggerganov/whisper.cpp/tree/main`

Example:

```bash
cd public/models
curl -L -o ggml-base.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
```

## Notes

- Smaller models are faster but less accurate.
- Models are cached locally after first use.
- The app currently uses a mock transcription worker unless real WASM runtime assets are added. See `docs/setup/whisper-wasm.md`.
