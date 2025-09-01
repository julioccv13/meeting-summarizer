import React, { useState, useCallback, useRef, useEffect } from 'react'
import { ImportedItem, MediaMeta, ImportProgress } from '../types'
import { importFiles, validateFiles } from '../import/importer'
import { listItems, deleteItem, formatBytes, formatDuration, getStorageInfo } from '../store/db'
import type { StorageInfo } from '../types'

interface ImportPanelProps {
  onImported?: (items: ImportedItem[]) => void
  onError?: (error: Error) => void
}

export default function ImportPanel({ onImported, onError }: ImportPanelProps) {
  const [importedItems, setImportedItems] = useState<MediaMeta[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)
  const [showStorageManager, setShowStorageManager] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load imported items on mount
  useEffect(() => {
    loadImportedItems()
    loadStorageInfo()
  }, [])

  const loadImportedItems = async () => {
    try {
      const items = await listItems()
      setImportedItems(items)
    } catch (error) {
      console.error('Failed to load imported items:', error)
    }
  }

  const loadStorageInfo = async () => {
    try {
      const info = await getStorageInfo()
      setStorageInfo(info)
    } catch (error) {
      console.error('Failed to load storage info:', error)
    }
  }

  const handleFileSelect = useCallback(async (files: FileList | File[]) => {
    if (isImporting) return

    const validation = validateFiles(files)
    
    // Show validation errors
    if (validation.invalid.length > 0) {
      const errorMessage = `Cannot import ${validation.invalid.length} file(s):\n` +
        validation.invalid.map(({ file, reason }) => `• ${file.name}: ${reason}`).join('\n')
      
      alert(errorMessage)
      
      if (validation.valid.length === 0) {
        return
      }
    }

    // Confirm import if large files
    if (validation.totalSize > 50 * 1024 * 1024) { // 50MB
      const sizeStr = formatBytes(validation.totalSize)
      const timeStr = validation.estimatedProcessingTime
      
      if (!confirm(`Import ${validation.valid.length} file(s) (${sizeStr})?\nEstimated processing time: ~${timeStr} seconds`)) {
        return
      }
    }

    setIsImporting(true)
    setImportProgress({ total: validation.valid.length, completed: 0 })

    try {
      const results = await importFiles(validation.valid, {
        storeOriginals: false, // Save space by not storing originals
        onProgress: setImportProgress,
        onFileComplete: (item, index) => {
          console.log(`Imported: ${item.meta.name}`)
        },
        onFileError: (error, file, index) => {
          console.error(`Failed to import ${file.name}:`, error)
          onError?.(error)
        }
      })

      // Refresh the list
      await loadImportedItems()
      await loadStorageInfo()
      
      onImported?.(results)
      
      if (results.length > 0) {
        alert(`Successfully imported ${results.length} file(s)!`)
      }

    } catch (error) {
      console.error('Import failed:', error)
      onError?.(error as Error)
      alert(`Import failed: ${(error as Error).message}`)
    } finally {
      setIsImporting(false)
      setImportProgress(null)
    }
  }, [isImporting, onImported, onError])

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFileSelect(files)
    }
    // Reset input to allow selecting the same files again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleFileSelect(files)
    }
  }, [handleFileSelect])

  const handleDeleteItem = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) {
      return
    }

    try {
      await deleteItem(id)
      await loadImportedItems()
      await loadStorageInfo()
    } catch (error) {
      console.error('Failed to delete item:', error)
      alert(`Failed to delete item: ${(error as Error).message}`)
    }
  }

  const openFilePicker = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="card import-panel">
      {/* File Input (Hidden) */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*,video/*"
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />

      {/* Import Section */}
      <div className="import-section">
        <h3>Import Audio/Video Files</h3>
        
        {/* Drop Zone */}
        <div
          className={`drop-zone ${isDragOver ? 'drag-over' : ''} ${isImporting ? 'importing' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={!isImporting ? openFilePicker : undefined}
        >
          {isImporting ? (
            <div className="import-progress">
              <div className="spinner">⏳</div>
              <div className="progress-text">
                <strong>Importing...</strong>
                <br />
                {importProgress?.current && (
                  <span>{importProgress.current}</span>
                )}
                <br />
                <span>
                  {importProgress?.completed || 0} of {importProgress?.total || 0}
                </span>
              </div>
            </div>
          ) : (
            <div className="drop-content">
              <div className="drop-icon">📁</div>
              <div className="drop-text">
                <strong>Drop files here or click to browse</strong>
                <br />
                <span>Supports: WAV, MP3, M4A, AAC, OGG, FLAC, MP4, WebM</span>
              </div>
            </div>
          )}
        </div>

        {/* Storage Info */}
        {storageInfo && (
          <div className="storage-info">
            <span>
              Storage: {formatBytes(storageInfo.usedBytes)} used
              {storageInfo.availableBytes && (
                <> • {formatBytes(storageInfo.availableBytes)} available</>
              )}
              • {storageInfo.totalItems} items
            </span>
            <button
              className="manage-button"
              onClick={() => setShowStorageManager(!showStorageManager)}
            >
              Manage
            </button>
          </div>
        )}
      </div>

      {/* Storage Manager (Collapsible) */}
      {showStorageManager && (
        <div className="storage-manager">
          <h4>Storage Management</h4>
          <div className="storage-stats">
            <div>Total Items: {storageInfo?.totalItems || 0}</div>
            <div>PCM Data: {storageInfo?.pcmItems || 0} items</div>
            <div>Original Files: {storageInfo?.originalItems || 0} items</div>
            <div>Storage Used: {formatBytes(storageInfo?.usedBytes || 0)}</div>
          </div>
        </div>
      )}

      {/* Imported Items List */}
      <div className="imported-items">
        <h4>Imported Files ({importedItems.length})</h4>
        
        {importedItems.length === 0 ? (
          <div className="no-items">
            <p>No files imported yet. Use the drop zone above to import audio/video files.</p>
          </div>
        ) : (
          <div className="items-list">
            {importedItems.map((item) => (
              <div key={item.id} className="imported-item">
                <div className="item-info">
                  <div className="item-name" title={item.name}>
                    {item.name}
                  </div>
                  <div className="item-meta">
                    {formatDuration(item.durationSec)} • 
                    {formatBytes(item.size)} • 
                    {item.originalSampleRate}Hz → 16kHz mono
                  </div>
                  <div className="item-date">
                    {item.importedAt.toLocaleDateString()} {item.importedAt.toLocaleTimeString()}
                  </div>
                </div>
                <div className="item-actions">
                  <button
                    className="delete-button"
                    onClick={() => handleDeleteItem(item.id, item.name)}
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
        .import-panel {
          max-width: 600px;
        }

        .import-section {
          margin-bottom: 24px;
        }

        .drop-zone {
          border: 2px dashed #ccc;
          border-radius: 8px;
          padding: 40px 20px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
          background: #fafafa;
          margin-bottom: 16px;
        }

        .drop-zone:hover {
          border-color: #4CAF50;
          background: #f0f8f0;
        }

        .drop-zone.drag-over {
          border-color: #4CAF50;
          background: #e8f5e8;
          transform: scale(1.02);
        }

        .drop-zone.importing {
          cursor: not-allowed;
          border-color: #ff9800;
          background: #fff3e0;
        }

        .drop-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .drop-icon {
          font-size: 48px;
          opacity: 0.6;
        }

        .drop-text strong {
          font-size: 16px;
          color: #333;
        }

        .drop-text span {
          font-size: 14px;
          color: #666;
        }

        .import-progress {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .spinner {
          font-size: 32px;
          animation: spin 2s linear infinite;
        }

        .progress-text {
          text-align: left;
        }

        .storage-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          background: #f5f5f5;
          border-radius: 6px;
          font-size: 13px;
          color: #666;
        }

        .manage-button {
          background: #2196F3;
          color: white;
          border: none;
          padding: 4px 12px;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
        }

        .manage-button:hover {
          background: #1976D2;
        }

        .storage-manager {
          background: #f9f9f9;
          padding: 16px;
          border-radius: 6px;
          margin-bottom: 20px;
          border: 1px solid #e0e0e0;
        }

        .storage-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 8px;
          font-size: 13px;
          color: #666;
        }

        .imported-items h4 {
          margin-bottom: 16px;
          color: #333;
        }

        .no-items {
          text-align: center;
          color: #666;
          font-style: italic;
          padding: 20px;
        }

        .items-list {
          max-height: 400px;
          overflow-y: auto;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
        }

        .imported-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid #f0f0f0;
          transition: background-color 0.2s;
        }

        .imported-item:hover {
          background: #f8f8f8;
        }

        .imported-item:last-child {
          border-bottom: none;
        }

        .item-info {
          flex: 1;
          min-width: 0;
        }

        .item-name {
          font-weight: 500;
          font-size: 14px;
          color: #333;
          margin-bottom: 4px;
          word-wrap: break-word;
        }

        .item-meta {
          font-size: 12px;
          color: #666;
          margin-bottom: 2px;
        }

        .item-date {
          font-size: 11px;
          color: #999;
        }

        .item-actions {
          margin-left: 12px;
        }

        .delete-button {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: background-color 0.2s;
        }

        .delete-button:hover {
          background: #ffebee;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (max-width: 480px) {
          .drop-zone {
            padding: 20px 10px;
          }

          .drop-icon {
            font-size: 32px;
          }

          .storage-info {
            flex-direction: column;
            gap: 8px;
            text-align: center;
          }

          .imported-item {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }

          .item-actions {
            margin-left: 0;
            width: 100%;
            text-align: right;
          }
        }
      `}</style>
    </div>
  )
}
