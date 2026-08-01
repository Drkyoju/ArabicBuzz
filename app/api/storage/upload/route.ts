import { requireUser } from '@/lib/auth/session'
import {
  getStorageStatus,
  isLocalStorageEnabled,
  listLocalFiles,
  saveLocalFile,
} from '@/lib/storage/local'
import { insertRoomPost } from '@/lib/rooms/persist'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

async function forwardToMacSync(opts: {
  scopeId: string
  buffer: Buffer
  originalName: string
  mimeType: string
}): Promise<{ ok: boolean; file?: unknown; messageAr?: string; error?: string }> {
  const syncUrl = (process.env.MAC_SYNC_URL || '').replace(/\/$/, '')
  const secret =
    process.env.MAC_SYNC_SECRET?.trim() ||
    process.env.LOCAL_STORAGE_SYNC_SECRET?.trim() ||
    ''
  if (!syncUrl) {
    return { ok: false, error: 'MAC_SYNC_URL غير مضبوط' }
  }
  try {
    const res = await fetch(`${syncUrl}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({
        scopeId: opts.scopeId,
        originalName: opts.originalName,
        mimeType: opts.mimeType,
        contentBase64: opts.buffer.toString('base64'),
      }),
    })
    const data = (await res.json()) as {
      ok?: boolean
      file?: unknown
      messageAr?: string
      error?: string
    }
    if (!res.ok) {
      return { ok: false, error: data.error || `Mac sync HTTP ${res.status}` }
    }
    return {
      ok: true,
      file: data.file,
      messageAr: data.messageAr || 'حُفظ عبر وكيل مزامنة الماك',
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'تعذّر الاتصال بوكيل الماك',
    }
  }
}

export async function GET(req: Request) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response
  const url = new URL(req.url)
  if (url.searchParams.get('status') === '1') {
    return Response.json({
      storage: getStorageStatus(),
      macSyncConfigured: Boolean(process.env.MAC_SYNC_URL),
    })
  }
  const scopeId = url.searchParams.get('scopeId') || 'shared-demo'
  try {
    if (!isLocalStorageEnabled()) {
      return Response.json({
        files: [],
        storage: getStorageStatus(),
        macSyncConfigured: Boolean(process.env.MAC_SYNC_URL),
        error:
          'التخزين المحلي غير متاح على هذا الخادم. شغّل npm run storage:sync على الماك أو npm run dev محلياً.',
      })
    }
    const files = listLocalFiles(scopeId)
    return Response.json({
      files,
      storage: getStorageStatus(),
      macSyncConfigured: Boolean(process.env.MAC_SYNC_URL),
    })
  } catch (e) {
    return Response.json(
      {
        files: [],
        storage: getStorageStatus(),
        macSyncConfigured: Boolean(process.env.MAC_SYNC_URL),
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

    let meta: {
      id: string
      kind: string
      originalName: string
      size: number
      [k: string]: unknown
    } | null = null
    let messageAr = ''

    if (isLocalStorageEnabled()) {
      try {
        meta = saveLocalFile({
          scopeId,
          buffer: buf,
          originalName: file.name || 'upload.bin',
          mimeType: file.type || 'application/octet-stream',
        })
        messageAr = 'حُفظ على الماك في مجلد ArabicBuzz/data'
      } catch {
        /* fall through to sync */
      }
    }

    if (!meta) {
      const forwarded = await forwardToMacSync({
        scopeId,
        buffer: buf,
        originalName: file.name || 'upload.bin',
        mimeType: file.type || 'application/octet-stream',
      })
      if (!forwarded.ok || !forwarded.file) {
        return Response.json(
          {
            error:
              forwarded.error ||
              'التخزين على الماك غير مفعّل هنا. شغّل npm run dev محلياً أو npm run storage:sync مع MAC_SYNC_URL.',
          },
          { status: 503 }
        )
      }
      meta = forwarded.file as {
        id: string
        kind: string
        originalName: string
        size: number
        [k: string]: unknown
      }
      messageAr = forwarded.messageAr || messageAr
    }

    const kindAr =
      meta!.kind === 'pdf'
        ? 'PDF'
        : meta!.kind === 'audio'
          ? 'ملاحظة صوتية'
          : meta!.kind === 'image'
            ? 'صورة'
            : meta!.kind === 'pptx'
              ? 'PowerPoint'
              : meta!.kind === 'xlsx'
                ? 'Excel'
                : meta!.kind === 'doc'
                  ? 'Word/مستند'
                  : 'ملف'

    await insertRoomPost({
      scopeId,
      authorKind: 'human',
      authorId: auth.user.id,
      authorNameAr:
        auth.user.email ||
        auth.user.user_metadata?.full_name ||
        'مستخدم',
      content: `📎 تم حفظ ${kindAr} على جهاز الماك: «${meta!.originalName}» (${Math.round(Number(meta!.size) / 1024)} ك.ب)\nالمعرّف: ${meta!.id}`,
    })

    return Response.json({
      ok: true,
      file: meta,
      messageAr,
      openUrl: `/api/storage/file?scopeId=${encodeURIComponent(scopeId)}&id=${encodeURIComponent(String(meta!.id))}`,
    })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'تعذّر الحفظ' },
      { status: 500 }
    )
  }
}
