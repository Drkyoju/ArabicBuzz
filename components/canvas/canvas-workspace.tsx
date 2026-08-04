'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { FileText, LayoutGrid, PenLine } from 'lucide-react'
import { CanvasViewer } from '@/components/canvas/artifact-viewer'
import { DocumentEditor } from '@/components/canvas/document-editor'
import {
  VisualWhiteboard,
  parseAgentDiagramJson,
} from '@/components/canvas/visual-whiteboard'
import { useCanvasStore, type CanvasArtifact } from '@/lib/canvas/store'
import { cn } from '@/lib/utils'

type Tab = 'artifact' | 'document' | 'whiteboard'

/**
 * Left/right workspace canvas with three surfaces:
 * artifacts (existing) · TipTap RTL docs · tldraw whiteboard.
 */
export function CanvasWorkspace({
  onPersist,
  onClose,
  className,
}: {
  onPersist?: (artifact: CanvasArtifact) => void | Promise<void>
  onClose?: () => void
  className?: string
}) {
  const { artifacts, activeId, setContent, upsertArtifact } = useCanvasStore()
  const active = artifacts.find((a) => a.id === activeId) || artifacts[0]
  const [tab, setTab] = useState<Tab>('artifact')

  const diagram = useMemo(() => {
    if (!active || active.type !== 'json') return null
    return parseAgentDiagramJson(active.content)
  }, [active])

  const docContent =
    active && !['code', 'json', 'diff'].includes(active.type)
      ? active.content
      : artifacts.find((a) => a.type === 'markdown' || a.type === 'html')
          ?.content || ''

  return (
    <div className={cn('flex h-full flex-col bg-ab-surface', className)} dir="rtl">
      <div className="flex items-center gap-1 border-b border-ab-border px-2 py-1.5">
        <TabBtn
          active={tab === 'artifact'}
          onClick={() => setTab('artifact')}
          icon={<FileText className="h-3.5 w-3.5" />}
          label="مخرجات"
        />
        <TabBtn
          active={tab === 'document'}
          onClick={() => setTab('document')}
          icon={<PenLine className="h-3.5 w-3.5" />}
          label="مستند"
        />
        <TabBtn
          active={tab === 'whiteboard'}
          onClick={() => setTab('whiteboard')}
          icon={<LayoutGrid className="h-3.5 w-3.5" />}
          label="لوحة"
        />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ms-auto rounded px-2 py-1 text-[11px] text-stone-500 hover:bg-stone-50"
          >
            إغلاق
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'artifact' && (
          <CanvasViewer onPersist={onPersist} className="h-full" />
        )}
        {tab === 'document' && (
          <DocumentEditor
            titleAr={active?.titleAr || 'مستند قابل للتحرير'}
            content={docContent}
            onChange={(html) => {
              if (active && !['code', 'json', 'diff'].includes(active.type)) {
                setContent(active.id, html)
              } else {
                upsertArtifact({
                  id: `doc-${Date.now()}`,
                  type: 'html',
                  titleAr: 'مستند محرّر',
                  content: html,
                  isEditing: true,
                })
              }
            }}
            className="h-full"
          />
        )}
        {tab === 'whiteboard' && (
          <VisualWhiteboard
            className="h-full"
            diagram={diagram}
          />
        )}
      </div>
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px]',
        active
          ? 'bg-ab-accent/10 font-semibold text-ab-accent'
          : 'text-stone-500 hover:bg-stone-50'
      )}
    >
      {icon}
      {label}
    </button>
  )
}
