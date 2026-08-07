import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'سياسة الخصوصية — Arabic Buzz',
  description:
    'كيف تجمع Arabic Buzz بيانات الحساب وكيف تُستخدم عند تسجيل الدخول عبر Google أو البريد.',
}

/**
 * Public privacy policy — required URL for Google OAuth consent screen branding.
 * Keep this page live at https://arabicbuzz-fooc9h.cranl.net/privacy
 */
export default function PrivacyPage() {
  return (
    <main
      className="mx-auto min-h-dvh max-w-2xl px-4 py-12 text-ab-ink"
      dir="rtl"
    >
      <p className="text-sm text-stone-500">
        <Link href="/" className="text-ab-accent underline">
          Arabic Buzz
        </Link>
        {' · '}
        <Link href="/auth/login" className="text-ab-accent underline">
          تسجيل الدخول
        </Link>
      </p>
      <h1 className="mt-4 text-2xl font-bold">سياسة الخصوصية</h1>
      <p className="mt-2 text-sm text-stone-600">
        آخر تحديث: أغسطس 2026 · الموقع:{' '}
        <span dir="ltr" className="font-mono text-xs">
          https://arabicbuzz-fooc9h.cranl.net
        </span>
      </p>

      <section className="mt-8 space-y-3 text-sm leading-relaxed text-stone-700">
        <h2 className="text-base font-semibold text-ab-ink">ما الذي نجمعه؟</h2>
        <p>
          عند تسجيل الدخول عبر Google نحصل على اسم العرض والبريد الإلكتروني
          ومعرّف الحساب (صلاحيات الهوية الأساسية فقط). عند اختيارك لاحقاً ربط
          التقويم أو Gmail أو Drive، نطلب صلاحيات إضافية صراحةً لحسابك المرتبط.
        </p>
        <p>
          عند الدخول برمز البريد نجمع عنوان البريد فقط لإرسال رمز الدخول وإنشاء
          الجلسة.
        </p>
      </section>

      <section className="mt-8 space-y-3 text-sm leading-relaxed text-stone-700">
        <h2 className="text-base font-semibold text-ab-ink">كيف نستخدم البيانات؟</h2>
        <ul className="list-disc space-y-2 ps-5">
          <li>المصادقة وإدارة جلسة العمل داخل Arabic Buzz.</li>
          <li>عرض اسمك في الغرف وقوائم الأعضاء وسجل الحضور.</li>
          <li>
            تنفيذ أدوات مساحة العمل التي تفعّلها أنت (تقويم، بريد، ملفات) ضمن
            صلاحياتك.
          </li>
          <li>سجل تدقيق للموافقات البشرية والإجراءات الحساسة.</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3 text-sm leading-relaxed text-stone-700">
        <h2 className="text-base font-semibold text-ab-ink">ما الذي لا نفعله؟</h2>
        <p>
          لا نبيع بياناتك. لا نستخدم بريدك أو محتوى Google للإعلانات. مفاتيح نماذج
          الذكاء الاصطناعي تبقى على الخادم ولا تُشارك مع أعضاء الفريق عبر المتصفح.
        </p>
      </section>

      <section className="mt-8 space-y-3 text-sm leading-relaxed text-stone-700">
        <h2 className="text-base font-semibold text-ab-ink">الاحتفاظ والإلغاء</h2>
        <p>
          يمكنك قطع ربط Google من داخل المساحة (إعدادات التقويم / Gmail). لإلغاء
          صلاحيات التطبيق من جهة Google: حساب Google ← الأمان ← وصول الطرف
          الثالث ← Arabic Buzz ← إزالة الوصول.
        </p>
        <p>
          لطلب حذف الحساب أو البيانات المرتبطة، راسل المالك على{' '}
          <a
            href="mailto:ryodan71@gmail.com"
            className="text-ab-accent underline"
            dir="ltr"
          >
            ryodan71@gmail.com
          </a>
          .
        </p>
      </section>

      <section className="mt-8 space-y-3 text-sm leading-relaxed text-stone-700">
        <h2 className="text-base font-semibold text-ab-ink">التواصل</h2>
        <p>
          للاستفسارات المتعلقة بالخصوصية:{' '}
          <a
            href="mailto:ryodan71@gmail.com"
            className="text-ab-accent underline"
            dir="ltr"
          >
            ryodan71@gmail.com
          </a>
        </p>
      </section>
    </main>
  )
}
