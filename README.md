# Meeting Summarizer

Offline-first PWA to record or import meetings, transcribe them locally, and generate summaries in the browser.

## What This Project Is

Meeting Summarizer is a browser-first application intended to process meeting audio without depending on a backend for the main workflow. The current product direction is:

- import or record meeting audio in the browser
- transcribe it locally
- generate a concise summary
- persist transcripts and summaries on-device
- work as an installable PWA, including offline support

Today, the app already covers the full UI flow and local persistence flow. The transcription runtime is still using a mock worker, so the product is structurally complete but not yet complete in transcription accuracy/runtime fidelity.

## Current Status

- App structure reorganized by domain under `src/features/` and shared modules under `src/lib/`.
- Main active service worker is `public/sw.js`.
- `vite build` passes.
- `tsc --noEmit` passes for the active app code.
- Import, transcript display, summary generation, storage/history views, settings, and export flows are wired.
- The Whisper runtime is still mocked in `src/lib/workers/whisper.worker.ts`.

## What Has Been Done Recently

- Reorganized the repository so code, runtime assets, and docs are clearly separated.
- Moved technical documentation out of `public/` and into `docs/`.
- Fixed a production build blocker in the NLP summarization code.
- Fixed the transcription panel so it reflects the currently working flow instead of exposing a broken option.
- Connected transcript segments correctly to the transcript view and exports.
- Fixed storage/history indexing issues that could break list ordering and retrieval.
- Cleaned up React/TypeScript inconsistencies in active code paths.

## What We Are Working On Now

- Replace the mock Whisper worker with a real `whisper.cpp` WASM integration.
- Validate the app end-to-end in a real browser environment once Playwright/browser dependencies are available outside the current snap limitation.
- Improve UX, accessibility, and polish now that the codebase structure is stable.

## Repo Map

- `src/app/`: app shell, error boundary, shared styles.
- `src/features/`: UI and feature-specific logic grouped by product area.
- `src/lib/`: shared technical modules like storage, whisper, NLP, PWA helpers, and utilities.
- `public/`: runtime assets served as-is, including PWA files, models, icons, and whisper runtime artifacts.
- `docs/project/`: project-level overview and product context.
- `docs/setup/`: setup notes for models and whisper WASM/runtime assets.
- `public/sw.js`: the service worker currently used by the app.

## Main commands

```bash
PATH=/home/julio/.local/bin:$PATH npm install
PATH=/home/julio/.local/bin:$PATH npm run dev
PATH=/home/julio/.local/bin:$PATH npx tsc --noEmit
PATH=/home/julio/.local/bin:$PATH BASE_URL="/meeting-summarizer/" npm run build
PATH=/home/julio/.local/bin:$PATH npm run preview
```

## GitHub Pages

Build for the project site with:

```bash
PATH=/home/julio/.local/bin:$PATH BASE_URL="/meeting-summarizer/" npm run build
```

Live URL:

`https://julioccv13.github.io/meeting-summarizer/`

## Docs

- `docs/project/overview.md`
- `docs/project/status.md`
- `docs/setup/models.md`
- `docs/setup/whisper-wasm.md`
- `docs/setup/whisper-runtime-assets.md`
