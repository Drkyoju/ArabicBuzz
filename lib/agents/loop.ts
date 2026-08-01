type ResumeHandle = {
  threadId: string
  messages: Array<{ role: string; content: string }>
  paused?: boolean
}

const handles = new Map<string, ResumeHandle>()

export function markThreadPaused(threadId: string, messages: ResumeHandle['messages']) {
  handles.set(threadId, { threadId, messages, paused: true })
}

export function resumeAgentAfterApproval(opts: {
  threadId?: string
  approvalId: string
  toolOutput?: unknown
  rejectionMessage?: string
}): { resumed: boolean } {
  if (!opts.threadId) return { resumed: false }
  const h = handles.get(opts.threadId)
  if (!h) return { resumed: false }
  if (opts.rejectionMessage) {
    h.messages.push({ role: 'user', content: opts.rejectionMessage })
  } else {
    h.messages.push({
      role: 'tool',
      content: JSON.stringify(opts.toolOutput ?? null),
    })
  }
  h.paused = false
  return { resumed: true }
}

export function getThreadHandle(threadId: string) {
  return handles.get(threadId)
}
