/**
 * Summary History Component
 * Displays and manages saved summaries
 */

import React, { useState, useEffect, useCallback } from 'react'
import { 
  listSummaries, 
  deleteSummary, 
  searchSummaries, 
  getSummaryStats,
  batchDeleteSummaries,
  exportSummary,
  type SummaryItem,
  type SummarySearchResult 
} from '../store/summaries'
import SummaryView from './SummaryView'
import { downloadText } from '../utils/download'

/**
 * Summary history props
 */
interface SummaryHistoryProps {
  className?: string
  onSummarySelect?: (summary: SummaryItem) => void
  showSearch?: boolean
  showStats?: boolean
  maxItems?: number
  compact?: boolean
}

/**
 * Summary history component
 */
export const SummaryHistory: React.FC<SummaryHistoryProps> = ({
  className = '',
  onSummarySelect,
  showSearch = true,
  showStats = true,
  maxItems,
  compact = false
}) => {
  const [summaries, setSummaries] = useState<SummaryItem[]>([])
  const [searchResults, setSearchResults] = useState<SummarySearchResult[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [stats, setStats] = useState<any>(null)
  const [sortBy, setSortBy] = useState<'createdAt' | 'modifiedAt' | 'title'>('modifiedAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [filterSource, setFilterSource] = useState<'all' | 'manual' | 'auto'>('all')

  // Load summaries
  const loadSummaries = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const options: any = {
        sortBy,
        sortOrder,
        limit: maxItems
      }

      if (filterSource !== 'all') {
        options.source = filterSource
      }

      const results = await listSummaries(options)
      setSummaries(results)

      if (showStats) {
        const statsData = await getSummaryStats()
        setStats(statsData)
      }
    } catch (err) {
      console.error('Failed to load summaries:', err)
      setError('Failed to load summaries')
    } finally {
      setIsLoading(false)
    }
  }, [sortBy, sortOrder, filterSource, maxItems, showStats])

  // Search summaries
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    
    try {
      const results = await searchSummaries(query, {
        caseSensitive: false,
        searchInTitle: true,
        searchInContent: true,
        limit: 20
      })
      
      setSearchResults(results)
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setIsSearching(false)
    }
  }, [])

  // Delete summary
  const handleDelete = useCallback(async (summaryId: string) => {
    try {
      await deleteSummary(summaryId)
      setSummaries(prev => prev.filter(s => s.id !== summaryId))
      setSearchResults(prev => prev.filter(r => r.item.id !== summaryId))
      setSelectedItems(prev => {
        const newSet = new Set(prev)
        newSet.delete(summaryId)
        return newSet
      })
    } catch (err) {
      console.error('Failed to delete summary:', err)
      setError('Failed to delete summary')
    }
  }, [])

  // Batch delete
  const handleBatchDelete = useCallback(async () => {
    if (selectedItems.size === 0) return

    try {
      await batchDeleteSummaries(Array.from(selectedItems))
      setSummaries(prev => prev.filter(s => !selectedItems.has(s.id)))
      setSearchResults(prev => prev.filter(r => !selectedItems.has(r.item.id)))
      setSelectedItems(new Set())
    } catch (err) {
      console.error('Failed to delete summaries:', err)
      setError('Failed to delete summaries')
    }
  }, [selectedItems])

  // Export summary
  const handleExport = useCallback((summary: SummaryItem, format: 'txt' | 'json') => {
    try {
      const blob = exportSummary(summary, format)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${summary.title.replace(/[^a-zA-Z0-9]/g, '_')}.${format}`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export summary:', err)
      setError('Failed to export summary')
    }
  }, [])

  // Toggle selection
  const toggleSelection = useCallback((summaryId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(summaryId)) {
        newSet.delete(summaryId)
      } else {
        newSet.add(summaryId)
      }
      return newSet
    })
  }, [])

  // Select all/none
  const toggleSelectAll = useCallback(() => {
    const currentItems = searchQuery ? searchResults.map(r => r.item.id) : summaries.map(s => s.id)
    
    if (selectedItems.size === currentItems.length) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(currentItems))
    }
  }, [summaries, searchResults, searchQuery, selectedItems.size])

  // Load summaries on component mount and when dependencies change
  useEffect(() => {
    loadSummaries()
  }, [loadSummaries])

  // Search with debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      handleSearch(searchQuery)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchQuery, handleSearch])

  const currentItems = searchQuery ? searchResults.map(r => r.item) : summaries
  const hasSelections = selectedItems.size > 0

  if (isLoading) {
    return (
      <div className={`summary-history ${className}`}>
        <div className="loading-state">
          <div className="spinner" />
          <span>Loading summaries...</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`summary-history ${compact ? 'compact' : ''} ${className}`}>
      {/* Header */}
      <div className="history-header">
        <div className="header-left">
          <h3>Summary History</h3>
          {stats && !compact && (
            <div className="stats-summary">
              <span>{stats.totalSummaries} summaries</span>
              <span>•</span>
              <span>Avg. {Math.round(stats.averageCompressionRatio * 100)}% compression</span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="header-controls">
          {hasSelections && (
            <button onClick={handleBatchDelete} className="batch-delete-btn">
              🗑️ Delete ({selectedItems.size})
            </button>
          )}
          
          <button onClick={loadSummaries} className="refresh-btn" disabled={isLoading}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      {showSearch && !compact && (
        <div className="search-section">
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search summaries..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {isSearching && <div className="search-spinner" />}
          </div>

          <div className="filters">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="filter-select"
            >
              <option value="modifiedAt">Modified</option>
              <option value="createdAt">Created</option>
              <option value="title">Title</option>
            </select>

            <select
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value as any)}
              className="filter-select"
            >
              <option value="desc">Newest</option>
              <option value="asc">Oldest</option>
            </select>

            <select
              value={filterSource}
              onChange={e => setFilterSource(e.target.value as any)}
              className="filter-select"
            >
              <option value="all">All Sources</option>
              <option value="manual">Manual</option>
              <option value="auto">Auto</option>
            </select>
          </div>
        </div>
      )}

      {/* Batch Actions */}
      {!compact && currentItems.length > 0 && (
        <div className="batch-controls">
          <label className="select-all">
            <input
              type="checkbox"
              checked={selectedItems.size === currentItems.length && currentItems.length > 0}
              onChange={toggleSelectAll}
            />
            Select All ({currentItems.length})
          </label>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="error-message">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Summary List */}
      <div className="summaries-list">
        {currentItems.length === 0 ? (
          <div className="empty-state">
            {searchQuery ? (
              <>
                <span>🔍</span>
                <p>No summaries found for "{searchQuery}"</p>
              </>
            ) : (
              <>
                <span>📝</span>
                <p>No summaries saved yet</p>
                <small>Summaries will appear here once generated</small>
              </>
            )}
          </div>
        ) : (
          currentItems.map(summary => (
            <div key={summary.id} className="summary-item">
              {!compact && (
                <div className="item-controls">
                  <input
                    type="checkbox"
                    checked={selectedItems.has(summary.id)}
                    onChange={() => toggleSelection(summary.id)}
                    className="item-checkbox"
                  />
                </div>
              )}

              <div className="summary-wrapper" onClick={() => onSummarySelect?.(summary)}>
                <SummaryView
                  summary={summary.summary}
                  title={summary.title}
                  transcriptId={summary.transcriptId}
                  compact={compact}
                  showActions={!compact}
                />
              </div>

              {!compact && (
                <div className="item-actions">
                  <button
                    onClick={() => handleExport(summary, 'txt')}
                    className="export-btn"
                    title="Export as text"
                  >
                    💾
                  </button>
                  
                  <button
                    onClick={() => handleDelete(summary.id)}
                    className="delete-btn"
                    title="Delete summary"
                  >
                    🗑️
                  </button>
                </div>
              )}

              {!compact && (
                <div className="item-meta">
                  <span className="date">
                    {summary.metadata.createdAt.toLocaleDateString()}
                  </span>
                  <span className="source">{summary.metadata.source}</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Load More */}
      {!compact && maxItems && summaries.length >= maxItems && (
        <div className="load-more">
          <button onClick={() => loadSummaries()} className="load-more-btn">
            Load More
          </button>
        </div>
      )}

      <style jsx>{`
        .summary-history {
          background: #f8f9fa;
          border-radius: 12px;
          padding: 1.5rem;
          margin: 1rem 0;
        }

        .summary-history.compact {
          padding: 1rem;
          background: transparent;
        }

        .history-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid #e9ecef;
        }

        .summary-history.compact .history-header {
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
        }

        .header-left h3 {
          margin: 0 0 0.5rem 0;
          color: #495057;
          font-size: 1.25rem;
        }

        .stats-summary {
          display: flex;
          gap: 0.5rem;
          font-size: 0.875rem;
          color: #6c757d;
          align-items: center;
        }

        .header-controls {
          display: flex;
          gap: 0.75rem;
          align-items: center;
        }

        .batch-delete-btn {
          background: #dc3545;
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.875rem;
        }

        .refresh-btn {
          background: #f8f9fa;
          border: 1px solid #dee2e6;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.875rem;
          color: #495057;
        }

        .refresh-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .search-section {
          margin-bottom: 1.5rem;
          padding: 1rem;
          background: white;
          border-radius: 8px;
          border: 1px solid #e9ecef;
        }

        .search-bar {
          position: relative;
          margin-bottom: 1rem;
        }

        .search-input {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #ced4da;
          border-radius: 6px;
          font-size: 1rem;
        }

        .search-spinner {
          position: absolute;
          right: 0.75rem;
          top: 50%;
          transform: translateY(-50%);
          width: 16px;
          height: 16px;
          border: 2px solid #f3f3f3;
          border-top: 2px solid #007bff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .filters {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .filter-select {
          padding: 0.5rem;
          border: 1px solid #ced4da;
          border-radius: 4px;
          font-size: 0.875rem;
        }

        .batch-controls {
          margin-bottom: 1rem;
          padding: 0.75rem 1rem;
          background: #e7f3ff;
          border-radius: 6px;
          border: 1px solid #b6e3ff;
        }

        .select-all {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          cursor: pointer;
        }

        .error-message {
          background: #f8d7da;
          color: #721c24;
          padding: 1rem;
          border-radius: 6px;
          margin-bottom: 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .error-message button {
          background: none;
          border: none;
          color: #721c24;
          cursor: pointer;
          font-size: 1.2rem;
        }

        .summaries-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .summary-history.compact .summaries-list {
          gap: 0.5rem;
        }

        .summary-item {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          background: white;
          border-radius: 8px;
          border: 1px solid #e9ecef;
          overflow: hidden;
        }

        .summary-history.compact .summary-item {
          background: transparent;
          border: none;
        }

        .item-controls {
          padding: 1rem 0 1rem 1rem;
          display: flex;
          align-items: flex-start;
        }

        .item-checkbox {
          margin-top: 0.5rem;
        }

        .summary-wrapper {
          flex: 1;
          cursor: pointer;
        }

        .summary-wrapper:hover {
          background: #f8f9fa;
        }

        .item-actions {
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          border-left: 1px solid #f1f3f4;
        }

        .export-btn,
        .delete-btn {
          background: none;
          border: 1px solid #dee2e6;
          padding: 0.5rem;
          border-radius: 4px;
          cursor: pointer;
          font-size: 1rem;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .export-btn:hover {
          background: #f0fdf4;
          border-color: #16a34a;
        }

        .delete-btn:hover {
          background: #fee2e2;
          border-color: #dc2626;
        }

        .item-meta {
          padding: 0.5rem 1rem 1rem;
          display: flex;
          gap: 1rem;
          font-size: 0.75rem;
          color: #6c757d;
          border-top: 1px solid #f1f3f4;
        }

        .empty-state {
          text-align: center;
          padding: 3rem 2rem;
          color: #6c757d;
        }

        .empty-state span {
          font-size: 3rem;
          display: block;
          margin-bottom: 1rem;
          opacity: 0.5;
        }

        .empty-state p {
          margin: 0 0 0.5rem 0;
          font-size: 1.125rem;
        }

        .empty-state small {
          font-size: 0.875rem;
          opacity: 0.7;
        }

        .loading-state {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          padding: 2rem;
          color: #6c757d;
        }

        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid #f3f3f3;
          border-top: 2px solid #007bff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .load-more {
          text-align: center;
          margin-top: 2rem;
        }

        .load-more-btn {
          background: #007bff;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .summary-history {
            padding: 1rem;
          }

          .history-header {
            flex-direction: column;
            gap: 1rem;
            align-items: flex-start;
          }

          .header-controls {
            width: 100%;
            justify-content: space-between;
          }

          .filters {
            justify-content: space-between;
          }

          .filter-select {
            flex: 1;
          }

          .summary-item {
            flex-direction: column;
          }

          .item-actions {
            flex-direction: row;
            justify-content: center;
            border-left: none;
            border-top: 1px solid #f1f3f4;
          }
        }
      `}</style>
    </div>
  )
}

export default SummaryHistory