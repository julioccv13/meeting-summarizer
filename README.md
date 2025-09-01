# meeting-summarizer

## Deploying to GitHub Pages

- Build for project site hosting (repo: `meeting-summarizer`):

  BASE_URL="/meeting-summarizer/" npm run build

- The app will be available at:

  https://<your-username>.github.io/meeting-summarizer/

- Notes:
  - All assets and the Service Worker are built with the proper base path.
  - First page load installs the Service Worker; a reload activates full offline.
  - Whisper model files are cached after first use. You can clear them from the Storage & Caches section.
