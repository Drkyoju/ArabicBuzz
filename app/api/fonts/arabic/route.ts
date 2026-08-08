import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const dynamic = 'force-dynamic'

async function readFirstExisting(paths: string[]): Promise<Buffer | null> {
  for (const filePath of paths) {
    try {
      const buf = await readFile(filePath)
      if (buf.byteLength > 1000) return buf
    } catch {
      /* try next */
    }
  }
  return null
}

/** Serve local Noto Naskh for client-side PDF text annotation burn-in. */
export async function GET() {
  try {
    const cwd = process.cwd()
    const buf = await readFirstExisting([
      path.join(cwd, 'public/fonts/NotoNaskhArabic-Regular.ttf'),
      path.join(cwd, 'assets/fonts/NotoNaskhArabic-Regular.ttf'),
      path.join(cwd, 'fonts/NotoNaskhArabic-Regular.ttf'),
    ])
    if (!buf) {
      return Response.json(
        { error: 'خط عربي غير متاح على الخادم' },
        { status: 404 }
      )
    }
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
