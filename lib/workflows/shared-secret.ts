export function getDispatchSharedSecret() {
  return (
    process.env.TRIGGER_DEV_WEBHOOK_SECRET?.trim() ||
    process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ||
    process.env.WHATSAPP_VERIFY_TOKEN?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    ''
  )
}

