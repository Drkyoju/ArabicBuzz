import { requireSessionUser, requireRealUser } from '@/lib/auth/session'
import {
  getStorageStatus,
  isLocalStorageEnabled,
  listLocalFiles,
  saveLocalFile,
} from '@/lib/storage/local'
import { listCloudFiles, saveCloudFile } from '@/lib/storage/cloud'
import { insertRoomPost } from '@/lib/rooms/persist'
import {
  directMacUploadInfo,
  getMacSyncConfig,
  macSyncConfigured,
  NETLIFY_MAC_HOP_MAX,
} from '@/lib/storage/mac-sync-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

async function listMacRemoteFiles(scopeId: string): Promise<unknown[]> {
  const { baseUrl, secret } = getMacSyncConfig()
  if (!baseUrl) return []
  try {
    const res = await fetch(
      `${baseUrl}/files?scopeId=${encodeURIComponent(scopeId)}`,
      {
        headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      }
    )
    if (!res.ok) return []
    const data = (await res.json()) as { files?: unknown[] }
    return data.files || []
  } catch {
    return []
  }
}

async function forwardToMacSync(opts: {
  scopeId: string
  buffer: Buffer
  originalName: string
  mimeType: string
}): Promise<{ ok: boolean; file?: unknown; messageAr?: string; error?: string }> {
  const { baseUrl, secret } = getMacSyncConfig()
  if (!baseUrl) {
    return { ok: false, error: 'MAC_SYNC_URL غير مضبوط' }
  }
  try {
    const res = await fetch(`${baseUrl}/sync`, {
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
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response
  const url = new URL(req.url)
  const direct = directMacUploadInfo()
  if (url.searchParams.get('status') === '1') {
    return Response.json({
      storage: getStorageStatus(),
      macSyncConfigured: macSyncConfigured(),
      directUpload: direct,
      hopMaxBytes: NETLIFY_MAC_HOP_MAX,
    })
  }
  const scopeId = url.searchParams.get('scopeId') || 'shared-demo'
  try {
    const { assertRoomCanAccess } = await import('@/lib/rooms/persist')
    const gate = await assertRoomCanAccess(
      scopeId,
      auth.user.id,
      auth.user.email
    )
    if (!gate.ok) {
      return Response.json({ error: gate.error, files: [] }, { status: 403 })
    }
    let files: unknown[] = []
    let source: 'local' | 'mac' | 'cloud' | 'none' = 'none'
    let listError: string | undefined

    if (isLocalStorageEnabled()) {
      try {
        files = listLocalFiles(scopeId)
        if (files.length > 0) source = 'local'
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'local list failed'
        // Serverless often cannot mkdir home vault — fall through quietly
        if (!/ENOENT|EACCES|EROFS|read-only/i.test(msg)) {
          listError = msg
        }
      }
    }

    if (files.length === 0 && macSyncConfigured()) {
      files = await listMacRemoteFiles(scopeId)
      if (files.length > 0) source = 'mac'
    }

    if (files.length === 0) {
      const cloud = await listCloudFiles(scopeId)
      if (cloud.length > 0) {
        files = cloud
        source = 'cloud'
      }
    }

    const noBackendHint =
      files.length === 0 &&
      !isLocalStorageEnabled() &&
      !macSyncConfigured() &&
      source === 'none'
        ? 'لا خزنة ماك هنا — ارفع للسحابة (حتى ~4MB) أو اربط وكيل المزامنة للملفات الكبيرة.'
        : undefined

    return Response.json({
      files,
      source,
      storage: getStorageStatus(),
      macSyncConfigured: macSyncConfigured(),
      directUpload: direct,
      hopMaxBytes: NETLIFY_MAC_HOP_MAX,
      error: noBackendHint || listError,
    })
  } catch (e) {
    return Response.json(
      {
        files: [],
        storage: getStorageStatus(),
        macSyncConfigured: macSyncConfigured(),
        directUpload: direct,
        error: e instanceof Error ? e.message : 'storage error',
      },
      { status: 200 }
    )
  }
}

export async function POST(req: Request) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  try {
    const form = await req.formData()
    const file = form.get('file')
    const scopeId = String(form.get('scopeId') || 'shared-demo')
    const { assertRoomCanPost } = await import('@/lib/rooms/persist')
    const gate = await assertRoomCanPost(
      scopeId,
      auth.user.id,
      auth.user.email
    )
    if (!gate.ok) {
      return Response.json({ error: gate.error }, { status: 403 })
    }
    if (!(file instanceof File)) {
      return Response.json({ error: 'أرفق ملفاً (file).' }, { status: 400 })
    }

    const declaredSize = file.size || 0
    const direct = directMacUploadInfo()
    const sensitive =
      String(form.get('sensitive') || form.get('macOnly') || '') === '1' ||
      String(form.get('sensitive') || '').toLowerCase() === 'true'

    // Too large for Netlify hop — client must POST raw body to Mac /upload
    if (declaredSize > NETLIFY_MAC_HOP_MAX) {
      if (!direct) {
        return Response.json(
          {
            error: sensitive
              ? 'الملف الحساس كبير ويتطلب وكيل الماك. اضبط NEXT_PUBLIC_MAC_UPLOAD_URL وشغّل المزامنة.'
              : 'الملف كبير جداً للنقل عبر Netlify. اضبط NEXT_PUBLIC_MAC_UPLOAD_URL وشغّل وكيل الماك، ثم ارفع مباشرة.',
            directUploadRequired: true,
          },
          { status: 413 }
        )
      }
      return Response.json(
        {
          ok: false,
          directUploadRequired: true,
          directUpload: direct,
          scopeId,
          messageAr: sensitive
            ? 'ارفع هذا الملف الحساس مباشرة إلى الماك فقط (دون سحابة).'
            : 'ارفع هذا الملف مباشرة إلى وكيل الماك (تجاوز حجم النقل عبر Netlify).',
        },
        { status: 200 }
      )
    }

    if (sensitive && !macSyncConfigured() && !isLocalStorageEnabled()) {
      if (direct) {
        return Response.json(
          {
            ok: false,
            directUploadRequired: true,
            directUpload: direct,
            scopeId,
            messageAr: 'ارفع الملف الحساس مباشرة إلى الماك فقط.',
          },
          { status: 200 }
        )
      }
      return Response.json(
        {
          error:
            'الوضع الحساس مفعّل لكن وكيل الماك غير متاح. لا يُسمح بالحفظ السحابي للمستندات الحساسة.',
        },
        { status: 503 }
      )
    }

    const buf = Buffer.from(await file.arrayBuffer())
    if (buf.length > NETLIFY_MAC_HOP_MAX) {
      return Response.json(
        {
          error: 'الملف أكبر من حد النقل عبر Netlify. استخدم الرفع المباشر للماك.',
          directUploadRequired: true,
          directUpload: direct,
        },
        { status: 413 }
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

    if (!meta && macSyncConfigured()) {
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
      if (sensitive) {
        return Response.json(
          {
            error:
              'تعذّر حفظ الملف الحساس على الماك. لا يُستخدم التخزين السحابي في الوضع الحساس.',
            directUpload: direct,
          },
          { status: 503 }
        )
      }
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
              'تعذّر الحفظ. شغّل وكيل الماك للملفات الكبيرة أو استخدم عقل الشركة للنص.',
            directUpload: direct,
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
      content:
        meta!.kind === 'audio'
          ? `🎤 رسالة صوتية: ${meta!.originalName} (id:${meta!.id})\nتم حفظ ملاحظة صوتية (${Math.round(Number(meta!.size) / 1024)} ك.ب)`
          : `📎 ملف جاهز للتنزيل: ${meta!.originalName} (id:${meta!.id})\nتم حفظ ${kindAr}: «${meta!.originalName}» (${Math.round(Number(meta!.size) / 1024)} ك.ب)`,
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
