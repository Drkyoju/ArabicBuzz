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

export type LiveCaptionMode = 'webspeech' | 'chunk-poll' | 'listening-only'

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
  if (arabic >= 1 && arabic / letters >= 0.25) return true
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

/**
 * Live interim captions while MediaRecorder runs.
 * - Prefer Web Speech `ar-SA` for display only (never the send/save source of truth).
 * - Else poll short recorder snapshots through the free Arabic STT cascade.
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
  const Ctor = getSpeechRecognitionCtor()

  if (Ctor) {
    let listening = true
    const finalChunks: string[] = []
    let lastGood = ''
    let rec: SpeechRec | null = null

    try {
      rec = new Ctor()
      rec.lang = lang
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
          // Keep last Arabic draft; ignore Latin/garbage interim
          opts.onPartial(lastGood)
        }
      }

      rec.onerror = () => {
        /* best-effort live captions */
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
      opts.onStatus?.(
        'الكلام يظهر أثناء الحديث (مسودة) — بعد الإيقاف نُسخ عربي دقيق للمراجعة'
      )
      return {
        mode: 'webspeech',
        stop: () => {
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
        },
      }
    } catch {
      /* fall through to chunk poll */
    }
  }

  if (opts.getPartialBlob) {
    let active = true
    let inflight = false
    let lastText = ''
    opts.onStatus?.('جاري الاستماع… سيظهر نص تقريبي أثناء الحديث')
    opts.onPartial('')

    const tick = async () => {
      if (!active || inflight) return
      const snap = opts.getPartialBlob?.()
      if (!snap || snap.blob.size < 2500) return
      inflight = true
      try {
        const result = await transcribeVoiceBlob(snap.blob, snap.mimeType)
        if (!active) return
        if (result.ok && looksLikeArabicDraft(result.text)) {
          lastText = result.text
          opts.onPartial(result.text)
        }
      } catch {
        /* ignore poll errors */
      } finally {
        inflight = false
      }
    }

    const id = window.setInterval(() => void tick(), 3200)
    void tick()

    return {
      mode: 'chunk-poll',
      stop: () => {
        active = false
        window.clearInterval(id)
        void lastText
      },
    }
  }

  opts.onStatus?.('جاري الاستماع… النص العربي الدقيق يظهر بعد الإيقاف للمراجعة')
  return {
    mode: 'listening-only',
    stop: () => {},
  }
}
