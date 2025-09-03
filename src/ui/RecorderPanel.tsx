import React, { useState, useCallback, useEffect } from 'react'
import * as rec from '../audio/recorder'

type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'stopping' | 'done' | 'error'

interface RecorderPanelProps {
  onResult?: (result: rec.RecorderResult) => void
  onError?: (error: Error) => void
}

export default function RecorderPanel({ onResult, onError }: RecorderPanelProps) {
  const [handle, setHandle] = useState<rec.RecorderHandle | null>(null)
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [level, setLevel] = useState<number>(0)
  const [elapsedTime, setElapsedTime] = useState<number>(0)
  const [errorMessage, setErrorMessage] = useState<string>('')

  // Format elapsed time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Handle level updates from recorder
  const handleLevel = useCallback((newLevel: number) => {
    setLevel(newLevel)
  }, [])

  // Handle time updates from recorder
  const handleTime = useCallback((seconds: number) => {
    setElapsedTime(seconds)
  }, [])

  // Handle errors from recorder
  const handleError = useCallback((error: Error) => {
    console.error('Recording error:', error)
    setErrorMessage(error.message)
    setStatus('error')
    onError?.(error)
  }, [onError])

  // Reset state when going idle
  const resetState = () => {
    setLevel(0)
    setElapsedTime(0)
    setErrorMessage('')
    setHandle(null)
  }

  const onStart = async () => {
    try {
      setStatus('requesting')
      setErrorMessage('')
      
      const h = await rec.start({
        onLevel: handleLevel,
        onTime: handleTime,
        onError: handleError
      })
      
      setHandle(h)
      setStatus('recording')
    } catch (error: any) {
      const errorMsg = error.message || 'Failed to start recording'
      setErrorMessage(errorMsg)
      setStatus('error')
      resetState()
      onError?.(error)
    }
  }

  const onStop = async () => {
    if (!handle) return
    
    setStatus('stopping')
    try {
      const result = await handle.stop()
      onResult?.(result)
      setStatus('done')
      // Reset immediately for clearer UX
      setStatus('idle')
      resetState()
      
    } catch (error: any) {
      const errorMsg = error.message || 'Failed to stop recording'
      setErrorMessage(errorMsg)
      setStatus('error')
      onError?.(error)
    }
  }

  // Level meter component
  const LevelMeter = ({ level }: { level: number }) => (
    <div className="level-meter">
      <div className="level-bar">
        <div 
          className="level-fill" 
          style={{ 
            width: `${level * 100}%`,
            backgroundColor: level > 0.8 ? '#ff4444' : level > 0.5 ? '#ffaa00' : '#44aa44'
          }} 
        />
      </div>
      <span className="level-text">{Math.round(level * 100)}%</span>
    </div>
  )

  // Status indicator with appropriate colors and messages
  const getStatusInfo = (status: RecorderStatus) => {
    switch (status) {
      case 'idle':
        return { text: 'Ready to record', color: '#666' }
      case 'requesting':
        return { text: 'Requesting microphone access...', color: '#0066cc' }
      case 'recording':
        return { text: 'Recording', color: '#cc0000' }
      case 'stopping':
        return { text: 'Processing...', color: '#ff8800' }
      case 'done':
        return { text: 'Recording complete!', color: '#008800' }
      case 'error':
        return { text: 'Error', color: '#cc0000' }
      default:
        return { text: status, color: '#666' }
    }
  }

  const statusInfo = getStatusInfo(status)
  const isRecording = status === 'recording'
  const canRecord = status === 'idle' || status === 'error'
  const canStop = isRecording

  return (
    <div className="card recorder-panel">
      {/* Main controls */}
      <div className="recorder-controls">
        <button 
          className={`record-button ${isRecording ? 'recording' : ''}`}
          onClick={onStart} 
          disabled={!canRecord}
          title={canRecord ? 'Start recording' : 'Cannot start recording'}
        >
          {isRecording ? '🔴' : '🎤'} {canRecord ? 'Record' : 'Recording...'}
        </button>
        
        <button 
          className="stop-button"
          onClick={onStop} 
          disabled={!canStop}
          title={canStop ? 'Stop recording' : 'Cannot stop recording'}
        >
          ⏹ Stop
        </button>
      </div>

      {/* Status and timer */}
      <div className="recorder-status">
        <div className="status-info">
          <span className="status-text" style={{ color: statusInfo.color }}>
            {statusInfo.text}
          </span>
          {isRecording && (
            <span className="elapsed-time">{formatTime(elapsedTime)}</span>
          )}
        </div>
        
        {/* Level meter - only show when recording */}
        {isRecording && <LevelMeter level={level} />}
      </div>

      {/* Error message */}
      {errorMessage && (
        <div className="error-message">
          ⚠️ {errorMessage}
          {errorMessage.includes('permission') && (
            <p className="hint">Please enable microphone access in your browser settings and try again.</p>
          )}
        </div>
      )}

      {/* iOS-specific guidance */}
      <div className="recorder-hints">
        <p className="hint">
          📱 <strong>iOS Safari:</strong> Keep screen on during recording. 
          Install to Home Screen for best performance.
        </p>
        {status === 'done' && (
          <p className="hint success">
            ✅ Recording saved! Check the transcript section below.
          </p>
        )}
      </div>

      {/* Inline styles for the component */}
      <style jsx>{`
        .recorder-panel {
          max-width: 500px;
        }
        
        .recorder-controls {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
          align-items: center;
        }
        
        .record-button {
          background: #4CAF50;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.2s;
          min-width: 140px;
        }
        
        .record-button:hover:not(:disabled) {
          background: #45a049;
          transform: translateY(-1px);
        }
        
        .record-button.recording {
          background: #ff4444;
          animation: pulse 1.5s infinite;
        }
        
        .record-button:disabled {
          background: #cccccc;
          cursor: not-allowed;
          transform: none;
        }
        
        .stop-button {
          background: #f44336;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.2s;
          min-width: 100px;
        }
        
        .stop-button:hover:not(:disabled) {
          background: #da190b;
          transform: translateY(-1px);
        }
        
        .stop-button:disabled {
          background: #cccccc;
          cursor: not-allowed;
          transform: none;
        }
        
        .recorder-status {
          margin-bottom: 16px;
        }
        
        .status-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        
        .status-text {
          font-weight: 600;
          font-size: 14px;
        }
        
        .elapsed-time {
          font-family: 'Courier New', monospace;
          font-size: 18px;
          font-weight: bold;
          color: #333;
        }
        
        .level-meter {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .level-bar {
          flex: 1;
          height: 8px;
          background: #eee;
          border-radius: 4px;
          overflow: hidden;
        }
        
        .level-fill {
          height: 100%;
          transition: width 0.1s ease;
          border-radius: 4px;
        }
        
        .level-text {
          font-size: 12px;
          font-family: 'Courier New', monospace;
          min-width: 35px;
          text-align: right;
        }
        
        .error-message {
          background: #ffebee;
          color: #c62828;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 16px;
          border: 1px solid #ffcdd2;
        }
        
        .recorder-hints {
          margin-top: 16px;
        }
        
        .hint {
          font-size: 13px;
          color: #666;
          margin: 4px 0;
          line-height: 1.4;
        }
        
        .hint.success {
          color: #2e7d32;
          font-weight: 500;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        
        @media (max-width: 480px) {
          .recorder-controls {
            flex-direction: column;
            align-items: stretch;
          }
          
          .record-button, .stop-button {
            width: 100%;
          }
          
          .status-info {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
          }
        }
      `}</style>
    </div>
  )
}
