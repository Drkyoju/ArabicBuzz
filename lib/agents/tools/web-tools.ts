/**
 * Real web fetch / lightweight search for agents (Netlify-safe).
 */
import {
  IS_AIR_GAPPED_MODE,
  validateNetworkAccess,
} from '@/lib/security/airgap'

const MAX_CHARS = 12_000

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
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

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'ArabicBuzzBot/1.0 (+https://arabicbuzz.netlify.app)',
      Accept: 'text/html,application/xhtml+xml,application/json,text/plain,*/*',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(25_000),
  })
  const ct = res.headers.get('content-type') || ''
  const raw = await res.text()
  let content: string
  if (ct.includes('json')) {
    content = raw.slice(0, MAX_CHARS)
  } else if (ct.includes('html') || raw.trimStart().startsWith('<')) {
    content = stripHtml(raw).slice(0, MAX_CHARS)
  } else {
    content = raw.slice(0, MAX_CHARS)
  }

  return {
    ok: res.ok,
    status: res.status,
    url: res.url || url,
    contentType: ct,
    content,
    truncated: raw.length > MAX_CHARS,
    messageAr: res.ok
      ? `جُلب المحتوى من الرابط (${content.length} حرفاً).`
      : `فشل الجلب (HTTP ${res.status}).`,
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

  const braveKey = process.env.BRAVE_API_KEY?.trim()
  if (braveKey) {
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
      if (res.ok) {
        const data = (await res.json()) as {
          web?: {
            results?: Array<{
              title?: string
              url?: string
              description?: string
            }>
          }
        }
        const results = (data.web?.results || [])
          .filter((r) => r.url && r.title)
          .map((r) => ({
            title: String(r.title).slice(0, 160),
            url: String(r.url),
            snippet: String(r.description || '').slice(0, 280),
          }))
        return {
          ok: true,
          query,
          provider: 'brave',
          count: results.length,
          results,
          messageAr:
            results.length > 0
              ? `بحث Brave: ${results.length} نتيجة للوائح/الويب.`
              : 'لا نتائج من Brave — جرّب صياغة أخرى.',
        }
      }
    } catch (e) {
      console.warn(
        '[web_search] Brave failed',
        e instanceof Error ? e.message : e
      )
    }
  }

  const ddg = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  validateNetworkAccess(ddg)
  try {
    const res = await fetch(ddg, {
      headers: {
        'User-Agent': 'ArabicBuzzBot/1.0',
      },
      signal: AbortSignal.timeout(20_000),
    })
    const html = await res.text()
    const results: Array<{ title: string; url: string; snippet: string }> = []
    const re =
      /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) && results.length < 8) {
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
      results.push({ title, url, snippet: '' })
    }
    return {
      ok: true,
      query,
      provider: 'duckduckgo',
      count: results.length,
      results,
      messageAr:
        results.length > 0
          ? `عُثر على ${results.length} نتيجة${braveKey ? ' (احتياطي بعد Brave)' : ''}.`
          : 'لا نتائج ظاهرة — جرّب صياغة أخرى أو web_fetch لرابط مباشر.',
    }
  } catch (e) {
    return {
      ok: false,
      query,
      results: [],
      messageAr: e instanceof Error ? e.message : 'فشل البحث',
    }
  }
}
