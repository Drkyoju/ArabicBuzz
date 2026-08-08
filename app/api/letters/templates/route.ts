import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser, requireRealUser } from '@/lib/auth/session'
import {
  getLetterTemplate,
  LETTER_TEMPLATES,
} from '@/lib/documents/letter-templates'
import {
  buildDocumentBuffer,
  extensionForFormat,
  type DocFormat,
} from '@/lib/documents/build'
import { saveCloudFile } from '@/lib/storage/cloud'
import { isLocalStorageEnabled, saveLocalFile } from '@/lib/storage/local'
import { PRIMARY_TEAM_SCOPE_ID } from '@/lib/scopes/primary-room'
import { displayNameFromUser } from '@/lib/auth/display-name'

export const dynamic = 'force-dynamic'

/** List MSA letter templates. */
export async function GET(req: NextRequest) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response

  return NextResponse.json({
    ok: true,
    templates: LETTER_TEMPLATES.map((t) => ({
      id: t.id,
      titleAr: t.titleAr,
      descriptionAr: t.descriptionAr,
      fields: t.fields,
    })),
  })
}

/** Fill template → Word or PDF; optional save to room files. */
export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as {
    templateId?: string
    values?: Record<string, string>
    format?: DocFormat
    scopeId?: string
    saveToRoom?: boolean
  }

  const template = getLetterTemplate(String(body.templateId || ''))
  if (!template) {
    return NextResponse.json(
      { error: 'قالب غير معروف' },
      { status: 400 }
    )
  }

  const format: DocFormat =
    body.format === 'pdf' || body.format === 'docx' ? body.format : 'docx'
  const values = body.values || {}
  const built = template.buildBody(values)
  const builtDoc = await buildDocumentBuffer({
    format,
    title: built.title,
    paragraphs: built.paragraphs,
  })
  const buffer = builtDoc.buffer

  const filename = `${template.titleAr.replace(/\s+/g, '_')}${extensionForFormat(format)}`
  const scopeId = body.scopeId || PRIMARY_TEAM_SCOPE_ID
  let savedFileId: string | undefined
  let saveMessageAr: string | undefined

  if (body.saveToRoom) {
    const { assertRoomCanEdit } = await import('@/lib/rooms/persist')
    const gate = await assertRoomCanEdit(
      scopeId,
      auth.user.id,
      auth.user.email
    )
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: 403 })
    }
    try {
      const by = displayNameFromUser(auth.user)
      if (isLocalStorageEnabled()) {
        const f = saveLocalFile({
          scopeId,
          buffer,
          originalName: filename,
          mimeType: builtDoc.mimeType,
          markEdited: true,
          editedBy: by,
        })
        savedFileId = f.id
        saveMessageAr = 'حُفظ في ملفات الغرفة (محلي)'
      } else {
        const f = await saveCloudFile({
          scopeId,
          buffer,
          originalName: filename,
          mimeType: builtDoc.mimeType,
          markEdited: true,
          editedBy: by,
        })
        if (f.ok) {
          savedFileId = f.file.id
          saveMessageAr = 'حُفظ في ملفات الغرفة'
        } else {
          saveMessageAr = f.error
        }
      }
    } catch (e) {
      saveMessageAr =
        e instanceof Error ? e.message : 'تعذّر الحفظ في الملفات'
    }
  }

  return NextResponse.json({
    ok: true,
    filename,
    mimeType: builtDoc.mimeType,
    contentBase64: buffer.toString('base64'),
    savedFileId,
    messageAr: saveMessageAr || `جاهز للتحميل: ${filename}`,
  })
}
