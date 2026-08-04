import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const site = process.env.NETLIFY_SITE_ID
  const tok = process.env.NETLIFY_AUTH_TOKEN
  if (!site || !tok) throw new Error('missing netlify')
  const res = await fetch(`https://api.netlify.com/api/v1/sites/${site}/env`, {
    headers: { Authorization: `Bearer ${tok}` },
  })
  const list = (await res.json()) as Array<{
    key: string
    values?: Array<{ value?: string }>
  }>
  const get = (k: string) => list.find((e) => e.key === k)?.values?.[0]?.value
  for (const k of [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GEMINI_API_KEY',
    'COHERE_API_KEY',
  ]) {
    const v = get(k)
    if (v) process.env[k] = v
    console.log(k, v ? 'set' : 'missing')
  }

  const { getValidGoogleAccessToken } = await import('../lib/google/tokens')
  const { listDriveFolderFiles, downloadDriveFile } = await import(
    '../lib/google/drive'
  )
  const { extractDocumentText } = await import('../lib/rag/extract')
  const { shouldRunOcr } = await import('../lib/rag/ocr')

  const uid = 'bc4522fe-30a5-4e7a-9a85-5ac969d7b9ca'
  const access = await getValidGoogleAccessToken(uid)
  if (!access.ok) throw new Error(access.error)

  const files = await listDriveFolderFiles(uid, {
    folderId: '1Zu2vgbR8p0f8xnn1_cTnUZwsTLHUiHhW',
  })
  const f = files.find((x) => x.name.includes('محضر')) || files[0]
  console.log('file', f?.name, f?.mimeType, f?.size)
  const dl = await downloadDriveFile(uid, f!)
  console.log('bytes', dl.buffer.length, dl.mimeType, dl.filename)
  console.log(
    'shouldOcr empty?',
    shouldRunOcr({
      extractedText: '',
      filename: dl.filename,
      mimeType: dl.mimeType,
      byteLength: dl.buffer.length,
    })
  )
  const ex = await extractDocumentText({
    buffer: dl.buffer,
    filename: dl.filename,
    mimeType: dl.mimeType,
    enableOcr: true,
  })
  console.log({
    method: ex.method,
    ocr: ex.ocrUsed,
    provider: ex.ocrProvider,
    len: ex.text.length,
    sample: ex.text.slice(0, 200),
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
