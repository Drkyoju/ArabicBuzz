'use client'

import { useState } from 'react'
import {
  MessageSquare,
  ShieldCheck,
  Plug,
  Settings,
  Users,
  User,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react'
import { AirGapBadge } from '@/components/airgap-badge'
import { useModelPickerStore } from '@/lib/ai/model-picker-store'
import type { HarnessModelSlug } from '@/lib/ai/harness-catalog'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { isPersonalScope, isSharedScope } from '@/lib/scopes/manager'
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
  { id: 'chats', labelAr: 'الغرف والمساحات', icon: MessageSquare },
  { id: 'approvals', labelAr: 'سجل الموافقات', icon: ShieldCheck },
  { id: 'integrations', labelAr: 'التكاملات', icon: Plug },
  { id: 'settings', labelAr: 'الإعدادات', icon: Settings },
]

const SIDEBAR_MODELS: Array<{ slug: HarnessModelSlug; labelAr: string }> = [
  { slug: 'glm-4.5', labelAr: 'GLM-4.5' },
  { slug: 'gemini-2.0-flash', labelAr: 'Gemini 2.0 Flash' },
  { slug: 'claude-3.5-sonnet', labelAr: 'Claude 3.5 Sonnet' },
  { slug: 'deepseek-v3', labelAr: 'DeepSeek-V3' },
  { slug: 'qwen-2.5-72b', labelAr: 'Qwen 2.5' },
  { slug: 'perplexity-sonar', labelAr: 'Perplexity Sonar' },
]

function SidebarBody({
  airGapped,
  activeSection,
  onSectionChange,
  onNavigate,
}: {
  airGapped?: boolean
  activeSection: SidebarSection
  onSectionChange?: (section: SidebarSection) => void
  onNavigate?: () => void
}) {
  const { selectedModel, setSelectedModel } = useModelPickerStore()
  const modelValue = SIDEBAR_MODELS.some((m) => m.slug === selectedModel)
    ? selectedModel
    : 'gemini-2.0-flash'

  const activeScopeId = useWorkspaceStore((s) => s.activeScopeId)
  const setActiveScopeId = useWorkspaceStore((s) => s.setActiveScopeId)
  const personal = useWorkspaceStore((s) => s.personalScopes())
  const shared = useWorkspaceStore((s) => s.sharedScopes())

  return (
    <>
      <div className="border-b border-ab-border px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold tracking-tight text-ab-ink">
            Arabic Buzz
          </h1>
          <AirGapBadge airGapped={airGapped} />
        </div>
        <p className="mt-1 text-xs text-stone-500">غرفة عمل بشر ووكلاء</p>
      </div>

      <nav className="flex flex-col gap-1 border-b border-ab-border p-3">
        {NAV.map(({ id, labelAr, icon: Icon }) => {
          const active = activeSection === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                onSectionChange?.(id)
                onNavigate?.()
              }}
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

      {activeSection === 'chats' && (
        <div className="flex-1 overflow-y-auto p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-stone-500">
            <User className="h-3 w-3" aria-hidden />
            مساحاتي
          </p>
          <ul className="mb-4 space-y-1">
            {personal.map((scope) => {
              if (!isPersonalScope(scope)) return null
              const active = activeScopeId === scope.id
              return (
                <li key={scope.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveScopeId(scope.id)
                      onSectionChange?.('chats')
                      onNavigate?.()
                    }}
                    className={cn(
                      'w-full rounded-md px-3 py-2 text-right text-sm transition-colors',
                      active
                        ? 'bg-ab-accent text-white'
                        : 'text-ab-ink hover:bg-stone-100'
                    )}
                  >
                    <span className="block font-medium">{scope.nameAr}</span>
                  </button>
                </li>
              )
            })}
          </ul>

          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-stone-500">
            <Users className="h-3 w-3" aria-hidden />
            مساحات مشتركة
          </p>
          <ul className="space-y-1">
            {shared.map((scope) => {
              if (!isSharedScope(scope)) return null
              const active = activeScopeId === scope.id
              return (
                <li key={scope.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveScopeId(scope.id)
                      onSectionChange?.('chats')
                      onNavigate?.()
                    }}
                    className={cn(
                      'w-full rounded-md px-3 py-2 text-right text-sm transition-colors',
                      active
                        ? 'bg-ab-accent text-white'
                        : 'text-ab-ink hover:bg-stone-100'
                    )}
                  >
                    <span className="block font-medium">{scope.nameAr}</span>
                    <span
                      className={cn(
                        'mt-0.5 block text-[11px]',
                        active ? 'text-white/80' : 'text-stone-500'
                      )}
                    >
                      {scope.memberLabelsAr.length} بشر ·{' '}
                      {scope.agentLabelsAr.length} وكلاء
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {activeSection !== 'chats' && <div className="flex-1" />}

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
    </>
  )
}

export function Sidebar({
  airGapped = false,
  activeSection = 'chats',
  onSectionChange,
}: {
  airGapped?: boolean
  activeSection?: SidebarSection
  onSectionChange?: (section: SidebarSection) => void
}) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-between border-b border-ab-border bg-ab-surface px-3 py-2 md:hidden">
        <button
          type="button"
          aria-label="فتح القائمة"
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-2 text-ab-ink"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-bold">Arabic Buzz</span>
        <span className="w-9" />
      </div>

      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-50 bg-black/30 md:hidden"
          aria-label="إغلاق"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-[60] flex w-[17.5rem] flex-col border-l border-ab-border bg-ab-surface transition-transform md:translate-x-0',
          mobileOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
        )}
        aria-label="الشريط الجانبي"
      >
        <button
          type="button"
          className="absolute left-2 top-2 rounded-md p-1 text-stone-500 md:hidden"
          aria-label="إغلاق القائمة"
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-4 w-4" />
        </button>
        <SidebarBody
          airGapped={airGapped}
          activeSection={activeSection}
          onSectionChange={onSectionChange}
          onNavigate={() => setMobileOpen(false)}
        />
      </aside>
    </>
  )
}
