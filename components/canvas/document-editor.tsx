'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'
import { RemoteCursorsExtension } from '@/lib/canvas/remote-cursors-extension'
import { useLiveDocCollab } from '@/lib/canvas/use-live-doc-collab'
import { refreshRemoteCursors } from '@/lib/canvas/remote-cursors-extension'

type Props = {
  content: string
  onChange?: (markdownish: string) => void
  editable?: boolean
  className?: string
  titleAr?: string
  /** Room scope — enables live co-edit cursors */
  scopeId?: string
  /** Document / artifact id for the collab channel */
  docId?: string
  displayName?: string
  liveCollab?: boolean
}

/**
 * RTL TipTap document editor with optional Google Docs–style live cursors
 * (Supabase broadcast — room-shared, not one account).
 */
export function DocumentEditor({
  content,
  onChange,
  editable = true,
  className,
  titleAr,
  scopeId,
  docId,
  displayName,
  liveCollab = true,
}: Props) {
  const cursorsFn = useRef<() => ReturnType<typeof useLiveDocCollab>['peers']>(
    () => []
  )
  const contentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      RemoteCursorsExtension.configure({
        getCursors: () => cursorsFn.current(),
      }),
    ],
    content: contentToHtml(content),
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        dir: 'rtl',
        lang: 'ar',
        class:
          'prose prose-sm max-w-none min-h-[16rem] focus:outline-none px-3 py-2 text-ab-ink',
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange?.(ed.getHTML())
    },
  })

  const collab = useLiveDocCollab({
    scopeId,
    docId,
    displayName,
    editor,
    enabled: Boolean(liveCollab && scopeId && docId),
  })

  cursorsFn.current = collab.getCursors

  useEffect(() => {
    if (editor) refreshRemoteCursors(editor)
  }, [collab.peers, editor])

  useEffect(() => {
    if (!editor) return
    const next = contentToHtml(content)
    if (editor.getHTML() !== next) {
      editor.commands.setContent(next, { emitUpdate: false })
    }
  }, [content, editor])

  useEffect(() => {
    if (!editor) return
    editor.setEditable(editable)
  }, [editable, editor])

  useEffect(() => {
    if (!editor || !collab.broadcastCursor) return
    const sendSel = () => {
      const { from, to } = editor.state.selection
      collab.broadcastCursor(from, to)
    }
    editor.on('selectionUpdate', sendSel)
    editor.on('focus', sendSel)
    const pulse = window.setInterval(sendSel, 2500)
    return () => {
      editor.off('selectionUpdate', sendSel)
      editor.off('focus', sendSel)
      window.clearInterval(pulse)
    }
  }, [editor, collab])

  useEffect(() => {
    if (!editor || !collab.broadcastContent) return
    const onUp = () => {
      collab.markLocalEdit()
      if (contentTimer.current) clearTimeout(contentTimer.current)
      contentTimer.current = setTimeout(() => {
        collab.broadcastContent(editor.getHTML())
      }, 450)
    }
    editor.on('update', onUp)
    return () => {
      editor.off('update', onUp)
      if (contentTimer.current) clearTimeout(contentTimer.current)
    }
  }, [editor, collab])

  const peerStrip = useMemo(() => collab.peers.slice(0, 8), [collab.peers])

  if (!editor) {
    return (
      <div className="p-4 text-sm text-stone-500" dir="rtl">
        جاري تحميل المحرر…
      </div>
    )
  }

  return (
    <div
      className={cn('flex h-full flex-col bg-ab-surface', className)}
      dir="rtl"
    >
      {titleAr && (
        <div className="flex items-center justify-between gap-2 border-b border-ab-border px-3 py-2">
          <p className="text-sm font-semibold text-ab-ink">{titleAr}</p>
          {scopeId && docId && (
            <p className="text-[10px] text-ab-muted-soft">
              تحرير مباشر · مؤشرات حية
            </p>
          )}
        </div>
      )}
      {peerStrip.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-ab-border bg-stone-50/80 px-2 py-1.5">
          <span className="text-[10px] text-stone-500">يحرّرون الآن:</span>
          {peerStrip.map((p) => (
            <span
              key={p.clientId}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: p.color }}
            >
              {p.name}
            </span>
          ))}
        </div>
      )}
      {editable && (
        <div className="flex flex-wrap gap-1 border-b border-ab-border px-2 py-1.5">
          <ToolbarBtn
            label="عريض"
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <ToolbarBtn
            label="مائل"
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <ToolbarBtn
            label="عنوان"
            active={editor.isActive('heading', { level: 2 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
          />
          <ToolbarBtn
            label="قائمة"
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <ToolbarBtn
            label="مرقّمة"
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
        </div>
      )}
      <div className="relative flex-1 overflow-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

function ToolbarBtn({
  label,
  active,
  onClick,
}: {
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded px-2 py-1 text-[11px]',
        active
          ? 'bg-ab-accent/15 font-semibold text-ab-accent'
          : 'text-stone-600 hover:bg-stone-50'
      )}
    >
      {label}
    </button>
  )
}

function contentToHtml(content: string) {
  const t = content.trim()
  if (!t) return '<p></p>'
  if (t.startsWith('<')) return t
  return t
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('')
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
