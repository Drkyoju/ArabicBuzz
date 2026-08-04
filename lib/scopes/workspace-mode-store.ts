'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type WorkspaceUiMode = 'admin' | 'employee'

type State = {
  mode: WorkspaceUiMode
  roleHint: string | null
  setMode: (mode: WorkspaceUiMode) => void
  setRoleHint: (role: string | null) => void
}

/**
 * Admin = full shell. Employee = rooms, files, calendar, approvals, settings only.
 */
export const useWorkspaceModeStore = create<State>()(
  persist(
    (set) => ({
      mode: 'admin',
      roleHint: null,
      setMode: (mode) => set({ mode }),
      setRoleHint: (roleHint) => set({ roleHint }),
    }),
    { name: 'ab-workspace-ui-mode' }
  )
)

export const EMPLOYEE_SECTIONS = new Set([
  'home',
  'chats',
  'files',
  'calendar',
  'approvals',
  'audit',
  'settings',
])

export function isEmployeeSection(id: string, mode: WorkspaceUiMode) {
  if (mode === 'admin') return true
  return EMPLOYEE_SECTIONS.has(id)
}
