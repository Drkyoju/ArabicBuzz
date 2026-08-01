import { generateText } from 'ai'
import { getHarnessModel } from '@/lib/ai/router'
import { getToolExecutor } from '@/lib/agents/tools'
import { interceptToolExecution } from '@/lib/agents/interceptor'

export interface SubagentTask {
  id: string
  roleNameAr: string
  systemPrompt: string
  userQuery: string
  assignedModel: string
  toolsAllowed: string[]
}

export interface SubagentResult {
  taskId: string
  status: 'SUCCESS' | 'FAILED'
  output: string
  executionTimeMs: number
}

export async function executeSubagentTask(
  task: SubagentTask,
  opts?: {
    scopeId?: string
    onProgress?: (status: 'running' | 'done' | 'error') => void
  }
): Promise<SubagentResult> {
  const started = Date.now()
  opts?.onProgress?.('running')
  try {
    for (const toolName of task.toolsAllowed.slice(0, 2)) {
      await interceptToolExecution({
        toolName,
        params: { query: task.userQuery },
        mode: 'AUTO',
        requesterId: 'subagent',
        scopeId: opts?.scopeId,
        execute: getToolExecutor(toolName),
      })
    }
    const { text } = await generateText({
      model: getHarnessModel(task.assignedModel),
      system: task.systemPrompt,
      prompt: task.userQuery,
    })
    opts?.onProgress?.('done')
    return {
      taskId: task.id,
      status: 'SUCCESS',
      output: text,
      executionTimeMs: Date.now() - started,
    }
  } catch (e) {
    opts?.onProgress?.('error')
    return {
      taskId: task.id,
      status: 'FAILED',
      output: e instanceof Error ? e.message : String(e),
      executionTimeMs: Date.now() - started,
    }
  }
}
