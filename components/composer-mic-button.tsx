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

/**
 * Claude/Gemini-style click-to-talk mic for the room composer.
 */
export function ComposerMicButton({
  onTranscript,
  disabled,
  className,
}: {
  onTranscript: (text: string, meta?: { providerLabelAr?: string }) => void
  disabled?: boolean
  className?: string
}) {
  const [state, setState] = useState<MicState>('idle')
  const [hint, setHint] = useState('')
  const activeRef = useRef<ActiveRecording | null>(null)

  useEffect(() => {
    return () => {
      const active = activeRef.current
      if (active) {
        active.stream.getTracks().forEach((t) => t.stop())
        activeRef.current = null
      }
    }
  }, [])

  async function toggle() {
    if (disabled) return

    if (state === 'recording' && activeRef.current) {
      setState('transcribing')
      setHint('جاري تحويل الصوت لنص عربي…')
      try {
        const { blob, mimeType } = await activeRef.current.stop()
        activeRef.current = null
        const form = new FormData()
        form.append(
          'file',
          blob,
          `voice.${extForAudioMime(mimeType)}`
        )
        const res = await fetch('/api/audio/transcribe', {
          method: 'POST',
          headers: await authHeaders(),
          body: form,
        })
        const data = (await res.json()) as {
          text?: string
          error?: string
          providerLabelAr?: string
          messageAr?: string
        }
        if (!res.ok || !data.text) {
          throw new Error(data.error || 'تعذّر النسخ الصوتي')
        }
        onTranscript(data.text, { providerLabelAr: data.providerLabelAr })
        setHint(data.messageAr || 'تم النسخ')
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
      const active = await startBrowserRecording()
      activeRef.current = active
      setState('recording')
      setHint('جاري الاستماع… اضغط لإيقاف وتحويل النص')
    } catch (e) {
      setHint(e instanceof Error ? e.message : 'تعذّر بدء التسجيل')
      setState('idle')
    }
  }

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled || state === 'transcribing'}
        onClick={() => void toggle()}
        aria-label={
          state === 'recording' ? 'إيقاف التسجيل' : 'تسجيل صوت'
        }
        title={
          state === 'recording'
            ? 'إيقاف وتحويل لنص'
            : 'تحدث بالعربية — انقر للتسجيل'
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
      {hint && (
        <p className="absolute bottom-full mb-1 w-48 rounded-md border border-ab-border bg-white px-2 py-1 text-[10px] text-stone-600 shadow-sm end-0">
          {hint}
        </p>
      )}
    </div>
  )
}
