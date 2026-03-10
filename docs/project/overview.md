# Meeting Summarizer — Project Overview

Last updated: 2026-03-10

## Summary
Meeting Summarizer is an offline-first Progressive Web App (PWA) to record or import audio, transcribe it locally, and generate concise summaries. It is built with Vite + React, uses a manual Service Worker for caching/offline, and persists data in IndexedDB. The app is designed to be hosted under a GitHub Pages subpath.

The project should be understood in two layers:

- Product layer: an installable, browser-based meeting transcription and summarization tool.
- Technical layer: a stable frontend shell and local data flow that is waiting for final integration of real Whisper WASM execution.

## Current State In One Page

- The app shell is active and buildable.
- The repository has already been reorganized to be easier to maintain.
- Main screens and storage flows are implemented.
- Summary generation and history/export flows are implemented.
- The active service worker is `public/sw.js`.
- Real Whisper inference is not finished yet; the current worker simulates transcription behavior.

## Key Features
- Recording: Capture microphone audio in the browser with a live level meter and elapsed time.
- Import: Add audio/video files for offline processing.
- Transcription: Initialize a model and transcribe with progress; transcripts are auto‑saved.
- Summarization: Automatically generates a summary after transcription; configurable summary options.
- Storage & Export: Manage stored items; export transcripts as TXT/SRT/JSON and summaries as TXT/JSON.
- PWA: Installable, offline capable, iOS/Android friendly, with custom service worker.
- GitHub Pages: Fully subpath‑aware paths for assets, service worker, and manifest.

## What Is Real Today vs What Is Still Scaffolded

### Real and active now

- UI navigation and screen structure
- Import flow
- Transcript and summary persistence
- Transcript and summary history
- Export logic
- Settings and model detection
- Active service worker registration
- Build and typecheck of active code

### Still scaffolded or pending final integration

- Real Whisper on-device transcription runtime
- Full browser automation validation in this environment
- Final production polish and accessibility pass

## Top-Level Structure
- `index.html` — Root HTML entry used by Vite.
- `public/`
  - `manifest.webmanifest` — PWA manifest; `start_url` and `scope` set to `.` for Pages.
  - `icons/` — Install icons.
  - `models/` — Whisper model binaries served directly.
  - `whisper/` — Runtime WASM/glue assets served directly.
  - `sw.js` — Manual, BASE-aware service worker currently used by the app.
- `src/`
  - `main.tsx` — App bootstrap, ErrorBoundary, SW registration.
  - `app/` — App shell and global styles.
  - `features/` — Product areas grouped by domain:
    - `import/`
    - `recording/`
    - `transcription/`
    - `transcript/`
    - `summary/`
    - `settings/`
    - `storage/`
  - `lib/` — Shared technical modules:
    - `audio/`
    - `nlp/`
    - `pwa/`
    - `store/`
    - `utils/`
    - `whisper/`
    - `workers/`
    - `types.ts`
  - `sw-register.ts` — Registers `public/sw.js` using the Vite base path.
- `docs/`
  - `project/` — product and architecture notes.
  - `setup/` — environment and runtime setup notes.

## How The Current User Flow Works

1. The user records or imports media.
2. Imported media is normalized and stored locally.
3. The user initializes the transcription path from the UI.
4. The transcription worker returns transcript text and segments.
5. The app saves transcript data in IndexedDB.
6. The app generates a summary from transcript text.
7. The app saves the summary and exposes both items in history/export views.

## Tabs & UX Flow
- Work tab
  1) Record — Capture audio, then auto‑initialize, transcribe, and save.
  2) Import — Import files for processing.
  3) Transcribe — Explicit init/transcribe for imported audio.
  4) Transcript — View/search current transcript.
  5) Summary — View auto‑generated summary.
  - A progress card shows stages (Initialize → Transcribe → Save → Summarize → Save) with a percentage bar.

- Library & Export tab
  - Storage Manager — Storage overview + clear data and SW caches.
  - Transcript History — Search, bulk actions, export (TXT/SRT/JSON).
  - Summary History — Search and export (TXT/JSON).

- Settings tab
  - Default Model — Only shows models actually present under `public/models/`.
  - Summary Options — Max sentences, max characters, deduplicate near duplicates.
  - Cache Controls — Clear model cache (IndexedDB) and SW caches.

## Transcription & Models
- Catalog: `AVAILABLE_MODELS` defines known filenames and metadata (e.g., `base.q5_1` → `models/ggml-base-q5_1.bin`).
- Availability: `detectAvailableModels()` probes each model URL (HEAD or tiny Range GET) so the UI only offers real files.
- Defaults & Fallbacks:
  - Settings shows only detected models; default is persisted to `localStorage`.
  - If the saved model is missing, the app chooses `base.q5_1` (if present) or the first detected model and persists it.
  - When a non‑existent model is requested, the loader falls back to `base.q5_1` if available.
- Worker: `src/lib/workers/whisper.worker.ts` currently uses a mock implementation (no real WASM). It simulates loading and transcription with progress.

## Data & Storage
- IndexedDB
  - `src/lib/store/db.ts` — Raw media (original + PCM) and storage stats.
  - `src/lib/store/transcripts.ts` — Transcripts (text, segments, metadata) with search and statistics.
  - `src/lib/store/summaries.ts` — Summaries (structured results) with search and statistics; linked to transcripts.
- CacheStorage
  - `public/sw.js` caches the app shell, runtime assets (stale‑while‑revalidate), and large model files (cache‑first, range‑friendly).
  - SW supports messages to clear caches/purge model cache and to query cache info.

## Validation Snapshot

As of 2026-03-10:

- `npm run build` passes.
- `npx tsc --noEmit` passes for active code.
- The active application runtime does not depend on `src/sw.ts`.
- Full Playwright validation was attempted, but the environment still blocks browser launch from the current snap setup.

## PWA & GitHub Pages Notes
- Subpath support
  - `vite.config.ts`: `base: process.env.BASE_URL || '/'`.
  - All public links use relative URLs.
  - `manifest.webmanifest`: `start_url` and `scope` = `.` so iOS Add‑to‑Home‑Screen opens the subpath (not domain root).
- Manual Service Worker
  - Registered via `src/sw-register.ts` using `${import.meta.env.BASE_URL}sw.js`.
  - Navigation fallback returns cached app shell or a minimal offline page.
- CI/CD
  - `.github/workflows/pages.yml` builds with `BASE_URL="/meeting-summarizer/"` and deploys `dist/` to GitHub Pages.

## Current Organization Notes
- Feature UI is now grouped by business domain under `src/features/` instead of a single `src/ui/` directory.
- Shared non-UI code lives under `src/lib/`, which separates reusable technical concerns from product-facing components.
- Documentation was centralized under `docs/`; runtime `public/` folders now only contain files needed by the app at runtime.
- `public/sw.js` is the active service worker path; `src/sw.ts` is currently inactive and excluded from active validation.

## Recent Changes (Highlights)
- Subpath/Pages fixes: Moved `index.html` to project root; manifest start_url/scope set to `.`, all paths BASE‑aware.
- Service Worker: Manual SW restored; cache bust to `app-shell-v2`; models cache‑first with range support.
- Error Safety: Added `ErrorBoundary` and a loading placeholder to avoid black screens.
- UI Reorg: Tabs (Work, Library & Export, Settings); clearer descriptions; sticky header; styled tab bar.
- Model Selection: Moved to Settings; Work tab shows active model only.
- Auto Pipelines: After recording or imported transcription, the app auto‑summarizes and saves both transcript and summary.
- Progress & Toasts: Visible progress stages with percent; toast after saves.
- Model Detection: Only available models are shown/used; added `base.q5_1` and robust fallback logic.
- Bug Fixes: Build issue (await in useEffect) fixed; recording button resets immediately after stop; mock worker avoids OOB errors.
- Recent stabilization: fixed broken app flow issues around transcription screen behavior, transcript segment propagation, storage ordering, and active TypeScript validation.

## Build & Run
- Dev
  - `npm install`
  - `npm run dev` → open http://localhost:5173
- Build (Pages)
  - `BASE_URL="/meeting-summarizer/" npm run build`
- Preview
  - `npm run preview`
- Deploy
  - Push to `main` and let the GitHub Actions Pages workflow deploy `dist/`.

## Known Limitations & Next Steps
- Whisper WASM: The worker is currently a mock; integrate real whisper.cpp WASM (load `.wasm` and `.bin`, allocate memory, call real APIs).
- Icons/Screenshots: Replace placeholder icons under `public/icons/` for the best install experience.
- Accessibility: Add keyboard navigation for tabs (arrow keys), focus states, and enhanced ARIA.
- Validation: Re-run complete browser validation when Playwright can launch a browser normally in the execution environment.
- Convenience
  - “Rescan models” in Settings to detect new model files without reload.
  - “Cancel transcription” while processing (worker can honor a cancel flag).
  - Add ETA estimates using `estimateTranscriptionTime()`.
