import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const dynamic = 'force-dynamic'

/** Serve local Noto Naskh for client-side PDF text annotation burn-in. */
export async function GET() {
  try {
    const filePath = path.join(
      process.cwd(),
      'assets/fonts/NotoNaskhArabic-Regular.ttf'
    )
    const buf = await readFile(filePath)
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': 'font/ttf',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    })
  } catch {
    return Response.json(
      { error: 'خط عربي غير متاح على الخادم' },
      { status: 404 }
    )
  }
}
