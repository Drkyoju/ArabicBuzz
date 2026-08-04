import { requireRealUser } from '@/lib/auth/session'
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
 * Google Drive folder → cloud company brain (Supabase).
 * Default: ملفات الجمعية
 * https://drive.google.com/drive/folders/1Zu2vgbR8p0f8xnn1_cTnUZwsTLHUiHhW
 */
export async function GET(req: Request) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const folderId = url.searchParams.get('folderId') || getDriveBrainFolderId()
  const tokens = await getGoogleTokenRow(auth.user.id)

  if (!tokens?.access_token) {
    return Response.json({
      connected: false,
      folderId,
      folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
      brainMode: 'cloud',
      error:
        'اربط Google من الإعدادات (تقويم/Drive) ثم امنح صلاحية قراءة Drive. المجلد: ملفات الجمعية.',
    })
  }

  try {
    const preview = await listDriveBrainPreview(auth.user.id, folderId)
    return Response.json({
      connected: true,
      email: tokens.email,
      brainMode: 'cloud',
      ...preview,
      count: preview.files.length,
    })
  } catch (e) {
    return Response.json(
      {
        connected: true,
        brainMode: 'cloud',
        folderId,
        folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
        error: e instanceof Error ? e.message : 'فشل قراءة المجلد',
      },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as {
    scopeId?: string
    folderId?: string
    maxFiles?: number
    force?: boolean
  }
  const scopeId = body.scopeId || 'shared-demo'
  // Always the association brain folder unless explicitly overridden
  const folderId = body.folderId || getDriveBrainFolderId()

  const tokens = await getGoogleTokenRow(auth.user.id)
  if (!tokens?.access_token) {
    return Response.json(
      {
        error:
          'Google غير مربوط. من الإعدادات اضغط «ربط تقويم Google» (يشمل Drive) بحساب يملك صلاحية على مجلد ملفات الجمعية.',
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
      force: Boolean(body.force),
    })

    try {
      await insertRoomPost({
        scopeId,
        authorKind: 'system',
        authorId: 'company-brain',
        authorNameAr: 'عقل الشركة',
        content: `📁 ${result.messageAr}\n${result.folderUrl}`,
      })
    } catch {
      /* post is optional if guest write blocked */
    }

    return Response.json(result)
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'فشلت مزامنة Drive' },
      { status: 500 }
    )
  }
}
