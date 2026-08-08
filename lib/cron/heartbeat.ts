import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import { CronExpressionParser } from 'cron-parser'
import { IS_AIR_GAPPED_MODE } from '@/lib/security/airgap'

export type HeartbeatChannel = 'whatsapp' | 'telegram'

export type HeartbeatTask = {
  id: string
  cron: string
  channel: HeartbeatChannel
  recipient: string
  task: string
  nameAr: string
}

function hashId(parts: string[]) {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16)
}

export function parseHeartbeatMarkdown(content: string): HeartbeatTask[] {
  const blocks = content.split(/\n(?=- cron:)/g)
  const tasks: HeartbeatTask[] = []
  for (const block of blocks) {
    const cron = block.match(/cron:\s*"([^"]+)"/)?.[1]
    const channel = block.match(/channel:\s*"([^"]+)"/)?.[1] as
      | HeartbeatChannel
      | undefined
    const recipient = block.match(/recipient:\s*"([^"]+)"/)?.[1]
    const task = block.match(/task:\s*"([^"]+)"/)?.[1]
    if (!cron || !channel || !recipient || !task) continue
    if (channel !== 'whatsapp' && channel !== 'telegram') continue
    tasks.push({
      id: hashId([cron, channel, recipient, task]),
      cron,
      channel,
      recipient,
      task,
      nameAr: task.slice(0, 40),
    })
  }
  return tasks
}

export function loadHeartbeatFile(filePath?: string): HeartbeatTask[] {
  const p =
    filePath ||
    path.join(/* turbopackIgnore: true */ process.cwd(), 'HEARTBEAT.md')
  if (!fs.existsSync(/* turbopackIgnore: true */ p)) return []
  return parseHeartbeatMarkdown(
    fs.readFileSync(/* turbopackIgnore: true */ p, 'utf8')
  )
}

export function getDueHeartbeatTasks(
  now = new Date(),
  timezone = 'Asia/Riyadh',
  recentlyRanIds: Set<string> = new Set()
): HeartbeatTask[] {
  return loadHeartbeatFile().filter((t) => {
    if (recentlyRanIds.has(t.id)) return false
    if (IS_AIR_GAPPED_MODE && (t.channel === 'whatsapp' || t.channel === 'telegram')) {
      // still "due" but runner will fail with Arabic air-gap reason
    }
    try {
      const expr = CronExpressionParser.parse(t.cron, {
        currentDate: new Date(now.getTime() - 60_000),
        tz: timezone,
      })
      const next = expr.next().toDate()
      return next <= now
    } catch {
      return false
    }
  })
}
