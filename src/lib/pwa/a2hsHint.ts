export function showA2HSHintIfNeeded() {
  // Detect iOS Safari not-installed
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const isStandalone = (window.matchMedia && (window.matchMedia('(display-mode: standalone)').matches)) || (window.navigator as any).standalone
  if (isIos && !isStandalone) {
    console.log('Tip: Share → Add to Home Screen for best experience.')
  }
}
