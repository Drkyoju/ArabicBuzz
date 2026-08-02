'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Friend / employee emails invited to the shared team calendar (no Google login required). */
export type TeamCalendarState = {
  memberEmails: string[]
  addEmail: (email: string) => boolean
  removeEmail: (email: string) => void
  setEmails: (emails: string[]) => void
}

function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase()
}

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

export const useTeamCalendarStore = create<TeamCalendarState>()(
  persist(
    (set, get) => ({
      memberEmails: [],
      addEmail: (email) => {
        const e = normalizeEmail(email)
        if (!isEmail(e)) return false
        if (get().memberEmails.includes(e)) return true
        set({ memberEmails: [...get().memberEmails, e] })
        return true
      },
      removeEmail: (email) => {
        const e = normalizeEmail(email)
        set({
          memberEmails: get().memberEmails.filter((x) => x !== e),
        })
      },
      setEmails: (emails) => {
        const next = [
          ...new Set(
            emails.map(normalizeEmail).filter((e) => isEmail(e))
          ),
        ]
        set({ memberEmails: next })
      },
    }),
    { name: 'arabic-buzz-team-calendar' }
  )
)
