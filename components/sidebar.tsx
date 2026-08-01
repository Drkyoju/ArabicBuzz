'use client'

import {
  MessageSquare,
  ShieldCheck,
  Plug,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { AirGapBadge } from '@/components/airgap-badge'
import { useModelPickerStore } from '@/lib/ai/model-picker-store'
import type { HarnessModelSlug } from '@/lib/ai/harness-catalog'
import { cn } from '@/lib/utils'

export type SidebarSection =
  | 'chats'
  | 'approvals'
  | 'integrations'
  | 'settings'

const NAV: Array<{
  id: SidebarSection
  labelAr: string
  icon: LucideIcon
}> = [
  { id: 'chats', labelAr: 'المحادثات والوكلاء', icon: MessageSquare },
  { id: 'approvals', labelAr: 'سجل الموافقات', icon: ShieldCheck },
  { id: 'integrations', labelAr: 'التكاملات', icon: Plug },
  { id: 'settings', labelAr: 'الإعدادات', icon: Settings },
]

/** Sidebar model picker — Netlify UI subset requested for the canvas shell. */
const SIDEBAR_MODELS: Array<{ slug: HarnessModelSlug; labelAr: string }> = [
  { slug: 'claude-3.5-sonnet', labelAr: 'Claude 3.5 Sonnet' },
  { slug: 'deepseek-v3', labelAr: 'DeepSeek-V3' },
  { slug: 'qwen-2.5-72b', labelAr: 'Qwen 2.5' },
  { slug: 'gemini-2.0-flash', labelAr: 'Gemini 2.0 Flash' },
  { slug: 'perplexity-sonar', labelAr: 'Perplexity Sonar' },
]

export function Sidebar({
  airGapped = false,
  activeSection = 'chats',
  onSectionChange,
}: {
  airGapped?: boolean
  activeSection?: SidebarSection
  onSectionChange?: (section: SidebarSection) => void
}) {
  const { selectedModel, setSelectedModel } = useModelPickerStore()
  const modelValue = SIDEBAR_MODELS.some((m) => m.slug === selectedModel)
    ? selectedModel
    : 'gemini-2.0-flash'

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-[17.5rem] flex-col border-l border-ab-border bg-ab-surface"
      aria-label="الشريط الجانبي"
    >
      <div className="border-b border-ab-border px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold tracking-tight text-ab-ink">
            Arabic Buzz
          </h1>
          <AirGapBadge airGapped={airGapped} />
        </div>
        <p className="mt-1 text-xs text-stone-500">منصة الوكيل العربي</p>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV.map(({ id, labelAr, icon: Icon }) => {
          const active = activeSection === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSectionChange?.(id)}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
                active
                  ? 'bg-ab-accent/10 font-semibold text-ab-accent'
                  : 'text-ab-ink hover:bg-stone-100'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span>{labelAr}</span>
            </button>
          )
        })}
      </nav>

      <div className="border-t border-ab-border p-4">
        <label className="mb-2 block text-xs font-medium text-stone-500">
          النموذج
        </label>
        <select
          className="w-full rounded-md border border-ab-border bg-white px-3 py-2 text-sm text-ab-ink"
          value={modelValue}
          onChange={(e) =>
            setSelectedModel(e.target.value as HarnessModelSlug)
          }
          aria-label="اختيار النموذج"
        >
          {SIDEBAR_MODELS.map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.labelAr}
            </option>
          ))}
        </select>
      </div>
    </aside>
  )
}
