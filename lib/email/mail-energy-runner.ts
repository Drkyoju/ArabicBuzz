/**
 * Process due mail energy jobs (snooze wake, schedule send, reminders).
 * Called from crons/runner.
 */
import {
  listDueMailEnergyJobs,
  markMailEnergyDone,
  markMailEnergyFailed,
  type MailEnergyJob,
} from '@/lib/email/mail-energy-store'
import {
  sendGmailMessage,
  unsnoozeGmailMessage,
} from '@/lib/google/gmail'
import { emitNotification } from '@/lib/notifications/emit'

async function runOne(job: MailEnergyJob): Promise<{
  id: string
  kind: string
  status: 'done' | 'failed'
  error?: string
}> {
  try {
    if (job.kind === 'snooze') {
      const messageId = job.messageId || String(job.payload.messageId || '')
      if (!messageId) throw new Error('معرّف الرسالة مفقود للتأجيل')
      await unsnoozeGmailMessage(job.userId, messageId, {
        accountEmail: job.accountEmail,
        snoozeLabelId: String(job.payload.snoozeLabelId || '') || undefined,
      })
      await emitNotification({
        channel: 'telegram',
        textAr: [
          '⏰ انتهى التأجيل — عادت الرسالة للوارد',
          job.subject ? `الموضوع: ${job.subject}` : '',
          'افتح بريدي الشخصي في Arabic Buzz.',
        ]
          .filter(Boolean)
          .join('\n'),
        meta: { userId: job.userId },
      }).catch(() => null)
    } else if (job.kind === 'schedule_send') {
      const to = String(job.payload.to || '').trim()
      const subject = String(job.payload.subject || '').trim()
      const bodyText = String(job.payload.bodyText || '')
      const bodyHtml = job.payload.bodyHtml
        ? String(job.payload.bodyHtml)
        : undefined
      if (!to || !subject) throw new Error('بيانات الإرسال المجدول ناقصة')
      await sendGmailMessage(job.userId, {
        to,
        subject,
        bodyText: bodyText || undefined,
        bodyHtml,
        cc: job.payload.cc ? String(job.payload.cc) : undefined,
        bcc: job.payload.bcc ? String(job.payload.bcc) : undefined,
        accountEmail: job.accountEmail,
      })
      await emitNotification({
        channel: 'telegram',
        textAr: `✅ أُرسل البريد المجدول إلى ${to}\nالموضوع: ${subject}`,
        meta: { userId: job.userId },
      }).catch(() => null)
    } else if (job.kind === 'reminder') {
      const note = String(job.payload.noteAr || '').trim()
      await emitNotification({
        channel: 'telegram',
        textAr: [
          '🔔 تذكير بريد',
          job.subject ? `الموضوع: ${job.subject}` : '',
          note || 'حان وقت متابعة هذه الرسالة.',
          'افتح بريدي الشخصي في Arabic Buzz.',
        ]
          .filter(Boolean)
          .join('\n'),
        meta: { userId: job.userId },
      }).catch(() => null)
    } else {
      throw new Error(`نوع غير معروف: ${job.kind}`)
    }
    await markMailEnergyDone(job.id)
    return { id: job.id, kind: job.kind, status: 'done' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'فشل تنفيذ المهمة'
    await markMailEnergyFailed(job.id, msg)
    return { id: job.id, kind: job.kind, status: 'failed', error: msg }
  }
}

export async function runDueMailEnergyJobs(now = new Date()) {
  const due = await listDueMailEnergyJobs(now, 40)
  const results: Array<{
    id: string
    kind: string
    status: string
    error?: string
  }> = []
  for (const job of due) {
    results.push(await runOne(job))
  }
  return { processed: results.length, results }
}
