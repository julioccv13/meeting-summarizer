/* eslint-disable no-restricted-globals */
// BASE-aware manual Service Worker for GitHub Pages hosting
const CACHE = 'app-shell-v2'
const BASE = new URL(self.registration.scope).pathname // e.g., '/meeting-summarizer/'
const APP_SHELL = [BASE, `${BASE}index.html`, `${BASE}manifest.webmanifest`, `${BASE}icons/icon-192.png`, `${BASE}icons/icon-512.png`]

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    try { await cache.addAll(APP_SHELL) } catch (e) { /* best-effort */ }
  })())
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const isSameOrigin = url.origin === self.location.origin

  // Cache-first for models and WASM
  const isModel = isSameOrigin && (url.pathname.startsWith(`${BASE}models/`) || /\.(?:bin|ggml|model)$/.test(url.pathname))
  const isWasm = isSameOrigin && (url.pathname.endsWith('.wasm') || url.pathname.startsWith(`${BASE}whisper/`))

  if (isModel || isWasm) {
    event.respondWith((async () => {
      const cached = await caches.match(request)
      if (cached) return cached
      const resp = await fetch(request)
      const cache = await caches.open(CACHE)
      try { await cache.put(request, resp.clone()) } catch {}
      return resp
    })())
    return
  }

  // Navigation: network-first then fallback to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try { return await fetch(request) } catch {
        const cache = await caches.open(CACHE)
        return (await cache.match(BASE)) || (await cache.match(`${BASE}index.html`)) || Response.error()
      }
    })())
    return
  }

  // Default: stale-while-revalidate for same-origin requests
  if (isSameOrigin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE)
      const cached = await cache.match(request)
      const network = fetch(request).then((resp) => {
        if (resp && resp.ok) cache.put(request, resp.clone()).catch(() => {})
        return resp
      }).catch(() => cached)
      return cached || network
    })())
  }
})
