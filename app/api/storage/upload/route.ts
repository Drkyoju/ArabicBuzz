import { requireUser } from '@/lib/auth/session'
import {
  getStorageStatus,
  listLocalFiles,
  saveLocalFile,
} from '@/lib/storage/local'
import { insertRoomPost } from '@/lib/rooms/persist'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response
  const url = new URL(req.url)
  if (url.searchParams.get('status') === '1') {
    return Response.json({ storage: getStorageStatus() })
  }
  const scopeId = url.searchParams.get('scopeId') || 'shared-demo'
  try {
    const files = listLocalFiles(scopeId)
    return Response.json({ files, storage: getStorageStatus() })
  } catch (e) {
    return Response.json(
      {
        files: [],
        storage: getStorageStatus(),
        error: e instanceof Error ? e.message : 'storage error',
      },
      { status: 200 }
    )
  }
}

export async function POST(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response

  try {
    const form = await req.formData()
    const file = form.get('file')
    const scopeId = String(form.get('scopeId') || 'shared-demo')
    if (!(file instanceof File)) {
      return Response.json({ error: 'أرفق ملفاً (file).' }, { status: 400 })
    }
    const buf = Buffer.from(await file.arrayBuffer())
    if (buf.length > 40 * 1024 * 1024) {
      return Response.json(
        { error: 'الحد الأقصى للملف 40MB على التخزين المحلي.' },
        { status: 400 }
      )
    }
    const meta = saveLocalFile({
      scopeId,
      buffer: buf,
      originalName: file.name || 'upload.bin',
      mimeType: file.type || 'application/octet-stream',
    })

    const kindAr =
      meta.kind === 'pdf'
        ? 'PDF'
        : meta.kind === 'audio'
          ? 'ملاحظة صوتية'
          : meta.kind === 'image'
            ? 'صورة'
            : 'ملف'

    await insertRoomPost({
      scopeId,
      authorKind: 'human',
      authorId: auth.user.id,
      authorNameAr:
        auth.user.email ||
        auth.user.user_metadata?.full_name ||
        'مستخدم',
      content: `📎 تم حفظ ${kindAr} على جهاز الماك: «${meta.originalName}» (${Math.round(meta.size / 1024)} ك.ب)\nالمعرّف: ${meta.id}`,
    })

    return Response.json({
      ok: true,
      file: meta,
      messageAr: `حُفظ على الماك في مجلد ArabicBuzz/data`,
      openUrl: `/api/storage/file?scopeId=${encodeURIComponent(scopeId)}&id=${encodeURIComponent(meta.id)}`,
    })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'تعذّر الحفظ' },
      { status: 500 }
    )
  }
}
