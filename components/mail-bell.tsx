'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { cn } from '@/lib/utils'

type Props = {
  onOpenMail?: () => void
  onOpenPersonalMail?: () => void
  className?: string
  /** Compact icon for mobile top bar */
  compact?: boolean
}

const NOTIF_PERM_KEY = 'ab-mail-notif-asked-v1'

function canUseBrowserNotifications(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

async function ensureNotifPermission(): Promise<NotificationPermission | null> {
  if (!canUseBrowserNotifications()) return null
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const asked = localStorage.getItem(NOTIF_PERM_KEY)
    if (asked === '1') return Notification.permission
    localStorage.setItem(NOTIF_PERM_KEY, '1')
    return await Notification.requestPermission()
  } catch {
    return null
  }
}

function showBrowserMailNotif(opts: {
  unread: number
  kind: 'org' | 'personal'
  subjects?: string[]
}) {
  if (!canUseBrowserNotifications()) return
  if (Notification.permission !== 'granted') return
  try {
    const isOrg = opts.kind === 'org'
    const sample = opts.subjects?.[0]
    const body = isOrg
      ? opts.unread === 1
        ? sample
          ? `جديد: ${sample}`
          : 'رسالة جديدة في بريد الجمعية — افتح الوارد للرد أو التلخيص.'
        : `${opts.unread} رسائل غير مقروءة في بريد الجمعية.`
      : opts.unread === 1
        ? sample
          ? `Gmail: ${sample}`
          : 'رسالة جديدة في بريدك الشخصي.'
        : `${opts.unread} رسائل غير مقروءة في بريدك الشخصي.`
    const notifOpts: NotificationOptions & { renotify?: boolean } = {
      body,
      tag: isOrg ? 'ab-org-mail-unread' : 'ab-personal-mail-unread',
      dir: 'rtl',
      lang: 'ar',
      renotify: true,
    }
    const n = new Notification(
      isOrg ? 'بريد جديد — جمعية الهدى والحكمة' : 'بريد جديد — حسابك الشخصي',
      notifOpts
    )
    n.onclick = () => {
      try {
        window.focus()
        window.dispatchEvent(
          new Event(isOrg ? 'ab-open-mail' : 'ab-open-personal-mail')
        )
      } catch {
        /* ignore */
      }
      n.close()
    }
  } catch {
    /* ignore */
  }
}

/**
 * Header bell — org IMAP + personal Gmail unread.
 * Polls both; browser Notification when either count rises.
 */
export function MailBell({
  onOpenMail,
  onOpenPersonalMail,
  className,
  compact,
}: Props) {
  const signedIn = useSignedIn()
  const [orgUnread, setOrgUnread] = useState(0)
  const [personalUnread, setPersonalUnread] = useState(0)
  const [orgConfigured, setOrgConfigured] = useState(false)
  const [personalConnected, setPersonalConnected] = useState(false)
  const [pulse, setPulse] = useState(false)
  const primed = useRef(false)

  const poll = useCallback(async () => {
    if (signedIn !== true) {
      setOrgUnread(0)
      setPersonalUnread(0)
      setOrgConfigured(false)
      setPersonalConnected(false)
      return
    }
    try {
      const headers = await authHeaders()
      const [orgRes, personalRes] = await Promise.all([
        fetch('/api/mail/unread', { headers }),
        fetch('/api/mail/personal/unread', { headers }),
      ])

      if (orgRes.ok) {
        const data = (await orgRes.json()) as {
          configured?: boolean
          unread?: number
        }
        setOrgConfigured(Boolean(data.configured))
        const next = Number(data.unread || 0)
        setOrgUnread((prev) => {
          if (next > prev && primed.current) {
            setPulse(true)
            void ensureNotifPermission().then((perm) => {
              if (perm === 'granted') {
                showBrowserMailNotif({ unread: next, kind: 'org' })
              }
            })
          }
          return next
        })
      }

      if (personalRes.ok) {
        const data = (await personalRes.json()) as {
          connected?: boolean
          unread?: number
          sampleSubjects?: string[]
        }
        setPersonalConnected(Boolean(data.connected))
        const next = Number(data.unread || 0)
        setPersonalUnread((prev) => {
          if (next > prev && primed.current) {
            setPulse(true)
            void ensureNotifPermission().then((perm) => {
              if (perm === 'granted') {
                showBrowserMailNotif({
                  unread: next,
                  kind: 'personal',
                  subjects: data.sampleSubjects,
                })
              }
            })
          }
          return next
        })
      }

      primed.current = true
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
    window.addEventListener('ab-personal-mail-changed', onMail)
    return () => {
      window.clearInterval(t)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('ab-mail-changed', onMail)
      window.removeEventListener('ab-personal-mail-changed', onMail)
    }
  }, [poll, signedIn])

  useEffect(() => {
    if (!pulse) return
    const t = window.setTimeout(() => setPulse(false), 1200)
    return () => window.clearTimeout(t)
  }, [pulse])

  const visible = signedIn === true && (orgConfigured || personalConnected)
  if (!visible) return null

  const total = orgUnread + personalUnread
  const hasNew = total > 0

  return (
    <button
      type="button"
      onClick={() => {
        void ensureNotifPermission()
        if (personalUnread > 0 && orgUnread === 0) {
          onOpenPersonalMail?.()
          window.dispatchEvent(new Event('ab-open-personal-mail'))
        } else {
          onOpenMail?.()
        }
      }}
      title={
        hasNew
          ? [
              orgUnread > 0 ? `${orgUnread} جمعية` : null,
              personalUnread > 0 ? `${personalUnread} شخصي` : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : 'البريد — لا رسائل جديدة'
      }
      aria-label={
        hasNew ? `بريد جديد: ${total} غير مقروءة` : 'البريد'
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
          {total > 99 ? '99+' : total}
        </span>
      )}
      {hasNew && !compact && (
        <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-700 sm:hidden">
          {total > 99 ? '99+' : total}
        </span>
      )}
    </button>
  )
}
