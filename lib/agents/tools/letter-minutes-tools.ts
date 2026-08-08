/**
 * Letter templates + minutes-from-thread for agents / Telegram.
 */

import {
  getLetterTemplate,
  LETTER_TEMPLATES,
} from '@/lib/documents/letter-templates'
import {
  buildDocumentBuffer,
  extensionForFormat,
  type DocFormat,
} from '@/lib/documents/build'
import { saveWorkspaceFile } from '@/lib/documents/workspace'
import { listRoomPosts, insertRoomPost } from '@/lib/rooms/persist'
import { isNoiseRoomPost } from '@/lib/rooms/noise'

export async function executeListLetterTemplates() {
  return {
    ok: true,
    templates: LETTER_TEMPLATES.map((t) => ({
      id: t.id,
      titleAr: t.titleAr,
      descriptionAr: t.descriptionAr,
      fields: t.fields.map((f) => ({
        key: f.key,
        labelAr: f.labelAr,
        multiline: Boolean(f.multiline),
      })),
    })),
    messageAr:
      'قوالب الخطابات جاهزة. استخدم letter_fill_template مع templateId والقيم.',
  }
}

export async function executeLetterFillTemplate(
  _name: string,
  params: Record<string, unknown>
) {
  const template = getLetterTemplate(String(params.templateId || ''))
  if (!template) {
    throw new Error(
      `قالب غير معروف. المتاح: ${LETTER_TEMPLATES.map((t) => t.id).join(', ')}`
    )
  }
  const valuesRaw = params.values
  const values: Record<string, string> = {}
  if (valuesRaw && typeof valuesRaw === 'object' && !Array.isArray(valuesRaw)) {
    for (const [k, v] of Object.entries(valuesRaw as Record<string, unknown>)) {
      values[k] = String(v ?? '')
    }
  }
  // Flat params fallback (agent may pass fields at top level)
  for (const f of template.fields) {
    if (!values[f.key] && params[f.key] != null) {
      values[f.key] = String(params[f.key])
    }
  }

  const format: DocFormat =
    params.format === 'pdf' || params.format === 'docx'
      ? (params.format as DocFormat)
      : 'docx'
  const built = template.buildBody(values)
  const builtDoc = await buildDocumentBuffer({
    format,
    title: built.title,
    paragraphs: built.paragraphs,
  })
  const scopeId = String(params.scopeId || 'shared-demo')
  const filename = `${template.titleAr.replace(/\s+/g, '_')}${extensionForFormat(format)}`
  const saveToRoom = params.saveToRoom !== false

  let fileId: string | undefined
  let downloadPath: string | undefined
  if (saveToRoom) {
    const saved = await saveWorkspaceFile({
      scopeId,
      buffer: builtDoc.buffer,
      originalName: filename,
      mimeType: builtDoc.mimeType,
      markEdited: true,
    })
    fileId = saved.file.id
    downloadPath = `/api/storage/file?id=${encodeURIComponent(saved.file.id)}&scopeId=${encodeURIComponent(scopeId)}`
  }

  return {
    ok: true,
    templateId: template.id,
    titleAr: built.title,
    filename,
    fileId,
    downloadPath,
    attachments: fileId
      ? [
          {
            fileId,
            name: filename,
            mimeType: builtDoc.mimeType,
            scopeId,
            downloadPath,
          },
        ]
      : [],
    previewParagraphs: built.paragraphs.slice(0, 6),
    messageAr: fileId
      ? `تم إنشاء «${template.titleAr}» وحفظه في ملفات الغرفة — أرسله بـ return_file أو send_file.`
      : `تم إنشاء «${template.titleAr}».`,
  }
}

export async function executeMinutesFromThread(
  _name: string,
  params: Record<string, unknown>
) {
  const scopeId = String(params.scopeId || 'shared-demo')
  const limit = Math.min(
    Math.max(Number(params.limit) || 40, 8),
    80
  )
  const listed = await listRoomPosts(scopeId, limit)
  const posts = (listed.posts || []).filter(
    (p) =>
      !isNoiseRoomPost(p.content) &&
      p.content.trim().length > 0 &&
      p.authorKind !== 'system'
  )

  if (posts.length < 2) {
    throw new Error(
      'لا يوجد نقاش كافٍ في الغرفة لتوليد محضر. اكتبوا في الغرفة أولاً ثم أعد المحاولة.'
    )
  }

  const threadText = posts
    .slice(-limit)
    .map((p) => `${p.authorNameAr}: ${p.content}`)
    .join('\n')
    .slice(0, 12000)

  const prompt = [
    'أنت أمين سر اجتماعات لجمعية سعودية. حوّل نقاش الغرفة التالي إلى محضر رسمي بالفصحى.',
    'أقسام إلزامية: الملخص التنفيذي · الحضور المستنتج بحذر · القرارات · المهام (المسؤول · الموعد إن وُجد) · البنود المفتوحة.',
    'لا تخترع قرارات أو أسماء غير مذكورة. إن غاب معلومة اكتب «غير مذكور».',
    '',
    '--- نقاش الغرفة ---',
    threadText,
  ].join('\n')

  let minutes = ''
  try {
    const { generateText } = await import('ai')
    const { getHarnessModel } = await import('@/lib/ai/router')
    const result = await generateText({
      model: getHarnessModel(
        process.env.DEFAULT_MODEL ||
          process.env.HERMES_MODEL ||
          'gemini-3.1-pro'
      ),
      prompt,
      maxOutputTokens: 2500,
    })
    minutes = String(result.text || '').trim()
  } catch (e) {
    minutes = [
      '# محضر اجتماع (مسودة من نقاش الغرفة)',
      '',
      '## الملخص التنفيذي',
      'ملخص آلي من آخر رسائل الغرفة — يُراجع يدوياً.',
      '',
      '## مقتطفات من النقاش',
      ...posts
        .slice(-12)
        .map((p) => `- **${p.authorNameAr}:** ${p.content.slice(0, 240)}`),
      '',
      '## القرارات',
      '- غير مذكور بوضوح — راجع النص أعلاه.',
      '',
      '## المهام',
      '- غير مذكور بوضوح.',
      '',
      `ملاحظة: فشل التوليد الذكي (${e instanceof Error ? e.message : 'خطأ'}) فاستُخدم ملخصاً هيكلياً.`,
    ].join('\n')
  }

  if (!minutes) throw new Error('فشل توليد المحضر')

  const titleAr =
    String(params.titleAr || '').trim() ||
    `محضر من الغرفة — ${new Date().toLocaleDateString('ar-SA', {
      timeZone: 'Asia/Riyadh',
    })}`

  const authorId = String(params.userId || 'telegram-agent')
  await insertRoomPost({
    scopeId,
    authorKind: 'agent',
    authorId,
    authorNameAr: 'محضر الغرفة',
    content: `📋 ${titleAr}\n\n${minutes.slice(0, 6000)}`,
    postKind: 'minutes',
  }).catch(() => null)

  let fileId: string | undefined
  let filename: string | undefined
  let downloadPath: string | undefined
  if (params.saveDocx !== false) {
    const builtDoc = await buildDocumentBuffer({
      format: 'docx',
      title: titleAr,
      body: minutes,
    })
    filename = `${titleAr.replace(/[^\u0600-\u06FFa-zA-Z0-9-_]+/g, '_').slice(0, 60)}.docx`
    const saved = await saveWorkspaceFile({
      scopeId,
      buffer: builtDoc.buffer,
      originalName: filename,
      mimeType: builtDoc.mimeType,
      markEdited: true,
    })
    fileId = saved.file.id
    downloadPath = `/api/storage/file?id=${encodeURIComponent(saved.file.id)}&scopeId=${encodeURIComponent(scopeId)}`
  }

  return {
    ok: true,
    titleAr,
    minutesPreview: minutes.slice(0, 1500),
    fileId,
    filename,
    downloadPath,
    attachments: fileId
      ? [
          {
            fileId,
            name: filename!,
            mimeType:
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            scopeId,
            downloadPath,
          },
        ]
      : [],
    messageAr: fileId
      ? 'تم توليد المحضر وحفظه كملف Word — أرسله للمستخدم بـ return_file.'
      : 'تم توليد المحضر.',
  }
}
