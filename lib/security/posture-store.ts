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
      posture: 'AUTO',
      setPosture: (posture) => set({ posture }),
    }),
    { name: 'ab-security-posture' }
  )
)
