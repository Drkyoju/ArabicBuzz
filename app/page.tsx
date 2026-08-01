'use client'

import { useEffect, useState } from 'react'
import { WorkspaceShell } from '@/components/workspace-shell'
import { useCanvasStore } from '@/lib/canvas/store'

export default function HomePage() {
  const upsertArtifact = useCanvasStore((s) => s.upsertArtifact)
  const [airGapped, setAirGapped] = useState(false)

  useEffect(() => {
    upsertArtifact({
      id: 'nizam-sarf',
      type: 'code',
      titleAr: 'نظام_الصرف.py',
      language: 'python',
      content:
        'def summarize_decisions(items):\n    return {"count": len(items), "lang": "ar"}\n',
      isEditing: false,
    })
    void fetch('/api/security/airgap')
      .then((r) => r.json())
      .then((d) => setAirGapped(Boolean(d.airGapped)))
      .catch(() => setAirGapped(false))
  }, [upsertArtifact])

  return (
    <main>
      <WorkspaceShell airGapped={airGapped} />
    </main>
  )
}
