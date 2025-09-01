import React, { useEffect, useState } from 'react'
import { AVAILABLE_MODELS, getCachedModelsSize, clearAllCachedModels } from '../whisper/loader'

export default function SettingsPanel() {
  const [defaultModel, setDefaultModel] = useState<string>('tiny')
  const [modelBytes, setModelBytes] = useState<number>(0)
  const [busy, setBusy] = useState<boolean>(false)
  const [summaryMaxSentences, setSummaryMaxSentences] = useState<number>(5)
  const [summaryMaxChars, setSummaryMaxChars] = useState<number>(2000)
  const [summaryDedup, setSummaryDedup] = useState<boolean>(true)

  useEffect(() => {
    const saved = localStorage.getItem('defaultModel')
    if (saved && AVAILABLE_MODELS[saved]) setDefaultModel(saved)
    try {
      const s = localStorage.getItem('summaryOptions')
      if (s) {
        const o = JSON.parse(s)
        if (typeof o.maxSentences === 'number') setSummaryMaxSentences(o.maxSentences)
        if (typeof o.maxChars === 'number') setSummaryMaxChars(o.maxChars)
        if (typeof o.removeNearDuplicates === 'boolean') setSummaryDedup(o.removeNearDuplicates)
      }
    } catch {}
    refreshModelSize()
  }, [])

  const refreshModelSize = async () => {
    try { setModelBytes(await getCachedModelsSize()) } catch { setModelBytes(0) }
  }

  const formatBytes = (bytes: number): string => {
    if (!bytes) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes','KB','MB','GB']
    const i = Math.floor(Math.log(bytes)/Math.log(k))
    return `${(bytes/Math.pow(k,i)).toFixed(2)} ${sizes[i]}`
  }

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

  const handleSaveDefaultModel = () => {
    localStorage.setItem('defaultModel', defaultModel)
    alert(`Default model set to: ${defaultModel}`)
  }

  const handleSaveSummaryOptions = () => {
    const opts = {
      maxSentences: summaryMaxSentences,
      maxChars: summaryMaxChars,
      removeNearDuplicates: summaryDedup,
      locale: 'en'
    }
    localStorage.setItem('summaryOptions', JSON.stringify(opts))
    alert('Summary options saved')
  }

  const handleClearModelCache = async () => {
    if (!confirm('Clear cached Whisper models? They will re-download next time.')) return
    setBusy(true)
    try {
      await clearAllCachedModels()
      await sendMessageToSW({ type: 'PURGE_MODELS' })
      await refreshModelSize()
      alert('Model cache cleared')
    } finally { setBusy(false) }
  }

  const handleClearSWCaches = async () => {
    if (!confirm('Clear all Service Worker caches?')) return
    setBusy(true)
    try { await sendMessageToSW({ type: 'CLEAR_ALL_CACHES' }); alert('SW caches cleared') } finally { setBusy(false) }
  }

  return (
    <div className="card settings-panel">
      <h3>Settings</h3>

      <div className="row">
        <div className="col">
          <label>Default Model</label>
          <select value={defaultModel} onChange={(e)=>setDefaultModel(e.target.value)}>
            {Object.keys(AVAILABLE_MODELS).map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <button onClick={handleSaveDefaultModel} style={{ marginLeft: 8 }}>Save</button>
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div className="col">
          <div>Cached Models Size: <strong>{formatBytes(modelBytes)}</strong></div>
          <button onClick={refreshModelSize} disabled={busy}>↻ Refresh</button>
          <button onClick={handleClearModelCache} disabled={busy} style={{ marginLeft: 8 }}>🧹 Clear Model Cache</button>
        </div>
      </div>

      <hr style={{ margin: '16px 0', border: 0, borderTop: '1px solid #e5e7eb' }} />

      <h4>Summary Options</h4>
      <div className="row" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <label>
          Max sentences
          <input type="number" min={1} max={20} value={summaryMaxSentences} onChange={(e)=>setSummaryMaxSentences(parseInt(e.target.value||'5',10))} style={{ marginLeft: 6, width: 80 }} />
        </label>
        <label>
          Max characters
          <input type="number" min={200} max={20000} value={summaryMaxChars} onChange={(e)=>setSummaryMaxChars(parseInt(e.target.value||'2000',10))} style={{ marginLeft: 6, width: 100 }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={summaryDedup} onChange={(e)=>setSummaryDedup(e.target.checked)} />
          Remove near-duplicates
        </label>
        <button onClick={handleSaveSummaryOptions} className="btn-primary">Save</button>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div className="col">
          <button onClick={handleClearSWCaches} disabled={busy}>🗑️ Clear SW Caches</button>
        </div>
      </div>
    </div>
  )
}
