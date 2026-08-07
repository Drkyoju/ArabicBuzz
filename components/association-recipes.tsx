'use client'

import { useState } from 'react'
import {
  Building2,
  CalendarDays,
  FolderSearch,
  Loader2,
  Users,
} from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { useWorkspaceModeStore } from '@/lib/scopes/workspace-mode-store'
import { ASSOCIATION_ROLE_SLOTS } from '@/lib/rooms/association-template-data'

const RECIPES = [
  {
    id: 'meeting',
    titleAr: 'تحضير اجتماع فريق',
    detailAr: 'غرفة مشتركة + ملخص قرارات يُسجَّل في سجل العمل.',
    section: 'chats',
    icon: Users,
  },
  {
    id: 'knowledge',
    titleAr: 'اسأل ملفات الفريق',
    detailAr: 'ابحث في معرفة Drive واطلب ملخصاً مع المصادر.',
    section: 'chats',
    icon: FolderSearch,
  },
  {
    id: 'calendar',
    titleAr: 'مواعيد الفريق',
    detailAr: 'تقويم مشترك + تذكير تيليجرام قبل المواعيد المهمة.',
    section: 'calendar',
    icon: CalendarDays,
  },
] as const

/** One-click association room + quick team recipes. */
export function AssociationRecipes({
  onNavigate,
}: {
  onNavigate?: (section: string) => void
}) {
  const createAssociationRoom = useWorkspaceStore((s) => s.createAssociationRoom)
  const canAccessOpsUi = useWorkspaceModeStore((s) => s.canAccessOpsUi)
  const [nameAr, setNameAr] = useState('غرفة الجمعية')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [wizardOpen, setWizardOpen] = useState(false)

  async function createRoom() {
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      const id = createAssociationRoom({ nameAr })
      let deadlineNote = ''
      try {
        const res = await fetch('/api/rooms/association-template', {
          method: 'POST',
          headers: await authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            scopeId: id,
            nameAr: nameAr.trim() || 'غرفة الجمعية',
            seedDeadlines: true,
          }),
        })
        const data = (await res.json()) as { messageAr?: string; error?: string }
        if (res.ok) deadlineNote = data.messageAr || ''
      } catch {
        /* guest / offline — room still created locally + persisted in browser */
      }
      setMsg(
        [
          `تم إنشاء «${nameAr.trim() || 'غرفة الجمعية'}».`,
          deadlineNote,
          'ادعُ المجلس واللجان من لوحة الفريق.',
        ]
          .filter(Boolean)
          .join(' ')
      )
      setWizardOpen(false)
      onNavigate?.('chats')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'تعذّر إنشاء الغرفة')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      id="ab-recipes"
      className="rounded-xl border border-ab-border bg-white p-4"
      dir="rtl"
    >
      <h2 className="text-sm font-bold text-ab-ink">مسارات سريعة للفريق</h2>
      <p className="mt-1 text-[11px] text-stone-500">
        {canAccessOpsUi
          ? 'قالب جمعية بضغطة · معرفة الملفات · مواعيد مشتركة.'
          : 'غرف ومحادثة · ملفات · مواعيد ومهام الفريق.'}
      </p>

      {canAccessOpsUi ? (
        <div className="mt-3 rounded-lg border border-ab-accent/30 bg-ab-accent/5 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ab-ink">
                <Building2 className="h-4 w-4 text-ab-accent" />
                قالب غرفة جمعية
              </p>
              <p className="mt-0.5 text-[11px] text-stone-600">
                أدوار جاهزة: مجلس · مدير تنفيذي · لجان · موظف · متطوع · مدقق — مع
                مواعيد نظامية ابتدائية اختيارية.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWizardOpen((v) => !v)}
              className="rounded-md bg-ab-accent px-3 py-1.5 text-xs font-semibold text-white"
            >
              {wizardOpen ? 'إخفاء' : 'إنشاء بضغطة'}
            </button>
          </div>

          {wizardOpen && (
            <div className="mt-3 space-y-2 border-t border-ab-accent/20 pt-3">
              <label className="block text-[11px] text-stone-600">
                اسم الغرفة
                <input
                  className="mt-1 w-full rounded-md border border-ab-border bg-white px-2.5 py-1.5 text-sm"
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  placeholder="غرفة جمعية الهدى…"
                />
              </label>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {ASSOCIATION_ROLE_SLOTS.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-md border border-ab-border/70 bg-white px-2 py-1.5 text-[11px]"
                  >
                    <span className="font-semibold text-ab-ink">{r.labelAr}</span>
                    <span className="mt-0.5 block text-stone-500">{r.hintAr}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={busy || !nameAr.trim()}
                onClick={() => void createRoom()}
                className="inline-flex items-center gap-1.5 rounded-md bg-ab-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Building2 className="h-3.5 w-3.5" />
                )}
                إنشاء غرفة الجمعية
              </button>
            </div>
          )}
          {msg && (
            <p className="mt-2 text-[11px] text-emerald-800">{msg}</p>
          )}
          {err && <p className="mt-2 text-[11px] text-ab-warn">{err}</p>}
        </div>
      ) : null}

      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {RECIPES.map((r) => {
          const Icon = r.icon
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onNavigate?.(r.section)}
                className="flex w-full items-start gap-2 rounded-lg border border-ab-border bg-stone-50/80 px-3 py-2.5 text-right transition-colors hover:border-ab-accent/40 hover:bg-ab-accent/5"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ab-accent" />
                <span>
                  <span className="block text-[13px] font-semibold text-ab-ink">
                    {r.titleAr}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-stone-500">
                    {r.detailAr}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** @deprecated alias — same component */
export const TeamRecipes = AssociationRecipes
