'use client'

import { useEffect, useState } from 'react'

/**
 * Client signed-in state for gating advanced UI.
 * `null` = still checking; `false` = guest; `true` = has session user.
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
        const s = await getBrowserSession()
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
