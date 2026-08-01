import { requireUser } from '@/lib/auth/session'
import {
  getStorageStatus,
  isLocalStorageEnabled,
  listLocalFiles,
  saveLocalFile,
} from '@/lib/storage/local'
import {
  listCloudFiles,
  saveCloudFile,
} from '@/lib/storage/cloud'
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
    let files: unknown[] = []
    let source: 'local' | 'cloud' | 'none' = 'none'
    let listError: string | undefined

    if (isLocalStorageEnabled()) {
      try {
        files = listLocalFiles(scopeId)
        source = 'local'
      } catch (e) {
        listError = e instanceof Error ? e.message : 'local list failed'
      }
    }

    if (files.length === 0) {
      const cloud = await listCloudFiles(scopeId)
      if (cloud.length > 0) {
        files = cloud
        source = 'cloud'
      }
    }

    return Response.json({
      files,
      source,
      storage: getStorageStatus(),
      macSyncConfigured: Boolean(process.env.MAC_SYNC_URL),
      error:
        files.length === 0 && !isLocalStorageEnabled() && !process.env.MAC_SYNC_URL
          ? 'التخزين المحلي غير متاح هنا — الرفع يحفظ سحابياً (حتى 4MB) أو استخدم «عقل الشركة» للمستندات.'
          : listError,
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
      if (forwarded.ok && forwarded.file) {
        meta = forwarded.file as {
          id: string
          kind: string
          originalName: string
          size: number
          [k: string]: unknown
        }
        messageAr = forwarded.messageAr || messageAr
      }
    }

    if (!meta) {
      const cloud = await saveCloudFile({
        scopeId,
        buffer: buf,
        originalName: file.name || 'upload.bin',
        mimeType: file.type || 'application/octet-stream',
      })
      if (!cloud.ok) {
        return Response.json(
          {
            error:
              cloud.error ||
              'تعذّر الحفظ. جرّب «عقل الشركة» للمستندات أو شغّل التخزين المحلي على الماك.',
          },
          { status: 503 }
        )
      }
      meta = cloud.file
      messageAr = 'حُفظ الملف في التخزين السحابي للغرفة (احتياطي Netlify)'
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
      content: `📎 تم حفظ ${kindAr}: «${meta!.originalName}» (${Math.round(Number(meta!.size) / 1024)} ك.ب)\nالمعرّف: ${meta!.id}`,
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
