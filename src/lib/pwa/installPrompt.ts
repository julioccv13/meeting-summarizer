/**
 * PWA Installation Prompt for Android devices
 * Handles beforeinstallprompt event and provides custom install UI
 */

export interface InstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

export interface InstallPromptState {
  isInstallable: boolean
  isInstalled: boolean
  canInstall: boolean
  platform: string
  lastPromptDate?: Date
}

/**
 * Install prompt manager class
 */
class InstallPromptManager {
  private deferredPrompt: InstallPromptEvent | null = null
  private state: InstallPromptState = {
    isInstallable: false,
    isInstalled: false,
    canInstall: false,
    platform: 'unknown'
  }
  private listeners: Array<(state: InstallPromptState) => void> = []
  private readonly STORAGE_KEY = 'pwa-install-state'
  private readonly PROMPT_COOLDOWN = 7 * 24 * 60 * 60 * 1000 // 7 days

  constructor() {
    this.init()
  }

  /**
   * Initialize the install prompt manager
   */
  private init(): void {
    this.loadState()
    this.detectPlatform()
    this.setupEventListeners()
    this.checkInstallState()
  }

  /**
   * Load persisted state from localStorage
   */
  private loadState(): void {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY)
      if (saved) {
        const parsedState = JSON.parse(saved)
        this.state = {
          ...this.state,
          ...parsedState,
          lastPromptDate: parsedState.lastPromptDate ? new Date(parsedState.lastPromptDate) : undefined
        }
      }
    } catch (error) {
      console.warn('Failed to load install prompt state:', error)
    }
  }

  /**
   * Save state to localStorage
   */
  private saveState(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state))
    } catch (error) {
      console.warn('Failed to save install prompt state:', error)
    }
  }

  /**
   * Detect platform and capabilities
   */
  private detectPlatform(): void {
    const userAgent = navigator.userAgent.toLowerCase()
    
    if (userAgent.includes('android')) {
      this.state.platform = 'android'
    } else if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
      this.state.platform = 'ios'
    } else if (userAgent.includes('windows')) {
      this.state.platform = 'windows'
    } else if (userAgent.includes('mac')) {
      this.state.platform = 'macos'
    } else {
      this.state.platform = 'other'
    }

    this.notifyListeners()
  }

  /**
   * Setup event listeners for PWA events
   */
  private setupEventListeners(): void {
    // Listen for beforeinstallprompt (Android Chrome)
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault()
      this.deferredPrompt = event as InstallPromptEvent
      this.state.isInstallable = true
      this.state.canInstall = this.shouldShowPrompt()
      this.saveState()
      this.notifyListeners()

      console.log('PWA install prompt available')
    })

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null
      this.state.isInstalled = true
      this.state.isInstallable = false
      this.state.canInstall = false
      this.saveState()
      this.notifyListeners()

      console.log('PWA installed successfully')
      
      // Track installation
      this.trackInstallEvent('success')
    })

    // Check if app is running in standalone mode
    window.addEventListener('DOMContentLoaded', () => {
      this.checkInstallState()
    })
  }

  /**
   * Check current install state
   */
  private checkInstallState(): void {
    // Check if running in standalone mode (iOS and Android)
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in navigator && (navigator as any).standalone) ||
      document.referrer.includes('android-app://')

    this.state.isInstalled = isStandalone
    
    // Update install capability
    this.state.canInstall = this.state.isInstallable && !this.state.isInstalled && this.shouldShowPrompt()
    
    this.saveState()
    this.notifyListeners()
  }

  /**
   * Check if we should show the install prompt
   */
  private shouldShowPrompt(): boolean {
    if (this.state.isInstalled) return false
    if (!this.state.lastPromptDate) return true
    
    const now = new Date()
    const timeSinceLastPrompt = now.getTime() - this.state.lastPromptDate.getTime()
    
    return timeSinceLastPrompt > this.PROMPT_COOLDOWN
  }

  /**
   * Show the install prompt
   */
  async showInstallPrompt(): Promise<boolean> {
    if (!this.deferredPrompt || !this.state.canInstall) {
      console.warn('Install prompt not available')
      return false
    }

    try {
      // Update last prompt date
      this.state.lastPromptDate = new Date()
      this.saveState()

      // Show the prompt
      await this.deferredPrompt.prompt()
      
      // Wait for user choice
      const choiceResult = await this.deferredPrompt.userChoice
      
      console.log('Install prompt result:', choiceResult.outcome)
      
      // Track the outcome
      this.trackInstallEvent(choiceResult.outcome)
      
      // Clean up
      this.deferredPrompt = null
      this.state.canInstall = false
      
      if (choiceResult.outcome === 'accepted') {
        // Don't mark as installed yet - wait for appinstalled event
        this.state.isInstallable = false
      }
      
      this.saveState()
      this.notifyListeners()
      
      return choiceResult.outcome === 'accepted'
    } catch (error) {
      console.error('Failed to show install prompt:', error)
      this.trackInstallEvent('error')
      return false
    }
  }

  /**
   * Get current state
   */
  getState(): InstallPromptState {
    return { ...this.state }
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: InstallPromptState) => void): () => void {
    this.listeners.push(listener)
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.getState())
      } catch (error) {
        console.error('Error in install prompt listener:', error)
      }
    })
  }

  /**
   * Track install events for analytics
   */
  private trackInstallEvent(outcome: string): void {
    // This would integrate with your analytics service
    console.log('PWA Install Event:', {
      outcome,
      platform: this.state.platform,
      timestamp: new Date().toISOString()
    })
    
    // Example: Send to analytics service
    if (typeof gtag !== 'undefined') {
      // @ts-ignore
      gtag('event', 'pwa_install', {
        outcome,
        platform: this.state.platform
      })
    }
  }

  /**
   * Reset install state (for testing)
   */
  reset(): void {
    this.state = {
      isInstallable: false,
      isInstalled: false,
      canInstall: false,
      platform: this.state.platform // Keep platform detection
    }
    this.deferredPrompt = null
    
    try {
      localStorage.removeItem(this.STORAGE_KEY)
    } catch (error) {
      console.warn('Failed to clear install state:', error)
    }
    
    this.notifyListeners()
  }

  /**
   * Check if device supports PWA installation
   */
  static isInstallSupported(): boolean {
    // Check for beforeinstallprompt support (Android Chrome)
    if ('BeforeInstallPromptEvent' in window) {
      return true
    }
    
    // Check for iOS Safari PWA support
    if ('standalone' in navigator) {
      return true
    }
    
    // Check for other PWA indicators
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      return true
    }
    
    return false
  }

  /**
   * Get platform-specific install instructions
   */
  static getInstallInstructions(platform: string): {
    title: string
    steps: string[]
    icon: string
  } {
    switch (platform) {
      case 'android':
        return {
          title: 'Install Meeting Summarizer',
          steps: [
            'Tap the "Install" button above',
            'Or use Chrome menu → "Add to Home screen"',
            'Confirm installation'
          ],
          icon: '📱'
        }
      
      case 'ios':
        return {
          title: 'Add to Home Screen',
          steps: [
            'Tap the Share button 📤',
            'Scroll down and tap "Add to Home Screen"',
            'Tap "Add" to confirm'
          ],
          icon: '📲'
        }
      
      case 'windows':
        return {
          title: 'Install as App',
          steps: [
            'Click the install icon in the address bar',
            'Or use Chrome menu → "Install Meeting Summarizer"',
            'Click "Install" to confirm'
          ],
          icon: '💻'
        }
      
      default:
        return {
          title: 'Use as Web App',
          steps: [
            'Bookmark this page for easy access',
            'The app works great in your browser',
            'All features are available online'
          ],
          icon: '🌐'
        }
    }
  }
}

// Create singleton instance
export const installPromptManager = new InstallPromptManager()

// Convenience functions
export const showInstallPrompt = () => installPromptManager.showInstallPrompt()
export const getInstallState = () => installPromptManager.getState()
export const subscribeToInstallState = (listener: (state: InstallPromptState) => void) => 
  installPromptManager.subscribe(listener)
export const isInstallSupported = () => InstallPromptManager.isInstallSupported()
export const getInstallInstructions = (platform: string) => 
  InstallPromptManager.getInstallInstructions(platform)