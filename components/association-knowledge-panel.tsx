'use client'

import { useState } from 'react'
import { Globe, Loader2, Users } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { BrainPrivacyNote } from '@/components/brain-privacy-note'

/**
 * Association knowledge helpers: pull policy URLs into brain + attendance report.
 */
export function AssociationKnowledgePanel() {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const [urls, setUrls] = useState('')
  const [titleAr, setTitleAr] = useState('')
  const [busy, setBusy] = useState(false)
  const [reportBusy, setReportBusy] = useState(false)
  const [note, setNote] = useState('')
  const [report, setReport] = useState<{
    summaryAr?: string
    members?: Array<{
      nameAr: string
      email: string | null
      role: string
      actionsLastDays: number
    }>
  } | null>(null)

  async function ingestUrls() {
    const list = urls
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u))
    if (!list.length) {
      setNote('الصق رابطاً واحداً أو أكثر (http/https) لصفحات السياسات أو الأنظمة.')
      return
    }
    setBusy(true)
    setNote('جاري سحب الصفحات إلى معرفة الغرفة…')
    try {
      const res = await fetch('/api/brain/ingest-url', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          scopeId,
          urls: list,
          titlePrefixAr: titleAr.trim() || undefined,
        }),
      })
      const data = (await res.json()) as {
        error?: string
        messageAr?: string
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setNote(data.messageAr || 'أُضيفت الصفحات للمعرفة')
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'فشل السحب')
    } finally {
      setBusy(false)
    }
  }

  async function loadAttendance() {
    setReportBusy(true)
    setNote('')
    try {
      const res = await fetch(
        `/api/rooms/reports?scopeId=${encodeURIComponent(scopeId)}&days=14`,
        { headers: await authHeaders() }
      )
      const data = (await res.json()) as {
        error?: string
        summaryAr?: string
        members?: Array<{
          nameAr: string
          email: string | null
          role: string
          actionsLastDays: number
        }>
        messageAr?: string
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setReport(data)
      setNote(data.summaryAr || data.messageAr || 'تم التقرير')
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'فشل التقرير')
      setReport(null)
    } finally {
      setReportBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-ab-border bg-ab-surface p-4 text-sm">
      <h3 className="mb-1 flex items-center gap-1.5 font-semibold">
        <Globe className="h-4 w-4" aria-hidden />
        معرفة الجمعية من الويب
      </h3>
      <p className="mb-3 text-xs text-stone-500">
        اسحب صفحات السياسات والأنظمة (NCNP، وزارة، لوائح داخلية) إلى معرفة الغرفة
        عبر المسار المجاني (Jina Reader / جلب مباشر). Firecrawl اختياري بمفتاح.
      </p>
      <div className="mb-3">
        <BrainPrivacyNote compact />
      </div>
      <label className="mb-1 block text-xs text-stone-600">عنوان اختياري</label>
      <input
        dir="rtl"
        className="mb-2 w-full rounded-md border border-ab-border bg-white px-3 py-2 text-sm"
        placeholder="مثال: لائحة الحوكمة 2026"
        value={titleAr}
        onChange={(e) => setTitleAr(e.target.value)}
      />
      <label className="mb-1 block text-xs text-stone-600">
        روابط (سطر لكل رابط)
      </label>
      <textarea
        dir="ltr"
        className="mb-3 w-full rounded-md border border-ab-border bg-white px-3 py-2 font-mono text-xs"
        rows={3}
        placeholder="https://…"
        value={urls}
        onChange={(e) => setUrls(e.target.value)}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => void ingestUrls()}
        className="inline-flex items-center gap-1.5 rounded-md bg-ab-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Globe className="h-3.5 w-3.5" />
        )}
        سحب إلى المعرفة
      </button>

      <div className="mt-5 border-t border-ab-border pt-4">
        <h4 className="mb-1 flex items-center gap-1.5 font-semibold">
          <Users className="h-4 w-4" aria-hidden />
          تقرير أعضاء وحضور
        </h4>
        <p className="mb-2 text-xs text-stone-500">
          ملخص نشاط الأعضاء والمواعيد وجلسات Zoom من قاعدة الغرفة (آخر 14 يوماً).
        </p>
        <button
          type="button"
          disabled={reportBusy}
          onClick={() => void loadAttendance()}
          className="inline-flex items-center gap-1.5 rounded-md border border-ab-border bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          {reportBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Users className="h-3.5 w-3.5" />
          )}
          إنشاء التقرير
        </button>
        {report?.members && report.members.length > 0 && (
          <ul className="mt-3 max-h-48 space-y-1 overflow-auto text-xs">
            {report.members.map((m) => (
              <li
                key={`${m.email || m.nameAr}-${m.role}`}
                className="flex justify-between gap-2 border-b border-stone-100 py-1"
              >
                <span>
                  {m.nameAr}
                  {m.email ? (
                    <span className="ms-1 text-stone-400" dir="ltr">
                      {m.email}
                    </span>
                  ) : null}
                  <span className="ms-1 text-stone-400">({m.role})</span>
                </span>
                <span className="shrink-0 text-stone-600">
                  {m.actionsLastDays} إجراء
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {note ? (
        <p className="mt-3 text-xs text-stone-600" role="status">
          {note}
        </p>
      ) : null}

      <ol className="mt-4 list-decimal space-y-1 border-t border-ab-border pe-4 pt-3 text-xs text-stone-600">
        <li>
          املأ Drive عقل الجمعية بسياسات NCNP + اللائحة الأساسية + نماذج
          المحاضر (من لوحة Drive أعلاه أو السحب بالروابط).
        </li>
        <li>
          السحب يعمل بدون مفاتيح. Firecrawl اختياري فقط. تفريغ الصوت: Willow →
          Gemini → Hugging Face → Groq (النسخ الاحتياطية اختيارية حسب المفاتيح).
        </li>
        <li>
          ابنِ سجل الأعضاء من لوحة الغرفة (اسم · جوال · لجنة) — هذا يفرق عن
          أدوات الدردشة العامة.
        </li>
      </ol>
    </div>
  )
}
