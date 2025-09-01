/**
 * Service Worker for Meeting Summarizer PWA
 * Handles caching strategies for app shell, models, and offline functionality
 */

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate, NetworkFirst } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { RangeRequestsPlugin } from 'workbox-range-requests'

// TypeScript declarations for service worker
declare const self: ServiceWorkerGlobalScope
// Compute BASE from registration scope (e.g., '/meeting-summarizer/')
const BASE = new URL(self.registration.scope).pathname

// Cache names
const CACHE_NAMES = {
  APP_SHELL: 'app-shell-v1',
  MODELS: 'whisper-models-v1',
  RUNTIME: 'runtime-cache-v1',
  IMAGES: 'images-v1',
  OFFLINE: 'offline-v1'
}

// Model files patterns
const MODEL_PATTERNS = [
  /\/models\/.+\.bin$/,
  /\/models\/.+\.wasm$/,
  /\/models\/.+\.ggml$/,
  /\/models\/.+\.model$/
]

// App version for cache busting
const APP_VERSION = 'v1.0.0'

/**
 * Precache app shell files
 */
precacheAndRoute(self.__WB_MANIFEST || [])

/**
 * Clean up outdated caches
 */
cleanupOutdatedCaches()

/**
 * Cache strategy for app shell (HTML, CSS, JS)
 * Strategy: StaleWhileRevalidate - serve from cache, update in background
 */
registerRoute(
  ({ request }) => {
    return request.destination === 'document' || 
           request.destination === 'script' ||
           request.destination === 'style'
  },
  new StaleWhileRevalidate({
    cacheName: CACHE_NAMES.APP_SHELL,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200]
      }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
      })
    ]
  })
)

/**
 * Cache strategy for Whisper model files
 * Strategy: CacheFirst - serve from cache, only fetch if not cached
 * Supports range requests for large files
 */
registerRoute(
  ({ url }) => MODEL_PATTERNS.some(pattern => pattern.test(url.pathname)),
  new CacheFirst({
    cacheName: CACHE_NAMES.MODELS,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200, 206] // Include partial content responses
      }),
      new RangeRequestsPlugin(), // Support for range requests
      new ExpirationPlugin({
        maxEntries: 10, // Limit model cache size
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        purgeOnQuotaError: true // Auto-cleanup on quota exceeded
      })
    ]
  })
)

/**
 * Cache strategy for images and static assets
 * Strategy: CacheFirst with expiration
 */
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: CACHE_NAMES.IMAGES,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200]
      }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
      })
    ]
  })
)

/**
 * Cache strategy for API calls and runtime resources
 * Strategy: NetworkFirst - try network, fallback to cache
 */
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/') || 
              url.pathname.includes('.json'),
  new NetworkFirst({
    cacheName: CACHE_NAMES.RUNTIME,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200]
      }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24 // 1 day
      })
    ]
  })
)

/**
 * Offline fallback for navigation requests
 * Serve offline page when network and cache fail
 */
const navigationRoute = new NavigationRoute(
  async ({ event }) => {
    try {
      // Try to get from network first
      const response = await fetch(event.request)
      return response
    } catch (error) {
      // If network fails, try cache
      const cache = await caches.open(CACHE_NAMES.APP_SHELL)
      const cachedResponse = await cache.match(BASE)
      
      if (cachedResponse) {
        return cachedResponse
      }
      
      // If no cache, return minimal offline page
      return new Response(createOfflineHTML(), { headers: { 'Content-Type': 'text/html' } })
    }
  }
)

registerRoute(navigationRoute)

/**
 * Message handling for cache management
 */
self.addEventListener('message', async (event) => {
  const { type, payload } = event.data || {}

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting()
      break

    case 'CACHE_URLS':
      await cacheUrls(payload.urls)
      event.ports[0]?.postMessage({ success: true })
      break

    case 'CLEAR_CACHE':
      await clearCache(payload.cacheName)
      event.ports[0]?.postMessage({ success: true })
      break

    case 'CLEAR_ALL_CACHES':
      await clearAllCaches()
      event.ports[0]?.postMessage({ success: true })
      break

    case 'GET_CACHE_SIZE':
      const size = await getCacheSize()
      event.ports[0]?.postMessage({ size })
      break

    case 'PURGE_MODELS':
      await purgeModelCache()
      event.ports[0]?.postMessage({ success: true })
      break

    case 'GET_CACHE_INFO':
      const info = await getCacheInfo()
      event.ports[0]?.postMessage(info)
      break

    default:
      console.warn('Unknown message type:', type)
  }
})

/**
 * Cache specific URLs
 */
async function cacheUrls(urls: string[]): Promise<void> {
  const cache = await caches.open(CACHE_NAMES.RUNTIME)
  
  for (const url of urls) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        await cache.put(url, response)
      }
    } catch (error) {
      console.warn(`Failed to cache URL: ${url}`, error)
    }
  }
}

/**
 * Clear specific cache
 */
async function clearCache(cacheName: string): Promise<void> {
  if (cacheName && Object.values(CACHE_NAMES).includes(cacheName)) {
    await caches.delete(cacheName)
  }
}

/**
 * Clear all caches
 */
async function clearAllCaches(): Promise<void> {
  const cacheNames = await caches.keys()
  await Promise.all(
    cacheNames.map(name => caches.delete(name))
  )
}

/**
 * Get total cache size estimate
 */
async function getCacheSize(): Promise<number> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const estimate = await navigator.storage.estimate()
      return estimate.usage || 0
    } catch (error) {
      console.warn('Failed to estimate cache size:', error)
    }
  }
  
  // Fallback: estimate based on cache entries
  let totalSize = 0
  const cacheNames = await caches.keys()
  
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName)
    const keys = await cache.keys()
    totalSize += keys.length * 50000 // Rough estimate: 50KB per entry
  }
  
  return totalSize
}

/**
 * Purge model cache specifically
 */
async function purgeModelCache(): Promise<void> {
  const cache = await caches.open(CACHE_NAMES.MODELS)
  const keys = await cache.keys()
  
  await Promise.all(
    keys.map(request => cache.delete(request))
  )
  
  console.log('Model cache purged')
}

/**
 * Get detailed cache information
 */
async function getCacheInfo(): Promise<{
  caches: Array<{ name: string; size: number; entries: number }>
  totalSize: number
  quota?: number
}> {
  const cacheNames = await caches.keys()
  const cacheInfo = []
  let totalSize = 0
  
  for (const name of cacheNames) {
    const cache = await caches.open(name)
    const keys = await cache.keys()
    const entries = keys.length
    const estimatedSize = entries * 50000 // Rough estimate
    
    cacheInfo.push({
      name,
      size: estimatedSize,
      entries
    })
    
    totalSize += estimatedSize
  }
  
  let quota: number | undefined
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const estimate = await navigator.storage.estimate()
      quota = estimate.quota
      totalSize = estimate.usage || totalSize
    } catch (error) {
      console.warn('Failed to get storage estimate:', error)
    }
  }
  
  return {
    caches: cacheInfo,
    totalSize,
    quota
  }
}

/**
 * Create minimal offline HTML page
 */
function createOfflineHTML(): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Meeting Summarizer - Offline</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          margin: 0;
          padding: 2rem;
          background: #f8f9fa;
          color: #495057;
          text-align: center;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }
        .offline-container {
          max-width: 400px;
          background: white;
          padding: 2rem;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .offline-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
          opacity: 0.5;
        }
        h1 { margin: 0 0 1rem 0; color: #1f2937; }
        p { margin: 0 0 1.5rem 0; line-height: 1.6; }
        .retry-button {
          background: #3b82f6;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 6px;
          cursor: pointer;
          font-size: 1rem;
          font-weight: 500;
        }
        .retry-button:hover {
          background: #2563eb;
        }
      </style>
    </head>
    <body>
      <div class="offline-container">
        <div class="offline-icon">📱</div>
        <h1>You're Offline</h1>
        <p>Meeting Summarizer works offline! Your app is cached and ready to use without an internet connection.</p>
        <button class="retry-button" onclick="window.location.reload()">
          Try Again
        </button>
      </div>
    </body>
    </html>
  `
}

/**
 * Handle install event
 */
self.addEventListener('install', (event) => {
  console.log('Service Worker: Install event')
  
  // Skip waiting to activate immediately
  event.waitUntil(
    (async () => {
      // Pre-cache critical resources
      const cache = await caches.open(CACHE_NAMES.APP_SHELL)
      
      const criticalResources = [
        BASE,
        `${BASE}manifest.webmanifest`,
        `${BASE}icons/icon-192.png`,
        `${BASE}icons/icon-512.png`
      ]
      
      try {
        await cache.addAll(criticalResources)
        console.log('Critical resources cached')
      } catch (error) {
        console.warn('Failed to cache some critical resources:', error)
      }
      
      self.skipWaiting()
    })()
  )
})

/**
 * Handle activate event
 */
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activate event')
  
  event.waitUntil(
    (async () => {
      // Clean up old caches
      const cacheNames = await caches.keys()
      const validCacheNames = Object.values(CACHE_NAMES)
      
      await Promise.all(
        cacheNames
          .filter(name => !validCacheNames.includes(name))
          .map(name => caches.delete(name))
      )
      
      // Claim clients immediately
      await self.clients.claim()
      
      console.log('Service Worker: Activated and claimed clients')
    })()
  )
})

/**
 * Handle fetch event
 */
self.addEventListener('fetch', (event) => {
  // Only handle HTTP(S) requests
  if (!event.request.url.startsWith('http')) {
    return
  }
  
  // Let Workbox routing handle the request
  // This event listener is here for additional custom logic if needed
})

/**
 * Handle sync event for background sync
 */
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(
      (async () => {
        // Handle background synchronization
        console.log('Background sync triggered')
        
        // Example: sync pending transcriptions
        // This would integrate with your app's sync logic
      })()
    )
  }
})

/**
 * Handle push notification events
 */
self.addEventListener('push', (event) => {
  const options = {
    body: 'Meeting summarization complete!',
    icon: `${BASE}icons/icon-192.png`,
    badge: `${BASE}icons/icon-72x72.png`,
    vibrate: [100, 50, 100],
    tag: 'meeting-summarizer',
    requireInteraction: false,
    actions: [
      {
        action: 'view',
        title: 'View Summary',
        icon: `${BASE}icons/view-action.png`
      }
    ]
  }

  event.waitUntil(
    self.registration.showNotification('Meeting Summarizer', options)
  )
})

/**
 * Handle notification click events
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'view') {
    event.waitUntil(
      self.clients.openWindow('/?view=summary')
    )
  } else {
    event.waitUntil(
      self.clients.openWindow('/')
    )
  }
})

// Export for module systems
export { CACHE_NAMES, APP_VERSION }
