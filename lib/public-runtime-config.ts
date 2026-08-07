/**
 * Public (non-secret) config for the browser.
 * CranL Docker builds often lack NEXT_PUBLIC_* at `next build`, so values are
 * injected at request time (layout script + /api/public-config) from server env.
 */

export type AbPublicConfig = {
  supabaseUrl: string
  supabaseAnonKey: string
  appUrl: string
}

declare global {
  interface Window {
    __AB_PUBLIC__?: AbPublicConfig
  }
}

export function readServerPublicConfig(): AbPublicConfig {
  return {
    supabaseUrl: (
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      ''
    ).trim(),
    supabaseAnonKey: (
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      ''
    ).trim(),
    appUrl: (
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      ''
    )
      .trim()
      .replace(/\/$/, ''),
  }
}

export function readBrowserPublicConfig(): AbPublicConfig | null {
  if (typeof window === 'undefined') return null
  const cfg = window.__AB_PUBLIC__
  if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey) return null
  return cfg
}

export function applyBrowserPublicConfig(cfg: AbPublicConfig) {
  if (typeof window === 'undefined') return
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return
  window.__AB_PUBLIC__ = cfg
}
