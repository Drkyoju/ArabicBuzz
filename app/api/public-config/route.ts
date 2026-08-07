import { NextResponse } from 'next/server'
import { readServerPublicConfig } from '@/lib/public-runtime-config'
import { APP_ORIGIN } from '@/lib/app-url'

export const dynamic = 'force-dynamic'

/** Non-secret client bootstrap (Supabase anon is public by design). */
export async function GET() {
  const cfg = readServerPublicConfig()
  return NextResponse.json({
    supabaseUrl: cfg.supabaseUrl || null,
    supabaseAnonKey: cfg.supabaseAnonKey || null,
    appUrl: cfg.appUrl || APP_ORIGIN,
    supabaseConfigured: Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey),
  })
}
