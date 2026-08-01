'use client'

import { useState } from 'react'
import { Sidebar, type SidebarSection } from '@/components/sidebar'
import { ChatCanvas } from '@/components/chat-canvas'
import { ApprovalCard } from '@/components/approval-card'
import { SkillMarketplace } from '@/components/skill-marketplace'
import { CronStatusTable } from '@/components/cron-status-table'
import { SdaiaAuditViewer } from '@/components/sdaia-audit-viewer'
import { AuthButtons } from '@/components/auth-buttons'
import type { ThreadItem } from '@/components/chat-thread-bar'

export function WorkspaceShell({
  airGapped,
  items,
}: {
  airGapped: boolean
  items: ThreadItem[]
}) {
  const [section, setSection] = useState<SidebarSection>('chats')

  return (
    <div className="min-h-screen bg-ab-bg">
      <Sidebar
        airGapped={airGapped}
        activeSection={section}
        onSectionChange={setSection}
      />

      <div className="mr-[17.5rem] min-h-screen">
        {section === 'chats' && <ChatCanvas items={items} />}

        {section === 'approvals' && (
          <section className="mx-auto max-w-3xl px-6 py-8" dir="rtl">
            <h2 className="mb-4 text-xl font-bold">سجل الموافقات</h2>
            <p className="mb-6 text-sm text-stone-500">
              الإجراءات عالية المخاطر بانتظار القرار البشري.
            </p>
            {items
              .filter((i) => i.kind === 'approval')
              .map((item) =>
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
          <div className="px-2">
            <SkillMarketplace targetScopeId="shared-demo" />
            <CronStatusTable />
          </div>
        )}

        {section === 'settings' && (
          <section className="mx-auto max-w-3xl px-6 py-8" dir="rtl">
            <h2 className="mb-4 text-xl font-bold">الإعدادات</h2>
            <div className="mb-8 rounded-lg border border-ab-border bg-ab-surface p-4">
              <h3 className="mb-3 font-semibold">الحساب وتسجيل الدخول</h3>
              <AuthButtons />
            </div>
            <p className="mb-4 text-sm text-stone-600">
              تُدار أسرار النشر عبر متغيرات بيئة Netlify. لا تُخزَّن المفاتيح في
              الواجهة.
            </p>
            <ul className="list-disc space-y-2 pr-5 text-sm text-stone-700">
              <li>NEXT_PUBLIC_APP_URL</li>
              <li>NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
              <li>OPENROUTER_API_KEY / GEMINI_API_KEY / PERPLEXITY_API_KEY</li>
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
