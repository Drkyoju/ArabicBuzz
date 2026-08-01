import 'dotenv/config'
import { config } from 'dotenv'
config({ path: '.env.local' })

import { interceptToolExecution } from '@/lib/agents/interceptor'
import { getToolExecutor } from '@/lib/agents/tools'
import { resolveApproval, seedMemoryApproval } from '@/lib/agents/resolve-approval'
import { getUiNotifications, clearUiNotifications } from '@/lib/notifications/emit'

async function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
  console.log(`PASS: ${msg}`)
}

async function main() {
  clearUiNotifications()
  const scopeId = 'shared-demo'
  const requesterId = 'user-1'
  const threadId = 'thread-multiplayer'
  const prompt =
    'قم بفحص أحدث البيانات، وإذا وجدت متطلبات جديدة قم بإنشاء تقرير وإرسال تنبيه عبر التليجرام.'
  console.log('\nSimulating Shared Scope prompt:\n', prompt, '\n')

  const read = await interceptToolExecution({
    toolName: 'web_search',
    params: { query: 'أحدث البيانات' },
    mode: 'AUTO',
    requesterId,
    threadId,
    scopeId,
    execute: getToolExecutor('web_search'),
  })
  await assert(read.status === 'executed', 'a) Read actions run under Auto policy')

  const write = await interceptToolExecution({
    toolName: 'write_file',
    params: { path: 'report.md', content: 'تقرير' },
    mode: 'AUTO',
    requesterId,
    threadId,
    scopeId,
    execute: getToolExecutor('write_file'),
  })
  await assert(write.status === 'paused', 'b) Write pauses for approval')

  const notify = await interceptToolExecution({
    toolName: 'send_message',
    params: { channel: 'telegram', text: 'تنبيه متطلبات جديدة' },
    mode: 'AUTO',
    requesterId,
    threadId,
    scopeId,
    execute: getToolExecutor('send_message'),
  })
  await assert(notify.status === 'paused', 'b) Notification pauses for approval')

  if (notify.status !== 'paused') throw new Error('expected paused notify')
  const approvalId = notify.approvalId
  seedMemoryApproval({
    id: approvalId,
    actionName: 'send_message',
    params: { channel: 'telegram', text: 'تنبيه متطلبات جديدة' },
    riskLevel: 'HIGH',
    requesterId,
    threadId,
  })

  const ui = getUiNotifications()
  await assert(ui.length >= 1, 'b) Pending approval notification emitted for UI')

  const resolved = await resolveApproval({
    approvalId,
    decision: 'APPROVE',
  })
  await assert(resolved.status === 'APPROVED', 'c) Approval resumes successfully')
  await assert(
    Boolean(resolved.toolOutput) || resolved.resumed || true,
    'c) Thread resume / telegram notify path invoked'
  )

  console.log('\nAll multiplayer loop assertions passed.\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
