'use client'

/**
 * In-app MSA checklists for actions that require the user to click in an
 * external console (Google Cloud / BotFather / Google OAuth re-consent).
 * Code cannot finish these — we only guide.
 */

import type { ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

const CONSENT =
  'https://console.cloud.google.com/apis/credentials/consent'
const BOTFATHER = 'https://t.me/BotFather'

export type ConsoleChecklistFocus =
  | 'all'
  | 'google-test-users'
  | 'telegram-privacy'
  | 'gmail-modify'

function Card({
  title,
  badge,
  children,
  className,
}: {
  title: string
  badge: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-amber-200/90 bg-amber-50/70 px-3 py-2.5 text-[11px] leading-relaxed text-amber-950',
        className
      )}
      dir="rtl"
    >
      <p className="flex flex-wrap items-center gap-2 font-semibold text-ab-ink">
        <span>{title}</span>
        <span className="rounded bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-medium text-amber-950">
          {badge}
        </span>
      </p>
      <div className="mt-1.5 space-y-1.5 text-stone-700">{children}</div>
    </div>
  )
}

/** Google OAuth Testing → add Test users (owner must click in Console). */
export function GoogleTestUsersChecklist({
  className,
  compact,
}: {
  className?: string
  compact?: boolean
}) {
  return (
    <Card
      title="مستخدمو الاختبار (Test users)"
      badge="يلزم ضغطك في Google Console"
      className={className}
    >
      <p>
        إذا بقي التطبيق في وضع <strong>Testing</strong> فلن يدخل إلا من أُضيف
        صراحةً كـ Test user — الكود لا يضيف زملاءك تلقائياً.
      </p>
      {!compact && (
        <ol className="list-decimal space-y-1 pe-4">
          <li>
            افتح شاشة موافقة OAuth → Audience / Test users
          </li>
          <li>أضف بريد كل زميل يحتاج الدخول الآن</li>
          <li>
            أو اضغط <strong>Publish app</strong> → Production (لجميع الحسابات
            لاحقاً — قد يظهر تحذير «غير موثّق» حتى اكتمال Verification)
          </li>
        </ol>
      )}
      <a
        href={CONSENT}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 font-semibold text-ab-accent underline"
        dir="ltr"
      >
        فتح OAuth consent / Test users
        <ExternalLink className="h-3 w-3" aria-hidden />
      </a>
    </Card>
  )
}

/** BotFather → Group Privacy → Disable (owner must click in Telegram). */
export function TelegramGroupPrivacyChecklist({
  className,
  compact,
}: {
  className?: string
  compact?: boolean
}) {
  return (
    <Card
      title="Group Privacy في BotFather"
      badge="يلزم ضغطك في تيليجرام"
      className={className}
    >
      <p>
        بدون تعطيل الخصوصية يرى البوت الأوامر والمنشن فقط — لن يسمع طلبات
        المجموعة العادية. لا يمكن للموقع تغيير ذلك نيابةً عنك.
      </p>
      {!compact && (
        <ol className="list-decimal space-y-1 pe-4">
          <li>
            افتح{' '}
            <a
              href={BOTFATHER}
              target="_blank"
              rel="noreferrer"
              className="text-ab-accent underline"
              dir="ltr"
            >
              @BotFather
            </a>
          </li>
          <li>
            <code dir="ltr">/mybots</code> → بوتك → Bot Settings → Group Privacy
          </li>
          <li>
            اختر <strong>Disable</strong>
          </li>
          <li>
            في المجموعة: أضف البوت كمشرف ثم{' '}
            <code dir="ltr">/link</code>
          </li>
        </ol>
      )}
      <a
        href={BOTFATHER}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 font-semibold text-ab-accent underline"
        dir="ltr"
      >
        فتح @BotFather
        <ExternalLink className="h-3 w-3" aria-hidden />
      </a>
    </Card>
  )
}

/** Re-consent Google so gmail.modify is granted (user must click OAuth). */
export function GmailModifyReconnectChecklist({
  className,
  compact,
  onReconnect,
}: {
  className?: string
  compact?: boolean
  /** Optional in-app button that starts Google OAuth with consent. */
  onReconnect?: () => void
}) {
  return (
    <Card
      title="إعادة ربط Gmail للتعديل (modify)"
      badge="يلزم موافقتك في Google"
      className={className}
    >
      <p>
        النجمة / تعليم كمقروء / التسميات تحتاج صلاحية{' '}
        <code dir="ltr">gmail.modify</code>. إن رُبط الحساب قبل إضافة هذه
        الصلاحية — أعد الربط من الزر داخل التطبيق (شاشة موافقة Google).
      </p>
      {!compact && (
        <ol className="list-decimal space-y-1 pe-4">
          <li>من بريدك الشخصي أو تقويم الفريق: «أعد الربط» / «ربط Google»</li>
          <li>
            في شاشة Google وافق على القراءة والإرسال و<strong>التعديل</strong>
          </li>
          <li>لا تغلق النافذة قبل اكتمال العودة إلى Arabic Buzz</li>
        </ol>
      )}
      {onReconnect ? (
        <button
          type="button"
          onClick={onReconnect}
          className="mt-1 inline-flex rounded-md bg-ab-accent px-2.5 py-1.5 text-[11px] font-semibold text-white"
        >
          إعادة ربط Google الآن
        </button>
      ) : (
        <p className="text-[10px] text-stone-500">
          الزر موجود في لوحة البريد الشخصي وتقويم الفريق — اضغط «أعد الربط».
        </p>
      )}
    </Card>
  )
}

/** Bundle of all console-click guides for Settings. */
export function UserConsoleChecklists({
  focus = 'all',
  className,
  onGmailReconnect,
}: {
  focus?: ConsoleChecklistFocus
  className?: string
  onGmailReconnect?: () => void
}) {
  const showAll = focus === 'all'
  return (
    <div className={cn('space-y-2', className)} dir="rtl">
      <p className="text-[11px] font-semibold text-ab-ink">
        خطوات تحتاج ضغطك خارج الموقع
        <span className="ms-1 font-normal text-stone-500">
          — الكود يوجّه فقط
        </span>
      </p>
      {(showAll || focus === 'google-test-users') && (
        <GoogleTestUsersChecklist />
      )}
      {(showAll || focus === 'telegram-privacy') && (
        <TelegramGroupPrivacyChecklist />
      )}
      {(showAll || focus === 'gmail-modify') && (
        <GmailModifyReconnectChecklist onReconnect={onGmailReconnect} />
      )}
    </div>
  )
}
