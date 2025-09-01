import React, { useState, useEffect, useCallback } from 'react'
import { getWhisperAPI, initWhisper, estimateTranscriptionTime } from '../whisper/api'
import { AVAILABLE_MODELS } from '../whisper/loader'
import { getPCM } from '../store/db'
import { listItems } from '../store/db'
import type { MediaMeta } from '../types'
import type { TranscribeOptions, Segment } from '../whisper/api'

interface TranscriptionPanelProps {
  onTranscript: (transcript: string, segments?: Segment[]) => void
  onError?: (error: Error) => void
}

type AudioSource = 'recording' | 'imported'

export default function TranscriptionPanel({ onTranscript, onError }: TranscriptionPanelProps) {
  const [isInitialized, setIsInitialized] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [initProgress, setInitProgress] = useState(0)
  const [transcriptionProgress, setTranscriptionProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')
  
  // UI State
  const [selectedModel, setSelectedModel] = useState('tiny')
  const [selectedLanguage, setSelectedLanguage] = useState('auto')
  const [audioSource, setAudioSource] = useState<AudioSource>('recording')
  const [selectedImportId, setSelectedImportId] = useState('')
  const [importedItems, setImportedItems] = useState<MediaMeta[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)
  
  // Advanced Options
  const [temperature, setTemperature] = useState(0.0)
  const [translate, setTranslate] = useState(false)
  const [wordTimestamps, setWordTimestamps] = useState(true)

  // Segments for live preview
  const [currentSegments, setCurrentSegments] = useState<Segment[]>([])

  // Load defaults and imported items
  useEffect(() => {
    // load default model from settings
    try {
      const saved = localStorage.getItem('defaultModel')
      if (saved && AVAILABLE_MODELS[saved]) {
        setSelectedModel(saved)
      }
    } catch {}
    loadImportedItems()
  }, [])

  const loadImportedItems = async () => {
    try {
      const items = await listItems()
      setImportedItems(items)
      if (items.length > 0 && !selectedImportId) {
        setSelectedImportId(items[0].id)
      }
    } catch (error) {
      console.error('Failed to load imported items:', error)
    }
  }

  const handleInitialize = async () => {
    if (isInitialized || isInitializing) return

    setIsInitializing(true)
    setInitProgress(0)
    setProgressMessage('Initializing...')

    try {
      await initWhisper(selectedModel, (progress) => {
        setInitProgress(progress.progress)
        setProgressMessage(progress.message)
      })

      setIsInitialized(true)
      setProgressMessage('Ready for transcription')
    } catch (error) {
      console.error('Failed to initialize Whisper:', error)
      onError?.(error as Error)
      setProgressMessage('Initialization failed')
    } finally {
      setIsInitializing(false)
    }
  }

  const handleTranscribe = async () => {
    if (!isInitialized || isTranscribing) return

    // Get PCM data based on selected source
    let pcmData: Float32Array | null = null
    let audioInfo: { duration: number; name: string } | null = null

    try {
      if (audioSource === 'recording') {
        // TODO: Get PCM from latest recording
        // For now, show error
        throw new Error('Recording transcription not yet implemented. Please import an audio file first.')
        
      } else if (audioSource === 'imported') {
        if (!selectedImportId) {
          throw new Error('Please select an imported audio file')
        }

        const selectedItem = importedItems.find(item => item.id === selectedImportId)
        if (!selectedItem) {
          throw new Error('Selected audio file not found')
        }

        pcmData = await getPCM(selectedImportId)
        if (!pcmData) {
          throw new Error('Failed to load audio data')
        }

        audioInfo = {
          duration: selectedItem.durationSec,
          name: selectedItem.name
        }
      }

      if (!pcmData || !audioInfo) {
        throw new Error('No audio data available')
      }

      setIsTranscribing(true)
      setTranscriptionProgress(0)
      setCurrentSegments([])
      setProgressMessage('Starting transcription...')

      const estimatedTime = estimateTranscriptionTime(audioInfo.duration, selectedModel)
      
      const options: TranscribeOptions = {
        language: selectedLanguage === 'auto' ? undefined : selectedLanguage,
        temperature,
        translate,
        wordTimestamps
      }

      const whisper = getWhisperAPI()
      
      const result = await whisper.transcribe(pcmData, options, {
        onProgress: (progress) => {
          setTranscriptionProgress(progress.progress)
          setProgressMessage(progress.message)
        },
        onSegment: (segment) => {
          setCurrentSegments(prev => [...prev, segment])
        },
        onError: (error) => {
          onError?.(error)
        }
      })

      // Success!
      onTranscript(result.text, result.segments)
      setProgressMessage(`Transcription complete! (${result.duration.toFixed(1)}s processing time)`)

    } catch (error) {
      console.error('Transcription failed:', error)
      onError?.(error as Error)
      setProgressMessage('Transcription failed')
    } finally {
      setIsTranscribing(false)
    }
  }

  const handleCancel = async () => {
    if (!isTranscribing) return

    try {
      const whisper = getWhisperAPI()
      await whisper.cancel()
      setProgressMessage('Transcription cancelled')
    } catch (error) {
      console.error('Failed to cancel transcription:', error)
    }
  }

  const selectedModelInfo = AVAILABLE_MODELS[selectedModel]
  const selectedItemInfo = importedItems.find(item => item.id === selectedImportId)

  return (
    <div className="card transcription-panel">
      <h3>Audio Transcription</h3>

      {/* Initialization Section */}
      {!isInitialized && (
        <div className="init-section">
          <div className="model-selection">
            <label htmlFor="model-select">Model:</label>
            <select 
              id="model-select"
              value={selectedModel} 
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={isInitializing}
            >
              {Object.entries(AVAILABLE_MODELS).map(([key, info]) => (
                <option key={key} value={key}>
                  {info.name} - {info.description}
                </option>
              ))}
            </select>
          </div>

          {selectedModelInfo && (
            <div className="model-info">
              <p>Size: ~{Math.round(selectedModelInfo.size / (1024 * 1024))}MB</p>
              <p>Speed: {selectedModelInfo.description.includes('realtime') ? 
                selectedModelInfo.description.split('(')[1]?.split(')')[0] : 
                'Variable speed'}</p>
            </div>
          )}

          <button 
            className="init-button"
            onClick={handleInitialize}
            disabled={isInitializing}
          >
            {isInitializing ? 'Initializing...' : 'Initialize Whisper'}
          </button>

          {isInitializing && (
            <div className="progress-section">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${initProgress * 100}%` }}
                />
              </div>
              <div className="progress-message">{progressMessage}</div>
            </div>
          )}
        </div>
      )}

      {/* Transcription Section */}
      {isInitialized && (
        <div className="transcription-section">
          {/* Audio Source Selection */}
          <div className="source-selection">
            <h4>Audio Source</h4>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  value="recording"
                  checked={audioSource === 'recording'}
                  onChange={(e) => setAudioSource(e.target.value as AudioSource)}
                  disabled={isTranscribing}
                />
                Latest Recording
              </label>
              <label>
                <input
                  type="radio"
                  value="imported"
                  checked={audioSource === 'imported'}
                  onChange={(e) => setAudioSource(e.target.value as AudioSource)}
                  disabled={isTranscribing}
                />
                Imported File
              </label>
            </div>
          </div>

          {/* Imported File Selection */}
          {audioSource === 'imported' && (
            <div className="import-selection">
              <label htmlFor="import-select">Select File:</label>
              <select
                id="import-select"
                value={selectedImportId}
                onChange={(e) => setSelectedImportId(e.target.value)}
                disabled={isTranscribing || importedItems.length === 0}
              >
                {importedItems.length === 0 ? (
                  <option value="">No imported files available</option>
                ) : (
                  importedItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({Math.round(item.durationSec)}s)
                    </option>
                  ))
                )}
              </select>
              
              {selectedItemInfo && (
                <div className="selected-file-info">
                  <p>Duration: {selectedItemInfo.durationSec.toFixed(1)}s</p>
                  <p>Size: {Math.round(selectedItemInfo.size / 1024)}KB</p>
                  <p>Original: {selectedItemInfo.originalSampleRate}Hz, {selectedItemInfo.originalChannels} ch</p>
                </div>
              )}
            </div>
          )}

          {/* Language Selection */}
          <div className="language-selection">
            <label htmlFor="language-select">Language:</label>
            <select
              id="language-select"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              disabled={isTranscribing}
            >
              <option value="auto">Auto-detect</option>
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="it">Italian</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="zh">Chinese</option>
            </select>
          </div>

          {/* Advanced Options */}
          <div className="advanced-options">
            <button 
              className="toggle-advanced"
              onClick={() => setShowAdvanced(!showAdvanced)}
              type="button"
            >
              {showAdvanced ? '▼' : '▶'} Advanced Options
            </button>

            {showAdvanced && (
              <div className="advanced-controls">
                <div className="option-row">
                  <label htmlFor="temperature-slider">Temperature: {temperature}</label>
                  <input
                    id="temperature-slider"
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    disabled={isTranscribing}
                  />
                </div>

                <div className="option-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={translate}
                      onChange={(e) => setTranslate(e.target.checked)}
                      disabled={isTranscribing}
                    />
                    Translate to English
                  </label>
                </div>

                <div className="option-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={wordTimestamps}
                      onChange={(e) => setWordTimestamps(e.target.checked)}
                      disabled={isTranscribing}
                    />
                    Word-level timestamps
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Transcription Controls */}
          <div className="transcription-controls">
            <button 
              className="transcribe-button"
              onClick={handleTranscribe}
              disabled={isTranscribing || (audioSource === 'imported' && !selectedImportId)}
            >
              {isTranscribing ? 'Transcribing...' : 'Start Transcription'}
            </button>

            {isTranscribing && (
              <button 
                className="cancel-button"
                onClick={handleCancel}
              >
                Cancel
              </button>
            )}
          </div>

          {/* Progress Display */}
          {isTranscribing && (
            <div className="progress-section">
              <div className="progress-bar">
                <div 
                  className="progress-fill transcribing" 
                  style={{ width: `${transcriptionProgress * 100}%` }}
                />
              </div>
              <div className="progress-message">{progressMessage}</div>
              <div className="progress-percentage">
                {Math.round(transcriptionProgress * 100)}%
              </div>
            </div>
          )}

          {/* Live Segments Preview */}
          {currentSegments.length > 0 && (
            <div className="segments-preview">
              <h4>Live Transcription:</h4>
              <div className="segments-list">
                {currentSegments.map((segment, index) => (
                  <div key={index} className="segment">
                    <span className="timestamp">
                      {segment.start.toFixed(1)}s - {segment.end.toFixed(1)}s:
                    </span>
                    <span className="segment-text">{segment.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status Message */}
      {progressMessage && !isTranscribing && !isInitializing && (
        <div className={`status-message ${progressMessage.includes('failed') ? 'error' : 'success'}`}>
          {progressMessage}
        </div>
      )}

      {/* Inline Styles */}
      <style jsx>{`
        .transcription-panel {
          max-width: 600px;
        }

        .init-section, .transcription-section {
          margin-bottom: 20px;
        }

        .model-selection, .language-selection, .import-selection {
          margin-bottom: 16px;
        }

        .model-selection label, .language-selection label, .import-selection label {
          display: block;
          margin-bottom: 4px;
          font-weight: 500;
        }

        .model-selection select, .language-selection select, .import-selection select {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }

        .model-info {
          background: #f5f5f5;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 16px;
          font-size: 13px;
          color: #666;
        }

        .model-info p {
          margin: 4px 0;
        }

        .init-button, .transcribe-button {
          background: #4CAF50;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          width: 100%;
          margin-bottom: 16px;
        }

        .init-button:disabled, .transcribe-button:disabled {
          background: #cccccc;
          cursor: not-allowed;
        }

        .cancel-button {
          background: #f44336;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          font-size: 14px;
          cursor: pointer;
          margin-left: 12px;
        }

        .transcription-controls {
          display: flex;
          align-items: center;
          margin-bottom: 16px;
        }

        .source-selection h4 {
          margin-bottom: 8px;
          color: #333;
        }

        .radio-group {
          display: flex;
          gap: 16px;
          margin-bottom: 16px;
        }

        .radio-group label {
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
        }

        .selected-file-info {
          background: #f9f9f9;
          padding: 8px 12px;
          border-radius: 4px;
          margin-top: 8px;
          font-size: 12px;
          color: #666;
        }

        .selected-file-info p {
          margin: 2px 0;
        }

        .advanced-options {
          margin-bottom: 16px;
        }

        .toggle-advanced {
          background: none;
          border: none;
          color: #0066cc;
          cursor: pointer;
          font-size: 14px;
          padding: 0;
          margin-bottom: 12px;
        }

        .advanced-controls {
          background: #f8f9fa;
          padding: 16px;
          border-radius: 6px;
          border: 1px solid #e9ecef;
        }

        .option-row {
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .option-row:last-child {
          margin-bottom: 0;
        }

        .option-row label {
          font-size: 14px;
          flex: 1;
        }

        .option-row input[type="range"] {
          flex: 1;
          max-width: 150px;
        }

        .option-row input[type="checkbox"] {
          margin-right: 6px;
        }

        .progress-section {
          margin-bottom: 16px;
        }

        .progress-bar {
          width: 100%;
          height: 8px;
          background: #e0e0e0;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 8px;
        }

        .progress-fill {
          height: 100%;
          background: #4CAF50;
          transition: width 0.3s ease;
        }

        .progress-fill.transcribing {
          background: #2196F3;
        }

        .progress-message {
          font-size: 14px;
          color: #666;
          margin-bottom: 4px;
        }

        .progress-percentage {
          font-size: 12px;
          color: #999;
          text-align: right;
        }

        .segments-preview {
          background: #f8f9fa;
          border: 1px solid #e9ecef;
          border-radius: 6px;
          padding: 16px;
          margin-bottom: 16px;
          max-height: 200px;
          overflow-y: auto;
        }

        .segments-preview h4 {
          margin: 0 0 12px 0;
          color: #333;
          font-size: 16px;
        }

        .segment {
          margin-bottom: 8px;
          font-size: 14px;
          line-height: 1.4;
        }

        .timestamp {
          color: #666;
          font-family: monospace;
          font-size: 12px;
          margin-right: 8px;
        }

        .segment-text {
          color: #333;
        }

        .status-message {
          padding: 12px;
          border-radius: 6px;
          font-size: 14px;
          text-align: center;
        }

        .status-message.success {
          background: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }

        .status-message.error {
          background: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }

        @media (max-width: 480px) {
          .radio-group {
            flex-direction: column;
          }

          .transcription-controls {
            flex-direction: column;
          }

          .cancel-button {
            margin-left: 0;
            margin-top: 8px;
            width: 100%;
          }

          .option-row {
            flex-direction: column;
            align-items: flex-start;
          }

          .option-row input[type="range"] {
            width: 100%;
            max-width: none;
          }
        }
      `}</style>
    </div>
  )
}
