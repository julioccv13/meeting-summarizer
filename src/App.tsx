import React, { useEffect, useState } from 'react'
import RecorderPanel from './ui/RecorderPanel'
import ImportPanel from './ui/ImportPanel'
import TranscriptionPanel from './ui/TranscriptionPanel'
import TranscriptView from './ui/TranscriptView'
import { SummaryPanel } from './ui/SummaryPanel'
import StorageManager from './ui/StorageManager'
import TranscriptHistory from './ui/TranscriptHistory'
import SettingsPanel from './ui/SettingsPanel'
import { showA2HSHintIfNeeded } from './pwa/a2hsHint'
import { showInstallPrompt, subscribeToInstallState, getInstallState } from './pwa/installPrompt'

export default function App() {
  const [transcript, setTranscript] = useState<string>('')
  const [summary, setSummary] = useState<string>('')
  const [canInstall, setCanInstall] = useState<boolean>(false)
  const [tab, setTab] = useState<'work' | 'library' | 'settings'>('work')

  useEffect(() => {
    showA2HSHintIfNeeded()
    // reflect initial state and subscribe for changes
    setCanInstall(getInstallState().canInstall)
    const unsub = subscribeToInstallState((state) => setCanInstall(state.canInstall))
    return () => unsub()
  }, [])

  return (
    <div className="container">
      {/* Header */}
      <div className="app-header">
        <div className="app-header-inner">
          <div className="brand">
            <div>
              <h1 className="brand-title">Meeting Summarizer</h1>
              <p className="brand-sub">Transcribe and summarize meetings offline</p>
            </div>
          </div>
          <div>
            {canInstall && (
              <button className="btn-primary" onClick={() => showInstallPrompt()}>Install App</button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <nav className="tabs" role="tablist" aria-label="Main sections" style={{ marginBottom: 12 }}>
        <button role="tab" className={`tab ${tab==='work'?'active':''}`} aria-selected={tab==='work'} onClick={() => setTab('work')}>Record & Transcribe</button>
        <button role="tab" className={`tab ${tab==='library'?'active':''}`} aria-selected={tab==='library'} onClick={() => setTab('library')}>Library & Export</button>
        <button role="tab" className={`tab ${tab==='settings'?'active':''}`} aria-selected={tab==='settings'} onClick={() => setTab('settings')}>Settings</button>
      </nav>

      {tab === 'work' && (
        <>
          <section>
            <h2>Record</h2>
            <p className="section-desc">Capture audio directly in your browser for transcription.</p>
            <RecorderPanel onResult={(r) => console.log('Recorded', r)} />
          </section>
          <section>
            <h2>Import</h2>
            <p className="section-desc">Import existing audio/video files to process offline.</p>
            <ImportPanel onImported={(items)=>console.log('Imported', items)} />
          </section>
          <section>
            <h2>Transcribe</h2>
            <p className="section-desc">Initialize the model and start transcription. First time may take longer.</p>
            <TranscriptionPanel onTranscript={setTranscript} />
          </section>
          <section>
            <h2>Transcript</h2>
            <p className="section-desc">Review and search your transcript. Save or export as needed.</p>
            <TranscriptView text={transcript} />
          </section>
          <section>
            <h2>Summarize</h2>
            <p className="section-desc">Generate a concise summary and key phrases.</p>
            <SummaryPanel 
              text={transcript}
              onSummaryGenerated={(res) => setSummary(res.summary)}
            />
          </section>
          <section>
            <h2>Summary</h2>
            <div className="card">
              <pre className="text">{summary}</pre>
            </div>
          </section>
        </>
      )}

      {tab === 'library' && (
        <>
          <section>
            <h2>Storage & Export</h2>
            <p className="section-desc">Manage stored items and export transcripts in various formats.</p>
            <div className="card" style={{ marginBottom: 12 }}>
              <StorageManager />
            </div>
            <TranscriptHistory onSelectTranscript={(t)=>{
              setTranscript(t.text)
              setTab('work')
            }} />
          </section>
        </>
      )}

      {tab === 'settings' && (
        <>
          <section>
            <h2>Model & App Settings</h2>
            <p className="section-desc">Choose default model and manage caches for offline use.</p>
            <SettingsPanel />
          </section>
        </>
      )}
    </div>
  )
}
