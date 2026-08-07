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
 * Header bell — badge when org IMAP mailbox has unread mail.
 * Polls /api/mail/unread (extends existing IMAP store; no second mail system).
 */
export function MailBell({ onOpenMail, className, compact }: Props) {
  const signedIn = useSignedIn()
  const [unread, setUnread] = useState(0)
  const [configured, setConfigured] = useState(false)
  const [pulse, setPulse] = useState(false)

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
      const next = Number(data.unread || 0)
      setUnread((prev) => {
        if (next > prev) setPulse(true)
        return next
      })
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

  useEffect(() => {
    if (!pulse) return
    const t = window.setTimeout(() => setPulse(false), 1200)
    return () => window.clearTimeout(t)
  }, [pulse])

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
        pulse && 'ring-2 ring-ab-accent/40',
        className
      )}
    >
      <Bell
        className={cn(
          compact ? 'h-5 w-5' : 'h-4 w-4',
          hasNew && 'text-ab-accent'
        )}
        aria-hidden
      />
      {!compact && (
        <span className="hidden sm:inline">
          {hasNew ? 'وارد جديد' : 'البريد'}
        </span>
      )}
      {hasNew && (
        <span
          className={cn(
            'absolute end-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white',
            pulse && 'animate-pulse'
          )}
          aria-hidden
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
      {hasNew && !compact && (
        <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-700 sm:hidden">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  )
}
