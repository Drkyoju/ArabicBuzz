'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Plus, Sparkles, Trash2 } from 'lucide-react'
import {
  KSA_SKILL_CATALOG,
  type KSASkillItem,
} from '@/lib/skills/marketplace'

type InstalledSkill = {
  id: string
  name: string
  description: string
  scope: 'personal' | 'shared'
  author?: string
}

export function SkillMarketplace({
  targetScopeId = 'shared-demo',
}: {
  targetScopeId?: string
}) {
  const scopeKind = targetScopeId.startsWith('personal')
    ? 'personal'
    : 'shared'

  const [nameAr, setNameAr] = useState('')
  const [descriptionAr, setDescriptionAr] = useState('')
  const [instructionsAr, setInstructionsAr] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [installBusy, setInstallBusy] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null)
  const [mine, setMine] = useState<InstalledSkill[]>([])
  const [showCatalog, setShowCatalog] = useState(true)
  const [proposals, setProposals] = useState<
    Array<{
      id: string
      name: string
      description: string
      previewInstructions?: string
    }>
  >([])
  const [proposalBusy, setProposalBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [skillsRes, propRes] = await Promise.all([
        fetch(`/api/skills?scope=${scopeKind}`),
        fetch('/api/skills/proposals'),
      ])
      const data = (await skillsRes.json()) as { skills?: InstalledSkill[] }
      const props = (await propRes.json()) as {
        proposals?: Array<{
          id: string
          name: string
          description: string
          previewInstructions?: string
        }>
      }
      setMine(Array.isArray(data.skills) ? data.skills : [])
      setProposals(Array.isArray(props.proposals) ? props.proposals : [])
    } catch {
      setMine([])
      setProposals([])
    }
  }, [scopeKind])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function createCustom(e: FormEvent) {
    e.preventDefault()
    setMessage('')
    setError('')
    const name = nameAr.trim()
    if (!name) {
      setError('اكتب اسم المهارة كما تريده')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: descriptionAr.trim() || name,
          scope: scopeKind,
          author: 'أنت',
          systemInstructions:
            instructionsAr.trim() ||
            `أنت مهارة باسم «${name}». نفّذ الطلبات ضمن هذا الدور بالعربية الفصحى.`,
          targetScopeId,
        }),
      })
      const data = (await res.json()) as {
        error?: string
        skill?: InstalledSkill
      }
      if (!res.ok) throw new Error(data.error || 'تعذر الحفظ')
      setMessage(`أُضيفت المهارة «${name}»`)
      setNameAr('')
      setDescriptionAr('')
      setInstructionsAr('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الحفظ')
    } finally {
      setBusy(false)
    }
  }

  async function installCatalog(skill: KSASkillItem) {
    setMessage('')
    setError('')
    setInstallBusy(skill.id)
    try {
      // Save under the catalog Arabic name via custom skills API so user owns the name
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: skill.id,
          name: skill.nameAr,
          description: skill.descriptionAr,
          scope: scopeKind,
          author: skill.author,
          systemInstructions: skill.skillMarkdownContent.replace(
            /^---[\s\S]*?---\s*/,
            ''
          ),
          targetScopeId,
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error || 'فشل التثبيت')
      setMessage(`أُضيفت «${skill.nameAr}»`)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التثبيت')
    } finally {
      setInstallBusy(null)
    }
  }

  async function removeSkill(skill: InstalledSkill) {
    if (!window.confirm(`حذف المهارة «${skill.name}»؟`)) return
    setDeleteBusy(skill.id)
    setMessage('')
    setError('')
    try {
      const res = await fetch(
        `/api/skills?id=${encodeURIComponent(skill.id)}`,
        { method: 'DELETE' }
      )
      const data = (await res.json()) as { error?: string; messageAr?: string }
      if (!res.ok) throw new Error(data.error || 'فشل الحذف')
      setMessage(data.messageAr || `حُذفت «${skill.name}»`)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الحذف')
    } finally {
      setDeleteBusy(null)
    }
  }

  async function decideProposal(
    id: string,
    decision: 'APPROVE' | 'REJECT'
  ) {
    setProposalBusy(id)
    setMessage('')
    setError('')
    try {
      const res = await fetch(`/api/skills/proposals/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      const data = (await res.json()) as { error?: string; messageAr?: string }
      if (!res.ok) throw new Error(data.error || 'فشل')
      setMessage(data.messageAr || 'تم')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل')
    } finally {
      setProposalBusy(null)
    }
  }

  return (
    <section dir="rtl">
      <form
        onSubmit={(e) => void createCustom(e)}
        className="mb-8 rounded-xl border border-ab-border bg-white p-4"
      >
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Plus className="h-4 w-4" aria-hidden />
          أضف مهارة باسمك
        </h3>
        <label className="mb-3 block">
          <span className="mb-1 block text-[11px] font-medium text-stone-500">
            الاسم (اختَر أنت)
          </span>
          <input
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            placeholder="مثال: مراجع عقود الشركة، مساعد المبيعات…"
            className="w-full rounded-md border border-ab-border bg-ab-stage px-3 py-2 text-sm"
            required
          />
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block text-[11px] font-medium text-stone-500">
            وصف مختصر
          </span>
          <input
            value={descriptionAr}
            onChange={(e) => setDescriptionAr(e.target.value)}
            placeholder="ماذا تفعل هذه المهارة؟"
            className="w-full rounded-md border border-ab-border bg-ab-stage px-3 py-2 text-sm"
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-[11px] font-medium text-stone-500">
            تعليمات للوكيل (اختياري)
          </span>
          <textarea
            value={instructionsAr}
            onChange={(e) => setInstructionsAr(e.target.value)}
            rows={4}
            placeholder="كيف يتصرف الوكيل عند استخدام هذه المهارة…"
            className="w-full resize-y rounded-md border border-ab-border bg-ab-stage px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-ab-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'جاري الحفظ…' : 'حفظ المهارة'}
        </button>
      </form>

      {message && (
        <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {message}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {proposals.length > 0 && (
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <h3 className="mb-2 text-sm font-semibold text-ab-ink">
            اقتراحات معلّقة ({proposals.length})
          </h3>
          <p className="mb-3 text-[11px] text-stone-600">
            مهارات مستخرجة من المحادثة — اعتمدها قبل أن تدخل حيّز الاستخدام.
          </p>
          <ul className="space-y-2">
            {proposals.map((p) => (
              <li
                key={p.id}
                className="rounded-lg border border-amber-200/80 bg-white px-3 py-2"
              >
                <p className="text-sm font-semibold">{p.name}</p>
                <p className="text-xs text-stone-500">{p.description}</p>
                {p.previewInstructions && (
                  <p className="mt-1 line-clamp-3 text-[11px] text-stone-600">
                    {p.previewInstructions}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={proposalBusy === p.id}
                    onClick={() => void decideProposal(p.id, 'APPROVE')}
                    className="rounded-md bg-ab-ink px-2.5 py-1 text-[11px] text-white disabled:opacity-40"
                  >
                    اعتماد المهارة
                  </button>
                  <button
                    type="button"
                    disabled={proposalBusy === p.id}
                    onClick={() => void decideProposal(p.id, 'REJECT')}
                    className="rounded-md border border-ab-border px-2.5 py-1 text-[11px] disabled:opacity-40"
                  >
                    رفض الاقتراح
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-8">
        <h3 className="mb-2 text-sm font-semibold text-ab-ink">
          مهاراتك الحالية ({mine.length})
        </h3>
        {mine.length === 0 ? (
          <p className="text-xs text-stone-500">
            لا يوجد بعد — أضف أول مهارة بالاسم اللي تبيه فوق.
          </p>
        ) : (
          <ul className="space-y-2">
            {mine.map((s) => (
              <li
                key={s.id}
                className="flex items-start justify-between gap-2 rounded-lg border border-ab-border bg-ab-surface px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ab-ink">{s.name}</p>
                  <p className="text-xs text-stone-500">{s.description}</p>
                </div>
                <button
                  type="button"
                  disabled={deleteBusy === s.id}
                  onClick={() => void removeSkill(s)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] text-red-700 disabled:opacity-40"
                  aria-label={`حذف ${s.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                  حذف
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-dashed border-ab-border bg-ab-stage/50 p-4">
        <button
          type="button"
          onClick={() => setShowCatalog((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-sm font-semibold text-ab-ink"
        >
          <span className="inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-ab-accent" aria-hidden />
            حزمة المملكة الجاهزة ({KSA_SKILL_CATALOG.length})
          </span>
          <span className="text-xs font-normal text-stone-500">
            {showCatalog ? 'إخفاء' : 'عرض'}
          </span>
        </button>
        <p className="mt-1 text-[11px] text-stone-500">
          حجوزات، ملخص اجتماع، مهام يومية، مراجعة معرفة، وامتثال سعودي — ثبّت
          ما تحتاجه.
        </p>
        {showCatalog && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {KSA_SKILL_CATALOG.map((skill) => (
              <article
                key={skill.id}
                className="rounded-lg border border-ab-border bg-white p-3"
              >
                <div className="mb-1 text-[10px] text-ab-accent">
                  {skill.category}
                </div>
                <h4 className="mb-1 text-sm font-semibold">{skill.nameAr}</h4>
                <p className="mb-3 text-xs text-stone-600">
                  {skill.descriptionAr}
                </p>
                <button
                  type="button"
                  disabled={installBusy === skill.id}
                  onClick={() => void installCatalog(skill)}
                  className="rounded-md border border-ab-border px-2.5 py-1.5 text-xs font-medium hover:bg-stone-50 disabled:opacity-40"
                >
                  {installBusy === skill.id ? '…' : 'إضافة بهذا الاسم'}
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
