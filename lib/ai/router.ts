import { IS_AIR_GAPPED_MODE } from '@/lib/security/airgap'
import { getModel } from '@/lib/ai/providers'
import {
  HarnessModelSlug,
  HARNESS_MODEL_CATALOG,
  HARNESS_MODEL_SLUGS,
  listAvailableHarnessModels,
} from '@/lib/ai/harness-catalog'

export type { HarnessModelSlug, HarnessModelMeta } from '@/lib/ai/harness-catalog'
export {
  HARNESS_MODEL_CATALOG,
  HARNESS_MODEL_SLUGS,
  listAvailableHarnessModels,
}

export class HarnessModelError extends Error {
  constructor(slug: string) {
    super(
      `Unknown harness model slug: ${slug}. Supported: ${HARNESS_MODEL_SLUGS.join(', ')}`
    )
    this.name = 'HarnessModelError'
  }
}

/** Resolves harness catalog slugs via the unified multi-model gateway. */
export function getHarnessModel(modelSlug: string) {
  try {
    if (IS_AIR_GAPPED_MODE && modelSlug !== 'ollama-local' && modelSlug !== 'deepseek-r1') {
      return getModel('ollama-local')
    }
    return getModel(modelSlug)
  } catch {
    throw new HarnessModelError(modelSlug)
  }
}

export function assertKnownHarnessSlug(slug: string): slug is HarnessModelSlug {
  return HARNESS_MODEL_CATALOG.some((m) => m.slug === slug)
}
