'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { cn } from '@/lib/utils'

type Props = {
  onOpenMail?: () => void
  className?: string
  /** Compact icon for mobile top bar */
  compact?: boolean
}

/**
 * Header bell — red dot when org IMAP mailbox has unread mail.
 * Polls /api/mail/unread (extends existing IMAP store; no second mail system).
 */
export function MailBell({ onOpenMail, className, compact }: Props) {
  const signedIn = useSignedIn()
  const [unread, setUnread] = useState(0)
  const [configured, setConfigured] = useState(false)

  const poll = useCallback(async () => {
    if (signedIn !== true) {
      setUnread(0)
      setConfigured(false)
      return
    }
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/mail/unread', { headers })
      if (!res.ok) return
      const data = (await res.json()) as {
        configured?: boolean
        unread?: number
      }
      setConfigured(Boolean(data.configured))
      setUnread(Number(data.unread || 0))
    } catch {
      /* ignore */
    }
  }, [signedIn])

  useEffect(() => {
    void poll()
    if (signedIn !== true) return
    const t = window.setInterval(() => void poll(), 25_000)
    const onFocus = () => void poll()
    const onMail = () => void poll()
    window.addEventListener('focus', onFocus)
    window.addEventListener('ab-mail-changed', onMail)
    return () => {
      window.clearInterval(t)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('ab-mail-changed', onMail)
    }
  }, [poll, signedIn])

  if (signedIn !== true || !configured) return null

  const hasNew = unread > 0

  return (
    <button
      type="button"
      onClick={() => onOpenMail?.()}
      title={
        hasNew
          ? `${unread} رسالة غير مقروءة في بريد الجمعية`
          : 'بريد الجمعية — لا رسائل جديدة'
      }
      aria-label={
        hasNew
          ? `بريد جديد: ${unread} غير مقروءة`
          : 'بريد الجمعية'
      }
      className={cn(
        'relative inline-flex items-center justify-center rounded-md text-ab-ink transition-colors hover:bg-stone-100',
        compact ? 'p-2' : 'gap-1.5 px-2 py-1.5 text-xs',
        className
      )}
    >
      <Bell className={cn(compact ? 'h-5 w-5' : 'h-4 w-4')} aria-hidden />
      {!compact && <span className="hidden sm:inline">البريد</span>}
      {hasNew && (
        <span
          className="absolute end-1 top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"
          aria-hidden
        />
      )}
      {hasNew && !compact && (
        <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  )
}
