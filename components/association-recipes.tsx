'use client'

import {
  CalendarDays,
  FileText,
  FolderSearch,
  Archive,
  Sunrise,
  Mail,
  Users,
} from 'lucide-react'
import { PRIMARY_TEAM_SCOPE_ID } from '@/lib/scopes/primary-room'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { ORG_MAIL_DRAFT_EVENT } from '@/lib/ui/org-mail-focus'

const RECIPES = [
  {
    id: 'brief',
    titleAr: 'إحاطة الصباح',
    detailAr:
      'ملخص يوم واحد من لوحة اليوم: بريد · مواعيد الفريق · مهام — بدون سبام تذكيرات.',
    section: 'home',
    icon: Sunrise,
    promptHint: 'إحاطة الصباح',
  },
  {
    id: 'mail-draft',
    titleAr: 'مسودة رد الجمعية',
    detailAr:
      'افتح بريد الجمعية → اختر رسالة → «اكتب رد بالذكاء» بنبرة رسمية ومراعاة المرفقات.',
    section: 'mail',
    icon: Mail,
  },
  {
    id: 'team-calendar',
    titleAr: 'تقويم الفريق',
    detailAr:
      'أجندة الغرفة المشتركة + Zoom — أضف من Zoom أو احجز من الغرفة/تيليجرام.',
    section: 'calendar',
    icon: Users,
  },
  {
    id: 'archive',
    titleAr: 'أرشفة المستندات',
    detailAr: 'من تيليجرام أو الملفات: احفظ الفواتير/المحاضر في Drive + الغرفة.',
    section: 'files',
    icon: Archive,
  },
  {
    id: 'knowledge',
    titleAr: 'اسأل ملفات الفريق',
    detailAr: 'من غرفة الفريق: ابحث في المعرفة واطلب ملخصاً مع المصادر.',
    section: 'chats',
    icon: FolderSearch,
  },
  {
    id: 'calendar',
    titleAr: 'مواعيد اليوم',
    detailAr: 'تقويم مشترك + تذكير تيليجرام قبل الموعد بحوالي ساعة (مرة واحدة).',
    section: 'calendar',
    icon: CalendarDays,
  },
  {
    id: 'letters',
    titleAr: 'قوالب خطابات',
    detailAr: 'خطاب · تعميم · شكر · دعوة — من تقويم ← محضر وخطابات.',
    section: 'calendar:meetings',
    icon: FileText,
  },
] as const

/** Quick team recipes — always land on the primary shared room. */
export function AssociationRecipes({
  onNavigate,
}: {
  onNavigate?: (section: string) => void
}) {
  function openRecipe(r: (typeof RECIPES)[number]) {
    useWorkspaceStore.getState().setActiveScopeId(PRIMARY_TEAM_SCOPE_ID)
    if (r.id === 'mail-draft') {
      onNavigate?.('mail')
      try {
        window.dispatchEvent(new CustomEvent(ORG_MAIL_DRAFT_EVENT))
      } catch {
        /* ignore */
      }
      return
    }
    if (r.id === 'brief') {
      onNavigate?.('home')
      try {
        window.dispatchEvent(new CustomEvent('ab-morning-brief-focus'))
      } catch {
        /* ignore */
      }
      return
    }
    if (r.section === 'chats') {
      useWorkspaceStore.getState().setActiveScopeId(PRIMARY_TEAM_SCOPE_ID)
    }
    onNavigate?.(r.section)
  }

  return (
    <div
      id="ab-recipes"
      className="rounded-xl border border-ab-border bg-white p-4"
      dir="rtl"
    >
      <h2 className="text-sm font-bold text-ab-ink">مسارات سريعة للفريق</h2>
      <p className="mt-1 text-[11px] text-stone-500">
        إحاطة · مسودة بريد · تقويم فريق · أرشفة — مربوطة بمسارات العمل الحقيقية.
      </p>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {RECIPES.map((r) => {
          const Icon = r.icon
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => openRecipe(r)}
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
