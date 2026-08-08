/**
 * Emergency ingest: accept PDF bytes (multipart or base64) for pending TG file jobs.
 * Used when Bot API cannot download (>20MB) but user uploads once to site/API.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireRealUser } from '@/lib/auth/session'
import { saveWorkspaceFile } from '@/lib/documents/workspace'
import { afterVaultFileMaybeRunTelegramJobs } from '@/lib/telegram/execute-file-jobs'
import { updateTelegramFileJob } from '@/lib/telegram/file-jobs'
import { persistTelegramAttachment } from '@/lib/telegram/attachment-persist'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const PENDING_JOB = '96dee180-e828-49db-a2df-0d3a411e90a6'

export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  const ct = req.headers.get('content-type') || ''
  let buffer: Buffer | null = null
  let fileName = 'المعلم الأول من معالم من السيرة النبوية.pdf'
  let scopeId =
    process.env.TELEGRAM_DEFAULT_SCOPE_ID?.trim() || 'shared-demo'
  let chatId = '-1003855925966'
  let jobId = PENDING_JOB

  if (ct.includes('multipart/form-data')) {
    const form = await req.formData()
    const file = form.get('file')
    if (file && typeof file === 'object' && 'arrayBuffer' in file) {
      const f = file as File
      buffer = Buffer.from(await f.arrayBuffer())
      if (f.name) fileName = f.name
    }
    if (form.get('scopeId')) scopeId = String(form.get('scopeId'))
    if (form.get('chatId')) chatId = String(form.get('chatId'))
    if (form.get('jobId')) jobId = String(form.get('jobId'))
    if (form.get('fileName')) fileName = String(form.get('fileName'))
  } else {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    if (!body?.contentBase64) {
      return NextResponse.json(
        { error: 'مرّر file أو contentBase64' },
        { status: 400 }
      )
    }
    buffer = Buffer.from(String(body.contentBase64), 'base64')
    if (body.fileName) fileName = String(body.fileName)
    if (body.scopeId) scopeId = String(body.scopeId)
    if (body.chatId) chatId = String(body.chatId)
    if (body.jobId) jobId = String(body.jobId)
  }

  if (!buffer?.length) {
    return NextResponse.json({ error: 'لا بايتات' }, { status: 400 })
  }

  const saved = await saveWorkspaceFile({
    scopeId,
    buffer,
    originalName: fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`,
    mimeType: 'application/pdf',
  })

  await persistTelegramAttachment({
    chatId,
    scopeId,
    fileName: saved.file.originalName,
    mimeType: 'application/pdf',
    sizeBytes: buffer.length,
    vaultFileId: saved.file.id,
    hasBytes: true,
  })

  await updateTelegramFileJob(jobId, {
    status: 'pending',
    vaultFileId: saved.file.id,
    expectedFilename: saved.file.originalName,
    workParams: { copyPage: 48, afterPage: 45 },
  })

  const ran = await afterVaultFileMaybeRunTelegramJobs({
    chatId,
    scopeId,
    vaultFileId: saved.file.id,
    fileName: saved.file.originalName,
  })

  return NextResponse.json({
    ok: true,
    file: saved.file,
    jobId,
    ran,
    messageAr: `حُفظ «${saved.file.originalName}» وشُغّلت المهام المعلّقة.`,
  })
}
