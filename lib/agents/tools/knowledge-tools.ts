/**
 * Free knowledge helpers (Hermes MCP parity): Wikipedia, YouTube transcript,
 * math eval, domain DNS/RDAP, arXiv search — no paid keys.
 */
import {
  IS_AIR_GAPPED_MODE,
  validateNetworkAccess,
} from '@/lib/security/airgap'

const UA = 'ArabicBuzzBot/1.0 (+https://arabicbuzz-fooc9h.cranl.net)'
const MAX_CHARS = 12_000

function airgapBlock() {
  return {
    ok: false as const,
    messageAr: 'البحث/الجلب معطّل في الوضع المحلي المغلق.',
  }
}

/** Extract YouTube video id from URL or bare id. */
export function extractYoutubeVideoId(input: string): string | null {
  const s = String(input || '').trim()
  if (!s) return null
  // Bare id: 11 chars, must include a digit or uppercase (avoids words like "not-a-video")
  if (
    /^[a-zA-Z0-9_-]{11}$/.test(s) &&
    (/[0-9]/.test(s) || /[A-Z]/.test(s))
  ) {
    return s
  }
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0]
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null
    }
    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      const v = u.searchParams.get('v')
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v
      const parts = u.pathname.split('/').filter(Boolean)
      const markers = ['embed', 'shorts', 'live', 'v']
      for (let i = 0; i < parts.length - 1; i++) {
        if (markers.includes(parts[i]) && /^[a-zA-Z0-9_-]{11}$/.test(parts[i + 1])) {
          return parts[i + 1]
        }
      }
    }
  } catch {
    /* fall through */
  }
  const m = s.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})(?:[&?#]|$)/)
  return m?.[1] || null
}

/** Safe arithmetic / unit-less math (no eval of arbitrary JS). */
export function evaluateMathExpression(raw: string): number {
  const src = String(raw || '')
    .trim()
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\b(\d{1,3}(?:,\d{3})+)\b/g, (m) => m.replace(/,/g, ''))
    .replace(/\^/g, '**')
  if (!src) throw new Error('يلزم تعبير رياضي.')
  type Tok =
    | { t: 'num'; v: number }
    | { t: 'op'; v: string }
    | { t: 'id'; v: string }
    | { t: 'lp' }
    | { t: 'rp' }
    | { t: 'comma' }

  const tokens: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (c === '(') {
      tokens.push({ t: 'lp' })
      i++
      continue
    }
    if (c === ')') {
      tokens.push({ t: 'rp' })
      i++
      continue
    }
    if (c === ',') {
      tokens.push({ t: 'comma' })
      i++
      continue
    }
    if ('+-*/%'.includes(c) || (c === '*' && src[i + 1] === '*')) {
      if (c === '*' && src[i + 1] === '*') {
        tokens.push({ t: 'op', v: '**' })
        i += 2
      } else {
        tokens.push({ t: 'op', v: c })
        i++
      }
      continue
    }
    if (/[0-9.]/.test(c)) {
      let j = i + 1
      while (j < src.length && /[0-9.eE+-]/.test(src[j])) {
        if (/[eE]/.test(src[j]) && /[+-]/.test(src[j + 1] || '')) {
          j += 2
          continue
        }
        if (/[+-]/.test(src[j]) && !/[eE]/.test(src[j - 1] || '')) break
        j++
      }
      const n = Number(src.slice(i, j))
      if (!Number.isFinite(n)) throw new Error(`رقم غير صالح قرب: ${src.slice(i, j)}`)
      tokens.push({ t: 'num', v: n })
      i = j
      continue
    }
    if (/[a-zA-Zπ_]/.test(c) || c === 'π') {
      let j = i + 1
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++
      const id = src.slice(i, j).toLowerCase().replace('π', 'pi')
      tokens.push({ t: 'id', v: id === 'π' ? 'pi' : id })
      i = j
      continue
    }
    throw new Error(`رمز غير مسموح: ${c}`)
  }

  let pos = 0
  const peek = () => tokens[pos]
  const take = () => tokens[pos++]

  function parseExpr(): number {
    return parseAdd()
  }
  function parseAdd(): number {
    let v = parseMul()
    while (peek()?.t === 'op' && (peek() as { v: string }).v && '+-'.includes((peek() as { v: string }).v)) {
      const op = (take() as { v: string }).v
      const r = parseMul()
      v = op === '+' ? v + r : v - r
    }
    return v
  }
  function parseMul(): number {
    let v = parsePow()
    while (
      peek()?.t === 'op' &&
      ['*', '/', '%'].includes((peek() as { v: string }).v)
    ) {
      const op = (take() as { v: string }).v
      const r = parsePow()
      if (op === '*') v *= r
      else if (op === '/') v /= r
      else v %= r
    }
    return v
  }
  function parsePow(): number {
    let v = parseUnary()
    if (peek()?.t === 'op' && (peek() as { v: string }).v === '**') {
      take()
      const exp = parsePow() // right-assoc
      v = v ** exp
    }
    return v
  }
  function parseUnary(): number {
    if (peek()?.t === 'op' && (peek() as { v: string }).v === '+') {
      take()
      return parseUnary()
    }
    if (peek()?.t === 'op' && (peek() as { v: string }).v === '-') {
      take()
      return -parseUnary()
    }
    return parsePrimary()
  }
  function callFn(name: string, args: number[]): number {
    const n = name.toLowerCase()
    const a0 = args[0]
    const a1 = args[1]
    switch (n) {
      case 'sqrt':
        return Math.sqrt(a0)
      case 'abs':
        return Math.abs(a0)
      case 'sin':
        return Math.sin(a0)
      case 'cos':
        return Math.cos(a0)
      case 'tan':
        return Math.tan(a0)
      case 'log':
        return args.length >= 2 ? Math.log(a0) / Math.log(a1) : Math.log10(a0)
      case 'ln':
        return Math.log(a0)
      case 'floor':
        return Math.floor(a0)
      case 'ceil':
        return Math.ceil(a0)
      case 'round':
        return Math.round(a0)
      case 'min':
        return Math.min(...args)
      case 'max':
        return Math.max(...args)
      case 'pow':
        return a0 ** a1
      default:
        throw new Error(`دالة غير مدعومة: ${name}`)
    }
  }
  function parsePrimary(): number {
    const t = peek()
    if (!t) throw new Error('تعبير ناقص.')
    if (t.t === 'num') {
      take()
      return t.v
    }
    if (t.t === 'id') {
      take()
      if (t.v === 'pi') return Math.PI
      if (t.v === 'e') return Math.E
      if (peek()?.t === 'lp') {
        take()
        const args: number[] = []
        if (peek()?.t !== 'rp') {
          args.push(parseExpr())
          while (peek()?.t === 'comma') {
            take()
            args.push(parseExpr())
          }
        }
        if (peek()?.t !== 'rp') throw new Error('قوس إغلاق ناقص.')
        take()
        return callFn(t.v, args)
      }
      throw new Error(`معرّف غير معروف: ${t.v}`)
    }
    if (t.t === 'lp') {
      take()
      const v = parseExpr()
      if (peek()?.t !== 'rp') throw new Error('قوس إغلاق ناقص.')
      take()
      return v
    }
    throw new Error('تعبير غير صالح.')
  }

  const result = parseExpr()
  if (pos < tokens.length) throw new Error('رموز زائدة في التعبير.')
  if (!Number.isFinite(result)) throw new Error('النتيجة غير عددية (Infinity/NaN).')
  return result
}

export async function executeMathEval(
  _n: string,
  params: Record<string, unknown>
) {
  const expression = String(params.expression || params.expr || params.query || '').trim()
  if (!expression) throw new Error('يلزم expression.')
  try {
    const value = evaluateMathExpression(expression)
    return {
      ok: true,
      expression,
      value,
      messageAr: `النتيجة: ${value}`,
    }
  } catch (e) {
    return {
      ok: false,
      expression,
      messageAr: e instanceof Error ? e.message : 'تعذّر الحساب.',
    }
  }
}

export async function executeWikipediaLookup(
  _n: string,
  params: Record<string, unknown>
) {
  const query = String(params.query || params.title || params.q || '').trim()
  const langRaw = String(params.lang || params.language || 'ar').trim().toLowerCase()
  const lang = /^[a-z]{2,3}$/.test(langRaw) ? langRaw : 'ar'
  if (!query) throw new Error('يلزم عنوان أو استعلام ويكيبيديا.')
  if (IS_AIR_GAPPED_MODE) return airgapBlock()

  const langs = lang === 'ar' ? (['ar', 'en'] as const) : ([lang, 'ar', 'en'] as const)
  const tried: string[] = []

  for (const L of langs) {
    try {
      const searchUrl = `https://${L}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&namespace=0&format=json&origin=*`
      validateNetworkAccess(searchUrl)
      const sRes = await fetch(searchUrl, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      })
      if (!sRes.ok) continue
      const sData = (await sRes.json()) as [string, string[], string[], string[]]
      const title = sData[1]?.[0]
      const pageUrl = sData[3]?.[0]
      if (!title) {
        tried.push(L)
        continue
      }

      const sumUrl = `https://${L}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`
      validateNetworkAccess(sumUrl)
      const sumRes = await fetch(sumUrl, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!sumRes.ok) {
        tried.push(L)
        continue
      }
      const sum = (await sumRes.json()) as {
        title?: string
        extract?: string
        description?: string
        content_urls?: { desktop?: { page?: string } }
        type?: string
      }
      const extract = String(sum.extract || '').slice(0, MAX_CHARS)
      if (!extract && sum.type === 'disambiguation') {
        tried.push(`${L}:disambiguation`)
        continue
      }
      return {
        ok: Boolean(extract),
        lang: L,
        title: sum.title || title,
        description: sum.description || '',
        extract,
        url: sum.content_urls?.desktop?.page || pageUrl || '',
        messageAr: extract
          ? `ويكيبيديا/${L}: ${sum.title || title}`
          : `وُجدت صفحة بلا ملخص كافٍ (${L}).`,
      }
    } catch (e) {
      console.warn(
        '[wikipedia_lookup] failed',
        L,
        e instanceof Error ? e.message : e
      )
      tried.push(L)
    }
  }

  return {
    ok: false,
    query,
    tried,
    messageAr: 'لم يُعثر على مقال ويكيبيديا مناسب. جرّب صياغة أخرى أو web_search.',
  }
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseTimedTextXml(xml: string): string {
  const parts: string[] = []
  const re = /<text[^>]*>([\s\S]*?)<\/text>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const t = decodeXmlEntities(m[1].replace(/<[^>]+>/g, ' '))
    if (t) parts.push(t)
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

async function fetchYoutubeTimedtext(
  videoId: string,
  langs: string[]
): Promise<{ text: string; lang: string } | null> {
  for (const lang of langs) {
    const url = `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(lang)}&fmt=srv1`
    try {
      validateNetworkAccess(url)
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/xml,*/*' },
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) continue
      const xml = await res.text()
      const text = parseTimedTextXml(xml)
      if (text.length >= 40) return { text: text.slice(0, MAX_CHARS), lang }
    } catch {
      /* try next */
    }
  }
  return null
}

async function fetchYoutubeCaptionsFromWatch(
  videoId: string
): Promise<{ text: string; lang: string } | null> {
  const watch = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
  try {
    validateNetworkAccess(watch)
    const res = await fetch(watch, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'ar,en;q=0.8',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(25_000),
    })
    if (!res.ok) return null
    const html = await res.text()
    const m = html.match(
      /ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;/
    )
    if (!m?.[1]) return null
    let player: {
      captions?: {
        playerCaptionsTracklistRenderer?: {
          captionTracks?: Array<{
            baseUrl?: string
            languageCode?: string
            kind?: string
          }>
        }
      }
    }
    try {
      player = JSON.parse(m[1])
    } catch {
      return null
    }
    const tracks =
      player.captions?.playerCaptionsTracklistRenderer?.captionTracks || []
    if (!tracks.length) return null
    const prefer = ['ar', 'en', 'en-US', 'en-GB']
    const ordered = [
      ...tracks.filter((t) => prefer.includes(String(t.languageCode || ''))),
      ...tracks,
    ]
    for (const track of ordered) {
      const base = track.baseUrl
      if (!base) continue
      try {
        validateNetworkAccess(base)
        const tRes = await fetch(base, {
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(20_000),
        })
        if (!tRes.ok) continue
        const body = await tRes.text()
        const text = parseTimedTextXml(body) || decodeXmlEntities(body.replace(/<[^>]+>/g, ' '))
        if (text.length >= 40) {
          return {
            text: text.slice(0, MAX_CHARS),
            lang: String(track.languageCode || 'auto'),
          }
        }
      } catch {
        /* next track */
      }
    }
  } catch (e) {
    console.warn(
      '[youtube_transcript] watch parse failed',
      e instanceof Error ? e.message : e
    )
  }
  return null
}

export async function executeYoutubeTranscript(
  _n: string,
  params: Record<string, unknown>
) {
  const raw = String(
    params.url || params.videoUrl || params.videoId || params.query || ''
  ).trim()
  if (!raw) throw new Error('يلزم رابط يوتيوب أو معرّف الفيديو.')
  if (IS_AIR_GAPPED_MODE) return airgapBlock()

  const videoId = extractYoutubeVideoId(raw)
  if (!videoId) {
    return {
      ok: false,
      messageAr: 'رابط/معرّف يوتيوب غير صالح.',
    }
  }

  const langPref = String(params.lang || 'ar').trim() || 'ar'
  const langs = [langPref, 'ar', 'en', 'en-US'].filter(
    (v, i, a) => a.indexOf(v) === i
  )

  let hit = await fetchYoutubeTimedtext(videoId, langs)
  if (!hit) hit = await fetchYoutubeCaptionsFromWatch(videoId)

  if (!hit) {
    return {
      ok: false,
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      messageAr:
        'لا توجد ترجمة/تفريغ متاح لهذا الفيديو (قد يكون مغلقاً أو بلا كابشن).',
    }
  }

  return {
    ok: true,
    videoId,
    lang: hit.lang,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    transcript: hit.text,
    truncated: hit.text.length >= MAX_CHARS,
    messageAr: `تفريغ يوتيوب (${hit.lang}) — ${hit.text.length} حرفاً.`,
  }
}

function normalizeDomain(input: string): string | null {
  let s = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
  if (!s || /[^a-z0-9.-]/.test(s)) return null
  if (!s.includes('.')) return null
  return s
}

export async function executeDomainIntel(
  _n: string,
  params: Record<string, unknown>
) {
  const domain = normalizeDomain(
    String(params.domain || params.host || params.query || params.url || '')
  )
  if (!domain) throw new Error('يلزم اسم نطاق صالح (مثال: example.com).')
  if (IS_AIR_GAPPED_MODE) return airgapBlock()

  const dnsTypes = ['A', 'AAAA', 'MX', 'TXT', 'NS'] as const
  const dns: Record<string, string[]> = {}
  await Promise.all(
    dnsTypes.map(async (type) => {
      const url = `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`
      try {
        validateNetworkAccess(url)
        const res = await fetch(url, {
          headers: { Accept: 'application/json', 'User-Agent': UA },
          signal: AbortSignal.timeout(12_000),
        })
        if (!res.ok) return
        const data = (await res.json()) as {
          Answer?: Array<{ data?: string }>
        }
        const answers = (data.Answer || [])
          .map((a) => String(a.data || '').trim())
          .filter(Boolean)
        if (answers.length) dns[type] = answers
      } catch {
        /* skip type */
      }
    })
  )

  let rdap: Record<string, unknown> | null = null
  try {
    const rdapUrl = `https://rdap.org/domain/${encodeURIComponent(domain)}`
    validateNetworkAccess(rdapUrl)
    const res = await fetch(rdapUrl, {
      headers: { Accept: 'application/rdap+json, application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
    })
    if (res.ok) {
      const j = (await res.json()) as {
        ldhName?: string
        status?: string[]
        events?: Array<{ eventAction?: string; eventDate?: string }>
        nameservers?: Array<{ ldhName?: string }>
        entities?: unknown[]
      }
      rdap = {
        name: j.ldhName || domain,
        status: j.status || [],
        events: (j.events || []).slice(0, 8),
        nameservers: (j.nameservers || [])
          .map((n) => n.ldhName)
          .filter(Boolean)
          .slice(0, 12),
        entityCount: Array.isArray(j.entities) ? j.entities.length : 0,
      }
    }
  } catch (e) {
    console.warn(
      '[domain_intel] RDAP failed',
      e instanceof Error ? e.message : e
    )
  }

  const ok = Object.keys(dns).length > 0 || Boolean(rdap)
  return {
    ok,
    domain,
    dns,
    rdap,
    messageAr: ok
      ? `استعلام نطاق ${domain}: DNS (${Object.keys(dns).join(', ') || '—'}) · RDAP ${rdap ? 'متاح' : 'غير متاح'}.`
      : `تعذّر استعلام النطاق ${domain}.`,
  }
}

export async function executeArxivSearch(
  _n: string,
  params: Record<string, unknown>
) {
  const query = String(params.query || params.q || '').trim()
  const maxResults = Math.min(
    10,
    Math.max(1, Number(params.maxResults || params.limit || 5) || 5)
  )
  if (!query) throw new Error('يلزم استعلام arXiv.')
  if (IS_AIR_GAPPED_MODE) return airgapBlock()

  const api = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${maxResults}`
  validateNetworkAccess(api)
  const res = await fetch(api, {
    headers: { 'User-Agent': UA, Accept: 'application/atom+xml' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    return {
      ok: false,
      messageAr: `فشل arXiv (HTTP ${res.status}).`,
    }
  }
  const xml = await res.text()
  const entries: Array<{
    id: string
    title: string
    summary: string
    published: string
    authors: string[]
    pdfUrl: string
  }> = []
  const entryRe = /<entry>([\s\S]*?)<\/entry>/gi
  let em: RegExpExecArray | null
  while ((em = entryRe.exec(xml)) && entries.length < maxResults) {
    const block = em[1]
    const pick = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
      return m ? decodeXmlEntities(m[1].replace(/\s+/g, ' ')) : ''
    }
    const id = pick('id')
    const title = pick('title')
    const summary = pick('summary').slice(0, 600)
    const published = pick('published')
    const authors: string[] = []
    const authorRe = /<name>([\s\S]*?)<\/name>/gi
    let am: RegExpExecArray | null
    while ((am = authorRe.exec(block)) && authors.length < 8) {
      authors.push(decodeXmlEntities(am[1]))
    }
    const pdfM = block.match(/title="pdf"[^>]*href="([^"]+)"/i) ||
      block.match(/href="([^"]+)"[^>]*title="pdf"/i)
    const pdfUrl =
      pdfM?.[1] ||
      (id.includes('arxiv.org/abs/')
        ? id.replace('/abs/', '/pdf/') + '.pdf'
        : '')
    if (title) {
      entries.push({ id, title, summary, published, authors, pdfUrl })
    }
  }

  return {
    ok: entries.length > 0,
    query,
    count: entries.length,
    results: entries,
    messageAr:
      entries.length > 0
        ? `عُثر على ${entries.length} ورقة على arXiv.`
        : 'لا نتائج على arXiv لهذه الصياغة.',
  }
}

export async function executeFxRate(
  _n: string,
  params: Record<string, unknown>
) {
  const from = String(params.from || params.base || 'USD')
    .trim()
    .toUpperCase()
  const to = String(params.to || params.quote || 'SAR')
    .trim()
    .toUpperCase()
  const amount = Math.max(0, Number(params.amount ?? 1) || 1)
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
    throw new Error('يلزم رمزا عملة من 3 أحرف (مثل USD و SAR).')
  }
  if (IS_AIR_GAPPED_MODE) return airgapBlock()

  // open.er-api includes SAR; Frankfurter (ECB) does not.
  const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`
  validateNetworkAccess(url)
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      return { ok: false, messageAr: `فشل سعر الصرف (HTTP ${res.status}).` }
    }
    const data = (await res.json()) as {
      result?: string
      rates?: Record<string, number>
      time_last_update_utc?: string
    }
    const rate = data.rates?.[to]
    if (typeof rate !== 'number') {
      return {
        ok: false,
        from,
        to,
        messageAr: `لا سعر متاح لـ ${from}→${to}.`,
      }
    }
    const converted = amount * rate
    return {
      ok: true,
      from,
      to,
      amount,
      rate,
      converted,
      asOf: data.time_last_update_utc || '',
      provider: 'open.er-api.com',
      messageAr: `${amount} ${from} = ${converted.toFixed(4)} ${to} (سعر ${rate}).`,
    }
  } catch (e) {
    return {
      ok: false,
      messageAr: e instanceof Error ? e.message : 'تعذّر جلب سعر الصرف.',
    }
  }
}

export async function executeGeocode(
  _n: string,
  params: Record<string, unknown>
) {
  const query = String(params.query || params.place || params.q || '').trim()
  if (!query) throw new Error('يلزم اسم مكان للترميز الجغرافي.')
  if (IS_AIR_GAPPED_MODE) return airgapBlock()

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=ar,en`
  validateNetworkAccess(url)
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': UA,
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      return { ok: false, messageAr: `فشل الترميز الجغرافي (HTTP ${res.status}).` }
    }
    const rows = (await res.json()) as Array<{
      display_name?: string
      lat?: string
      lon?: string
      type?: string
      importance?: number
    }>
    const results = (rows || []).map((r) => {
      const lat = Number(r.lat)
      const lon = Number(r.lon)
      const osm =
        Number.isFinite(lat) && Number.isFinite(lon)
          ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`
          : ''
      const gmaps =
        Number.isFinite(lat) && Number.isFinite(lon)
          ? `https://www.google.com/maps?q=${lat},${lon}`
          : ''
      return {
        name: String(r.display_name || '').slice(0, 240),
        lat,
        lon,
        type: String(r.type || ''),
        /** OpenStreetMap pin + zoom (مجاني). */
        osmUrl: osm,
        /** Google Maps pin (رابط عام بلا مفتاح API). */
        googleMapsUrl: gmaps,
        mapsUrl: osm || gmaps,
      }
    })
    const top = results[0]
    const linkHint =
      top?.mapsUrl
        ? ` خريطة: ${top.osmUrl || top.googleMapsUrl}`
        : ''
    return {
      ok: results.length > 0,
      query,
      count: results.length,
      results,
      attribution: '© OpenStreetMap contributors (ODbL)',
      messageAr:
        results.length > 0
          ? `عُثر على ${results.length} موقع لـ «${query}».${
              top
                ? ` الأقرب: ${top.name} (${top.lat}, ${top.lon}).${linkHint}`
                : ''
            }`
          : 'لا نتائج جغرافية.',
    }
  } catch (e) {
    return {
      ok: false,
      messageAr: e instanceof Error ? e.message : 'تعذّر الترميز الجغرافي.',
    }
  }
}

export async function executeDictionaryLookup(
  _n: string,
  params: Record<string, unknown>
) {
  const word = String(params.word || params.query || params.q || '')
    .trim()
    .toLowerCase()
  if (!word) throw new Error('يلزم كلمة للقاموس.')
  if (IS_AIR_GAPPED_MODE) return airgapBlock()

  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
  validateNetworkAccess(url)
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) {
      return {
        ok: false,
        word,
        messageAr:
          res.status === 404
            ? `لا تعريف إنجليزي لـ «${word}». جرّب wikipedia_lookup للعربية.`
            : `فشل القاموس (HTTP ${res.status}).`,
      }
    }
    const data = (await res.json()) as Array<{
      word?: string
      meanings?: Array<{
        partOfSpeech?: string
        definitions?: Array<{ definition?: string; example?: string }>
      }>
    }>
    const entry = data[0]
    const meanings = (entry?.meanings || []).slice(0, 4).map((m) => ({
      partOfSpeech: m.partOfSpeech || '',
      definitions: (m.definitions || [])
        .slice(0, 3)
        .map((d) => ({
          definition: String(d.definition || '').slice(0, 400),
          example: String(d.example || '').slice(0, 200),
        })),
    }))
    return {
      ok: meanings.length > 0,
      word: entry?.word || word,
      meanings,
      messageAr:
        meanings.length > 0
          ? `تعريف إنجليزي لـ «${entry?.word || word}».`
          : 'لا تعريفات.',
    }
  } catch (e) {
    return {
      ok: false,
      messageAr: e instanceof Error ? e.message : 'تعذّر القاموس.',
    }
  }
}

export async function executeHnSearch(
  _n: string,
  params: Record<string, unknown>
) {
  const query = String(params.query || params.q || '').trim()
  const limit = Math.min(10, Math.max(1, Number(params.limit || 5) || 5))
  if (!query) throw new Error('يلزم استعلام Hacker News.')
  if (IS_AIR_GAPPED_MODE) return airgapBlock()

  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=${limit}`
  validateNetworkAccess(url)
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      return { ok: false, messageAr: `فشل بحث HN (HTTP ${res.status}).` }
    }
    const data = (await res.json()) as {
      hits?: Array<{
        title?: string
        url?: string
        points?: number
        author?: string
        objectID?: string
        created_at?: string
      }>
    }
    const results = (data.hits || []).map((h) => ({
      title: String(h.title || '').slice(0, 200),
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      points: h.points ?? 0,
      author: h.author || '',
      createdAt: h.created_at || '',
    }))
    return {
      ok: results.length > 0,
      query,
      count: results.length,
      results,
      messageAr:
        results.length > 0
          ? `عُثر على ${results.length} نتيجة على Hacker News.`
          : 'لا نتائج على HN.',
    }
  } catch (e) {
    return {
      ok: false,
      messageAr: e instanceof Error ? e.message : 'تعذّر بحث HN.',
    }
  }
}

/**
 * Riyadh wall-clock + dual Gregorian/Hijri labels (local Intl — no paid key).
 * Association ops often need «اليوم هجري/ميلادي» without leaving Telegram.
 */
export async function executeSaudiDatetime(
  _n: string,
  params: Record<string, unknown>
) {
  const rawWhen = String(params.when || params.date || params.at || '').trim()
  let when: Date
  if (!rawWhen || /^(?:الآن|الان|اليوم|now|today)$/iu.test(rawWhen)) {
    when = new Date()
  } else {
    const parsed = new Date(rawWhen)
    if (Number.isNaN(parsed.getTime())) {
      return {
        ok: false,
        messageAr:
          'تعذّر قراءة التاريخ. مرّر ISO مثل 2026-08-11 أو اتركه فارغاً لـ«الآن».',
      }
    }
    when = parsed
  }

  const tz = 'Asia/Riyadh'
  const gregorian = new Intl.DateTimeFormat('ar-SA', {
    timeZone: tz,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(when)
  const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
    timeZone: tz,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(when)
  const isoRiyadh = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(when)

  return {
    ok: true,
    timeZone: tz,
    isoUtc: when.toISOString(),
    isoRiyadh,
    gregorianAr: gregorian,
    hijriAr: hijri,
    messageAr: `توقيت السعودية (Asia/Riyadh): ${gregorian} · هجري: ${hijri}`,
  }
}

/** Normalize URL for Wayback lookup. */
export function normalizeWaybackUrl(input: string): string | null {
  const s = String(input || '').trim()
  if (!s) return null
  if (/^(?:javascript|data|file|ftp|blob):/i.test(s)) return null
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.toString()
  } catch {
    return null
  }
}

/**
 * Internet Archive Wayback availability (free, no key) — useful for gov.sa /
 * association docs that change or go offline.
 */
export async function executeWaybackLookup(
  _n: string,
  params: Record<string, unknown>
) {
  const raw = String(params.url || params.link || params.query || '').trim()
  const target = normalizeWaybackUrl(raw)
  if (!target) throw new Error('يلزم رابط http(s) صالح لأرشيف الويب.')
  if (IS_AIR_GAPPED_MODE) return airgapBlock()

  const url = `https://archive.org/wayback/available?url=${encodeURIComponent(target)}`
  validateNetworkAccess(url)
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      return {
        ok: false,
        url: target,
        messageAr: `فشل أرشيف الويب (HTTP ${res.status}).`,
      }
    }
    const data = (await res.json()) as {
      archived_snapshots?: {
        closest?: {
          available?: boolean
          url?: string
          timestamp?: string
          status?: string
        }
      }
    }
    const closest = data.archived_snapshots?.closest
    const available = Boolean(closest?.available && closest?.url)
    return {
      ok: available,
      url: target,
      snapshotUrl: closest?.url || '',
      timestamp: closest?.timestamp || '',
      status: closest?.status || '',
      provider: 'archive.org/wayback',
      messageAr: available
        ? `لقطة أرشيف متاحة: ${closest!.url}`
        : `لا لقطة أرشيف متاحة حالياً لـ ${target}. جرّب web_fetch للصفحة الحية.`,
    }
  } catch (e) {
    return {
      ok: false,
      messageAr: e instanceof Error ? e.message : 'تعذّر أرشيف الويب.',
    }
  }
}
