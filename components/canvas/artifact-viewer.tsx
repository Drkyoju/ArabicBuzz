'use client'

import { useCanvasStore, type CanvasArtifact } from '@/lib/canvas/store'
import ReactMarkdown from 'react-markdown'

export function CanvasViewer({
  onPersist,
}: {
  onPersist?: (artifact: CanvasArtifact) => void | Promise<void>
}) {
  const { artifacts, activeId, setEditing, setContent } = useCanvasStore()
  const active = artifacts.find((a) => a.id === activeId) || artifacts[0]

  if (!active) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-stone-500">
        مساحة العرض جاهزة لعرض مخرجات الوكيل والمستندات والمعاينات.
      </div>
    )
  }

  async function copy() {
    await navigator.clipboard.writeText(active!.content)
  }

  function download() {
    const blob = new Blob([active!.content], {
      type: 'text/plain;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = active!.titleAr || 'artifact.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function persist() {
    if (onPersist) await onPersist(active!)
  }

  const tech = ['code', 'json', 'diff'].includes(active.type)

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ab-border px-4 py-3">
        <h2 className="font-semibold">{active.titleAr}</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void copy()} className="text-sm text-ab-accent">
            نسخ الكود
          </button>
          <button
            onClick={() => setEditing(active.id, !active.isEditing)}
            className="text-sm text-ab-accent"
          >
            تعديل
          </button>
          <button
            onClick={() => void persist()}
            className="text-sm text-ab-accent"
          >
            مشاركة مع الغرفة
          </button>
          <button onClick={download} className="text-sm text-ab-accent">
            تحميل
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {active.isEditing ? (
          <textarea
            dir={tech ? 'ltr' : 'rtl'}
            className="h-full w-full rounded-lg border border-ab-border bg-ab-surface p-3 font-mono text-sm"
            value={active.content}
            onChange={(e) => {
              setContent(active.id, e.target.value)
            }}
            onBlur={() => void persist()}
          />
        ) : tech ? (
          <pre
            dir="ltr"
            className="overflow-x-auto rounded-lg bg-stone-900 p-4 text-left text-sm text-stone-100"
          >
            <code>{active.content}</code>
          </pre>
        ) : (
          <div dir="rtl" className="prose prose-sm max-w-none">
            <ReactMarkdown>{active.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}
