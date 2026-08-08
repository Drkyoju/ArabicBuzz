import {
  readGmailMessage,
  searchGmailMessages,
  sendGmailMessage,
} from '@/lib/google/gmail'
import {
  readSpreadsheetRange,
  writeSpreadsheetRange,
} from '@/lib/google/sheets'
import { isImapConfigured } from '@/lib/email/imap-store'

function requireUser(params: Record<string, unknown>) {
  const userId = String(params.userId || params._userId || '').trim()
  if (!userId || userId === 'engine' || userId === 'local-owner') {
    throw new Error(
      'يلزم تسجيل الدخول وربط Google من «نافذة البريد الشخصي» (أو تقويم الفريق) أولاً.'
    )
  }
  return userId
}

function accountEmailOf(params: Record<string, unknown>): string | undefined {
  const raw = params.accountEmail || params.email
  if (raw == null) return undefined
  const email = String(raw).trim().toLowerCase()
  return email.includes('@') ? email : undefined
}

/**
 * Personal Gmail tools — always the signed-in user's Google mailbox.
 * Do NOT fall back to org IMAP (بريد الجمعية); use mail_* for that.
 * If Google is not linked, return a clear CTA — never leak org mail into gmail_*.
 */
export async function executeGmailSearch(
  _name: string,
  params: Record<string, unknown>
) {
  const userId = requireUser(params)
  const query = String(params.query || params.q || '').trim()
  if (!query) {
    throw new Error('يلزم استعلام بحث (query) لـ Gmail الشخصي.')
  }
  const accountEmail = accountEmailOf(params)
  try {
    const { messages, resultSizeEstimate } = await searchGmailMessages(
      userId,
      {
        query,
        maxResults:
          typeof params.maxResults === 'number' ? params.maxResults : undefined,
        accountEmail,
      }
    )
    return {
      ok: true,
      source: 'gmail',
      count: messages.length,
      resultSizeEstimate,
      accountEmail: accountEmail || null,
      messages,
      messageAr:
        messages.length === 0
          ? `لا نتائج لـ «${query}» في بريدك الشخصي${accountEmail ? ` (${accountEmail})` : ''}.`
          : `وُجد ${messages.length} رسالة في بريدك الشخصي${accountEmail ? ` (${accountEmail})` : ''}.`,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'تعذّر بحث Gmail'
    // Last-resort: only if user has no Google and org IMAP exists — but label clearly.
    if (
      /اربط|ربط|token|صلاحية|scope/i.test(msg) &&
      (await isImapConfigured())
    ) {
      return {
        ok: false,
        source: 'none',
        count: 0,
        messages: [],
        messageAr: `${msg} — لبريد الجمعية استخدم mail_search لا gmail_search.`,
        ctaAr: 'اربط بريدي في Google من «نافذة البريد الشخصي».',
      }
    }
    throw e
  }
}

export async function executeGmailRead(
  _name: string,
  params: Record<string, unknown>
) {
  const userId = requireUser(params)
  const messageId = String(params.messageId || params.id || '').trim()
  const accountEmail = accountEmailOf(params)
  const message = await readGmailMessage(userId, messageId, { accountEmail })
  return {
    ok: true,
    source: 'gmail',
    accountEmail: accountEmail || null,
    message,
    messageAr: `قُرئت رسالة بريدك الشخصي: ${message.subject || messageId}`,
  }
}

export async function executeGmailSend(
  _name: string,
  params: Record<string, unknown>
) {
  const userId = requireUser(params)
  const to = String(params.to || '').trim()
  const subject = String(params.subject || '').trim()
  const bodyText = params.bodyText != null ? String(params.bodyText) : undefined
  const bodyHtml = params.bodyHtml != null ? String(params.bodyHtml) : undefined
  const accountEmail = accountEmailOf(params)
  const result = await sendGmailMessage(userId, {
    to,
    subject,
    bodyText,
    bodyHtml,
    cc: params.cc != null ? String(params.cc) : undefined,
    bcc: params.bcc != null ? String(params.bcc) : undefined,
    accountEmail,
  })
  return {
    ok: true,
    source: 'gmail',
    ...result,
    to,
    subject,
    accountEmail: accountEmail || null,
    messageAr: `أُرسل من بريدك الشخصي إلى ${to} — الموضوع: ${subject}${
      accountEmail ? ` (من ${accountEmail})` : ''
    }`,
  }
}

export async function executeSheetsRead(
  _name: string,
  params: Record<string, unknown>
) {
  const userId = requireUser(params)
  const result = await readSpreadsheetRange(userId, {
    spreadsheetId: String(params.spreadsheetId || params.id || ''),
    range: String(params.range || 'Sheet1!A1:Z50'),
  })
  return {
    ok: true,
    ...result,
    messageAr: `قُرئ النطاق ${result.range} (${result.rowCount} صف).`,
  }
}

export async function executeSheetsWrite(
  _name: string,
  params: Record<string, unknown>
) {
  const userId = requireUser(params)
  const valuesRaw = params.values
  if (!Array.isArray(valuesRaw)) {
    throw new Error('يلزم values كمصفوفة صفوف، مثل [["أ","ب"],[1,2]].')
  }
  const values = valuesRaw.map((row) => {
    if (!Array.isArray(row)) {
      throw new Error('كل عنصر في values يجب أن يكون صفاً (مصفوفة).')
    }
    return row.map((cell) => {
      if (cell == null) return ''
      if (
        typeof cell === 'string' ||
        typeof cell === 'number' ||
        typeof cell === 'boolean'
      ) {
        return cell
      }
      return String(cell)
    })
  })

  const result = await writeSpreadsheetRange(userId, {
    spreadsheetId: String(params.spreadsheetId || params.id || ''),
    range: String(params.range || ''),
    values,
    mode: params.mode === 'append' ? 'append' : 'update',
  })
  return {
    ok: true,
    ...result,
    messageAr: result.updatedRange
      ? `تم تحديث ${result.updatedRange} (${result.updatedCells ?? '?'} خلية).`
      : 'تم تحديث جدول Google Sheets.',
  }
}
