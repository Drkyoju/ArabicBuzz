'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Brain,
  Download,
  Eye,
  FileText,
  FileType2,
  MessageSquare,
  Mic,
  Pencil,
  RefreshCw,
  Replace,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { LocalUploadPanel } from '@/components/local-upload-panel'
import { BrainPrivacyNote } from '@/components/brain-privacy-note'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { openFilePreviewInChat } from '@/lib/files/preview-store'
import { parseFileMarkersFromText } from '@/lib/files/file-markers'
import { isFileEdited, looksLikeEditedBackfill } from '@/lib/files/edited-status'
import { FileEditedBadge } from '@/components/file-edited-badge'

type ListedFile = {
  id?: string
  originalName?: string
  name?: string
  relativePath?: string
  mimeType?: string
  size?: number
  sizeBytes?: number
  createdAt?: string
  editedAt?: string
  editedBy?: string
  tags?: string[]
}

function fmtSize(n?: number) {
  if (!n || n <= 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function FilesPanel() {
  const scopeId = useWorkspaceStore((s) => s.activeScopeId)
  const scopes = useWorkspaceStore((s) => s.scopes)
  const scope = scopes.find((s) => s.id === scopeId)
  const signedIn = useSignedIn()
  const authPending = signedIn === null
  const isGuest = signedIn === false
  const [files, setFiles] = useState<ListedFile[]>([])
  const [source, setSource] = useState<string>('none')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [postByFileId, setPostByFileId] = useState<Record<string, string>>({})
  const replaceRef = useRef<HTMLInputElement>(null)
  const replaceTargetId = useRef<string | null>(null)
  const postsByScope = useWorkspaceStore((s) => s.postsByScope)

  const [backingUp, setBackingUp] = useState(false)
  const [syncNote, setSyncNote] = useState('')

  const load = useCallback(async () => {
    if (signedIn !== true) {
      setFiles([])
      setSource('none')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `/api/storage/upload?scopeId=${encodeURIComponent(scopeId)}&sync=1`,
        { headers: await authHeaders() }
      )
      const data = (await res.json()) as {
        files?: ListedFile[]
        source?: string
        error?: string
        noteAr?: string
        fromChat?: number
      }
      setFiles(data.files || [])
      setSource(data.source || 'none')
      setSyncNote(
        data.noteAr ||
          (data.fromChat
            ? `زُامن ${data.fromChat} مرفقاً من الشات.`
            : '')
      )
      if (data.error) {
        const raw = data.error
        setError(
          /ENOENT|EACCES|EROFS|mkdir/i.test(raw)
            ? 'التخزين المحلي غير متاح على الموقع السحابي — استخدم الرفع للسحابة أو وكيل الماك.'
            : raw
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر التحميل')
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [scopeId, signedIn])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    async function mapPosts() {
      let posts = postsByScope[scopeId] || []
      if (posts.length === 0 && signedIn === true) {
        try {
          const res = await fetch(
            `/api/rooms/posts?scopeId=${encodeURIComponent(scopeId)}`,
            { headers: await authHeaders() }
          )
          if (res.ok) {
            const data = (await res.json()) as {
              posts?: Array<{
                id: string
                content?: string
                attachments?: Array<{ fileId: string }>
              }>
            }
            posts = (data.posts || []) as typeof posts
          }
        } catch {
          /* ignore */
        }
      }
      if (cancelled) return
      const map: Record<string, string> = {}
      for (const p of posts) {
        const fromText = parseFileMarkersFromText(p.content || '', scopeId)
        for (const a of fromText) {
          if (a.fileId && !map[a.fileId]) map[a.fileId] = p.id
        }
        for (const a of p.attachments || []) {
          if (a.fileId && !map[a.fileId]) map[a.fileId] = p.id
        }
      }
      setPostByFileId(map)
    }
    void mapPosts()
    return () => {
      cancelled = true
    }
  }, [postsByScope, scopeId, signedIn])

  async function exportVaultManifest() {
    setBackingUp(true)
    setNote('جاري تجهيز فهرس الأرشيف…')
    try {
      const res = await fetch(
        `/api/storage/backup-manifest?scopeId=${encodeURIComponent(scopeId)}`,
        { headers: await authHeaders() }
      )
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || 'فشل تصدير الفهرس')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `arabicbuzz-vault-${scopeId}-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setNote(
        'نُزّل فهرس الأرشيف (JSON). الملفات نفسها تبقى في الخزنة — تنظيف الشات لا يحذفها.'
      )
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'فشل تصدير الفهرس')
    } finally {
      setBackingUp(false)
    }
  }

  async function sendToBrain(f: ListedFile) {
    const fileId = f.id || ''
    if (!fileId) {
      setNote('معرّف الملف غير متاح — أعد الرفع ثم حاول.')
      return
    }
    if (scopeId.startsWith('personal-')) {
      setNote(
        'ملفات المساحة الشخصية تبقى خاصة بك — لا تُرفع لعقل الشركة.'
      )
      return
    }
    setBusyId(fileId)
    setNote('')
    try {
      const res = await fetch('/api/google/drive/brain/upload', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          scopeId,
          localFileId: fileId,
        }),
      })
      const data = (await res.json()) as {
        error?: string
        messageAr?: string
        needsGoogle?: boolean
      }
      if (data.needsGoogle) {
        setNote('اربط Google لرفع عقل الشركة')
        return
      }
      if (!res.ok) throw new Error(data.error || data.messageAr || `HTTP ${res.status}`)
      setNote(data.messageAr || 'رُفع إلى عقل الشركة (Drive)')
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'فشل الرفع لعقل الشركة')
    } finally {
      setBusyId(null)
    }
  }

  async function renameFile(f: ListedFile) {
    const id = f.id
    if (!id) return
    const current = f.originalName || f.name || ''
    const next = window.prompt('الاسم الجديد للملف', current)
    if (!next || next.trim() === current) return
    setBusyId(id)
    setNote('')
    try {
      const res = await fetch('/api/storage/file', {
        method: 'PATCH',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          scopeId,
          id,
          originalName: next.trim(),
        }),
      })
      const data = (await res.json()) as { error?: string; messageAr?: string }
      if (!res.ok) throw new Error(data.error || 'فشل إعادة التسمية')
      setNote(data.messageAr || 'تمت إعادة التسمية')
      await load()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'فشل إعادة التسمية')
    } finally {
      setBusyId(null)
    }
  }

  async function deleteFile(f: ListedFile) {
    const id = f.id
    if (!id) return
    const name = f.originalName || f.name || id
    if (
      !window.confirm(
        `حذف «${name}» ${
          source === 'mac' ? 'من خزنة الماك' : 'من التخزين السحابي'
        } نهائياً؟`
      )
    )
      return
    setBusyId(id)
    setNote('')
    try {
      const res = await fetch(
        `/api/storage/file?scopeId=${encodeURIComponent(scopeId)}&id=${encodeURIComponent(id)}`,
        { method: 'DELETE', headers: await authHeaders() }
      )
      const data = (await res.json()) as { error?: string; messageAr?: string }
      if (!res.ok) throw new Error(data.error || 'فشل الحذف')
      setNote(data.messageAr || 'تم الحذف')
      await load()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'فشل الحذف')
    } finally {
      setBusyId(null)
    }
  }

  function startReplace(f: ListedFile) {
    if (!f.id) return
    replaceTargetId.current = f.id
    replaceRef.current?.click()
  }

  async function onReplaceSelected(fileList: FileList | null) {
    const id = replaceTargetId.current
    const file = fileList?.[0]
    replaceTargetId.current = null
    if (!id || !file) return
    setBusyId(id)
    setNote('جاري استبدال الملف…')
    try {
      const body = new FormData()
      body.append('scopeId', scopeId)
      body.append('id', id)
      body.append('file', file)
      const res = await fetch('/api/storage/file', {
        method: 'PUT',
        headers: await authHeaders(),
        body,
      })
      const data = (await res.json()) as {
        ok?: boolean
        error?: string
        messageAr?: string
        directUploadRequired?: boolean
        directUpload?: {
          replaceUrl: string
          secretHeader?: string | null
          secretValue?: string | null
        }
      }
      if (data.directUploadRequired && data.directUpload?.replaceUrl) {
        const headers: Record<string, string> = {
          'X-Scope-Id': scopeId,
          'X-Original-Name': encodeURIComponent(file.name),
          'X-Mime-Type': file.type || 'application/octet-stream',
          'Content-Type': file.type || 'application/octet-stream',
        }
        if (
          data.directUpload.secretHeader &&
          data.directUpload.secretValue
        ) {
          headers[data.directUpload.secretHeader] =
            data.directUpload.secretValue
        }
        const put = await fetch(data.directUpload.replaceUrl, {
          method: 'PUT',
          headers,
          body: file,
        })
        const putData = (await put.json()) as {
          ok?: boolean
          error?: string
          messageAr?: string
        }
        if (!put.ok || !putData.ok) {
          throw new Error(putData.error || 'فشل الاستبدال المباشر')
        }
        setNote(putData.messageAr || 'استُبدل على الماك')
      } else if (!res.ok || data.ok === false) {
        throw new Error(data.error || data.messageAr || 'فشل الاستبدال')
      } else {
        setNote(data.messageAr || 'تم الاستبدال')
      }
      await load()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'فشل الاستبدال')
    } finally {
      setBusyId(null)
      if (replaceRef.current) replaceRef.current.value = ''
    }
  }

  async function convertCleanPdf(f: ListedFile) {
    const fileId = f.id || ''
    if (!fileId) {
      setNote('معرّف الملف غير متاح.')
      return
    }
    setBusyId(fileId)
    setNote('جاري التحويل النظيف عبر Drive…')
    try {
      const res = await fetch('/api/storage/convert', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          scopeId,
          fileId,
          toFormat: 'docx',
          engine: 'auto',
        }),
      })
      const data = (await res.json()) as {
        ok?: boolean
        error?: string
        messageAr?: string
        fileId?: string
        name?: string
        mimeType?: string
      }
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'فشل التحويل')
      }
      setNote(data.messageAr || 'تم التحويل — الناتج في الأرشيف والشات.')
      if (data.fileId) {
        openFilePreviewInChat({
          fileId: data.fileId,
          scopeId,
          name: data.name || 'converted.docx',
          mimeType:
            data.mimeType ||
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })
      }
      await load()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'فشل التحويل')
    } finally {
      setBusyId(null)
    }
  }

  const sourceLabel =
    source === 'local' || source === 'mac'
      ? 'خزنة الماك المشتركة — الجميع يضيف ويعدّل ويحذف'
      : source === 'cloud'
        ? 'ملفات الغرفة + عقل الشركة (Drive)'
        : source === 'merged'
          ? 'أرشيف مدمج (خزنة + مرفقات الشات)'
          : 'لا ملفات بعد — اختر ملفاً للرفع'

  const emptyHint =
    'الأرشيف فارغ — ارفع من هنا أو من غرفة الفريق. كل الملفات والصوتيات تظهر هنا بلا ضجيج المحادثة.'

  const uploadHint =
    'أرشيف الملفات والصوت فقط (كل الأنواع) — بلا رسائل الشات. الاستخدام اليومي من غرفة الفريق؛ هنا عندما تضيع الملفات في ضجيج المحادثة. الرفع يُزامن مع عقل الشركة (Drive).'

  if (authPending) {
    return (
      <section className="ab-page-narrow" dir="rtl">
        <h2 className="ab-title">ملفات الفريق · أرشيف</h2>
        <p className="ab-section-pad text-sm text-ab-muted">
          جاري التحقق من الحساب…
        </p>
      </section>
    )
  }

  if (isGuest) {
    return (
      <section className="ab-page-narrow" dir="rtl">
        <h2 className="ab-title">ملفات الفريق · أرشيف</h2>
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-6 text-center">
          <p className="text-sm font-semibold text-ab-ink">
            سجّل الدخول لعرض ورفع ملفات الغرفة
          </p>
          <p className="mt-1 text-xs text-ab-muted">
            بعد الدخول تظهر ملفات الغرفة وعقل الشركة (Drive) — بلا محتوى وهمي.
          </p>
          <Link
            href="/auth/login"
            className="ab-btn-primary mt-3 inline-flex"
          >
            سجّل الدخول
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="ab-page-narrow" dir="rtl">
      <input
        ref={replaceRef}
        type="file"
        className="hidden"
        onChange={(e) => void onReplaceSelected(e.target.files)}
      />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="ab-title">ملفات الفريق · أرشيف</h2>
          <p className="ab-subtitle">
            {scope?.nameAr || scopeId} — {sourceLabel}
          </p>
          <p className="mt-1 max-w-xl text-[11px] leading-snug text-ab-muted">
            قائمة الملفات والصوت المرفوعة من الغرفة — بلا محادثة. افتح/شغّل الملف
            من غرفة الفريق مباشرة؛ استخدم هذا الأرشيف عندما يضيع المرفق وسط الرسائل.
          </p>
          <p className="mt-1.5 flex items-start gap-1.5 max-w-xl text-[11px] leading-snug text-emerald-800">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            أرشيف دائم: حذف شات اليوم أو الاحتفاظ التلقائي للرسائل لا يمس هذه
            الملفات. صدّر الفهرس أدناه كنسخة احتياطية للأسماء والمعرّفات.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => void exportVaultManifest()}
            disabled={backingUp || files.length === 0}
            className="ab-btn-secondary"
            title="تنزيل JSON بأسماء ومعرّفات كل ملفات الأرشيف"
          >
            <Download className="h-3 w-3" />
            {backingUp ? 'جاري التصدير…' : 'نسخ احتياطي للفهرس'}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="ab-btn-secondary"
          >
            <RefreshCw className="h-3 w-3" />
            تحديث
          </button>
        </div>
      </div>

      <div>
        <BrainPrivacyNote compact />
      </div>

      <div className="ab-section-pad">
        <p className="mb-2 text-xs font-semibold text-ab-ink">
          ارفع من جهازك
        </p>
        <LocalUploadPanel
          scopeId={scopeId}
          onUploaded={() => void load()}
          onFileReady={(f) =>
            openFilePreviewInChat({
              fileId: f.fileId,
              scopeId: f.scopeId,
              name: f.name,
              mimeType: f.mimeType,
            })
          }
        />
        <p className="mt-2 text-[11px] text-ab-muted">
          {uploadHint}
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {error}
        </p>
      )}
      {note && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          {note}
        </p>
      )}
      {syncNote && !note ? (
        <p className="rounded-md border border-ab-border bg-ab-surface px-3 py-2 text-xs text-ab-muted">
          {syncNote}
        </p>
      ) : null}

      {loading && files.length === 0 ? (
        <p className="text-sm text-ab-muted">جاري التحميل…</p>
      ) : files.length === 0 ? (
        <div className="ab-empty">
          <FileText
            className="mb-3 h-10 w-10 text-ab-accent/40"
            aria-hidden
          />
          <p className="text-base font-semibold text-ab-ink">لا ملفات بعد</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-ab-muted">
            {emptyHint}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {files.map((f, i) => {
            const name =
              f.originalName || f.name || f.relativePath || `ملف ${i + 1}`
            const id = f.id || ''
            const size = f.sizeBytes ?? f.size
            const href = id
              ? `/api/storage/file?id=${encodeURIComponent(id)}&scopeId=${encodeURIComponent(scopeId)}`
              : undefined
            const busy = busyId === id
            const edited =
              isFileEdited(f) ||
              looksLikeEditedBackfill(id, name)
            return (
              <li
                key={id || String(i)}
                className="flex flex-col gap-2 rounded-lg border border-ab-border bg-ab-surface px-3 py-2.5 shadow-ab-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {(f.mimeType || '').startsWith('audio/') ||
                    /\.(ogg|opus|webm|mp3|m4a|wav|aac)$/i.test(name) ? (
                      <Mic
                        className="h-3.5 w-3.5 shrink-0 text-ab-accent"
                        aria-hidden
                      />
                    ) : (
                      <FileText
                        className="h-3.5 w-3.5 shrink-0 text-ab-accent/70"
                        aria-hidden
                      />
                    )}
                    <p className="truncate text-sm font-medium text-ab-ink">
                      {name}
                    </p>
                    <FileEditedBadge show={edited} />
                  </div>
                  <p className="text-[11px] text-ab-muted-soft">
                    {fmtSize(size)}
                    {f.mimeType ? ` · ${f.mimeType}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={!id || busy}
                    onClick={() => {
                      if (!id) return
                      openFilePreviewInChat({
                        fileId: id,
                        scopeId,
                        name,
                        mimeType: f.mimeType,
                      })
                    }}
                    className="ab-btn-accent-soft !py-1 text-[11px]"
                  >
                    <Eye className="h-3 w-3" />
                    معاينة
                  </button>
                  {/\.pdf$/i.test(name) ||
                  (f.mimeType || '').includes('pdf') ? (
                    <button
                      type="button"
                      disabled={!id || busy}
                      onClick={() => void convertCleanPdf(f)}
                      className="ab-btn-secondary !py-1 text-[11px]"
                      title="تحويل PDF→Word عبر Google Drive (المسار النظيف)"
                    >
                      <FileType2 className="h-3 w-3" />
                      حوّل نظيف
                    </button>
                  ) : null}
                  {postByFileId[id] ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        window.dispatchEvent(
                          new CustomEvent('ab-nav', { detail: 'chats' })
                        )
                        window.dispatchEvent(
                          new CustomEvent('ab-focus-room-post', {
                            detail: { postId: postByFileId[id] },
                          })
                        )
                      }}
                      className="ab-btn-ghost !py-1 text-[11px]"
                      title="الرسالة في غرفة الفريق"
                    >
                      <MessageSquare className="h-3 w-3" />
                      في الغرفة
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={!id || busy}
                    onClick={() => void sendToBrain(f)}
                    className="ab-btn-secondary !py-1 text-[11px]"
                  >
                    <Brain className="h-3 w-3" />
                    عقل
                  </button>
                  {href && (
                    <a
                      href={href}
                      className="ab-btn-secondary !py-1 text-[11px]"
                      download
                    >
                      <Download className="h-3 w-3" />
                      تنزيل
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={!id || busy}
                    onClick={() => void renameFile(f)}
                    className="ab-btn-ghost !py-1 text-[11px]"
                  >
                    <Pencil className="h-3 w-3" />
                    إعادة تسمية
                  </button>
                  <button
                    type="button"
                    disabled={!id || busy}
                    onClick={() => startReplace(f)}
                    className="ab-btn-ghost !py-1 text-[11px]"
                  >
                    <Replace className="h-3 w-3" />
                    استبدال
                  </button>
                  <button
                    type="button"
                    disabled={!id || busy}
                    onClick={() => void deleteFile(f)}
                    className="ab-btn-danger !py-1 text-[11px]"
                  >
                    <Trash2 className="h-3 w-3" />
                    حذف
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
