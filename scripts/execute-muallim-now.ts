/**
 * Emergency: catch latest معلم أول PDF from Telegram / vault, duplicate p48 after p45, sendDocument.
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })
config({ path: '.env' })

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { duplicatePdfPageAfter } from '@/lib/documents/pdf'
import {
  listWorkspaceFiles,
  readWorkspaceFile,
  saveWorkspaceFile,
} from '@/lib/documents/workspace'
import { matchMuallimSeerahFile } from '@/lib/files/muallim-seerah-match'

function sb() {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_KEY?.trim()
  if (!url || !key) throw new Error('Supabase admin missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function ensureMigration() {
  // Best-effort via supabase REST — tables may already exist from memory store.
  console.log('skip SQL apply via REST; tables used if present')
}

async function downloadTgFile(fileId: string): Promise<Buffer> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing')
  const meta = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`
  ).then((r) => r.json())
  if (!meta.ok || !meta.result?.file_path) {
    throw new Error(
      `getFile failed: ${JSON.stringify(meta).slice(0, 300)}`
    )
  }
  const path = meta.result.file_path as string
  const res = await fetch(
    `https://api.telegram.org/file/bot${token}/${path}`
  )
  if (!res.ok) throw new Error(`download HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function sendDoc(opts: {
  chatId: string
  buffer: Buffer
  filename: string
  caption: string
}) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing')
  const form = new FormData()
  form.append('chat_id', opts.chatId)
  form.append('caption', opts.caption.slice(0, 1000))
  form.append(
    'document',
    new Blob([new Uint8Array(opts.buffer)], { type: 'application/pdf' }),
    opts.filename
  )
  const res = await fetch(
    `https://api.telegram.org/bot${token}/sendDocument`,
    { method: 'POST', body: form }
  )
  const body = await res.text()
  if (!res.ok) throw new Error(`sendDocument ${res.status}: ${body.slice(0, 400)}`)
  return JSON.parse(body)
}

async function main() {
  await ensureMigration()
  const client = sb()
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('no bot token')

  const { data: bindings } = await client
    .from('channel_bindings')
    .select('external_id, scope_id')
    .eq('channel', 'telegram')
    .not('external_id', 'like', 'u:%')
    .order('created_at', { ascending: false })
    .limit(30)

  console.log('bindings', bindings)

  const { data: jobs } = await client
    .from('telegram_file_jobs')
    .select('*')
    .or(
      `id.eq.96dee180-e828-49db-a2df-0d3a411e90a6,expected_filename.ilike.%معلم%,request_text.ilike.%48%`
    )
    .order('created_at', { ascending: false })
    .limit(10)

  console.log(
    'jobs',
    (jobs || []).map((j) => ({
      id: j.id,
      status: j.status,
      name: j.expected_filename,
      chat: j.chat_id,
      vault: j.vault_file_id,
      tg: j.telegram_file_id,
    }))
  )

  const { data: atts } = await client
    .from('telegram_attachments')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  console.log(
    'atts',
    (atts || []).map((a) => ({
      name: a.file_name,
      has: a.has_bytes,
      vault: a.vault_file_id,
      tg: a.telegram_file_id,
      chat: a.chat_id,
      at: a.created_at,
      size: a.size_bytes,
    }))
  )

  // Prefer freshest attachment matching معلم (not أحياء)
  const candidates = [
    ...(atts || []).map((a) => ({
      source: 'att' as const,
      name: String(a.file_name || ''),
      chatId: String(a.chat_id || ''),
      scopeId: String(a.scope_id || 'shared-demo'),
      vaultFileId: a.vault_file_id ? String(a.vault_file_id) : undefined,
      telegramFileId: a.telegram_file_id
        ? String(a.telegram_file_id)
        : undefined,
      hasBytes: Boolean(a.has_bytes),
      at: String(a.created_at || ''),
    })),
  ].filter((c) => matchMuallimSeerahFile(c.name))

  console.log('muallim candidates', candidates.slice(0, 5))

  let chatId =
    candidates[0]?.chatId ||
    jobs?.[0]?.chat_id ||
    bindings?.find((b) => String(b.external_id).startsWith('-'))?.external_id ||
    ''
  let scopeId =
    candidates[0]?.scopeId ||
    jobs?.[0]?.scope_id ||
    bindings?.[0]?.scope_id ||
    process.env.TELEGRAM_DEFAULT_SCOPE_ID?.trim() ||
    'shared-demo'

  // Also scan workspace
  const files = await listWorkspaceFiles(scopeId)
  const roomHit = files.find((f) => matchMuallimSeerahFile(f.originalName))
  console.log(
    'room hits',
    files
      .filter((f) => /معلم|سيرة|معالم|أحياء/i.test(f.originalName))
      .map((f) => f.originalName)
  )

  let buffer: Buffer | null = null
  let sourceName = ''

  // 1) vault bytes from attachment
  for (const c of candidates) {
    if (c.vaultFileId && c.hasBytes) {
      try {
        const hit = await readWorkspaceFile(c.scopeId, c.vaultFileId)
        if (hit.buffer.length > 1000) {
          buffer = hit.buffer
          sourceName = hit.meta.originalName
          chatId = c.chatId || chatId
          scopeId = c.scopeId
          console.log('using vault att', sourceName, hit.buffer.length)
          break
        }
      } catch (e) {
        console.warn('vault read fail', e)
      }
    }
  }

  // 2) room exact/alias
  if (!buffer && roomHit) {
    const hit = await readWorkspaceFile(scopeId, roomHit.id)
    buffer = hit.buffer
    sourceName = hit.meta.originalName
    console.log('using room', sourceName, buffer.length)
  }

  // 3) re-download telegram_file_id
  if (!buffer) {
    for (const c of candidates) {
      if (!c.telegramFileId) continue
      try {
        buffer = await downloadTgFile(c.telegramFileId)
        sourceName = c.name || 'المعلم-الاول.pdf'
        chatId = c.chatId || chatId
        console.log('downloaded tg', sourceName, buffer.length)
        // persist to vault
        const saved = await saveWorkspaceFile({
          scopeId,
          buffer,
          originalName: sourceName.endsWith('.pdf')
            ? sourceName
            : `${sourceName}.pdf`,
          mimeType: 'application/pdf',
        })
        console.log('saved vault', saved.file.id)
        break
      } catch (e) {
        console.warn('tg download fail', c.telegramFileId, e)
      }
    }
  }

  // 4) getUpdates fallback (if webhook dropped) — usually empty with webhook
  if (!buffer) {
    console.log('trying getUpdates (may be empty with webhook)')
    const upd = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?limit=50`
    ).then((r) => r.json())
    const docs: Array<{
      file_id: string
      file_name?: string
      chat_id: number
    }> = []
    for (const u of upd.result || []) {
      const msg = u.message || u.channel_post
      if (!msg?.document) continue
      const name = msg.document.file_name || ''
      if (!matchMuallimSeerahFile(name) && !/معلم|سيرة|معالم/i.test(name)) {
        continue
      }
      if (/أحياء|احياء|biology/i.test(name)) continue
      docs.push({
        file_id: msg.document.file_id,
        file_name: name,
        chat_id: msg.chat.id,
      })
    }
    console.log('updates docs', docs)
    const last = docs[docs.length - 1]
    if (last) {
      buffer = await downloadTgFile(last.file_id)
      sourceName = last.file_name || 'المعلم-الاول.pdf'
      chatId = String(last.chat_id)
      const saved = await saveWorkspaceFile({
        scopeId,
        buffer,
        originalName: sourceName,
        mimeType: 'application/pdf',
      })
      console.log('saved from updates', saved.file.id)
    }
  }

  if (!buffer || !chatId) {
    console.error(
      'BLOCKED: no PDF bytes and/or chatId. buffer=',
      Boolean(buffer),
      'chatId=',
      chatId
    )
    process.exit(2)
  }

  console.log('duplicating…', sourceName, '→ chat', chatId)
  const out = await duplicatePdfPageAfter({
    pdf: buffer,
    copyPage: 48,
    afterPage: 45,
  })
  const outName =
    (sourceName || 'المعلم-الاول').replace(/\.pdf$/i, '') +
    '_نسخ_صفحة48_بعد_45.pdf'
  const saved = await saveWorkspaceFile({
    scopeId,
    buffer: out.buffer,
    originalName: outName,
    mimeType: 'application/pdf',
    markEdited: true,
  })
  console.log(
    'result',
    saved.file.id,
    `${out.pageCountBefore}→${out.pageCountAfter}`,
    out.buffer.length
  )

  await sendDoc({
    chatId,
    buffer: out.buffer,
    filename: outName,
    caption: `تم: نسخت الصفحة 48 بالكامل وأدرجتها بعد الصفحة 45 في «${sourceName}». الصفحات: ${out.pageCountBefore} → ${out.pageCountAfter}.`,
  })
  console.log('sendDocument OK')

  // Update pending job
  await client
    .from('telegram_file_jobs')
    .update({
      status: 'done',
      vault_file_id: saved.file.id,
      result_vault_file_id: saved.file.id,
      result_name: outName,
      expected_filename:
        sourceName || 'المعلم الأول من معالم من السيرة النبوية.pdf',
      work_params: { copyPage: 48, afterPage: 45 },
      updated_at: new Date().toISOString(),
    })
    .eq('id', '96dee180-e828-49db-a2df-0d3a411e90a6')

  console.log('job 96dee180 marked done (if existed)')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
