'use client'

import { useCallback, useEffect, useState } from 'react'
import { Sidebar, type SidebarSection } from '@/components/sidebar'
import { RoomWorkspace } from '@/components/room-workspace'
import { ApprovalCard } from '@/components/approval-card'
import { SkillMarketplace } from '@/components/skill-marketplace'
import { CronStatusTable } from '@/components/cron-status-table'
import { SdaiaAuditViewer } from '@/components/sdaia-audit-viewer'
import { SecurityPosturePicker } from '@/components/security-posture-picker'
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
        return
      }
      setApprovals(data.approvals || [])
    } catch (e) {
      setApprovalsError(e instanceof Error ? e.message : 'خطأ في التحميل')
      setApprovals([])
    } finally {
      setApprovalsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (section !== 'approvals') return
    void loadApprovals()
    const t = setInterval(() => void loadApprovals(), 8000)
    return () => clearInterval(t)
  }, [section, loadApprovals])

  return (
    <div className="min-h-dvh bg-ab-bg">
      <Sidebar
        airGapped={airGapped}
        activeSection={section}
        onSectionChange={setSection}
      />

      <div className="mr-0 min-h-dvh pt-11 md:mr-[15.5rem] md:pt-0">
        {section === 'chats' && <RoomWorkspace />}

        {section === 'approvals' && (
          <section className="mx-auto max-w-3xl px-6 py-8" dir="rtl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">سجل الموافقات</h2>
                <p className="mt-1 text-sm text-stone-500">
                  الإجراءات عالية المخاطر بانتظار القرار البشري.
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

        {section === 'integrations' && (
          <div className="px-2" dir="rtl">
            <p className="px-6 pt-6 text-sm text-stone-500">
              المهارات والمهام المجدولة للمساحة:{' '}
              <span className="font-medium text-ab-ink">{activeScopeId}</span>
            </p>
            <SkillMarketplace targetScopeId={activeScopeId} />
            <CronStatusTable />
          </div>
        )}

        {section === 'settings' && (
          <section className="mx-auto max-w-3xl px-6 py-8" dir="rtl">
            <h2 className="mb-4 text-xl font-bold">الإعدادات</h2>
            <div className="mb-8 rounded-xl border border-ab-border bg-ab-surface p-4 text-sm">
              <h3 className="mb-2 font-semibold">الوصول</h3>
              <p className="text-xs text-stone-600">
                تسجيل الدخول معطّل حالياً — المنصة مفتوحة للاستخدام الشخصي.
                لإعادة تفعيل المصادقة لاحقاً اضبط{' '}
                <code dir="ltr">AUTH_REQUIRED=true</code>.
              </p>
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
                اضغط أيقونة الميكروفون في المحادثة وتحدث. النسخ يستخدم نماذج عربية
                مجانية أولاً (Cohere Arabic / SADA سعودي عبر{' '}
                <code dir="ltr">HF_TOKEN</code>، ثم Groq). أضف المفتاح في Netlify
                لأفضل فهم للهجات السعودية.
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
