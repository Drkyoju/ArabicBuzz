import { registerOTel } from '@vercel/otel'
import { applyLangfuseOtelEnv } from '@/lib/observability/langfuse'

export function register() {
  // Point OTEL_EXPORTER_OTLP_* at Langfuse when keys are present.
  applyLangfuseOtelEnv()

  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME || 'arabic-buzz',
  })
}
