/**
 * Langfuse via OpenTelemetry OTLP/HTTP.
 *
 * When LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY are set, we point
 * OTEL_EXPORTER_OTLP_* at Langfuse `/api/public/otel` (unless already set).
 * Call `forceFlushOtel()` from serverless `after()` so Netlify does not drop spans.
 */

import { trace } from '@opentelemetry/api'

export type LangfuseOtelConfig = {
  configured: boolean
  endpoint?: string
  host?: string
}

function langfuseHost(): string {
  return (
    process.env.LANGFUSE_HOST?.trim() ||
    process.env.LANGFUSE_BASE_URL?.trim() ||
    'https://cloud.langfuse.com'
  ).replace(/\/$/, '')
}

export function isLangfuseConfigured(): boolean {
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY?.trim() &&
      process.env.LANGFUSE_SECRET_KEY?.trim()
  )
}

/**
 * Apply Langfuse OTLP env defaults before `@vercel/otel` registerOTel().
 * Safe to call multiple times; never overwrites an explicit OTEL endpoint.
 */
export function applyLangfuseOtelEnv(): LangfuseOtelConfig {
  if (!isLangfuseConfigured()) {
    return {
      configured: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()),
      endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() || undefined,
    }
  }

  const host = langfuseHost()
  const endpoint = `${host}/api/public/otel`

  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()) {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = endpoint
  }
  if (!process.env.OTEL_EXPORTER_OTLP_PROTOCOL?.trim()) {
    process.env.OTEL_EXPORTER_OTLP_PROTOCOL = 'http/json'
  }
  if (!process.env.OTEL_EXPORTER_OTLP_HEADERS?.trim()) {
    const pub = process.env.LANGFUSE_PUBLIC_KEY!.trim()
    const sec = process.env.LANGFUSE_SECRET_KEY!.trim()
    const auth = Buffer.from(`${pub}:${sec}`).toString('base64')
    process.env.OTEL_EXPORTER_OTLP_HEADERS = [
      `Authorization=Basic ${auth}`,
      'x-langfuse-ingestion-version=4',
    ].join(',')
  }

  return {
    configured: true,
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    host,
  }
}

type FlushableProvider = {
  forceFlush?: () => Promise<void>
  flush?: () => Promise<void>
}

/**
 * Flush pending OTel spans (critical on Netlify/serverless).
 * No-op when the active tracer provider does not expose forceFlush.
 */
export async function forceFlushOtel(): Promise<void> {
  try {
    const provider = trace.getTracerProvider() as FlushableProvider
    if (typeof provider.forceFlush === 'function') {
      await provider.forceFlush()
      return
    }
    if (typeof provider.flush === 'function') {
      await provider.flush()
    }
  } catch (e) {
    console.warn(
      '[otel] forceFlush failed',
      e instanceof Error ? e.message : e
    )
  }
}

/** Schedule flush after the response (Next.js `after`). */
export function scheduleOtelFlush(): void {
  void import('next/server')
    .then(({ after }) => {
      after(async () => {
        await forceFlushOtel()
      })
    })
    .catch(() => {
      // Fallback: best-effort flush without after()
      void forceFlushOtel()
    })
}
