'use client'

import { useState } from 'react'
import { Users, HelpCircle } from 'lucide-react'
import { useAgentRosterStore } from '@/lib/rooms/agent-roster-store'
import { cn } from '@/lib/utils'

/**
 * منفصل / تعاون with inline explanation (room orchestration clarity).
 */
export function CollabModeToggle({
  scopeId,
  className,
}: {
  scopeId: string
  className?: string
}) {
  const collabMode = useAgentRosterStore(
    (s) => s.collabModeByScope[scopeId] || 'solo'
  )
  const setCollabMode = useAgentRosterStore((s) => s.setCollabMode)
  const [showTip, setShowTip] = useState(false)

  return (
    <div className={cn('inline-flex flex-col items-stretch gap-1', className)} dir="rtl">
      <div className="inline-flex items-center gap-1">
        <div className="inline-flex rounded-md border border-ab-border bg-white p-0.5 text-[10px]">
          <button
            type="button"
            title="وكيل واحد يرد على كل رسالة"
            onClick={() => setCollabMode(scopeId, 'solo')}
            className={cn(
              'rounded px-2 py-0.5',
              collabMode === 'solo'
                ? 'bg-ab-ink text-white'
                : 'text-stone-600 hover:bg-stone-50'
            )}
          >
            منفصل
          </button>
          <button
            type="button"
            title="عدة وكلاء يعملون معاً على نفس المهمة"
            onClick={() => setCollabMode(scopeId, 'team')}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-0.5',
              collabMode === 'team'
                ? 'bg-ab-accent text-white'
                : 'text-stone-600 hover:bg-stone-50'
            )}
          >
            <Users className="h-3 w-3" />
            تعاون
          </button>
        </div>
        <button
          type="button"
          aria-label="شرح أوضاع الوكلاء"
          aria-expanded={showTip}
          onClick={() => setShowTip((v) => !v)}
          className={cn(
            'rounded p-0.5 text-stone-400 hover:bg-stone-100 hover:text-ab-ink',
            showTip && 'text-ab-accent'
          )}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </div>
      {showTip && (
        <div className="max-w-xs rounded-lg border border-ab-border bg-stone-50 px-2.5 py-2 text-[10px] leading-relaxed text-stone-600">
          <p>
            <strong className="text-ab-ink">منفصل:</strong> وكيل واحد (أو من
            تُشير إليه بـ @) يرد — مناسب للمهام السريعة.
          </p>
          <p className="mt-1">
            <strong className="text-ab-ink">تعاون:</strong> حتى ٨ وكلاء/مهام
            معاً على نفس الطلب (سقف Netlify ٢٠) — مقاعد مشتركة لكل الموظفين في
            الغرفة. استخدم @الجميع لإجبار الوضع الجماعي.
          </p>
        </div>
      )}
    </div>
  )
}
