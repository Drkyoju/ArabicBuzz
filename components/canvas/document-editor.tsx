'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  content: string
  onChange?: (markdownish: string) => void
  editable?: boolean
  className?: string
  titleAr?: string
}

/**
 * RTL TipTap document editor for letters, vouchers, and agent reports.
 * Uses dir="rtl" + StarterKit (no separate @tiptap/extension-rtl package).
 */
export function DocumentEditor({
  content,
  onChange,
  editable = true,
  className,
  titleAr,
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
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
        <div className="border-b border-ab-border px-3 py-2 text-sm font-semibold text-ab-ink">
          {titleAr}
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
      <div className="flex-1 overflow-auto">
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
