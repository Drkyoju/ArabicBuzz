/**
 * Real web fetch / lightweight search for agents (Netlify-safe).
 * Free path (no keys): DuckDuckGo + Wikipedia + .gov.sa site search.
 * Optional upgrade: BRAVE_API_KEY.
 * Fetch fallback: Jina Reader (r.jina.ai) when plain fetch is thin/blocked.
 */
import {
  IS_AIR_GAPPED_MODE,
  validateNetworkAccess,
} from '@/lib/security/airgap'

const MAX_CHARS = 12_000
const UA = 'ArabicBuzzBot/1.0 (+https://arabicbuzz-fooc9h.cranl.net)'

export type WebSearchHit = {
  title: string
  url: string
  snippet: string
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function dedupeHits(hits: WebSearchHit[], limit = 8): WebSearchHit[] {
  const seen = new Set<string>()
  const out: WebSearchHit[] = []
  for (const h of hits) {
    const key = h.url.replace(/\/$/, '').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(h)
    if (out.length >= limit) break
  }
  return out
}

async function viaBrave(query: string): Promise<WebSearchHit[] | null> {
  const braveKey = process.env.BRAVE_API_KEY?.trim()
  if (!braveKey) return null
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`
    validateNetworkAccess(url)
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': braveKey,
      },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      web?: {
        results?: Array<{
          title?: string
          url?: string
          description?: string
        }>
      }
    }
    return (data.web?.results || [])
      .filter((r) => r.url && r.title)
      .map((r) => ({
        title: String(r.title).slice(0, 160),
        url: String(r.url),
        snippet: String(r.description || '').slice(0, 280),
      }))
  } catch (e) {
    console.warn(
      '[web_search] Brave failed',
      e instanceof Error ? e.message : e
    )
    return null
  }
}

function parseDdgHtml(html: string): WebSearchHit[] {
  const results: WebSearchHit[] = []
  // Classic html.duckduckgo.com result links
  const reA =
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = reA.exec(html)) && results.length < 10) {
    const href = m[1]
    const title = stripHtml(m[2]).slice(0, 160)
    let url = href
    try {
      const u = new URL(href, 'https://duckduckgo.com')
      const uddg = u.searchParams.get('uddg')
      if (uddg) url = decodeURIComponent(uddg)
    } catch {
      /* keep */
    }
    if (!/^https?:\/\//i.test(url)) continue
    results.push({ title: title || url, url, snippet: '' })
  }

  // Snippets next to results (best-effort)
  const snipRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/gi
  const snips: string[] = []
  let sm: RegExpExecArray | null
  while ((sm = snipRe.exec(html)) && snips.length < results.length) {
    snips.push(stripHtml(sm[1]).slice(0, 280))
  }
  for (let i = 0; i < results.length && i < snips.length; i++) {
    if (snips[i]) results[i].snippet = snips[i]
  }

  // lite.duckduckgo.com style links
  if (results.length === 0) {
    const liteRe =
      /<a[^>]+rel="nofollow"[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
    while ((m = liteRe.exec(html)) && results.length < 10) {
      const url = m[1]
      if (/duckduckgo\.com/i.test(url)) continue
      const title = stripHtml(m[2]).slice(0, 160)
      results.push({ title: title || url, url, snippet: '' })
    }
  }

  return results
}

async function viaDuckDuckGo(query: string): Promise<WebSearchHit[]> {
  const endpoints = [
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
  ]
  for (const ddg of endpoints) {
    try {
      validateNetworkAccess(ddg)
      const res = await fetch(ddg, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html',
        },
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) continue
      const html = await res.text()
      const hits = parseDdgHtml(html)
      if (hits.length > 0) return hits
    } catch (e) {
      console.warn(
        '[web_search] DDG failed',
        ddg,
        e instanceof Error ? e.message : e
      )
    }
  }
  return []
}

async function viaWikipedia(query: string): Promise<WebSearchHit[]> {
  const langs = ['ar', 'en'] as const
  const hits: WebSearchHit[] = []
  for (const lang of langs) {
    try {
      const api = `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=4&namespace=0&format=json&origin=*`
      validateNetworkAccess(api)
      const res = await fetch(api, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      })
      if (!res.ok) continue
      const data = (await res.json()) as [
        string,
        string[],
        string[],
        string[],
      ]
      const titles = data[1] || []
      const descs = data[2] || []
      const urls = data[3] || []
      for (let i = 0; i < titles.length; i++) {
        if (!urls[i]) continue
        hits.push({
          title: `${titles[i]} (ويكيبيديا/${lang})`.slice(0, 160),
          url: urls[i],
          snippet: String(descs[i] || '').slice(0, 280),
        })
      }
    } catch (e) {
      console.warn(
        '[web_search] Wikipedia failed',
        lang,
        e instanceof Error ? e.message : e
      )
    }
  }
  return hits
}

/** Extra Saudi official-domain hits via DDG site: filter (free, no key). */
async function viaGovSa(query: string): Promise<WebSearchHit[]> {
  const q = query.trim()
  if (!q) return []
  // Skip if query already scopes the site
  if (/site:\s*[\w.-]*gov\.sa/i.test(q)) return []
  const hits = await viaDuckDuckGo(`${q} site:gov.sa`)
  return hits.map((h) => ({
    ...h,
    snippet: h.snippet || 'نتيجة من نطاق حكومي سعودي (.gov.sa)',
  }))
}

async function viaJinaReader(url: string): Promise<string | null> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`
    validateNetworkAccess(jinaUrl)
    const res = await fetch(jinaUrl, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/plain',
        'X-Return-Format': 'text',
      },
      signal: AbortSignal.timeout(35_000),
      redirect: 'follow',
    })
    if (!res.ok) return null
    const text = (await res.text()).trim()
    if (text.length < 80) return null
    return text.slice(0, MAX_CHARS)
  } catch {
    return null
  }
}

export async function executeWebFetch(
  _n: string,
  params: Record<string, unknown>
) {
  const url = String(params.url || '').trim()
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('يلزم رابط http(s) صالح.')
  }
  validateNetworkAccess(url)
  if (IS_AIR_GAPPED_MODE) {
    // validateNetworkAccess already enforces private hosts
  }

  let provider: 'fetch' | 'jina' = 'fetch'
  let content = ''
  let status = 0
  let finalUrl = url
  let contentType = ''
  let ok = false
  let rawLen = 0

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/json,text/plain,*/*',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(25_000),
    })
    status = res.status
    finalUrl = res.url || url
    contentType = res.headers.get('content-type') || ''
    const raw = await res.text()
    rawLen = raw.length
    ok = res.ok
    if (contentType.includes('json')) {
      content = raw.slice(0, MAX_CHARS)
    } else if (contentType.includes('html') || raw.trimStart().startsWith('<')) {
      content = stripHtml(raw).slice(0, MAX_CHARS)
    } else {
      content = raw.slice(0, MAX_CHARS)
    }
  } catch {
    content = ''
  }

  // Free Jina Reader when direct fetch fails or yields almost no text
  if ((!ok || content.trim().length < 120) && !IS_AIR_GAPPED_MODE) {
    const jina = await viaJinaReader(url)
    if (jina) {
      content = jina
      provider = 'jina'
      ok = true
      status = status || 200
      contentType = contentType || 'text/plain'
    }
  }

  return {
    ok,
    status,
    url: finalUrl,
    contentType,
    content,
    provider,
    truncated: rawLen > MAX_CHARS || content.length >= MAX_CHARS,
    messageAr: ok
      ? `جُلب المحتوى من الرابط (${content.length} حرفاً)${provider === 'jina' ? ' عبر Jina Reader' : ''}.`
      : `فشل الجلب (HTTP ${status || '—'}).`,
  }
}

export async function executeWebSearch(
  _n: string,
  params: Record<string, unknown>
) {
  const query = String(params.query || params.queryAr || '').trim()
  if (!query) throw new Error('يلزم استعلام بحث.')

  if (IS_AIR_GAPPED_MODE) {
    return {
      ok: false,
      stub: false,
      results: [],
      messageAr: 'البحث معطّل في الوضع المحلي المغلق.',
    }
  }

  const providersUsed: string[] = []
  let results: WebSearchHit[] = []

  const brave = await viaBrave(query)
  if (brave && brave.length > 0) {
    results = brave
    providersUsed.push('brave')
  }

  // Free path always fills / backs up Brave
  if (results.length < 6) {
    const ddg = await viaDuckDuckGo(query)
    if (ddg.length) {
      results = dedupeHits([...results, ...ddg])
      providersUsed.push('duckduckgo')
    }
  }

  if (results.length < 6) {
    const wiki = await viaWikipedia(query)
    if (wiki.length) {
      results = dedupeHits([...results, ...wiki])
      providersUsed.push('wikipedia')
    }
  }

  // Saudi official sources — useful for association / NCNP style queries
  if (results.length < 8) {
    const gov = await viaGovSa(query)
    if (gov.length) {
      results = dedupeHits([...results, ...gov])
      providersUsed.push('gov.sa')
    }
  }

  results = dedupeHits(results, 8)
  const provider =
    providersUsed[0] ||
    (process.env.BRAVE_API_KEY?.trim() ? 'brave' : 'duckduckgo')

  return {
    ok: results.length > 0,
    query,
    provider,
    providers: providersUsed,
    count: results.length,
    results,
    messageAr:
      results.length > 0
        ? `عُثر على ${results.length} نتيجة (${providersUsed.join(' · ') || 'مجاني مدمج'}).`
        : 'لا نتائج ظاهرة — جرّب صياغة أخرى أو web_fetch لرابط مباشر من .gov.sa / ويكيبيديا.',
  }
}
