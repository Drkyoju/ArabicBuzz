'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Loader2 } from 'lucide-react'
import {
  checkBrowserRecordSupport,
  startBrowserRecording,
  type ActiveRecording,
} from '@/lib/audio/browser-record'
import { transcribeVoiceBlob } from '@/lib/audio/client-transcribe'
import { startLiveCaptions, type LiveCaptionHandle } from '@/lib/audio/live-captions'
import { VOICE_MIC_HINT_AR } from '@/lib/rooms/voice-intent'
import { cn } from '@/lib/utils'

type MicState = 'idle' | 'recording' | 'transcribing'

/**
 * Mic → live interim draft into the composer (Web Speech + chunk STT) + final
 * Arabic STT into the same box. Never auto-sends — user reviews and presses Enter.
 */
export function ComposerMicButton({
  composerValue = '',
  onTranscript,
  onPartial,
  onRestore,
  onStatus,
  disabled,
  className,
  showHint = true,
}: {
  /** Current composer text — kept as prefix while dictating. */
  composerValue?: string
  onTranscript: (text: string, meta?: { providerLabelAr?: string }) => void
  /** Live interim draft while recording (prefix + spoken). Stays until final STT. */
  onPartial?: (text: string) => void
  /** Optional: reset composer only when recording fails to start / aborts empty. */
  onRestore?: (text: string) => void
  /** Status line above the composer (avoids clipped tooltips). */
  onStatus?: (message: string) => void
  disabled?: boolean
  className?: string
  /** Short Arabic cue under the mic. */
  showHint?: boolean
}) {
  const [state, setState] = useState<MicState>('idle')
  const activeRef = useRef<ActiveRecording | null>(null)
  const liveRef = useRef<LiveCaptionHandle | null>(null)
  const prefixRef = useRef('')
  const liveDraftRef = useRef('')

  function setHint(message: string) {
    onStatus?.(message)
  }

  function stopLiveCaptions() {
    try {
      liveRef.current?.stop()
    } catch {
      /* ignore */
    }
    liveRef.current = null
  }

  useEffect(() => {
    return () => {
      stopLiveCaptions()
      activeRef.current?.stream.getTracks().forEach((t) => t.stop())
      activeRef.current = null
    }
  }, [])

  async function toggle() {
    if (disabled) return

    if (state === 'recording') {
      if (!activeRef.current) {
        stopLiveCaptions()
        setState('idle')
        setHint('انقطع التسجيل — حاول مرة ثانية')
        onRestore?.(prefixRef.current)
        liveDraftRef.current = ''
        return
      }

      setState('transcribing')
      stopLiveCaptions()
      // Keep live draft in the box while refining — do not wipe.
      setHint('جاري النسخ العربي الدقيق… النص يبقى في المربع — راجع ثم أرسل Enter')
      try {
        const { blob, mimeType } = await activeRef.current.stop()
        activeRef.current = null
        const result = await transcribeVoiceBlob(blob, mimeType)
        if (!result.ok) {
          // Keep whatever live draft the user already sees so they can edit/send.
          setHint(
            `${result.error} — عدّل المسودة في المربع أو أعد التسجيل. لا يُرسل تلقائياً`
          )
          return
        }
        const full = [prefixRef.current, result.text]
          .filter(Boolean)
          .join(' ')
          .trim()
        liveDraftRef.current = full
        onTranscript(full, { providerLabelAr: result.providerLabelAr })
        setHint(
          `نسخ عربي عبر ${result.providerLabelAr || 'النموذج'} — صحّح في المربع ثم اضغط Enter للإرسال`
        )
      } catch (e) {
        setHint(
          `${e instanceof Error ? e.message : 'فشل النسخ الصوتي'} — المسودة باقية في المربع`
        )
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
      liveDraftRef.current = prefixRef.current
      const active = await startBrowserRecording()
      activeRef.current = active
      setState('recording')

      liveRef.current = startLiveCaptions({
        getPartialBlob: () => active.snapshot(),
        onStatus: setHint,
        onPartial: (spoken) => {
          const combined = [prefixRef.current, spoken]
            .filter(Boolean)
            .join(' ')
            .trim()
          liveDraftRef.current = combined || prefixRef.current
          onPartial?.(liveDraftRef.current)
        },
      })

      if (liveRef.current.mode === 'listening-only') {
        setHint(
          'جاري الاستماع… الكلام يظهر في المربع إن أمكن؛ والنسخ العربي الدقيق بعد الإيقاف — أرسل يدوياً'
        )
      }
    } catch (e) {
      stopLiveCaptions()
      setHint(e instanceof Error ? e.message : 'تعذّر بدء التسجيل')
      setState('idle')
      activeRef.current = null
    }
  }

  return (
    <div className={cn('relative flex flex-col items-center gap-0.5', className)}>
      <button
        type="button"
        disabled={disabled || state === 'transcribing'}
        onClick={() => void toggle()}
        aria-label={state === 'recording' ? 'إيقاف الإملاء' : 'إملاء نص بالصوت'}
        title={
          state === 'recording'
            ? 'إيقاف ثم نسخ عربي دقيق للمراجعة'
            : VOICE_MIC_HINT_AR
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
      {showHint && state === 'idle' && (
        <span className="max-w-[7.5rem] text-center text-[9px] leading-tight text-stone-500">
          كلام حي في المربع · Enter للإرسال
        </span>
      )}
      {showHint && state === 'recording' && (
        <span className="max-w-[7.5rem] text-center text-[9px] leading-tight text-ab-warn">
          يُكتب في المربع…
        </span>
      )}
    </div>
  )
}
