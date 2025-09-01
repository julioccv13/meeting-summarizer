/**
 * Summary View Component
 * Clean UI for displaying, sharing, and saving summaries
 */

import React, { useState, useCallback } from 'react'
import { downloadText, copyToClipboard, isClipboardSupported } from '../utils/download'
import { shareContent, isShareSupported } from '../utils/share'
import type { SummaryResult } from '../nlp/textrank'

/**
 * Summary view props
 */
interface SummaryViewProps {
  summary: SummaryResult
  title?: string
  transcriptId?: string
  className?: string
  onSave?: (summary: SummaryResult, transcriptId?: string) => void
  showActions?: boolean
  compact?: boolean
}

/**
 * Summary display format
 */
type SummaryFormat = 'bullets' | 'paragraph'

/**
 * Summary view component
 */
export const SummaryView: React.FC<SummaryViewProps> = ({
  summary,
  title = 'Summary',
  transcriptId,
  className = '',
  onSave,
  showActions = true,
  compact = false
}) => {
  const [format, setFormat] = useState<SummaryFormat>('bullets')
  const [isExpanded, setIsExpanded] = useState(!compact)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'success' | 'error'>('idle')

  // Format summary text based on selected format
  const formatSummaryText = useCallback((summaryResult: SummaryResult, selectedFormat: SummaryFormat): string => {
    switch (selectedFormat) {
      case 'bullets':
        return summaryResult.sentences.map(s => `• ${s}`).join('\n')
      case 'paragraph':
        return summaryResult.sentences.join(' ')
      default:
        return summaryResult.summary
    }
  }, [])

  const formattedText = formatSummaryText(summary, format)

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    if (!isClipboardSupported()) return

    setCopyStatus('copying')
    
    try {
      const success = await copyToClipboard(formattedText)
      setCopyStatus(success ? 'success' : 'error')
      
      // Reset status after 2 seconds
      setTimeout(() => setCopyStatus('idle'), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
      setCopyStatus('error')
      setTimeout(() => setCopyStatus('idle'), 2000)
    }
  }, [formattedText])

  // Share summary
  const handleShare = useCallback(async () => {
    try {
      const shared = await shareContent(
        `${title}`,
        formattedText,
        window.location.href
      )
      
      if (!shared && isClipboardSupported()) {
        // Fallback to copy
        await handleCopy()
      }
    } catch (err) {
      console.error('Failed to share:', err)
      if (isClipboardSupported()) {
        await handleCopy()
      }
    }
  }, [formattedText, title, handleCopy])

  // Save as file
  const handleSave = useCallback(() => {
    const timestamp = new Date().toISOString().split('T')[0]
    const filename = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_summary_${timestamp}`
    
    downloadText(filename, formattedText)
    
    // Notify parent component
    onSave?.(summary, transcriptId)
  }, [formattedText, title, summary, transcriptId, onSave])

  // Toggle format
  const toggleFormat = useCallback(() => {
    setFormat(prev => prev === 'bullets' ? 'paragraph' : 'bullets')
  }, [])

  // Get copy button text
  const getCopyButtonText = () => {
    switch (copyStatus) {
      case 'copying': return 'Copying...'
      case 'success': return '✓ Copied!'
      case 'error': return '✗ Failed'
      default: return '📋 Copy'
    }
  }

  return (
    <div className={`summary-view ${compact ? 'compact' : ''} ${className}`}>
      {/* Header */}
      <div className="summary-header">
        <div className="header-left">
          <h3 className="summary-title">{title}</h3>
          {!compact && (
            <div className="summary-meta">
              <span>{summary.summarySentenceCount} sentences</span>
              <span>•</span>
              <span>{Math.round(summary.compressionRatio * 100)}% of original</span>
              <span>•</span>
              <span>{summary.language.toUpperCase()}</span>
            </div>
          )}
        </div>
        
        {compact && (
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="expand-button"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? '▼' : '▶'}
          </button>
        )}
      </div>

      {/* Content */}
      {(isExpanded || !compact) && (
        <>
          {/* Format Toggle */}
          {showActions && summary.sentences.length > 1 && (
            <div className="format-controls">
              <button 
                onClick={toggleFormat}
                className={`format-button ${format === 'bullets' ? 'active' : ''}`}
              >
                • Bullets
              </button>
              <button 
                onClick={toggleFormat}
                className={`format-button ${format === 'paragraph' ? 'active' : ''}`}
              >
                ¶ Paragraph
              </button>
            </div>
          )}

          {/* Summary Text */}
          <div className="summary-content">
            <div className={`summary-text ${format}`}>
              {format === 'bullets' ? (
                formattedText.split('\n').map((line, index) => (
                  <p key={index} className="bullet-line">{line}</p>
                ))
              ) : (
                <p className="paragraph-text">{formattedText}</p>
              )}
            </div>
          </div>

          {/* Actions */}
          {showActions && (
            <div className="summary-actions">
              {isClipboardSupported() && (
                <button 
                  onClick={handleCopy}
                  disabled={copyStatus === 'copying'}
                  className={`action-button copy-button ${copyStatus}`}
                >
                  {getCopyButtonText()}
                </button>
              )}
              
              {isShareSupported() && (
                <button 
                  onClick={handleShare}
                  className="action-button share-button"
                >
                  🔗 Share
                </button>
              )}
              
              <button 
                onClick={handleSave}
                className="action-button save-button"
              >
                💾 Save
              </button>
            </div>
          )}

          {/* Stats */}
          {!compact && (
            <div className="summary-stats">
              <div className="stat">
                <span className="stat-label">Processing</span>
                <span className="stat-value">{summary.processingTimeMs}ms</span>
              </div>
              <div className="stat">
                <span className="stat-label">Original</span>
                <span className="stat-value">{summary.originalSentenceCount} sentences</span>
              </div>
              <div className="stat">
                <span className="stat-label">Compressed</span>
                <span className="stat-value">{Math.round((1 - summary.compressionRatio) * 100)}%</span>
              </div>
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .summary-view {
          background: #ffffff;
          border: 1px solid #e1e5e9;
          border-radius: 12px;
          padding: 1.5rem;
          margin: 1rem 0;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
          transition: all 0.2s ease;
        }

        .summary-view:hover {
          box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }

        .summary-view.compact {
          padding: 1rem;
          margin: 0.5rem 0;
        }

        .summary-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1rem;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid #f1f3f4;
        }

        .summary-view.compact .summary-header {
          margin-bottom: 0.75rem;
          padding-bottom: 0.5rem;
        }

        .header-left {
          flex: 1;
        }

        .summary-title {
          margin: 0 0 0.5rem 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: #1f2937;
          line-height: 1.3;
        }

        .summary-view.compact .summary-title {
          font-size: 1.125rem;
          margin-bottom: 0.25rem;
        }

        .summary-meta {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          font-size: 0.875rem;
          color: #6b7280;
        }

        .expand-button {
          background: #f9fafb;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          padding: 0.5rem;
          cursor: pointer;
          font-size: 0.875rem;
          color: #6b7280;
          min-width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .expand-button:hover {
          background: #f3f4f6;
          color: #374151;
        }

        .format-controls {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .format-button {
          background: #f9fafb;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          padding: 0.5rem 0.75rem;
          cursor: pointer;
          font-size: 0.875rem;
          color: #6b7280;
          transition: all 0.15s ease;
        }

        .format-button:hover {
          background: #f3f4f6;
          color: #374151;
        }

        .format-button.active {
          background: #3b82f6;
          color: white;
          border-color: #3b82f6;
        }

        .summary-content {
          margin-bottom: 1.5rem;
        }

        .summary-view.compact .summary-content {
          margin-bottom: 1rem;
        }

        .summary-text {
          background: #f8fafc;
          border-radius: 8px;
          padding: 1.25rem;
          line-height: 1.6;
          font-size: 0.95rem;
          color: #374151;
          max-height: 400px;
          overflow-y: auto;
        }

        .summary-view.compact .summary-text {
          padding: 1rem;
          font-size: 0.9rem;
          max-height: 200px;
        }

        .bullet-line {
          margin: 0 0 0.5rem 0;
        }

        .bullet-line:last-child {
          margin-bottom: 0;
        }

        .paragraph-text {
          margin: 0;
        }

        .summary-actions {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
          margin-bottom: 1rem;
        }

        .summary-view.compact .summary-actions {
          gap: 0.5rem;
          margin-bottom: 0.75rem;
        }

        .action-button {
          background: #ffffff;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          padding: 0.75rem 1rem;
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .summary-view.compact .action-button {
          padding: 0.5rem 0.75rem;
          font-size: 0.8rem;
        }

        .action-button:hover {
          background: #f9fafb;
          border-color: #9ca3af;
        }

        .action-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .copy-button.success {
          background: #dcfce7;
          border-color: #16a34a;
          color: #166534;
        }

        .copy-button.error {
          background: #fee2e2;
          border-color: #dc2626;
          color: #991b1b;
        }

        .share-button:hover {
          background: #dbeafe;
          border-color: #3b82f6;
          color: #1d4ed8;
        }

        .save-button:hover {
          background: #f0fdf4;
          border-color: #16a34a;
          color: #15803d;
        }

        .summary-stats {
          display: flex;
          gap: 1.5rem;
          padding: 1rem 0 0 0;
          border-top: 1px solid #f1f3f4;
          flex-wrap: wrap;
        }

        .stat {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          min-width: 0;
        }

        .stat-label {
          font-size: 0.75rem;
          font-weight: 500;
          color: #9ca3af;
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }

        .stat-value {
          font-size: 0.875rem;
          font-weight: 600;
          color: #374151;
        }

        /* Responsive design */
        @media (max-width: 768px) {
          .summary-view {
            padding: 1rem;
            margin: 0.75rem 0;
            border-radius: 8px;
          }

          .summary-title {
            font-size: 1.125rem;
          }

          .summary-meta {
            flex-wrap: wrap;
            gap: 0.25rem;
          }

          .format-controls {
            justify-content: center;
          }

          .summary-actions {
            justify-content: space-around;
          }

          .action-button {
            flex: 1;
            justify-content: center;
            min-width: 0;
          }

          .summary-stats {
            justify-content: space-around;
            gap: 1rem;
          }

          .stat {
            text-align: center;
            flex: 1;
          }
        }

        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
          .summary-view {
            background: #1f2937;
            border-color: #374151;
            color: #f9fafb;
          }

          .summary-title {
            color: #f9fafb;
          }

          .summary-meta {
            color: #9ca3af;
          }

          .summary-text {
            background: #111827;
            color: #e5e7eb;
          }

          .action-button {
            background: #374151;
            border-color: #4b5563;
            color: #e5e7eb;
          }

          .action-button:hover {
            background: #4b5563;
            border-color: #6b7280;
          }

          .format-button {
            background: #374151;
            border-color: #4b5563;
            color: #9ca3af;
          }

          .format-button:hover {
            background: #4b5563;
            color: #e5e7eb;
          }

          .format-button.active {
            background: #3b82f6;
            color: white;
          }

          .expand-button {
            background: #374151;
            border-color: #4b5563;
            color: #9ca3af;
          }

          .expand-button:hover {
            background: #4b5563;
            color: #e5e7eb;
          }
        }

        /* High contrast mode */
        @media (prefers-contrast: high) {
          .summary-view {
            border-width: 2px;
          }

          .action-button {
            border-width: 2px;
          }

          .format-button {
            border-width: 2px;
          }
        }

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .summary-view,
          .action-button,
          .format-button,
          .expand-button {
            transition: none;
          }
        }
      `}</style>
    </div>
  )
}

export default SummaryView