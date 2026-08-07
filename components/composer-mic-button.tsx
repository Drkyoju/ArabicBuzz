'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Loader2 } from 'lucide-react'
import {
  checkBrowserRecordSupport,
  extForAudioMime,
  startBrowserRecording,
  type ActiveRecording,
} from '@/lib/audio/browser-record'
import { authHeaders } from '@/lib/supabase/browser'
import { cn } from '@/lib/utils'

type MicState = 'idle' | 'recording' | 'transcribing'

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

function getSpeechRecognitionCtor(): (new () => SpeechRec) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec
    webkitSpeechRecognition?: new () => SpeechRec
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

/**
 * Mic → high-quality Arabic STT in the composer (Whisper/Gemini/Willow cascade).
 * Live captions (browser) are draft-only; final text always comes from the server.
 */
export function ComposerMicButton({
  composerValue = '',
  onTranscript,
  onPartial,
  onStatus,
  disabled,
  className,
}: {
  /** Current composer text — kept as prefix while dictating. */
  composerValue?: string
  onTranscript: (text: string, meta?: { providerLabelAr?: string }) => void
  onPartial?: (text: string) => void
  /** Status line above the composer (avoids clipped tooltips). */
  onStatus?: (message: string) => void
  disabled?: boolean
  className?: string
}) {
  const [state, setState] = useState<MicState>('idle')
  const activeRef = useRef<ActiveRecording | null>(null)
  const speechRef = useRef<SpeechRec | null>(null)
  const listeningRef = useRef(false)
  const finalChunksRef = useRef<string[]>([])
  const prefixRef = useRef('')

  function setHint(message: string) {
    onStatus?.(message)
  }

  useEffect(() => {
    return () => {
      listeningRef.current = false
      activeRef.current?.stream.getTracks().forEach((t) => t.stop())
      activeRef.current = null
      try {
        speechRef.current?.abort()
      } catch {
        /* ignore */
      }
      speechRef.current = null
    }
  }, [])

  function stopLiveCaptions() {
    listeningRef.current = false
    const rec = speechRef.current
    speechRef.current = null
    try {
      rec?.stop()
    } catch {
      /* ignore */
    }
    finalChunksRef.current = []
  }

  /** Optional live draft captions — not the final source of truth. */
  function startLiveCaptions(prefix: string): boolean {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return false

    try {
      const rec = new Ctor()
      rec.lang = 'ar-SA'
      rec.continuous = true
      rec.interimResults = true
      rec.maxAlternatives = 1
      finalChunksRef.current = []
      prefixRef.current = prefix
      listeningRef.current = true

      rec.onresult = (ev) => {
        let interim = ''
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const row = ev.results[i]
          const piece = (row[0]?.transcript || '').trim()
          if (!piece) continue
          if (row.isFinal) finalChunksRef.current.push(piece)
          else interim += `${piece} `
        }
        const spoken = [finalChunksRef.current.join(' '), interim.trim()]
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
        const combined = [prefixRef.current, spoken].filter(Boolean).join(' ').trim()
        if (combined) onPartial?.(combined)
      }

      rec.onerror = () => {
        /* live captions are best-effort */
      }

      rec.onend = () => {
        if (!listeningRef.current) return
        try {
          rec.start()
        } catch {
          /* ignore */
        }
      }

      speechRef.current = rec
      rec.start()
      return true
    } catch {
      listeningRef.current = false
      return false
    }
  }

  async function toggle() {
    if (disabled) return

    if (state === 'recording') {
      if (!activeRef.current) {
        stopLiveCaptions()
        setState('idle')
        setHint('انقطع التسجيل — حاول مرة ثانية')
        return
      }

      setState('transcribing')
      setHint('جاري النسخ الدقيق (Whisper/Gemini)… سيظهر في المربع')
      stopLiveCaptions()
      try {
        const { blob, mimeType } = await activeRef.current.stop()
        activeRef.current = null
        if (blob.size < 400) {
          throw new Error('التسجيل قصير جداً — تكلم ثانية أو اثنتين ثم أوقف')
        }
        const form = new FormData()
        form.append('file', blob, `voice.${extForAudioMime(mimeType)}`)
        const res = await fetch('/api/audio/transcribe', {
          method: 'POST',
          headers: await authHeaders(),
          body: form,
        })
        const data = (await res.json()) as {
          text?: string
          error?: string
          providerLabelAr?: string
        }
        if (!res.ok || !data.text?.trim()) {
          throw new Error(data.error || 'تعذّر النسخ الصوتي')
        }
        const full = [prefixRef.current, data.text.trim()]
          .filter(Boolean)
          .join(' ')
          .trim()
        onTranscript(full, { providerLabelAr: data.providerLabelAr })
        setHint(
          `نسخ دقيق عبر ${data.providerLabelAr || 'النموذج'} — راجع ثم أرسل`
        )
      } catch (e) {
        setHint(e instanceof Error ? e.message : 'فشل النسخ الصوتي')
      } finally {
        setState('idle')
      }
      return
    }

    if (state !== 'idle') return

    const support = checkBrowserRecordSupport()
    if (!support.ok) {
      setHint(support.reasonAr || 'التسجيل غير متاح')
      return
    }

    try {
      setHint('يُطلب إذن الميكروفون…')
      prefixRef.current = composerValue.trim()
      const active = await startBrowserRecording()
      activeRef.current = active
      const live = startLiveCaptions(prefixRef.current)
      setState('recording')
      setHint(
        live
          ? 'تكلم الآن — مسودة حية في المربع، والنسخ النهائي الدقيق بعد الإيقاف'
          : 'جاري التسجيل بجودة عالية… اضغط للإيقاف ليُنسخ النص بدقة'
      )
    } catch (e) {
      setHint(e instanceof Error ? e.message : 'تعذّر بدء التسجيل')
      setState('idle')
      listeningRef.current = false
      activeRef.current = null
    }
  }

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled || state === 'transcribing'}
        onClick={() => void toggle()}
        aria-label={state === 'recording' ? 'إيقاف الإملاء' : 'إملاء نص بالصوت'}
        title={
          state === 'recording'
            ? 'إيقاف ثم نسخ دقيق للعربية'
            : 'إملاء عربي فوري — Willow / Gemini / Whisper'
        }
        className={cn(
          'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-40',
          state === 'recording'
            ? 'border-ab-warn bg-ab-warn/15 text-ab-warn animate-pulse'
            : state === 'transcribing'
              ? 'border-ab-border bg-stone-100 text-stone-500'
              : 'border-ab-border bg-white text-ab-ink hover:bg-stone-50'
        )}
      >
        {state === 'transcribing' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : state === 'recording' ? (
          <Square className="h-3.5 w-3.5 fill-current" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </button>
    </div>
  )
}
