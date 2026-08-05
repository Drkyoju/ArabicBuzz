'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type WorkspaceUiMode = 'admin' | 'employee'

type State = {
  mode: WorkspaceUiMode
  /** Server role enum, e.g. MEMBER / DEPARTMENT_MANAGER */
  roleHint: string | null
  /** Arabic badge: مدير / موظف / مسؤول */
  labelAr: string | null
  displayNameAr: string | null
  /** False for employees — they cannot open ops / MCP / API keys. */
  canAccessOpsUi: boolean
  setMode: (mode: WorkspaceUiMode) => void
  setRoleHint: (role: string | null) => void
  setLabelAr: (label: string | null) => void
  setDisplayNameAr: (name: string | null) => void
  setCanAccessOpsUi: (ok: boolean) => void
}

/**
 * Admin/director = full shell. Employee = rooms, files, calendar, approvals, settings only.
 */
export const useWorkspaceModeStore = create<State>()(
  persist(
    (set) => ({
      mode: 'employee',
      roleHint: null,
      labelAr: null,
      displayNameAr: null,
      canAccessOpsUi: false,
      setMode: (mode) =>
        set((s) => {
          // Employees cannot flip into the ops shell.
          if (!s.canAccessOpsUi && mode === 'admin') return s
          return { mode }
        }),
      setRoleHint: (roleHint) => set({ roleHint }),
      setLabelAr: (labelAr) => set({ labelAr }),
      setDisplayNameAr: (displayNameAr) => set({ displayNameAr }),
      setCanAccessOpsUi: (canAccessOpsUi) =>
        set((s) => ({
          canAccessOpsUi,
          mode: canAccessOpsUi ? s.mode : 'employee',
        })),
    }),
    {
      name: 'ab-workspace-ui-mode',
      partialize: (s) => ({
        mode: s.mode,
        roleHint: s.roleHint,
        labelAr: s.labelAr,
        displayNameAr: s.displayNameAr,
        canAccessOpsUi: s.canAccessOpsUi,
      }),
    }
  )
)

/** Sections visible to employees (no audit log, skills, API keys, ops). */
export const EMPLOYEE_SECTIONS = new Set([
  'home',
  'chats',
  'files',
  'calendar',
  'approvals',
  'settings',
])

export function isEmployeeSection(id: string, mode: WorkspaceUiMode) {
  if (mode === 'admin') return true
  return EMPLOYEE_SECTIONS.has(id)
}
