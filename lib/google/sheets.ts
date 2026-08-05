import { getValidGoogleAccessToken } from '@/lib/google/tokens'

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

export type SheetsReadResult = {
  spreadsheetId: string
  range: string
  values: string[][]
  rowCount: number
  columnCount: number
}

export type SheetsWriteResult = {
  spreadsheetId: string
  updatedRange?: string
  updatedRows?: number
  updatedColumns?: number
  updatedCells?: number
}

async function sheetsFetch(
  userId: string,
  pathAndQuery: string,
  init?: RequestInit
): Promise<Response> {
  const tok = await getValidGoogleAccessToken(userId)
  if (!tok.ok) throw new Error(tok.error)
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${tok.accessToken}`)
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(`${SHEETS_BASE}${pathAndQuery}`, { ...init, headers })
}

function normalizeSpreadsheetId(raw: string): string {
  const s = raw.trim()
  const fromUrl = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (fromUrl?.[1]) return fromUrl[1]
  return s
}

/** Read a range (A1 notation) from a Google Spreadsheet. */
export async function readSpreadsheetRange(
  userId: string,
  opts: { spreadsheetId: string; range: string }
): Promise<SheetsReadResult> {
  const spreadsheetId = normalizeSpreadsheetId(opts.spreadsheetId)
  const range = opts.range.trim()
  if (!spreadsheetId) throw new Error('يلزم spreadsheetId.')
  if (!range) throw new Error('يلزم range بصيغة A1 (مثل Sheet1!A1:D20).')

  const params = new URLSearchParams({
    valueRenderOption: 'FORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  })
  const res = await sheetsFetch(
    userId,
    `/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?${params}`
  )
  const data = (await res.json()) as {
    range?: string
    values?: unknown[][]
    error?: { message?: string }
  }
  if (!res.ok) {
    throw new Error(
      data.error?.message ||
        `Sheets read HTTP ${res.status} — أعد ربط Google بصلاحية spreadsheets`
    )
  }

  const values = (data.values || []).map((row) =>
    row.map((cell) => (cell == null ? '' : String(cell)))
  )
  return {
    spreadsheetId,
    range: data.range || range,
    values,
    rowCount: values.length,
    columnCount: values.reduce((m, r) => Math.max(m, r.length), 0),
  }
}

/**
 * Write / update values in a spreadsheet range.
 * Uses USER_ENTERED so formulas like =SUM() still work.
 */
export async function writeSpreadsheetRange(
  userId: string,
  opts: {
    spreadsheetId: string
    range: string
    values: Array<Array<string | number | boolean | null>>
    /** append = add rows below; update = overwrite range (default) */
    mode?: 'update' | 'append'
  }
): Promise<SheetsWriteResult> {
  const spreadsheetId = normalizeSpreadsheetId(opts.spreadsheetId)
  const range = opts.range.trim()
  if (!spreadsheetId) throw new Error('يلزم spreadsheetId.')
  if (!range) throw new Error('يلزم range بصيغة A1.')
  if (!Array.isArray(opts.values) || opts.values.length === 0) {
    throw new Error('يلزم values كمصفوفة صفوف غير فارغة.')
  }

  const mode = opts.mode || 'update'
  const body = JSON.stringify({
    values: opts.values,
    majorDimension: 'ROWS',
  })

  const res =
    mode === 'append'
      ? await sheetsFetch(
          userId,
          `/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
          { method: 'POST', body }
        )
      : await sheetsFetch(
          userId,
          `/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
          { method: 'PUT', body }
        )

  const data = (await res.json()) as {
    spreadsheetId?: string
    updatedRange?: string
    updatedRows?: number
    updatedColumns?: number
    updatedCells?: number
    updates?: {
      updatedRange?: string
      updatedRows?: number
      updatedColumns?: number
      updatedCells?: number
    }
    error?: { message?: string }
  }
  if (!res.ok) {
    throw new Error(
      data.error?.message ||
        `Sheets write HTTP ${res.status} — أعد ربط Google بصلاحية spreadsheets`
    )
  }

  const updates = data.updates || data
  return {
    spreadsheetId: data.spreadsheetId || spreadsheetId,
    updatedRange: updates.updatedRange,
    updatedRows: updates.updatedRows,
    updatedColumns: updates.updatedColumns,
    updatedCells: updates.updatedCells,
  }
}
