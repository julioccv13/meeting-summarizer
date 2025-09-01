import React, { useState, useEffect, useCallback } from 'react'
import { 
  listTranscripts, 
  deleteTranscript, 
  getTranscriptStats, 
  searchTranscripts,
  exportTranscript,
  clearAllTranscripts
} from '../store/transcripts'
import { downloadText, downloadSRT, downloadJSON, showToast, formatFileSize } from '../utils/download'
import type { TranscriptItem, TranscriptSearchResult } from '../store/transcripts'

interface TranscriptHistoryProps {
  onSelectTranscript?: (transcript: TranscriptItem) => void
  onError?: (error: Error) => void
}

type SortBy = 'createdAt' | 'modifiedAt' | 'title'
type SortOrder = 'asc' | 'desc'
type FilterBy = 'all' | 'recording' | 'imported'

export default function TranscriptHistory({ onSelectTranscript, onError }: TranscriptHistoryProps) {
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([])
  const [filteredTranscripts, setFilteredTranscripts] = useState<TranscriptItem[]>([])
  const [searchResults, setSearchResults] = useState<TranscriptSearchResult[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('modifiedAt')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [filterBy, setFilterBy] = useState<FilterBy>('all')
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [showConfirmClear, setShowConfirmClear] = useState(false)
  const [stats, setStats] = useState<any>(null)

  // Load transcripts and stats
  useEffect(() => {
    loadData()
  }, [sortBy, sortOrder, filterBy])

  // Handle search
  useEffect(() => {
    handleSearch()
  }, [searchTerm, transcripts])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [transcriptList, transcriptStats] = await Promise.all([
        listTranscripts({
          sortBy,
          sortOrder,
          audioSource: filterBy === 'all' ? undefined : filterBy,
        }),
        getTranscriptStats()
      ])
      
      setTranscripts(transcriptList)
      setStats(transcriptStats)
    } catch (error) {
      console.error('Failed to load transcripts:', error)
      onError?.(error as Error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setFilteredTranscripts(transcripts)
      setSearchResults([])
      return
    }

    try {
      const results = await searchTranscripts(searchTerm, { limit: 50 })
      setSearchResults(results)
      setFilteredTranscripts(results.map(result => result.item))
    } catch (error) {
      console.error('Search failed:', error)
      setFilteredTranscripts(transcripts)
    }
  }

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) {
      return
    }

    try {
      await deleteTranscript(id)
      await loadData()
      setSelectedItems(prev => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
      showToast('Transcript deleted')
    } catch (error) {
      console.error('Delete failed:', error)
      onError?.(error as Error)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) return

    const transcriptNames = Array.from(selectedItems)
      .map(id => transcripts.find(t => t.id === id)?.title || 'Unknown')
      .slice(0, 5) // Show max 5 names
    
    const nameList = transcriptNames.join(', ') + 
      (selectedItems.size > 5 ? ` and ${selectedItems.size - 5} more` : '')

    if (!confirm(`Delete ${selectedItems.size} transcript(s)?\n\n${nameList}\n\nThis cannot be undone.`)) {
      return
    }

    const failedDeletes: string[] = []
    
    for (const id of selectedItems) {
      try {
        await deleteTranscript(id)
      } catch (error) {
        console.error(`Failed to delete ${id}:`, error)
        failedDeletes.push(id)
      }
    }

    await loadData()
    setSelectedItems(new Set())

    if (failedDeletes.length === 0) {
      showToast(`Deleted ${selectedItems.size} transcript(s)`)
    } else {
      showToast(`Deleted ${selectedItems.size - failedDeletes.length} transcript(s), ${failedDeletes.length} failed`)
    }
  }

  const handleClearAll = async () => {
    if (!showConfirmClear) {
      setShowConfirmClear(true)
      return
    }

    try {
      await clearAllTranscripts()
      await loadData()
      setSelectedItems(new Set())
      setShowConfirmClear(false)
      showToast('All transcripts cleared')
    } catch (error) {
      console.error('Clear all failed:', error)
      onError?.(error as Error)
    }
  }

  const handleSelectAll = () => {
    if (selectedItems.size === filteredTranscripts.length && filteredTranscripts.length > 0) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(filteredTranscripts.map(t => t.id)))
    }
  }

  const handleItemSelect = (id: string) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedItems(newSelected)
  }

  const handleExport = (transcript: TranscriptItem, format: 'txt' | 'srt' | 'json') => {
    try {
      const blob = exportTranscript(transcript, format)
      const fileName = transcript.title.replace(/[<>:"/\\|?*]/g, '_')
      
      // Create download link
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${fileName}.${format}`
      link.click()
      URL.revokeObjectURL(url)
      
      showToast(`Exported as ${format.toUpperCase()}`)
    } catch (error) {
      console.error('Export failed:', error)
      onError?.(error as Error)
    }
  }

  const formatDate = (date: Date): string => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays === 1) {
      return 'Yesterday'
    } else if (diffDays < 7) {
      return `${diffDays} days ago`
    } else {
      return date.toLocaleDateString()
    }
  }

  const displayTranscripts = searchTerm.trim() ? filteredTranscripts : transcripts

  if (isLoading) {
    return (
      <div className="card transcript-history loading">
        <div className="loading-spinner">📚 Loading transcript history...</div>
        <style jsx>{`
          .transcript-history.loading {
            text-align: center;
            padding: 40px;
            color: #666;
          }
          .loading-spinner {
            font-size: 16px;
          }
        `}</style>
      </div>
    )
  }

  return (
    <div className="card transcript-history">
      <h3>Transcript History</h3>

      {/* Stats Summary */}
      {stats && (
        <div className="stats-summary">
          <div className="stat-item">
            <span className="stat-number">{stats.totalTranscripts}</span>
            <span className="stat-label">Total</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">{stats.totalWords.toLocaleString()}</span>
            <span className="stat-label">Words</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">{Math.round(stats.averageWordsPerTranscript)}</span>
            <span className="stat-label">Avg/transcript</span>
          </div>
        </div>
      )}

      {/* Search and Controls */}
      <div className="controls">
        <div className="search-section">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search transcripts..."
            className="search-input"
          />
          {searchResults.length > 0 && (
            <div className="search-info">
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
            </div>
          )}
        </div>

        <div className="filter-sort">
          <select
            value={filterBy}
            onChange={(e) => setFilterBy(e.target.value as FilterBy)}
            className="filter-select"
          >
            <option value="all">All Sources</option>
            <option value="recording">Recordings</option>
            <option value="imported">Imported Files</option>
          </select>

          <select
            value={`${sortBy}_${sortOrder}`}
            onChange={(e) => {
              const [by, order] = e.target.value.split('_')
              setSortBy(by as SortBy)
              setSortOrder(order as SortOrder)
            }}
            className="sort-select"
          >
            <option value="modifiedAt_desc">Recent First</option>
            <option value="modifiedAt_asc">Oldest First</option>
            <option value="createdAt_desc">Created (New)</option>
            <option value="createdAt_asc">Created (Old)</option>
            <option value="title_asc">Title A-Z</option>
            <option value="title_desc">Title Z-A</option>
          </select>
        </div>
      </div>

      {/* Bulk Actions */}
      {displayTranscripts.length > 0 && (
        <div className="bulk-actions">
          <div className="selection-info">
            <label className="select-all">
              <input
                type="checkbox"
                checked={selectedItems.size === displayTranscripts.length && displayTranscripts.length > 0}
                onChange={handleSelectAll}
              />
              Select All ({selectedItems.size} selected)
            </label>
          </div>

          <div className="action-buttons">
            <button
              className="bulk-delete-btn"
              onClick={handleBulkDelete}
              disabled={selectedItems.size === 0}
            >
              🗑️ Delete Selected ({selectedItems.size})
            </button>

            <button
              className={`clear-all-btn ${showConfirmClear ? 'confirm' : ''}`}
              onClick={handleClearAll}
              onBlur={() => setShowConfirmClear(false)}
            >
              {showConfirmClear ? '⚠️ Confirm Clear All' : '🗑️ Clear All'}
            </button>
          </div>
        </div>
      )}

      {/* Transcript List */}
      <div className="transcript-list">
        {displayTranscripts.length === 0 ? (
          <div className="no-transcripts">
            <div className="no-transcripts-icon">📄</div>
            <h4>No Transcripts Found</h4>
            <p>
              {searchTerm.trim() 
                ? 'No transcripts match your search.' 
                : 'Create your first transcript by recording audio or importing a file.'
              }
            </p>
          </div>
        ) : (
          displayTranscripts.map((transcript) => (
            <div key={transcript.id} className="transcript-item">
              <div className="item-header">
                <input
                  type="checkbox"
                  checked={selectedItems.has(transcript.id)}
                  onChange={() => handleItemSelect(transcript.id)}
                />
                
                <div className="item-info">
                  <h4 
                    className="item-title"
                    onClick={() => onSelectTranscript?.(transcript)}
                  >
                    {transcript.title}
                  </h4>
                  <div className="item-meta">
                    <span>{transcript.metadata.wordCount} words</span>
                    <span>{formatDate(transcript.metadata.modifiedAt)}</span>
                    {transcript.metadata.language && (
                      <span>🌐 {transcript.metadata.language}</span>
                    )}
                    {transcript.metadata.audioSource && (
                      <span>
                        {transcript.metadata.audioSource === 'recording' ? '🎤' : '📁'} 
                        {transcript.metadata.audioSource}
                      </span>
                    )}
                  </div>
                </div>

                <div className="item-actions">
                  <div className="dropdown">
                    <button className="action-btn">⋮</button>
                    <div className="dropdown-menu">
                      <button onClick={() => onSelectTranscript?.(transcript)}>
                        👁️ View
                      </button>
                      <button onClick={() => handleExport(transcript, 'txt')}>
                        📄 Export TXT
                      </button>
                      {transcript.segments && (
                        <button onClick={() => handleExport(transcript, 'srt')}>
                          🎬 Export SRT
                        </button>
                      )}
                      <button onClick={() => handleExport(transcript, 'json')}>
                        📊 Export JSON
                      </button>
                      <button 
                        onClick={() => handleDelete(transcript.id, transcript.title)}
                        className="delete-action"
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Show search matches if searching */}
              {searchTerm.trim() && (
                <div className="search-matches">
                  {searchResults
                    .find(result => result.item.id === transcript.id)
                    ?.matches.slice(0, 3)
                    .map((match, index) => (
                      <div key={index} className="match-preview">
                        ...{match.context}...
                      </div>
                    ))
                  }
                </div>
              )}

              <div className="item-preview">
                {transcript.text.substring(0, 200)}
                {transcript.text.length > 200 && '...'}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Inline Styles */}
      <style jsx>{`
        .transcript-history {
          max-width: 800px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .stats-summary {
          display: flex;
          gap: 24px;
          margin-bottom: 24px;
          padding: 16px;
          background: #f8f9fa;
          border-radius: 8px;
          justify-content: center;
        }

        .stat-item {
          text-align: center;
        }

        .stat-number {
          display: block;
          font-size: 24px;
          font-weight: bold;
          color: #2c3e50;
        }

        .stat-label {
          display: block;
          font-size: 12px;
          color: #6c757d;
          text-transform: uppercase;
          margin-top: 4px;
        }

        .controls {
          display: flex;
          gap: 16px;
          margin-bottom: 20px;
          align-items: flex-start;
        }

        .search-section {
          flex: 1;
        }

        .search-input {
          width: 100%;
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

        .search-info {
          font-size: 12px;
          color: #666;
          margin-top: 4px;
        }

        .filter-sort {
          display: flex;
          gap: 8px;
        }

        .filter-select, .sort-select {
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 14px;
          background: white;
        }

        .bulk-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          background: #f8f9fa;
          border-radius: 6px;
          margin-bottom: 16px;
        }

        .select-all {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-size: 14px;
        }

        .action-buttons {
          display: flex;
          gap: 8px;
        }

        .bulk-delete-btn, .clear-all-btn {
          padding: 6px 12px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s;
        }

        .bulk-delete-btn {
          background: #dc3545;
          color: white;
        }

        .bulk-delete-btn:disabled {
          background: #6c757d;
          opacity: 0.6;
          cursor: not-allowed;
        }

        .clear-all-btn {
          background: #6c757d;
          color: white;
        }

        .clear-all-btn.confirm {
          background: #dc3545;
          animation: pulse 0.5s;
        }

        .transcript-list {
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          overflow: hidden;
        }

        .no-transcripts {
          text-align: center;
          padding: 60px 20px;
          color: #666;
        }

        .no-transcripts-icon {
          font-size: 48px;
          margin-bottom: 16px;
          opacity: 0.5;
        }

        .no-transcripts h4 {
          margin: 0 0 8px 0;
          color: #333;
        }

        .transcript-item {
          border-bottom: 1px solid #f0f0f0;
          transition: background-color 0.2s;
        }

        .transcript-item:hover {
          background: #fafafa;
        }

        .transcript-item:last-child {
          border-bottom: none;
        }

        .item-header {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 16px;
        }

        .item-info {
          flex: 1;
          min-width: 0;
        }

        .item-title {
          margin: 0 0 6px 0;
          font-size: 16px;
          font-weight: 600;
          color: #333;
          cursor: pointer;
          transition: color 0.2s;
          word-wrap: break-word;
        }

        .item-title:hover {
          color: #007bff;
        }

        .item-meta {
          display: flex;
          gap: 12px;
          font-size: 12px;
          color: #666;
          flex-wrap: wrap;
        }

        .item-preview {
          padding: 0 16px 16px 40px;
          font-size: 14px;
          color: #555;
          line-height: 1.4;
        }

        .search-matches {
          padding: 8px 16px 0 40px;
        }

        .match-preview {
          font-size: 12px;
          color: #666;
          background: #fff3cd;
          padding: 4px 8px;
          border-radius: 4px;
          margin-bottom: 4px;
        }

        .item-actions {
          position: relative;
        }

        .dropdown {
          position: relative;
        }

        .action-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 8px;
          border-radius: 4px;
          font-size: 16px;
          transition: background-color 0.2s;
        }

        .action-btn:hover {
          background: #e9ecef;
        }

        .dropdown:hover .dropdown-menu {
          display: block;
        }

        .dropdown-menu {
          display: none;
          position: absolute;
          top: 100%;
          right: 0;
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

        .dropdown-menu button.delete-action:hover {
          background: #ffebee;
          color: #c62828;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }

        @media (max-width: 768px) {
          .controls {
            flex-direction: column;
          }

          .filter-sort {
            width: 100%;
            justify-content: stretch;
          }

          .filter-select, .sort-select {
            flex: 1;
          }

          .bulk-actions {
            flex-direction: column;
            gap: 12px;
            align-items: stretch;
          }

          .action-buttons {
            justify-content: center;
          }

          .stats-summary {
            flex-direction: column;
            gap: 16px;
          }

          .item-header {
            flex-direction: column;
            gap: 8px;
          }

          .item-actions {
            align-self: flex-end;
          }

          .item-preview {
            padding-left: 16px;
          }
        }
      `}</style>
    </div>
  )
}