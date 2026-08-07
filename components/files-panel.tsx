'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Brain,
  Download,
  Eye,
  FileText,
  Pencil,
  RefreshCw,
  Replace,
  Trash2,
} from 'lucide-react'
import { authHeaders } from '@/lib/supabase/browser'
import { LocalUploadPanel } from '@/components/local-upload-panel'
import { BrainPrivacyNote } from '@/components/brain-privacy-note'
import { useWorkspaceStore } from '@/lib/scopes/workspace-store'
import { useSignedIn } from '@/lib/supabase/use-signed-in'
import { openFilePreviewInChat } from '@/lib/files/preview-store'
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
  const replaceRef = useRef<HTMLInputElement>(null)
  const replaceTargetId = useRef<string | null>(null)

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
        `/api/storage/upload?scopeId=${encodeURIComponent(scopeId)}`,
        { headers: await authHeaders() }
      )
      const data = (await res.json()) as {
        files?: ListedFile[]
        source?: string
        error?: string
      }
      setFiles(data.files || [])
      setSource(data.source || 'none')
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

  async function sendToBrain(f: ListedFile) {
    const fileId = f.id || ''
    if (!fileId) {
      setNote('معرّف الملف غير متاح — أعد الرفع ثم حاول.')
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

  const sourceLabel =
    source === 'local' || source === 'mac'
      ? 'خزنة الماك المشتركة — الجميع يضيف ويعدّل ويحذف'
      : source === 'cloud'
        ? 'ملفات الغرفة + عقل الشركة (Drive)'
        : 'لا ملفات بعد — اسحب ملفاً هنا'

  const emptyHint =
    'اسحب ملفاً إلى منطقة الرفع أعلاه (Word / Excel / PDF / صور) — يُحفظ في الغرفة ويُرفع تلقائياً إلى عقل الشركة.'

  const uploadHint =
    'اسحب وأفلت أو اختر من جهازك. الملف يُحفظ في الغرفة ويُزامن تلقائياً مع عقل الشركة (Drive). يلزم ربط Google للمعرفة المشتركة.'

  if (authPending) {
    return (
      <section className="ab-page-narrow" dir="rtl">
        <h2 className="ab-title">ملفات الفريق · عقل الشركة</h2>
        <p className="ab-section-pad text-sm text-ab-muted">
          جاري التحقق من الحساب…
        </p>
      </section>
    )
  }

  if (isGuest) {
    return (
      <section className="ab-page-narrow" dir="rtl">
        <h2 className="ab-title">ملفات الفريق · عقل الشركة</h2>
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
          <h2 className="ab-title">ملفات الفريق · عقل الشركة</h2>
          <p className="ab-subtitle">
            {scope?.nameAr || scopeId} — {sourceLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="ab-btn-secondary"
        >
          <RefreshCw className="h-3 w-3" />
          تحديث
        </button>
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
