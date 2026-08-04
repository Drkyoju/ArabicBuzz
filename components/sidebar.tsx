'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
  MoreHorizontal,
  KeyRound,
  CalendarDays,
  Activity,
  Home,
  type LucideIcon,
} from 'lucide-react'
import { AirGapBadge } from '@/components/airgap-badge'
import { SdaiaBadge } from '@/components/sdaia-badge'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import {
  isEmployeeSection,
  useWorkspaceModeStore,
} from '@/lib/scopes/workspace-mode-store'
import { isPersonalScope, isSharedScope } from '@/lib/scopes/manager'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { cn } from '@/lib/utils'

function GuestChip({ onLogin }: { onLogin?: () => void }) {
  const signedIn = useSignedIn()
  if (signedIn === null) return null
  if (signedIn) {
    return (
      <p className="rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-800">
        مسجّل الدخول
      </p>
    )
  }
  return (
    <button
      type="button"
      onClick={() => {
        onLogin?.()
        window.dispatchEvent(new CustomEvent('ab-nav', { detail: 'settings' }))
      }}
      className="w-full rounded-md bg-ab-accent px-2 py-2 text-right text-[11px] font-semibold text-white hover:opacity-95"
    >
      سجّل الدخول — احفظ غرفك وموافقاتك
    </button>
  )
}

export type SidebarSection =
  | 'home'
  | 'chats'
  | 'files'
  | 'memory'
  | 'calendar'
  | 'approvals'
  | 'audit'
  | 'skills'
  | 'api-keys'
  | 'ops'
  | 'settings'

const PRIMARY_NAV: Array<{
  id: SidebarSection
  labelAr: string
  icon: LucideIcon
}> = [
  { id: 'home', labelAr: 'لوحة اليوم', icon: Home },
  { id: 'chats', labelAr: 'الغرف', icon: MessageSquare },
  { id: 'files', labelAr: 'ملفات', icon: FolderOpen },
  { id: 'calendar', labelAr: 'تقويم الفريق', icon: CalendarDays },
  { id: 'approvals', labelAr: 'الموافقات', icon: ShieldCheck },
  { id: 'audit', labelAr: 'سجل التدقيق', icon: Activity },
  { id: 'skills', labelAr: 'مهارات', icon: Sparkles },
  { id: 'settings', labelAr: 'الإعدادات', icon: Settings },
]

const MORE_NAV: Array<{
  id: SidebarSection
  labelAr: string
  icon: LucideIcon
}> = [
  { id: 'memory', labelAr: 'الذاكرة', icon: Brain },
  { id: 'api-keys', labelAr: 'مفاتيح API', icon: KeyRound },
  { id: 'ops', labelAr: 'صحة التشغيل', icon: Activity },
]

function SidebarBody({
  airGapped,
  activeSection,
  onSectionChange,
  onNavigate,
  pendingApprovals = 0,
}: {
  airGapped?: boolean
  activeSection: SidebarSection
  onSectionChange?: (section: SidebarSection) => void
  onNavigate?: () => void
  pendingApprovals?: number
}) {
  const activeScopeId = useWorkspaceStore((s) => s.activeScopeId)
  const setActiveScopeId = useWorkspaceStore((s) => s.setActiveScopeId)
  const createPersonalDesk = useWorkspaceStore((s) => s.createPersonalDesk)
  const renameScope = useWorkspaceStore((s) => s.renameScope)
  const mode = useWorkspaceModeStore((s) => s.mode)
  const setMode = useWorkspaceModeStore((s) => s.setMode)
  const roleHint = useWorkspaceModeStore((s) => s.roleHint)

  useEffect(() => {
    let cancelled = false
    void fetch('/api/me/role')
      .then((r) => r.json())
      .then((d: { uiMode?: 'admin' | 'employee'; role?: string }) => {
        if (cancelled) return
        if (d.role) useWorkspaceModeStore.getState().setRoleHint(d.role)
        // Only auto-switch guests/members into employee; owners stay admin unless they toggle
        if (d.uiMode === 'employee') setMode('employee')
      })
      .catch(() => null)
    return () => {
      cancelled = true
    }
  }, [setMode])

  const primaryNav = PRIMARY_NAV.filter((n) => isEmployeeSection(n.id, mode))
  const signedIn = useSignedIn()
  const moreNav = MORE_NAV.filter(
    (n) => isEmployeeSection(n.id, mode) && signedIn === true
  )
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
  const [createErr, setCreateErr] = useState('')
  const [showMoreNav, setShowMoreNav] = useState(() =>
    MORE_NAV.some((n) => n.id === activeSection)
  )
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (MORE_NAV.some((n) => n.id === activeSection)) {
      setShowMoreNav(true)
    }
  }, [activeSection])

  useEffect(() => {
    if (!menuId) return
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuId(null)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuId(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuId])

  return (
    <div className="flex h-full flex-col" dir="rtl">
      <div className="border-b border-ab-border px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[15px] font-bold tracking-tight text-ab-ink">
              Arabic Buzz
            </p>
            <p className="text-[10px] text-stone-500">وكيل متعدد اللاعبين</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <SdaiaBadge compact />
            <AirGapBadge airGapped={airGapped} />
          </div>
        </div>

        <div className="mt-2.5">
          {signedIn ? (
            <>
              <div className="flex gap-1 rounded-md border border-ab-border bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setMode('employee')}
                  className={cn(
                    'flex-1 rounded px-1.5 py-1.5 text-[11px]',
                    mode === 'employee'
                      ? 'bg-ab-accent/15 font-semibold text-ab-accent'
                      : 'text-stone-500'
                  )}
                >
                  موظف
                </button>
                <button
                  type="button"
                  onClick={() => setMode('admin')}
                  className={cn(
                    'flex-1 rounded px-1.5 py-1.5 text-[11px]',
                    mode === 'admin'
                      ? 'bg-ab-ink font-semibold text-white'
                      : 'text-stone-500'
                  )}
                >
                  مسؤول
                </button>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-stone-500">
                {mode === 'employee'
                  ? `واجهة موظف${roleHint ? ` · ${roleHint}` : ''} — غرف وملفات وتقويم.`
                  : airGapped
                    ? 'وضع محلي مغلق — الملفات والذاكرة على هذا الجهاز.'
                    : 'واجهة مسؤول · كل الأدوات'}
              </p>
            </>
          ) : (
            <p className="rounded-md border border-dashed border-ab-border bg-stone-50 px-2 py-1.5 text-[10px] leading-relaxed text-stone-600">
              معاينة زائر — تبديل موظف/مسؤول بعد تسجيل الدخول.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setCreateErr('')
            try {
              const id = createPersonalDesk()
              if (!id) throw new Error('empty')
              onSectionChange?.('chats')
              onNavigate?.()
            } catch (e) {
              console.error('createPersonalDesk failed', e)
              setCreateErr('تعذّر إنشاء الجلسة. أعد المحاولة.')
            }
          }}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-ab-ink px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          جلسة جديدة
        </button>
        {createErr && (
          <p className="mt-1.5 text-[10px] text-ab-warn" role="alert">
            {createErr}
          </p>
        )}
      </div>

      <nav className="border-b border-ab-border p-2" aria-label="أقسام التطبيق">
        <ul className="space-y-0.5">
          {primaryNav.map(({ id, labelAr, icon: Icon }) => {
            const active = activeSection === id
            const badge =
              id === 'approvals' && pendingApprovals > 0
                ? pendingApprovals
                : 0
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
                  <span className="flex-1 text-right">{labelAr}</span>
                  {badge > 0 && (
                    <span className="rounded-full bg-ab-warn px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {badge}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
        {moreNav.length > 0 && (
          <button
            type="button"
            onClick={() => setShowMoreNav((v) => !v)}
            className="mt-1 w-full rounded-md px-2.5 py-1.5 text-right text-[11px] text-stone-500 hover:bg-stone-50"
          >
            {showMoreNav ? 'إخفاء المزيد' : 'المزيد…'}
          </button>
        )}
        {showMoreNav && moreNav.length > 0 && (
          <ul className="mt-0.5 space-y-0.5">
            {moreNav.map(({ id, labelAr, icon: Icon }) => {
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
                    <Icon
                      className="h-3.5 w-3.5 shrink-0 opacity-70"
                      aria-hidden
                    />
                    <span>{labelAr}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </nav>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="mb-2 rounded-lg border border-ab-border/80 bg-stone-50 px-2.5 py-2">
          <p className="text-[10px] font-semibold text-stone-500">
            نطاق العمل (مثل QM)
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-stone-600">
            <strong className="text-ab-ink">مساحاتي</strong> = مكتب شخصي
            (ذاكرة وملفات معزولة).{' '}
            <strong className="text-ab-ink">مشتركة</strong> = غرفة فريق بوكلاء
            وصلاحيات مشتركة.
          </p>
        </div>
        <p className="mb-1 flex items-center gap-1 px-2 text-[10px] font-semibold text-stone-400">
          <User className="h-3 w-3" aria-hidden />
          مساحاتي · معزولة
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
                </button>
                <button
                  type="button"
                  className="absolute start-1 top-1 rounded p-0.5 text-stone-400 opacity-40 hover:bg-stone-200 hover:text-ab-ink hover:opacity-100 group-hover:opacity-100 md:opacity-0"
                  aria-label="خيارات الجلسة"
                  title={scope.descriptionAr || 'خيارات الجلسة'}
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuId((v) => (v === scope.id ? null : scope.id))
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
                </button>
                {menuId === scope.id && (
                  <div
                    ref={menuRef}
                    className="absolute start-0 top-7 z-20 w-36 rounded-md border border-ab-border bg-white p-1 shadow-md"
                  >
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
                        if (
                          window.confirm(
                            `أرشفة الجلسة «${scope.nameAr}»؟ يمكنك استعادتها لاحقاً من الإعدادات إن لزم.`
                          )
                        ) {
                          archiveScope(scope.id, true)
                        }
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
          مساحات مشتركة · غرف
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
                    {scope.agentLabelsAr.length > 0
                      ? `${scope.agentLabelsAr.length} وكلاء`
                      : 'غرفة مشتركة'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="border-t border-ab-border px-3 py-2.5">
        <GuestChip onLogin={onNavigate} />
      </div>
    </div>
  )
}

export function Sidebar({
  airGapped = false,
  activeSection = 'chats',
  onSectionChange,
  pendingApprovals = 0,
}: {
  airGapped?: boolean
  activeSection?: SidebarSection
  onSectionChange?: (section: SidebarSection) => void
  pendingApprovals?: number
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const signedIn = useSignedIn()

  return (
    <>
      {/* Hide top bar while drawer is open so only one menu control shows */}
      {!mobileOpen && (
        <div className="fixed inset-x-0 top-0 z-50 flex h-11 items-center justify-between border-b border-ab-border bg-ab-surface/95 px-3 backdrop-blur md:hidden">
          <button
            type="button"
            aria-label="فتح القائمة"
            aria-expanded={false}
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 text-ab-ink"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-bold">Arabic Buzz</span>
          {signedIn === false ? (
            <button
              type="button"
              onClick={() => onSectionChange?.('settings')}
              className="rounded-md bg-ab-accent px-2 py-1 text-[10px] font-semibold text-white"
            >
              دخول
            </button>
          ) : pendingApprovals > 0 ? (
            <button
              type="button"
              onClick={() => onSectionChange?.('approvals')}
              className="rounded-full bg-ab-warn px-2 py-0.5 text-[10px] font-bold text-white"
            >
              {pendingApprovals}
            </button>
          ) : (
            <span className="w-9" aria-hidden />
          )}
        </div>
      )}

      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-[55] bg-black/35 md:hidden"
          aria-label="إغلاق القائمة"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-[60] flex w-[min(15.5rem,85vw)] flex-col border-e border-ab-border bg-ab-surface transition-transform duration-200 md:translate-x-0',
          mobileOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
        )}
        aria-label="الشريط الجانبي"
        aria-hidden={mobileOpen ? undefined : true}
        inert={!mobileOpen ? true : undefined}
      >
        {mobileOpen && (
          <div className="flex items-center justify-between border-b border-ab-border px-3 py-2 md:hidden">
            <span className="text-sm font-bold text-ab-ink">القائمة</span>
            <button
              type="button"
              className="rounded-md p-1.5 text-stone-600 hover:bg-stone-100"
              aria-label="إغلاق القائمة"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <SidebarBody
          airGapped={airGapped}
          activeSection={activeSection}
          onSectionChange={onSectionChange}
          onNavigate={() => setMobileOpen(false)}
          pendingApprovals={pendingApprovals}
        />
      </aside>
    </>
  )
}
