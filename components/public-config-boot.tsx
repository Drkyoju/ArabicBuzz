'use client'

import { useEffect, useState } from 'react'
import { ensureSupabaseBrowserConfig } from '@/lib/supabase/browser'

/**
 * Always fetch public Supabase config on the client.
 * Needed when Docker build omitted NEXT_PUBLIC_* and the root layout was
 * statically rendered without runtime env.
 */
export function PublicConfigBoot({
  onReady,
}: {
  onReady?: (ok: boolean) => void
}) {
  const [tried, setTried] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      let ok = false
      for (let i = 0; i < 6; i++) {
        ok = await ensureSupabaseBrowserConfig()
        if (ok || cancelled) break
        await new Promise((r) => setTimeout(r, 400 * (i + 1)))
      }
      if (!cancelled) {
        setTried(true)
        onReady?.(ok)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [onReady])

  // Invisible; exists only for side effects. Keep a data attr for QA.
  return (
    <span
      hidden
      data-ab-public-boot={tried ? '1' : '0'}
      aria-hidden
    />
  )
}
