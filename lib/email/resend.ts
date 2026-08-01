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
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    return { ok: false, skipped: true, error: 'RESEND_API_KEY غير مضبوط' }
  }

  const from =
    process.env.RESEND_FROM?.trim() || 'Arabic Buzz <onboarding@resend.dev>'
  const room = opts.roomNameAr || 'غرفة عمل'
  const inviter = opts.inviterNameAr || 'زميل'
  const subject = `دعوة إلى ${room} على Arabic Buzz`
  const text = `مرحباً،

${inviter} دعاك إلى «${room}» على Arabic Buzz.

افتح الرابط للانضمام:
${opts.inviteUrl}

— Arabic Buzz`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject,
        text,
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
