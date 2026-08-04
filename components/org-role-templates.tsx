'use client'

import { useState } from 'react'
import { Building2, Loader2 } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import {
  KSA_SKILL_CATALOG,
  type KSASkillItem,
} from '@/lib/skills/marketplace'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'

type OrgTemplate = {
  id: string
  nameAr: string
  descriptionAr: string
  skillIds: string[]
  memoryHints: string[]
}

const ASSOCIATION_TEMPLATE: OrgTemplate = {
  id: 'ngo',
  nameAr: 'جمعية أهلية',
  descriptionAr: 'حوكمة NCNP + ملخص اجتماع + مهام يومية + معرفة + ملخص صباحي.',
  skillIds: [
    'ncnp_governance_auditor',
    'meeting_minutes_summary',
    'daily_ops_checklist',
    'knowledge_doc_reviewer',
  ],
  memoryHints: [
    'هذه مساحة جمعية أهلية — التزم بمعايير المركز الوطني (NCNP).',
    'اللغة الرسمية: العربية الفصحى المهنية.',
  ],
}

function catalogById(id: string): KSASkillItem | undefined {
  return KSA_SKILL_CATALOG.find((s) => s.id === id)
}

/**
 * One-click association pack — installs NGO skills + memory for active scope.
 * (Company / law firm templates removed — product is association-only.)
 */
export function OrgRoleTemplates({
  onDone,
}: {
  onDone?: () => void
}) {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const addMemory = useWorkspaceStore((s) => s.addMemory)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function apply() {
    const t = ASSOCIATION_TEMPLATE
    setBusy(true)
    setMsg('')
    setErr('')
    try {
      let installed = 0
      for (const skillId of t.skillIds) {
        const skill = catalogById(skillId)
        if (!skill) continue
        const res = await fetch('/api/skills', {
          method: 'POST',
          headers: await authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            id: skill.id,
            name: skill.nameAr,
            description: skill.descriptionAr,
            systemInstructions: skill.skillMarkdownContent,
            scope: scopeId.startsWith('personal') ? 'personal' : 'shared',
            author: skill.author,
          }),
        })
        if (res.ok || res.status === 201) installed += 1
      }
      for (const hint of t.memoryHints) {
        addMemory(scopeId, hint)
      }
      await fetch('/api/crons/register', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          scopeId,
          nameAr: 'ملخص صباحي',
          prompt:
            'لخّص نشاط الغرفة لليوم بالعربية الفصحى، واذكر المعلّقات والمواعيد.',
          hour: 9,
          notifyChannels: ['telegram'],
        }),
      }).catch(() => null)
      setMsg(
        `طُبّق قالب الجمعية: ${installed} مهارة + ذاكرة + ملخص صباحي.`
      )
      onDone?.()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل التطبيق')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mb-8" dir="rtl">
      <h3 className="mb-1 text-sm font-semibold text-ab-ink">
        قالب الجمعية
      </h3>
      <p className="mb-3 text-[11px] text-stone-500">
        ثبّت حزمة مهارات الجمعية الأهلية لمساحتك الحالية بنقرة.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void apply()}
        className="w-full max-w-md rounded-xl border border-ab-border bg-white p-3 text-right hover:border-ab-accent/40 disabled:opacity-50"
      >
        <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ab-ink">
          <Building2 className="h-4 w-4" aria-hidden />
          {ASSOCIATION_TEMPLATE.nameAr}
        </p>
        <p className="text-[11px] text-stone-500">
          {ASSOCIATION_TEMPLATE.descriptionAr}
        </p>
        {busy && (
          <p className="mt-2 inline-flex items-center gap-1 text-[10px] text-ab-accent">
            <Loader2 className="h-3 w-3 animate-spin" /> جاري التثبيت…
          </p>
        )}
      </button>
      {msg && (
        <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {msg}
        </p>
      )}
      {err && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {err}
        </p>
      )}
    </section>
  )
}
