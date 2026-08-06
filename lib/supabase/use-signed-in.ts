'use client'

import { useEffect, useState } from 'react'

const SESSION_PROBE_MS = 2500

/**
 * Client signed-in state for gating advanced UI.
 * `null` = still checking; `false` = guest; `true` = has session user.
 * Caps Supabase getSession so a hang never leaves the UI stuck on «جاري…».
 */
export function useSignedIn(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { getBrowserSession, isSupabaseConfigured } = await import(
          '@/lib/supabase/browser'
        )
        if (!isSupabaseConfigured()) {
          if (!cancelled) setSignedIn(false)
          return
        }
        const s = await Promise.race([
          getBrowserSession(),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), SESSION_PROBE_MS)
          ),
        ])
        if (!cancelled) setSignedIn(Boolean(s?.user))
      } catch {
        if (!cancelled) setSignedIn(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return signedIn
}
