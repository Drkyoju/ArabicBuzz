import { Suspense } from 'react'
import InviteJoinPage from './invite-client'

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center" dir="rtl">
          <p className="text-sm text-stone-500">جاري التحميل…</p>
        </main>
      }
    >
      <InviteJoinPage />
    </Suspense>
  )
}
