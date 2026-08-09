import { describe, expect, it } from 'vitest'
import {
  EMPLOYEE_SAFE_TOOLS,
  OWNER_ONLY_TOOLS,
  filterToolsForActor,
  resolveActorToolMode,
  toolAccessSummaryAr,
} from '@/lib/agents/tools-by-role'
import type { ToolSet } from 'ai'

function fakeTools(names: string[]): ToolSet {
  const out: ToolSet = {}
  for (const n of names) {
    out[n] = { description: n } as ToolSet[string]
  }
  return out
}

describe('tools-by-role', () => {
  it('gives employees safe tools and strips owner-only', () => {
    const all = fakeTools([
      ...EMPLOYEE_SAFE_TOOLS.slice(0, 8),
      ...OWNER_ONLY_TOOLS.slice(0, 4),
      'web_search',
      'drive_search_files',
      'change_user_roles',
      'cua_computer',
    ])
    const filtered = filterToolsForActor(all, {
      email: 'employee@example.com',
      userId: 'u-emp',
      role: 'MEMBER',
    })
    expect(filtered.web_search).toBeTruthy()
    expect(filtered.drive_search_files).toBeTruthy()
    expect(filtered.change_user_roles).toBeUndefined()
    expect(filtered.cua_computer).toBeUndefined()
    expect(resolveActorToolMode({ role: 'MEMBER' })).toBe('employee')
    expect(resolveActorToolMode({ role: 'OWNER' })).toBe('full')
    expect(toolAccessSummaryAr('employee')).toMatch(/موظف/)
  })

  it('lists drive/mail/calendar/pdf/web in employee-safe set', () => {
    const set = new Set(EMPLOYEE_SAFE_TOOLS)
    for (const t of [
      'drive_search_files',
      'mail_read',
      'room_calendar_list',
      'pdf_annotate',
      'web_search',
      'list_workspace_files',
    ]) {
      expect(set.has(t)).toBe(true)
    }
  })
})
