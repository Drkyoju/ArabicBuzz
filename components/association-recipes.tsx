'use client'

import { CalendarDays, FolderSearch, Users } from 'lucide-react'

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

/** One-click team workflows — Gulf multiplayer workspace, not association-only. */
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
      <h2 className="text-sm font-bold text-ab-ink">مسارات سريعة للفريق</h2>
      <p className="mt-1 text-[11px] text-stone-500">
        غرفة → معرفة الملفات → مواعيد مشتركة.
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

/** @deprecated alias — same component */
export const TeamRecipes = AssociationRecipes
