/**
 * Download utility for saving files in the browser
 * Handles different file types and browser compatibility
 */

/**
 * Download a file from text content or Blob
 */
export function blobDownload(fileName: string, content: string | Blob, mimeType?: string): void {
  try {
    let blob: Blob

    if (content instanceof Blob) {
      blob = content
    } else {
      // Create blob from string content
      const type = mimeType || 'text/plain;charset=utf-8'
      blob = new Blob([content], { type })
    }

    // Create download URL
    const url = URL.createObjectURL(blob)
    
    // Create temporary download link
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.style.display = 'none'

    // Add to DOM, click, and remove
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    // Clean up URL object
    setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 100)

  } catch (error) {
    console.error('Download failed:', error)
    throw new Error(`Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Download text as a .txt file
 */
export function downloadText(fileName: string, text: string): void {
  // Ensure .txt extension
  const finalFileName = fileName.endsWith('.txt') ? fileName : `${fileName}.txt`
  blobDownload(finalFileName, text, 'text/plain;charset=utf-8')
}

/**
 * Download data as JSON file
 */
export function downloadJSON(fileName: string, data: any): void {
  const jsonString = JSON.stringify(data, null, 2)
  const finalFileName = fileName.endsWith('.json') ? fileName : `${fileName}.json`
  blobDownload(finalFileName, jsonString, 'application/json;charset=utf-8')
}

/**
 * Download SRT subtitles
 */
export function downloadSRT(fileName: string, srtContent: string): void {
  const finalFileName = fileName.endsWith('.srt') ? fileName : `${fileName}.srt`
  blobDownload(finalFileName, srtContent, 'text/plain;charset=utf-8')
}

/**
 * Copy text to clipboard with fallback methods
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    // Modern Clipboard API (requires HTTPS or localhost)
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }

    // Fallback method for older browsers or non-secure contexts
    return fallbackCopyToClipboard(text)

  } catch (error) {
    console.error('Clipboard write failed:', error)
    
    // Try fallback method
    try {
      return fallbackCopyToClipboard(text)
    } catch (fallbackError) {
      console.error('Fallback clipboard write failed:', fallbackError)
      return false
    }
  }
}

/**
 * Fallback clipboard method using document.execCommand
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
 * Check if clipboard write is supported
 */
export function isClipboardSupported(): boolean {
  return !!(navigator.clipboard || document.execCommand)
}

/**
 * Generate a safe filename from text
 */
export function generateSafeFileName(text: string, maxLength: number = 50): string {
  // Remove or replace unsafe characters
  let safe = text
    .replace(/[<>:"/\\|?*]/g, '') // Remove unsafe characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/[^\w\-_.]/g, '') // Keep only word characters, hyphens, underscores, and dots
    .trim()

  // Limit length
  if (safe.length > maxLength) {
    safe = safe.substring(0, maxLength - 3) + '...'
  }

  // Ensure it's not empty
  if (!safe) {
    safe = 'transcript'
  }

  return safe
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Get file size of text content
 */
export function getTextSize(text: string): number {
  return new Blob([text]).size
}

/**
 * Share content using Web Share API (if supported)
 */
export async function shareContent(
  title: string, 
  text: string, 
  url?: string
): Promise<boolean> {
  try {
    if (navigator.share) {
      await navigator.share({
        title,
        text,
        url
      })
      return true
    }
    return false
  } catch (error) {
    console.error('Sharing failed:', error)
    return false
  }
}

/**
 * Check if Web Share API is supported
 */
export function isShareSupported(): boolean {
  return !!navigator.share
}

/**
 * Create a data URL from text content
 */
export function createTextDataURL(text: string, mimeType: string = 'text/plain'): string {
  const blob = new Blob([text], { type: mimeType })
  return URL.createObjectURL(blob)
}

/**
 * Download multiple files as a ZIP (requires additional library in real implementation)
 */
export function downloadMultipleFiles(files: Array<{ name: string; content: string | Blob }>): void {
  // For now, download files individually
  // In a real implementation, you might use JSZip or similar
  files.forEach(file => {
    blobDownload(file.name, file.content)
  })
}

/**
 * Sanitize filename for download
 */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[<>:"/\\|?*]/g, '_') // Replace unsafe characters with underscore
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .substring(0, 255) // Limit to 255 characters (filesystem limit)
    .replace(/^\.+/, '') // Remove leading dots
    .replace(/\.+$/, '') // Remove trailing dots
    || 'download' // Fallback name
}

/**
 * Check if downloads are supported in current browser
 */
export function isDownloadSupported(): boolean {
  try {
    const link = document.createElement('a')
    return 'download' in link
  } catch {
    return false
  }
}

/**
 * Show a toast notification (basic implementation)
 */
export function showToast(message: string, duration: number = 3000): void {
  // Create toast element
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #333;
    color: white;
    padding: 12px 24px;
    border-radius: 6px;
    font-size: 14px;
    z-index: 10000;
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
    max-width: 80vw;
    text-align: center;
  `

  document.body.appendChild(toast)

  // Show toast
  setTimeout(() => {
    toast.style.opacity = '1'
  }, 10)

  // Hide and remove toast
  setTimeout(() => {
    toast.style.opacity = '0'
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast)
      }
    }, 300)
  }, duration)
}