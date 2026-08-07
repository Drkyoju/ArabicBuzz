'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Loader2 } from 'lucide-react'
import {
  checkBrowserRecordSupport,
  startBrowserRecording,
  type ActiveRecording,
} from '@/lib/audio/browser-record'
import { transcribeVoiceBlob } from '@/lib/audio/client-transcribe'
import { cn } from '@/lib/utils'

type MicState = 'idle' | 'recording' | 'transcribing'

/**
 * Mic → high-quality Arabic STT in the composer (Whisper/Gemini/Willow cascade).
 *
 * Live browser SpeechRecognition is NOT injected into the composer — it often
 * produces Latin/garbage for Arabic. Final text comes only from the server STT
 * cascade and lands in an editable field for the user to review before send.
 */
export function ComposerMicButton({
  composerValue = '',
  onTranscript,
  onRestore,
  onStatus,
  disabled,
  className,
}: {
  /** Current composer text — kept as prefix while dictating. */
  composerValue?: string
  onTranscript: (text: string, meta?: { providerLabelAr?: string }) => void
  /** Restore composer if STT fails (clears any accidental draft). */
  onRestore?: (text: string) => void
  /** Status line above the composer (avoids clipped tooltips). */
  onStatus?: (message: string) => void
  disabled?: boolean
  className?: string
}) {
  const [state, setState] = useState<MicState>('idle')
  const activeRef = useRef<ActiveRecording | null>(null)
  const prefixRef = useRef('')

  function setHint(message: string) {
    onStatus?.(message)
  }

  useEffect(() => {
    return () => {
      activeRef.current?.stream.getTracks().forEach((t) => t.stop())
      activeRef.current = null
    }
  }, [])

  async function toggle() {
    if (disabled) return

    if (state === 'recording') {
      if (!activeRef.current) {
        setState('idle')
        setHint('انقطع التسجيل — حاول مرة ثانية')
        onRestore?.(prefixRef.current)
        return
      }

      setState('transcribing')
      setHint('جاري النسخ العربي الدقيق… راجع النص في المربع قبل الإرسال')
      try {
        const { blob, mimeType } = await activeRef.current.stop()
        activeRef.current = null
        const result = await transcribeVoiceBlob(blob, mimeType)
        if (!result.ok) {
          onRestore?.(prefixRef.current)
          setHint(result.error)
          return
        }
        const full = [prefixRef.current, result.text]
          .filter(Boolean)
          .join(' ')
          .trim()
        onTranscript(full, { providerLabelAr: result.providerLabelAr })
        setHint(
          `نسخ عربي عبر ${result.providerLabelAr || 'النموذج'} — صحّح في المربع ثم أرسل`
        )
      } catch (e) {
        onRestore?.(prefixRef.current)
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
      setState('recording')
      setHint(
        'جاري التسجيل… اضغط للإيقاف — سيظهر النص العربي في المربع للمراجعة قبل الإرسال'
      )
    } catch (e) {
      setHint(e instanceof Error ? e.message : 'تعذّر بدء التسجيل')
      setState('idle')
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
            ? 'إيقاف ثم نسخ عربي دقيق للمراجعة'
            : 'إملاء عربي — Willow / Gemini / Whisper — راجع قبل الإرسال'
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
