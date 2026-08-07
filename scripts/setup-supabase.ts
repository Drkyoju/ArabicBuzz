/**
 * Wire Supabase env mirrors + apply SQL migrations against DATABASE_URL.
 *
 * Usage:
 *   npm run setup:supabase
 *   npm run setup:supabase -- --check   # env + reachability only
 *
 * Needs either:
 *   - Local Postgres / Supabase local DATABASE_URL, or
 *   - Cloud Supabase connection string as DATABASE_URL
 *     (Project Settings → Database → URI)
 *
 * Also fills NEXT_PUBLIC_SUPABASE_* from SUPABASE_* when public keys are empty.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { config } from 'dotenv'

config({ path: '.env' })
config({ path: '.env.local', override: true })

const ROOT = process.cwd()
const checkOnly = process.argv.includes('--check')

const MIGRATIONS = [
  'supabase/migrations/001_init_core.sql',
  'supabase/migrations/003_arabic_rag.sql',
  'supabase/migrations/004_rbac_rls.sql',
  'supabase/migrations/005_whatsapp_and_auth.sql',
  'supabase/migrations/006_rooms_realtime.sql',
  'supabase/migrations/007_company_brain.sql',
  'supabase/migrations/008_provider_api_keys.sql',
  'supabase/migrations/009_workspace_skills.sql',
  'supabase/migrations/010_room_members_invites.sql',
  'supabase/migrations/011_workspace_files.sql',
  'supabase/migrations/012_roles_canvas_audit.sql',
  'supabase/migrations/013_google_calendar.sql',
  'supabase/migrations/014_google_multi_accounts.sql',
  'supabase/migrations/015_user_agent_rosters.sql',
  'supabase/migrations/016_whatsapp_inbox.sql',
  'supabase/migrations/017_room_calendar.sql',
  'supabase/migrations/018_room_memory_tasks.sql',
  'supabase/migrations/019_room_home_history.sql',
  'supabase/migrations/020_mcp_connections.sql',
  'supabase/migrations/021_association_registry.sql',
  'supabase/migrations/022_knowledge_rls_versions.sql',
  'supabase/migrations/023_harden_open_rls.sql',
  'supabase/migrations/024_opus5_invites_audit_rls.sql',
  'supabase/migrations/025_deny_oauth_rosters_rls.sql',
  'supabase/migrations/026_team_collab.sql',
  'supabase/migrations/027_telegram_feed_idx.sql',
  'supabase/migrations/028_google_to_room_calendar_sync.sql',
  'supabase/migrations/029_assistant_jobs.sql',
  'supabase/migrations/030_imap_mailbox.sql',
  'supabase/migrations/031_imap_mail_intel.sql',
  'supabase/migrations/031_scope_agent_rosters.sql',
  'supabase/migrations/032_workspace_files_edited.sql',
]

function present(v?: string): boolean {
  return Boolean(v && v.trim())
}

function syncPublicEnvFile() {
  const envPath = path.join(ROOT, '.env.local')
  if (!existsSync(envPath)) {
    console.log('· skip env sync (.env.local missing)')
    return
  }

  let text = readFileSync(envPath, 'utf8')
  const url = process.env.SUPABASE_URL?.trim() || ''
  const anon = process.env.SUPABASE_ANON_KEY?.trim() || ''

  const ensureKey = (key: string, value: string) => {
    const re = new RegExp(`^${key}=.*$`, 'm')
    if (re.test(text)) {
      const current = text.match(re)?.[0]?.split('=').slice(1).join('=') ?? ''
      if (!current.trim() && value) {
        text = text.replace(re, `${key}=${value}`)
        return 'filled'
      }
      return 'kept'
    }
    text = `${text.trimEnd()}\n${key}=${value}\n`
    return 'added'
  }

  const actions = [
    ensureKey('NEXT_PUBLIC_SUPABASE_URL', url),
    ensureKey('NEXT_PUBLIC_SUPABASE_ANON_KEY', anon),
    ensureKey('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''),
  ]

  writeFileSync(envPath, text.endsWith('\n') ? text : `${text}\n`)
  console.log(`· .env.local mirrors: ${actions.join(', ')}`)

  if (url && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = url
  }
  if (anon && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anon
  }
}

function printAuthChecklist() {
  const appUrl = 'https://arabicbuzz-fooc9h.cranl.net'

  console.log(`
Auth (Google + Apple) — Supabase Dashboard
1. Authentication → Providers → enable Google and Apple (add client IDs/secrets).
2. Authentication → URL Configuration:
   - Site URL: ${appUrl}
   - Redirect URLs: ${appUrl}/auth/callback
3. CranL / .env.local must include:
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_URL
   SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY   (server webhooks / HITL only)
`)
}

function printMissingCredentials() {
  console.error(`
Missing Supabase credentials / database.

Do this once in https://supabase.com/dashboard :
  1. Create project "ArabicBuzz" (region close to users, e.g. me-central / eu-central).
  2. Project Settings → API:
       copy Project URL  → SUPABASE_URL + NEXT_PUBLIC_SUPABASE_URL
       copy anon public  → SUPABASE_ANON_KEY + NEXT_PUBLIC_SUPABASE_ANON_KEY
       copy service_role → SUPABASE_SERVICE_ROLE_KEY
  3. Project Settings → Database → Connection string (URI):
       paste as DATABASE_URL (use the pooler URI or direct; enable pgvector if prompted)

Then re-run:  npm run setup:supabase

Local alternative (Docker / OrbStack running):
  npx supabase start
  # then copy printed API URL + anon key into .env.local
  npx supabase db reset   # applies supabase/migrations/*
`)
}

async function pingDatabase(): Promise<boolean> {
  const url = process.env.DATABASE_URL
  if (!present(url)) return false
  try {
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
    await prisma.$queryRaw`SELECT 1`
    await prisma.$disconnect()
    return true
  } catch (e) {
    console.error(
      '· DATABASE_URL unreachable:',
      e instanceof Error ? e.message : e
    )
    return false
  }
}

function applyMigration(file: string): boolean {
  const abs = path.join(ROOT, file)
  if (!existsSync(abs)) {
    console.error(`· missing ${file}`)
    return false
  }
  console.log(`· applying ${file}`)
  const r = spawnSync(
    'npx',
    ['prisma', 'db', 'execute', '--file', abs, '--schema', 'prisma/schema.prisma'],
    { cwd: ROOT, encoding: 'utf8', env: process.env }
  )
  const out = `${r.stdout || ''}\n${r.stderr || ''}`.trim()
  if (out) console.log(out)
  if (r.status !== 0) {
    const soft =
      /already exists|duplicate|does not exist/i.test(out) ||
      /ERROR:\s+type .* already exists/i.test(out)
    if (soft) {
      console.log('  · skipped (already applied / idempotent conflict)')
      return true
    }
    console.error(out || 'prisma db execute failed')
    return false
  }
  return true
}

async function main() {
  console.log('Arabic Buzz — Supabase setup\n')
  syncPublicEnvFile()

  const hasApi =
    present(process.env.SUPABASE_URL) ||
    present(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const hasAnon =
    present(process.env.SUPABASE_ANON_KEY) ||
    present(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const hasDb = present(process.env.DATABASE_URL)

  console.log(
    `· SUPABASE URL: ${hasApi ? 'set' : 'missing'} | anon: ${hasAnon ? 'set' : 'missing'} | DATABASE_URL: ${hasDb ? 'set' : 'missing'}`
  )

  if (!hasDb) {
    printMissingCredentials()
    printAuthChecklist()
    process.exit(1)
  }

  const reachable = await pingDatabase()
  if (!reachable) {
    printMissingCredentials()
    printAuthChecklist()
    process.exit(1)
  }
  console.log('· database reachable')

  if (checkOnly) {
    printAuthChecklist()
    console.log('Check OK (--check). Skipping migration apply.')
    return
  }

  for (const file of MIGRATIONS) {
    if (!applyMigration(file)) {
      console.error(`\nStopped on ${file}. Fix SQL / DB state, then re-run.`)
      process.exit(1)
    }
  }

  if (!hasApi || !hasAnon) {
    console.log(
      '\nSchema applied, but API keys are still empty — paste Project URL + anon key into .env.local for Auth / client.'
    )
  } else {
    console.log('\nSchema applied. API keys present.')
  }
  printAuthChecklist()
  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
