'use client'

import { useRef } from 'react'
import { CanvasWorkspace } from '@/components/canvas/canvas-workspace'
import { ChatThreadBar, ThreadItem } from '@/components/chat-thread-bar'
import { useCanvasStore } from '@/lib/canvas/store'

export function SplitWorkspace({ items }: { items: ThreadItem[] }) {
  const {
    splitRatio,
    setSplitRatio,
    isCanvasFullscreen,
    toggleCanvasFullscreen,
  } = useCanvasStore()
  const dragging = useRef(false)

  return (
    <div dir="rtl" className="flex h-[calc(100vh-4rem)] w-full">
      {!isCanvasFullscreen && (
        <div
          className="relative h-full border-l border-ab-border"
          style={{ width: `${(1 - splitRatio) * 100}%` }}
        >
          <ChatThreadBar
            items={items}
            onToggle={toggleCanvasFullscreen}
          />
        </div>
      )}
      <div
        className="h-full cursor-col-resize bg-ab-border"
        style={{ width: 4 }}
        onMouseDown={() => {
          dragging.current = true
          const onMove = (e: MouseEvent) => {
            if (!dragging.current) return
            const ratio = 1 - e.clientX / window.innerWidth
            setSplitRatio(ratio)
          }
          const onUp = () => {
            dragging.current = false
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
          }
          window.addEventListener('mousemove', onMove)
          window.addEventListener('mouseup', onUp)
        }}
      />
      <div
        className="h-full bg-ab-bg"
        style={{
          width: isCanvasFullscreen ? '100%' : `${splitRatio * 100}%`,
        }}
      >
        <div className="flex items-center justify-end gap-2 border-b border-ab-border px-3 py-2">
          <button
            onClick={toggleCanvasFullscreen}
            className="text-sm text-ab-accent"
          >
            {isCanvasFullscreen ? 'استعادة التقسيم' : 'ملء الشاشة'}
          </button>
        </div>
        <CanvasWorkspace />
      </div>
    </div>
  )
}
