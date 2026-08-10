import { describe, expect, it } from 'vitest'
import {
  isTeamCalendarScope,
  teamCalendarScopeId,
} from '@/lib/scopes/team-calendar-scope'
import { PRIMARY_TEAM_SCOPE_ID } from '@/lib/scopes/primary-room'

describe('teamCalendarScopeId', () => {
  it('defaults to primary team room', () => {
    expect(teamCalendarScopeId()).toBe(PRIMARY_TEAM_SCOPE_ID)
    expect(teamCalendarScopeId('')).toBe(PRIMARY_TEAM_SCOPE_ID)
    expect(teamCalendarScopeId(null)).toBe(PRIMARY_TEAM_SCOPE_ID)
  })

  it('never uses personal desks for team agenda', () => {
    expect(teamCalendarScopeId('personal-u-abc')).toBe(PRIMARY_TEAM_SCOPE_ID)
    expect(teamCalendarScopeId('personal-demo')).toBe(PRIMARY_TEAM_SCOPE_ID)
    expect(teamCalendarScopeId('shared-ops')).toBe(PRIMARY_TEAM_SCOPE_ID)
  })

  it('keeps shared-demo', () => {
    expect(teamCalendarScopeId('shared-demo')).toBe('shared-demo')
    expect(isTeamCalendarScope('shared-demo')).toBe(true)
    expect(isTeamCalendarScope('personal-u-x')).toBe(false)
  })
})
