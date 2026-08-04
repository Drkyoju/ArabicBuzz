import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import { getHarnessModel } from '@/lib/ai/router'
import {
  executeSubagentTask,
  SubagentResult,
  SubagentTask,
} from '@/lib/agents/subagent'
import { listBoundEngineTools } from '@/lib/agents/engine'
import {
  calculatePromptHash,
  classifySDAIARisk,
  resolveDataLocality,
} from '@/lib/audit/provenance'
import { logSDAIAEvent } from '@/lib/audit/logger'

export type OrchestratorSseEvent =
  | { type: 'plan'; tasks: SubagentTask[] }
  | { type: 'subagent_start'; taskId: string; roleNameAr: string }
  | { type: 'subagent_done'; taskId: string; roleNameAr: string }
  | { type: 'subagent_error'; taskId: string; roleNameAr: string }
  | { type: 'final'; text: string }

const planSchema = z.object({
  tasks: z
    .array(
      z.object({
        id: z.string(),
        roleNameAr: z.string(),
        systemPrompt: z.string(),
        userQuery: z.string(),
        assignedModel: z.string(),
        toolsAllowed: z.array(z.string()),
      })
    )
    .min(2)
    .max(4),
})

export async function orchestrateParallelWorkflow(
  userPrompt: string,
  scopeId: string,
  opts?: {
    onEvent?: (event: OrchestratorSseEvent) => void
    modelSlug?: string
  }
): Promise<{
  finalReplyAr: string
  results: SubagentResult[]
  plan: SubagentTask[]
}> {
  const leadModel = opts?.modelSlug || 'gemini-3.1-pro'

  const bound = await listBoundEngineTools({ includeMcpTools: true })
  const toolCatalogHint = bound.all.slice(0, 40).join(', ')

  let plan: SubagentTask[]
  try {
    const { object } = await generateObject({
      model: getHarnessModel(leadModel),
      schema: planSchema,
      system: `قسّم المهمة إلى 2-4 وكلاء فرعيين مستقلين بأسماء أدوار عربية وأدوات مناسبة.\nالأدوات المتاحة (محلية + MCP): ${toolCatalogHint || 'web_search, memory_search'}`,
      prompt: userPrompt,
    })
    plan = object.tasks
  } catch {
    plan = [
      {
        id: 'research',
        roleNameAr: 'وكيل البحث والتدقيق',
        systemPrompt: 'ابحث ولخّص المعلومات ذات الصلة.',
        userQuery: userPrompt,
        assignedModel: leadModel,
        toolsAllowed: ['web_search', 'memory_search'],
      },
      {
        id: 'docs',
        roleNameAr: 'وكيل تحليل المستندات',
        systemPrompt: 'حلل السياق وأنتج نقاطاً تنفيذية.',
        userQuery: userPrompt,
        assignedModel: leadModel,
        toolsAllowed: ['read_file', 'list_files'],
      },
    ]
  }

  opts?.onEvent?.({ type: 'plan', tasks: plan })

  const settled = await Promise.allSettled(
    plan.map(async (task) => {
      opts?.onEvent?.({
        type: 'subagent_start',
        taskId: task.id,
        roleNameAr: task.roleNameAr,
      })
      const result = await executeSubagentTask(task, { scopeId })
      opts?.onEvent?.({
        type: result.status === 'SUCCESS' ? 'subagent_done' : 'subagent_error',
        taskId: task.id,
        roleNameAr: task.roleNameAr,
      })
      return result
    })
  )

  const results = settled.map((s, i) =>
    s.status === 'fulfilled'
      ? s.value
      : {
          taskId: plan[i].id,
          status: 'FAILED' as const,
          output: 'failed',
          executionTimeMs: 0,
        }
  )

  const mergePrompt = results
    .map((r) => `### ${r.taskId} (${r.status})\n${r.output}`)
    .join('\n\n')

  const { text } = await generateText({
    model: getHarnessModel(leadModel),
    system:
      'دمج مخرجات الوكلاء في رد عربي فصحى مهني موحد للمستخدم النهائي.',
    prompt: `الطلب الأصلي:\n${userPrompt}\n\nالمخرجات:\n${mergePrompt}`,
  })

  await logSDAIAEvent({
    scopeId,
    userId: 'orchestrator',
    modelUsed: leadModel,
    promptHash: calculatePromptHash(userPrompt),
    responseHash: calculatePromptHash(text),
    riskTier: classifySDAIARisk('text_generate', []),
    dataLocality: resolveDataLocality(leadModel),
  })

  opts?.onEvent?.({ type: 'final', text })
  return { finalReplyAr: text, results, plan }
}
