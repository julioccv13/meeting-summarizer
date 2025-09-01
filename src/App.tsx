import React, { useEffect, useState } from 'react'
import RecorderPanel from './ui/RecorderPanel'
import ImportPanel from './ui/ImportPanel'
import TranscriptionPanel from './ui/TranscriptionPanel'
import TranscriptView from './ui/TranscriptView'
import StorageManager from './ui/StorageManager'
import TranscriptHistory from './ui/TranscriptHistory'
import SettingsPanel from './ui/SettingsPanel'
import { SummaryHistory } from './ui/SummaryHistory'
import { showA2HSHintIfNeeded } from './pwa/a2hsHint'
import { showInstallPrompt, subscribeToInstallState, getInstallState } from './pwa/installPrompt'
import { initWhisper, getWhisperAPI, type Segment } from './whisper/api'
import { detectAvailableModels } from './whisper/loader'
import { summarize, summarizeLongText, type SummarizationOptions, type SummaryResult } from './nlp/textrank'
import { saveTranscript } from './store/transcripts'
import { saveSummary } from './store/summaries'
import { showToast } from './utils/download'

export default function App() {
  const [transcript, setTranscript] = useState<string>('')
  const [transcriptSegments, setTranscriptSegments] = useState<Segment[] | undefined>(undefined)
  const [summary, setSummary] = useState<string>('')
  const [canInstall, setCanInstall] = useState<boolean>(false)
  const [tab, setTab] = useState<'work' | 'library' | 'settings'>('work')
  const [processing, setProcessing] = useState<{active:boolean; message?:string}>({active:false})
  const [autoSummarizeRequested, setAutoSummarizeRequested] = useState<boolean>(false)

  useEffect(() => {
    showA2HSHintIfNeeded()
    // reflect initial state and subscribe for changes
    setCanInstall(getInstallState().canInstall)
    const unsub = subscribeToInstallState((state) => setCanInstall(state.canInstall))
    return () => unsub()
  }, [])

  // Auto-summarize when requested (e.g., from imported transcription)
  useEffect(() => {
    (async () => {
      if (!autoSummarizeRequested || !transcript || transcript.trim().length === 0) return
      try {
        setProcessing({active:true, message:'Summarizing…', progress: 0.6})
        const rawOpts = localStorage.getItem('summaryOptions')
        const opts: SummarizationOptions = rawOpts ? JSON.parse(rawOpts) : { maxSentences: 5, maxChars: 2000, removeNearDuplicates: true, locale: 'en' }
        const summaryRes: SummaryResult = transcript.length > 8000 ? summarizeLongText(transcript, opts) : summarize(transcript, opts)
        setSummary(summaryRes.summary)
        // Save transcript (imported) and linked summary
        setProcessing({active:true, message:'Saving…', progress: 0.9})
        const saved = await saveTranscript(transcript, { segments: transcriptSegments, audioSource: 'imported' })
        await saveSummary(summaryRes, { transcriptId: saved.id, source: 'auto', originalOptions: opts })
        showToast('Saved transcript and summary')
      } catch (e) {
        console.error('Auto summary failed:', e)
      } finally {
        setProcessing({active:false})
        setAutoSummarizeRequested(false)
      }
    })()
  }, [autoSummarizeRequested, transcript, transcriptSegments])

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
            <RecorderPanel onResult={async (r) => {
              // Auto pipeline: init -> transcribe -> save -> summarize
              setProcessing({active:true, message:'Initializing model…', progress: 0.05})
              let model = localStorage.getItem('defaultModel') || ''
              try {
                const keys = await detectAvailableModels()
                if (!model || !keys.includes(model)) {
                  model = keys.includes('base.q5_1') ? 'base.q5_1' : (keys[0] || 'base.q5_1')
                  localStorage.setItem('defaultModel', model)
                }
              } catch {
                model = model || 'base.q5_1'
              }
              try {
                await initWhisper(model, (p)=> setProcessing({active:true, message:p.message, progress: Math.min(0.5, (p.progress ?? 0) * 0.5)}))
                setProcessing({active:true, message:'Transcribing…', progress: 0.5})
                const api = getWhisperAPI()
                const res = await api.transcribe(r.float32Mono16k, {}, {
                  onProgress: (p)=> setProcessing({active:true, message:p.message, progress: 0.5 + Math.min(0.4, (p.progress ?? 0) * 0.4)}),
                  onSegment: ()=>{}
                })
                setTranscript(res.text)
                setTranscriptSegments(res.segments)
                // Save transcript
                setProcessing({active:true, message:'Saving transcript…', progress: 0.9})
                const saved = await saveTranscript(res.text, {
                  segments: res.segments,
                  duration: r.durationSec,
                  modelUsed: model,
                  audioSource: 'recording'
                })
                // Auto summarize
                const rawOpts = localStorage.getItem('summaryOptions')
                const opts: SummarizationOptions = rawOpts ? JSON.parse(rawOpts) : { maxSentences: 5, maxChars: 2000, removeNearDuplicates: true, locale: 'en' }
                setProcessing({active:true, message:'Generating summary…', progress: 0.93})
                const summaryRes: SummaryResult = res.text.length > 8000 ? summarizeLongText(res.text, opts) : summarize(res.text, opts)
                setSummary(summaryRes.summary)
                setProcessing({active:true, message:'Saving summary…', progress: 0.98})
                await saveSummary(summaryRes, { transcriptId: saved.id, source: 'auto', originalOptions: opts })
                showToast('Saved transcript and summary')
                setProcessing({active:false})
              } catch (e:any) {
                console.error(e)
                setProcessing({active:false, message:e?.message || 'Failed'})
                alert('Auto transcription failed: ' + (e?.message || 'Unknown error'))
              }
            }} />
          </section>
          <section>
            <h2>Import</h2>
            <p className="section-desc">Import existing audio/video files to process offline.</p>
            <ImportPanel onImported={(items)=>console.log('Imported', items)} />
          </section>
          <section>
            <h2>Transcribe</h2>
            <p className="section-desc">Initialize the model and start transcription. First time may take longer.</p>
            <TranscriptionPanel onTranscript={(t, segs)=>{ setTranscript(t); setTranscriptSegments(segs); setAutoSummarizeRequested(true) }} />
          </section>
          <section>
            <h2>Transcript</h2>
            <p className="section-desc">Review and search your transcript. Save or export as needed.</p>
            <TranscriptView text={transcript} />
          </section>
          <section>
            <h2>Summary</h2>
            <div className="card">
              <pre className="text">{summary}</pre>
            </div>
          </section>
          {processing.active && (
            <div className="card" style={{ marginTop: 8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 8 }}>
                <strong>Processing</strong>
                <span style={{ opacity: 0.8 }}>{Math.round((processing.progress ?? 0) * 100)}%</span>
              </div>
              <div style={{ height: 8, background: '#e5e7eb', borderRadius: 6, overflow:'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round((processing.progress ?? 0)*100)}%`, background: '#2563eb', transition: 'width 200ms ease' }} />
              </div>
              <div style={{ marginTop: 8, opacity: 0.8 }}>{processing.message || 'Working…'}</div>
            </div>
          )}
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
            <div style={{ height: 12 }} />
            <SummaryHistory />
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
