'use client'

import { create } from 'zustand'

export type FilePreviewTarget = {
  fileId: string
  scopeId: string
  name: string
  mimeType?: string
}

type FilePreviewState = {
  open: boolean
  file: FilePreviewTarget | null
  /** Bumped to force reload (live edits). */
  revision: number
  openPreview: (file: FilePreviewTarget) => void
  closePreview: () => void
  bumpRevision: () => void
  /** Same file id → bump; new id → open. */
  notifyFileReady: (file: FilePreviewTarget) => void
}

export const useFilePreviewStore = create<FilePreviewState>((set, get) => ({
  open: false,
  file: null,
  revision: 0,
  openPreview: (file) =>
    set({
      open: true,
      file: {
        fileId: file.fileId,
        scopeId: file.scopeId,
        name: file.name,
        mimeType: file.mimeType,
      },
      revision: get().revision + 1,
    }),
  closePreview: () => set({ open: false }),
  bumpRevision: () => set({ revision: get().revision + 1 }),
  notifyFileReady: (file) => {
    const cur = get().file
    if (cur && cur.fileId === file.fileId && get().open) {
      set({
        file: { ...cur, name: file.name, mimeType: file.mimeType || cur.mimeType },
        revision: get().revision + 1,
      })
      return
    }
    get().openPreview(file)
  },
}))

/** Open preview from any panel and jump to the room chat section. */
export function openFilePreviewInChat(file: FilePreviewTarget) {
  useFilePreviewStore.getState().openPreview(file)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ab-nav', { detail: 'chats' }))
    window.dispatchEvent(
      new CustomEvent('ab-file-preview', { detail: file })
    )
  }
}
