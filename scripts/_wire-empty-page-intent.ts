/**
 * Wire corrected «صفحة فاضية» intent to Telegram group + job queue.
 * Does NOT edit/send the PDF — bot/agents/cron pipeline executes after deploy.
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })
import { createClient } from '@supabase/supabase-js'
import { inferPdfDuplicateWorkParams } from '@/lib/telegram/file-jobs'

const JOB = '96dee180-e828-49db-a2df-0d3a411e90a6'
const GROUP = '-1003855925966'

const REQUEST_AR = [
  'تصحيح المهمة للوكلاء (@alhuda14bot / وكيل١–٨):',
  'في ملف «المعلم الأول من معالم من السيرة النبوية»:',
  '١) ابحث عن صفحة فاضية موجودة في الملف (بلا كتابة/محتوى نصي — ليست اختراع صفحة بيضاء).',
  '٢) انسخ تلك الصفحة الفاضية وضع النسخة بعد الصفحة 45.',
  '٣) أرسل الملف الناتج بـ sendDocument للمجموعة.',
  'ممنوع: نسخ محتوى الصفحة 48. ممنوع: pdf_insert_blank_page / mode=blank إلا إن طُلبت صفحة بيضاء مخترعة صراحة.',
  'الأداة: pdf_duplicate_page مع findEmptyPage=true و afterPage=45 ثم return_file.',
].join('\n')

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing')

  const inferred = inferPdfDuplicateWorkParams(REQUEST_AR)
  console.log('inferred', JSON.stringify(inferred))
  if (!inferred?.findEmptyPage || inferred.afterPage !== 45) {
    throw new Error('intent parse failed — refuse to wire wrong job')
  }

  const send = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: GROUP,
      text: REQUEST_AR.slice(0, 3900),
    }),
  }).then((r) => r.json())
  console.log(
    'message_sent',
    Boolean(send.ok),
    send.ok ? send.result?.message_id : String(send.description || '').slice(0, 160)
  )

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('supabase missing')
  const sb = createClient(url, key, { auth: { persistSession: false } })

  const { data: before } = await sb
    .from('telegram_file_jobs')
    .select('id,status,vault_file_id,telegram_file_id,expected_filename')
    .eq('id', JOB)
    .maybeSingle()
  console.log('job_before', JSON.stringify(before))

  const { error } = await sb
    .from('telegram_file_jobs')
    .update({
      status: before?.vault_file_id ? 'pending' : 'waiting_file',
      request_text: REQUEST_AR,
      work_params: {
        findEmptyPage: true,
        afterPage: 45,
        aliases: [
          'المعلم الاول',
          'المعلم الأول',
          'المعلم الأول من معالم من السيرة النبوية',
          'المعلم الاول من معالم من السيرة النبوية',
        ],
      },
      last_error_ar: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', JOB)
  if (error) throw new Error(error.message)
  console.log('job_updated', true)

  // Kick live cron (product pipeline) — only useful AFTER this fix is deployed.
  const cronSecret = process.env.CRON_SECRET || ''
  const kickCron = process.env.KICK_CRON === '1'
  if (kickCron && cronSecret && cronSecret !== 'change-me') {
    const res = await fetch(
      'https://arabicbuzz-fooc9h.cranl.net/api/crons/runner',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cronSecret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(120_000),
      }
    )
    const body = await res.json().catch(() => ({}))
    console.log(
      'cron_kick',
      res.status,
      JSON.stringify({
        telegramFileJobs: (body as { telegramFileJobs?: unknown })
          .telegramFileJobs,
        archivePending: (
          body as { telegramGroupArchive?: { pendingPdf?: unknown } }
        ).telegramGroupArchive,
      }).slice(0, 900)
    )
  } else {
    console.log('cron_kick_skipped', kickCron ? 'no CRON_SECRET' : 'set KICK_CRON=1 after deploy')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
