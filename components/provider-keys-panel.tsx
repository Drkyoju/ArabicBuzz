'use client'

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { ExternalLink, KeyRound, Loader2, Trash2 } from 'lucide-react'

type ProviderStatus = {
  envName: string
  labelAr: string
  labelEn: string
  kind: 'llm' | 'stt' | 'local'
  hintAr: string
  docsUrl?: string
  source: 'override' | 'environment' | 'absent'
  configured: boolean
  maskedHint: string | null
  liveOk?: boolean | null
  liveDetail?: string
}

type ModelAvail = {
  slug: string
  labelAr: string
  provider: string
  requiresKey: string
  available: boolean
  missingKey: string | null
  blockedReasonAr?: string | null
}

type Snapshot = {
  providers: ProviderStatus[]
  models: ModelAvail[]
  serviceableCount: number
}

const SOURCE_AR: Record<ProviderStatus['source'], string> = {
  override: 'محفوظ من الواجهة',
  environment: 'من البيئة / Netlify',
  absent: 'غير مضبوط',
}

export function ProviderKeysPanel({
  onAvailabilityChange,
}: {
  onAvailabilityChange?: (snap: Snapshot) => void
}) {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const applySnap = useCallback(
    (data: Snapshot) => {
      setSnap(data)
      onAvailabilityChange?.(data)
    },
    [onAvailabilityChange]
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch('/api/settings/providers?fresh=1')
      const data = (await res.json()) as Snapshot & { error?: string }
      if (!res.ok) throw new Error(data.error || 'تعذر التحميل')
      applySnap(data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'تعذر التحميل')
    } finally {
      setLoading(false)
    }
  }, [applySnap])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function save(envName: string) {
    const apiKey = drafts[envName]?.trim()
    if (!apiKey) {
      setErr('أدخل مفتاحاً أولاً')
      return
    }
    setBusy(envName)
    setErr(null)
    setMsg(null)
    try {
      const res = await fetch('/api/settings/providers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envName, apiKey }),
      })
      const data = (await res.json()) as Snapshot & {
        error?: string
        message?: string
      }
      if (!res.ok) throw new Error(data.error || 'فشل الحفظ')
      applySnap(data)
      setDrafts((d) => ({ ...d, [envName]: '' }))
      setMsg(data.message || 'تم الحفظ')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل الحفظ')
    } finally {
      setBusy(null)
    }
  }

  async function remove(envName: string) {
    setBusy(envName)
    setErr(null)
    setMsg(null)
    try {
      const res = await fetch(
        `/api/settings/providers?envName=${encodeURIComponent(envName)}`,
        { method: 'DELETE' }
      )
      const data = (await res.json()) as Snapshot & {
        error?: string
        message?: string
      }
      if (!res.ok) throw new Error(data.error || 'فشل الحذف')
      applySnap(data)
      setMsg(data.message || 'حُذف')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل الحذف')
    } finally {
      setBusy(null)
    }
  }

  const llm = snap?.providers.filter((p) => p.kind === 'llm') || []
  const stt = snap?.providers.filter((p) => p.kind !== 'llm') || []
  const readyModels = snap?.models.filter((m) => m.available) || []
  const blockedModels = snap?.models.filter((m) => !m.available) || []

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ab-ink">
          <KeyRound className="h-4 w-4" aria-hidden />
          مفاتيح المزوّدين
        </h3>
        <p className="text-xs text-stone-500">
          الصق المفتاح هنا ثم احفظ — نتحقق مباشرة من المزوّد. النماذج تظهر في
          قائمة الغرفة فقط بعد نجاح التحقق (Gemini و GLM جاهزان إن كانت مفاتيحهما
          صالحة).
        </p>
      </div>

      {loading && (
        <p className="flex items-center gap-2 text-xs text-stone-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          جاري فحص المفاتيح…
        </p>
      )}
      {msg && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {msg}
        </p>
      )}
      {err && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {err}
        </p>
      )}

      <ProviderGroup
        title="نماذج المحادثة"
        providers={llm}
        drafts={drafts}
        busy={busy}
        setDrafts={setDrafts}
        onSave={save}
        onRemove={remove}
      />
      <ProviderGroup
        title="صوت · محلي"
        providers={stt}
        drafts={drafts}
        busy={busy}
        setDrafts={setDrafts}
        onSave={save}
        onRemove={remove}
      />

      {snap && (
        <div className="rounded-xl border border-ab-border bg-ab-surface p-4">
          <h4 className="mb-2 text-sm font-semibold">
            النماذج المتاحة ({snap.serviceableCount})
          </h4>
          {readyModels.length === 0 ? (
            <p className="text-xs text-amber-800">
              لا يوجد نموذج جاهز — أضف مفتاح Gemini أو GLM على الأقل وتحقق منه.
            </p>
          ) : (
            <ul className="mb-3 flex flex-wrap gap-1.5">
              {readyModels.map((m) => (
                <li
                  key={m.slug}
                  className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-900"
                >
                  {m.labelAr}
                </li>
              ))}
            </ul>
          )}
          {blockedModels.length > 0 && (
            <>
              <p className="mb-1 text-[11px] font-medium text-stone-400">
                محظور حتى يُضاف مفتاح صالح
              </p>
              <ul className="space-y-1">
                {blockedModels.map((m) => (
                  <li
                    key={m.slug}
                    className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500"
                  >
                    <span dir="ltr">{m.labelAr}</span>
                    <span className="text-[10px] text-stone-400">
                      {m.blockedReasonAr || m.missingKey}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ProviderGroup({
  title,
  providers,
  drafts,
  busy,
  setDrafts,
  onSave,
  onRemove,
}: {
  title: string
  providers: ProviderStatus[]
  drafts: Record<string, string>
  busy: string | null
  setDrafts: Dispatch<SetStateAction<Record<string, string>>>
  onSave: (envName: string) => void
  onRemove: (envName: string) => void
}) {
  if (!providers.length) return null
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold text-stone-400">{title}</h4>
      <ul className="space-y-3">
        {providers.map((p) => (
          <li
            key={p.envName}
            className="rounded-xl border border-ab-border bg-white p-3"
          >
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-ab-ink">{p.labelAr}</p>
                <p className="text-[11px] text-stone-500">{p.hintAr}</p>
                <p className="mt-0.5 font-mono text-[10px] text-stone-400" dir="ltr">
                  {p.envName}
                </p>
              </div>
              <span
                className={
                  p.configured && p.liveOk !== false
                    ? 'rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800'
                    : p.configured && p.liveOk === false
                      ? 'rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700'
                      : 'rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800'
                }
              >
                {!p.configured
                  ? 'يحتاج مفتاحاً'
                  : p.liveOk === false
                    ? 'مرفوض'
                    : p.liveOk === true
                      ? 'يعمل'
                      : 'جاهز'}
              </span>
            </div>
            <p className="mb-2 text-[11px] text-stone-500">
              {SOURCE_AR[p.source]}
              {p.maskedHint ? (
                <span className="ms-2 font-mono" dir="ltr">
                  {p.maskedHint}
                </span>
              ) : null}
              {p.liveDetail ? (
                <span className="ms-2 text-stone-400">· {p.liveDetail}</span>
              ) : null}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="password"
                autoComplete="off"
                dir="ltr"
                className="min-w-0 flex-1 rounded-md border border-ab-border bg-ab-stage px-3 py-1.5 text-xs"
                placeholder={
                  p.configured
                    ? '•••• مضبوط — أدخل بديلاً'
                    : 'الصق المفتاح هنا'
                }
                value={drafts[p.envName] || ''}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [p.envName]: e.target.value }))
                }
                aria-label={`مفتاح ${p.labelAr}`}
              />
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy === p.envName}
                  onClick={() => onSave(p.envName)}
                  className="rounded-md bg-ab-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busy === p.envName ? '…' : 'حفظ'}
                </button>
                {p.source === 'override' && (
                  <button
                    type="button"
                    disabled={busy === p.envName}
                    onClick={() => onRemove(p.envName)}
                    className="rounded-md border border-ab-border p-1.5 text-stone-500 hover:text-red-600"
                    aria-label={`حذف مفتاح ${p.labelAr}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                {p.docsUrl && (
                  <a
                    href={p.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-ab-border p-1.5 text-stone-500 hover:text-ab-ink"
                    aria-label={`فتح توثيق ${p.labelAr}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
