'use client'

import { useState } from 'react'
import { Sidebar, type SidebarSection } from '@/components/sidebar'
import { RoomWorkspace } from '@/components/room-workspace'
import { ApprovalCard } from '@/components/approval-card'
import { SkillMarketplace } from '@/components/skill-marketplace'
import { CronStatusTable } from '@/components/cron-status-table'
import { SdaiaAuditViewer } from '@/components/sdaia-audit-viewer'
import { SecurityPosturePicker } from '@/components/security-posture-picker'
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
            <div className="mb-8 rounded-lg border border-ab-border bg-ab-surface p-4 text-sm">
              <h3 className="mb-2 font-semibold">الوصول</h3>
              <p className="text-xs text-stone-600">
                تسجيل الدخول معطّل حالياً — المنصة مفتوحة للاستخدام الشخصي.
                لإعادة تفعيل المصادقة لاحقاً اضبط{' '}
                <code dir="ltr">AUTH_REQUIRED=true</code>.
              </p>
            </div>
            <div className="mb-8 rounded-lg border border-ab-border bg-ab-surface p-4">
              <h3 className="mb-3 font-semibold">وضع الأمان</h3>
              <SecurityPosturePicker />
            </div>
            <div
              className="mb-8 rounded-lg border border-ab-border bg-ab-surface p-4 text-sm"
              dir="rtl"
            >
              <h3 className="mb-2 font-semibold">عقل الشركة · OCR عربي</h3>
              <p className="text-xs text-stone-600">
                ارفع Word / Excel / PowerPoint / PDF / صوراً عبر «إلى عقل الشركة». النص
                الرقمي يُستخرج مباشرة؛ الملفات الممسوحة تمرّ على OCR عربي:{' '}
                <strong>Qari</strong> (مجاني على Hugging Face) إن وُجد{' '}
                <code dir="ltr">HF_TOKEN</code> أو{' '}
                <code dir="ltr">QARI_OCR_URL</code>، وإلا Gemini Vision. ثم يُخزَّن
                النص في RAG للبحث لاحقاً.
              </p>
            </div>
            <div
              className="mb-8 rounded-lg border border-ab-border bg-ab-surface p-4 text-sm"
              dir="rtl"
            >
              <h3 className="mb-2 font-semibold">تخزين الملفات على الماك</h3>
              <p className="text-xs text-stone-600">
                ملفات PDF والملاحظات الصوتية تُحفظ على جهازك في المجلد{' '}
                <code dir="ltr">~/ArabicBuzz/data</code> عند تشغيل{' '}
                <code dir="ltr">npm run dev</code> محلياً، أو عبر وكيل المزامنة{' '}
                <code dir="ltr">npm run storage:sync</code> مع ضبط{' '}
                <code dir="ltr">MAC_SYNC_URL</code> على Netlify (نفق ngrok).
              </p>
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
