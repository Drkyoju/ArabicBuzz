import { requireUser } from '@/lib/auth/session'
import {
  listDriveBrainPreview,
  syncDriveFolderToBrain,
} from '@/lib/google/drive-brain'
import { getDriveBrainFolderId } from '@/lib/google/drive'
import { insertRoomPost } from '@/lib/rooms/persist'
import { getGoogleTokenRow } from '@/lib/google/tokens'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Google Drive folder → company brain.
 * Default folder: ملفات الجمعية (GOOGLE_DRIVE_BRAIN_FOLDER_ID).
 */
export async function GET(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const folderId = url.searchParams.get('folderId') || getDriveBrainFolderId()
  const tokens = await getGoogleTokenRow(auth.user.id)

  if (!tokens?.access_token) {
    return Response.json({
      connected: false,
      folderId,
      folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
      error:
        'اربط Google من الإعدادات (تقويم/Drive) ثم امنح صلاحية قراءة Drive.',
    })
  }

  try {
    const preview = await listDriveBrainPreview(auth.user.id, folderId)
    return Response.json({
      connected: true,
      email: tokens.email,
      ...preview,
      count: preview.files.length,
    })
  } catch (e) {
    return Response.json(
      {
        connected: true,
        folderId,
        folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
        error: e instanceof Error ? e.message : 'فشل قراءة المجلد',
      },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as {
    scopeId?: string
    folderId?: string
    maxFiles?: number
  }
  const scopeId = body.scopeId || 'shared-demo'
  const folderId = body.folderId || getDriveBrainFolderId()

  const tokens = await getGoogleTokenRow(auth.user.id)
  if (!tokens?.access_token) {
    return Response.json(
      {
        error:
          'Google غير مربوط. من الإعدادات اضغط «ربط تقويم Google» (يشمل Drive).',
      },
      { status: 400 }
    )
  }

  try {
    const result = await syncDriveFolderToBrain({
      userId: auth.user.id,
      scopeId,
      folderId,
      maxFiles: body.maxFiles,
    })

    await insertRoomPost({
      scopeId,
      authorKind: 'system',
      authorId: 'company-brain',
      authorNameAr: 'عقل الشركة',
      content: `📁 ${result.messageAr}\n${result.folderUrl}`,
    })

    return Response.json(result)
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'فشلت مزامنة Drive' },
      { status: 500 }
    )
  }
}
