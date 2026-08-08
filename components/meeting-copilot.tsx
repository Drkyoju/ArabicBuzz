'use client'

import { useState } from 'react'
import { FileText, Loader2, Send, HardDrive, MessagesSquare } from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { useCanvasStore } from '@/lib/canvas/store'
import { useModelPickerStore } from '@/lib/ai/model-picker-store'

/**
 * MVP Saudi Meeting Co-Pilot:
 * paste dialect-aware transcript → minutes → HITL before Drive/Telegram.
 * Also: generate minutes from recent room thread.
 */
export function MeetingCopilotPanel() {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const selectedModel = useModelPickerStore((s) => s.selectedModel)
  const upsertArtifact = useCanvasStore((s) => s.upsertArtifact)
  const [transcript, setTranscript] = useState('')
  const [minutes, setMinutes] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [err, setErr] = useState('')
  const [hitlPending, setHitlPending] = useState(false)

  async function generateFromRoom() {
    if (busy) return
    setBusy(true)
    setErr('')
    setStatus('جاري توليد محضر من نقاش الغرفة…')
    setMinutes('')
    setHitlPending(false)
    try {
      const res = await fetch('/api/rooms/minutes-from-thread', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ scopeId, saveDocx: true }),
      })
      const data = (await res.json()) as {
        error?: string
        messageAr?: string
        minutes?: string
        titleAr?: string
      }
      if (!res.ok) throw new Error(data.error || 'فشل توليد المحضر من الغرفة')
      const final = data.minutes || ''
      if (!final) throw new Error('لم يُرجع محضراً')
      setMinutes(final)
      setHitlPending(true)
      setStatus(data.messageAr || 'راجع المحضر ثم اعتمد قبل الإرسال')
      upsertArtifact({
        id: `minutes-room-${Date.now()}`,
        type: 'markdown',
        titleAr: data.titleAr || 'محضر من الغرفة (مسودة)',
        content: final,
        isEditing: false,
        updatedAt: new Date().toISOString(),
        updatedBy: 'meeting-copilot',
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل التوليد')
      setStatus('')
    } finally {
      setBusy(false)
    }
  }

  async function generate() {
    const text = transcript.trim()
    if (!text || busy) return
    setBusy(true)
    setErr('')
    setStatus('جاري توليد المحضر…')
    setMinutes('')
    setHitlPending(false)
    try {
      const prompt = [
        'أنت مساعد محاضر اجتماعات سعودي. حوّل النص التالي إلى محضر رسمي بالعربية الفصحى.',
        'أقسام إلزامية: الملخص التنفيذي · القرارات · المهام (المسؤول · الموعد) · البنود المفتوحة.',
        'لا تخترع حضوراً أو قرارات غير مذكورة. احترم اللهجة العامية في المصدر لكن أخرج فصحى.',
        '',
        '--- نص الاجتماع ---',
        text.slice(0, 12000),
      ].join('\n')

      const res = await fetch('/api/agent/orchestrate', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          prompt,
          scopeId,
          modelSlug: selectedModel,
        }),
      })
      if (!res.ok || !res.body) {
        throw new Error(`تعذّر التوليد (HTTP ${res.status})`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let final = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() || ''
        for (const chunk of chunks) {
          const line = chunk.trim()
          if (!line.startsWith('data:')) continue
          try {
            const ev = JSON.parse(line.slice(5).trim()) as {
              type?: string
              finalReplyAr?: string
              message?: string
            }
            if (ev.type === 'done' && ev.finalReplyAr) {
              final = ev.finalReplyAr
            }
            if (ev.type === 'error') {
              throw new Error(ev.message || 'خطأ من الوكيل')
            }
          } catch (e) {
            if (
              e instanceof Error &&
              e.message !== 'Unexpected end of JSON input'
            ) {
              if (
                e.message.includes('خطأ') ||
                e.message.includes('تعذّر')
              ) {
                throw e
              }
            }
          }
        }
      }
      if (!final) throw new Error('لم يُرجع الوكيل محضراً')
      setMinutes(final)
      setHitlPending(true)
      setStatus('راجع المحضر ثم اعتمد قبل الحفظ أو الإرسال')
      upsertArtifact({
        id: `minutes-${Date.now()}`,
        type: 'markdown',
        titleAr: 'محضر اجتماع (مسودة)',
        content: final,
        isEditing: false,
        updatedAt: new Date().toISOString(),
        updatedBy: 'meeting-copilot',
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل التوليد')
      setStatus('')
    } finally {
      setBusy(false)
    }
  }

  async function approveAndSave(target: 'drive' | 'telegram' | 'both') {
    if (!minutes.trim()) return
    setBusy(true)
    setErr('')
    setStatus('جاري الاعتماد والحفظ…')
    try {
      if (target === 'drive' || target === 'both') {
        const res = await fetch('/api/google/drive/artifact', {
          method: 'POST',
          headers: await authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            titleAr: 'محضر اجتماع',
            content: minutes,
            type: 'markdown',
          }),
        })
        const data = (await res.json()) as { error?: string; messageAr?: string }
        if (!res.ok) throw new Error(data.error || 'فشل الحفظ في Drive')
      }
      if (target === 'telegram' || target === 'both') {
        const res = await fetch('/api/rooms/outbound', {
          method: 'POST',
          headers: await authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            scopeId,
            channel: 'telegram',
            textAr: `📋 محضر اجتماع معتمد\n\n${minutes.slice(0, 3200)}`,
          }),
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string
          }
          if (target === 'telegram') {
            throw new Error(data.error || 'تعذّر الإرسال لتيليجرام')
          }
        }
      }
      setHitlPending(false)
      setStatus('تم الاعتماد — المحضر محفوظ/مُرسل')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل الاعتماد')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="rounded-xl border border-ab-border bg-ab-surface p-4"
      dir="rtl"
    >
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ab-ink">
        <FileText className="h-4 w-4 text-ab-accent" aria-hidden />
        مساعد الاجتماعات السعودي
      </h3>
      <p className="mb-3 text-[11px] text-stone-500">
        من نقاش الغرفة أو لصق نص → محضر فصحى → اعتماد قبل Drive وتيليجرام.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void generateFromRoom()}
          className="inline-flex items-center gap-1.5 rounded-md border border-ab-accent/40 bg-ab-accent/10 px-3 py-1.5 text-xs font-semibold text-ab-accent disabled:opacity-40"
        >
          {busy && !minutes ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MessagesSquare className="h-3.5 w-3.5" />
          )}
          محضر من نقاش الغرفة
        </button>
      </div>
      <textarea
        className="mb-2 min-h-[9rem] w-full rounded-lg border border-ab-border bg-white p-3 text-sm leading-relaxed"
        placeholder="أو الصق نص الاجتماع / الملاحظات هنا…"
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        disabled={busy}
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !transcript.trim()}
          onClick={() => void generate()}
          className="inline-flex items-center gap-1.5 rounded-md bg-ab-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          {busy && !minutes ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileText className="h-3.5 w-3.5" />
          )}
          توليد المحضر من النص
        </button>
      </div>
      {minutes && (
        <div className="mb-3 space-y-2">
          <label className="block text-[11px] font-medium text-stone-500">
            مسودة المحضر — راجع قبل الاعتماد
          </label>
          <textarea
            className="min-h-[12rem] w-full rounded-lg border border-ab-border bg-white p-3 text-sm leading-relaxed"
            value={minutes}
            onChange={(e) => {
              setMinutes(e.target.value)
              setHitlPending(true)
            }}
            disabled={busy}
          />
          {hitlPending && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void approveAndSave('drive')}
                className="inline-flex items-center gap-1 rounded-md bg-ab-ink px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
              >
                <HardDrive className="h-3.5 w-3.5" />
                اعتماد → Drive
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void approveAndSave('telegram')}
                className="inline-flex items-center gap-1 rounded-md border border-ab-border bg-white px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
                اعتماد → تيليجرام
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void approveAndSave('both')}
                className="inline-flex items-center gap-1 rounded-md border border-ab-border bg-white px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-40"
              >
                الاثنان
              </button>
            </div>
          )}
        </div>
      )}
      {status ? <p className="text-[11px] text-emerald-800">{status}</p> : null}
      {err ? <p className="text-[11px] text-rose-700">{err}</p> : null}
    </section>
  )
}
