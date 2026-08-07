/**
 * Scheduled vault archive backup — manifest (+ small file bytes when feasible).
 */
import { listWorkspaceFilesAllSources } from '@/lib/files/vault-sync'
import { readWorkspaceFile, saveWorkspaceFile } from '@/lib/documents/workspace'
import { DEMO_SCOPES, isSharedScope } from '@/lib/scopes/manager'
import { PRIMARY_TEAM_SCOPE_ID } from '@/lib/scopes/primary-room'
import { roomChatRetentionDays } from '@/lib/rooms/chat-retention'
import { prisma, withPrismaFallback } from '@/lib/db'

const MAX_EMBED_BYTES = 256 * 1024
const MAX_MANIFEST_BYTES = 3.5 * 1024 * 1024

export type VaultBackupScopeResult = {
  scopeId: string
  ok: boolean
  fileCount: number
  embeddedFiles: number
  manifestFileId?: string
  error?: string
}

function dayStamp(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

async function backupOneScope(scopeId: string): Promise<VaultBackupScopeResult> {
  try {
    const files = (await listWorkspaceFilesAllSources(scopeId)).filter(
      (f) => !/^vault-backup-/i.test(f.originalName || '')
    )
    const generatedAt = new Date().toISOString()
    const embedded: Array<{
      id: string
      originalName: string
      mimeType: string
      contentBase64: string
    }> = []
    let embeddedBudget = MAX_MANIFEST_BYTES - 200_000

    for (const f of files) {
      if (!f.size || f.size > MAX_EMBED_BYTES) continue
      if (embeddedBudget < f.size * 1.4) break
      try {
        const hit = await readWorkspaceFile(scopeId, f.id)
        if (hit.buffer.length > MAX_EMBED_BYTES) continue
        const b64 = hit.buffer.toString('base64')
        embeddedBudget -= b64.length
        if (embeddedBudget < 0) break
        embedded.push({
          id: f.id,
          originalName: hit.meta.originalName,
          mimeType: hit.meta.mimeType,
          contentBase64: b64,
        })
      } catch {
        /* skip unreadable */
      }
    }

    const manifest = {
      kind: 'arabic-buzz-vault-backup',
      version: 1,
      scopeId,
      generatedAt,
      generatedAtAr: new Intl.DateTimeFormat('ar-SA', {
        timeZone: 'Asia/Riyadh',
        dateStyle: 'full',
        timeStyle: 'short',
      }).format(new Date()),
      noteAr:
        'نسخة احتياطية مجدولة لفهرس أرشيف ملفات الفريق. الملفات الصغيرة مضمّنة عند الإمكان؛ الأكبر تبقى في الخزنة. تنظيف الشات لا يحذف الأرشيف.',
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
        tags: f.tags || [],
      })),
      embeddedFileCount: embedded.length,
      embedded,
    }

    const body = Buffer.from(JSON.stringify(manifest), 'utf8')
    const name = `vault-backup-${scopeId}-${dayStamp()}.json`
    const saved = await saveWorkspaceFile({
      scopeId,
      buffer: body,
      originalName: name,
      mimeType: 'application/json',
    })

    await withPrismaFallback(
      () =>
        prisma.cronLog.create({
          data: {
            id: `vault-bak-${scopeId}-${Date.now()}`,
            taskId: `vault-backup-${scopeId}`,
            taskNameAr: `نسخ أرشيف ${scopeId}`,
            channel: 'vault',
            status: 'success',
            details: `files=${files.length} embedded=${embedded.length} id=${saved.file.id}`,
          },
        }),
      null
    )

    return {
      scopeId,
      ok: true,
      fileCount: files.length,
      embeddedFiles: embedded.length,
      manifestFileId: saved.file.id,
    }
  } catch (e) {
    return {
      scopeId,
      ok: false,
      fileCount: 0,
      embeddedFiles: 0,
      error: e instanceof Error ? e.message : 'backup failed',
    }
  }
}

/**
 * Run at most once per Riyadh day per scope (cron hits every 15m).
 * Pass force=true from workflow_dispatch / manual API if needed.
 */
export async function runScheduledVaultBackups(opts?: {
  force?: boolean
}): Promise<{
  ok: boolean
  skipped?: boolean
  reason?: string
  scopes: VaultBackupScopeResult[]
}> {
  const stamp = dayStamp()
  const scopeIds = new Set<string>([
    PRIMARY_TEAM_SCOPE_ID,
    ...DEMO_SCOPES.filter(isSharedScope).map((s) => s.id),
  ])

  const scopes: VaultBackupScopeResult[] = []
  for (const id of scopeIds) {
    if (!opts?.force) {
      const existing = await listWorkspaceFilesAllSources(id)
      const already = existing.some((f) =>
        new RegExp(`^vault-backup-${id}-${stamp}\\.json$`, 'i').test(
          f.originalName || ''
        )
      )
      if (already) {
        scopes.push({
          scopeId: id,
          ok: true,
          fileCount: existing.length,
          embeddedFiles: 0,
          error: 'skipped_already_today',
        })
        continue
      }
    }
    scopes.push(await backupOneScope(id))
  }

  const ran = scopes.some((s) => s.ok && s.error !== 'skipped_already_today')
  return {
    ok: scopes.every((s) => s.ok),
    skipped: !ran,
    reason: ran ? undefined : 'already_backed_up_today',
    scopes,
  }
}
