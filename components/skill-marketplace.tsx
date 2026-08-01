'use client'

import { useMemo, useState } from 'react'
import {
  KSA_SKILL_CATALOG,
  KSASkillItem,
  searchMarketplaceSkills,
} from '@/lib/skills/marketplace'

const CATEGORIES: Array<KSASkillItem['category'] | 'الكل'> = [
  'الكل',
  'حوكمة',
  'مالية',
  'أنظمة وشؤون قانونية',
  'موارد بشرية',
]

export function SkillMarketplace({
  targetScopeId = 'shared-demo',
}: {
  targetScopeId?: string
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('الكل')
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const skills = useMemo(
    () =>
      searchMarketplaceSkills(
        query,
        category === 'الكل' ? undefined : category
      ),
    [query, category]
  )

  async function install(skillId: string) {
    setMessage('')
    setBusyId(skillId)
    try {
      const res = await fetch('/api/skills/install', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'user-1',
          'x-org-id': 'org-demo',
        },
        body: JSON.stringify({
          skillId,
          targetScopeId,
          userId: 'user-1',
          orgId: 'org-demo',
        }),
      })
      const data = (await res.json()) as { message?: string; error?: string }
      setMessage(data.message || data.error || (res.ok ? 'تم' : 'فشل التثبيت'))
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'خطأ في التثبيت')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="border-t border-ab-border bg-ab-bg px-4 py-8">
      <h2 className="mb-4 text-xl font-bold">سوق المهارات السعودية</h2>
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث عن مهارة..."
          className="min-w-[220px] flex-1 rounded-md border border-ab-border bg-white px-3 py-2"
        />
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-md px-3 py-1.5 text-sm border ${
                category === c
                  ? 'border-ab-accent bg-ab-accent/10 text-ab-accent'
                  : 'border-ab-border bg-white'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      {message && (
        <p className="mb-4 text-sm text-ab-accent">{message}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(skills.length ? skills : KSA_SKILL_CATALOG).map((skill) => (
          <article
            key={skill.id}
            className="rounded-lg border border-ab-border bg-ab-surface p-4"
          >
            <div className="mb-2 text-xs text-ab-accent">{skill.category}</div>
            <h3 className="mb-2 font-semibold">{skill.nameAr}</h3>
            <p className="mb-4 text-sm text-stone-600">{skill.descriptionAr}</p>
            <button
              type="button"
              disabled={busyId === skill.id}
              onClick={() => void install(skill.id)}
              className="rounded-md bg-ab-accent px-3 py-2 text-sm text-white disabled:opacity-40"
            >
              {busyId === skill.id ? 'جاري التثبيت…' : 'تثبيت المهارة'}
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}
