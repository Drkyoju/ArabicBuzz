'use client'

import { useMemo, useState } from 'react'
import {
  MessageSquare,
  ShieldCheck,
  Settings,
  Users,
  User,
  Menu,
  X,
  FolderOpen,
  Plus,
  Sparkles,
  Brain,
  type LucideIcon,
} from 'lucide-react'
import { AirGapBadge } from '@/components/airgap-badge'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { isPersonalScope, isSharedScope } from '@/lib/scopes/manager'
import { cn } from '@/lib/utils'

export type SidebarSection =
  | 'chats'
  | 'files'
  | 'memory'
  | 'approvals'
  | 'skills'
  | 'settings'

const NAV: Array<{
  id: SidebarSection
  labelAr: string
  icon: LucideIcon
}> = [
  { id: 'chats', labelAr: 'الغرف', icon: MessageSquare },
  { id: 'files', labelAr: 'ملفات', icon: FolderOpen },
  { id: 'memory', labelAr: 'الذاكرة', icon: Brain },
  { id: 'approvals', labelAr: 'الموافقات', icon: ShieldCheck },
  { id: 'skills', labelAr: 'مهارات', icon: Sparkles },
  { id: 'settings', labelAr: 'الإعدادات', icon: Settings },
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
  const activeScopeId = useWorkspaceStore((s) => s.activeScopeId)
  const setActiveScopeId = useWorkspaceStore((s) => s.setActiveScopeId)
  const createPersonalDesk = useWorkspaceStore((s) => s.createPersonalDesk)
  const renameScope = useWorkspaceStore((s) => s.renameScope)
  const archiveScope = useWorkspaceStore((s) => s.archiveScope)
  const scopes = useWorkspaceStore((s) => s.scopes)
  const personal = useMemo(
    () => scopes.filter((s): s is typeof s & { userId: string } => isPersonalScope(s) && !s.archived),
    [scopes]
  )
  const shared = useMemo(
    () =>
      scopes.filter(
        (s): s is Extract<typeof s, { members: string[] }> =>
          isSharedScope(s) && !s.archived
      ),
    [scopes]
  )
  const [menuId, setMenuId] = useState<string | null>(null)

  return (
    <div className="flex h-full flex-col" dir="rtl">
      <div className="border-b border-ab-border px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-[15px] font-bold tracking-tight text-ab-ink">
              Arabic Buzz
            </h1>
            <p className="text-[10px] text-stone-500">وكيل متعدد اللاعبين</p>
          </div>
          <AirGapBadge airGapped={airGapped} />
        </div>
        <button
          type="button"
          onClick={() => {
            createPersonalDesk()
            onSectionChange?.('chats')
            onNavigate?.()
          }}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-ab-ink px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          جلسة جديدة
        </button>
      </div>

      <nav className="border-b border-ab-border p-2">
        <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
          تصفح
        </p>
        <ul className="space-y-0.5">
          {NAV.map(({ id, labelAr, icon: Icon }) => {
            const active = activeSection === id
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => {
                    onSectionChange?.(id)
                    onNavigate?.()
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors',
                    active
                      ? 'bg-ab-accent/10 font-semibold text-ab-accent'
                      : 'text-ab-ink hover:bg-stone-100'
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                  <span>{labelAr}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="flex-1 overflow-y-auto p-2">
        <p className="mb-1 flex items-center gap-1 px-2 text-[10px] font-semibold text-stone-400">
          <User className="h-3 w-3" aria-hidden />
          مساحاتي
        </p>
        <ul className="mb-3 space-y-0.5">
          {personal.map((scope) => {
            const active =
              activeSection === 'chats' && activeScopeId === scope.id
            return (
              <li key={scope.id} className="group relative">
                <button
                  type="button"
                  onClick={() => {
                    setActiveScopeId(scope.id)
                    onSectionChange?.('chats')
                    onNavigate?.()
                  }}
                  className={cn(
                    'w-full rounded-md px-2.5 py-1.5 text-right transition-colors',
                    active
                      ? 'bg-ab-ink text-white'
                      : 'text-ab-ink hover:bg-stone-100'
                  )}
                >
                  <span className="block text-[13px] font-medium">
                    {scope.nameAr}
                  </span>
                  {scope.descriptionAr && (
                    <span
                      className={cn(
                        'mt-0.5 block line-clamp-2 text-[10px] leading-snug',
                        active ? 'text-white/70' : 'text-stone-400'
                      )}
                    >
                      {scope.descriptionAr}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="absolute left-1 top-1 rounded px-1 text-[10px] text-stone-400 opacity-0 hover:bg-stone-200 hover:text-ab-ink group-hover:opacity-100"
                  aria-label="خيارات الجلسة"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuId((v) => (v === scope.id ? null : scope.id))
                  }}
                >
                  ⋯
                </button>
                {menuId === scope.id && (
                  <div className="absolute left-0 top-7 z-20 w-36 rounded-md border border-ab-border bg-white p-1 shadow-md">
                    <button
                      type="button"
                      className="block w-full rounded px-2 py-1.5 text-right text-[11px] hover:bg-stone-50"
                      onClick={() => {
                        const name = window.prompt('اسم الجلسة', scope.nameAr)
                        if (name) renameScope(scope.id, name)
                        setMenuId(null)
                      }}
                    >
                      إعادة تسمية
                    </button>
                    <button
                      type="button"
                      className="block w-full rounded px-2 py-1.5 text-right text-[11px] text-ab-warn hover:bg-stone-50"
                      onClick={() => {
                        archiveScope(scope.id, true)
                        setMenuId(null)
                      }}
                    >
                      أرشفة
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        <p className="mb-1 flex items-center gap-1 px-2 text-[10px] font-semibold text-stone-400">
          <Users className="h-3 w-3" aria-hidden />
          مساحات مشتركة
        </p>
        <ul className="space-y-0.5">
          {shared.map((scope) => {
            const active =
              activeSection === 'chats' && activeScopeId === scope.id
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
                    'w-full rounded-md px-2.5 py-1.5 text-right text-[13px] transition-colors',
                    active
                      ? 'bg-ab-ink text-white'
                      : 'text-ab-ink hover:bg-stone-100'
                  )}
                >
                  <span className="block font-medium">{scope.nameAr}</span>
                  <span
                    className={cn(
                      'mt-0.5 block text-[10px]',
                      active ? 'text-white/70' : 'text-stone-400'
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

      <div className="border-t border-ab-border px-3 py-2.5">
        <p className="text-[10px] leading-relaxed text-stone-500">
          {airGapped
            ? 'وضع محلي مغلق — الملفات والذاكرة على هذا الجهاز.'
            : 'وضع سحابي — التخزين المحلي غير متاح يُحوَّل لسحابة Netlify.'}
        </p>
      </div>
    </div>
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
      <div className="fixed inset-x-0 top-0 z-50 flex h-11 items-center justify-between border-b border-ab-border bg-ab-surface/95 px-3 backdrop-blur md:hidden">
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
          className="fixed inset-0 z-50 bg-black/25 md:hidden"
          aria-label="إغلاق"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-[60] flex w-[15.5rem] flex-col border-l border-ab-border bg-ab-surface transition-transform duration-200 md:translate-x-0',
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
