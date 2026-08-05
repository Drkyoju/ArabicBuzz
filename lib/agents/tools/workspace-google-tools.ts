import { readGmailMessage, searchGmailMessages } from '@/lib/google/gmail'
import {
  readSpreadsheetRange,
  writeSpreadsheetRange,
} from '@/lib/google/sheets'

function requireUser(params: Record<string, unknown>) {
  const userId = String(params.userId || params._userId || '').trim()
  if (!userId || userId === 'engine' || userId === 'local-owner') {
    throw new Error(
      'يلزم تسجيل الدخول وربط Google من الإعدادات (تقويم / Gmail / Sheets) أولاً.'
    )
  }
  return userId
}

export async function executeGmailSearch(
  _name: string,
  params: Record<string, unknown>
) {
  const userId = requireUser(params)
  const query = String(params.query || params.q || '').trim()
  const messages = await searchGmailMessages(userId, {
    query,
    maxResults:
      typeof params.maxResults === 'number' ? params.maxResults : undefined,
  })
  return {
    ok: true,
    count: messages.length,
    messages,
    messageAr:
      messages.length === 0
        ? `لا نتائج لـ «${query}».`
        : `وُجد ${messages.length} رسالة مطابقة.`,
  }
}

export async function executeGmailRead(
  _name: string,
  params: Record<string, unknown>
) {
  const userId = requireUser(params)
  const messageId = String(params.messageId || params.id || '').trim()
  const message = await readGmailMessage(userId, messageId)
  return {
    ok: true,
    message,
    messageAr: `قُرئت الرسالة: ${message.subject || messageId}`,
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
