import { prisma, withPrismaFallback } from '@/lib/db'

export async function registerScheduledTask(opts: {
  scopeId: string
  nameAr: string
  prompt: string
  cronExpr: string
  notifyChannels: string[]
  timezone?: string
}) {
  return withPrismaFallback(
    () =>
      prisma.scheduledTask.create({
        data: {
          scopeId: opts.scopeId,
          nameAr: opts.nameAr,
          prompt: opts.prompt,
          cronExpr: opts.cronExpr,
          timezone: opts.timezone || 'Asia/Riyadh',
          notifyChannels: opts.notifyChannels,
          nextRunAt: new Date(),
        },
      }),
    {
      id: 'mem-task',
      scopeId: opts.scopeId,
      nameAr: opts.nameAr,
      prompt: opts.prompt,
      cronExpr: opts.cronExpr,
      timezone: opts.timezone || 'Asia/Riyadh',
      notifyChannels: opts.notifyChannels,
      enabled: true,
      lastRunAt: null,
      nextRunAt: new Date(),
      createdAt: new Date(),
    }
  )
}

/** Parse simple Arabic morning schedule: كل صباح الساعة N */
export function arabicMorningToCron(hour: number): string {
  return `0 ${hour} * * *`
}
