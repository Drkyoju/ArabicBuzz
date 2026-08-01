'use client'

import { useState } from 'react'
import { Sidebar, type SidebarSection } from '@/components/sidebar'
import { RoomWorkspace } from '@/components/room-workspace'
import { ApprovalCard } from '@/components/approval-card'
import { SkillMarketplace } from '@/components/skill-marketplace'
import { CronStatusTable } from '@/components/cron-status-table'
import { SdaiaAuditViewer } from '@/components/sdaia-audit-viewer'
import { AuthButtons } from '@/components/auth-buttons'
import { AuthSetupHint } from '@/components/auth-setup-hint'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import type { ThreadItem } from '@/components/chat-thread-bar'

const DEMO_APPROVALS: ThreadItem[] = [
  {
    kind: 'approval',
    id: 'a1',
    approvalId: 'demo-approval-1',
    actionName: 'send_message',
    params: {
      channel: 'telegram',
      text: 'تنبيه: متطلبات جديدة في التقرير',
    },
    riskLevel: 'HIGH',
    status: 'PENDING_APPROVAL',
  },
]

export function WorkspaceShell({ airGapped }: { airGapped: boolean }) {
  const [section, setSection] = useState<SidebarSection>('chats')
  const activeScopeId = useWorkspaceStore((s) => s.activeScopeId)

  return (
    <div className="min-h-screen bg-ab-bg">
      <Sidebar
        airGapped={airGapped}
        activeSection={section}
        onSectionChange={setSection}
      />

      <div className="mr-0 min-h-screen pt-12 md:mr-[17.5rem] md:pt-0">
        {section === 'chats' && <RoomWorkspace />}

        {section === 'approvals' && (
          <section className="mx-auto max-w-3xl px-6 py-8" dir="rtl">
            <h2 className="mb-4 text-xl font-bold">سجل الموافقات</h2>
            <p className="mb-6 text-sm text-stone-500">
              الإجراءات عالية المخاطر بانتظار القرار البشري — من الغرف
              المشتركة والقنوات.
            </p>
            {DEMO_APPROVALS.map((item) =>
              item.kind === 'approval' ? (
                <ApprovalCard
                  key={item.id}
                  approvalId={item.approvalId}
                  actionName={item.actionName}
                  params={item.params}
                  riskLevel={item.riskLevel}
                  status={item.status}
                />
              ) : null
            )}
          </section>
        )}

        {section === 'integrations' && (
          <div className="px-2" dir="rtl">
            <p className="px-6 pt-6 text-sm text-stone-500">
              المهارات والمهام المجدولة مرتبطة بالمساحة النشطة:{' '}
              <span className="font-medium text-ab-ink">{activeScopeId}</span>
            </p>
            <SkillMarketplace targetScopeId={activeScopeId} />
            <CronStatusTable />
          </div>
        )}

        {section === 'settings' && (
          <section className="mx-auto max-w-3xl px-6 py-8" dir="rtl">
            <h2 className="mb-4 text-xl font-bold">الإعدادات</h2>
            <div className="mb-8 rounded-lg border border-ab-border bg-ab-surface p-4">
              <h3 className="mb-3 font-semibold">الحساب وتسجيل الدخول</h3>
              <p className="mb-3 text-sm text-stone-600">
                Google أو GitHub — النماذج مشتركة للفريق عبر مفاتيح Netlify.
              </p>
              <AuthButtons />
            </div>
            <div className="mb-8">
              <AuthSetupHint />
            </div>
            <p className="mb-4 text-sm text-stone-600">
              المساحات الشخصية والمشتركة تفصل الذاكرة والصلاحيات، بينما يبقى
              البشر والوكلاء في نفس الغرفة.
            </p>
            <ul className="list-disc space-y-2 pr-5 text-sm text-stone-700">
              <li>NEXT_PUBLIC_APP_URL</li>
              <li>NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
              <li>GEMINI_API_KEY / OPENROUTER_API_KEY</li>
              <li>TELEGRAM_* / WHATSAPP_*</li>
            </ul>
            <div className="mt-8">
              <SdaiaAuditViewer />
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
