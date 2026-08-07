'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ShieldCheck,
  Settings,
  Users,
  User,
  Menu,
  X,
  FolderOpen,
  Sparkles,
  MoreHorizontal,
  CalendarDays,
  Activity,
  Home,
  Bot,
  Mail,
  type LucideIcon,
} from 'lucide-react'
import { AirGapBadge } from '@/components/airgap-badge'
import { SdaiaBadge } from '@/components/sdaia-badge'
import { RoleBadge } from '@/components/role-badge'
import { MailBell } from '@/components/mail-bell'
import {
  hydrateScopeMemories,
  useWorkspaceStore,
} from '@/lib/scopes/workspace-store'
import {
  isEmployeeSection,
  useWorkspaceModeStore,
} from '@/lib/scopes/workspace-mode-store'
import { isPersonalScope, isSharedScope } from '@/lib/scopes/manager'
import {
  HIDDEN_DEMO_SCOPE_IDS,
  PRIMARY_TEAM_SCOPE_ID,
  isPinnedSidebarScope,
  personalDeskScopeId,
  shouldRedirectLegacyPersonalDesk,
  shouldRedirectToPrimary,
} from '@/lib/scopes/primary-room'
import { PERSONAL_DESK_COPY } from '@/lib/scopes/personal-desk'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { authHeaders } from '@/lib/supabase/browser'
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
    <Link
      href="/auth/login"
      onClick={() => onLogin?.()}
      className="block w-full rounded-md bg-ab-accent px-2 py-2 text-right text-[11px] font-semibold text-white hover:opacity-95"
    >
      سجّل الدخول — احفظ غرفك وموافقاتك
    </Link>
  )
}

export type SidebarSection =
  | 'home'
  | 'assistants'
  | 'chats'
  | 'files'
  | 'memory'
  | 'calendar'
  | 'mail'
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
  { id: 'assistants', labelAr: 'مهام التشغيل', icon: Bot },
  { id: 'mail', labelAr: 'بريد الجمعية', icon: Mail },
  { id: 'calendar', labelAr: 'تقويم الفريق', icon: CalendarDays },
  // غرفة الفريق: single entry under «الغرفة» below (fuller room row) — no nav duplicate.
  { id: 'files', labelAr: 'ملفات الفريق', icon: FolderOpen },
  { id: 'approvals', labelAr: 'الموافقات', icon: ShieldCheck },
  { id: 'audit', labelAr: 'سجل العمل', icon: Activity },
  { id: 'skills', labelAr: 'مهارات', icon: Sparkles },
  { id: 'settings', labelAr: 'الإعدادات', icon: Settings },
]

function SidebarBody({
  airGapped,
  activeSection,
  onSectionChange,
  onNavigate,
  pendingApprovals = 0,
  hitlDisabled = false,
  mailUnread = 0,
}: {
  airGapped?: boolean
  activeSection: SidebarSection
  onSectionChange?: (section: SidebarSection) => void
  onNavigate?: () => void
  pendingApprovals?: number
  hitlDisabled?: boolean
  mailUnread?: number
}) {
  const activeScopeId = useWorkspaceStore((s) => s.activeScopeId)
  const setActiveScopeId = useWorkspaceStore((s) => s.setActiveScopeId)
  const renameScope = useWorkspaceStore((s) => s.renameScope)
  const ensurePersonalDesk = useWorkspaceStore((s) => s.ensurePersonalDesk)
  const [personalDeskId, setPersonalDeskId] = useState<string | null>(null)
  const mode = useWorkspaceModeStore((s) => s.mode)
  const setMode = useWorkspaceModeStore((s) => s.setMode)
  const labelAr = useWorkspaceModeStore((s) => s.labelAr)
  const displayNameAr = useWorkspaceModeStore((s) => s.displayNameAr)
  const canAccessOpsUi = useWorkspaceModeStore((s) => s.canAccessOpsUi)
  const roleResolved = useWorkspaceModeStore((s) => s.roleResolved)
  const signedIn = useSignedIn()
  const roleReady = signedIn === false || (signedIn === true && roleResolved)

  useEffect(() => {
    hydrateScopeMemories()
  }, [])

  useEffect(() => {
    if (signedIn !== true) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/rooms/mine', {
          headers: await authHeaders(),
        })
        if (!res.ok || cancelled) return
        const data = (await res.json()) as {
          rooms?: {
            scopeId: string
            nameAr?: string
            kind?: 'personal' | 'shared'
          }[]
        }
        if (data.rooms?.length) {
          useWorkspaceStore.getState().syncRemoteRooms(data.rooms)
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [signedIn])

  useEffect(() => {
    let cancelled = false
    if (signedIn === false) {
      const store = useWorkspaceModeStore.getState()
      store.applyRoleAccess(false)
      store.setLabelAr(null)
      store.setDisplayNameAr(null)
      return
    }
    if (signedIn !== true) return
    void (async () => {
      try {
        const headers = await authHeaders()
        const r = await fetch('/api/me/role', { headers })
        const d = (await r.json()) as {
          uiMode?: 'admin' | 'employee'
          role?: string
          labelAr?: string
          displayNameAr?: string | null
          canAccessOpsUi?: boolean
          isWorkspaceOwner?: boolean
        }
        if (cancelled) return
        const store = useWorkspaceModeStore.getState()
        if (d.role) store.setRoleHint(d.role)
        if (d.labelAr) store.setLabelAr(d.labelAr)
        if (d.displayNameAr) store.setDisplayNameAr(d.displayNameAr)
        // Server already gates ops to ryodan71@gmail.com only.
        store.applyRoleAccess(Boolean(d.canAccessOpsUi || d.isWorkspaceOwner))
      } catch {
        // Resolve as member on failure so the shell does not stay gated forever.
        if (!cancelled) {
          useWorkspaceModeStore.getState().applyRoleAccess(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setMode, signedIn])

  const primaryNav = PRIMARY_NAV.filter((n) => {
    // Until role/email resolves, only shared member sections — never flash
    // owner-only items as missing for the owner, or admin chrome for members.
    if (!roleReady) {
      return (
        n.id === 'home' ||
        n.id === 'assistants' ||
        n.id === 'mail' ||
        n.id === 'calendar' ||
        n.id === 'files' ||
        n.id === 'settings'
      )
    }
    if (!isEmployeeSection(n.id, mode)) return false
    // Skills catalog/management — sole workspace owner only (admin chrome).
    if (n.id === 'skills') {
      return canAccessOpsUi && mode === 'admin'
    }
    // Never keep an empty «الموافقات» nav item — only when a delete is pending.
    // Deep link / home banner / sticky bar still open the inbox.
    if (n.id === 'approvals') {
      return pendingApprovals > 0 && !hitlDisabled
    }
    return true
  })
  const scopes = useWorkspaceStore((s) => s.scopes)
  const primaryRoom = useMemo(
    () => scopes.find((s) => s.id === PRIMARY_TEAM_SCOPE_ID && !s.archived),
    [scopes]
  )
  const personalDesk = useMemo(
    () => scopes.find((s) => s.id === PERSONAL_DESK_SCOPE_ID && !s.archived),
    [scopes]
  )
  /** Invite / custom rooms only — hide clutter demo cards. */
  const otherRooms = useMemo(
    () =>
      scopes.filter(
        (s) =>
          !s.archived &&
          !isPinnedSidebarScope(s.id) &&
          !HIDDEN_DEMO_SCOPE_IDS.has(s.id)
      ),
    [scopes]
  )
  const [menuId, setMenuId] = useState<string | null>(null)
  const [showOtherRooms, setShowOtherRooms] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Old clutter demo rooms → land on the primary team room.
  useEffect(() => {
    if (shouldRedirectToPrimary(activeScopeId)) {
      setActiveScopeId(PRIMARY_TEAM_SCOPE_ID)
    }
  }, [activeScopeId, setActiveScopeId])

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
      <div className="border-b border-ab-border px-3 py-1.5">
        {signedIn === null || (signedIn === true && !roleReady) ? (
          <div
            className="h-7 animate-pulse rounded-md bg-stone-100"
            aria-hidden
          />
        ) : signedIn ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="min-w-0 truncate text-[11px] font-medium text-ab-ink">
              {displayNameAr || 'أنت'}
            </p>
            {labelAr ? <RoleBadge labelAr={labelAr} /> : null}
            {roleReady && canAccessOpsUi ? (
              <SdaiaBadge compact />
            ) : null}
            {airGapped ? <AirGapBadge airGapped /> : null}
            {canAccessOpsUi ? (
              <div
                className="ms-auto inline-flex items-center gap-0.5 rounded-md border border-ab-border/80 bg-stone-50 p-0.5"
                role="group"
                aria-label="وضع الواجهة"
                title={
                  mode === 'employee'
                    ? 'عرض مبسّط مثل بقية الفريق'
                    : airGapped
                      ? 'وضع محلي مغلق — الملفات والذاكرة على هذا الجهاز'
                      : 'موافقات وسجل عمل وتكاملات'
                }
              >
                <button
                  type="button"
                  onClick={() => setMode('employee')}
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] font-medium leading-none transition-colors',
                    mode === 'employee'
                      ? 'bg-ab-accent text-white'
                      : 'text-stone-500 hover:bg-white hover:text-ab-ink'
                  )}
                  aria-pressed={mode === 'employee'}
                >
                  بسيطة
                </button>
                <button
                  type="button"
                  onClick={() => setMode('admin')}
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] font-medium leading-none transition-colors',
                    mode === 'admin'
                      ? 'bg-ab-ink text-white'
                      : 'text-stone-500 hover:bg-white hover:text-ab-ink'
                  )}
                  aria-pressed={mode === 'admin'}
                >
                  إدارة
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {airGapped ? <AirGapBadge airGapped /> : null}
            <p className="min-w-0 flex-1 text-[10px] leading-snug text-stone-500">
              معاينة — سجّل الدخول للعمل في الغرفة.
            </p>
          </div>
        )}
      </div>

      <nav className="border-b border-ab-border p-2" aria-label="أقسام التطبيق">
        <ul className="space-y-0.5">
          {primaryNav.map(({ id, labelAr, icon: Icon }) => {
            const active = activeSection === id
            const badge =
              id === 'approvals' && pendingApprovals > 0
                ? pendingApprovals
                : id === 'mail' && mailUnread > 0
                  ? mailUnread
                  : 0
            const mailDot = id === 'mail' && mailUnread > 0
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
                  <span className="relative shrink-0">
                    <Icon className="h-3.5 w-3.5 opacity-70" aria-hidden />
                    {mailDot && (
                      <span
                        className="absolute -end-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-red-500"
                        aria-hidden
                      />
                    )}
                  </span>
                  <span className="flex-1 text-right">{labelAr}</span>
                  {badge > 0 && (
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white',
                        id === 'mail' ? 'bg-red-500' : 'bg-ab-warn'
                      )}
                    >
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="flex-1 overflow-y-auto p-2">
        <p className="mb-1 flex items-center gap-1 px-2 text-[10px] font-semibold text-stone-400">
          <Users className="h-3 w-3" aria-hidden />
          الغرفة
        </p>
        <ul className="mb-2 space-y-0.5">
          <li>
            <button
              type="button"
              onClick={() => {
                setActiveScopeId(PRIMARY_TEAM_SCOPE_ID)
                onSectionChange?.('chats')
                onNavigate?.()
              }}
              className={cn(
                'w-full rounded-md px-2.5 py-2 text-right text-[13px] transition-colors',
                activeSection === 'chats' &&
                  activeScopeId === PRIMARY_TEAM_SCOPE_ID
                  ? 'bg-ab-ink text-white'
                  : 'text-ab-ink hover:bg-stone-100'
              )}
            >
              <span className="block font-semibold">
                {primaryRoom?.nameAr || 'غرفة الفريق'}
              </span>
              <span
                className={cn(
                  'mt-0.5 block text-[10px] leading-snug',
                  activeSection === 'chats' &&
                    activeScopeId === PRIMARY_TEAM_SCOPE_ID
                    ? 'text-white/70'
                    : 'text-stone-400'
                )}
              >
                محادثة الفريق والوكلاء بـ @
              </span>
            </button>
          </li>
        </ul>

        {personalDesk && (
          <>
            <p className="mb-1 flex items-center gap-1 px-2 text-[10px] font-semibold text-stone-400">
              <User className="h-3 w-3" aria-hidden />
              مساحة خاصة
            </p>
            <ul className="mb-2 space-y-0.5">
              <li className="group relative">
                <button
                  type="button"
                  onClick={() => {
                    setActiveScopeId(PERSONAL_DESK_SCOPE_ID)
                    onSectionChange?.('chats')
                    onNavigate?.()
                  }}
                  className={cn(
                    'w-full rounded-md px-2.5 py-1.5 text-right text-[13px] transition-colors',
                    activeSection === 'chats' &&
                      activeScopeId === PERSONAL_DESK_SCOPE_ID
                      ? 'bg-ab-ink text-white'
                      : 'text-ab-ink hover:bg-stone-100'
                  )}
                >
                  <span className="block font-medium">
                    {personalDesk.nameAr}
                  </span>
                  <span
                    className={cn(
                      'mt-0.5 block text-[10px] leading-snug',
                      activeSection === 'chats' &&
                        activeScopeId === PERSONAL_DESK_SCOPE_ID
                        ? 'text-white/70'
                        : 'text-stone-400'
                    )}
                  >
                    مسوداتك الخاصة قبل مشاركة الفريق
                  </span>
                </button>
                <button
                  type="button"
                  className="absolute start-1 top-1 rounded p-0.5 text-stone-400 opacity-40 hover:bg-stone-200 hover:text-ab-ink hover:opacity-100 group-hover:opacity-100 md:opacity-0"
                  aria-label="خيارات المساحة الخاصة"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuId((v) =>
                      v === PERSONAL_DESK_SCOPE_ID
                        ? null
                        : PERSONAL_DESK_SCOPE_ID
                    )
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
                </button>
                {menuId === PERSONAL_DESK_SCOPE_ID && (
                  <div
                    ref={menuRef}
                    className="absolute start-0 top-7 z-20 w-36 rounded-md border border-ab-border bg-white p-1 shadow-md"
                  >
                    <button
                      type="button"
                      className="block w-full rounded px-2 py-1.5 text-right text-[11px] hover:bg-stone-50"
                      onClick={() => {
                        const name = window.prompt(
                          'اسم المساحة',
                          personalDesk.nameAr
                        )
                        if (name) renameScope(PERSONAL_DESK_SCOPE_ID, name)
                        setMenuId(null)
                      }}
                    >
                      إعادة تسمية
                    </button>
                  </div>
                )}
              </li>
            </ul>
          </>
        )}

        {otherRooms.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowOtherRooms((v) => !v)}
              className="mb-1 w-full px-2 text-right text-[10px] font-semibold text-stone-400 hover:text-stone-600"
            >
              {showOtherRooms
                ? 'إخفاء غرف الدعوة'
                : `غرف أخرى من دعوات (${otherRooms.length})`}
            </button>
            {showOtherRooms && (
              <ul className="space-y-0.5">
                {otherRooms.map((scope) => {
                  const active =
                    activeSection === 'chats' && activeScopeId === scope.id
                  const shared = isSharedScope(scope)
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
                          'w-full rounded-md px-2.5 py-1.5 text-right text-[12px] transition-colors',
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
                          {shared
                            ? 'من دعوة'
                            : isPersonalScope(scope)
                              ? 'شخصية'
                              : 'غرفة'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
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
  hitlDisabled = false,
}: {
  airGapped?: boolean
  activeSection?: SidebarSection
  onSectionChange?: (section: SidebarSection) => void
  pendingApprovals?: number
  /** When HITL is off, never show approvals in the main nav. */
  hitlDisabled?: boolean
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mailUnread, setMailUnread] = useState(0)
  const signedIn = useSignedIn()
  // At md+ the aside is always laid out on screen, so it must never be inert.
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const sync = () => {
      setIsDesktop(mq.matches)
      // The drawer is mobile-only; leaving it open across a resize would keep a
      // stale overlay when the viewport shrinks again.
      if (mq.matches) setMobileOpen(false)
    }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!mobileOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  useEffect(() => {
    if (signedIn !== true) {
      setMailUnread(0)
      return
    }
    let cancelled = false
    const poll = async () => {
      try {
        const headers = await authHeaders()
        const res = await fetch('/api/mail/unread', { headers })
        if (!res.ok || cancelled) return
        const data = (await res.json()) as {
          configured?: boolean
          unread?: number
        }
        if (!cancelled) {
          setMailUnread(
            data.configured ? Number(data.unread || 0) : 0
          )
        }
      } catch {
        /* ignore */
      }
    }
    void poll()
    const t = window.setInterval(() => void poll(), 25_000)
    const onMail = () => void poll()
    window.addEventListener('ab-mail-changed', onMail)
    window.addEventListener('focus', onMail)
    return () => {
      cancelled = true
      window.clearInterval(t)
      window.removeEventListener('ab-mail-changed', onMail)
      window.removeEventListener('focus', onMail)
    }
  }, [signedIn])

  const drawerActive = mobileOpen || isDesktop

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
          <div className="flex items-center gap-1">
            {signedIn === true && (
              <MailBell
                compact
                onOpenMail={() => onSectionChange?.('mail')}
              />
            )}
            {signedIn === false ? (
              <Link
                href="/auth/login"
                className="rounded-md bg-ab-accent px-2 py-1 text-[10px] font-semibold text-white"
              >
                دخول
              </Link>
            ) : pendingApprovals > 0 ? (
              <button
                type="button"
                onClick={() => onSectionChange?.('approvals')}
                className="rounded-full bg-ab-warn px-2 py-0.5 text-[10px] font-bold text-white"
              >
                {pendingApprovals}
              </button>
            ) : (
              <span className="w-2" aria-hidden />
            )}
          </div>
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
          // Use JS drawerActive for transform — unprefixed translate-x-full can
          // override md:translate-x-0 in the compiled CSS and leave the aside
          // covering / intercepting taps on mobile (and even desktop).
          'fixed inset-y-0 start-0 z-[60] flex w-[min(15.5rem,85vw)] flex-col border-e border-ab-border bg-ab-surface transition-transform duration-200',
          drawerActive ? 'translate-x-0' : 'translate-x-full',
          !drawerActive && 'pointer-events-none'
        )}
        aria-label="الشريط الجانبي"
        aria-hidden={drawerActive ? undefined : true}
        inert={!drawerActive ? true : undefined}
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
          hitlDisabled={hitlDisabled}
          mailUnread={mailUnread}
        />
      </aside>
    </>
  )
}
