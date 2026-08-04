import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

export type RemoteCursorState = {
  clientId: string
  name: string
  color: string
  from: number
  to: number
}

type Options = {
  getCursors: () => RemoteCursorState[]
}

const key = new PluginKey('abRemoteCursors')

function caretWidget(cursor: RemoteCursorState) {
  return (view: EditorView, getPos: () => number | undefined) => {
    const pos = getPos()
    if (pos == null) return document.createElement('span')

    const wrap = document.createElement('span')
    wrap.className = 'ab-remote-caret'
    wrap.style.setProperty('--ab-caret-color', cursor.color)
    wrap.contentEditable = 'false'
    wrap.setAttribute('data-user', cursor.name)

    const bar = document.createElement('span')
    bar.className = 'ab-remote-caret-bar'

    const label = document.createElement('span')
    label.className = 'ab-remote-caret-label'
    label.textContent = cursor.name

    wrap.appendChild(bar)
    wrap.appendChild(label)

    try {
      const coords = view.coordsAtPos(pos)
      if (coords.left < 80) wrap.classList.add('ab-remote-caret-flip')
    } catch {
      /* ignore */
    }
    return wrap
  }
}

/**
 * TipTap extension: paints remote carets + selection highlights (Docs-style).
 */
export const RemoteCursorsExtension = Extension.create<Options>({
  name: 'abRemoteCursors',

  addOptions() {
    return {
      getCursors: () => [],
    }
  },

  addProseMirrorPlugins() {
    const getCursors = () => this.options.getCursors()
    return [
      new Plugin({
        key,
        props: {
          decorations(state) {
            const cursors = getCursors()
            if (!cursors.length) return null
            const decos = []
            const size = state.doc.content.size
            for (const c of cursors) {
              const from = Math.max(0, Math.min(c.from, size))
              const to = Math.max(0, Math.min(c.to, size))
              if (from !== to) {
                decos.push(
                  Decoration.inline(Math.min(from, to), Math.max(from, to), {
                    class: 'ab-remote-selection',
                    style: `background-color: ${c.color}33`,
                  })
                )
              }
              decos.push(
                Decoration.widget(to, caretWidget(c), {
                  side: 1,
                  key: `caret-${c.clientId}`,
                })
              )
            }
            return DecorationSet.create(state.doc, decos)
          },
        },
      }),
    ]
  },
})

/** Dispatch empty transaction so decorations re-read cursor list. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function refreshRemoteCursors(editor: any) {
  try {
    editor.view.dispatch(editor.state.tr.setMeta(key, Date.now()))
  } catch {
    /* ignore */
  }
}
