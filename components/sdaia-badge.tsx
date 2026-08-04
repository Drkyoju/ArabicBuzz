/** Visible SDAIA trust signal for the workspace chrome. */
export function SdaiaBadge({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <span
        className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-800"
        title="سجل تدقيق ومتوافق مع إرشادات سدايا للذكاء الاصطناعي"
      >
        سدايا
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800"
      title="سجل تدقيق ومتوافق مع إرشادات سدايا للذكاء الاصطناعي"
    >
      متوافق مع سدايا
    </span>
  )
}

/** Footer line stamped into exported PDFs. */
export function sdaiaPdfFooterHtml() {
  const ts = new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })
  return `<footer style="margin-top:32px;padding-top:12px;border-top:1px solid #d6d3d1;font-size:10px;color:#78716c;text-align:center">
Arabic Buzz · متوافق مع إرشادات سدايا · ختم تدقيق · ${ts}
</footer>`
}
