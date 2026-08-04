'use client'

import { useEffect, useState } from 'react'

const KEY = 'ab-hijri-primary'

export function getHijriPrimaryPreference(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const v = localStorage.getItem(KEY)
    if (v === null) return true
    return v !== '0'
  } catch {
    return true
  }
}

/** Settings toggle: Hijri primary vs Gregorian primary for DateDual. */
export function HijriPreferenceToggle() {
  const [hijriPrimary, setHijriPrimary] = useState(true)

  useEffect(() => {
    setHijriPrimary(getHijriPrimaryPreference())
  }, [])

  function setPref(next: boolean) {
    setHijriPrimary(next)
    try {
      localStorage.setItem(KEY, next ? '1' : '0')
      window.dispatchEvent(new CustomEvent('ab-hijri-pref', { detail: next }))
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-xl border border-ab-border bg-ab-surface p-4">
      <h3 className="mb-1 font-semibold">عرض التاريخ</h3>
      <p className="mb-3 text-xs text-stone-500">
        تقارير الجمعية تعرض التاريخين؛ اختر أيهما يظهر أولاً في اللوحة.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPref(true)}
          className={
            hijriPrimary
              ? 'rounded-md bg-ab-ink px-3 py-1.5 text-xs font-semibold text-white'
              : 'rounded-md border border-ab-border bg-white px-3 py-1.5 text-xs'
          }
        >
          هجري أولاً
        </button>
        <button
          type="button"
          onClick={() => setPref(false)}
          className={
            !hijriPrimary
              ? 'rounded-md bg-ab-ink px-3 py-1.5 text-xs font-semibold text-white'
              : 'rounded-md border border-ab-border bg-white px-3 py-1.5 text-xs'
          }
        >
          ميلادي أولاً
        </button>
      </div>
    </div>
  )
}
