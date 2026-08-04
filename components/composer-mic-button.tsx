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
 * Mic → Arabic text in the composer box (live browser STT, cloud fallback).
 * User reviews/edits the text before sending.
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
  const modeRef = useRef<'browser' | 'cloud' | null>(null)
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

  function stopBrowserSpeech(): string {
    listeningRef.current = false
    const rec = speechRef.current
    speechRef.current = null
    try {
      rec?.stop()
    } catch {
      /* ignore */
    }
    const text = finalChunksRef.current.join(' ').replace(/\s+/g, ' ').trim()
    finalChunksRef.current = []
    return text
  }

  function startBrowserSpeech(prefix: string): boolean {
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

      rec.onerror = (ev) => {
        const code = ev.error || ''
        if (code === 'aborted' || code === 'no-speech') return
        setHint(
          code === 'not-allowed'
            ? 'المتصفح منع الميكروفون — اسمح بالوصول من إعدادات الموقع'
            : `خطأ التعرف: ${code}`
        )
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
      modeRef.current = 'browser'
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
      if (modeRef.current === 'browser') {
        modeRef.current = null
        const spoken = stopBrowserSpeech()
        setState('idle')
        if (spoken) {
          const full = [prefixRef.current, spoken].filter(Boolean).join(' ').trim()
          onTranscript(full, { providerLabelAr: 'تعرّف المتصفح (ar-SA)' })
          setHint('النص في المربع — راجع أي خطأ ثم اضغط إرسال')
        } else {
          setHint('ما انمسك كلام واضح — تكلم أقرب للمايك وحاول مرة ثانية')
        }
        return
      }

      if (activeRef.current) {
        setState('transcribing')
        setHint('جاري تحويل الصوت لنص… سيظهر في المربع')
        try {
          const { blob, mimeType } = await activeRef.current.stop()
          activeRef.current = null
          modeRef.current = null
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
          setHint('النص في المربع — راجع وصحّح ثم أرسل')
        } catch (e) {
          setHint(e instanceof Error ? e.message : 'فشل النسخ الصوتي')
        } finally {
          setState('idle')
        }
        return
      }
    }

    if (state !== 'idle') return

    const support = checkBrowserRecordSupport()
    if (!support.ok && !getSpeechRecognitionCtor()) {
      setHint(support.reasonAr || 'التسجيل غير متاح')
      return
    }

    try {
      setHint('يُطلب إذن الميكروفون…')
      prefixRef.current = composerValue.trim()
      const browserOk = startBrowserSpeech(prefixRef.current)
      if (browserOk) {
        setState('recording')
        setHint('تكلم الآن — النص يظهر في المربع مباشرة. اضغط لإيقاف')
        return
      }

      const active = await startBrowserRecording()
      activeRef.current = active
      modeRef.current = 'cloud'
      setState('recording')
      setHint('جاري التسجيل… اضغط للإيقاف ليظهر النص في المربع')
    } catch (e) {
      setHint(e instanceof Error ? e.message : 'تعذّر بدء التسجيل')
      setState('idle')
      modeRef.current = null
      listeningRef.current = false
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
            ? 'إيقاف وكتابة النص في المربع'
            : 'إملاء — النص يُكتب في مربع الإدخال للمراجعة (ليس حفظ ملف)'
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
