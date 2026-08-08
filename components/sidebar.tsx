'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
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
  Inbox,
  Gauge,
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
  shouldRedirectLegacyPersonalDesk,
  shouldRedirectToPrimary,
} from '@/lib/scopes/primary-room'
import { PERSONAL_DESK_COPY } from '@/lib/scopes/personal-desk'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { authHeaders } from '@/lib/supabase/browser'
import {
  SIDEBAR_WIDTH_DEFAULT_PX,
  SIDEBAR_WIDTH_MAX_PX,
  SIDEBAR_WIDTH_MIN_PX,
  applySidebarWidthPx,
  persistSidebarWidthPx,
  readStoredSidebarWidthPx,
  sidebarWidthFromClientX,
} from '@/lib/ui/sidebar-width'
import { applyFontScale, readStoredFontScale } from '@/lib/ui/font-scale'
import { sectionTitleAr } from '@/lib/ui/section-titles'
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
  | 'personal-mail'
  | 'approvals'
  | 'audit'
  | 'skills'
  | 'api-keys'
  | 'ops'
  | 'usage'
  | 'settings'

const PRIMARY_NAV: Array<{
  id: SidebarSection
  labelAr: string
  icon: LucideIcon
}> = [
  { id: 'home', labelAr: 'لوحة اليوم', icon: Home },
  { id: 'assistants', labelAr: 'مهام التشغيل', icon: Bot },
  { id: 'personal-mail', labelAr: 'بريدي الشخصي', icon: Inbox },
  { id: 'mail', labelAr: 'بريد الجمعية', icon: Mail },
  { id: 'calendar', labelAr: 'تقويم الفريق', icon: CalendarDays },
  // غرفة الفريق: single entry under «الغرفة» below (fuller room row) — no nav duplicate.
  { id: 'files', labelAr: 'ملفات الفريق', icon: FolderOpen },
  { id: 'usage', labelAr: 'استهلاك الرموز', icon: Gauge },
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
        const { getBrowserSession } = await import('@/lib/supabase/browser')
        const session = await getBrowserSession()
        const uid = session?.user?.id
        if (!uid || cancelled) return
        const deskId = ensurePersonalDesk(uid)
        if (cancelled) return
        setPersonalDeskId(deskId)
        const legacy = shouldRedirectLegacyPersonalDesk(activeScopeId, uid)
        if (legacy) setActiveScopeId(legacy)
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
          personalDeskScopeId?: string
        }
        if (data.personalDeskScopeId) {
          ensurePersonalDesk(uid)
          setPersonalDeskId(data.personalDeskScopeId)
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
  }, [signedIn, ensurePersonalDesk, setActiveScopeId])

  // Keep legacy personal-demo → private desk when scope changes
  useEffect(() => {
    if (signedIn !== true || !personalDeskId) return
    if (
      activeScopeId === 'personal-demo' ||
      shouldRedirectLegacyPersonalDesk(activeScopeId, personalDeskId.replace(/^personal-u-/, ''))
    ) {
      // personalDeskId is already the target
      if (activeScopeId === 'personal-demo') {
        setActiveScopeId(personalDeskId)
      }
    }
  }, [activeScopeId, personalDeskId, setActiveScopeId, signedIn])

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
        n.id === 'personal-mail' ||
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
    if (n.id === 'usage' || n.id === 'audit') {
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
  const personalDesk = useMemo(() => {
    const id = personalDeskId
    if (id) {
      return scopes.find((s) => s.id === id && !s.archived)
    }
    return scopes.find(
      (s) => s.id.startsWith('personal-u-') && !s.archived
    )
  }, [scopes, personalDeskId])
  const deskScopeId = personalDesk?.id || personalDeskId
  /** Invite / custom rooms only — hide clutter demo cards. */
  const otherRooms = useMemo(
    () =>
      scopes.filter(
        (s) =>
          !s.archived &&
          s.id !== PRIMARY_TEAM_SCOPE_ID &&
          s.id !== deskScopeId &&
          s.id !== 'personal-demo' &&
          !HIDDEN_DEMO_SCOPE_IDS.has(s.id) &&
          !(deskScopeId && s.id === deskScopeId)
      ),
    [scopes, deskScopeId]
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
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex w-full items-center gap-2.5 rounded-lg py-2 pe-2.5 ps-3 text-[13px] transition-colors',
                    // Accent bar on the inline-start edge marks the active row
                    // without relying on the tint alone.
                    'before:absolute before:inset-y-1.5 before:start-0 before:w-[3px] before:rounded-full before:bg-ab-accent before:transition-opacity',
                    active
                      ? 'bg-ab-accent/10 font-semibold text-ab-accent before:opacity-100'
                      : 'text-ab-ink before:opacity-0 hover:bg-ab-stage'
                  )}
                >
                  <span className="relative shrink-0">
                    <Icon
                      className={cn(
                        'h-4 w-4',
                        active ? 'text-ab-accent' : 'text-ab-muted'
                      )}
                      aria-hidden
                    />
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
                        'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white',
                        id === 'mail' ? 'bg-red-600' : 'bg-ab-warn'
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
        <p className="mb-1.5 flex items-center gap-1.5 px-2 text-[11px] font-semibold text-ab-muted-soft">
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
                'w-full rounded-lg px-2.5 py-2 text-right text-[13px] transition-colors',
                activeSection === 'chats' &&
                  activeScopeId === PRIMARY_TEAM_SCOPE_ID
                  ? 'bg-ab-ink text-white shadow-ab-sm'
                  : 'text-ab-ink hover:bg-ab-stage'
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
                    : 'text-ab-muted-soft'
                )}
              >
                محادثة الفريق والوكلاء بـ @
              </span>
            </button>
          </li>
        </ul>

        {personalDesk && deskScopeId && (
          <div className="mb-2 rounded-xl border border-amber-200/90 bg-amber-50/60 p-1.5 shadow-sm">
            <p className="mb-1 flex items-center gap-1.5 px-1.5 text-[11px] font-semibold text-amber-900/75">
              <User className="h-3 w-3" aria-hidden />
              مساحة خاصة · لك وحدك
            </p>
            <ul className="space-y-0.5">
              <li className="group relative">
                <button
                  type="button"
                  onClick={() => {
                    setActiveScopeId(deskScopeId)
                    onSectionChange?.('chats')
                    onNavigate?.()
                  }}
                  className={cn(
                    'w-full rounded-lg px-2.5 py-2 text-right text-[13px] transition-colors',
                    activeSection === 'chats' &&
                      activeScopeId === deskScopeId
                      ? 'bg-amber-900 text-amber-50 shadow-ab-sm'
                      : 'bg-white/70 text-ab-ink hover:bg-white'
                  )}
                >
                  <span className="block font-semibold">
                    {personalDesk.nameAr || PERSONAL_DESK_COPY.nameAr}
                  </span>
                  <span
                    className={cn(
                      'mt-0.5 block text-[10px] leading-snug',
                      activeSection === 'chats' &&
                        activeScopeId === deskScopeId
                        ? 'text-amber-50/75'
                        : 'text-amber-900/65'
                    )}
                  >
                    {PERSONAL_DESK_COPY.sidebarHintAr}
                  </span>
                </button>
                <button
                  type="button"
                  className="absolute start-1 top-1 rounded p-0.5 text-amber-800/50 opacity-40 hover:bg-amber-100 hover:text-amber-950 hover:opacity-100 group-hover:opacity-100 md:opacity-0"
                  aria-label="خيارات المساحة الخاصة"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuId((v) =>
                      v === deskScopeId ? null : deskScopeId
                    )
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
                </button>
                {menuId === deskScopeId && (
                  <div
                    ref={menuRef}
                    className="absolute start-0 top-7 z-20 w-36 rounded-md border border-amber-200 bg-white p-1 shadow-md"
                  >
                    <button
                      type="button"
                      className="block w-full rounded px-2 py-1.5 text-right text-[11px] hover:bg-stone-50"
                      onClick={() => {
                        const name = window.prompt(
                          'اسم المساحة',
                          personalDesk.nameAr
                        )
                        if (name) renameScope(deskScopeId, name)
                        setMenuId(null)
                      }}
                    >
                      إعادة تسمية
                    </button>
                  </div>
                )}
              </li>
            </ul>
          </div>
        )}

        {otherRooms.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowOtherRooms((v) => !v)}
              className="mb-1 w-full px-2 text-right text-[10px] font-semibold text-ab-muted-soft hover:text-stone-600"
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
                            active ? 'text-white/70' : 'text-ab-muted-soft'
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
  const [sidebarWidthPx, setSidebarWidthPx] = useState(SIDEBAR_WIDTH_DEFAULT_PX)
  const [resizing, setResizing] = useState(false)
  const asideRef = useRef<HTMLElement | null>(null)

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
    const stored = readStoredSidebarWidthPx()
    const next = applySidebarWidthPx(stored ?? SIDEBAR_WIDTH_DEFAULT_PX)
    setSidebarWidthPx(next)
    applyFontScale(readStoredFontScale())
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

  function commitWidth(px: number) {
    const next = applySidebarWidthPx(px)
    setSidebarWidthPx(next)
    persistSidebarWidthPx(next)
    return next
  }

  function onResizePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!isDesktop || !asideRef.current) return
    e.preventDefault()
    const handle = e.currentTarget
    const asideEl = asideRef.current
    handle.setPointerCapture(e.pointerId)
    setResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: PointerEvent) => {
      const next = applySidebarWidthPx(
        sidebarWidthFromClientX(ev.clientX, asideEl)
      )
      setSidebarWidthPx(next)
    }
    const onUp = (ev: PointerEvent) => {
      handle.releasePointerCapture(ev.pointerId)
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setResizing(false)
      persistSidebarWidthPx(
        sidebarWidthFromClientX(ev.clientX, asideEl)
      )
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  }

  function onResizeKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (!isDesktop) return
    const step = e.shiftKey ? 32 : 16
    const rtl =
      typeof document !== 'undefined' &&
      getComputedStyle(document.documentElement).direction === 'rtl'
    // Arrow toward inline-end widens; toward inline-start narrows.
    let delta = 0
    if (e.key === 'ArrowLeft') delta = rtl ? step : -step
    else if (e.key === 'ArrowRight') delta = rtl ? -step : step
    else if (e.key === 'Home') {
      e.preventDefault()
      commitWidth(SIDEBAR_WIDTH_MIN_PX)
      return
    } else if (e.key === 'End') {
      e.preventDefault()
      commitWidth(SIDEBAR_WIDTH_MAX_PX)
      return
    } else return
    e.preventDefault()
    commitWidth(sidebarWidthPx + delta)
  }

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
          <span className="truncate text-sm font-bold tracking-tight">
            {sectionTitleAr(activeSection)}
          </span>
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
        ref={asideRef}
        className={cn(
          // Use JS drawerActive for transform — unprefixed translate-x-full can
          // override md:translate-x-0 in the compiled CSS and leave the aside
          // covering / intercepting taps on mobile (and even desktop).
          // Width tracks --ab-sidebar-width; main offset must use the same var.
          'fixed inset-y-0 start-0 z-[60] flex w-[min(var(--ab-sidebar-width),85vw)] flex-col border-e border-ab-border bg-ab-surface transition-transform duration-200',
          drawerActive ? 'translate-x-0' : 'translate-x-full',
          !drawerActive && 'pointer-events-none',
          resizing && 'select-none'
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
        {/* Desktop: drag handle on inline-end edge (meets main content). */}
        {isDesktop && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-valuemin={SIDEBAR_WIDTH_MIN_PX}
            aria-valuemax={SIDEBAR_WIDTH_MAX_PX}
            aria-valuenow={sidebarWidthPx}
            aria-label="اسحب حافة القائمة"
            title="اسحب حافة القائمة"
            tabIndex={0}
            onPointerDown={onResizePointerDown}
            onKeyDown={onResizeKeyDown}
            className={cn(
              'group absolute inset-y-0 end-0 z-20 hidden w-1.5 cursor-col-resize touch-none md:flex',
              'items-center justify-center',
              'hover:bg-ab-accent/15 focus-visible:bg-ab-accent/20 focus-visible:outline-none',
              resizing && 'bg-ab-accent/25'
            )}
          >
            <span
              aria-hidden
              className={cn(
                'h-8 w-0.5 rounded-full bg-stone-300 transition-colors',
                'group-hover:bg-ab-accent/50 group-focus-visible:bg-ab-accent/50',
                resizing && 'bg-ab-accent'
              )}
            />
          </div>
        )}
      </aside>
    </>
  )
}
