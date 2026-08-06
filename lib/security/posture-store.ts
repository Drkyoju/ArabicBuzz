'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SecurityPostureMode } from '@/lib/security/posture'

type PostureState = {
  posture: SecurityPostureMode
  setPosture: (p: SecurityPostureMode) => void
}

export const useSecurityPostureStore = create<PostureState>()(
  persist(
    (set) => ({
      posture: 'DANGEROUS',
      setPosture: (posture) => set({ posture }),
    }),
    {
      name: 'ab-security-posture',
      // Migrate old AUTO/STRICT clients to free execution.
      version: 2,
      migrate: (persisted) => {
        const state = persisted as PostureState
        return {
          ...state,
          posture: 'DANGEROUS',
        }
      },
    }
  )
)
