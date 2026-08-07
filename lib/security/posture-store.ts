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
      // Safer default when HITL is re-enabled (server still forces DANGEROUS if HITL_DISABLED).
      posture: 'AUTO',
      setPosture: (posture) => set({ posture }),
    }),
    {
      name: 'ab-security-posture',
      // v4: AUTO = delete-only HITL; everything else auto-executes.
      version: 4,
      migrate: (persisted) => {
        const state = persisted as PostureState
        return {
          ...state,
          posture: 'AUTO',
        }
      },
    }
  )
)
