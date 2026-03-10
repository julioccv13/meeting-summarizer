/**
 * Share utilities with Web Share API
 * Feature detection and fallback handling for sharing content
 */

/**
 * Share data interface
 */
interface ShareData {
  title?: string
  text?: string
  url?: string
  files?: File[]
}

/**
 * Share result interface
 */
interface ShareResult {
  success: boolean
  method: 'native' | 'clipboard' | 'fallback' | 'unsupported'
  error?: string
}

/**
 * Check if Web Share API is supported
 */
export function isShareSupported(): boolean {
  try {
    return 'share' in navigator && typeof navigator.share === 'function'
  } catch {
    return false
  }
}

/**
 * Check if Web Share API can share files
 */
export function isFileShareSupported(): boolean {
  try {
    return isShareSupported() && 'canShare' in navigator && typeof navigator.canShare === 'function'
  } catch {
    return false
  }
}

/**
 * Check if specific data can be shared
 */
export function canShare(data: ShareData): boolean {
  try {
    if (!isShareSupported()) return false
    
    if ('canShare' in navigator && typeof navigator.canShare === 'function') {
      return navigator.canShare(data)
    }
    
    // Basic validation if canShare is not available
    const hasValidData = Boolean(data.title || data.text || data.url)
    return hasValidData
  } catch {
    return false
  }
}

/**
 * Share content using Web Share API with fallbacks
 */
export async function shareContent(
  title: string,
  text: string,
  url?: string
): Promise<boolean> {
  const shareData: ShareData = { title, text, url }

  // Try Web Share API first
  if (isShareSupported() && canShare(shareData)) {
    try {
      await navigator.share(shareData)
      return true
    } catch (error) {
      // User cancelled or share failed
      console.warn('Web Share API failed:', error)
      
      // Don't treat user cancellation as an error
      if (error instanceof Error && error.name === 'AbortError') {
        return false
      }
      
      // Fall through to clipboard fallback
    }
  }

  // Fallback: Copy to clipboard if available
  try {
    if (navigator.clipboard && window.isSecureContext) {
      const textToShare = url ? `${title}\n\n${text}\n\n${url}` : `${title}\n\n${text}`
      await navigator.clipboard.writeText(textToShare)
      return true
    }
  } catch (error) {
    console.warn('Clipboard fallback failed:', error)
  }

  // Final fallback: Legacy clipboard method
  try {
    return fallbackCopyToClipboard(url ? `${title}\n\n${text}\n\n${url}` : `${title}\n\n${text}`)
  } catch (error) {
    console.warn('All share methods failed:', error)
    return false
  }
}

/**
 * Share a file using Web Share API
 */
export async function shareFile(
  file: File,
  title?: string,
  text?: string
): Promise<ShareResult> {
  const shareData: ShareData = {
    title,
    text,
    files: [file]
  }

  // Check if file sharing is supported
  if (!isFileShareSupported()) {
    return {
      success: false,
      method: 'unsupported',
      error: 'File sharing not supported'
    }
  }

  // Check if this specific data can be shared
  if (!canShare(shareData)) {
    return {
      success: false,
      method: 'unsupported',
      error: 'File type not supported for sharing'
    }
  }

  try {
    await navigator.share(shareData)
    return {
      success: true,
      method: 'native'
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    // User cancelled
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        method: 'native',
        error: 'User cancelled'
      }
    }

    return {
      success: false,
      method: 'native',
      error: errorMessage
    }
  }
}

/**
 * Share multiple items in sequence
 */
export async function shareMultiple(
  items: Array<{
    title: string
    text: string
    url?: string
  }>
): Promise<ShareResult[]> {
  const results: ShareResult[] = []

  for (const item of items) {
    try {
      const success = await shareContent(item.title, item.text, item.url)
      results.push({
        success,
        method: success ? (isShareSupported() ? 'native' : 'clipboard') : 'unsupported'
      })
    } catch (error) {
      results.push({
        success: false,
        method: 'unsupported',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }

    // Add small delay between shares to avoid overwhelming the user
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  return results
}

/**
 * Get appropriate share button text based on capabilities
 */
export function getShareButtonText(): string {
  if (isShareSupported()) {
    return 'Share'
  } else if (navigator.clipboard) {
    return 'Copy'
  } else {
    return 'Copy Text'
  }
}

/**
 * Get share method description for user feedback
 */
export function getShareMethodDescription(): string {
  if (isShareSupported()) {
    return 'Share using your device\'s share menu'
  } else if (navigator.clipboard) {
    return 'Copy to clipboard'
  } else {
    return 'Copy text to clipboard'
  }
}

/**
 * Legacy clipboard fallback using document.execCommand
 */
function fallbackCopyToClipboard(text: string): boolean {
  try {
    // Create temporary textarea element
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.left = '-999999px'
    textArea.style.top = '-999999px'
    textArea.setAttribute('readonly', '')
    textArea.style.opacity = '0'

    document.body.appendChild(textArea)
    
    // Select and copy
    textArea.focus()
    textArea.select()
    textArea.setSelectionRange(0, 99999) // For mobile devices

    const successful = document.execCommand('copy')
    document.body.removeChild(textArea)

    return successful
  } catch (error) {
    console.error('Fallback copy failed:', error)
    return false
  }
}

/**
 * Show share options modal (for advanced implementations)
 */
export interface ShareOption {
  id: string
  name: string
  icon: string
  action: () => Promise<boolean>
}

export function getAvailableShareOptions(
  title: string,
  text: string,
  url?: string
): ShareOption[] {
  const options: ShareOption[] = []

  // Native share
  if (isShareSupported()) {
    options.push({
      id: 'native',
      name: 'Share',
      icon: '🔗',
      action: () => shareContent(title, text, url)
    })
  }

  // Copy to clipboard
  if (navigator.clipboard || document.execCommand) {
    options.push({
      id: 'copy',
      name: 'Copy to Clipboard',
      icon: '📋',
      action: async () => {
        const textToShare = url ? `${title}\n\n${text}\n\n${url}` : `${title}\n\n${text}`
        
        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(textToShare)
            return true
          } else {
            return fallbackCopyToClipboard(textToShare)
          }
        } catch {
          return false
        }
      }
    })
  }

  // Email (mailto)
  options.push({
    id: 'email',
    name: 'Email',
    icon: '📧',
    action: async () => {
      try {
        const subject = encodeURIComponent(title)
        const body = encodeURIComponent(url ? `${text}\n\n${url}` : text)
        const mailtoUrl = `mailto:?subject=${subject}&body=${body}`
        
        window.location.href = mailtoUrl
        return true
      } catch {
        return false
      }
    }
  })

  return options
}

/**
 * Create shareable URL with summary data
 */
export function createShareableUrl(
  title: string,
  text: string,
  baseUrl: string = window.location.origin
): string {
  const params = new URLSearchParams({
    title: title.substring(0, 100), // Limit title length for URL
    preview: text.substring(0, 200) // Limit text for URL preview
  })

  return `${baseUrl}/shared?${params.toString()}`
}

/**
 * Validate share data before sharing
 */
export function validateShareData(data: ShareData): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!data.title && !data.text && !data.url && !data.files?.length) {
    errors.push('At least one of title, text, url, or files must be provided')
  }

  if (data.title && data.title.length > 500) {
    errors.push('Title is too long (max 500 characters)')
  }

  if (data.text && data.text.length > 10000) {
    errors.push('Text is too long (max 10,000 characters)')
  }

  if (data.url && !isValidUrl(data.url)) {
    errors.push('Invalid URL format')
  }

  if (data.files && data.files.length > 10) {
    errors.push('Too many files (max 10 files)')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Simple URL validation
 */
function isValidUrl(string: string): boolean {
  try {
    new URL(string)
    return true
  } catch {
    return false
  }
}

/**
 * Track share events for analytics (optional)
 */
export function trackShare(method: string, success: boolean, contentType: string): void {
  // This would integrate with your analytics service
  console.log('Share event:', { method, success, contentType })
  
  // Example: Send to analytics service
  if (typeof gtag !== 'undefined') {
    // @ts-ignore
    gtag('event', 'share', {
      method,
      content_type: contentType,
      success
    })
  }
}