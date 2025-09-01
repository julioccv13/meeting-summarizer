/**
 * Summary Panel Component
 * Provides UI for text summarization with TextRank algorithm
 */

import React, { useState, useCallback, useMemo } from 'react'
import { summarize, summarizeLongText, extractKeyPhrases, getSummaryStats, type SummarizationOptions, type SummaryResult } from '../nlp/textrank'
import { downloadText, copyToClipboard, isClipboardSupported, shareContent, isShareSupported } from '../utils/download'
import { detectLanguage } from '../nlp/stopwords'

/**
 * Summary panel props
 */
interface SummaryPanelProps {
  text: string
  title?: string
  className?: string
  onSummaryGenerated?: (summary: SummaryResult) => void
}

/**
 * Summary format options
 */
type SummaryFormat = 'bullets' | 'paragraph' | 'sentences'

/**
 * Summary panel component
 */
export const SummaryPanel: React.FC<SummaryPanelProps> = ({
  text,
  title = 'Meeting Transcript',
  className = '',
  onSummaryGenerated
}) => {
  const [summary, setSummary] = useState<SummaryResult | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [options, setOptions] = useState<SummarizationOptions>({
    maxSentences: 5,
    maxChars: 2000,
    locale: 'en',
    removeNearDuplicates: true
  })
  const [format, setFormat] = useState<SummaryFormat>('bullets')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [keyPhrases, setKeyPhrases] = useState<string[]>([])

  // Detect language from text
  const detectedLanguage = useMemo(() => {
    if (!text) return 'en'
    return detectLanguage(text)
  }, [text])

  // Update locale when language is detected
  React.useEffect(() => {
    if (detectedLanguage !== options.locale) {
      setOptions(prev => ({ ...prev, locale: detectedLanguage as 'en' | 'es' | 'fr' }))
    }
  }, [detectedLanguage, options.locale])

  // Generate summary
  const generateSummary = useCallback(async () => {
    if (!text.trim()) {
      setError('No text to summarize')
      return
    }

    setIsGenerating(true)
    setError(null)

    try {
      // Use appropriate summarization function based on text length
      const result = text.length > 8000 
        ? summarizeLongText(text, options)
        : summarize(text, options)

      // Extract key phrases
      const phrases = extractKeyPhrases(text, result.language, 8)
      
      setSummary(result)
      setKeyPhrases(phrases)
      onSummaryGenerated?.(result)

    } catch (err) {
      console.error('Summarization failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate summary')
    } finally {
      setIsGenerating(false)
    }
  }, [text, options, onSummaryGenerated])

  // Format summary text based on selected format
  const formatSummaryText = useCallback((summaryResult: SummaryResult): string => {
    switch (format) {
      case 'bullets':
        return summaryResult.sentences.map(s => `• ${s}`).join('\n')
      case 'paragraph':
        return summaryResult.sentences.join(' ')
      case 'sentences':
        return summaryResult.sentences.map((s, i) => `${i + 1}. ${s}`).join('\n')
      default:
        return summaryResult.summary
    }
  }, [format])

  // Get formatted summary text
  const formattedSummary = useMemo(() => {
    return summary ? formatSummaryText(summary) : ''
  }, [summary, formatSummaryText])

  // Get summary stats
  const stats = useMemo(() => {
    return summary ? getSummaryStats(text, formattedSummary) : null
  }, [summary, text, formattedSummary])

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    if (!formattedSummary) return
    
    try {
      const success = await copyToClipboard(formattedSummary)
      if (success) {
        // Show toast notification would go here
        console.log('Summary copied to clipboard')
      }
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [formattedSummary])

  // Download summary
  const handleDownload = useCallback(() => {
    if (!formattedSummary) return
    
    const timestamp = new Date().toISOString().split('T')[0]
    const filename = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_summary_${timestamp}`
    
    downloadText(filename, formattedSummary)
  }, [formattedSummary, title])

  // Share summary
  const handleShare = useCallback(async () => {
    if (!formattedSummary) return
    
    try {
      const shared = await shareContent(
        `${title} - Summary`,
        formattedSummary
      )
      
      if (!shared) {
        // Fallback to copy
        await handleCopy()
      }
    } catch (err) {
      console.error('Failed to share:', err)
      await handleCopy()
    }
  }, [formattedSummary, title, handleCopy])

  // Clear summary
  const handleClear = useCallback(() => {
    setSummary(null)
    setKeyPhrases([])
    setError(null)
  }, [])

  return (
    <div className={`summary-panel ${className}`}>
      <div className="summary-header">
        <h3>Text Summary</h3>
        {text && (
          <div className="summary-info">
            <span>{Math.round(text.length / 1000)}k chars</span>
            <span>•</span>
            <span>Language: {detectedLanguage.toUpperCase()}</span>
          </div>
        )}
      </div>

      {/* Configuration */}
      <div className="summary-config">
        <div className="config-row">
          <div className="input-group">
            <label>Max Sentences:</label>
            <input
              type="range"
              min="1"
              max="15"
              value={options.maxSentences || 5}
              onChange={e => setOptions(prev => ({ ...prev, maxSentences: parseInt(e.target.value) }))}
            />
            <span>{options.maxSentences || 5}</span>
          </div>

          <div className="input-group">
            <label>Max Characters:</label>
            <select
              value={options.maxChars || 2000}
              onChange={e => setOptions(prev => ({ ...prev, maxChars: parseInt(e.target.value) }))}
            >
              <option value={1000}>1,000</option>
              <option value={2000}>2,000</option>
              <option value={3000}>3,000</option>
              <option value={5000}>5,000</option>
            </select>
          </div>

          <div className="input-group">
            <label>Format:</label>
            <select
              value={format}
              onChange={e => setFormat(e.target.value as SummaryFormat)}
            >
              <option value="bullets">Bullet Points</option>
              <option value="paragraph">Paragraph</option>
              <option value="sentences">Numbered</option>
            </select>
          </div>
        </div>

        <div className="config-row">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="toggle-advanced"
          >
            Advanced Options {showAdvanced ? '▼' : '▶'}
          </button>
        </div>

        {showAdvanced && (
          <div className="advanced-config">
            <div className="config-row">
              <div className="input-group">
                <label>Language:</label>
                <select
                  value={options.locale}
                  onChange={e => setOptions(prev => ({ ...prev, locale: e.target.value as 'en' | 'es' | 'fr' }))}
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                </select>
              </div>

              <div className="input-group">
                <label>
                  <input
                    type="checkbox"
                    checked={options.removeNearDuplicates ?? true}
                    onChange={e => setOptions(prev => ({ ...prev, removeNearDuplicates: e.target.checked }))}
                  />
                  Remove Duplicates
                </label>
              </div>
            </div>

            <div className="config-row">
              <div className="input-group">
                <label>Damping Factor:</label>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={options.dampingFactor || 0.85}
                  onChange={e => setOptions(prev => ({ ...prev, dampingFactor: parseFloat(e.target.value) }))}
                />
                <span>{(options.dampingFactor || 0.85).toFixed(2)}</span>
              </div>

              <div className="input-group">
                <label>Similarity Threshold:</label>
                <input
                  type="range"
                  min="0.1"
                  max="0.9"
                  step="0.1"
                  value={options.similarityThreshold || 0.7}
                  onChange={e => setOptions(prev => ({ ...prev, similarityThreshold: parseFloat(e.target.value) }))}
                />
                <span>{(options.similarityThreshold || 0.7).toFixed(1)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Generate Button */}
      <div className="summary-actions">
        <button
          onClick={generateSummary}
          disabled={!text.trim() || isGenerating}
          className="generate-btn primary"
        >
          {isGenerating ? (
            <>
              <div className="spinner" />
              Generating...
            </>
          ) : (
            'Generate Summary'
          )}
        </button>

        {summary && (
          <button onClick={handleClear} className="clear-btn secondary">
            Clear
          </button>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="summary-error">
          <span>⚠️ {error}</span>
        </div>
      )}

      {/* Summary Result */}
      {summary && (
        <div className="summary-result">
          <div className="summary-stats">
            <div className="stat">
              <label>Processing Time:</label>
              <span>{summary.processingTimeMs}ms</span>
            </div>
            <div className="stat">
              <label>Compression:</label>
              <span>{Math.round(summary.compressionRatio * 100)}%</span>
            </div>
            <div className="stat">
              <label>Sentences:</label>
              <span>{summary.summarySentenceCount}/{summary.originalSentenceCount}</span>
            </div>
            {stats && (
              <div className="stat">
                <label>Reading Time:</label>
                <span>{stats.readingTimeMinutes}min</span>
              </div>
            )}
          </div>

          <div className="summary-content">
            <div className="content-header">
              <h4>Summary</h4>
              <div className="content-actions">
                {isClipboardSupported() && (
                  <button onClick={handleCopy} className="action-btn" title="Copy">
                    📋
                  </button>
                )}
                {isShareSupported() && (
                  <button onClick={handleShare} className="action-btn" title="Share">
                    🔗
                  </button>
                )}
                <button onClick={handleDownload} className="action-btn" title="Download">
                  💾
                </button>
              </div>
            </div>

            <div className="summary-text">
              {formattedSummary.split('\n').map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          </div>

          {/* Key Phrases */}
          {keyPhrases.length > 0 && (
            <div className="key-phrases">
              <h4>Key Terms</h4>
              <div className="phrases-list">
                {keyPhrases.map((phrase, index) => (
                  <span key={index} className="phrase-tag">
                    {phrase}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .summary-panel {
          background: #f8f9fa;
          border-radius: 8px;
          padding: 1rem;
          margin: 1rem 0;
        }

        .summary-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid #e9ecef;
        }

        .summary-header h3 {
          margin: 0;
          color: #495057;
        }

        .summary-info {
          display: flex;
          gap: 0.5rem;
          font-size: 0.875rem;
          color: #6c757d;
        }

        .summary-config {
          background: white;
          border-radius: 6px;
          padding: 1rem;
          margin-bottom: 1rem;
          border: 1px solid #e9ecef;
        }

        .config-row {
          display: flex;
          gap: 1rem;
          align-items: center;
          margin-bottom: 0.75rem;
        }

        .config-row:last-child {
          margin-bottom: 0;
        }

        .input-group {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .input-group label {
          font-size: 0.875rem;
          font-weight: 500;
          color: #495057;
          min-width: fit-content;
        }

        .input-group input[type="range"] {
          width: 80px;
        }

        .input-group select {
          padding: 0.25rem 0.5rem;
          border: 1px solid #ced4da;
          border-radius: 4px;
          font-size: 0.875rem;
        }

        .toggle-advanced {
          background: none;
          border: none;
          color: #007bff;
          cursor: pointer;
          font-size: 0.875rem;
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .advanced-config {
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          border-top: 1px solid #e9ecef;
        }

        .summary-actions {
          display: flex;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .generate-btn {
          background: #007bff;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          min-width: 140px;
          justify-content: center;
        }

        .generate-btn:disabled {
          background: #6c757d;
          cursor: not-allowed;
        }

        .clear-btn {
          background: #6c757d;
          color: white;
          border: none;
          padding: 0.75rem 1rem;
          border-radius: 6px;
          cursor: pointer;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top: 2px solid white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .summary-error {
          background: #f8d7da;
          color: #721c24;
          padding: 0.75rem;
          border-radius: 6px;
          margin-bottom: 1rem;
          border: 1px solid #f5c6cb;
        }

        .summary-result {
          background: white;
          border-radius: 6px;
          padding: 1rem;
          border: 1px solid #e9ecef;
        }

        .summary-stats {
          display: flex;
          gap: 1rem;
          margin-bottom: 1rem;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid #f1f3f4;
          flex-wrap: wrap;
        }

        .stat {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .stat label {
          font-size: 0.75rem;
          color: #6c757d;
          font-weight: 500;
          text-transform: uppercase;
        }

        .stat span {
          font-size: 0.875rem;
          font-weight: 600;
          color: #495057;
        }

        .summary-content {
          margin-bottom: 1rem;
        }

        .content-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }

        .content-header h4 {
          margin: 0;
          color: #495057;
        }

        .content-actions {
          display: flex;
          gap: 0.5rem;
        }

        .action-btn {
          background: #f8f9fa;
          border: 1px solid #dee2e6;
          padding: 0.5rem;
          border-radius: 4px;
          cursor: pointer;
          font-size: 1rem;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .action-btn:hover {
          background: #e9ecef;
        }

        .summary-text {
          background: #f8f9fa;
          padding: 1rem;
          border-radius: 6px;
          line-height: 1.6;
        }

        .summary-text p {
          margin: 0 0 0.75rem 0;
        }

        .summary-text p:last-child {
          margin-bottom: 0;
        }

        .key-phrases {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #f1f3f4;
        }

        .key-phrases h4 {
          margin: 0 0 0.75rem 0;
          color: #495057;
          font-size: 0.875rem;
          text-transform: uppercase;
          font-weight: 600;
        }

        .phrases-list {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .phrase-tag {
          background: #e7f3ff;
          color: #0969da;
          padding: 0.25rem 0.5rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 500;
          border: 1px solid #b6e3ff;
        }

        @media (max-width: 768px) {
          .config-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.75rem;
          }

          .input-group {
            width: 100%;
            justify-content: space-between;
          }

          .summary-stats {
            justify-content: space-between;
          }

          .content-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.75rem;
          }
        }
      `}</style>
    </div>
  )
}

export default SummaryPanel
