'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Circle, Sparkles, X } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'

type Step = {
  id: string
  labelAr: string
  done: boolean
  action?: () => void
  actionLabelAr?: string
}

/**
 * Multi-step first-run checklist (Google, Drive, keys, first message).
 */
export function FirstRunChecklist({
  onNavigate,
  onDismiss,
  className,
}: {
  onNavigate?: (section: string) => void
  onDismiss?: () => void
  className?: string
}) {
  const [googleOk, setGoogleOk] = useState(false)
  const [driveCount, setDriveCount] = useState(0)
  const [keysOk, setKeysOk] = useState(false)
  const [zoomOk, setZoomOk] = useState(false)
  const [telegramOk, setTelegramOk] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const h = await authHeaders()
        const [cal, drive, providers, integ] = await Promise.all([
          fetch('/api/google/calendar?action=status', { headers: h }).then((r) =>
            r.json()
          ),
          fetch('/api/google/drive/brain', { headers: h }).then((r) => r.json()),
          fetch('/api/settings/providers').then((r) => r.json()),
          fetch('/api/integrations/status').then((r) => r.json()),
        ])
        if (cancelled) return
        setGoogleOk(Boolean(cal?.connected))
        setDriveCount(Number(drive?.count || 0))
        setKeysOk(Number(providers?.serviceableCount || 0) > 0)
        setZoomOk(Boolean(integ?.zoomConfigured))
        setTelegramOk(Boolean(integ?.telegramConfigured))
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const chatted =
    typeof window !== 'undefined' &&
    Boolean(localStorage.getItem('ab-first-chat'))

  const steps: Step[] = useMemo(
    () => [
      {
        id: 'keys',
        labelAr: 'مفتاح نموذج يعمل (Gemini أو GLM)',
        done: keysOk,
        action: () => onNavigate?.('api-keys'),
        actionLabelAr: 'مفاتيح API',
      },
      {
        id: 'google',
        labelAr: 'ربط تقويم Google',
        done: googleOk,
        action: () => onNavigate?.('calendar'),
        actionLabelAr: 'التقويم',
      },
      {
        id: 'drive',
        labelAr: 'ملفات في مجلد Drive + مزامنة عقل الشركة',
        done: driveCount > 0,
        action: () => onNavigate?.('settings'),
        actionLabelAr: 'الإعدادات',
      },
      {
        id: 'chat',
        labelAr: 'أرسل أول رسالة في غرفة',
        done: chatted,
        action: () => onNavigate?.('chats'),
        actionLabelAr: 'الغرف',
      },
      {
        id: 'zoom',
        labelAr: 'Zoom تلقائي (اختياري)',
        done: zoomOk,
        action: () => onNavigate?.('settings'),
        actionLabelAr: 'تكاملات',
      },
      {
        id: 'telegram',
        labelAr: 'قناة تيليجرام (اختياري)',
        done: telegramOk,
        action: () => onNavigate?.('settings'),
        actionLabelAr: 'تكاملات',
      },
    ],
    [keysOk, googleOk, driveCount, chatted, zoomOk, telegramOk, onNavigate]
  )

  const doneCount = steps.filter((s) => s.done).length
  const allCore = steps.slice(0, 4).every((s) => s.done)

  useEffect(() => {
    if (loading || !allCore) return
    try {
      localStorage.setItem('ab-onboarded', '1')
    } catch {
      /* ignore */
    }
    onDismiss?.()
    // Only when core steps flip to complete — not on every parent re-render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, allCore])

  if (allCore) return null

  return (
    <div
      className={
        className ||
        'rounded-xl border border-ab-accent/25 bg-ab-accent/5 p-3 text-sm'
      }
      dir="rtl"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 font-semibold text-ab-ink">
            <Sparkles className="h-4 w-4 text-ab-accent" aria-hidden />
            ابدأ هنا ({doneCount}/{steps.length})
          </p>
          <p className="mt-0.5 text-[11px] text-stone-500">
            {loading ? 'جاري فحص الحالة…' : 'أكمل الخطوات لتشغيل المنصة بالكامل.'}
          </p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md p-1 text-stone-400 hover:bg-white hover:text-ab-ink"
            aria-label="إخفاء"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <ul className="space-y-1.5">
        {steps.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/70 px-2.5 py-1.5"
          >
            <span className="inline-flex items-center gap-1.5 text-[12px] text-ab-ink">
              {s.done ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-stone-300" />
              )}
              {s.labelAr}
            </span>
            {!s.done && s.action && (
              <button
                type="button"
                onClick={s.action}
                className="text-[11px] font-medium text-ab-accent"
              >
                {s.actionLabelAr}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
