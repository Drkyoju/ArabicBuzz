'use client'

import { create } from 'zustand'
import {
  DEMO_SCOPES,
  isPersonalScope,
  isSharedScope,
} from '@/lib/scopes/manager'
import type { RoomPost, Scope, SharedScope } from '@/lib/scopes/types'

const SCOPES_STORAGE_KEY = 'ab-scopes-v1'

function seedPosts(): Record<string, RoomPost[]> {
  return {
    'personal-demo': [],
    'personal-research': [],
    'shared-demo': [],
    'shared-ops': [],
  }
}

function isDemoScopeId(id: string): boolean {
  return DEMO_SCOPES.some((d) => d.id === id)
}

/** Demo scopes always present; custom rooms merged on top; demos never stay archived. */
export function mergeScopesWithDemos(custom: Scope[]): Scope[] {
  const byId = new Map<string, Scope>()
  for (const d of DEMO_SCOPES) {
    byId.set(d.id, { ...d, archived: false })
  }
  for (const c of custom) {
    if (!c?.id) continue
    if (isDemoScopeId(c.id)) {
      const demo = byId.get(c.id)!
      byId.set(c.id, {
        ...demo,
        nameAr: c.nameAr?.trim() || demo.nameAr,
        archived: false,
      })
      continue
    }
    byId.set(c.id, c)
  }
  const demos = DEMO_SCOPES.map((d) => byId.get(d.id)!)
  const customs = [...byId.values()].filter((s) => !isDemoScopeId(s.id))
  return [...demos, ...customs]
}

function persistScopes(scopes: Scope[]) {
  try {
    const custom = scopes.filter((s) => !isDemoScopeId(s.id))
    const demoRenames = scopes
      .filter((s) => isDemoScopeId(s.id))
      .map((s) => ({ id: s.id, nameAr: s.nameAr }))
    localStorage.setItem(
      SCOPES_STORAGE_KEY,
      JSON.stringify({ custom, demoRenames, v: 1 })
    )
  } catch {
    /* ignore */
  }
}

function loadPersistedScopes(): Scope[] {
  try {
    const raw = localStorage.getItem(SCOPES_STORAGE_KEY)
    if (!raw) return DEMO_SCOPES
    const parsed = JSON.parse(raw) as {
      custom?: Scope[]
      demoRenames?: { id: string; nameAr: string }[]
    }
    let merged = mergeScopesWithDemos(
      Array.isArray(parsed.custom) ? parsed.custom : []
    )
    if (Array.isArray(parsed.demoRenames)) {
      merged = merged.map((s) => {
        const r = parsed.demoRenames!.find((x) => x.id === s.id)
        return r?.nameAr?.trim() ? { ...s, nameAr: r.nameAr.trim() } : s
      })
    }
    return merged
  } catch {
    return DEMO_SCOPES
  }
}

function stubSharedRoom(opts: {
  id: string
  nameAr?: string
  descriptionAr?: string
}): SharedScope {
  return {
    id: opts.id,
    nameAr: opts.nameAr?.trim() || guessRoomName(opts.id),
    descriptionAr:
      opts.descriptionAr ||
      'غرفة مشتركة — ملفات ومحادثة من أي جهاز بعد تسجيل الدخول.',
    members: ['user-1'],
    memberLabelsAr: [],
    agentLabelsAr: ['وكيل التقارير', 'وكيل الامتثال'],
    sharedMemory: [
      'اللغة الرسمية للغرفة: العربية الفصحى المهنية.',
      'ارفع الملفات من جهازك — لا يلزم Google Drive للتعديل.',
    ],
    skills: [
      'arabic_report_generator',
      'zatca_e_invoicing_checker',
      'cron_digest',
      'channel_notify',
    ],
  }
}

function guessRoomName(scopeId: string): string {
  if (scopeId.startsWith('assoc-')) return 'غرفة الجمعية'
  if (scopeId.startsWith('personal-')) return 'جلسة شخصية'
  if (scopeId.startsWith('shared-')) return 'غرفة مشتركة'
  return `غرفة ${scopeId.slice(0, 14)}`
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
  /** Ensure a scope exists in the sidebar (invite / server sync). */
  upsertScope: (scope: Scope) => void
  /** Merge server membership rooms into the sidebar. */
  syncRemoteRooms: (
    rooms: { scopeId: string; nameAr?: string; kind?: 'personal' | 'shared' }[]
  ) => void
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
      get().scopes.filter((s) => 'userId' in s && s.id.startsWith('personal-'))
        .length + 1
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
        'ارفع ملفاً من جهازك واطلب التعديل — لا يلزم Drive.',
      ],
    }
    set((state) => {
      const scopes = mergeScopesWithDemos([scope, ...state.scopes])
      persistScopes(scopes)
      return {
        scopes,
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
                'جلسة جديدة جاهزة. ارفع ملفاً من جهازك (📎) واكتب طلب التعديل — الملف يُحفظ في الغرفة ويظهر زر التنزيل بعد التعديل.',
              createdAt: Date.now(),
            },
          ],
        },
      }
    })
    try {
      localStorage.setItem('ab-active-scope', id)
    } catch {
      /* ignore */
    }
    return id
  },

  createAssociationRoom: (opts) => {
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
        'ارفع الملفات من أي جهاز بعد تسجيل الدخول — التعديل في الغرفة بلا Drive إلزامي.',
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
      'ارفع ملفاً من جهازك (📎 ارفع من جهازك) واطلب من الوكيل تعديله — لا يلزم Google Drive.',
      'ادعُ الأعضاء، اضبط المواعيد النظامية، واربط تيليجرام للتنبيهات.',
    ].join('\n')
    set((state) => {
      const scopes = mergeScopesWithDemos([scope, ...state.scopes])
      persistScopes(scopes)
      return {
        scopes,
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
      }
    })
    try {
      localStorage.setItem('ab-active-scope', id)
    } catch {
      /* ignore */
    }
    return id
  },

  upsertScope: (scope) => {
    if (!scope?.id) return
    set((state) => {
      const existing = state.scopes.find((s) => s.id === scope.id)
      const next = existing
        ? state.scopes.map((s) =>
            s.id === scope.id
              ? {
                  ...s,
                  ...scope,
                  nameAr: scope.nameAr?.trim() || s.nameAr,
                }
              : s
          )
        : [scope, ...state.scopes]
      const scopes = mergeScopesWithDemos(next)
      persistScopes(scopes)
      const postsByScope = { ...state.postsByScope }
      if (!postsByScope[scope.id]) postsByScope[scope.id] = []
      return { scopes, postsByScope }
    })
  },

  syncRemoteRooms: (rooms) => {
    if (!rooms?.length) return
    set((state) => {
      let scopes = [...state.scopes]
      const postsByScope = { ...state.postsByScope }
      for (const r of rooms) {
        const id = String(r.scopeId || '').trim()
        if (!id) continue
        const known = scopes.some((s) => s.id === id)
        if (known) {
          if (r.nameAr?.trim()) {
            scopes = scopes.map((s) =>
              s.id === id ? { ...s, nameAr: r.nameAr!.trim() } : s
            )
          }
          continue
        }
        if (r.kind === 'personal' || id.startsWith('personal-')) {
          scopes = [
            {
              id,
              nameAr: r.nameAr?.trim() || guessRoomName(id),
              descriptionAr: 'جلسة شخصية مزامَنة من حسابك.',
              userId: 'user-1',
              keychain: {},
              privateMemory: [
                'جلسة مزامَنة — ارفع ملفاً من جهازك واطلب التعديل.',
              ],
            },
            ...scopes,
          ]
        } else {
          scopes = [
            stubSharedRoom({ id, nameAr: r.nameAr }),
            ...scopes,
          ]
        }
        if (!postsByScope[id]) postsByScope[id] = []
      }
      scopes = mergeScopesWithDemos(scopes)
      persistScopes(scopes)
      return { scopes, postsByScope }
    })
  },

  renameScope: (id, nameAr) => {
    const trimmed = nameAr.trim()
    if (!trimmed) return
    set((state) => {
      const scopes = state.scopes.map((s) =>
        s.id === id ? { ...s, nameAr: trimmed } : s
      )
      persistScopes(scopes)
      return { scopes }
    })
  },

  archiveScope: (id, archived = true) => {
    // Demo starter rooms stay visible — hide archive for demos.
    if (isDemoScopeId(id) && archived) return
    set((state) => {
      const scopes = state.scopes.map((s) =>
        s.id === id ? { ...s, archived } : s
      )
      let activeScopeId = state.activeScopeId
      if (archived && activeScopeId === id) {
        const next = scopes.find((s) => !s.archived)
        if (next) activeScopeId = next.id
      }
      persistScopes(scopes)
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
    set((state) => {
      const scopes = state.scopes.map((s) => {
        if (s.id !== scopeId) return s
        if (isPersonalScope(s)) {
          return { ...s, privateMemory: [...s.privateMemory, trimmed] }
        }
        if (isSharedScope(s)) {
          return { ...s, sharedMemory: [...s.sharedMemory, trimmed] }
        }
        return s
      })
      persistScopes(scopes)
      return { scopes }
    })
    persistMemories(get().scopes)
    return true
  },

  updateMemory: (scopeId, index, text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    set((state) => {
      const scopes = state.scopes.map((s) => {
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
      })
      persistScopes(scopes)
      return { scopes }
    })
    persistMemories(get().scopes)
  },

  removeMemory: (scopeId, index) => {
    set((state) => {
      const scopes = state.scopes.map((s) => {
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
      })
      persistScopes(scopes)
      return { scopes }
    })
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

/** Hydrate scopes + memories from localStorage (call once from client). */
export function hydrateScopeMemories() {
  try {
    const scopes = loadPersistedScopes()
    useWorkspaceStore.setState({ scopes })
  } catch {
    /* ignore */
  }
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
