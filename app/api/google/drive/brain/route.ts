import { requireRealUser } from '@/lib/auth/session'
import {
  listDriveBrainPreview,
  syncDriveFolderToBrain,
} from '@/lib/google/drive-brain'
import {
  classifyDriveAccessError,
  COMPANY_BRAIN_SCOPE_ID,
  getDriveBrainFolderId,
} from '@/lib/google/drive'
import { insertRoomPost } from '@/lib/rooms/persist'
import { getGoogleTokenRow } from '@/lib/google/tokens'
import { isDirectorEmail } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
      errorCode: 'no_token',
      error:
        'اربط Google من الإعدادات (تقويم/Drive) بحساب يملك صلاحية على مجلد «ملفات الجمعية»، ثم اضغط «زامن العقل».',
    })
  }

  try {
    const preview = await listDriveBrainPreview(auth.user.id, folderId)
    return Response.json({
      connected: true,
      email: tokens.email,
      brainMode: 'cloud',
      brainScopeId: COMPANY_BRAIN_SCOPE_ID,
      emptyFolder: preview.files.length === 0,
      ...preview,
      count: preview.files.length,
      ...(preview.files.length === 0
        ? {
            errorCode: 'empty_folder',
            error:
              'المجلد فارغ فعلاً — لا ملفات ظاهرة لحسابك. ارفع الملفات إلى «ملفات الجمعية» أو تأكد أن الحساب المربوط يرى المجلد، ثم اضغط «زامن العقل».',
          }
        : {}),
    })
  } catch (e) {
    const classified = classifyDriveAccessError(e)
    return Response.json(
      {
        connected: true,
        email: tokens.email,
        brainMode: 'cloud',
        folderId,
        folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
        errorCode: classified.code,
        error: classified.messageAr,
      },
      { status: classified.code === 'other' ? 500 : 403 }
    )
  }
}

export async function POST(req: Request) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as {
    folderId?: string
    maxFiles?: number
    force?: boolean
  }
  const scopeId = COMPANY_BRAIN_SCOPE_ID
  const folderId = body.folderId || getDriveBrainFolderId()

  const tokens = await getGoogleTokenRow(auth.user.id)
  if (!tokens?.access_token) {
    return Response.json(
      {
        errorCode: 'no_token',
        error:
          'Google غير مربوط. من الإعدادات اضغط «ربط Google (Drive)» بحساب يملك صلاحية على مجلد ملفات الجمعية، ثم «زامن العقل».',
      },
      { status: 400 }
    )
  }

  if (
    tokens.email &&
    isDirectorEmail(auth.user.email) &&
    !isDirectorEmail(tokens.email)
  ) {
    return Response.json(
      {
        errorCode: 'wrong_google_account',
        error: `الحساب المربوط (${tokens.email}) ليس حساب المدير. افصل Google وأعد الربط بـ ryodan71@gmail.com ثم زامن العقل.`,
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

    // Announce only when new files were indexed — avoid “اكتملت 20/20” spam.
    if (result.ingested > 0) {
      try {
        await insertRoomPost({
          scopeId,
          authorKind: 'system',
          authorId: 'company-brain',
          authorNameAr: 'عقل الشركة',
          content: `📁 ${result.messageAr}\n${result.folderUrl}`,
        })
      } catch {
        /* optional */
      }
    }

    return Response.json({ ...result, brainScopeId: scopeId })
  } catch (e) {
    const classified = classifyDriveAccessError(e)
    return Response.json(
      { errorCode: classified.code, error: classified.messageAr },
      { status: 500 }
    )
  }
}
