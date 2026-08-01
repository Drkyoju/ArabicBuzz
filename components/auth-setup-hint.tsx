'use client'

/**
 * Lightweight Auth setup checklist (Google + GitHub) for team access.
 * OAuth client secrets must be pasted in Supabase Dashboard — cannot be automated.
 */
export function AuthSetupHint() {
  return (
    <div className="rounded-lg border border-ab-border bg-ab-surface p-4 text-sm" dir="rtl">
      <h3 className="mb-2 font-semibold">تفعيل دخول الفريق (Google / GitHub)</h3>
      <ol className="list-decimal space-y-1 pr-5 text-xs text-stone-600">
        <li>
          Supabase → Authentication → URL Configuration:
          <br />
          Site URL = <code dir="ltr">https://arabicbuzz.netlify.app</code>
          <br />
          Redirect ={' '}
          <code dir="ltr">https://arabicbuzz.netlify.app/auth/callback</code>
        </li>
        <li>
          Google Cloud OAuth + GitHub OAuth App → callback:
          <br />
          <code dir="ltr">
            https://vqhbgujxhyodxcneexss.supabase.co/auth/v1/callback
          </code>
        </li>
        <li>فعّل المزودين في Supabase → Authentication → Providers</li>
        <li>
          (اختياري) أضف OPENROUTER_API_KEY على Netlify لـ Claude / DeepSeek /
          Qwen
        </li>
      </ol>
    </div>
  )
}
