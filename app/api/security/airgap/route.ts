import { NextResponse } from 'next/server'
import { IS_AIR_GAPPED_MODE } from '@/lib/security/airgap'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ airGapped: IS_AIR_GAPPED_MODE })
}
