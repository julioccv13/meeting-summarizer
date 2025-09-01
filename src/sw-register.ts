import { registerSW } from 'virtual:pwa-register'

export function register() {
  // vite-plugin-pwa handles dev/prod registration and updates
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      console.log('PWA update available')
    },
    onOfflineReady() {
      console.log('PWA ready to work offline')
    }
  })
}
