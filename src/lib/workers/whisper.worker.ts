/// <reference lib="webworker" />
// Whisper WASM Worker – Minimal scaffold per plan

type InitMsg = { type: 'init'; wasmURL: string; glueURL?: string; preferThreads?: boolean }
type LoadModelMsg = { type: 'loadModel'; modelId: string; modelURL: string }
type TranscribeMsg = { type: 'transcribe'; id: string; pcm: Float32Array|Int16Array; sampleRate: number; opts?: { threads?: number; chunkMs?: number; beamSize?: number } }
type CancelMsg = { type: 'cancel'; id?: string }
type TerminateMsg = { type: 'terminate' }

type ProgressEvt = { type: 'progress'; stage: 'Initialize'|'LoadModel'|'Transcribe'|'Save'; value?: number; note?: string }
type LanguageEvt = { type: 'language'; code: string; confidence?: number }
type Segment = { startMs:number; endMs:number; text:string }
type ResultEvt = { type: 'result'; id: string; segments: Segment[]; text: string }
type ErrorEvt = { type: 'error'; message: string }

let Module: any
let whisperCtxPtr: number|undefined
let cancelling = false
let jobId: string | null = null
const ctx: DedicatedWorkerGlobalScope = self as any
const supportsThreads = ctx.crossOriginIsolated === true

function postMsg(p: ProgressEvt | LanguageEvt | ResultEvt | ErrorEvt | {type:'modelLoaded'} ) { ctx.postMessage(p) }

async function loadModule(glueURL?: string, wasmURL?: string, preferThreads: boolean = true) {
  postMsg({ type: 'progress', stage: 'Initialize', value: 0 })
  if (glueURL) { try { (ctx as any).importScripts(glueURL) } catch {} }
  const factory = (ctx as any).createWhisperModule || (ctx as any).ModuleFactory || (ctx as any).Module
  if (!factory) {
    // Fallback: mock module
    Module = createMockModule()
    postMsg({ type: 'progress', stage: 'Initialize', value: 100, note: 'Mock runtime' })
    return
  }
  const useThreads = preferThreads && supportsThreads
  Module = await factory({
    locateFile: (p: string) => (p.endsWith('.wasm') && wasmURL) ? wasmURL : p,
    pthreadPoolSize: useThreads ? (navigator.hardwareConcurrency || 2) : 0,
    onAbort: (r: any) => postMsg({ type: 'error', message: 'WASM abort: ' + String(r) })
  })
  postMsg({ type: 'progress', stage: 'Initialize', value: 100 })
}

async function loadModelURL(modelURL: string) {
  postMsg({ type: 'progress', stage: 'LoadModel', value: 0 })
  try {
    const res = await fetch(modelURL)
    if (!res.ok) throw new Error('Failed to fetch model: ' + res.status)
    const buf = new Uint8Array(await res.arrayBuffer())
    const memPath = '/model.bin'
    try { Module.FS_unlink?.(memPath) } catch {}
    Module.FS_createDataFile?.('/', 'model.bin', buf, true, false)

    const w_init_from_file = Module?.cwrap?.('w_init_from_file', 'number', ['string']) || Module?.cwrap?.('whisper_init_from_file', 'number', ['string'])
    // Free previous
    if (whisperCtxPtr && Module?.cwrap) {
      try { const w_free = Module.cwrap('w_free', 'number', ['number']) || Module.cwrap('whisper_free','void',['number']); w_free(whisperCtxPtr) } catch {}
      whisperCtxPtr = undefined
    }
    whisperCtxPtr = w_init_from_file ? w_init_from_file(memPath) : 1 // mock context
    if (!whisperCtxPtr) throw new Error('whisper_init_from_file failed')
    postMsg({ type: 'progress', stage: 'LoadModel', value: 100 })
    postMsg({ type: 'modelLoaded' })
  } catch (e: any) {
    // Mock path
    whisperCtxPtr = 1
    postMsg({ type: 'progress', stage: 'LoadModel', value: 100, note: 'Mock model' })
    postMsg({ type: 'modelLoaded' })
  }
}

async function transcribe(id: string, pcm: Float32Array|Int16Array, sampleRate: number, opts: {chunkMs?:number, threads?:number, beamSize?:number} = {}) {
  cancelling = false; jobId = id
  postMsg({ type: 'progress', stage: 'Transcribe', value: 0 })

  const f32 = toFloat32Mono(pcm)
  const chunkMs = Math.max(10000, Math.min(60000, opts.chunkMs ?? 30000))
  const chunks = sliceIntoWindows(f32, sampleRate, chunkMs)
  const segments: Segment[] = []

  const totalMs = Math.floor(f32.length * 1000 / sampleRate)
  let processedMs = 0

  // Real exports or mock
  const w_full_default = Module?.cwrap?.('w_full_default', 'number', ['number','number','number','number']) || null
  const w_get_segment_count = Module?.cwrap?.('w_n_segments', 'number', ['number']) || Module?.cwrap?.('whisper_full_n_segments','number',['number']) || null
  const w_get_segment_text  = Module?.cwrap?.('w_seg_text', 'string', ['number','number']) || Module?.cwrap?.('whisper_full_get_segment_text','string',['number','number']) || null
  const w_get_segment_t0    = Module?.cwrap?.('w_seg_t0', 'number', ['number','number']) || Module?.cwrap?.('whisper_full_get_segment_t0','number',['number','number']) || null
  const w_get_segment_t1    = Module?.cwrap?.('w_seg_t1', 'number', ['number','number']) || Module?.cwrap?.('whisper_full_get_segment_t1','number',['number','number']) || null

  for (let i = 0; i < chunks.length; i++) {
    if (cancelling) break
    const { data, startMs } = chunks[i]

    if (w_full_default && Module?._malloc && Module?._free && w_get_segment_count && w_get_segment_text && w_get_segment_t0 && w_get_segment_t1 && whisperCtxPtr) {
      const nBytes = data.length * 4
      const ptr = Module._malloc(nBytes)
      Module.HEAPF32.set(data, ptr / 4)
      const rc = w_full_default(whisperCtxPtr, ptr, data.length, sampleRate)
      Module._free(ptr)
      if (rc !== 0) throw new Error('whisper_full_default failed code ' + rc)
      const n = w_get_segment_count(whisperCtxPtr)
      for (let s = 0; s < n; s++) {
        const t0 = w_get_segment_t0(whisperCtxPtr, s)
        const t1 = w_get_segment_t1(whisperCtxPtr, s)
        const text = w_get_segment_text(whisperCtxPtr, s) || ''
        const start = startMs + ticksToMs(t0)
        const end   = startMs + ticksToMs(t1)
        if (text.trim()) segments.push({ startMs: start, endMs: end, text })
      }
    } else {
      // Mock chunk result
      const secs = Math.max(1, Math.floor(data.length / sampleRate))
      segments.push({ startMs, endMs: startMs + secs*1000, text: `Mock segment (${i+1}/${chunks.length})` })
      await new Promise(r => setTimeout(r, 120))
    }

    processedMs = Math.min(totalMs, startMs + Math.floor(data.length * 1000 / sampleRate))
    const pct = Math.max(0, Math.min(100, Math.round(processedMs * 100 / totalMs)))
    postMsg({ type: 'progress', stage: 'Transcribe', value: pct })
  }

  const text = segments.map(s => s.text).join(' ').replace(/\s+/g,' ').trim()
  postMsg({ type: 'result', id, segments, text })
}

function toFloat32Mono(input: Float32Array|Int16Array): Float32Array {
  if (input instanceof Float32Array) return input
  const out = new Float32Array(input.length)
  for (let i=0;i<input.length;i++) out[i] = Math.max(-1, Math.min(1, input[i]/32768))
  return out
}
function sliceIntoWindows(f32: Float32Array, sr: number, windowMs: number){
  const win = Math.floor(windowMs * sr / 1000)
  const hop = win
  const res: {data:Float32Array; startMs:number}[] = []
  for (let i=0;i<f32.length;i+=hop){
    const end = Math.min(f32.length, i+win)
    res.push({ data: f32.subarray(i,end), startMs: Math.floor(i*1000/sr) })
  }
  return res
}
function ticksToMs(ticks:number){ return Math.floor(ticks*10) }
function createMockModule(){
  return {
    cwrap: () => null,
    FS_createDataFile: () => {},
    FS_unlink: () => {},
    _malloc: (n:number)=>n,
    _free: (_:number)=>{},
    HEAPF32: new Float32Array(256*1024)
  }
}

ctx.onmessage = async (ev: MessageEvent<InitMsg|LoadModelMsg|TranscribeMsg|CancelMsg|TerminateMsg>) => {
  const msg: any = ev.data
  try{
    if (msg.type === 'init') { await loadModule(msg.glueURL, msg.wasmURL, msg.preferThreads ?? true); return }
    if (msg.type === 'loadModel') { await loadModelURL(msg.modelURL); return }
    if (msg.type === 'transcribe') { await transcribe(msg.id, msg.pcm, msg.sampleRate, msg.opts||{}); return }
    if (msg.type === 'cancel') { cancelling = true; return }
    if (msg.type === 'terminate') { try{ if (Module?.cwrap && whisperCtxPtr){ const w_free = Module.cwrap('w_free','number',['number']) || Module.cwrap('whisper_free','void',['number']); w_free(whisperCtxPtr) } } catch{} ctx.close(); return }
  }catch(e:any){ postMsg({ type:'error', message: e?.message || String(e) }) }
}

export type { Segment }
