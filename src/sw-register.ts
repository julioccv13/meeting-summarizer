export function register() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = new URL(`${import.meta.env.BASE_URL}sw.js`, location.href).toString()
      navigator.serviceWorker.register(swUrl).catch((err) => {
        console.warn('SW registration failed:', err)
      })
    })
  }
}
