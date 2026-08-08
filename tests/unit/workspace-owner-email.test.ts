import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_DIRECTOR_EMAIL,
  getWorkspaceOwnerEmail,
  isWorkspaceOwnerEmail,
  orgRoleForEmail,
  personaForEmail,
} from '@/lib/auth/roles'

describe('workspace owner email gate', () => {
  afterEach(() => {
    delete process.env.OWNER_EMAIL
  })

  it('defaults owner to ryodan71@gmail.com', () => {
    expect(getWorkspaceOwnerEmail()).toBe(DEFAULT_DIRECTOR_EMAIL)
    expect(isWorkspaceOwnerEmail('Ryodan71@gmail.com')).toBe(true)
    expect(isWorkspaceOwnerEmail('member@example.com')).toBe(false)
  })

  it('honors OWNER_EMAIL override', () => {
    process.env.OWNER_EMAIL = '  Owner@Example.com '
    expect(getWorkspaceOwnerEmail()).toBe('owner@example.com')
    expect(isWorkspaceOwnerEmail('owner@example.com')).toBe(true)
    expect(isWorkspaceOwnerEmail(DEFAULT_DIRECTOR_EMAIL)).toBe(false)
  })

  it('maps only owner email to OWNER / director persona', () => {
    expect(orgRoleForEmail('ryodan71@gmail.com')).toBe('OWNER')
    expect(orgRoleForEmail('volunteer@arabicbuzz.app')).toBe('MEMBER')
    expect(personaForEmail('ryodan71@gmail.com')).toBe('director')
    expect(personaForEmail('volunteer@arabicbuzz.app')).toBe('employee')
  })
})
