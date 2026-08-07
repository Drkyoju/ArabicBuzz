'use client'

import { useCallback, useEffect, useState } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { TelegramMirrorChat } from '@/components/telegram-mirror-chat'

/** localStorage: only '1' means open. Missing / '0' / anything else → closed. */
const STORAGE_KEY = 'arabicbuzz-telegram-panel-open'

function readStoredOpen(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * نافذة تيليجرام على لوحة اليوم — فقاعة قابلة للطي أسفل اليسار (يسار فيزيائي).
 * الافتراضي مغلق؛ عند الفتح لوحة مدمجة مع زر إغلاق واضح.
 */
export function TelegramHomePanel() {
  const signedIn = useSignedIn()
  const [open, setOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setOpen(readStoredOpen())
    setHydrated(true)
  }, [])

  const setOpenPersist = useCallback((next: boolean) => {
    setOpen(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      /* ignore quota / private mode */
    }
  }, [])

  if (signedIn !== true || !hydrated) return null

  /* Physical left (not logical start) so RTL sidebar stays clear.
   * Keep inset ≥0.75rem on both sides so the panel never clips the viewport. */
  const dock =
    'pointer-events-auto fixed z-[70] bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))]'

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpenPersist(true)}
        className={`${dock} inline-flex items-center gap-1.5 rounded-full border border-ab-border bg-white px-3.5 py-2.5 text-[12px] font-semibold text-ab-ink shadow-ab transition hover:bg-stone-50`}
        aria-label="فتح تيليجرام"
        aria-expanded={false}
        data-telegram-fab="1"
      >
        <MessageCircle className="h-4 w-4 text-ab-accent" aria-hidden />
        تيليجرام
      </button>
    )
  }

  return (
    <div
      className={`${dock} flex h-[min(22rem,min(62vh,calc(100dvh-1.5rem)))] w-[min(20rem,calc(100dvw-1.5rem))] max-w-[calc(100dvw-1.5rem)] flex-col overflow-hidden`}
    >
      <TelegramMirrorChat
        variant="panel"
        active={open}
        className="h-full min-h-0"
        headerExtra={
          <button
            type="button"
            onClick={() => setOpenPersist(false)}
            className="ab-btn-secondary !h-8 shrink-0 gap-1 !px-2.5 text-[12px] hover:!border-ab-danger hover:!bg-red-50 hover:!text-ab-danger"
            aria-label="إغلاق نافذة تيليجرام"
            title="إغلاق"
            data-telegram-close="1"
          >
            <X className="h-4 w-4" aria-hidden strokeWidth={2.5} />
            إغلاق
          </button>
        }
      />
    </div>
  )
}
