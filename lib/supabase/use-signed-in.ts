'use client'

import { useEffect, useState } from 'react'

const SESSION_PROBE_MS = 2500

type SignedIn = boolean | null

/** Shared across all hook instances so section switches don't re-flash guest gates. */
let cached: SignedIn = null
let inflight: Promise<boolean> | null = null
const listeners = new Set<(v: boolean) => void>()

function publish(v: boolean) {
  cached = v
  for (const fn of listeners) fn(v)
}

async function probeSignedIn(): Promise<boolean> {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const { getBrowserSession, ensureSupabaseBrowserConfig } = await import(
        '@/lib/supabase/browser'
      )
      if (!(await ensureSupabaseBrowserConfig())) return false
      const s = await Promise.race([
        getBrowserSession(),
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), SESSION_PROBE_MS)
        ),
      ])
      return Boolean(s?.user)
    } catch {
      return false
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/**
 * Client signed-in state for gating advanced UI.
 * `null` = still checking; `false` = guest; `true` = has session user.
 * Shared cache: once resolved, new mounts (calendar/files) inherit the answer
 * instead of briefly treating `null` as guest.
 */
export function useSignedIn(): SignedIn {
  const [signedIn, setSignedIn] = useState<SignedIn>(() => cached)

  useEffect(() => {
    let cancelled = false

    const onUpdate = (v: boolean) => {
      if (!cancelled) setSignedIn(v)
    }
    listeners.add(onUpdate)

    if (cached !== null) {
      setSignedIn(cached)
    } else {
      void probeSignedIn().then((v) => {
        if (cancelled) return
        publish(v)
      })
    }

    let unsub: (() => void) | undefined
    void (async () => {
      try {
        const {
          createBrowserSupabaseClient,
          ensureSupabaseBrowserConfig,
        } = await import('@/lib/supabase/browser')
        if (!(await ensureSupabaseBrowserConfig())) return
        const sb = createBrowserSupabaseClient()
        const { data } = sb.auth.onAuthStateChange((_event, session) => {
          publish(Boolean(session?.user))
        })
        unsub = () => data.subscription.unsubscribe()
      } catch {
        /* ignore */
      }
    })()

    return () => {
      cancelled = true
      listeners.delete(onUpdate)
      unsub?.()
    }
  }, [])

  return signedIn
}
