'use client'

import { useCallback, useEffect, useState } from 'react'
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
import { IntegrationsSetupPanel } from '@/components/integrations-setup-panel'
import { OpsHealthPanel } from '@/components/ops-health-panel'
import { WhatsAppInboxPanel } from '@/components/whatsapp-inbox-panel'
import { FilesPanel } from '@/components/files-panel'
import { MemoryPanel } from '@/components/memory-panel'
import { AirGapBadge } from '@/components/airgap-badge'
import { AuthButtons } from '@/components/auth-buttons'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { authHeaders } from '@/lib/supabase/browser'

function AuthRequiredStatus() {
  const [required, setRequired] = useState<boolean | null>(null)
  useEffect(() => {
    void fetch('/api/integrations/status')
      .then((r) => r.json())
      .then((d: { authRequired?: boolean }) =>
        setRequired(Boolean(d.authRequired))
      )
      .catch(() => setRequired(null))
  }, [])
  if (required === null) {
    return (
      <p className="text-[11px] text-stone-400">جاري فحص وضع المصادقة…</p>
    )
  }
  return (
    <p
      className={
        required
          ? 'rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900'
          : 'rounded-md bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800'
      }
    >
      {required
        ? 'AUTH_REQUIRED مفعّل — يلزم تسجيل الدخول للـ API'
        : 'AUTH_REQUIRED معطّل — الوضع الشخصي مفتوح (يُغيَّر من Netlify)'}
    </p>
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
  const [section, setSection] = useState<SidebarSection>('chats')
  const activeScopeId = useWorkspaceStore((s) => s.activeScopeId)
  const [approvals, setApprovals] = useState<LiveApproval[]>([])
  const [approvalsLoading, setApprovalsLoading] = useState(false)
  const [approvalsError, setApprovalsError] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const [waPendingCount, setWaPendingCount] = useState(0)

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
      }
      if (!res.ok) {
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
    void loadApprovals()
    const t = setInterval(() => void loadApprovals(), 8000)
    return () => clearInterval(t)
  }, [loadApprovals])

  const loadWaInbox = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/whatsapp/inbox?scopeId=${encodeURIComponent(activeScopeId)}`,
        { headers: await authHeaders() }
      )
      const data = (await res.json()) as { count?: number }
      if (res.ok) setWaPendingCount(Number(data.count || 0))
    } catch {
      /* ignore */
    }
  }, [activeScopeId])

  useEffect(() => {
    void loadWaInbox()
    const t = setInterval(() => void loadWaInbox(), 10000)
    return () => clearInterval(t)
  }, [loadWaInbox])

  useEffect(() => {
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail
      if (
        detail === 'calendar' ||
        detail === 'chats' ||
        detail === 'settings' ||
        detail === 'files' ||
        detail === 'memory' ||
        detail === 'approvals' ||
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
      />

      <div className="mr-0 min-h-dvh pt-11 md:mr-[15.5rem] md:pt-0">
        {pendingCount > 0 && section !== 'approvals' && (
          <button
            type="button"
            onClick={() => setSection('approvals')}
            className="sticky top-0 z-20 w-full border-b border-ab-warn/30 bg-ab-warn/10 px-4 py-2 text-right text-xs font-medium text-ab-warn md:top-0"
          >
            {pendingCount} موافقة معلّقة — اضغط للمراجعة قبل تنفيذ الأدوات
          </button>
        )}

        {waPendingCount > 0 && section === 'chats' && (
          <WhatsAppInboxPanel compact />
        )}

        {section === 'chats' && <RoomWorkspace />}

        {section === 'files' && <FilesPanel />}

        {section === 'calendar' && (
          <section className="mx-auto max-w-3xl px-6 py-8" dir="rtl">
            <h2 className="mb-1 text-xl font-bold">التقويم · Zoom</h2>
            <p className="mb-6 text-sm text-stone-500">
              تقويم الجمعية المشترك: أنت تربط Google مرة واحدةحدة، وتضيف بريد
              الأصدقاء والموظفين — الـ AI يرتّب المواعيد ويرسل الدعوات (مع رابط
              Zoom إن وُجد).
            </p>
            <div className="mb-6 rounded-xl border border-ab-border bg-ab-surface p-4">
              <GoogleCalendarPanel hideTitle />
            </div>
            <div className="rounded-xl border border-dashed border-ab-border bg-stone-50 p-4">
              <GoogleSetupChecklist focus="calendar" />
            </div>
          </section>
        )}

        {section === 'memory' && <MemoryPanel />}

        {section === 'approvals' && (
          <section className="mx-auto max-w-3xl px-6 py-8" dir="rtl">
            <div className="mb-6">
              <WhatsAppInboxPanel />
            </div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">سجل الموافقات</h2>
                <p className="mt-1 text-sm text-stone-500">
                  الإجراءات عالية المخاطر لا تُنفَّذ حتى توافق أو ترفض هنا.
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
            {approvalsLoading && approvals.length === 0 && (
              <p className="text-sm text-stone-500">جاري التحميل…</p>
            )}
            {approvalsError && (
              <p className="mb-3 text-sm text-ab-warn">{approvalsError}</p>
            )}
            {!approvalsLoading && approvals.length === 0 && !approvalsError ? (
              <p className="rounded-xl border border-dashed border-ab-border bg-ab-surface px-4 py-8 text-center text-sm text-stone-500">
                لا توجد موافقات معلّقة حالياً. ستظهر هنا عندما يطلب الوكيل إجراءً
                عالي المخاطر في وضع صارم أو تلقائي.
              </p>
            ) : (
              approvals.map((item) => (
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

        {section === 'skills' && (
          <div className="mx-auto max-w-3xl px-6 py-8" dir="rtl">
            <div className="mb-6">
              <h2 className="text-xl font-bold">المهارات والمهام</h2>
              <p className="mt-1 text-sm text-stone-500">
                ثبّت مهارات للوكلاء أو سجّل مهمة مجدولة للعربية.
              </p>
            </div>
            <SkillMarketplace targetScopeId={activeScopeId} />
            <div className="mt-10 space-y-6 border-t border-ab-border pt-8">
              <div>
                <h3 className="mb-1 text-base font-semibold text-ab-ink">
                  المهام المجدولة
                </h3>
                <p className="mb-4 text-xs text-stone-500">
                  تنبيهات وملخصات دورية عبر القنوات المضبوطة على Netlify.
                </p>
                <CronRegisterForm onCreated={() => undefined} />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-semibold text-ab-ink">
                  سجل التشغيل
                </h3>
                <CronStatusTable />
              </div>
            </div>
          </div>
        )}

        {section === 'api-keys' && (
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

        {section === 'ops' && <OpsHealthPanel />}

        {section === 'settings' && (
          <section className="mx-auto max-w-3xl px-6 py-8" dir="rtl">
            <h2 className="mb-1 text-xl font-bold">الإعدادات</h2>
            <p className="mb-6 text-sm text-stone-500">
              الحساب، المفاتيح، ووضع الأمان للموقع السحابي.
            </p>

            <div className="mb-6 rounded-xl border border-ab-border bg-ab-surface p-4 text-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="font-semibold">الموقع</h3>
                <AirGapBadge airGapped={airGapped} />
              </div>
              <p className="text-xs leading-relaxed text-stone-600">
                {airGapped
                  ? 'وضع محلي مغلق: النماذج والملفات تبقى على الجهاز قدر الإمكان.'
                  : 'تعمل على arabicbuzz.netlify.app — الملفات والذاكرة في السحابة وعقل الشركة.'}
              </p>
            </div>

            <div className="mb-6 rounded-xl border border-ab-border bg-ab-surface p-4 text-sm">
              <h3 className="mb-2 font-semibold">الوصول والحساب</h3>
              <AuthRequiredStatus />
              <p className="mb-3 mt-2 text-xs text-stone-600">
                لغرف متعددة المستخدمين فعّل{' '}
                <code dir="ltr">AUTH_REQUIRED=true</code> على Netlify ثم سجّل
                الدخول من{' '}
                <a href="/auth/login" className="text-ab-accent underline">
                  صفحة الدخول
                </a>
                .
              </p>
              <AuthButtons compact />
            </div>
            <div className="mb-6 rounded-xl border border-ab-border bg-ab-surface p-4">
              <p className="mb-2 text-sm font-semibold">مفاتيح المزوّدين</p>
              <p className="mb-3 text-xs text-stone-500">
                المفاتيح العاملة فقط تظهر هنا بشكل مختصر — لإضافة أو إصلاح مفتاح
                افتح قسم «مفاتيح API».
              </p>
              <button
                type="button"
                onClick={() => setSection('api-keys')}
                className="rounded-md border border-ab-border bg-white px-3 py-1.5 text-xs font-medium hover:bg-stone-50"
              >
                فتح مفاتيح API
              </button>
            </div>
            <div className="mb-6 rounded-xl border border-ab-border bg-ab-surface p-4">
              <GoogleSetupChecklist focus="all" />
            </div>
            <div className="mb-6 rounded-xl border border-ab-border bg-ab-surface p-4">
              <GoogleCalendarPanel />
            </div>
            <div className="mb-6 rounded-xl border border-ab-border bg-ab-surface p-4">
              <GoogleDriveBrainPanel />
            </div>
            <div className="mb-6 rounded-xl border border-ab-border bg-ab-surface p-4">
              <MacBrainPanel />
            </div>
            <div className="mb-6 rounded-xl border border-ab-border bg-ab-surface p-4">
              <IntegrationsSetupPanel />
            </div>
            <div className="mb-6 rounded-xl border border-ab-border bg-ab-surface p-4">
              <h3 className="mb-3 font-semibold">وضع الأمان</h3>
              <SecurityPosturePicker />
            </div>
            <div className="mb-6 rounded-xl border border-ab-border bg-ab-surface p-4 text-sm">
              <h3 className="mb-2 font-semibold">الميكروفون وعقل الشركة</h3>
              <p className="mb-2 text-xs leading-relaxed text-stone-600">
                الميكروفون يحتاج{' '}
                <code dir="ltr">HF_TOKEN</code> أو{' '}
                <code dir="ltr">GROQ_API_KEY</code> — أضفهما من «مفاتيح API».
                خزنة الماك تحتاج إعداد Netlify + وكيل محلي (انظر التكاملات أدناه).
              </p>
              <button
                type="button"
                onClick={() => setSection('api-keys')}
                className="rounded-md border border-ab-border bg-white px-3 py-1.5 text-xs font-medium hover:bg-stone-50"
              >
                أضف من مفاتيح API
              </button>
            </div>
            <div className="mt-8">
              <SdaiaAuditViewer />
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
