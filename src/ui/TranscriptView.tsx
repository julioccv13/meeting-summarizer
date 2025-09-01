import React, { useState, useRef, useCallback, useMemo } from 'react'
import type { Segment } from '../whisper/api'
import { copyToClipboard, downloadText, downloadSRT, downloadJSON, generateSafeFileName, showToast, shareContent, isShareSupported, formatFileSize, getTextSize } from '../utils/download'
import { saveTranscript, exportTranscript } from '../store/transcripts'
import type { TranscriptItem } from '../store/transcripts'

interface TranscriptViewProps {
  text: string
  segments?: Segment[]
  title?: string
  metadata?: {
    duration?: number
    language?: string
    modelUsed?: string
    audioSource?: string
    audioFileName?: string
  }
  onSave?: (transcript: TranscriptItem) => void
  onError?: (error: Error) => void
}

type ViewMode = 'text' | 'segments'
type ExportFormat = 'txt' | 'srt' | 'json'

export default function TranscriptView({ 
  text, 
  segments, 
  title: propTitle,
  metadata = {},
  onSave,
  onError 
}: TranscriptViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('text')
  const [searchTerm, setSearchTerm] = useState('')
  const [isSearchVisible, setIsSearchVisible] = useState(false)
  const [highlightedSegment, setHighlightedSegment] = useState<number | null>(null)
  const [editableTitle, setEditableTitle] = useState(propTitle || generateSafeFileName(text.substring(0, 50)))
  const [isSaving, setIsSaving] = useState(false)
  const textRef = useRef<HTMLPreElement>(null)

  // Memoized values
  const textStats = useMemo(() => {
    const wordCount = text.trim().split(/\s+/).filter(word => word.length > 0).length
    const characterCount = text.length
    const estimatedReadingTime = Math.ceil(wordCount / 200) // ~200 words per minute
    const fileSize = getTextSize(text)
    
    return { wordCount, characterCount, estimatedReadingTime, fileSize }
  }, [text])

  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return []
    
    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    const matches = []
    let match

    while ((match = regex.exec(text)) !== null) {
      matches.push({
        index: match.index,
        text: match[0]
      })
      if (matches.length > 100) break // Limit results
    }

    return matches
  }, [text, searchTerm])

  const handleCopy = useCallback(async () => {
    try {
      const success = await copyToClipboard(text)
      if (success) {
        showToast('Transcript copied to clipboard!')
      } else {
        throw new Error('Copy failed')
      }
    } catch (error) {
      console.error('Copy failed:', error)
      showToast('Failed to copy to clipboard')
      onError?.(error as Error)
    }
  }, [text, onError])

  const handleDownload = useCallback((format: ExportFormat) => {
    try {
      const fileName = generateSafeFileName(editableTitle)
      
      switch (format) {
        case 'txt':
          downloadText(fileName, text)
          showToast('Transcript downloaded as TXT')
          break
          
        case 'srt':
          if (!segments) {
            throw new Error('SRT export requires segment data')
          }
          const srtContent = segments
            .map((segment, index) => {
              const startTime = formatSRTTime(segment.start)
              const endTime = formatSRTTime(segment.end)
              return `${index + 1}\n${startTime} --> ${endTime}\n${segment.text.trim()}\n`
            })
            .join('\n')
          downloadSRT(fileName, srtContent)
          showToast('Subtitles downloaded as SRT')
          break
          
        case 'json':
          const jsonData = {
            title: editableTitle,
            text,
            segments,
            metadata: {
              ...metadata,
              exportedAt: new Date().toISOString(),
              ...textStats
            }
          }
          downloadJSON(fileName, jsonData)
          showToast('Data downloaded as JSON')
          break
      }
    } catch (error) {
      console.error('Download failed:', error)
      showToast('Download failed')
      onError?.(error as Error)
    }
  }, [text, segments, editableTitle, metadata, textStats, onError])

  const handleSave = useCallback(async () => {
    if (isSaving) return
    
    setIsSaving(true)
    try {
      const savedTranscript = await saveTranscript(text, {
        title: editableTitle,
        segments,
        ...metadata
      })
      
      onSave?.(savedTranscript)
      showToast('Transcript saved successfully!')
    } catch (error) {
      console.error('Save failed:', error)
      showToast('Failed to save transcript')
      onError?.(error as Error)
    } finally {
      setIsSaving(false)
    }
  }, [text, segments, editableTitle, metadata, isSaving, onSave, onError])

  const handleShare = useCallback(async () => {
    try {
      const shared = await shareContent(
        editableTitle,
        text.length > 500 ? text.substring(0, 500) + '...' : text
      )
      
      if (!shared) {
        // Fallback to copy
        await handleCopy()
      } else {
        showToast('Transcript shared successfully!')
      }
    } catch (error) {
      console.error('Share failed:', error)
      await handleCopy() // Fallback to copy
    }
  }, [editableTitle, text, handleCopy])

  const handleSegmentClick = useCallback((segmentIndex: number, segment: Segment) => {
    setHighlightedSegment(segmentIndex)
    
    // Scroll to text position (approximate)
    if (textRef.current) {
      const textPosition = text.indexOf(segment.text)
      if (textPosition !== -1) {
        const textElement = textRef.current
        const charHeight = textElement.scrollHeight / text.length
        const scrollPosition = textPosition * charHeight
        textElement.scrollTop = Math.max(0, scrollPosition - textElement.clientHeight / 3)
      }
    }
  }, [text])

  const highlightedText = useMemo(() => {
    if (!searchTerm.trim() || searchResults.length === 0) {
      return text
    }

    let highlightedText = text
    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    
    highlightedText = highlightedText.replace(regex, (match) => {
      return `<mark style="background: #ffeb3b; padding: 1px 2px; border-radius: 2px;">${match}</mark>`
    })

    return highlightedText
  }, [text, searchTerm, searchResults])

  const formatSRTTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    const milliseconds = Math.floor((seconds % 1) * 1000)

    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds
      .toString()
      .padStart(3, '0')}`
  }

  if (!text.trim()) {
    return (
      <div className="card transcript-view empty">
        <div className="empty-state">
          <div className="empty-icon">📄</div>
          <h3>No Transcript Available</h3>
          <p>Start a recording or import an audio file to generate a transcript.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="card transcript-view">
      {/* Header with Title */}
      <div className="transcript-header">
        <input
          type="text"
          value={editableTitle}
          onChange={(e) => setEditableTitle(e.target.value)}
          className="title-input"
          placeholder="Enter transcript title..."
        />
        
        <div className="stats">
          <span>{textStats.wordCount} words</span>
          <span>{textStats.characterCount} chars</span>
          <span>~{textStats.estimatedReadingTime}min read</span>
          <span>{formatFileSize(textStats.fileSize)}</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="transcript-toolbar">
        <div className="toolbar-section">
          <button className="tool-button copy" onClick={handleCopy} title="Copy to clipboard">
            📋 Copy
          </button>

          <div className="dropdown">
            <button className="tool-button download" title="Download transcript">
              💾 Download ▼
            </button>
            <div className="dropdown-menu">
              <button onClick={() => handleDownload('txt')}>📄 Download TXT</button>
              {segments && (
                <button onClick={() => handleDownload('srt')}>🎬 Download SRT</button>
              )}
              <button onClick={() => handleDownload('json')}>📊 Download JSON</button>
            </div>
          </div>

          <button 
            className="tool-button save" 
            onClick={handleSave}
            disabled={isSaving}
            title="Save to library"
          >
            {isSaving ? '💾 Saving...' : '💾 Save'}
          </button>

          {isShareSupported() && (
            <button className="tool-button share" onClick={handleShare} title="Share transcript">
              📤 Share
            </button>
          )}
        </div>

        <div className="toolbar-section">
          <button 
            className={`tool-button search ${isSearchVisible ? 'active' : ''}`}
            onClick={() => setIsSearchVisible(!isSearchVisible)}
            title="Search in text"
          >
            🔍 Search
          </button>

          {segments && (
            <div className="view-mode-toggle">
              <button 
                className={viewMode === 'text' ? 'active' : ''}
                onClick={() => setViewMode('text')}
              >
                Text
              </button>
              <button 
                className={viewMode === 'segments' ? 'active' : ''}
                onClick={() => setViewMode('segments')}
              >
                Segments
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search Bar */}
      {isSearchVisible && (
        <div className="search-bar">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search in transcript..."
            className="search-input"
          />
          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.length} match{searchResults.length !== 1 ? 'es' : ''} found
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="transcript-content">
        {viewMode === 'text' ? (
          <pre 
            ref={textRef}
            className="transcript-text"
            dangerouslySetInnerHTML={{ 
              __html: highlightedText 
            }}
          />
        ) : segments ? (
          <div className="transcript-segments">
            {segments.map((segment, index) => (
              <div 
                key={index}
                className={`segment ${highlightedSegment === index ? 'highlighted' : ''}`}
                onClick={() => handleSegmentClick(index, segment)}
              >
                <div className="segment-time">
                  {segment.start.toFixed(1)}s - {segment.end.toFixed(1)}s
                </div>
                <div className="segment-text">
                  {segment.text}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="no-segments">
            <p>No segment data available. Switch to Text view to see the full transcript.</p>
          </div>
        )}
      </div>

      {/* Inline Styles */}
      <style jsx>{`
        .transcript-view {
          max-width: 800px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .transcript-view.empty {
          text-align: center;
          padding: 60px 20px;
        }

        .empty-state {
          color: #666;
        }

        .empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
          opacity: 0.5;
        }

        .empty-state h3 {
          margin: 0 0 8px 0;
          color: #333;
        }

        .transcript-header {
          margin-bottom: 16px;
        }

        .title-input {
          width: 100%;
          font-size: 18px;
          font-weight: 600;
          border: 1px solid transparent;
          background: transparent;
          padding: 8px 0;
          margin-bottom: 8px;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .title-input:hover, .title-input:focus {
          border-color: #ddd;
          background: #fafafa;
          outline: none;
          padding-left: 8px;
          padding-right: 8px;
        }

        .stats {
          display: flex;
          gap: 16px;
          font-size: 12px;
          color: #666;
          flex-wrap: wrap;
        }

        .transcript-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          gap: 16px;
          flex-wrap: wrap;
        }

        .toolbar-section {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .tool-button {
          background: #f5f5f5;
          border: 1px solid #ddd;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .tool-button:hover {
          background: #e8e8e8;
          transform: translateY(-1px);
        }

        .tool-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .tool-button.active {
          background: #007bff;
          color: white;
          border-color: #0056b3;
        }

        .dropdown {
          position: relative;
          display: inline-block;
        }

        .dropdown:hover .dropdown-menu {
          display: block;
        }

        .dropdown-menu {
          display: none;
          position: absolute;
          top: 100%;
          left: 0;
          background: white;
          border: 1px solid #ddd;
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          z-index: 1000;
          min-width: 150px;
        }

        .dropdown-menu button {
          display: block;
          width: 100%;
          text-align: left;
          background: none;
          border: none;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 14px;
          transition: background-color 0.2s;
        }

        .dropdown-menu button:hover {
          background: #f5f5f5;
        }

        .dropdown-menu button:first-child {
          border-radius: 6px 6px 0 0;
        }

        .dropdown-menu button:last-child {
          border-radius: 0 0 6px 6px;
        }

        .view-mode-toggle {
          display: flex;
          border: 1px solid #ddd;
          border-radius: 6px;
          overflow: hidden;
        }

        .view-mode-toggle button {
          background: #f5f5f5;
          border: none;
          padding: 8px 16px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
          border-right: 1px solid #ddd;
        }

        .view-mode-toggle button:last-child {
          border-right: none;
        }

        .view-mode-toggle button.active {
          background: #007bff;
          color: white;
        }

        .view-mode-toggle button:not(.active):hover {
          background: #e8e8e8;
        }

        .search-bar {
          margin-bottom: 16px;
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .search-input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 14px;
        }

        .search-input:focus {
          outline: none;
          border-color: #007bff;
          box-shadow: 0 0 0 2px rgba(0,123,255,0.25);
        }

        .search-results {
          font-size: 12px;
          color: #666;
          white-space: nowrap;
        }

        .transcript-content {
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          overflow: hidden;
        }

        .transcript-text {
          white-space: pre-wrap;
          word-wrap: break-word;
          max-height: 70vh;
          overflow: auto;
          padding: 16px;
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
          font-size: 14px;
          line-height: 1.6;
          background: #fafafa;
        }

        .transcript-segments {
          max-height: 70vh;
          overflow-y: auto;
        }

        .segment {
          display: flex;
          padding: 12px 16px;
          border-bottom: 1px solid #f0f0f0;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .segment:hover {
          background: #f8f8f8;
        }

        .segment.highlighted {
          background: #e3f2fd;
          border-left: 3px solid #2196f3;
        }

        .segment:last-child {
          border-bottom: none;
        }

        .segment-time {
          font-family: monospace;
          font-size: 12px;
          color: #666;
          min-width: 100px;
          margin-right: 16px;
          flex-shrink: 0;
        }

        .segment-text {
          flex: 1;
          font-size: 14px;
          line-height: 1.5;
          color: #333;
        }

        .no-segments {
          padding: 40px;
          text-align: center;
          color: #666;
          font-style: italic;
        }

        @media (max-width: 768px) {
          .transcript-toolbar {
            flex-direction: column;
            align-items: stretch;
          }

          .toolbar-section {
            flex-wrap: wrap;
            justify-content: center;
          }

          .stats {
            justify-content: center;
          }

          .search-bar {
            flex-direction: column;
            align-items: stretch;
          }

          .segment {
            flex-direction: column;
            gap: 8px;
          }

          .segment-time {
            min-width: auto;
            margin-right: 0;
          }

          .transcript-text {
            font-size: 16px; /* Larger text on mobile */
          }
        }
      `}</style>
    </div>
  )
}
