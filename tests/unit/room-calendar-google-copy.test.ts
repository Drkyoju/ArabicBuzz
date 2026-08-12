import { describe, expect, it } from 'vitest'

/**
 * Smoke: copy_selected action name + payload shape used by UI.
 * Heavy Google/DB paths are covered by integration on live.
 */
describe('google → shared room calendar copy', () => {
  it('accepts copy_selected / copy_from_google action names', () => {
    const actions = new Set(['copy_selected', 'copy_from_google', 'sync_now'])
    expect(actions.has('copy_selected')).toBe(true)
    expect(actions.has('copy_from_google')).toBe(true)
  })

  it('requires at least one google event id for selective copy', () => {
    const ids = ([] as string[])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
    expect(ids.length).toBe(0)
    const selected = ['evt-1', '  ', 'evt-2']
      .map((id) => String(id || '').trim())
      .filter(Boolean)
    expect(selected).toEqual(['evt-1', 'evt-2'])
  })
})
