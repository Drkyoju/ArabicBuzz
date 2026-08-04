/**
 * Pull policy/regulation pages into the association knowledge brain.
 * Providers: Anybrowse (free) → Firecrawl → plain fetch.
 */
import { ingestArabicDocument } from '@/lib/rag/ingest'

export type WebIngestResult = {
  ok: boolean
  titleAr: string
  url: string
  chunks: number
  chars: number
  provider: 'anybrowse' | 'firecrawl' | 'fetch' | 'none'
  messageAr: string
  preview?: string
  error?: string
}

async function viaAnybrowse(url: string): Promise<string | null> {
  try {
    // Public scrape HTTP used by Anybrowse MCP clients
    const res = await fetch('https://anybrowse.dev/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(45_000),
    })
    if (!res.ok) {
      // alternate path
      const res2 = await fetch('https://anybrowse.dev/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(45_000),
      })
      if (!res2.ok) return null
      const d2 = (await res2.json()) as { markdown?: string; content?: string; text?: string }
      return d2.markdown || d2.content || d2.text || null
    }
    const data = (await res.json()) as {
      markdown?: string
      content?: string
      text?: string
      data?: { markdown?: string }
    }
    return (
      data.markdown ||
      data.content ||
      data.text ||
      data.data?.markdown ||
      null
    )
  } catch {
    return null
  }
}

async function viaFirecrawl(url: string): Promise<string | null> {
  const key = process.env.FIRECRAWL_API_KEY?.trim()
  if (!key) return null
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
      }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      success?: boolean
      data?: { markdown?: string; content?: string }
    }
    return data.data?.markdown || data.data?.content || null
  } catch {
    return null
  }
}

async function viaPlainFetch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'ArabicBuzzKnowledgeBot/1.0 (+https://arabicbuzz.netlify.app)',
        Accept: 'text/html,application/xhtml+xml,text/plain,application/pdf',
      },
      signal: AbortSignal.timeout(30_000),
      redirect: 'follow',
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('pdf')) {
      const buf = Buffer.from(await res.arrayBuffer())
      const { extractDocumentText } = await import('@/lib/rag/extract')
      const extracted = await extractDocumentText({
        buffer: buf,
        filename: 'page.pdf',
        mimeType: 'application/pdf',
        enableOcr: true,
      })
      return extracted.text || null
    }
    const html = await res.text()
    // crude HTML → text
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120_000)
  } catch {
    return null
  }
}

function titleFromUrl(url: string, body?: string) {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const path = decodeURIComponent(u.pathname).split('/').filter(Boolean).pop()
    if (path && path.length > 2) return `${host} · ${path.slice(0, 60)}`
    return `سياسة من ${host}`
  } catch {
    return body?.slice(0, 40) || 'صفحة ويب'
  }
}

export async function ingestUrlToBrain(opts: {
  scopeId: string
  url: string
  titleAr?: string
}): Promise<WebIngestResult> {
  const url = opts.url.trim()
  if (!/^https?:\/\//i.test(url)) {
    return {
      ok: false,
      titleAr: '',
      url,
      chunks: 0,
      chars: 0,
      provider: 'none',
      messageAr: 'الرابط يجب أن يبدأ بـ http أو https',
      error: 'bad_url',
    }
  }

  let text: string | null = null
  let provider: WebIngestResult['provider'] = 'none'

  text = await viaAnybrowse(url)
  if (text?.trim()) provider = 'anybrowse'
  if (!text?.trim()) {
    text = await viaFirecrawl(url)
    if (text?.trim()) provider = 'firecrawl'
  }
  if (!text?.trim()) {
    text = await viaPlainFetch(url)
    if (text?.trim()) provider = 'fetch'
  }

  if (!text?.trim()) {
    return {
      ok: false,
      titleAr: opts.titleAr || titleFromUrl(url),
      url,
      chunks: 0,
      chars: 0,
      provider: 'none',
      messageAr:
        'تعذّر سحب الصفحة. جرّب لاحقاً أو فعّل FIRECRAWL_API_KEY أو Anybrowse.',
      error: 'empty',
    }
  }

  const titleAr = opts.titleAr?.trim() || titleFromUrl(url, text)
  const content = [
    `# ${titleAr}`,
    ``,
    `المصدر: ${url}`,
    `تاريخ الجلب: ${new Date().toISOString()}`,
    ``,
    text.slice(0, 200_000),
  ].join('\n')

  const ingested = await ingestArabicDocument({
    scopeId: opts.scopeId || 'shared-demo',
    titleAr,
    content,
    sourcePath: url,
  })

  if (!ingested.ok) {
    return {
      ok: false,
      titleAr,
      url,
      chunks: 0,
      chars: content.length,
      provider,
      messageAr: ingested.error || 'فشل الاستيعاب في المعرفة',
      error: ingested.error,
    }
  }

  return {
    ok: true,
    titleAr,
    url,
    chunks: ingested.chunks,
    chars: content.length,
    provider,
    preview: text.slice(0, 400),
    messageAr: `أُضيفت «${titleAr}» إلى معرفة الغرفة (${ingested.chunks} مقطع) عبر ${provider}.`,
  }
}

export async function ingestUrlsToBrain(opts: {
  scopeId: string
  urls: string[]
  titlePrefixAr?: string
}): Promise<{
  ok: boolean
  results: WebIngestResult[]
  messageAr: string
}> {
  const results: WebIngestResult[] = []
  for (const url of opts.urls.slice(0, 8)) {
    results.push(
      await ingestUrlToBrain({
        scopeId: opts.scopeId,
        url,
        titleAr: opts.titlePrefixAr
          ? `${opts.titlePrefixAr} · ${url}`
          : undefined,
      })
    )
  }
  const okN = results.filter((r) => r.ok).length
  return {
    ok: okN > 0,
    results,
    messageAr: `اكتمل سحب ${okN} من ${results.length} رابط إلى المعرفة.`,
  }
}
