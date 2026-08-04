'use client'

import { ChatMessage } from '@/components/chat-message'
import { ApprovalCard } from '@/components/approval-card'
import { SubagentProgressCard } from '@/components/subagent-progress-card'
import { stripArtifactTags } from '@/lib/agents/canvas-stream'

export type ThreadItem =
  | {
      kind: 'message'
      id: string
      role: 'user' | 'assistant'
      content: string
      qualityWarning?: boolean
    }
  | {
      kind: 'approval'
      id: string
      approvalId: string
      actionName: string
      params: Record<string, unknown>
      riskLevel: 'LOW' | 'HIGH'
      status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'
    }
  | {
      kind: 'subagent'
      id: string
      roleNameAr: string
      status: 'running' | 'done' | 'error'
    }

export function ChatThreadBar({
  items,
  collapsed,
  onToggle,
}: {
  items: ThreadItem[]
  collapsed?: boolean
  onToggle?: () => void
}) {
  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        className="h-full w-10 border-e border-ab-border bg-ab-surface text-sm text-ab-accent"
      >
        المحادثة
      </button>
    )
  }

  return (
    <div className="flex h-full flex-col border-e border-ab-border bg-ab-surface">
      <div className="flex items-center justify-between border-b border-ab-border px-4 py-3">
        <h2 className="font-semibold">خيط المحادثة</h2>
        <button onClick={onToggle} className="text-sm text-stone-500">
          طي
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {items.map((item) => {
          if (item.kind === 'message') {
            return (
              <ChatMessage
                key={item.id}
                role={item.role}
                content={stripArtifactTags(item.content)}
                qualityWarning={item.qualityWarning}
              />
            )
          }
          if (item.kind === 'approval') {
            return (
              <ApprovalCard
                key={item.id}
                approvalId={item.approvalId}
                actionName={item.actionName}
                params={item.params}
                riskLevel={item.riskLevel}
                status={item.status}
              />
            )
          }
          return (
            <SubagentProgressCard
              key={item.id}
              roleNameAr={item.roleNameAr}
              status={item.status}
            />
          )
        })}
      </div>
    </div>
  )
}
