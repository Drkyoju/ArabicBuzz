import { prisma, withPrismaFallback } from '@/lib/db'

/** Simple due check for `M H * * *` expressions in Asia/Riyadh. */
export function isSimpleCronDue(
  cronExpr: string,
  now = new Date(),
  lastRunAt?: Date | null
): boolean {
  const parts = cronExpr.trim().split(/\s+/)
  if (parts.length < 2) return false
  const minute = Number(parts[0])
  const hour = Number(parts[1])
  if (!Number.isFinite(minute) || !Number.isFinite(hour)) return false

  const partsRiyadh = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (t: string) =>
    Number(partsRiyadh.find((p) => p.type === t)?.value || 0)
  const h = get('hour')
  const m = get('minute')
  const day = get('day')
  const month = get('month')
  const year = get('year')

  if (h !== hour || m !== minute) return false
  if (!lastRunAt) return true

  const lastParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(lastRunAt)
  const lg = (t: string) =>
    Number(lastParts.find((p) => p.type === t)?.value || 0)
  return !(
    lg('year') === year &&
    lg('month') === month &&
    lg('day') === day &&
    lg('hour') === hour &&
    lg('minute') === minute
  )
}

export async function listDueScheduledTasks(now = new Date()) {
  const tasks = await withPrismaFallback(
    () =>
      prisma.scheduledTask.findMany({
        where: { enabled: true },
        orderBy: { createdAt: 'asc' },
      }),
    [] as Array<{
      id: string
      scopeId: string
      nameAr: string
      prompt: string
      cronExpr: string
      notifyChannels: unknown
      lastRunAt: Date | null
    }>
  )
  return tasks.filter((t) => isSimpleCronDue(t.cronExpr, now, t.lastRunAt))
}
