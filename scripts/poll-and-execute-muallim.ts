import { config } from 'dotenv'
config({ path: '.env.local', override: true })
import { createClient } from '@supabase/supabase-js'
import { duplicatePdfPageAfter } from '@/lib/documents/pdf'
import {
  listWorkspaceFiles,
  readWorkspaceFile,
  saveWorkspaceFile,
} from '@/lib/documents/workspace'
import { matchMuallimSeerahFile } from '@/lib/files/muallim-seerah-match'
import { PDFDocument } from 'pdf-lib'

const CHAT = '-1003855925966'
const SCOPE = 'shared-demo'
const JOB = '96dee180-e828-49db-a2df-0d3a411e90a6'

async function sendMessage(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN!
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT, text: text.slice(0, 4000) }),
  })
  const j = await res.json()
  console.log('sendMessage', j.ok, j.description || '')
}

async function sendDoc(buffer: Buffer, filename: string, caption: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN!
  const form = new FormData()
  form.append('chat_id', CHAT)
  form.append('caption', caption.slice(0, 1000))
  form.append(
    'document',
    new Blob([new Uint8Array(buffer)], { type: 'application/pdf' }),
    filename
  )
  const res = await fetch(
    `https://api.telegram.org/bot${token}/sendDocument`,
    { method: 'POST', body: form }
  )
  const t = await res.text()
  if (!res.ok) throw new Error(t.slice(0, 400))
  console.log('sendDocument OK')
}

async function tryProcess(buffer: Buffer, sourceName: string) {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true })
  const pages = doc.getPageCount()
  console.log('pages', pages, sourceName)
  if (pages < 48) throw new Error(`أقل من 48 صفحة (${pages})`)
  const out = await duplicatePdfPageAfter({
    pdf: buffer,
    copyPage: 48,
    afterPage: 45,
  })
  const outName =
    sourceName.replace(/\.pdf$/i, '') + '_نسخ_صفحة48_بعد_45.pdf'
  const saved = await saveWorkspaceFile({
    scopeId: SCOPE,
    buffer: out.buffer,
    originalName: outName,
    mimeType: 'application/pdf',
    markEdited: true,
  })
  await sendDoc(
    out.buffer,
    outName,
    `تم: نسخت الصفحة 48 بالكامل وأدرجتها بعد الصفحة 45 في «${sourceName}». الصفحات: ${out.pageCountBefore} → ${out.pageCountAfter}.`
  )
  const sb = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    { auth: { persistSession: false } }
  )
  await sb
    .from('telegram_file_jobs')
    .update({
      status: 'done',
      vault_file_id: saved.file.id,
      result_vault_file_id: saved.file.id,
      result_name: outName,
      expected_filename: sourceName,
      work_params: { copyPage: 48, afterPage: 45 },
      updated_at: new Date().toISOString(),
    })
    .eq('id', JOB)
  console.log('DONE', saved.file.id)
}

async function main() {
  const sb = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    { auth: { persistSession: false } }
  )

  // Update pending job aliases
  await sb
    .from('telegram_file_jobs')
    .update({
      expected_filename: 'المعلم الأول.pdf',
      request_text:
        'كرر صفحة 48 بعد 45 في المعلم الأول من معالم من السيرة النبوية',
      work_params: {
        copyPage: 48,
        afterPage: 45,
        aliases: [
          'المعلم الاول',
          'المعلم الأول',
          'المعلم الأول من معالم من السيرة النبوية',
          'المعلم الاول من معالم من السيرة النبوية',
        ],
      },
      status: 'waiting_file',
      updated_at: new Date().toISOString(),
    })
    .eq('id', JOB)

  // Poll vault / attachments up to ~90s
  const deadline = Date.now() + 90_000
  let announced = false
  while (Date.now() < deadline) {
    const { data: atts } = await sb
      .from('telegram_attachments')
      .select('*')
      .eq('chat_id', CHAT)
      .order('created_at', { ascending: false })
      .limit(10)

    for (const a of atts || []) {
      const name = String(a.file_name || '')
      if (!matchMuallimSeerahFile(name) && !/معلم|سيرة|معالم/i.test(name)) {
        continue
      }
      if (/أحياء|احياء/i.test(name)) continue
      if (a.has_bytes && a.vault_file_id) {
        const hit = await readWorkspaceFile(SCOPE, String(a.vault_file_id))
        await tryProcess(hit.buffer, hit.meta.originalName || name)
        return
      }
      if (a.telegram_file_id) {
        try {
          const token = process.env.TELEGRAM_BOT_TOKEN!
          const meta = await fetch(
            `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(String(a.telegram_file_id))}`
          ).then((r) => r.json())
          if (meta.ok && meta.result?.file_path) {
            const res = await fetch(
              `https://api.telegram.org/file/bot${token}/${meta.result.file_path}`
            )
            if (res.ok) {
              const buf = Buffer.from(await res.arrayBuffer())
              const saved = await saveWorkspaceFile({
                scopeId: SCOPE,
                buffer: buf,
                originalName: name.endsWith('.pdf') ? name : `${name}.pdf`,
                mimeType: 'application/pdf',
              })
              await tryProcess(buf, saved.file.originalName)
              return
            }
          }
          console.log('getFile', meta)
        } catch (e) {
          console.warn('tg dl', e)
        }
      }
    }

    const files = await listWorkspaceFiles(SCOPE)
    const hit = files.find((f) => matchMuallimSeerahFile(f.originalName))
    if (hit) {
      const file = await readWorkspaceFile(SCOPE, hit.id)
      await tryProcess(file.buffer, hit.originalName)
      return
    }

    // Any brand-new large PDF in last 3 minutes?
    const recent = files.filter((f) => {
      const t = f.createdAt ? Date.parse(f.createdAt) : 0
      return (
        t > Date.now() - 3 * 60 * 1000 &&
        /\.pdf$/i.test(f.originalName) &&
        (f.size || 0) > 500_000
      )
    })
    for (const r of recent) {
      if (/أحياء|STRESS|لائحة|التويمان/i.test(r.originalName)) continue
      try {
        const file = await readWorkspaceFile(SCOPE, r.id)
        const doc = await PDFDocument.load(file.buffer, {
          ignoreEncryption: true,
        })
        if (doc.getPageCount() >= 48) {
          console.log('recent large pdf', r.originalName, doc.getPageCount())
          await tryProcess(file.buffer, r.originalName)
          return
        }
      } catch {
        /* skip */
      }
    }

    if (!announced) {
      announced = true
      await sendMessage(
        [
          'وصلتُ لطلب نسخ صفحة 48 بعد 45 لـ«المعلم الأول» (السيرة النبوية — وليس دليل أحياء).',
          'الملف لم يصل بعد لبايتات التخزين (حد تنزيل بوت تيليجرام ≈20 م.ب أو لم يُحفظ وقت الاستلام).',
          'المهمة معلّقة وجاهزة: ارفع الملف مرة واحدة إلى ملفات غرفة الفريق على الموقع بنفس الاسم أو العنوان الكامل «المعلم الأول من معالم من السيرة النبوية» — وسأكمل تلقائياً وأرسل PDF هنا.',
          'https://arabicbuzz-fooc9h.cranl.net/',
        ].join('\n')
      )
    }

    await new Promise((r) => setTimeout(r, 5000))
    console.log('polling…', new Date().toISOString())
  }

  console.error('TIMEOUT: no bytes appeared in 90s')
  process.exit(2)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
