'use client'

import { create } from 'zustand'
import {
  DEMO_SCOPES,
  isPersonalScope,
  isSharedScope,
} from '@/lib/scopes/manager'
import type { RoomPost, Scope } from '@/lib/scopes/types'

function seedPosts(): Record<string, RoomPost[]> {
  return {
    'personal-demo': [],
    'personal-research': [],
    'shared-demo': [],
    'shared-ops': [],
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
  /** Create a fresh personal desk and activate it. Returns the new scope id. */
  createPersonalDesk: (opts?: { nameAr?: string }) => string
  /** One-click association room (مجلس / لجان / موظفين) from template. */
  createAssociationRoom: (opts?: { nameAr?: string }) => string
  renameScope: (id: string, nameAr: string) => void
  archiveScope: (id: string, archived?: boolean) => void
  addMemory: (scopeId: string, text: string) => boolean
  updateMemory: (scopeId: string, index: number, text: string) => void
  removeMemory: (scopeId: string, index: number) => void
  memoriesForScope: (scopeId: string) => string[]
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  scopes: DEMO_SCOPES,
  activeScopeId: 'shared-demo',
  postsByScope: seedPosts(),

  setActiveScopeId: (id) => {
    if (!get().scopes.some((s) => s.id === id)) return
    set({ activeScopeId: id })
    try {
      localStorage.setItem('ab-active-scope', id)
    } catch {
      /* ignore */
    }
  },

  postsForActive: () => {
    const { activeScopeId, postsByScope } = get()
    return postsByScope[activeScopeId] || []
  },

  activeScope: () => get().scopes.find((s) => s.id === get().activeScopeId),

  personalScopes: () =>
    get().scopes.filter((s) => isPersonalScope(s) && !s.archived),

  sharedScopes: () =>
    get().scopes.filter((s) => isSharedScope(s) && !s.archived),

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

  createPersonalDesk: (opts) => {
    const n =
      get().scopes.filter((s) => 'userId' in s && s.id.startsWith('personal-')).length +
      1
    const id = `personal-${Date.now().toString(36)}`
    const nameAr = opts?.nameAr?.trim() || `جلسة ${n}`
    const scope: Scope = {
      id,
      nameAr,
      descriptionAr: 'مساحة شخصية جديدة — مهام وملفات وذاكرة خاصة بك.',
      userId: 'user-1',
      keychain: {},
      privateMemory: [
        'مساحة شخصية جديدة أنشأها المستخدم من «جلسة جديدة».',
      ],
    }
    set((state) => ({
      scopes: [scope, ...state.scopes],
      activeScopeId: id,
      postsByScope: {
        ...state.postsByScope,
        [id]: [
          {
            id: `welcome-${id}`,
            scopeId: id,
            authorKind: 'agent',
            authorId: 'agent-desk',
            authorNameAr: 'الوكيل الشخصي',
            content:
              'جلسة جديدة جاهزة. اكتب مهمتك أو تكلم بالميكروفون — هذه المساحة خاصة بك.',
            createdAt: Date.now(),
          },
        ],
      },
    }))
    try {
      localStorage.setItem('ab-active-scope', id)
    } catch {
      /* ignore */
    }
    return id
  },

  createAssociationRoom: (opts) => {
    // Lazy import avoided — keep client bundle light by inlining template shape
    const id = `assoc-${Date.now().toString(36)}`
    const nameAr = opts?.nameAr?.trim() || 'غرفة الجمعية'
    const roleLabelsAr = [
      'مجلس الإدارة',
      'المدير التنفيذي',
      'عضو لجنة',
      'موظف',
      'متطوع',
      'مدقق',
    ]
    const scope: Scope = {
      id,
      nameAr,
      descriptionAr:
        'قالب جمعية: مجلس ولجان وموظفون ومتطوعون — تقويم مشترك وموافقات عربية.',
      members: ['user-1'],
      memberLabelsAr: roleLabelsAr,
      agentLabelsAr: ['وكيل التقارير', 'وكيل الامتثال', 'وكيل الجدولة'],
      sharedMemory: [
        'اللغة الرسمية: العربية الفصحى المهنية.',
        'الأدوار: مجلس الإدارة · المدير التنفيذي · أعضاء اللجان · موظفون · متطوعون · مدقق.',
        'المواعيد النظامية (ترخيص / عمومية / تقرير سنوي) تُتابع في تقويم الفريق.',
        'الموافقات البشرية للإجراءات عالية المخاطر عند تفعيل HITL.',
        'عند الإجابة من قاعدة المعرفة: اذكر المصادر بصيغة [مصدر N: …].',
      ],
      skills: [
        'arabic_report_generator',
        'zatca_e_invoicing_checker',
        'cron_digest',
        'channel_notify',
      ],
    }
    const welcome = [
      `مرحباً بكم في «${nameAr}».`,
      'غرفة جمعية جاهزة: أدوار المجلس واللجان والموظفين في الذاكرة.',
      'ادعُ الأعضاء، اضبط المواعيد النظامية، واربط تيليجرام للتنبيهات.',
    ].join('\n')
    set((state) => ({
      scopes: [scope, ...state.scopes],
      activeScopeId: id,
      postsByScope: {
        ...state.postsByScope,
        [id]: [
          {
            id: `welcome-${id}`,
            scopeId: id,
            authorKind: 'system',
            authorId: 'system-assoc-template',
            authorNameAr: 'قالب الجمعية',
            content: welcome,
            createdAt: Date.now(),
          },
        ],
      },
    }))
    try {
      localStorage.setItem('ab-active-scope', id)
    } catch {
      /* ignore */
    }
    return id
  },

  renameScope: (id, nameAr) => {
    const trimmed = nameAr.trim()
    if (!trimmed) return
    set((state) => ({
      scopes: state.scopes.map((s) =>
        s.id === id ? { ...s, nameAr: trimmed } : s
      ),
    }))
  },

  archiveScope: (id, archived = true) => {
    set((state) => {
      const scopes = state.scopes.map((s) =>
        s.id === id ? { ...s, archived } : s
      )
      let activeScopeId = state.activeScopeId
      if (archived && activeScopeId === id) {
        const next = scopes.find((s) => !s.archived)
        if (next) activeScopeId = next.id
      }
      return { scopes, activeScopeId }
    })
  },

  memoriesForScope: (scopeId) => {
    const scope = get().scopes.find((s) => s.id === scopeId)
    if (!scope) return []
    return isPersonalScope(scope) ? scope.privateMemory : scope.sharedMemory
  },

  addMemory: (scopeId, text) => {
    const trimmed = text.trim()
    if (!trimmed) return false
    const scope = get().scopes.find((s) => s.id === scopeId)
    if (!scope) return false
    const existing = isPersonalScope(scope)
      ? scope.privateMemory
      : isSharedScope(scope)
        ? scope.sharedMemory
        : []
    if (existing.includes(trimmed)) return false
    set((state) => ({
      scopes: state.scopes.map((s) => {
        if (s.id !== scopeId) return s
        if (isPersonalScope(s)) {
          return { ...s, privateMemory: [...s.privateMemory, trimmed] }
        }
        if (isSharedScope(s)) {
          return { ...s, sharedMemory: [...s.sharedMemory, trimmed] }
        }
        return s
      }),
    }))
    persistMemories(get().scopes)
    return true
  },

  updateMemory: (scopeId, index, text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    set((state) => ({
      scopes: state.scopes.map((s) => {
        if (s.id !== scopeId) return s
        if (isPersonalScope(s)) {
          const privateMemory = [...s.privateMemory]
          if (index < 0 || index >= privateMemory.length) return s
          privateMemory[index] = trimmed
          return { ...s, privateMemory }
        }
        if (isSharedScope(s)) {
          const sharedMemory = [...s.sharedMemory]
          if (index < 0 || index >= sharedMemory.length) return s
          sharedMemory[index] = trimmed
          return { ...s, sharedMemory }
        }
        return s
      }),
    }))
    persistMemories(get().scopes)
  },

  removeMemory: (scopeId, index) => {
    set((state) => ({
      scopes: state.scopes.map((s) => {
        if (s.id !== scopeId) return s
        if (isPersonalScope(s)) {
          return {
            ...s,
            privateMemory: s.privateMemory.filter((_, i) => i !== index),
          }
        }
        if (isSharedScope(s)) {
          return {
            ...s,
            sharedMemory: s.sharedMemory.filter((_, i) => i !== index),
          }
        }
        return s
      }),
    }))
    persistMemories(get().scopes)
  },
}))

function persistMemories(scopes: Scope[]) {
  try {
    const payload: Record<string, string[]> = {}
    for (const s of scopes) {
      payload[s.id] = isPersonalScope(s) ? s.privateMemory : s.sharedMemory
    }
    localStorage.setItem('ab-scope-memories', JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

/** Hydrate memories from localStorage (call once from client). */
export function hydrateScopeMemories() {
  try {
    const raw = localStorage.getItem('ab-scope-memories')
    if (!raw) return
    const payload = JSON.parse(raw) as Record<string, string[]>
    useWorkspaceStore.setState((state) => ({
      scopes: state.scopes.map((s) => {
        const mem = payload[s.id]
        if (!mem || !Array.isArray(mem)) return s
        if (isPersonalScope(s)) return { ...s, privateMemory: mem }
        if (isSharedScope(s)) return { ...s, sharedMemory: mem }
        return s
      }),
    }))
  } catch {
    /* ignore */
  }
}
