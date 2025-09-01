import React, { useState, useEffect } from 'react'
import { StorageInfo, MediaMeta } from '../types'
import { clearAllCachedModels, getCachedModelsSize } from '../whisper/loader'
import { 
  getStorageInfo, 
  listItems, 
  deleteItem, 
  clearAllData, 
  formatBytes, 
  formatDuration 
} from '../store/db'

interface StorageManagerProps {
  onStorageChange?: () => void
  onError?: (error: Error) => void
}

export default function StorageManager({ onStorageChange, onError }: StorageManagerProps) {
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)
  const [items, setItems] = useState<MediaMeta[]>([])
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [showConfirmClear, setShowConfirmClear] = useState(false)
  const [modelBytes, setModelBytes] = useState<number>(0)
  const [cacheInfo, setCacheInfo] = useState<{ name: string; entries: number }[]>([])

  useEffect(() => {
    loadData()
    refreshModelSize()
    refreshCacheInfo()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [info, itemsList] = await Promise.all([
        getStorageInfo(),
        listItems()
      ])
      setStorageInfo(info)
      setItems(itemsList)
    } catch (error) {
      console.error('Failed to load storage data:', error)
      onError?.(error as Error)
    } finally {
      setIsLoading(false)
    }
  }

  // --- Cache and SW helpers ---
  const sendMessageToSW = async (message: any): Promise<any> => {
    if (!('serviceWorker' in navigator)) return null
    const reg = await navigator.serviceWorker.getRegistration()
    const sw = reg?.active || navigator.serviceWorker.controller
    if (!sw) return null
    return new Promise((resolve) => {
      const channel = new MessageChannel()
      channel.port1.onmessage = (event) => resolve(event.data)
      sw.postMessage(message, [channel.port2])
    })
  }

  const refreshCacheInfo = async () => {
    try {
      const resp = await sendMessageToSW({ type: 'GET_CACHE_INFO' })
      if (resp?.caches) setCacheInfo(resp.caches)
    } catch {}
  }

  const refreshModelSize = async () => {
    try {
      const size = await getCachedModelsSize()
      setModelBytes(size)
    } catch { setModelBytes(0) }
  }

  const handleClearModelCache = async () => {
    if (!confirm('Clear cached Whisper models? They will re-download next time.')) return
    setIsLoading(true)
    try {
      await clearAllCachedModels() // IndexedDB models
      await sendMessageToSW({ type: 'PURGE_MODELS' }) // SW caches for model files
      await refreshModelSize()
      await refreshCacheInfo()
      alert('Model cache cleared')
    } catch (error) {
      onError?.(error as Error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClearAllCaches = async () => {
    if (!confirm('Clear all Service Worker caches?')) return
    setIsLoading(true)
    try {
      await sendMessageToSW({ type: 'CLEAR_ALL_CACHES' })
      await refreshCacheInfo()
      alert('All caches cleared')
    } catch (error) {
      onError?.(error as Error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectAll = () => {
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(items.map(item => item.id)))
    }
  }

  const handleSelectItem = (id: string) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedItems(newSelected)
  }

  const handleDeleteSelected = async () => {
    if (selectedItems.size === 0) return

    const itemsToDelete = items.filter(item => selectedItems.has(item.id))
    const confirmMessage = `Delete ${selectedItems.size} selected item(s)?\n\n` +
      itemsToDelete.map(item => `• ${item.name}`).join('\n') +
      '\n\nThis cannot be undone.'

    if (!confirm(confirmMessage)) return

    setIsLoading(true)
    let deletedCount = 0
    let errors: string[] = []

    for (const id of selectedItems) {
      try {
        await deleteItem(id)
        deletedCount++
      } catch (error) {
        console.error(`Failed to delete item ${id}:`, error)
        errors.push(`Failed to delete item: ${(error as Error).message}`)
      }
    }

    setSelectedItems(new Set())
    await loadData()
    onStorageChange?.()

    if (errors.length > 0) {
      onError?.(new Error(`${errors.length} deletion(s) failed:\n${errors.join('\n')}`))
    } else if (deletedCount > 0) {
      alert(`Successfully deleted ${deletedCount} item(s)`)
    }
  }

  const handleClearAll = async () => {
    if (!showConfirmClear) {
      setShowConfirmClear(true)
      return
    }

    setIsLoading(true)
    try {
      await clearAllData()
      await loadData()
      onStorageChange?.()
      setShowConfirmClear(false)
      alert('All data cleared successfully')
    } catch (error) {
      console.error('Failed to clear all data:', error)
      onError?.(error as Error)
    }
  }

  const getStorageUsageColor = (usedBytes: number, availableBytes?: number): string => {
    if (!availableBytes) return '#4CAF50'
    
    const usageRatio = usedBytes / (usedBytes + availableBytes)
    
    if (usageRatio > 0.9) return '#f44336'
    if (usageRatio > 0.7) return '#ff9800'
    return '#4CAF50'
  }

  if (isLoading) {
    return (
      <div className="storage-manager loading">
        <div className="loading-spinner">⏳ Loading storage data...</div>
        <style jsx>{`
          .storage-manager.loading {
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
    <div className="storage-manager">
      {/* Storage Overview */}
      <div className="storage-overview">
        <h3>Storage Management</h3>

        {/* Cache Controls */}
        <div className="cache-controls">
          <div className="cache-stats">
            <div>Models Cache: <strong>{formatBytes(modelBytes)}</strong></div>
            {cacheInfo.length > 0 && (
              <div className="sw-caches">
                SW Caches: {cacheInfo.map(c => `${c.name}(${c.entries})`).join(', ')}
              </div>
            )}
          </div>
          <div className="cache-buttons">
            <button onClick={refreshCacheInfo}>↻ Refresh</button>
            <button onClick={handleClearModelCache}>🧹 Clear Model Cache</button>
            <button onClick={handleClearAllCaches}>🗑️ Clear SW Caches</button>
          </div>
        </div>
        
        {storageInfo && (
          <div className="storage-stats">
            <div className="stat-card">
              <div className="stat-value">{storageInfo.totalItems}</div>
              <div className="stat-label">Total Items</div>
            </div>
            
            <div className="stat-card">
              <div className="stat-value">{formatBytes(storageInfo.usedBytes)}</div>
              <div className="stat-label">Used Space</div>
            </div>
            
            {storageInfo.availableBytes && (
              <div className="stat-card">
                <div className="stat-value">{formatBytes(storageInfo.availableBytes)}</div>
                <div className="stat-label">Available</div>
              </div>
            )}

            <div className="stat-card">
              <div className="stat-value">{storageInfo.pcmItems}</div>
              <div className="stat-label">PCM Files</div>
            </div>
          </div>
        )}

        {/* Storage Usage Bar */}
        {storageInfo?.availableBytes && (
          <div className="usage-bar">
            <div className="usage-label">Storage Usage</div>
            <div className="usage-progress">
              <div 
                className="usage-fill"
                style={{
                  width: `${(storageInfo.usedBytes / (storageInfo.usedBytes + storageInfo.availableBytes)) * 100}%`,
                  backgroundColor: getStorageUsageColor(storageInfo.usedBytes, storageInfo.availableBytes)
                }}
              />
            </div>
            <div className="usage-text">
              {((storageInfo.usedBytes / (storageInfo.usedBytes + storageInfo.availableBytes)) * 100).toFixed(1)}% used
            </div>
          </div>
        )}
      </div>

      {/* Bulk Actions */}
      <div className="bulk-actions">
        <div className="selection-info">
          <label className="select-all">
            <input
              type="checkbox"
              checked={selectedItems.size === items.length && items.length > 0}
              indeterminate={selectedItems.size > 0 && selectedItems.size < items.length}
              onChange={handleSelectAll}
            />
            Select All ({selectedItems.size} selected)
          </label>
        </div>

        <div className="action-buttons">
          <button
            className="delete-selected-btn"
            onClick={handleDeleteSelected}
            disabled={selectedItems.size === 0}
          >
            🗑️ Delete Selected ({selectedItems.size})
          </button>

          <button
            className={`clear-all-btn ${showConfirmClear ? 'confirm' : ''}`}
            onClick={handleClearAll}
            onBlur={() => setShowConfirmClear(false)}
          >
            {showConfirmClear ? '⚠️ Confirm Clear All' : '🗑️ Clear All Data'}
          </button>
        </div>
      </div>

      {/* Items List */}
      <div className="items-section">
        <h4>All Items ({items.length})</h4>
        
        {items.length === 0 ? (
          <div className="no-items">
            <p>No items stored. Import some audio/video files to get started.</p>
          </div>
        ) : (
          <div className="items-table">
            <div className="table-header">
              <div className="col-select">Select</div>
              <div className="col-name">Name</div>
              <div className="col-duration">Duration</div>
              <div className="col-size">Size</div>
              <div className="col-date">Imported</div>
              <div className="col-actions">Actions</div>
            </div>
            
            {items.map((item) => (
              <div key={item.id} className="table-row">
                <div className="col-select">
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.id)}
                    onChange={() => handleSelectItem(item.id)}
                  />
                </div>
                
                <div className="col-name" title={item.name}>
                  {item.name}
                </div>
                
                <div className="col-duration">
                  {formatDuration(item.durationSec)}
                </div>
                
                <div className="col-size">
                  {formatBytes(item.size)}
                </div>
                
                <div className="col-date">
                  {item.importedAt.toLocaleDateString()}
                </div>
                
                <div className="col-actions">
                  <button
                    className="delete-item-btn"
                    onClick={async () => {
                      if (confirm(`Delete "${item.name}"? This cannot be undone.`)) {
                        try {
                          await deleteItem(item.id)
                          await loadData()
                          onStorageChange?.()
                        } catch (error) {
                          onError?.(error as Error)
                        }
                      }
                    }}
                    title="Delete this item"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inline Styles */}
      <style jsx>{`
        .storage-manager {
          max-width: 800px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .cache-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          margin-bottom: 12px;
          background: #f1f3f5;
          border: 1px solid #e9ecef;
          border-radius: 8px;
        }
        .cache-buttons button { margin-left: 8px; }

        .storage-overview h3 {
          margin: 0 0 20px 0;
          color: #333;
        }

        .storage-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 16px;
          margin-bottom: 20px;
        }

        .stat-card {
          background: #f8f9fa;
          padding: 16px;
          border-radius: 8px;
          text-align: center;
          border: 1px solid #e9ecef;
        }

        .stat-value {
          font-size: 24px;
          font-weight: bold;
          color: #2c3e50;
          margin-bottom: 4px;
        }

        .stat-label {
          font-size: 12px;
          color: #6c757d;
          text-transform: uppercase;
        }

        .usage-bar {
          margin-bottom: 24px;
        }

        .usage-label {
          font-size: 14px;
          color: #495057;
          margin-bottom: 8px;
        }

        .usage-progress {
          height: 12px;
          background: #e9ecef;
          border-radius: 6px;
          overflow: hidden;
          margin-bottom: 4px;
        }

        .usage-fill {
          height: 100%;
          transition: width 0.3s ease, background-color 0.3s ease;
        }

        .usage-text {
          font-size: 12px;
          color: #6c757d;
          text-align: right;
        }

        .bulk-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          background: #f8f9fa;
          border-radius: 8px;
          margin-bottom: 20px;
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
          gap: 12px;
        }

        .delete-selected-btn {
          background: #dc3545;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }

        .delete-selected-btn:disabled {
          background: #6c757d;
          cursor: not-allowed;
          opacity: 0.6;
        }

        .delete-selected-btn:not(:disabled):hover {
          background: #c82333;
          transform: translateY(-1px);
        }

        .clear-all-btn {
          background: #6c757d;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }

        .clear-all-btn:hover {
          background: #545b62;
        }

        .clear-all-btn.confirm {
          background: #dc3545;
          animation: pulse 0.5s;
        }

        .items-section h4 {
          margin: 0 0 16px 0;
          color: #333;
        }

        .no-items {
          text-align: center;
          color: #6c757d;
          font-style: italic;
          padding: 40px 20px;
        }

        .items-table {
          border: 1px solid #dee2e6;
          border-radius: 8px;
          overflow: hidden;
          background: white;
        }

        .table-header {
          display: grid;
          grid-template-columns: 60px 1fr 80px 80px 100px 80px;
          gap: 12px;
          padding: 12px 16px;
          background: #f8f9fa;
          font-weight: 600;
          font-size: 12px;
          color: #495057;
          text-transform: uppercase;
          border-bottom: 1px solid #dee2e6;
        }

        .table-row {
          display: grid;
          grid-template-columns: 60px 1fr 80px 80px 100px 80px;
          gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid #f1f3f4;
          align-items: center;
          transition: background-color 0.2s;
        }

        .table-row:hover {
          background: #f8f9fa;
        }

        .table-row:last-child {
          border-bottom: none;
        }

        .col-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 14px;
        }

        .col-duration, .col-size, .col-date {
          font-size: 13px;
          color: #6c757d;
        }

        .col-actions {
          text-align: center;
        }

        .delete-item-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
          transition: background-color 0.2s;
        }

        .delete-item-btn:hover {
          background: #ffebee;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }

        @media (max-width: 768px) {
          .storage-stats {
            grid-template-columns: repeat(2, 1fr);
          }

          .bulk-actions {
            flex-direction: column;
            gap: 12px;
            align-items: stretch;
          }

          .action-buttons {
            justify-content: center;
          }

          .table-header,
          .table-row {
            grid-template-columns: 1fr;
            gap: 4px;
          }

          .col-select {
            grid-row: 1;
          }

          .col-name {
            grid-row: 2;
            font-weight: 500;
          }

          .col-duration,
          .col-size,
          .col-date {
            grid-row: 3;
            display: inline;
          }

          .col-actions {
            grid-row: 4;
            text-align: right;
          }
        }
      `}</style>
    </div>
  )
}
