/**
 * Optional CloudConvert API (paid) — high-fidelity Office/PDF conversion.
 * Pure fetch (no SDK) so Netlify stays light. Fully optional: without
 * CLOUDCONVERT_API_KEY the free text-rebuild path is used instead.
 *
 * https://cloudconvert.com/api/v2
 */

export function cloudConvertConfigured(): boolean {
  return Boolean(process.env.CLOUDCONVERT_API_KEY?.trim())
}

export function cloudConvertStatusAr(): string {
  return cloudConvertConfigured()
    ? 'اختياري مدفوع · مفعّل (CloudConvert)'
    : 'اختياري مدفوع — أضف CLOUDCONVERT_API_KEY للتحويل عالي الدقة'
}

const SYNC_BASE = 'https://sync.api.cloudconvert.com/v2'
const ASYNC_BASE = 'https://api.cloudconvert.com/v2'

type CcJob = {
  id?: string
  status?: string
  tasks?: Array<{
    name?: string
    operation?: string
    status?: string
    result?: {
      files?: Array<{ url?: string; filename?: string }>
      form?: {
        url?: string
        parameters?: Record<string, string>
      }
    }
    message?: string
  }>
  message?: string
}

async function ccFetch(
  path: string,
  init: RequestInit & { sync?: boolean } = {}
): Promise<Response> {
  const key = process.env.CLOUDCONVERT_API_KEY?.trim()
  if (!key) {
    throw new Error(
      'CloudConvert غير مضبوط. أضف CLOUDCONVERT_API_KEY في Netlify (اختياري مدفوع).'
    )
  }
  const base = init.sync ? SYNC_BASE : ASYNC_BASE
  const { sync: _s, ...rest } = init
  return fetch(`${base}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(rest.headers || {}),
    },
  })
}

/** Formats CloudConvert can convert between for Arabic Buzz office loop. */
export const CLOUDCONVERT_OFFICE_FORMATS = [
  'docx',
  'doc',
  'pdf',
  'xlsx',
  'xls',
  'pptx',
  'ppt',
  'odt',
  'ods',
  'odp',
  'txt',
  'rtf',
] as const

export type CloudConvertFormat =
  (typeof CLOUDCONVERT_OFFICE_FORMATS)[number]

export async function convertViaCloudConvert(opts: {
  buffer: Buffer | Uint8Array
  filename: string
  inputFormat?: string
  outputFormat: string
  timeoutMs?: number
}): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
  if (!cloudConvertConfigured()) {
    throw new Error(
      'CloudConvert غير مضبوط (اختياري مدفوع). المسار المجاني: إعادة بناء نصية.'
    )
  }

  const inputFormat = (
    opts.inputFormat ||
    opts.filename.split('.').pop() ||
    ''
  ).toLowerCase()
  const outputFormat = opts.outputFormat.toLowerCase()

  // 1) Create job with upload + convert + export
  const createRes = await ccFetch('/jobs', {
    method: 'POST',
    body: JSON.stringify({
      tasks: {
        'import-file': { operation: 'import/upload' },
        'convert-file': {
          operation: 'convert',
          input: 'import-file',
          input_format: inputFormat || undefined,
          output_format: outputFormat,
        },
        'export-file': {
          operation: 'export/url',
          input: 'convert-file',
        },
      },
    }),
  })
  const createBody = (await createRes.json()) as {
    data?: CcJob
    message?: string
  }
  if (!createRes.ok || !createBody.data) {
    throw new Error(
      `CloudConvert رفض إنشاء المهمة: ${createBody.message || createRes.status}`
    )
  }

  const uploadTask = createBody.data.tasks?.find(
    (t) => t.name === 'import-file' || t.operation === 'import/upload'
  )
  const form = uploadTask?.result?.form
  if (!form?.url || !form.parameters) {
    throw new Error('CloudConvert: تعذّر الحصول على رابط الرفع.')
  }

  // 2) Upload binary
  const formData = new FormData()
  for (const [k, v] of Object.entries(form.parameters)) {
    formData.append(k, v)
  }
  const blob = new Blob([Uint8Array.from(opts.buffer)], {
    type: 'application/octet-stream',
  })
  formData.append('file', blob, opts.filename)
  const upRes = await fetch(form.url, { method: 'POST', body: formData })
  if (!upRes.ok) {
    throw new Error(`CloudConvert: فشل رفع الملف (HTTP ${upRes.status}).`)
  }

  const jobId = createBody.data.id
  if (!jobId) throw new Error('CloudConvert: لا معرّف مهمة.')

  // 3) Wait for job (poll async API)
  const deadline = Date.now() + (opts.timeoutMs ?? 90_000)
  let job: CcJob | undefined
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500))
    const waitRes = await ccFetch(`/jobs/${jobId}`, { method: 'GET' })
    const waitBody = (await waitRes.json()) as {
      data?: CcJob
      message?: string
    }
    job = waitBody.data
    if (!job) continue
    if (job.status === 'finished' || job.status === 'error') break
  }

  if (!job || job.status !== 'finished') {
    const errTask = job?.tasks?.find((t) => t.status === 'error')
    throw new Error(
      errTask?.message ||
        job?.message ||
        'CloudConvert: انتهت المهلة أو فشلت المهمة.'
    )
  }

  const exportTask = job.tasks?.find(
    (t) => t.name === 'export-file' || t.operation === 'export/url'
  )
  const fileUrl = exportTask?.result?.files?.[0]?.url
  const outName =
    exportTask?.result?.files?.[0]?.filename ||
    opts.filename.replace(/\.[^.]+$/, '') + `.${outputFormat}`
  if (!fileUrl) {
    throw new Error('CloudConvert: لا رابط تنزيل للناتج.')
  }

  const fileRes = await fetch(fileUrl)
  if (!fileRes.ok) {
    throw new Error(`CloudConvert: فشل تنزيل الناتج (HTTP ${fileRes.status}).`)
  }
  const ab = await fileRes.arrayBuffer()
  const mime =
    fileRes.headers.get('content-type') ||
    mimeForExt(outputFormat) ||
    'application/octet-stream'

  return { buffer: Buffer.from(ab), filename: outName, mimeType: mime }
}

function mimeForExt(ext: string): string | null {
  const map: Record<string, string> = {
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ppt: 'application/vnd.ms-powerpoint',
    txt: 'text/plain; charset=utf-8',
    rtf: 'application/rtf',
  }
  return map[ext.toLowerCase()] || null
}
