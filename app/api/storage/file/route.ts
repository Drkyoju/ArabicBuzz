import { requireSessionUser, requireRealUser } from '@/lib/auth/session'
import {
  deleteLocalFile,
  readLocalFile,
  renameLocalFile,
  replaceLocalFile,
} from '@/lib/storage/local'
import { readCloudFile } from '@/lib/storage/cloud'
import {
  directMacReplaceInfo,
  macDeleteFile,
  macReadFile,
  macRenameFile,
  macReplaceFile,
  macSyncConfigured,
  NETLIFY_MAC_HOP_MAX,
} from '@/lib/storage/mac-sync-client'
import { insertRoomPost } from '@/lib/rooms/persist'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Download from Mac vault (preferred) or local/cloud. */
export async function GET(req: Request) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const scopeId = url.searchParams.get('scopeId') || 'shared-demo'
  const id = url.searchParams.get('id') || ''
  if (!id) {
    return Response.json({ error: 'id مطلوب' }, { status: 400 })
  }

  const { assertRoomCanAccess } = await import('@/lib/rooms/persist')
  const gate = await assertRoomCanAccess(
    scopeId,
    auth.user.id,
    auth.user.email
  )
  if (!gate.ok) {
    return Response.json({ error: gate.error }, { status: 403 })
  }

  try {
    if (macSyncConfigured()) {
      try {
        const hit = await macReadFile(scopeId, id)
        return new Response(new Uint8Array(hit.buffer), {
          status: 200,
          headers: {
            'Content-Type': hit.meta.mimeType,
            'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(hit.meta.originalName)}`,
            'Cache-Control': 'private, max-age=60',
          },
        })
      } catch {
        /* fall through */
      }
    }

    let hit: {
      meta: { mimeType: string; originalName: string }
      buffer: Buffer
    } | null = null
    try {
      hit = readLocalFile(scopeId, id)
    } catch {
      hit = null
    }
    if (!hit) {
      hit = await readCloudFile(scopeId, id)
    }
    if (!hit) {
      return Response.json(
        { error: 'الملف غير موجود على الماك أو السحابة.' },
        { status: 404 }
      )
    }
    return new Response(new Uint8Array(hit.buffer), {
      status: 200,
      headers: {
        'Content-Type': hit.meta.mimeType,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(hit.meta.originalName)}`,
        'Cache-Control': 'private, max-age=60',
      },
    })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'تعذّر القراءة' },
      { status: 500 }
    )
  }
}

/** Rename: { scopeId, id, originalName } */
export async function PATCH(req: Request) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => ({}))) as {
    scopeId?: string
    id?: string
    originalName?: string
  }
  const scopeId = body.scopeId || 'shared-demo'
  const id = String(body.id || '')
  const originalName = String(body.originalName || '').trim()
  if (!id || !originalName) {
    return Response.json(
      { error: 'id و originalName مطلوبان' },
      { status: 400 }
    )
  }

  try {
    if (macSyncConfigured()) {
      const data = await macRenameFile(scopeId, id, originalName)
      await insertRoomPost({
        scopeId,
        authorKind: 'system',
        authorId: auth.user.id,
        authorNameAr: 'خزنة الماك',
        content: `✏️ ${data.messageAr || `أُعيدت تسمية ملف إلى «${originalName}»`}`,
      })
      return Response.json(data)
    }
    const result = renameLocalFile(scopeId, id, originalName)
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 404 })
    }
    return Response.json({
      ok: true,
      file: result.meta,
      messageAr: `أُعيدت تسمية الملف إلى «${result.meta.originalName}»`,
    })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'فشل إعادة التسمية' },
      { status: 500 }
    )
  }
}

/**
 * Delete workspace/Mac vault file only.
 * Never cascades to Telegram — chat messages/media must remain (never-delete policy).
 */
export async function DELETE(req: Request) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response
  const url = new URL(req.url)
  const scopeId = url.searchParams.get('scopeId') || 'shared-demo'
  const id = url.searchParams.get('id') || ''
  if (!id) {
    return Response.json({ error: 'id مطلوب' }, { status: 400 })
  }

  try {
    if (macSyncConfigured()) {
      const data = await macDeleteFile(scopeId, id)
      await insertRoomPost({
        scopeId,
        authorKind: 'system',
        authorId: auth.user.id,
        authorNameAr: 'خزنة الماك',
        content: `🗑️ ${data.messageAr || 'حُذف ملف من خزنة الماك'}`,
      })
      return Response.json(data)
    }
    const result = deleteLocalFile(scopeId, id)
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 404 })
    }
    return Response.json({
      ok: true,
      deleted: true,
      file: result.meta,
      messageAr: `حُذف «${result.meta.originalName}»`,
    })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'فشل الحذف' },
      { status: 500 }
    )
  }
}

/**
 * Replace file content.
 * multipart: file + scopeId + id
 * Large files: returns directUploadRequired for Mac PUT.
 */
export async function PUT(req: Request) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  try {
    const form = await req.formData()
    const file = form.get('file')
    const scopeId = String(form.get('scopeId') || 'shared-demo')
    const id = String(form.get('id') || '')
    if (!id || !(file instanceof File)) {
      return Response.json(
        { error: 'id و file مطلوبان' },
        { status: 400 }
      )
    }

    const direct = directMacReplaceInfo(id)
    if (file.size > NETLIFY_MAC_HOP_MAX && direct) {
      return Response.json({
        ok: false,
        directUploadRequired: true,
        directUpload: direct,
        scopeId,
        id,
        messageAr: 'استبدل الملف مباشرة على الماك (حجم كبير).',
      })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    if (macSyncConfigured()) {
      const data = await macReplaceFile({
        scopeId,
        id,
        buffer,
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
      })
      await insertRoomPost({
        scopeId,
        authorKind: 'system',
        authorId: auth.user.id,
        authorNameAr: 'خزنة الماك',
        content: `📝 ${data.messageAr || 'استُبدل ملف على الماك'}`,
      })
      return Response.json(data)
    }

    const result = replaceLocalFile(scopeId, id, buffer, {
      originalName: file.name,
      mimeType: file.type || undefined,
    })
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 404 })
    }
    return Response.json({
      ok: true,
      file: result.meta,
      messageAr: `استُبدل «${result.meta.originalName}»`,
    })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'فشل الاستبدال' },
      { status: 500 }
    )
  }
}
