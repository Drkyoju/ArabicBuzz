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
  /** True only for the sole workspace owner email — never trust room-owner alone. */
  canAccessOpsUi: boolean
  /**
   * False until /api/me/role (or guest path) settles — avoids flashing member
   * chrome for the workspace owner on mobile reload.
   */
  roleResolved: boolean
  /**
   * Owner's last toggle choice. null = default full admin.
   * Members ignore this (always employee).
   */
  ownerUiPreference: WorkspaceUiMode | null
  setMode: (mode: WorkspaceUiMode) => void
  setRoleHint: (role: string | null) => void
  setLabelAr: (label: string | null) => void
  setDisplayNameAr: (name: string | null) => void
  setCanAccessOpsUi: (ok: boolean) => void
  applyRoleAccess: (ops: boolean) => void
  setRoleResolved: (ready: boolean) => void
}

/**
 * Workspace owner (OWNER_EMAIL or ryodan71@gmail.com) = full shell + toggle.
 * Everyone else = rooms, files, calendar, approvals (if HITL), settings only.
 */
export const useWorkspaceModeStore = create<State>()(
  persist(
    (set) => ({
      mode: 'employee',
      roleHint: null,
      labelAr: null,
      displayNameAr: null,
      canAccessOpsUi: false,
      roleResolved: false,
      ownerUiPreference: null,
      setMode: (mode) =>
        set((s) => {
          if (!s.canAccessOpsUi && mode === 'admin') return s
          return {
            mode,
            ownerUiPreference: s.canAccessOpsUi ? mode : s.ownerUiPreference,
          }
        }),
      setRoleHint: (roleHint) => set({ roleHint }),
      setLabelAr: (labelAr) => set({ labelAr }),
      setDisplayNameAr: (displayNameAr) => set({ displayNameAr }),
      setCanAccessOpsUi: (canAccessOpsUi) =>
        set((s) => ({
          canAccessOpsUi,
          mode: canAccessOpsUi
            ? s.ownerUiPreference === 'employee'
              ? 'employee'
              : 'admin'
            : 'employee',
        })),
      applyRoleAccess: (ops) =>
        set((s) => ({
          canAccessOpsUi: ops,
          roleResolved: true,
          mode: ops
            ? s.ownerUiPreference === 'employee'
              ? 'employee'
              : 'admin'
            : 'employee',
        })),
      setRoleResolved: (roleResolved) => set({ roleResolved }),
    }),
    {
      name: 'ab-workspace-ui-mode',
      partialize: (s) => ({
        ownerUiPreference: s.ownerUiPreference,
        roleHint: s.roleHint,
        labelAr: s.labelAr,
        displayNameAr: s.displayNameAr,
        // Re-check ops from /api/me/role every session (email gate).
        canAccessOpsUi: false,
        mode: 'employee',
        // Never persist — always wait for session/email before chrome choice.
        roleResolved: false,
      }),
    }
  )
)

/** Sections visible to members (no audit, skills, usage, API keys, ops, memory). */
export const EMPLOYEE_SECTIONS = new Set([
  'home',
  'assistants',
  'mail',
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
