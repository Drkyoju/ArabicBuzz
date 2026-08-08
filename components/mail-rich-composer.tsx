'use client'

import { useEffect, useMemo, type ReactNode } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'
import {
  TextStyleKit,
} from '@tiptap/extension-text-style'
import {
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Plus,
  Strikethrough,
  Underline as UnderlineIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { plainTextToMailHtml } from '@/lib/email/mail-html'

const ARABIC_FONTS = [
  {
    id: 'ibm',
    labelAr: 'IBM Plex عربي',
    value: "'IBM Plex Sans Arabic', Tahoma, Arial, sans-serif",
  },
  {
    id: 'tahoma',
    labelAr: 'Tahoma',
    value: 'Tahoma, Arial, sans-serif',
  },
  {
    id: 'arial',
    labelAr: 'Arial',
    value: 'Arial, Helvetica, sans-serif',
  },
  {
    id: 'traditional',
    labelAr: 'Traditional Arabic',
    value: "'Traditional Arabic', Tahoma, serif",
  },
  {
    id: 'segoe',
    labelAr: 'Segoe UI',
    value: "'Segoe UI', Tahoma, Arial, sans-serif",
  },
] as const

const FONT_SIZES = ['12px', '14px', '15px', '16px', '18px', '20px', '24px'] as const

const COLORS = [
  { id: 'ink', labelAr: 'أسود', value: '#1c1917' },
  { id: 'forest', labelAr: 'أخضر الجمعية', value: '#1a4d3e' },
  { id: 'red', labelAr: 'أحمر', value: '#b91c1c' },
  { id: 'blue', labelAr: 'أزرق', value: '#1d4ed8' },
  { id: 'amber', labelAr: 'عنبري', value: '#b45309' },
  { id: 'gray', labelAr: 'رمادي', value: '#57534e' },
] as const

type Props = {
  /** Plain text or HTML from AI draft / template / parent clear. */
  content: string
  onChange: (payload: { html: string; text: string }) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

/**
 * Compact RTL TipTap composer for بريد الجمعية — email-style formatting toolbar.
 */
export function MailRichComposer({
  content,
  onChange,
  placeholder = 'اكتب ردك هنا…',
  className,
  disabled = false,
}: Props) {
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      TextAlign.configure({
        types: ['paragraph'],
        alignments: ['right', 'center', 'left'],
        defaultAlignment: 'right',
      }),
      TextStyleKit.configure({
        backgroundColor: false,
        lineHeight: false,
      }),
    ],
    []
  )

  const editor = useEditor({
    extensions,
    content: toEditorHtml(content),
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        dir: 'rtl',
        lang: 'ar',
        class: cn(
          'mail-rich-editor min-h-[7.5rem] max-h-[14rem] overflow-y-auto px-2.5 py-2 text-sm leading-relaxed text-ab-ink focus:outline-none',
          '[&_p]:m-0 [&_p+p]:mt-2 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:ps-5',
          '[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:ps-5 [&_a]:text-ab-accent [&_a]:underline'
        ),
        'aria-label': placeholder,
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange({
        html: ed.getHTML(),
        text: ed.getText({ blockSeparator: '\n' }),
      })
    },
  })

  useEffect(() => {
    if (!editor) return
    const next = toEditorHtml(content)
    if (normalizeHtml(editor.getHTML()) !== normalizeHtml(next)) {
      editor.commands.setContent(next, { emitUpdate: false })
    }
  }, [content, editor])

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [disabled, editor])

  if (!editor) {
    return (
      <div
        className={cn(
          'rounded-lg border border-ab-border bg-white px-2 py-4 text-center text-xs text-stone-500',
          className
        )}
      >
        جاري تحميل المحرر…
      </div>
    )
  }

  const currentSize =
    (editor.getAttributes('textStyle').fontSize as string | undefined) || '15px'
  const sizeIdx = Math.max(
    0,
    FONT_SIZES.findIndex((s) => s === currentSize)
  )

  function bumpSize(delta: number) {
    const next = FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, sizeIdx + delta))]
    if (!next) return
    editor?.chain().focus().setFontSize(next).run()
  }

  function setLink() {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('رابط URL', prev || 'https://')
    if (url === null) return
    const trimmed = url.trim()
    if (!trimmed) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-ab-border bg-white',
        className
      )}
      dir="rtl"
    >
      <div
        className="flex flex-wrap items-center gap-0.5 border-b border-ab-border bg-stone-50/90 px-1 py-1"
        role="toolbar"
        aria-label="تنسيق نص البريد"
      >
        <select
          className="h-7 max-w-[9.5rem] rounded border border-ab-border bg-white px-1 text-[10px] text-ab-ink"
          title="نوع الخط"
          aria-label="نوع الخط"
          value={
            (editor.getAttributes('textStyle').fontFamily as string) ||
            ARABIC_FONTS[0].value
          }
          onChange={(e) => {
            const v = e.target.value
            if (!v) editor.chain().focus().unsetFontFamily().run()
            else editor.chain().focus().setFontFamily(v).run()
          }}
        >
          {ARABIC_FONTS.map((f) => (
            <option key={f.id} value={f.value}>
              {f.labelAr}
            </option>
          ))}
        </select>

        <ToolIcon
          title="تصغير الخط"
          onClick={() => bumpSize(-1)}
          disabled={sizeIdx <= 0}
        >
          <Minus className="h-3 w-3" aria-hidden />
        </ToolIcon>
        <span
          className="min-w-[2.25rem] text-center font-mono text-[10px] tabular-nums text-stone-600"
          title="حجم الخط"
          dir="ltr"
        >
          {currentSize.replace('px', '')}
        </span>
        <ToolIcon
          title="تكبير الخط"
          onClick={() => bumpSize(1)}
          disabled={sizeIdx >= FONT_SIZES.length - 1}
        >
          <Plus className="h-3 w-3" aria-hidden />
        </ToolIcon>

        <Sep />

        <ToolIcon
          title="عريض"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" aria-hidden />
        </ToolIcon>
        <ToolIcon
          title="مائل"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" aria-hidden />
        </ToolIcon>
        <ToolIcon
          title="تسطير"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-3.5 w-3.5" aria-hidden />
        </ToolIcon>
        <ToolIcon
          title="يتوسطه خط"
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-3.5 w-3.5" aria-hidden />
        </ToolIcon>

        <Sep />

        <ToolIcon
          title="قائمة نقطية"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" aria-hidden />
        </ToolIcon>
        <ToolIcon
          title="قائمة مرقّمة"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-3.5 w-3.5" aria-hidden />
        </ToolIcon>
        <ToolIcon
          title="رابط"
          active={editor.isActive('link')}
          onClick={setLink}
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden />
        </ToolIcon>

        <Sep />

        <ToolIcon
          title="محاذاة يمين"
          active={editor.isActive({ textAlign: 'right' })}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
        >
          <AlignRight className="h-3.5 w-3.5" aria-hidden />
        </ToolIcon>
        <ToolIcon
          title="توسيط"
          active={editor.isActive({ textAlign: 'center' })}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
        >
          <AlignCenter className="h-3.5 w-3.5" aria-hidden />
        </ToolIcon>

        <Sep />

        <div className="flex items-center gap-0.5 px-0.5" title="لون النص">
          {COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              title={c.labelAr}
              aria-label={c.labelAr}
              className={cn(
                'h-4 w-4 rounded-full border border-stone-300',
                editor.isActive('textStyle', { color: c.value }) &&
                  'ring-2 ring-ab-accent ring-offset-1'
              )}
              style={{ backgroundColor: c.value }}
              onClick={() => editor.chain().focus().setColor(c.value).run()}
            />
          ))}
          <button
            type="button"
            title="إزالة اللون"
            className="rounded px-1 text-[9px] text-stone-500 hover:bg-stone-100"
            onClick={() => editor.chain().focus().unsetColor().run()}
          >
            ×
          </button>
        </div>
      </div>

      <EditorContent editor={editor} />
    </div>
  )
}

function toEditorHtml(content: string): string {
  return plainTextToMailHtml(content || '')
}

function normalizeHtml(html: string): string {
  return html.replace(/\s+/g, ' ').trim()
}

function Sep() {
  return <span className="mx-0.5 h-4 w-px bg-stone-200" aria-hidden />
}

function ToolIcon({
  title,
  active,
  onClick,
  disabled,
  children,
}: {
  title: string
  active?: boolean
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded text-stone-600 hover:bg-white hover:text-ab-ink disabled:opacity-40',
        active && 'bg-ab-accent/15 text-ab-accent'
      )}
    >
      {children}
    </button>
  )
}
