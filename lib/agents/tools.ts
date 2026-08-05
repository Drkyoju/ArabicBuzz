import { executeSearchKnowledgeBase } from '@/lib/agents/tools/rag-tool'
import {
  executeCalendarCreate,
  executeCalendarDelete,
  executeCalendarFindAlignment,
  executeCalendarFindDuplicates,
  executeCalendarList,
  executeCalendarScanEmail,
  executeCalendarUpdate,
} from '@/lib/agents/tools/calendar-tools'
import {
  executeRoomCalendarCancel,
  executeRoomCalendarCreate,
  executeRoomCalendarIngest,
  executeRoomCalendarList,
  executeRoomCalendarUpdate,
} from '@/lib/agents/tools/room-calendar-tools'
import {
  executeRoomMemoryAdd,
  executeRoomMemoryList,
  executeRoomTasksCreate,
  executeRoomTasksList,
  executeRoomTasksReconcile,
  executeRoomTasksUpdate,
} from '@/lib/agents/tools/room-collab-tools'
import {
  executeEditDocument,
  executeListFiles,
  executeListWorkspaceFiles,
  executeReadDocument,
  executeReadFile,
} from '@/lib/agents/tools/document-tools'
import { executeConvertDocument } from '@/lib/agents/tools/convert-document'
import {
  executeBrainOpenDocument,
  executeBrainSaveDocument,
} from '@/lib/agents/tools/drive-doc-tools'
import { executeFillPolicyAudit } from '@/lib/agents/tools/policy-audit'
import {
  executePdfCreate,
  executePdfFillForm,
  executePdfListFields,
  executePdfMerge,
  executePdfStamp,
} from '@/lib/agents/tools/pdf-tools'
import { syncDriveFolderToBrain } from '@/lib/google/drive-brain'
import {
  emitNotification,
  emitTelegramDocument,
} from '@/lib/notifications/emit'
import {
  deleteWorkspaceFile,
  readWorkspaceFile,
  saveWorkspaceFile,
} from '@/lib/documents/workspace'
import { executeBrowserTask } from '@/lib/tools/browser-rpa'
import { parseArabicDocument } from '@/lib/tools/arabic-ocr'
import { triggerExternalWorkflow } from '@/lib/tools/workflow-bridge'
import {
  executeWebFetch,
  executeWebSearch,
} from '@/lib/agents/tools/web-tools'
import { sendResendEmail } from '@/lib/email/resend'
import {
  ingestUrlToBrain,
  ingestUrlsToBrain,
} from '@/lib/tools/web-to-brain'
import { readDecisionDocument } from '@/lib/tools/decision-read'
import { reportRoomMembersAttendance } from '@/lib/rooms/association-reports'

export type ToolExecutor = (
  toolName: string,
  params: Record<string, unknown>
) => Promise<unknown>

const stubResults: Record<string, (params: Record<string, unknown>) => unknown> = {
  query_db_readonly: () => ({
    stub: true,
    messageAr: 'استعلام قاعدة البيانات التجريبي غير مفعّل.',
    rows: [],
  }),
  db_update: () => ({
    stub: true,
    ok: false,
    unavailable: true,
    messageAr:
      'db_update غير متاح عمداً — استخدم أدوات الملفات/التقويم المعتمدة مع موافقة بشرية.',
  }),
  db_insert: () => ({
    stub: true,
    ok: false,
    unavailable: true,
    messageAr: 'db_insert غير متاح عمداً في هذا المنتج.',
  }),
  db_delete: () => ({
    stub: true,
    ok: false,
    unavailable: true,
    messageAr: 'db_delete غير متاح عمداً في هذا المنتج.',
  }),
  delete_database: () => ({
    stub: true,
    ok: false,
    unavailable: true,
    messageAr: 'delete_database محظور — لن يُنفَّذ أبداً من الوكيل.',
  }),
  transfer_funds: () => ({
    stub: true,
    ok: false,
    unavailable: true,
    messageAr: 'transfer_funds غير مدعوم — لا تحويلات مالية عبر الوكيل.',
  }),
  change_user_roles: () => ({
    stub: true,
    ok: false,
    unavailable: true,
    messageAr: 'change_user_roles غير مدعوم — غيّر الأدوار من الإعدادات يدوياً.',
  }),
  text_generate: (p) => ({ text: String(p.prompt || '') }),
}

async function executeMemorySearch(
  _n: string,
  params: Record<string, unknown>
) {
  const query = String(params.query || params.q || '')
    .trim()
    .toLowerCase()
  const fromClient = Array.isArray(params.scopeMemory)
    ? (params.scopeMemory as unknown[]).map(String)
    : null
  const { DEMO_SCOPES, isPersonalScope, isSharedScope } = await import(
    '@/lib/scopes/manager'
  )
  const { listRoomMemories } = await import('@/lib/rooms/room-memory')
  const scopeId = String(params.scopeId || 'shared-demo')
  const scope = DEMO_SCOPES.find((s) => s.id === scopeId)
  const seeded = scope
    ? isPersonalScope(scope)
      ? scope.privateMemory
      : isSharedScope(scope)
        ? scope.sharedMemory
        : []
    : []
  let roomTexts: string[] = []
  try {
    roomTexts = (await listRoomMemories(scopeId)).map((m) => m.content)
  } catch {
    roomTexts = []
  }
  const pool = [
    ...new Set([
      ...(fromClient && fromClient.length ? fromClient : seeded),
      ...roomTexts,
    ]),
  ]
  const hits = !query
    ? pool.slice(0, 8).map((text, i) => ({ id: `m-${i}`, text, score: 1 }))
    : pool
        .map((text, i) => {
          const t = text.toLowerCase()
          const score = t.includes(query)
            ? 1
            : query.split(/\s+/).filter((w) => w.length > 2 && t.includes(w))
                .length * 0.25
          return { id: `m-${i}`, text, score }
        })
        .filter((h) => h.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
  return {
    query,
    count: hits.length,
    hits,
    messageAr:
      hits.length > 0
        ? `عُثر على ${hits.length} ذكرى (غرفة مشتركة + محلية)`
        : 'لا نتائج في ذاكرة الغرفة',
  }
}

export const toolRegistry: Record<string, ToolExecutor> = {
  ...Object.fromEntries(
    Object.entries(stubResults).map(([name, fn]) => [
      name,
      async (_n, params) => fn(params),
    ])
  ),
  memory_search: executeMemorySearch,
  list_files: executeListFiles,
  read_file: executeReadFile,
  list_workspace_files: executeListWorkspaceFiles,
  read_document: executeReadDocument,
  edit_document: executeEditDocument,
  convert_document: executeConvertDocument,
  brain_open_document: executeBrainOpenDocument,
  brain_save_document: executeBrainSaveDocument,
  fill_policy_audit: executeFillPolicyAudit,
  send_director_digest: async (_n, params) => {
    const { sendDirectorWeeklyDigest } = await import(
      '@/lib/digest/director-weekly'
    )
    const channels = Array.isArray(params.channels)
      ? (params.channels as Array<'email' | 'telegram'>)
      : undefined
    return sendDirectorWeeklyDigest({
      scopeId: String(params.scopeId || 'shared-demo'),
      toEmail: params.toEmail ? String(params.toEmail) : undefined,
      nameAr: params.nameAr ? String(params.nameAr) : undefined,
      channels,
    })
  },
  pdf_create: executePdfCreate,
  pdf_stamp: executePdfStamp,
  pdf_merge: executePdfMerge,
  pdf_list_fields: executePdfListFields,
  pdf_fill_form: executePdfFillForm,
  search_knowledge_base: executeSearchKnowledgeBase,
  calendar_list_events: executeCalendarList,
  calendar_create_event: executeCalendarCreate,
  calendar_update_event: executeCalendarUpdate,
  calendar_delete_event: executeCalendarDelete,
  calendar_scan_email: executeCalendarScanEmail,
  calendar_find_duplicates: executeCalendarFindDuplicates,
  calendar_find_alignment: executeCalendarFindAlignment,
  room_calendar_list: executeRoomCalendarList,
  room_calendar_create: executeRoomCalendarCreate,
  room_calendar_update: executeRoomCalendarUpdate,
  room_calendar_cancel: executeRoomCalendarCancel,
  room_calendar_ingest: executeRoomCalendarIngest,
  room_tasks_list: executeRoomTasksList,
  room_tasks_create: executeRoomTasksCreate,
  room_tasks_update: executeRoomTasksUpdate,
  room_tasks_reconcile: executeRoomTasksReconcile,
  room_memory_list: executeRoomMemoryList,
  room_memory_add: executeRoomMemoryAdd,
  web_search: executeWebSearch,
  web_fetch: executeWebFetch,
  drive_sync_brain: async (_n, params) => {
    const userId = String(params.userId || '')
    if (!userId || userId === 'local-owner') {
      throw new Error(
        'يلزم ربط Google من الإعدادات لمزامنة مجلد Drive إلى عقل الشركة.'
      )
    }
    return syncDriveFolderToBrain({
      userId,
      scopeId: String(params.scopeId || 'shared-demo'),
      folderId: params.folderId ? String(params.folderId) : undefined,
      maxFiles:
        typeof params.maxFiles === 'number' ? params.maxFiles : undefined,
    })
  },
  write_file: async (_n, params) => {
    const scopeId = String(params.scopeId || 'shared-demo')
    const name = String(
      params.name || params.filename || params.path || 'note.txt'
    ).trim()
    const content = String(params.content || params.text || '')
    if (!content) {
      throw new Error('يلزم content لكتابة الملف.')
    }
    const saved = await saveWorkspaceFile({
      scopeId,
      buffer: Buffer.from(content, 'utf8'),
      originalName: name,
      mimeType: String(params.mimeType || 'text/plain; charset=utf-8'),
      replaceId: params.fileId ? String(params.fileId) : undefined,
    })
    return {
      ok: true,
      fileId: saved.file.id,
      name: saved.file.originalName,
      source: saved.source,
      messageAr: `تم حفظ الملف «${saved.file.originalName}».`,
    }
  },
  delete_file: async (_n, params) => {
    const scopeId = String(params.scopeId || 'shared-demo')
    const fileId = String(params.fileId || params.id || '').trim()
    if (!fileId) throw new Error('يلزم fileId لحذف الملف.')
    return deleteWorkspaceFile(scopeId, fileId)
  },
  send_message: async (_n, params) => {
    const channel = String(params.channel || 'telegram') as
      | 'telegram'
      | 'whatsapp'
    if (channel !== 'telegram' && channel !== 'whatsapp') {
      throw new Error('القناة غير مدعومة. استخدم telegram أو whatsapp.')
    }
    const textAr = String(params.textAr || params.messageAr || params.text || '').trim()
    if (!textAr) {
      throw new Error('يلزم textAr لإرسال الرسالة.')
    }
    const to = params.to ? String(params.to) : undefined
    const sent = await emitNotification({ channel, textAr, to })
    return {
      ok: sent.ok,
      channel,
      to: to || null,
      messageAr: sent.ok
        ? 'تم إرسال الرسالة عبر القناة.'
        : 'تعذّر الإرسال. تحقق من إعدادات القناة والمستلم.',
    }
  },
  send_file: async (_n, params) => {
    const scopeId = String(params.scopeId || 'shared-demo')
    const fileId = String(params.fileId || '').trim()
    if (!fileId) throw new Error('يلزم fileId')
    const channel = String(params.channel || 'telegram') as
      | 'telegram'
      | 'email'
      | 'both'
    const file = await readWorkspaceFile(scopeId, fileId)
    const caption =
      String(params.captionAr || params.messageAr || '').trim() ||
      `ملف: ${file.meta.originalName}`
    const out: Record<string, unknown> = { file: file.meta }

    if (channel === 'telegram' || channel === 'both') {
      const tg = await emitTelegramDocument({
        buffer: file.buffer,
        filename: file.meta.originalName,
        captionAr: caption,
        meta: { scopeId },
        to: params.to ? String(params.to) : undefined,
      })
      out.telegram = tg
      if (!tg.ok && channel === 'telegram') {
        throw new Error(tg.error || 'تعذّر إرسال الملف لتيليجرام')
      }
    }
    if (channel === 'email' || channel === 'both') {
      const toEmail = String(params.toEmail || params.email || '').trim()
      if (!toEmail.includes('@')) {
        throw new Error('يلزم toEmail لإرسال المرفق بالبريد')
      }
      const mail = await sendResendEmail({
        to: toEmail,
        subject: caption.slice(0, 120),
        text: `${caption}\n\n— Arabic Buzz`,
        attachments: [
          {
            filename: file.meta.originalName,
            contentBase64: file.buffer.toString('base64'),
          },
        ],
      })
      out.email = mail
      if (!mail.ok && channel === 'email') {
        throw new Error(mail.error || 'تعذّر إرسال البريد')
      }
    }
    return {
      ok: true,
      ...out,
      messageAr: `أُرسل «${file.meta.originalName}» عبر ${channel}.`,
    }
  },
  browser_rpa: async (_n, params) => {
    return executeBrowserTask(
      String(params.taskPrompt || params.task || ''),
      String(params.targetUrl || params.url || '')
    )
  },
  ingest_url_to_brain: async (_n, params) => {
    const scopeId = String(params.scopeId || 'shared-demo')
    const urls = Array.isArray(params.urls)
      ? params.urls.map(String)
      : params.url
        ? [String(params.url)]
        : []
    if (urls.length > 1) {
      return ingestUrlsToBrain({
        scopeId,
        urls,
        titlePrefixAr: params.titleAr
          ? String(params.titleAr)
          : undefined,
      })
    }
    if (!urls[0]) throw new Error('يلزم url أو urls')
    return ingestUrlToBrain({
      scopeId,
      url: urls[0],
      titleAr: params.titleAr ? String(params.titleAr) : undefined,
    })
  },
  read_decision_document: async (_n, params) => {
    return readDecisionDocument({
      scopeId: String(params.scopeId || 'shared-demo'),
      fileId: params.fileId ? String(params.fileId) : undefined,
      fileUrl: params.fileUrl ? String(params.fileUrl) : undefined,
      contentBase64: params.contentBase64
        ? String(params.contentBase64)
        : undefined,
      titleAr: params.titleAr ? String(params.titleAr) : undefined,
      ingestToBrain: params.ingestToBrain !== false,
    })
  },
  report_room_attendance: async (_n, params) => {
    return reportRoomMembersAttendance({
      scopeId: String(params.scopeId || 'shared-demo'),
      days: params.days ? Number(params.days) : 14,
    })
  },
  arabic_ocr: async (_n, params) => {
    const src =
      params.fileUrl ||
      params.url ||
      params.contentBase64 ||
      params.buffer
    if (src == null || src === '') {
      throw new Error('يلزم fileUrl أو contentBase64 لمستند OCR.')
    }
    return parseArabicDocument(
      typeof src === 'string' ? src : Buffer.from(src as ArrayBuffer)
    )
  },
  trigger_workflow: async (_n, params) => {
    const workflowId = String(params.workflowId || params.id || '').trim()
    const payload =
      params.payload && typeof params.payload === 'object'
        ? (params.payload as Record<string, unknown>)
        : { ...params, workflowId: undefined, id: undefined, payload: undefined }
    return triggerExternalWorkflow(workflowId, payload)
  },
}

export function getToolExecutor(toolName: string): ToolExecutor {
  return (
    toolRegistry[toolName] ||
    (async () => {
      throw new Error(`Unknown tool: ${toolName}`)
    })
  )
}
