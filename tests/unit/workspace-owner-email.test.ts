import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_DIRECTOR_EMAIL,
  DEFAULT_EMPLOYEE_EMAILS,
  getEmployeeEmails,
  getWorkspaceOwnerEmail,
  isAllowlistedEmployeeEmail,
  isWorkspaceOwnerEmail,
  orgRoleForEmail,
  personaForEmail,
} from '@/lib/auth/roles'

describe('workspace owner email gate', () => {
  afterEach(() => {
    delete process.env.OWNER_EMAIL
    delete process.env.EMPLOYEE_EMAILS
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

  it('includes built-in employee allowlist as MEMBER (case-insensitive)', () => {
    for (const email of DEFAULT_EMPLOYEE_EMAILS) {
      expect(orgRoleForEmail(email)).toBe('MEMBER')
      expect(personaForEmail(email)).toBe('employee')
      expect(isAllowlistedEmployeeEmail(email)).toBe(true)
      expect(isAllowlistedEmployeeEmail(email.toUpperCase())).toBe(true)
      expect(isWorkspaceOwnerEmail(email)).toBe(false)
    }
    expect(getEmployeeEmails()).toEqual(
      expect.arrayContaining([...DEFAULT_EMPLOYEE_EMAILS])
    )
  })

  it('merges EMPLOYEE_EMAILS env without elevating owner', () => {
    process.env.EMPLOYEE_EMAILS =
      '  New.Staff@Example.com , ryodan71@gmail.com '
    const list = getEmployeeEmails()
    expect(list).toContain('new.staff@example.com')
    expect(list).toContain('hd.hk1444920@gmail.com')
    expect(list).not.toContain('ryodan71@gmail.com')
    expect(isAllowlistedEmployeeEmail('New.Staff@Example.com')).toBe(true)
    expect(isAllowlistedEmployeeEmail('ryodan71@gmail.com')).toBe(false)
  })
})
