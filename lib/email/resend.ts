/**
 * Optional transactional email via Resend.
 * Set RESEND_API_KEY (+ optional RESEND_FROM) on Netlify.
 */
export async function sendInviteEmail(opts: {
  to: string
  inviteUrl: string
  roomNameAr?: string
  inviterNameAr?: string
}): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  return sendResendEmail({
    to: opts.to,
    subject: `دعوة إلى ${opts.roomNameAr || 'غرفة عمل'} على Arabic Buzz`,
    text: `مرحباً،

${opts.inviterNameAr || 'زميل'} دعاك إلى «${opts.roomNameAr || 'غرفة عمل'}» على Arabic Buzz.

افتح الرابط للانضمام:
${opts.inviteUrl}

— Arabic Buzz`,
  })
}

export async function sendResendEmail(opts: {
  to: string | string[]
  subject: string
  text: string
  attachments?: Array<{
    filename: string
    contentBase64: string
  }>
}): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    return { ok: false, skipped: true, error: 'RESEND_API_KEY غير مضبوط' }
  }

  const from =
    process.env.RESEND_FROM?.trim() || 'Arabic Buzz <onboarding@resend.dev>'
  const to = Array.isArray(opts.to) ? opts.to : [opts.to]

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject: opts.subject,
        text: opts.text,
        attachments: opts.attachments?.map((a) => ({
          filename: a.filename,
          content: a.contentBase64,
        })),
      }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string }
      return {
        ok: false,
        error: body.message || `Resend HTTP ${res.status}`,
      }
    }
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'تعذّر إرسال البريد',
    }
  }
}
