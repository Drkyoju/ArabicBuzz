'use client'

import { useState } from 'react'
import { Building2, Briefcase, Scale, Loader2 } from 'lucide-react'
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
  icon: 'ngo' | 'company' | 'law'
  skillIds: string[]
  memoryHints: string[]
}

const TEMPLATES: OrgTemplate[] = [
  {
    id: 'ngo',
    nameAr: 'جمعية أهلية',
    descriptionAr: 'حوكمة NCNP + ملخص اجتماع + مهام يومية + معرفة.',
    icon: 'ngo',
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
  },
  {
    id: 'company',
    nameAr: 'شركة / منشأة',
    descriptionAr: 'ZATCA + توطين + حجوزات + ملخص اجتماع.',
    icon: 'company',
    skillIds: [
      'zatca_e_invoicing_checker',
      'qiwa_saudization_calc',
      'calendar_booking_assistant',
      'meeting_minutes_summary',
    ],
    memoryHints: [
      'سياق شركة سعودية — راجع الامتثال الضريبي والتوطين قبل الاعتماد.',
    ],
  },
  {
    id: 'law',
    nameAr: 'مكتب محاماة',
    descriptionAr: 'ملخص محكمة + مراجعة معرفة + محاضر.',
    icon: 'law',
    skillIds: [
      'commercial_court_brief',
      'knowledge_doc_reviewer',
      'meeting_minutes_summary',
    ],
    memoryHints: [
      'لا تقدّم فتوى قانونية نهائية — لخّص المصادر واطلب مراجعة بشرية.',
    ],
  },
]

function Icon({ kind }: { kind: OrgTemplate['icon'] }) {
  if (kind === 'company') return <Briefcase className="h-4 w-4" aria-hidden />
  if (kind === 'law') return <Scale className="h-4 w-4" aria-hidden />
  return <Building2 className="h-4 w-4" aria-hidden />
}

function catalogById(id: string): KSASkillItem | undefined {
  return KSA_SKILL_CATALOG.find((s) => s.id === id)
}

/**
 * One-click KSA org packs — installs catalog skills + memory hints for active scope.
 */
export function OrgRoleTemplates({
  onDone,
}: {
  onDone?: () => void
}) {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const addMemory = useWorkspaceStore((s) => s.addMemory)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function apply(t: OrgTemplate) {
    setBusy(t.id)
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
      // Ensure morning digest for ops-heavy templates
      if (t.id === 'ngo' || t.id === 'company') {
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
      }
      setMsg(
        `طُبّق قالب «${t.nameAr}»: ${installed} مهارة + ذاكرة${
          t.id !== 'law' ? ' + ملخص صباحي' : ''
        }.`
      )
      onDone?.()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل التطبيق')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mb-8" dir="rtl">
      <h3 className="mb-1 text-sm font-semibold text-ab-ink">
        قوالب جاهزة للمنظمة
      </h3>
      <p className="mb-3 text-[11px] text-stone-500">
        ثبّت حزمة مهارات مناسبة لمساحتك الحالية بنقرة واحدة.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={busy !== null}
            onClick={() => void apply(t)}
            className="rounded-xl border border-ab-border bg-white p-3 text-right hover:border-ab-accent/40 disabled:opacity-50"
          >
            <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ab-ink">
              <Icon kind={t.icon} />
              {t.nameAr}
            </p>
            <p className="text-[11px] text-stone-500">{t.descriptionAr}</p>
            {busy === t.id && (
              <p className="mt-2 inline-flex items-center gap-1 text-[10px] text-ab-accent">
                <Loader2 className="h-3 w-3 animate-spin" /> جاري التثبيت…
              </p>
            )}
          </button>
        ))}
      </div>
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
