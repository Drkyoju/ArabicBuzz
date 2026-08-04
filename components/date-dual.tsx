'use client'

import { useEffect, useState } from 'react'
import {
  getHijriPrimaryPreference,
} from '@/components/hijri-preference'

/** Hijri + Gregorian — order follows settings preference. */
export function DateDual({
  value = new Date(),
  className,
}: {
  value?: Date
  className?: string
}) {
  const [hijriPrimary, setHijriPrimary] = useState(true)

  useEffect(() => {
    setHijriPrimary(getHijriPrimaryPreference())
    const onPref = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail
      if (typeof detail === 'boolean') setHijriPrimary(detail)
      else setHijriPrimary(getHijriPrimaryPreference())
    }
    window.addEventListener('ab-hijri-pref', onPref)
    return () => window.removeEventListener('ab-hijri-pref', onPref)
  }, [])

  const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(value)
  const gregorian = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(value)

  const primary = hijriPrimary ? hijri : gregorian
  const secondary = hijriPrimary ? gregorian : hijri
  const secondaryDir = hijriPrimary ? 'ltr' : undefined

  return (
    <div className={className}>
      <p className="text-[13px] font-medium text-ab-ink">{primary}</p>
      <p
        className="text-[11px] text-stone-400"
        dir={secondaryDir}
      >
        {secondary}
      </p>
    </div>
  )
}
