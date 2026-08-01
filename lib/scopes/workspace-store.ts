'use client'

import { create } from 'zustand'
import {
  DEMO_SCOPES,
  isPersonalScope,
  isSharedScope,
} from '@/lib/scopes/manager'
import type { RoomPost, Scope } from '@/lib/scopes/types'

function seedPosts(): Record<string, RoomPost[]> {
  const now = Date.now()
  return {
    'personal-demo': [
      {
        id: 'p-seed-1',
        scopeId: 'personal-demo',
        authorKind: 'agent',
        authorId: 'agent-desk',
        authorNameAr: 'وكيلك الشخصي',
        content:
          'مرحباً. هذه مساحتك الشخصية — الذاكرة والملفات هنا خاصة بك. اكتب أي مهمة وسأعمل معك.',
        createdAt: now - 60_000,
      },
    ],
    'personal-research': [
      {
        id: 'pr-seed-1',
        scopeId: 'personal-research',
        authorKind: 'agent',
        authorId: 'agent-research',
        authorNameAr: 'وكيل البحث',
        content:
          'مساحة البحث جاهزة. يمكنك صياغة مسودات هنا قبل نقلها إلى غرفة الفريق.',
        createdAt: now - 50_000,
      },
    ],
    'shared-demo': [
      {
        id: 's-seed-1',
        scopeId: 'shared-demo',
        authorKind: 'human',
        authorId: 'user-2',
        authorNameAr: 'سارة',
        content:
          'السلام عليكم — نحتاج ملخص قرار الأسبوع بالعربية الفصحى قبل اجتماع الغد.',
        createdAt: now - 120_000,
      },
      {
        id: 's-seed-2',
        scopeId: 'shared-demo',
        authorKind: 'agent',
        authorId: 'agent-reports',
        authorNameAr: 'وكيل التقارير',
        content:
          'تم استلام الطلب. سأعتمد ذاكرة الغرفة المشتركة وأجهّز مسودة الملخص للمراجعة البشرية.',
        createdAt: now - 90_000,
      },
      {
        id: 's-seed-3',
        scopeId: 'shared-demo',
        authorKind: 'human',
        authorId: 'user-3',
        authorNameAr: 'فهد',
        content: 'أضف فقرة عن سياسة الموافقات منخفضة المخاطر إن وُجدت في الذاكرة.',
        createdAt: now - 70_000,
      },
      {
        id: 's-seed-4',
        scopeId: 'shared-demo',
        authorKind: 'agent',
        authorId: 'agent-compliance',
        authorNameAr: 'وكيل الامتثال',
        content:
          'ملاحظة: أي إجراء عالي المخاطر سيظهر في سجل الموافقات قبل التنفيذ.',
        createdAt: now - 40_000,
      },
    ],
    'shared-ops': [
      {
        id: 'o-seed-1',
        scopeId: 'shared-ops',
        authorKind: 'agent',
        authorId: 'agent-cron',
        authorNameAr: 'وكيل الجدولة',
        content:
          'آخر تشغيل للـ Cron نجح. الملخص الصباحي مجدول الساعة 09:00 بتوقيت الرياض.',
        createdAt: now - 80_000,
      },
      {
        id: 'o-seed-2',
        scopeId: 'shared-ops',
        authorKind: 'human',
        authorId: 'user-2',
        authorNameAr: 'سارة',
        content: 'هل ربط تيليجرام ما زال على هذه الغرفة؟',
        createdAt: now - 55_000,
      },
      {
        id: 'o-seed-3',
        scopeId: 'shared-ops',
        authorKind: 'agent',
        authorId: 'agent-channels',
        authorNameAr: 'وكيل القنوات',
        content:
          'نعم — تيليجرام وواتساب مربوطان بمساحة العمليات. الموافقات عالية المخاطر تصل كأزرار مضمنة.',
        createdAt: now - 30_000,
      },
    ],
  }
}

type WorkspaceState = {
  scopes: Scope[]
  activeScopeId: string
  postsByScope: Record<string, RoomPost[]>
  setActiveScopeId: (id: string) => void
  postsForActive: () => RoomPost[]
  activeScope: () => Scope | undefined
  personalScopes: () => Scope[]
  sharedScopes: () => Scope[]
  appendPost: (post: RoomPost) => void
  updatePost: (scopeId: string, postId: string, patch: Partial<RoomPost>) => void
  setPostsForScope: (scopeId: string, posts: RoomPost[]) => void
  mergePost: (post: RoomPost) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  scopes: DEMO_SCOPES,
  activeScopeId: 'shared-demo',
  postsByScope: seedPosts(),

  setActiveScopeId: (id) => {
    if (!get().scopes.some((s) => s.id === id)) return
    set({ activeScopeId: id })
  },

  postsForActive: () => {
    const { activeScopeId, postsByScope } = get()
    return postsByScope[activeScopeId] || []
  },

  activeScope: () => get().scopes.find((s) => s.id === get().activeScopeId),

  personalScopes: () => get().scopes.filter(isPersonalScope),

  sharedScopes: () => get().scopes.filter(isSharedScope),

  appendPost: (post) =>
    set((state) => ({
      postsByScope: {
        ...state.postsByScope,
        [post.scopeId]: [...(state.postsByScope[post.scopeId] || []), post],
      },
    })),

  updatePost: (scopeId, postId, patch) =>
    set((state) => ({
      postsByScope: {
        ...state.postsByScope,
        [scopeId]: (state.postsByScope[scopeId] || []).map((p) =>
          p.id === postId ? { ...p, ...patch } : p
        ),
      },
    })),

  setPostsForScope: (scopeId, posts) =>
    set((state) => ({
      postsByScope: { ...state.postsByScope, [scopeId]: posts },
    })),

  mergePost: (post) =>
    set((state) => {
      const list = state.postsByScope[post.scopeId] || []
      if (list.some((p) => p.id === post.id)) {
        return {
          postsByScope: {
            ...state.postsByScope,
            [post.scopeId]: list.map((p) => (p.id === post.id ? post : p)),
          },
        }
      }
      // de-dupe near-identical agent content within 2s
      const dup = list.find(
        (p) =>
          p.authorKind === post.authorKind &&
          p.content === post.content &&
          Math.abs(p.createdAt - post.createdAt) < 2000
      )
      if (dup) return state
      return {
        postsByScope: {
          ...state.postsByScope,
          [post.scopeId]: [...list, post],
        },
      }
    }),
}))
