import { NextRequest, NextResponse } from 'next/server'
import { requireSessionUser, requireRealUser } from '@/lib/auth/session'
import { listGoogleAccounts } from '@/lib/google/tokens'
import {
  applyGmailLabel,
  downloadGmailAttachment,
  ensureGmailLabel,
  getGmailProfile,
  listGmailLabels,
  listGmailMailbox,
  markGmailRead,
  readGmailMessage,
  replyGmailMessage,
  searchGmailAttachments,
  searchGmailMessages,
  sendGmailMessage,
  snoozeGmailMessage,
  starGmailMessage,
} from '@/lib/google/gmail'
import { analyzePersonalGmailMessage } from '@/lib/email/personal-mail-intel'
import {
  cancelMailEnergyJob,
  insertMailEnergyJob,
  listPendingMailEnergyForUser,
} from '@/lib/email/mail-energy-store'
import { PERSONAL_DESK_COPY } from '@/lib/scopes/personal-desk'
import { warmProviderKeyCache } from '@/lib/ai/provider-key-store'

export const dynamic = 'force-dynamic'

/**
 * Personal Gmail API — caller's mailbox only (never org IMAP info@).
 *
 * GET: connection + inbox list (folder / q / pageToken)
 * POST actions: get | search | attachments | download_attachment | analyze |
 *   send | reply | mark | star | snooze | schedule_send | remind | labels |
 *   apply_label | energy_list | energy_cancel
 */
export async function GET(req: NextRequest) {
  const auth = await requireSessionUser(req)
  if (!auth.ok) return auth.response

  const accounts = await listGoogleAccounts(auth.user.id)
  const emails = accounts.map((a) => a.email).filter(Boolean) as string[]
  const accountEmail =
    req.nextUrl.searchParams.get('accountEmail')?.trim().toLowerCase() ||
    emails[0] ||
    null

  if (accounts.length === 0) {
    return NextResponse.json({
      connected: false,
      unread: 0,
      messages: [],
      emails: [],
      email: null,
      hintAr: PERSONAL_DESK_COPY.mailOrgVsPersonalAr,
      messageAr:
        'اربط بريدك في Google لعرض الوارد والبحث والردود الذكية — منفصل تماماً عن بريد الجمعية.',
      connectLabelAr: 'اربط بريدي في Google',
    })
  }

  const folder =
    req.nextUrl.searchParams.get('folder')?.trim().toUpperCase() || 'INBOX'
  const q = req.nextUrl.searchParams.get('q')?.trim() || ''
  const pageToken = req.nextUrl.searchParams.get('pageToken') || null
  const limit = Math.min(
    Math.max(Number(req.nextUrl.searchParams.get('limit') || 40) || 40, 1),
    50
  )

  try {
    const [list, profile] = await Promise.all([
      listGmailMailbox(auth.user.id, {
        folder,
        query: q || undefined,
        maxResults: limit,
        pageToken,
        accountEmail,
      }),
      getGmailProfile(auth.user.id, { accountEmail }).catch(() => null),
    ])

    const unreadGuess = list.messages.filter((m) => m.unread).length

    return NextResponse.json({
      connected: true,
      unread: unreadGuess,
      messages: list.messages,
      nextPageToken: list.nextPageToken || null,
      resultSizeEstimate: list.resultSizeEstimate,
      emails,
      email: profile?.emailAddress || accountEmail || emails[0] || null,
      folder,
      query: q,
      messagesTotal: profile?.messagesTotal,
      hintAr: PERSONAL_DESK_COPY.mailOrgVsPersonalAr,
      messageAr: `بريدك الشخصي (${profile?.emailAddress || emails[0] || 'Gmail'}) — خاص بك وحدك، غير مرئي للموظفين الآخرين.`,
      scopesHintAr:
        'إن فشل النجمة/تعليم كمقروء: أعد الربط لمنح gmail.modify. للإرسال: gmail.send.',
    })
  } catch (e) {
    return NextResponse.json({
      connected: true,
      unread: 0,
      messages: [],
      emails,
      email: accountEmail || emails[0] || null,
      hintAr: PERSONAL_DESK_COPY.mailOrgVsPersonalAr,
      warningAr:
        e instanceof Error
          ? e.message
          : 'تعذّر قراءة الوارد — أعد ربط Google بصلاحيات Gmail (readonly / send / modify).',
      needsReconsent: true,
    })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRealUser(req)
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as {
    action?: string
    messageId?: string
    attachmentId?: string
    query?: string
    q?: string
    folder?: string
    to?: string
    subject?: string
    bodyText?: string
    bodyHtml?: string
    cc?: string
    bcc?: string
    replyAll?: boolean
    unread?: boolean
    starred?: boolean
    accountEmail?: string
    maxResults?: number
    pageToken?: string
    /** ISO datetime or relative minutes (number) */
    until?: string
    minutes?: number
    hours?: number
    noteAr?: string
    labelId?: string
    labelName?: string
    add?: boolean
    jobId?: string
    notifyTelegram?: boolean
  }

  const accounts = await listGoogleAccounts(auth.user.id)
  if (!accounts.length) {
    return NextResponse.json(
      {
        error: 'اربط بريدك في Google أولاً من «بريدي الشخصي».',
        needsGoogle: true,
        connectLabelAr: 'اربط بريدي في Google',
      },
      { status: 400 }
    )
  }

  const accountEmail =
    body.accountEmail?.trim().toLowerCase() ||
    accounts[0]?.email ||
    null
  const action = String(body.action || '').trim()

  try {
    switch (action) {
      case 'get': {
        const messageId = String(body.messageId || '').trim()
        if (!messageId) {
          return NextResponse.json({ error: 'مرّر messageId' }, { status: 400 })
        }
        const message = await readGmailMessage(auth.user.id, messageId, {
          accountEmail,
        })
        // Best-effort mark read (needs gmail.modify)
        if (message.unread) {
          try {
            await markGmailRead(auth.user.id, messageId, { accountEmail })
            message.unread = false
          } catch {
            /* scope may lack modify */
          }
        }
        return NextResponse.json({ ok: true, message })
      }

      case 'list':
      case 'search': {
        const query =
          String(body.query || body.q || '').trim() ||
          (body.folder ? undefined : 'in:inbox')
        const result = await listGmailMailbox(auth.user.id, {
          folder: body.folder || (query ? 'ALL' : 'INBOX'),
          query,
          maxResults: body.maxResults,
          pageToken: body.pageToken,
          accountEmail,
        })
        return NextResponse.json({
          ok: true,
          ...result,
          messageAr:
            result.messages.length === 0
              ? 'لا نتائج.'
              : `وُجد ${result.messages.length} رسالة.`,
        })
      }

      case 'attachments': {
        const query = String(body.query || body.q || '').trim()
        const hits = await searchGmailAttachments(auth.user.id, {
          query,
          maxResults: body.maxResults || 12,
          accountEmail,
        })
        return NextResponse.json({
          ok: true,
          count: hits.length,
          messages: hits,
          messageAr:
            hits.length === 0
              ? 'لا مرفقات مطابقة.'
              : `وُجد ${hits.length} رسالة بمرفقات.`,
        })
      }

      case 'analyze':
      case 'draft_assist': {
        const messageId = String(body.messageId || '').trim()
        if (!messageId) {
          return NextResponse.json({ error: 'مرّر messageId' }, { status: 400 })
        }
        await warmProviderKeyCache().catch(() => null)
        const result = await analyzePersonalGmailMessage(
          auth.user.id,
          messageId,
          { accountEmail }
        )
        return NextResponse.json({
          ...result,
          ok: true,
          draft: {
            subject: result.intel.draftSubject,
            bodyAr: result.intel.draftBody,
            inReplyTo: result.message.id,
            fromOriginal: result.message.from,
          },
        })
      }

      case 'send': {
        const to = String(body.to || '').trim()
        const subject = String(body.subject || '').trim()
        const result = await sendGmailMessage(auth.user.id, {
          to,
          subject,
          bodyText: body.bodyText,
          bodyHtml: body.bodyHtml,
          cc: body.cc,
          bcc: body.bcc,
          accountEmail,
        })
        return NextResponse.json({
          ok: true,
          ...result,
          messageAr: `أُرسلت الرسالة إلى ${to}`,
        })
      }

      case 'reply': {
        const messageId = String(body.messageId || '').trim()
        if (!messageId) {
          return NextResponse.json({ error: 'مرّر messageId' }, { status: 400 })
        }
        const result = await replyGmailMessage(auth.user.id, {
          messageId,
          bodyText: body.bodyText,
          bodyHtml: body.bodyHtml,
          replyAll: body.replyAll === true,
          subject: body.subject,
          accountEmail,
        })
        return NextResponse.json({
          ok: true,
          ...result,
          messageAr: 'أُرسل الرد عبر Gmail.',
        })
      }

      case 'mark': {
        const messageId = String(body.messageId || '').trim()
        if (!messageId) {
          return NextResponse.json({ error: 'مرّر messageId' }, { status: 400 })
        }
        const message = await markGmailRead(auth.user.id, messageId, {
          unread: body.unread === true,
          accountEmail,
        })
        return NextResponse.json({ ok: true, message })
      }

      case 'star': {
        const messageId = String(body.messageId || '').trim()
        if (!messageId) {
          return NextResponse.json({ error: 'مرّر messageId' }, { status: 400 })
        }
        const message = await starGmailMessage(auth.user.id, messageId, {
          starred: body.starred !== false,
          accountEmail,
        })
        return NextResponse.json({ ok: true, message })
      }

      case 'download_attachment': {
        const messageId = String(body.messageId || '').trim()
        const attachmentId = String(body.attachmentId || '').trim()
        if (!messageId || !attachmentId) {
          return NextResponse.json(
            { error: 'مرّر messageId و attachmentId' },
            { status: 400 }
          )
        }
        const detail = await readGmailMessage(auth.user.id, messageId, {
          accountEmail,
        })
        const meta = detail.attachments.find(
          (a) => a.attachmentId === attachmentId
        )
        const { data, size } = await downloadGmailAttachment(
          auth.user.id,
          messageId,
          attachmentId,
          { accountEmail }
        )
        const filename = meta?.filename || 'attachment.bin'
        const mimeType = meta?.mimeType || 'application/octet-stream'
        return new NextResponse(new Uint8Array(data), {
          status: 200,
          headers: {
            'Content-Type': mimeType,
            'Content-Length': String(size),
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
            'Cache-Control': 'private, no-store',
          },
        })
      }

      case 'snooze': {
        const messageId = String(body.messageId || '').trim()
        if (!messageId) {
          return NextResponse.json({ error: 'مرّر messageId' }, { status: 400 })
        }
        const dueAt = resolveDueAt(body)
        if (!dueAt || dueAt.getTime() <= Date.now() + 60_000) {
          return NextResponse.json(
            { error: 'حدّد وقت تأجيل لاحقاً (دقائق/ساعات أو until ISO).' },
            { status: 400 }
          )
        }
        const msg = await readGmailMessage(auth.user.id, messageId, {
          accountEmail,
        }).catch(() => null)
        const { message, snoozeLabelId } = await snoozeGmailMessage(
          auth.user.id,
          messageId,
          { accountEmail }
        )
        const job = await insertMailEnergyJob({
          userId: auth.user.id,
          accountEmail,
          kind: 'snooze',
          messageId,
          subject: msg?.subject || message.subject || null,
          dueAt,
          payload: { snoozeLabelId, messageId },
        })
        return NextResponse.json({
          ok: true,
          message,
          job,
          messageAr: `أُجّلت الرسالة حتى ${dueAt.toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`,
        })
      }

      case 'schedule_send': {
        const to = String(body.to || '').trim()
        const subject = String(body.subject || '').trim()
        const bodyText = String(body.bodyText || '').trim()
        const bodyHtml = body.bodyHtml ? String(body.bodyHtml).trim() : ''
        if (!to || !subject || (!bodyText && !bodyHtml)) {
          return NextResponse.json(
            { error: 'مرّر to و subject ونص الرسالة للجدولة.' },
            { status: 400 }
          )
        }
        const dueAt = resolveDueAt(body)
        if (!dueAt || dueAt.getTime() <= Date.now() + 60_000) {
          return NextResponse.json(
            { error: 'حدّد وقت إرسال لاحقاً.' },
            { status: 400 }
          )
        }
        const job = await insertMailEnergyJob({
          userId: auth.user.id,
          accountEmail,
          kind: 'schedule_send',
          subject,
          dueAt,
          payload: {
            to,
            subject,
            bodyText,
            bodyHtml: bodyHtml || undefined,
            cc: body.cc,
            bcc: body.bcc,
          },
        })
        return NextResponse.json({
          ok: true,
          job,
          messageAr: `جُدول الإرسال إلى ${to} عند ${dueAt.toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`,
        })
      }

      case 'remind': {
        const messageId = String(body.messageId || '').trim()
        if (!messageId) {
          return NextResponse.json({ error: 'مرّر messageId' }, { status: 400 })
        }
        const dueAt = resolveDueAt(body)
        if (!dueAt || dueAt.getTime() <= Date.now() + 30_000) {
          return NextResponse.json(
            { error: 'حدّد وقت تذكير لاحقاً.' },
            { status: 400 }
          )
        }
        const msg = await readGmailMessage(auth.user.id, messageId, {
          accountEmail,
        }).catch(() => null)
        const job = await insertMailEnergyJob({
          userId: auth.user.id,
          accountEmail,
          kind: 'reminder',
          messageId,
          subject: msg?.subject || null,
          dueAt,
          payload: {
            messageId,
            noteAr: body.noteAr || 'حان وقت متابعة هذه الرسالة.',
          },
        })
        return NextResponse.json({
          ok: true,
          job,
          messageAr: `سيُرسل تذكير عند ${dueAt.toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`,
        })
      }

      case 'labels': {
        const labels = await listGmailLabels(auth.user.id, { accountEmail })
        return NextResponse.json({ ok: true, labels })
      }

      case 'apply_label': {
        const messageId = String(body.messageId || '').trim()
        let labelId = String(body.labelId || '').trim()
        const labelName = String(body.labelName || '').trim()
        if (!messageId) {
          return NextResponse.json({ error: 'مرّر messageId' }, { status: 400 })
        }
        if (!labelId && labelName) {
          const created = await ensureGmailLabel(auth.user.id, labelName, {
            accountEmail,
          })
          labelId = created.id
        }
        if (!labelId) {
          return NextResponse.json(
            { error: 'مرّر labelId أو labelName' },
            { status: 400 }
          )
        }
        const message = await applyGmailLabel(auth.user.id, messageId, {
          labelId,
          add: body.add !== false,
          accountEmail,
        })
        return NextResponse.json({ ok: true, message, labelId })
      }

      case 'energy_list': {
        const jobs = await listPendingMailEnergyForUser(auth.user.id)
        return NextResponse.json({ ok: true, jobs })
      }

      case 'energy_cancel': {
        const jobId = String(body.jobId || '').trim()
        if (!jobId) {
          return NextResponse.json({ error: 'مرّر jobId' }, { status: 400 })
        }
        await cancelMailEnergyJob(jobId, auth.user.id)
        return NextResponse.json({
          ok: true,
          messageAr: 'أُلغيت المهمة المجدولة.',
        })
      }

      case 'search_messages': {
        // Free-text across whole mailbox
        const query = String(body.query || body.q || '').trim()
        if (!query) {
          return NextResponse.json({ error: 'مرّر query' }, { status: 400 })
        }
        const result = await searchGmailMessages(auth.user.id, {
          query,
          maxResults: body.maxResults || 25,
          pageToken: body.pageToken,
          accountEmail,
        })
        return NextResponse.json({
          ok: true,
          ...result,
          messageAr: `بحث في كل البريد: ${result.messages.length} نتيجة.`,
        })
      }

      default:
        return NextResponse.json(
          {
            error:
              'إجراء غير معروف. المتاح: get, list, search, search_messages, attachments, download_attachment, analyze, send, reply, mark, star, snooze, schedule_send, remind, labels, apply_label, energy_list, energy_cancel',
          },
          { status: 400 }
        )
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'تعذّر تنفيذ الإجراء'
    const needsReconsent =
      /scope|صلاحية|insufficient|gmail\.(readonly|send|modify)/i.test(msg)
    return NextResponse.json(
      { error: msg, needsReconsent },
      { status: 500 }
    )
  }
}

function resolveDueAt(body: {
  until?: string
  minutes?: number
  hours?: number
}): Date | null {
  if (body.until) {
    const d = new Date(body.until)
    if (!Number.isNaN(d.getTime())) return d
  }
  const mins = Number(body.minutes || 0)
  const hours = Number(body.hours || 0)
  if (mins > 0 || hours > 0) {
    return new Date(Date.now() + (mins * 60_000 || 0) + (hours * 3_600_000 || 0))
  }
  return null
}
