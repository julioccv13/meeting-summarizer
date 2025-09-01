import React, { useEffect, useState } from 'react'
import RecorderPanel from './ui/RecorderPanel'
import ImportPanel from './ui/ImportPanel'
import TranscriptionPanel from './ui/TranscriptionPanel'
import TranscriptView from './ui/TranscriptView'
import { SummaryPanel } from './ui/SummaryPanel'
import StorageManager from './ui/StorageManager'
import { showA2HSHintIfNeeded } from './pwa/a2hsHint'
import { showInstallPrompt, subscribeToInstallState, getInstallState } from './pwa/installPrompt'

export default function App() {
  const [transcript, setTranscript] = useState<string>('')
  const [summary, setSummary] = useState<string>('')
  const [canInstall, setCanInstall] = useState<boolean>(false)

  useEffect(() => {
    showA2HSHintIfNeeded()
    // reflect initial state and subscribe for changes
    setCanInstall(getInstallState().canInstall)
    const unsub = subscribeToInstallState((state) => setCanInstall(state.canInstall))
    return () => unsub()
  }, [])

  return (
    <div className="container">
      <h1>PWA Transcribe & Summarize (Offline)</h1>
      <p className="hint">Works best when installed to Home Screen.</p>
      {canInstall && (
        <div style={{ margin: '8px 0 16px' }}>
          <button onClick={() => showInstallPrompt()}>Install App</button>
        </div>
      )}

      <section>
        <h2>1) Record</h2>
        <RecorderPanel onResult={(r) => console.log('Recorded', r)} />
      </section>

      <section>
        <h2>2) Import</h2>
        <ImportPanel onImported={(items)=>console.log('Imported', items)} />
      </section>

      <section>
        <h2>3) Transcribe</h2>
        <TranscriptionPanel onTranscript={setTranscript} />
      </section>

      <section>
        <h2>4) Transcript</h2>
        <TranscriptView text={transcript} />
      </section>

      <section>
        <h2>5) Summarize</h2>
        <SummaryPanel 
          text={transcript}
          onSummaryGenerated={(res) => setSummary(res.summary)}
        />
      </section>

      <section>
        <h2>6) Summary</h2>
        <div className="card">
          <pre className="text">{summary}</pre>
        </div>
      </section>

      <section>
        <h2>7) Storage & Caches</h2>
        <div className="card">
          <StorageManager />
        </div>
      </section>
    </div>
  )
}
