'use client'

import { create } from 'zustand'

export interface CanvasArtifact {
  id: string
  type: 'markdown' | 'code' | 'json' | 'diff' | 'html'
  titleAr: string
  content: string
  language?: string
  isEditing: boolean
  /** Agent streamed draft — needs explicit approve before room persist */
  pendingReview?: boolean
  updatedBy?: string | null
  updatedAt?: string | null
}

type CanvasState = {
  artifacts: CanvasArtifact[]
  activeId: string | null
  splitRatio: number
  isCanvasFullscreen: boolean
  upsertArtifact: (partial: Partial<CanvasArtifact> & { id: string }) => void
  setActive: (id: string | null) => void
  setEditing: (id: string, isEditing: boolean) => void
  setContent: (id: string, content: string) => void
  approveArtifact: (id: string) => void
  setSplitRatio: (ratio: number) => void
  toggleCanvasFullscreen: () => void
}

export const useCanvasStore = create<CanvasState>((set) => ({
  artifacts: [],
  activeId: null,
  splitRatio: 0.7,
  isCanvasFullscreen: false,
  upsertArtifact: (partial) =>
    set((state) => {
      const idx = state.artifacts.findIndex((a) => a.id === partial.id)
      if (idx === -1) {
        const created: CanvasArtifact = {
          id: partial.id,
          type: partial.type || 'markdown',
          titleAr: partial.titleAr || partial.id,
          content: partial.content || '',
          language: partial.language,
          isEditing: partial.isEditing ?? false,
          pendingReview: partial.pendingReview,
        }
        return {
          artifacts: [...state.artifacts, created],
          activeId: partial.id,
        }
      }
      const next = [...state.artifacts]
      next[idx] = { ...next[idx], ...partial }
      return { artifacts: next, activeId: partial.id }
    }),
  setActive: (id) => set({ activeId: id }),
  setEditing: (id, isEditing) =>
    set((state) => ({
      artifacts: state.artifacts.map((a) =>
        a.id === id ? { ...a, isEditing } : a
      ),
    })),
  setContent: (id, content) =>
    set((state) => ({
      artifacts: state.artifacts.map((a) =>
        a.id === id ? { ...a, content } : a
      ),
    })),
  approveArtifact: (id) =>
    set((state) => ({
      artifacts: state.artifacts.map((a) =>
        a.id === id ? { ...a, pendingReview: false } : a
      ),
    })),
  setSplitRatio: (ratio) =>
    set({ splitRatio: Math.min(0.9, Math.max(0.4, ratio)) }),
  toggleCanvasFullscreen: () =>
    set((state) => ({ isCanvasFullscreen: !state.isCanvasFullscreen })),
}))
