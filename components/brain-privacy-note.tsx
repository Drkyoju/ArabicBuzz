'use client'

import { Shield } from 'lucide-react'

/**
 * Honest privacy copy for brain uploads — not a ZDR certificate.
 */
export function BrainPrivacyNote({ compact }: { compact?: boolean }) {
  return (
    <div
      dir="rtl"
      className={
        compact
          ? 'rounded-md border border-amber-200/80 bg-amber-50/80 px-2.5 py-2 text-[11px] text-amber-950'
          : 'rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950'
      }
    >
      <p className="mb-1 flex items-center gap-1.5 font-semibold">
        <Shield className="h-3.5 w-3.5 shrink-0" aria-hidden />
        خصوصية عقل الغرفة
      </p>
      <ul className="list-disc space-y-1 pe-4 text-[11px] leading-relaxed text-amber-900/90">
        <li>
          المعرفة مربوطة بالغرفة — الأعضاء المدعوون يقدرون البحث فيها.
        </li>
        <li>
          عند الرفع قد تُرسل مقتطفات لواجهات مدفوعة (تضمين/OCR/إجابة) حسب
          المفاتيح المضبوطة — ليست دردشة مجانية عامة، لكن ليست عزلاً كاملاً.
        </li>
        <li>
          للملفات شديدة الحساسية (هويات، رواتب، بنوك): لا ترفعها إن لم ترد
          مشاركتها مع أعضاء الغرفة وفهرسة عقل الشركة.
        </li>
      </ul>
    </div>
  )
}
