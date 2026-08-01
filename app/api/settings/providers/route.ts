import { NextRequest, NextResponse } from 'next/server'
import { IS_AIR_GAPPED_MODE } from '@/lib/security/airgap'
import { findProviderDef } from '@/lib/ai/provider-defs'
import {
  deleteProviderKey,
  setProviderKey,
} from '@/lib/ai/provider-key-store'
import {
  clearProviderProbeCache,
  getProvidersSnapshot,
  validateProviderKey,
} from '@/lib/ai/provider-availability'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const fresh = req.nextUrl.searchParams.get('fresh') === '1'
  const snap = await getProvidersSnapshot(IS_AIR_GAPPED_MODE, { fresh })
  return NextResponse.json(snap)
}

export async function PUT(req: NextRequest) {
  let body: { envName?: string; apiKey?: string; skipValidate?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'جسم الطلب غير صالح' }, { status: 400 })
  }

  const envName = body.envName?.trim()
  const apiKey = body.apiKey ?? ''
  if (!envName || !findProviderDef(envName)) {
    return NextResponse.json({ error: 'مزوّد غير معروف' }, { status: 400 })
  }

  if (!body.skipValidate) {
    const check = await validateProviderKey(envName, apiKey)
    if (!check.ok) {
      return NextResponse.json(
        { error: `فشل التحقق: ${check.detail}`, detail: check.detail },
        { status: 400 }
      )
    }
  }

  try {
    await setProviderKey(envName, apiKey)
    clearProviderProbeCache(envName)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'تعذر الحفظ' },
      { status: 500 }
    )
  }

  const snap = await getProvidersSnapshot(IS_AIR_GAPPED_MODE, { fresh: true })
  return NextResponse.json({
    ok: true,
    message: 'تم حفظ المفتاح والتحقق منه',
    ...snap,
  })
}

export async function DELETE(req: NextRequest) {
  const envName =
    req.nextUrl.searchParams.get('envName')?.trim() ||
    ((await req.json().catch(() => ({}))) as { envName?: string }).envName?.trim()

  if (!envName || !findProviderDef(envName)) {
    return NextResponse.json({ error: 'مزوّد غير معروف' }, { status: 400 })
  }

  await deleteProviderKey(envName)
  clearProviderProbeCache(envName)
  const snap = await getProvidersSnapshot(IS_AIR_GAPPED_MODE, { fresh: true })
  return NextResponse.json({
    ok: true,
    message: 'حُذف المفتاح المحفوظ — سيعتمد على متغيرات البيئة إن وُجدت',
    ...snap,
  })
}
