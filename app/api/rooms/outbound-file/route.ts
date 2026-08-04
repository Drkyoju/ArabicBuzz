import { requireRealUser } from '@/lib/auth/session'
import { insertRoomPost, assertRoomCanPost } from '@/lib/rooms/persist'
import { readWorkspaceFile } from '@/lib/documents/workspace'
import {
  emitNotification,
  emitTelegramDocument,
} from '@/lib/notifications/emit'
import { sendResendEmail } from '@/lib/email/resend'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Share a workspace file to Telegram (document) and/or email attachment,
 * and post a note in the room feed.
 */
export async function POST(req: Request) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as {
    scopeId?: string
    fileId?: string
    channel?: 'telegram' | 'email' | 'both'
    toEmail?: string
    captionAr?: string
  }

  const scopeId = String(body.scopeId || 'shared-demo')
  const fileId = String(body.fileId || '').trim()
  const channel = body.channel || 'telegram'
  const caption =
    body.captionAr?.trim() || 'ملف من Arabic Buzz'

  if (!fileId) {
    return Response.json({ error: 'يلزم fileId' }, { status: 400 })
  }

  const gate = await assertRoomCanPost(scopeId, auth.user.id, auth.user.email)
  if (!gate.ok) {
    return Response.json({ error: gate.error }, { status: 403 })
  }

  let file: Awaited<ReturnType<typeof readWorkspaceFile>>
  try {
    file = await readWorkspaceFile(scopeId, fileId)
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'الملف غير موجود' },
      { status: 404 }
    )
  }

  const results: Record<string, unknown> = {}

  if (channel === 'telegram' || channel === 'both') {
    const sent = await emitTelegramDocument({
      buffer: file.buffer,
      filename: file.meta.originalName,
      captionAr: caption,
      meta: { scopeId },
    })
    results.telegram = sent
    if (!sent.ok && channel === 'telegram') {
      return Response.json(
        { ok: false, error: sent.error || 'تعذّر إرسال تيليجرام', results },
        { status: 502 }
      )
    }
  }

  if (channel === 'email' || channel === 'both') {
    const to = String(body.toEmail || '').trim()
    if (!to.includes('@')) {
      return Response.json(
        { error: 'يلزم toEmail صالح لإرسال البريد' },
        { status: 400 }
      )
    }
    const mailed = await sendResendEmail({
      to,
      subject: caption.slice(0, 120),
      text: `${caption}\n\nالمرفق: ${file.meta.originalName}\n— Arabic Buzz`,
      attachments: [
        {
          filename: file.meta.originalName,
          contentBase64: file.buffer.toString('base64'),
        },
      ],
    })
    results.email = mailed
    if (!mailed.ok && channel === 'email') {
      return Response.json(
        {
          ok: false,
          error: mailed.error || 'تعذّر إرسال البريد',
          results,
        },
        { status: mailed.skipped ? 503 : 502 }
      )
    }
  }

  // Also drop a short text ping on Telegram when email-only succeeded
  if (channel === 'email') {
    await emitNotification({
      channel: 'telegram',
      textAr: `أُرسل ملف «${file.meta.originalName}» بالبريد.`,
      meta: { scopeId },
    }).catch(() => null)
  }

  await insertRoomPost({
    scopeId,
    authorKind: 'system',
    authorId: 'outbound-file',
    authorNameAr: 'مشاركة ملف',
    content: `أُرسل الملف «${file.meta.originalName}» عبر ${
      channel === 'both' ? 'تيليجرام والبريد' : channel === 'email' ? 'البريد' : 'تيليجرام'
    }.`,
  })

  return Response.json({
    ok: true,
    file: file.meta,
    results,
    messageAr: 'تمت مشاركة الملف.',
  })
}
