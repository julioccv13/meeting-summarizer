# Meeting Summarizer

Offline-first PWA to record or import meetings, transcribe them locally, and generate summaries in the browser.

## Repo map

- `src/app/`: app shell, error boundary, shared styles.
- `src/features/`: UI and feature-specific logic grouped by product area.
- `src/lib/`: shared technical modules like storage, whisper, NLP, PWA helpers, and utilities.
- `public/`: runtime assets served as-is, including PWA files, models, icons, and whisper runtime artifacts.
- `docs/project/`: project-level overview and product context.
- `docs/setup/`: setup notes for models and whisper WASM/runtime assets.

## Main commands

```bash
PATH=/home/julio/.local/bin:$PATH npm install
PATH=/home/julio/.local/bin:$PATH npm run dev
PATH=/home/julio/.local/bin:$PATH BASE_URL="/meeting-summarizer/" npm run build
PATH=/home/julio/.local/bin:$PATH npm run preview
```

## GitHub Pages

Build for the project site with:

```bash
PATH=/home/julio/.local/bin:$PATH BASE_URL="/meeting-summarizer/" npm run build
```

Expected URL:

`https://<your-username>.github.io/meeting-summarizer/`

## Docs

- `docs/project/overview.md`
- `docs/setup/models.md`
- `docs/setup/whisper-wasm.md`
- `docs/setup/whisper-runtime-assets.md`
