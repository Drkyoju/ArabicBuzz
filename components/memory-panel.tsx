'use client'

import { Brain } from 'lucide-react'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { isPersonalScope } from '@/lib/scopes/manager'

export function MemoryPanel() {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const scopes = useWorkspaceStore((s) => s.scopes)
  const scope = scopes.find((s) => s.id === scopeId)

  const memories = scope
    ? isPersonalScope(scope)
      ? scope.privateMemory
      : scope.sharedMemory
    : []

  return (
    <section className="mx-auto max-w-3xl px-6 py-8" dir="rtl">
      <div className="mb-4">
        <h2 className="text-xl font-bold">ذاكرة المساحة</h2>
        <p className="mt-1 text-sm text-stone-500">
          {scope?.nameAr || scopeId} —{' '}
          {scope && isPersonalScope(scope)
            ? 'ذاكرة خاصة بهذه المساحة'
            : 'ذاكرة مشتركة للغرفة'}
        </p>
      </div>

      {memories.length === 0 ? (
        <div className="relative overflow-hidden rounded-xl border border-dashed border-ab-border bg-gradient-to-bl from-stone-50 via-white to-sky-50/50 px-6 py-14 text-center">
          <Brain className="mx-auto mb-3 h-10 w-10 text-stone-300" aria-hidden />
          <p className="text-base font-semibold text-ab-ink">لا ذكريات محفوظة</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-stone-500">
            عندما يحفظ الوكيل سياقاً أو تُدخل معرفة عبر عقل الشركة، تظهر هنا
            ليستند إليها في الردود.
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {memories.map((m, i) => (
            <li
              key={`${i}-${m.slice(0, 24)}`}
              className="rounded-lg border border-ab-border bg-ab-surface px-3 py-2.5 text-sm leading-relaxed text-ab-ink"
            >
              <span className="ml-2 text-[11px] font-semibold text-stone-400">
                {i + 1}.
              </span>
              {m}
            </li>
          ))}
        </ol>
      )}

      <p className="mt-6 text-xs text-stone-500">
        للبحث في عقل الشركة أثناء المحادثة، اطلب من الوكيل الاستناد إلى المصادر
        أو فعّل أداة البحث في المعرفة.
      </p>
    </section>
  )
}
