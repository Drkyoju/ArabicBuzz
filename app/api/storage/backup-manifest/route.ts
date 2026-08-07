import { requireRealUser } from '@/lib/auth/session'
import { listWorkspaceFiles } from '@/lib/documents/workspace'
import { roomChatRetentionDays } from '@/lib/rooms/chat-retention'

export const dynamic = 'force-dynamic'

/**
 * Export vault file index (JSON) — survives chat purge.
 * Does not delete or modify workspace_files; chat retention never touches this table.
 */
export async function GET(req: Request) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const scopeId = (url.searchParams.get('scopeId') || 'shared-demo').trim()

  try {
    const files = await listWorkspaceFiles(scopeId)
    const generatedAt = new Date().toISOString()
    const manifest = {
      kind: 'arabic-buzz-vault-manifest',
      version: 1,
      scopeId,
      generatedAt,
      generatedAtAr: new Intl.DateTimeFormat('ar-SA', {
        timeZone: 'Asia/Riyadh',
        dateStyle: 'full',
        timeStyle: 'short',
      }).format(new Date()),
      noteAr:
        'فهرس أرشيف ملفات الفريق فقط — لا يشمل رسائل الشات. حذف/تنظيف الشات (بما فيه الاحتفاظ ' +
        `${roomChatRetentionDays()} أيام) لا يحذف هذه الملفات.`,
      chatRetentionDays: roomChatRetentionDays(),
      fileCount: files.length,
      files: files.map((f) => ({
        id: f.id,
        originalName: f.originalName,
        mimeType: f.mimeType,
        size: f.size ?? null,
        source: f.source,
        createdAt: f.createdAt ?? null,
        editedAt: f.editedAt ?? null,
        editedBy: f.editedBy ?? null,
        tags: f.tags || [],
      })),
    }

    const body = JSON.stringify(manifest, null, 2)
    const filename = `arabicbuzz-vault-${scopeId}-${generatedAt.slice(0, 10)}.json`
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return Response.json(
      {
        error: e instanceof Error ? e.message : 'تعذّر تصدير فهرس الأرشيف',
      },
      { status: 500 }
    )
  }
}
