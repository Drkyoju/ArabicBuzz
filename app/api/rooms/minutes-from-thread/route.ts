import { NextRequest, NextResponse } from 'next/server'
import { requireRealUser } from '@/lib/auth/session'
import { listRoomPosts, insertRoomPost } from '@/lib/rooms/persist'
import { displayNameFromUser } from '@/lib/auth/display-name'
import {
  buildDocumentBuffer,
} from '@/lib/documents/build'
import { saveCloudFile } from '@/lib/storage/cloud'
import { isLocalStorageEnabled, saveLocalFile } from '@/lib/storage/local'
import { isNoiseRoomPost } from '@/lib/rooms/noise'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Turn recent room thread into formal Arabic meeting minutes (Word + room post).
 */
export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as {
    scopeId?: string
    limit?: number
    titleAr?: string
    saveDocx?: boolean
  }
  const scopeId = String(body.scopeId || 'shared-demo')
  const limit = Math.min(Math.max(Number(body.limit) || 40, 8), 80)

  const { assertRoomCanEdit } = await import('@/lib/rooms/persist')
  const gate = await assertRoomCanEdit(scopeId, auth.user.id, auth.user.email)
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 403 })
  }

  const listed = await listRoomPosts(scopeId, limit)
  const posts = (listed.posts || []).filter(
    (p) =>
      !isNoiseRoomPost(p.content) &&
      p.content.trim().length > 0 &&
      p.authorKind !== 'system'
  )

  if (posts.length < 2) {
    return NextResponse.json(
      {
        error: 'لا يوجد نقاش كافٍ في الغرفة لتوليد محضر.',
        messageAr: 'اكتبوا في الغرفة أولاً ثم أعد المحاولة.',
      },
      { status: 400 }
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
        process.env.DEFAULT_MODEL || process.env.HERMES_MODEL || 'gemini-3.1-pro'
      ),
      prompt,
      maxOutputTokens: 2500,
    })
    minutes = String(result.text || '').trim()
  } catch (e) {
    // Fallback: structured extract without LLM
    minutes = [
      '# محضر اجتماع (مسودة من نقاش الغرفة)',
      '',
      '## الملخص التنفيذي',
      'ملخص آلي من آخر رسائل الغرفة — يُراجع يدوياً.',
      '',
      '## مقتطفات من النقاش',
      ...posts.slice(-12).map((p) => `- **${p.authorNameAr}:** ${p.content.slice(0, 240)}`),
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

  if (!minutes) {
    return NextResponse.json({ error: 'فشل توليد المحضر' }, { status: 500 })
  }

  const titleAr =
    String(body.titleAr || '').trim() ||
    `محضر من الغرفة — ${new Date().toLocaleDateString('ar-SA', { timeZone: 'Asia/Riyadh' })}`

  const post = await insertRoomPost({
    scopeId,
    authorKind: 'human',
    authorId: auth.user.id,
    authorNameAr: displayNameFromUser(auth.user),
    content: `📋 ${titleAr}\n\n${minutes.slice(0, 6000)}`,
    postKind: 'minutes',
  })

  let savedFileId: string | undefined
  let filename: string | undefined
  if (body.saveDocx !== false) {
    try {
      const builtDoc = await buildDocumentBuffer({
        format: 'docx',
        title: titleAr,
        body: minutes,
      })
      filename = `${titleAr.replace(/[^\u0600-\u06FFa-zA-Z0-9-_]+/g, '_').slice(0, 60)}.docx`
      const by = displayNameFromUser(auth.user)
      if (isLocalStorageEnabled()) {
        const f = saveLocalFile({
          scopeId,
          buffer: builtDoc.buffer,
          originalName: filename,
          mimeType: builtDoc.mimeType,
          markEdited: true,
          editedBy: by,
        })
        savedFileId = f.id
      } else {
        const f = await saveCloudFile({
          scopeId,
          buffer: builtDoc.buffer,
          originalName: filename,
          mimeType: builtDoc.mimeType,
          markEdited: true,
          editedBy: by,
        })
        if (f.ok) savedFileId = f.file.id
      }
    } catch {
      /* optional */
    }
  }

  return NextResponse.json({
    ok: true,
    titleAr,
    minutes,
    postId: post.post?.id,
    savedFileId,
    filename,
    messageAr: savedFileId
      ? 'تم توليد المحضر ووسمه وحفظه كملف Word في الغرفة.'
      : 'تم توليد المحضر ووسمه في الغرفة.',
  })
}
