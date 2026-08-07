'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { FileText, LayoutGrid, PenLine } from 'lucide-react'
import { CanvasViewer } from '@/components/canvas/artifact-viewer'
import { useCanvasStore, type CanvasArtifact } from '@/lib/canvas/store'
import { parseAgentDiagramJson } from '@/lib/canvas/agent-diagram'
import { cn } from '@/lib/utils'

const DocumentEditor = dynamic(
  () =>
    import('@/components/canvas/document-editor').then((m) => m.DocumentEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-stone-500">
        جاري تحميل المحرر…
      </div>
    ),
  }
)

const VisualWhiteboard = dynamic(
  () =>
    import('@/components/canvas/visual-whiteboard').then(
      (m) => m.VisualWhiteboard
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-stone-500">
        جاري تحميل اللوحة…
      </div>
    ),
  }
)

type Tab = 'artifact' | 'document' | 'whiteboard'

/**
 * Left/right workspace canvas with three surfaces:
 * artifacts (existing) · TipTap RTL docs · tldraw whiteboard.
 */
export function CanvasWorkspace({
  onPersist,
  onClose,
  className,
  scopeId,
  displayName,
  onSurfaceChange,
}: {
  onPersist?: (artifact: CanvasArtifact) => void | Promise<void>
  onClose?: () => void
  className?: string
  /** Enables live co-edit cursors on the document tab */
  scopeId?: string
  displayName?: string
  onSurfaceChange?: (surface: string) => void
}) {
  const { artifacts, activeId, setContent, upsertArtifact } = useCanvasStore()
  const active = artifacts.find((a) => a.id === activeId) || artifacts[0]
  const [tab, setTab] = useState<Tab>('artifact')
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectTab = (t: Tab) => {
    setTab(t)
    onSurfaceChange?.(
      t === 'document' ? 'document' : t === 'whiteboard' ? 'canvas' : 'canvas'
    )
  }

  const schedulePersist = (artifact: CanvasArtifact) => {
    if (!onPersist) return
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      void onPersist(artifact)
    }, 1200)
  }

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
          onClick={() => selectTab('artifact')}
          icon={<FileText className="h-3.5 w-3.5" />}
          label="مخرجات"
        />
        <TabBtn
          active={tab === 'document'}
          onClick={() => selectTab('document')}
          icon={<PenLine className="h-3.5 w-3.5" />}
          label="مستند"
        />
        <TabBtn
          active={tab === 'whiteboard'}
          onClick={() => selectTab('whiteboard')}
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
          <CanvasViewer
            onPersist={onPersist}
            scopeId={scopeId}
            className="h-full"
          />
        )}
        {tab === 'document' && (
          <DocumentEditor
            titleAr={active?.titleAr || 'مستند قابل للتحرير'}
            content={docContent}
            scopeId={scopeId}
            docId={active?.id || 'room-doc'}
            displayName={displayName}
            liveCollab={Boolean(scopeId)}
            onChange={(html) => {
              if (active && !['code', 'json', 'diff'].includes(active.type)) {
                setContent(active.id, html)
                schedulePersist({
                  ...active,
                  content: html,
                  type:
                    active.type === 'markdown' ? 'markdown' : 'html',
                })
              } else {
                const id = `doc-${Date.now()}`
                const art = {
                  id,
                  type: 'html' as const,
                  titleAr: 'مستند محرّر',
                  content: html,
                  isEditing: true,
                }
                upsertArtifact(art)
                schedulePersist(art)
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
  icon: ReactNode
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
