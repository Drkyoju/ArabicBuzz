import { searchRoomUnified } from '@/lib/search/room-unified-search'
import { buildOwnerMorningBrief } from '@/lib/digest/owner-morning-brief'
import { emitNotification } from '@/lib/notifications/emit'

/** Unified search across org mail + room files/knowledge + room calendar. */
export async function executeRoomSearch(
  _n: string,
  params: Record<string, unknown>
) {
  const query = String(params.query || params.q || params.queryAr || '').trim()
  const scopeId = String(params.scopeId || 'shared-demo')
  const limit =
    typeof params.limit === 'number' ? params.limit : undefined
  return searchRoomUnified({ query, scopeId, limit })
}

/** Owner/staff morning brief (لوحة اليوم) — readable from Telegram. */
export async function executeOwnerMorningBrief(
  _n: string,
  params: Record<string, unknown>
) {
  const scopeId = String(params.scopeId || 'shared-demo')
  const brief = await buildOwnerMorningBrief(scopeId)
  const sendTelegram = params.sendTelegram === true

  if (sendTelegram && brief.hasContent) {
    const sent = await emitNotification({
      channel: 'telegram',
      textAr: brief.textAr,
      meta: { scopeId, kind: 'owner_morning_brief' },
    })
    return {
      ok: sent.ok,
      ...brief,
      sentTelegram: sent.ok,
      messageAr: sent.ok
        ? brief.textAr
        : `${brief.textAr}\n\n(تعذّر إرسال نسخة إضافية لتيليجرام)`,
    }
  }

  return {
    ok: true,
    ...brief,
    sentTelegram: false,
    messageAr: brief.hasContent
      ? brief.textAr
      : 'لا جديد هذا الصباح — لا بريد عاجل ولا تعارضات ولا مهام متأخرة.',
  }
}
