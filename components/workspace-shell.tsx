'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Sidebar, type SidebarSection } from '@/components/sidebar'
import { RoomWorkspace } from '@/components/room-workspace'
import { ApprovalCard } from '@/components/approval-card'
import { SkillMarketplace } from '@/components/skill-marketplace'
import { CronStatusTable } from '@/components/cron-status-table'
import { CronRegisterForm } from '@/components/cron-register-form'
import { SdaiaAuditViewer } from '@/components/sdaia-audit-viewer'
import { SecurityPosturePicker } from '@/components/security-posture-picker'
import { ProviderKeysPanel } from '@/components/provider-keys-panel'
import { GoogleCalendarPanel } from '@/components/google-calendar-panel'
import { GoogleSetupChecklist } from '@/components/google-setup-checklist'
import { MacBrainPanel } from '@/components/mac-brain-panel'
import { GoogleDriveBrainPanel } from '@/components/google-drive-brain-panel'
import { AssociationKnowledgePanel } from '@/components/association-knowledge-panel'
import { SystemDeadlinesPanel } from '@/components/system-deadlines-panel'
import { CommitteeTelegramPanel } from '@/components/committee-telegram-panel'
import { AccreditationExportPanel } from '@/components/accreditation-export-panel'
import { IntegrationsSetupPanel } from '@/components/integrations-setup-panel'
import { OpsHealthPanel } from '@/components/ops-health-panel'
import { FilesPanel } from '@/components/files-panel'
import { MemoryPanel } from '@/components/memory-panel'
import { AirGapBadge } from '@/components/airgap-badge'
import { AuthButtons } from '@/components/auth-buttons'
import { ConnectedServicesPanel } from '@/components/telegram-connect-card'
import { HelpTip } from '@/components/help-tip'
import { MeetingCopilotPanel } from '@/components/meeting-copilot'
import { RoomCalendarBoard } from '@/components/room-calendar-board'
import { RoomTasksBoard } from '@/components/room-tasks-board'
import { ZoomLivePanel } from '@/components/zoom-live-panel'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import {
  isEmployeeSection,
  useWorkspaceModeStore,
} from '@/lib/scopes/workspace-mode-store'
import { HomeDashboard } from '@/components/home-dashboard'
import { HijriPreferenceToggle } from '@/components/hijri-preference'
import { McpServersPanel } from '@/components/mcp-servers-panel'
import { authHeaders } from '@/lib/supabase/browser'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { Fingerprint } from 'lucide-react'

type CalendarTab = 'schedule' | 'tasks' | 'meetings' | 'external' | 'export'

const CALENDAR_TABS: Array<{ id: CalendarTab; labelAr: string }> = [
  { id: 'schedule', labelAr: 'المواعيد والاستحقاقات' },
  { id: 'tasks', labelAr: 'المهام' },
  { id: 'meetings', labelAr: 'الاجتماعات' },
  { id: 'external', labelAr: 'دعوات خارجية' },
  { id: 'export', labelAr: 'تصدير' },
]

function AccountStatus() {
  const [required, setRequired] = useState<boolean | null>(null)
  const signedIn = useSignedIn()
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    void fetch('/api/integrations/status')
      .then((r) => r.json())
      .then((d: { authRequired?: boolean }) =>
        setRequired(Boolean(d.authRequired))
      )
      .catch(() => setRequired(false))
  }, [])

  useEffect(() => {
    if (!signedIn) {
      setEmail(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const { getBrowserSession } = await import('@/lib/supabase/browser')
        const s = await getBrowserSession()
        if (!cancelled) setEmail(s?.user?.email || null)
      } catch {
        if (!cancelled) setEmail(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [signedIn])

  if (required === null || signedIn === null) {
    return (
      <p className="text-[11px] text-stone-400">جاري فحص حالة الحساب…</p>
    )
  }

  if (signedIn) {
    return (
      <p className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800">
        مسجّل الدخول
        {email ? (
          <>
            {' '}
            · <span dir="ltr">{email}</span>
          </>
        ) : null}
      </p>
    )
  }

  return (
    <div className="space-y-1.5">
      <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-900">
        وضع الزائر — الجلسة على هذا الجهاز فقط
      </p>
      <p
        className={
          required
            ? 'rounded-md bg-amber-50/80 px-2.5 py-1.5 text-[11px] text-amber-900'
            : 'rounded-md bg-stone-50 px-2.5 py-1.5 text-[11px] text-stone-600'
        }
      >
        {required
          ? 'يلزم تسجيل الدخول لاستخدام المنصة.'
          : 'سجّل الدخول أدناه لحفظ غرفك ومفاتيحك عبر الأجهزة.'}
      </p>
    </div>
  )
}

type LiveApproval = {
  id: string
  approvalId: string
  actionName: string
  params: Record<string, unknown>
  riskLevel: 'LOW' | 'HIGH'
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'
  messageAr?: string
}

export function WorkspaceShell({ airGapped }: { airGapped: boolean }) {
  const [section, setSection] = useState<SidebarSection>('home')
  const [calendarTab, setCalendarTab] = useState<CalendarTab>('schedule')
  const activeScopeId = useWorkspaceStore((s) => s.activeScopeId)
  const mode = useWorkspaceModeStore((s) => s.mode)
  const signedIn = useSignedIn()
  const [approvals, setApprovals] = useState<LiveApproval[]>([])
  const [approvalsLoading, setApprovalsLoading] = useState(false)
  const [approvalsError, setApprovalsError] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const [cronReloadToken, setCronReloadToken] = useState(0)
  const [showDevOps, setShowDevOps] = useState(false)
  const [showSdaia, setShowSdaia] = useState(false)

  useEffect(() => {
    if (!isEmployeeSection(section, mode)) {
      setSection('home')
    }
  }, [mode, section])

  // Guests cannot open advanced sections via deep-link
  useEffect(() => {
    if (signedIn !== false) return
    if (section === 'api-keys' || section === 'ops' || section === 'memory') {
      setSection('settings')
    }
  }, [signedIn, section])

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('section')
      if (
        q === 'home' ||
        q === 'calendar' ||
        q === 'chats' ||
        q === 'settings' ||
        q === 'files' ||
        q === 'memory' ||
        q === 'approvals' ||
        q === 'audit' ||
        q === 'skills' ||
        q === 'api-keys' ||
        q === 'ops'
      ) {
        setSection(q)
      }
    } catch {
      /* ignore */
    }
  }, [])

  const loadApprovals = useCallback(async () => {
    setApprovalsLoading(true)
    setApprovalsError('')
    try {
      const res = await fetch('/api/agent/approvals', {
        headers: await authHeaders(),
      })
      const data = (await res.json()) as {
        approvals?: LiveApproval[]
        error?: string
        code?: string
      }
      if (!res.ok) {
        if (res.status === 401 || data.code === 'AUTH_REQUIRED') {
          setApprovalsError('GUEST')
          setApprovals([])
          setPendingCount(0)
          return
        }
        setApprovalsError(data.error || `تعذّر التحميل (HTTP ${res.status})`)
        setApprovals([])
        setPendingCount(0)
        return
      }
      const list = data.approvals || []
      setApprovals(list)
      setPendingCount(
        list.filter((a) => a.status === 'PENDING_APPROVAL').length
      )
    } catch (e) {
      setApprovalsError(e instanceof Error ? e.message : 'خطأ في التحميل')
      setApprovals([])
      setPendingCount(0)
    } finally {
      setApprovalsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (signedIn === false) {
      setApprovals([])
      setPendingCount(0)
      setApprovalsLoading(false)
      setApprovalsError('GUEST')
      return
    }
    void loadApprovals()
    const t = setInterval(() => void loadApprovals(), 8000)
    return () => clearInterval(t)
  }, [loadApprovals, signedIn])

  useEffect(() => {
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail
      if (
        detail === 'home' ||
        detail === 'calendar' ||
        detail === 'chats' ||
        detail === 'settings' ||
        detail === 'files' ||
        detail === 'memory' ||
        detail === 'approvals' ||
        detail === 'audit' ||
        detail === 'skills' ||
        detail === 'api-keys' ||
        detail === 'ops'
      ) {
        setSection(detail)
      }
    }
    window.addEventListener('ab-nav', onNav)
    return () => window.removeEventListener('ab-nav', onNav)
  }, [])

  return (
    <div className="min-h-dvh bg-ab-bg">
      <Sidebar
        airGapped={airGapped}
        activeSection={section}
        onSectionChange={setSection}
        pendingApprovals={signedIn === false ? 0 : pendingCount}
      />

      {/* Offset must be on the inline-start side and match the aside width in
          components/sidebar.tsx, otherwise the fixed sidebar covers content. */}
      <div className="min-h-dvh pt-11 md:ms-[15.5rem] md:pt-0">
        {pendingCount > 0 && section !== 'approvals' && signedIn !== false && (
          <button
            type="button"
            onClick={() => setSection('approvals')}
            className="sticky top-0 z-20 w-full border-b border-ab-warn/30 bg-ab-warn/10 px-4 py-2 text-right text-xs font-medium text-ab-warn md:top-0"
          >
            {pendingCount} موافقة معلّقة — اضغط للمراجعة قبل تنفيذ الأدوات
          </button>
        )}
        {signedIn === false && section !== 'approvals' && (
          <button
            type="button"
            onClick={() => setSection('approvals')}
            className="sticky top-0 z-20 w-full border-b border-amber-200 bg-amber-50 px-4 py-2 text-right text-xs font-medium text-amber-950 md:top-0"
          >
            أنت في وضع المعاينة — الموافقات المعروضة أمثلة توضيحية. سجّل الدخول
            لمراجعة إجراءات حقيقية.
          </button>
        )}

        {section === 'home' && (
          <HomeDashboard
            onNavigate={(s) => setSection(s as SidebarSection)}
            pendingApprovalsCount={pendingCount}
          />
        )}

        {section === 'chats' && <RoomWorkspace />}

        {section === 'files' && <FilesPanel />}

        {section === 'calendar' && (
          <section className="mx-auto max-w-3xl space-y-5 px-6 py-8" dir="rtl">
            <div>
              <h2 className="text-xl font-bold text-ab-ink">
                المواعيد والمهام
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                كل ما يخص وقت الفريق في مكان واحد — اختر التبويب الذي تحتاجه.
              </p>
            </div>

            <div
              role="tablist"
              aria-label="أقسام المواعيد"
              className="flex flex-wrap gap-1.5 rounded-xl border border-ab-border bg-ab-surface p-1.5"
            >
              {CALENDAR_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={calendarTab === t.id}
                  onClick={() => setCalendarTab(t.id)}
                  className={
                    calendarTab === t.id
                      ? 'rounded-lg bg-ab-ink px-3 py-1.5 text-xs font-semibold text-white'
                      : 'rounded-lg px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100'
                  }
                >
                  {t.labelAr}
                </button>
              ))}
            </div>

            <div className="space-y-6">
              {calendarTab === 'schedule' && (
                <>
                  <RoomCalendarBoard />
                  <SystemDeadlinesPanel />
                </>
              )}

              {calendarTab === 'tasks' && <RoomTasksBoard />}

              {calendarTab === 'meetings' && (
                <>
                  <ZoomLivePanel />
                  <MeetingCopilotPanel />
                </>
              )}

              {calendarTab === 'external' && (
                <div className="rounded-xl border border-ab-border bg-ab-surface p-4">
                  <p className="mb-3 text-xs text-stone-500">
                    لوحات المواعيد والمهام مشتركة للغرفة. Google هنا فقط لإرسال
                    دعوات بريد خارجية أو Zoom — وليس مصدر مواعيد الفريق.
                  </p>
                  <GoogleCalendarPanel hideTitle />
                </div>
              )}

              {calendarTab === 'export' && <AccreditationExportPanel />}
            </div>
          </section>
        )}

        {section === 'memory' && signedIn && <MemoryPanel />}

        {section === 'approvals' && (
          <section className="mx-auto max-w-3xl px-6 py-8" dir="rtl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-1.5 text-xl font-bold">
                  صندوق الموافقات
                  <HelpTip textAr="راجع كل إجراء حساس قبل التنفيذ: اعتماد، رفض، أو تعديل المعاملات." />
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  اعتمد · ارفض · أو عدّل — ثم يُنفَّذ الإجراء بأمان.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadApprovals()}
                className="rounded-md border border-ab-border bg-white px-3 py-1.5 text-xs"
              >
                تحديث
              </button>
            </div>
            {approvalsLoading && pendingCount === 0 && signedIn !== false && (
              <p className="text-sm text-stone-500">جاري التحميل…</p>
            )}
            {approvalsError && approvalsError !== 'GUEST' && (
              <p className="mb-3 text-sm text-ab-warn">{approvalsError}</p>
            )}
            {(approvalsError === 'GUEST' || signedIn === false) &&
            !approvalsLoading ? (
              <div className="rounded-xl border border-dashed border-ab-border bg-ab-surface px-4 py-6 text-center">
                <p className="text-sm font-semibold text-ab-ink">
                  لا موافقات معلّقة
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  سجّل الدخول لرؤية طلبات الاعتماد الحقيقية عندما يطلب الوكيل
                  إجراءً عالي المخاطر.
                </p>
                <Link
                  href="/auth/login"
                  className="mt-3 inline-block rounded-md bg-ab-accent px-3 py-1.5 text-xs font-semibold text-white"
                >
                  سجّل الدخول للموافقة
                </Link>
              </div>
            ) : !approvalsLoading && pendingCount === 0 && !approvalsError ? (
              <p className="rounded-xl border border-dashed border-ab-border bg-ab-surface px-4 py-6 text-center text-sm text-stone-500">
                لا موافقات معلّقة. تظهر هنا عندما يطلب الوكيل إجراءً عالي
                المخاطر.
              </p>
            ) : (
              approvals
                .filter((item) => item.status === 'PENDING_APPROVAL')
                .map((item) => (
                  <div key={item.id} className="mb-3">
                    {item.messageAr && (
                      <p className="mb-1 text-[11px] text-stone-500">
                        {item.messageAr}
                      </p>
                    )}
                    <ApprovalCard
                      approvalId={item.approvalId}
                      actionName={item.actionName}
                      params={item.params}
                      riskLevel={item.riskLevel}
                      status={item.status}
                    />
                  </div>
                ))
            )}
          </section>
        )}

        {section === 'audit' && (
          <section className="mx-auto max-w-3xl space-y-6 px-6 py-8" dir="rtl">
            <div>
              <h1 className="flex items-center gap-2 text-xl font-bold text-ab-ink">
                <Fingerprint className="h-5 w-5 text-ab-accent" />
                سجل التدقيق
              </h1>
              <p className="mt-1 text-sm text-stone-500">
                كل إجراء للبشر والوكلاء — وقت، فاعل، مستوى خطر، وختم سدايا.
                قابل للمراجعة دون تقرير إداري منفصل: هذا فرق الامتثال أمام
                الأدوات الأفقية.
              </p>
            </div>

            {signedIn === false && (
              <div className="rounded-xl border border-dashed border-ab-border bg-ab-surface px-4 py-6 text-center">
                <p className="text-sm font-semibold text-ab-ink">
                  لا إدخالات تدقيق بعد
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  سجل التدقيق الحقيقي يظهر بعد تسجيل الدخول وتنفيذ إجراءات في
                  غرفتك.
                </p>
                <Link
                  href="/auth/login"
                  className="mt-3 inline-block text-[11px] font-medium text-ab-accent underline"
                >
                  سجّل الدخول لسجلّك الحقيقي وتصدير CSV
                </Link>
              </div>
            )}

            {signedIn && (
              <div className="rounded-xl border border-ab-border bg-ab-surface p-2">
                <SdaiaAuditViewer />
              </div>
            )}
          </section>
        )}

        {section === 'skills' && (
          <div className="mx-auto max-w-3xl px-6 py-8" dir="rtl">
            <div className="mb-6">
              <h2 className="flex items-center gap-1.5 text-xl font-bold">
                المهارات والمهام
                <HelpTip textAr="المهارة = تعليمات ثابتة للوكيل في هذه المساحة. يمكنك اقتراح مهارة من المحادثة أيضاً." />
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                ثبّت مهارات للوكلاء أو سجّل تذكيراً يومياً.
              </p>
            </div>
            <SkillMarketplace targetScopeId={activeScopeId} />
            <div className="mt-10 space-y-6 border-t border-ab-border pt-8">
              <div>
                <h3 className="mb-1 text-base font-semibold text-ab-ink">
                  المهام المجدولة
                </h3>
                <p className="mb-4 text-xs text-stone-500">
                  ملخصات وتنبيهات يومية عبر تيليجرام عند تفعيله.
                </p>
                <CronRegisterForm
                  onCreated={() => setCronReloadToken((t) => t + 1)}
                />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-semibold text-ab-ink">
                  سجل التشغيل
                </h3>
                <CronStatusTable reloadToken={cronReloadToken} />
              </div>
            </div>
          </div>
        )}

        {section === 'api-keys' && signedIn && (
          <section className="mx-auto max-w-3xl px-6 py-8" dir="rtl">
            <h2 className="mb-1 text-xl font-bold">مفاتيح API والنماذج</h2>
            <p className="mb-6 text-sm text-stone-500">
              قائمة النماذج في الغرفة تعرض فقط المزوّدين الذين لديهم مفتاح صالح
              ويستجيبون. أضف مفتاحاً هنا لفتح نماذجه تلقائياً.
            </p>
            <div className="rounded-xl border border-ab-border bg-ab-surface p-4">
              <ProviderKeysPanel />
            </div>
          </section>
        )}

        {section === 'ops' && signedIn && <OpsHealthPanel />}

        {section === 'settings' && (
          <section className="mx-auto max-w-3xl px-6 py-8" dir="rtl">
            <h2 className="mb-1 text-xl font-bold">الإعدادات</h2>
            <p className="mb-6 text-sm text-stone-500">
              حسابك، الأمان، والربط بالخدمات — بدون تفاصيل تقنية.
            </p>

            <div className="mb-5 rounded-xl border border-ab-border bg-ab-surface p-4 text-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="font-semibold">الحساب</h3>
                <AirGapBadge airGapped={airGapped} />
              </div>
              <AccountStatus />
              <p className="mb-3 mt-2 text-xs text-stone-600">
                سجّل الدخول لحفظ جلستك عبر الأجهزة، أو ابدأ تجريبياً الآن.
              </p>
              <AuthButtons compact />
            </div>

            <div className="mb-5 rounded-xl border border-ab-border bg-ab-surface p-4">
              <h3 className="mb-1 flex items-center gap-1.5 font-semibold">
                وضع الأمان
                <HelpTip textAr="صارم = موافقة على معظم الأدوات. تلقائي = موافقة للخطر العالي فقط. حر = تنفيذ أسرع مع مخاطر أعلى." />
              </h3>
              <p className="mb-3 text-xs text-stone-500">
                يحدد متى يطلب الوكيل موافقتك قبل تنفيذ إجراء.
              </p>
              <SecurityPosturePicker />
            </div>

            <div className="mb-5">
              <HijriPreferenceToggle />
            </div>

            <div className="mb-5 rounded-xl border border-ab-border bg-ab-surface p-4">
              <h3 className="mb-1 font-semibold">تقويم ومهام الغرفة · Google اختياري</h3>
              <p className="mb-3 text-xs text-stone-500">
                المواعيد والمهام والذاكرة مشتركة للغرفة. Google اختياري لدعوات
                خارجية أو Zoom أو ملفات Drive.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSection('calendar')}
                  className="rounded-md bg-ab-ink px-3 py-1.5 text-xs font-semibold text-white"
                >
                  تقويم ومهام الفريق
                </button>
                {signedIn && (
                  <>
                    <button
                      type="button"
                      onClick={() => setSection('api-keys')}
                      className="rounded-md border border-ab-border bg-white px-3 py-1.5 text-xs"
                    >
                      مفاتيح النماذج
                    </button>
                    <button
                      type="button"
                      onClick={() => setSection('ops')}
                      className="rounded-md border border-ab-border bg-white px-3 py-1.5 text-xs"
                    >
                      صحة التشغيل
                    </button>
                  </>
                )}
              </div>
              <div className="mt-4 space-y-4">
                <AssociationKnowledgePanel />
                <GoogleDriveBrainPanel />
              </div>
            </div>

            <div className="mb-5">
              <ConnectedServicesPanel />
            </div>

            {signedIn ? (
              <>
                <div className="mb-5">
                  <McpServersPanel />
                </div>

                <details
                  className="mb-5 rounded-xl border border-dashed border-ab-border bg-stone-50 p-4"
                  onToggle={(e) =>
                    setShowDevOps((e.currentTarget as HTMLDetailsElement).open)
                  }
                >
                  <summary className="cursor-pointer text-sm font-semibold text-stone-600">
                    للمطوّر / المسؤول فقط
                  </summary>
                  {showDevOps && (
                    <div className="mt-3 space-y-4">
                      <GoogleSetupChecklist focus="all" />
                      <IntegrationsSetupPanel />
                      <div className="rounded-xl border border-ab-border bg-white p-4">
                        <MacBrainPanel />
                      </div>
                    </div>
                  )}
                </details>

                <details
                  className="rounded-xl border border-ab-border bg-ab-surface p-4"
                  onToggle={(e) =>
                    setShowSdaia((e.currentTarget as HTMLDetailsElement).open)
                  }
                >
                  <summary className="cursor-pointer text-sm font-semibold text-ab-ink">
                    سجل التدقيق (SDAIA)
                  </summary>
                  {showSdaia && (
                    <div className="mt-3">
                      <SdaiaAuditViewer />
                    </div>
                  )}
                </details>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-ab-border bg-stone-50 px-4 py-5 text-sm text-stone-600">
                <p className="font-medium text-ab-ink">أدوات متقدمة بعد تسجيل الدخول</p>
                <p className="mt-1 text-xs">
                  مفاتيح API، خوادم MCP، سجل سدايا، وإعدادات المطوّر تظهر بعد
                  تسجيل الدخول حتى لا تزدحم الشاشة للزائر.
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
