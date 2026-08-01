'use client'

import { useEffect, useState } from 'react'
import { WorkspaceShell } from '@/components/workspace-shell'
import type { ThreadItem } from '@/components/chat-thread-bar'
import { useCanvasStore } from '@/lib/canvas/store'

const demoItems: ThreadItem[] = [
  {
    kind: 'message',
    id: 'm1',
    role: 'user',
    content: 'بغيت تقرير عن آخر القرارات، وسوّ لي ملف كود بسيط بعدين.',
  },
  {
    kind: 'message',
    id: 'm2',
    role: 'assistant',
    content: `إليك ملخصاً تنفيذياً بالعربية الفصحى.

\`\`\`json
{
  "report": "قرار_الأسبوع",
  "status": "approved"
}
\`\`\`

يمكنك أيضاً مراجعة الرابط الداخلي: https://localhost:3000/api/skills`,
    qualityWarning: true,
  },
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
  {
    kind: 'subagent',
    id: 's1',
    roleNameAr: 'وكيل تحليل المستندات',
    status: 'done',
  },
  {
    kind: 'subagent',
    id: 's2',
    roleNameAr: 'وكيل استخراج المؤشرات',
    status: 'running',
  },
]

export default function HomePage() {
  const upsertArtifact = useCanvasStore((s) => s.upsertArtifact)
  const [airGapped, setAirGapped] = useState(false)

  useEffect(() => {
    upsertArtifact({
      id: 'nizam-sarf',
      type: 'code',
      titleAr: 'نظام_الصرف.py',
      language: 'python',
      content:
        'def summarize_decisions(items):\n    return {"count": len(items), "lang": "ar"}\n',
      isEditing: false,
    })
    void fetch('/api/security/airgap')
      .then((r) => r.json())
      .then((d) => setAirGapped(Boolean(d.airGapped)))
      .catch(() => setAirGapped(false))
  }, [upsertArtifact])

  return (
    <main>
      <WorkspaceShell airGapped={airGapped} items={demoItems} />
    </main>
  )
}
