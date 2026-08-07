import { NextRequest, NextResponse } from 'next/server'
import { requireRealUser } from '@/lib/auth/session'
import { getGoogleTokenRow } from '@/lib/google/tokens'
import {
  classifyDriveAccessError,
  getDriveBrainFolderId,
} from '@/lib/google/drive'
import { uploadRoomFileToCompanyBrain } from '@/lib/google/drive-brain'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * After a room upload: push the vault file into Drive «عقل الشركة» + RAG index.
 * Returns needsGoogle when OAuth is missing — client keeps the room file and shows CTA.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  const folderId = getDriveBrainFolderId()
  const folderUrl = `https://drive.google.com/drive/folders/${folderId}`

  const tokens = await getGoogleTokenRow(auth.user.id)
  if (!tokens?.access_token) {
    return NextResponse.json(
      {
        ok: false,
        needsGoogle: true,
        connected: false,
        errorCode: 'no_token',
        folderId,
        folderUrl,
        error: 'اربط Google لرفع عقل الشركة',
        messageAr: 'اربط Google لرفع عقل الشركة',
      },
      { status: 400 }
    )
  }

  try {
    const body = (await req.json()) as {
      scopeId?: string
      localFileId?: string
      fileId?: string
    }
    const scopeId = String(body.scopeId || '').trim()
    const localFileId = String(body.localFileId || body.fileId || '').trim()
    if (!scopeId || !localFileId) {
      return NextResponse.json(
        { error: 'مرّر scopeId و localFileId' },
        { status: 400 }
      )
    }

    const result = await uploadRoomFileToCompanyBrain({
      userId: auth.user.id,
      scopeId,
      localFileId,
    })
    return NextResponse.json({
      ...result,
      connected: true,
      needsGoogle: false,
    })
  } catch (e) {
    const classified = classifyDriveAccessError(e)
    if (classified.code === 'no_token') {
      return NextResponse.json(
        {
          ok: false,
          needsGoogle: true,
          connected: false,
          errorCode: 'no_token',
          folderId,
          folderUrl,
          error: 'اربط Google لرفع عقل الشركة',
          messageAr: 'اربط Google لرفع عقل الشركة',
        },
        { status: 400 }
      )
    }
    return NextResponse.json(
      {
        ok: false,
        errorCode: classified.code,
        error: classified.messageAr,
        messageAr: classified.messageAr,
      },
      { status: classified.code === 'other' ? 500 : 403 }
    )
  }
}
