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
import { FilesPanel } from '@/components/files-panel'
import { MemoryPanel } from '@/components/memory-panel'
import { AirGapBadge } from '@/components/airgap-badge'
import { AuthButtons } from '@/components/auth-buttons'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { authHeaders } from '@/lib/supabase/browser'

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

        {section === 'chats' && <RoomWorkspace />}

        {section === 'files' && <FilesPanel />}

        {section === 'memory' && <MemoryPanel />}

        {section === 'approvals' && (
          <section className="mx-auto max-w-3xl px-6 py-8" dir="rtl">
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
          <div className="px-2" dir="rtl">
            <SkillMarketplace targetScopeId={activeScopeId} />
            <div className="mx-auto max-w-3xl space-y-6 px-6 pb-10">
              <CronRegisterForm onCreated={() => undefined} />
              <div>
                <h3 className="mb-3 text-sm font-semibold text-ab-ink">
                  المهام المجدولة · سجل التشغيل
                </h3>
                <CronStatusTable />
              </div>
            </div>
          </div>
        )}

        {section === 'settings' && (
          <section className="mx-auto max-w-3xl px-6 py-8" dir="rtl">
            <h2 className="mb-4 text-xl font-bold">الإعدادات</h2>

            <div className="mb-8 rounded-xl border border-ab-border bg-ab-surface p-4 text-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="font-semibold">وضع الاتصال</h3>
                <AirGapBadge airGapped={airGapped} />
              </div>
              <p className="text-xs leading-relaxed text-stone-600">
                {airGapped
                  ? 'وضع محلي مغلق (air-gap): النماذج والملفات تبقى على هذا الجهاز قدر الإمكان. لا تُرفع الملفات لسحابة Netlify.'
                  : 'وضع سحابي: عند غياب خزنة الماك المحلية تُحفظ الملفات الصغيرة في قاعدة البيانات (حتى 4MB) أو عبر عقل الشركة. لفرض المحلي شغّل التخزين المحلي أو MAC_SYNC_URL.'}
              </p>
            </div>

            <div className="mb-8 rounded-xl border border-ab-border bg-ab-surface p-4 text-sm">
              <h3 className="mb-2 font-semibold">الوصول والحساب</h3>
              <p className="mb-3 text-xs text-stone-600">
                الوضع الشخصي مفتوح افتراضياً. لتفعيل غرف متعددة المستخدمين اضبط{' '}
                <code dir="ltr">AUTH_REQUIRED=true</code> على Netlify ثم سجّل
                الدخول هنا أو من{' '}
                <a href="/auth/login" className="text-ab-accent underline">
                  /auth/login
                </a>
                .
              </p>
              <AuthButtons compact />
            </div>
            <div className="mb-8 rounded-xl border border-ab-border bg-ab-surface p-4">
              <ProviderKeysPanel />
            </div>
            <div className="mb-8 rounded-xl border border-ab-border bg-ab-surface p-4">
              <h3 className="mb-3 font-semibold">وضع الأمان</h3>
              <SecurityPosturePicker />
            </div>
            <div
              className="mb-8 rounded-xl border border-ab-border bg-ab-surface p-4 text-sm"
              dir="rtl"
            >
              <h3 className="mb-2 font-semibold">الميكروفون · نسخ عربي</h3>
              <p className="text-xs text-stone-600">
                اضغط أيقونة الميكروفون في المحادثة وتحدث. أضف{' '}
                <code dir="ltr">HF_TOKEN</code> أو{' '}
                <code dir="ltr">GROQ_API_KEY</code> من «مفاتيح المزوّدين» أعلاه.
              </p>
            </div>
            <div
              className="mb-8 rounded-xl border border-ab-border bg-ab-surface p-4 text-sm"
              dir="rtl"
            >
              <h3 className="mb-2 font-semibold">عقل الشركة · OCR عربي</h3>
              <p className="text-xs text-stone-600">
                ارفع ملفات عبر «تحميل ملفات» أو «إلى عقل الشركة». النص الرقمي
                يُستخرج مباشرة؛ الممسوح يمرّ على OCR عربي (Qari / Gemini).
              </p>
            </div>
            <div
              className="mb-8 rounded-xl border border-ab-border bg-ab-surface p-4 text-sm"
              dir="rtl"
            >
              <h3 className="mb-2 font-semibold">تخزين الملفات على الماك</h3>
              <p className="text-xs text-stone-600">
                الملفات تُحفظ في{' '}
                <code dir="ltr">~/ArabicBuzz/data</code> محلياً أو عبر{' '}
                <code dir="ltr">npm run storage:sync</code> مع{' '}
                <code dir="ltr">MAC_SYNC_URL</code>.
              </p>
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
