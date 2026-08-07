'use client'

import { transcribeVoiceBlob } from '@/lib/audio/client-transcribe'

type SpeechRec = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null
  onerror: ((ev: { error?: string }) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<{
    isFinal: boolean
    0: { transcript: string }
  }>
}

export type LiveCaptionMode =
  | 'webspeech'
  | 'chunk-poll'
  | 'hybrid'
  | 'listening-only'

export type LiveCaptionHandle = {
  mode: LiveCaptionMode
  stop: () => void
}

/**
 * Draft-only filter: hide Latin/Franco gibberish from the live box.
 * Final STT still goes through the server Arabic cascade.
 */
export function looksLikeArabicDraft(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return false
  const arabic = (t.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g) || [])
    .length
  const letters = (t.match(/\p{L}/gu) || []).length
  if (letters === 0) return t.length <= 24
  // Allow short MSA words early («أبغا», «نعم»)
  if (arabic >= 2 && arabic / letters >= 0.2) return true
  if (arabic >= 1 && arabic / letters >= 0.35) return true
  if (arabic >= 3) return true
  return false
}

function getSpeechRecognitionCtor(): (new () => SpeechRec) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec
    webkitSpeechRecognition?: new () => SpeechRec
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export function browserSupportsLiveSpeech(): boolean {
  return Boolean(getSpeechRecognitionCtor())
}

function startWebSpeechCaptions(opts: {
  lang: string
  onPartial: (spoken: string) => void
  onStatus?: (message: string) => void
}): (() => void) | null {
  const Ctor = getSpeechRecognitionCtor()
  if (!Ctor) return null

  let listening = true
  const finalChunks: string[] = []
  let lastGood = ''
  let rec: SpeechRec | null = null

  try {
    rec = new Ctor()
    rec.lang = opts.lang
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onresult = (ev) => {
      if (!listening) return
      let interim = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const row = ev.results[i]
        const piece = (row[0]?.transcript || '').trim()
        if (!piece) continue
        if (row.isFinal) finalChunks.push(piece)
        else interim += `${piece} `
      }
      const spoken = [finalChunks.join(' '), interim.trim()]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (!spoken) return
      if (looksLikeArabicDraft(spoken)) {
        lastGood = spoken
        opts.onPartial(spoken)
      } else if (lastGood) {
        opts.onPartial(lastGood)
      }
    }

    rec.onerror = () => {
      /* best-effort; chunk-poll may still fill the box */
    }

    rec.onend = () => {
      if (!listening || !rec) return
      try {
        rec.start()
      } catch {
        /* ignore restart races */
      }
    }

    rec.start()
    return () => {
      listening = false
      try {
        rec?.abort()
      } catch {
        try {
          rec?.stop()
        } catch {
          /* ignore */
        }
      }
      rec = null
    }
  } catch {
    return null
  }
}

function startChunkPollCaptions(opts: {
  getPartialBlob: () => { blob: Blob; mimeType: string } | null
  onPartial: (spoken: string) => void
}): () => void {
  let active = true
  let inflight = false

  const tick = async () => {
    if (!active || inflight) return
    const snap = opts.getPartialBlob()
    if (!snap || snap.blob.size < 1800) return
    inflight = true
    try {
      const result = await transcribeVoiceBlob(snap.blob, snap.mimeType)
      if (!active) return
      if (result.ok && looksLikeArabicDraft(result.text)) {
        opts.onPartial(result.text)
      }
    } catch {
      /* ignore poll errors */
    } finally {
      inflight = false
    }
  }

  const id = window.setInterval(() => void tick(), 2200)
  void tick()

  return () => {
    active = false
    window.clearInterval(id)
  }
}

/**
 * Live interim captions while MediaRecorder runs.
 * - Prefer Web Speech `ar-SA` for fast display (never the send/save source of truth).
 * - Always poll recorder snapshots through Arabic STT when available — Web Speech
 *   often stays silent while MediaRecorder holds the mic.
 * - Else emit listening-only status («جاري الاستماع…»).
 */
export function startLiveCaptions(opts: {
  onPartial: (spoken: string) => void
  onStatus?: (message: string) => void
  /** Snapshot of audio so far — enables near-live STT when Web Speech is missing. */
  getPartialBlob?: () => { blob: Blob; mimeType: string } | null
  lang?: string
}): LiveCaptionHandle {
  const lang = opts.lang || 'ar-SA'
  const stops: Array<() => void> = []
  let lastSpoken = ''

  const emit = (spoken: string) => {
    const t = spoken.replace(/\s+/g, ' ').trim()
    if (!t || t === lastSpoken) return
    // Prefer growing transcripts; allow shorter only if much more Arabic-looking
    if (
      t.length + 8 < lastSpoken.length &&
      looksLikeArabicDraft(lastSpoken)
    ) {
      return
    }
    lastSpoken = t
    opts.onPartial(t)
  }

  const stopWeb = startWebSpeechCaptions({
    lang,
    onPartial: emit,
    onStatus: opts.onStatus,
  })
  if (stopWeb) stops.push(stopWeb)

  if (opts.getPartialBlob) {
    stops.push(
      startChunkPollCaptions({
        getPartialBlob: opts.getPartialBlob,
        onPartial: emit,
      })
    )
  }

  if (stops.length === 0) {
    opts.onStatus?.(
      'جاري الاستماع… النص العربي الدقيق يظهر بعد الإيقاف للمراجعة'
    )
    return {
      mode: 'listening-only',
      stop: () => {},
    }
  }

  if (stopWeb && opts.getPartialBlob) {
    opts.onStatus?.(
      'الكلام يظهر أثناء الحديث في المربع — بعد الإيقاف نُسخ أدق؛ أرسل يدوياً'
    )
    return {
      mode: 'hybrid',
      stop: () => {
        for (const s of stops) s()
      },
    }
  }

  if (stopWeb) {
    opts.onStatus?.(
      'الكلام يظهر أثناء الحديث (مسودة) — بعد الإيقاف نُسخ عربي دقيق للمراجعة'
    )
    return {
      mode: 'webspeech',
      stop: () => {
        for (const s of stops) s()
      },
    }
  }

  opts.onStatus?.('جاري الاستماع… سيظهر نص تقريبي أثناء الحديث في المربع')
  return {
    mode: 'chunk-poll',
    stop: () => {
      for (const s of stops) s()
    },
  }
}
