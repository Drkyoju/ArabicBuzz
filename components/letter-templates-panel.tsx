'use client'

import { useEffect, useState } from 'react'
import { Download, FileText, Loader2 } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'

type Field = {
  key: string
  labelAr: string
  placeholderAr?: string
  multiline?: boolean
}

type Template = {
  id: string
  titleAr: string
  descriptionAr: string
  fields: Field[]
}

/** Compact MSA letter templates → Word/PDF download (+ optional room save). */
export function LetterTemplatesPanel() {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const [templates, setTemplates] = useState<Template[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/letters/templates', {
          headers: await authHeaders(),
        })
        const data = (await res.json()) as { templates?: Template[] }
        const list = data.templates || []
        setTemplates(list)
        if (list[0]) setActiveId(list[0].id)
      } catch {
        setErr('تعذّر تحميل القوالب')
      }
    })()
  }, [])

  const active = templates.find((t) => t.id === activeId) || templates[0]

  async function generate(format: 'docx' | 'pdf', saveToRoom: boolean) {
    if (!active || busy) return
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      const res = await fetch('/api/letters/templates', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          templateId: active.id,
          values,
          format,
          scopeId,
          saveToRoom,
        }),
      })
      const data = (await res.json()) as {
        error?: string
        messageAr?: string
        filename?: string
        contentBase64?: string
        mimeType?: string
      }
      if (!res.ok) throw new Error(data.error || 'فشل التوليد')
      if (data.contentBase64 && data.filename) {
        const bin = atob(data.contentBase64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const blob = new Blob([bytes], {
          type: data.mimeType || 'application/octet-stream',
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = data.filename
        a.click()
        URL.revokeObjectURL(url)
      }
      setMsg(data.messageAr || 'تم')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      id="letter-templates"
      className="rounded-xl border border-ab-border bg-ab-surface p-3"
      dir="rtl"
    >
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ab-ink">
        <FileText className="h-4 w-4 text-ab-accent" aria-hidden />
        قوالب خطابات الجمعية
      </h3>
      <p className="mb-2 text-[11px] text-ab-muted">
        املأ الحقول ثم حمّل Word أو PDF — أو احفظ في ملفات الغرفة.
      </p>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setActiveId(t.id)
              setValues({})
              setMsg('')
              setErr('')
            }}
            className={
              t.id === active?.id
                ? 'rounded-md bg-ab-accent px-2 py-1 text-[11px] font-semibold text-white'
                : 'rounded-md border border-ab-border bg-white px-2 py-1 text-[11px] text-ab-ink'
            }
          >
            {t.titleAr}
          </button>
        ))}
      </div>

      {active ? (
        <>
          <p className="mb-2 text-[11px] text-ab-muted">{active.descriptionAr}</p>
          <div className="space-y-2">
            {active.fields.map((f) =>
              f.multiline ? (
                <label key={f.key} className="block text-[11px] font-medium text-ab-ink">
                  {f.labelAr}
                  <textarea
                    className="mt-0.5 min-h-[4.5rem] w-full rounded-md border border-ab-border bg-white px-2 py-1.5 text-[12px]"
                    value={values[f.key] || ''}
                    placeholder={f.placeholderAr}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [f.key]: e.target.value }))
                    }
                  />
                </label>
              ) : (
                <label key={f.key} className="block text-[11px] font-medium text-ab-ink">
                  {f.labelAr}
                  <input
                    className="mt-0.5 w-full rounded-md border border-ab-border bg-white px-2 py-1.5 text-[12px]"
                    value={values[f.key] || ''}
                    placeholder={f.placeholderAr}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [f.key]: e.target.value }))
                    }
                  />
                </label>
              )
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void generate('docx', false)}
              className="inline-flex items-center gap-1 rounded-md bg-ab-accent px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Word
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void generate('pdf', false)}
              className="inline-flex items-center gap-1 rounded-md border border-ab-border bg-white px-2.5 py-1.5 text-[11px] font-semibold text-ab-ink disabled:opacity-40"
            >
              PDF
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void generate('docx', true)}
              className="inline-flex items-center gap-1 rounded-md border border-ab-border bg-white px-2.5 py-1.5 text-[11px] font-semibold text-ab-ink disabled:opacity-40"
            >
              Word + حفظ في الغرفة
            </button>
          </div>
        </>
      ) : null}

      {msg ? <p className="mt-2 text-[11px] text-emerald-800">{msg}</p> : null}
      {err ? <p className="mt-2 text-[11px] text-rose-700">{err}</p> : null}
    </section>
  )
}
