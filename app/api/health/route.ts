/**
 * Health alias — same as liveness. Prefer /api/health/live for probes
 * and /api/health/ready before opening traffic.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(
    {
      ok: true,
      status: 'live',
      ts: new Date().toISOString(),
      probes: {
        live: '/api/health/live',
        ready: '/api/health/ready',
        free: '/api/health/free',
      },
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}
