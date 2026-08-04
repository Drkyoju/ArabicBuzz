'use client'

import { ShieldCheck, CalendarDays, Users } from 'lucide-react'

const RECIPES = [
  {
    id: 'board',
    titleAr: 'تحضير اجتماع مجلس',
    detailAr: 'غرفة الفريق + Zoom + ملخص قرارات يوقّعه الوكيل في سجل التدقيق.',
    section: 'chats',
    icon: Users,
  },
  {
    id: 'deadlines',
    titleAr: 'ترخيص وإفصاح',
    detailAr: 'مواعيد النظام + تذكير تيليجرام قبل انتهاء الترخيص أو الإفصاح.',
    section: 'calendar',
    icon: CalendarDays,
  },
  {
    id: 'hitl',
    titleAr: 'موافقة بشرية حساسة',
    detailAr: 'راجع HITL قبل مزامنة Drive أو إرسال جماعي — لا تنفيذ بلا اعتماد.',
    section: 'approvals',
    icon: ShieldCheck,
  },
] as const

/** Association one-click workflows — governance cycle, not generic agent chat. */
export function AssociationRecipes({
  onNavigate,
}: {
  onNavigate?: (section: string) => void
}) {
  return (
    <div
      id="ab-recipes"
      className="rounded-xl border border-ab-border bg-white p-4"
      dir="rtl"
    >
      <h2 className="text-sm font-bold text-ab-ink">وصفات عمل الجمعية</h2>
      <p className="mt-1 text-[11px] text-stone-500">
        مسارات جاهزة لدورة الحوكمة: مجلس → موافقة بشرية → إفصاح وترخيص.
      </p>
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
