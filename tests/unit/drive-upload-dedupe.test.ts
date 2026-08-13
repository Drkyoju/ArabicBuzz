import { describe, expect, it } from 'vitest'
import {
  escapeDriveQueryValue,
  pickDriveUploadDedupTarget,
  type DriveFileMeta,
} from '@/lib/google/drive'

describe('pickDriveUploadDedupTarget', () => {
  const base = (partial: Partial<DriveFileMeta>): DriveFileMeta => ({
    id: partial.id || 'id',
    name: partial.name || 'file.pdf',
    mimeType: partial.mimeType || 'application/pdf',
    size: partial.size,
    modifiedTime: partial.modifiedTime,
    webViewLink: partial.webViewLink,
  })

  it('creates when folder has no same-name files', () => {
    expect(pickDriveUploadDedupTarget([], 100)).toEqual({ action: 'create' })
  })

  it('reuses identical name+size (newest wins among clones)', () => {
    const decision = pickDriveUploadDedupTarget(
      [
        base({
          id: 'old',
          size: '162129904',
          modifiedTime: '2026-08-10T10:00:00.000Z',
        }),
        base({
          id: 'new',
          size: '162129904',
          modifiedTime: '2026-08-10T20:00:00.000Z',
        }),
      ],
      162129904
    )
    expect(decision).toEqual({
      action: 'reuse',
      file: expect.objectContaining({ id: 'new' }),
    })
  })

  it('updates newest when same name but different size', () => {
    const decision = pickDriveUploadDedupTarget(
      [
        base({
          id: 'a',
          size: '594110',
          modifiedTime: '2026-08-10T10:00:00.000Z',
        }),
        base({
          id: 'b',
          size: '594110',
          modifiedTime: '2026-08-10T12:00:00.000Z',
        }),
      ],
      645704
    )
    expect(decision).toEqual({
      action: 'update',
      file: expect.objectContaining({ id: 'b' }),
    })
  })
})

describe('escapeDriveQueryValue', () => {
  it('escapes quotes for Drive q', () => {
    expect(escapeDriveQueryValue("O'Brien")).toBe("O\\'Brien")
  })
})
