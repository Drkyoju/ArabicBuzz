export const dynamic = 'force-dynamic'

/**
 * Fast liveness — process is up. No DB/network.
 * Use for Docker/CranL HEALTHCHECK and frequent probes.
 */
export async function GET() {
  return Response.json(
    {
      ok: true,
      status: 'live',
      ts: new Date().toISOString(),
    },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    }
  )
}
