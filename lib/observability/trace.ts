import { trace, SpanStatusCode } from '@opentelemetry/api'

const tracer = trace.getTracer('arabic-buzz')

export async function withSpan<T>(
  name: string,
  attrs: Record<string, string | number | boolean | undefined>,
  fn: () => Promise<T>
) {
  return tracer.startActiveSpan(name, async (span) => {
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== undefined) span.setAttribute(k, v)
    }
    try {
      const out = await fn()
      span.setStatus({ code: SpanStatusCode.OK })
      return out
    } catch (e) {
      span.recordException(e as Error)
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: e instanceof Error ? e.message : 'error',
      })
      throw e
    } finally {
      span.end()
    }
  })
}

