'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { FileUp, Mic, Paperclip, Link2, Loader2 } from 'lucide-react'
import {
  checkBrowserRecordSupport,
  extForAudioMime,
  startBrowserRecording,
  type ActiveRecording,
} from '@/lib/audio/browser-record'
import { transcribeVoiceBlob } from '@/lib/audio/client-transcribe'
import {
  startLiveCaptions,
  type LiveCaptionHandle,
} from '@/lib/audio/live-captions'
import { authHeaders, connectGoogleCalendar } from '@/lib/supabase/browser'
import { openFilePreviewInChat } from '@/lib/files/preview-store'
import {
  fileFromDataTransfer,
  pickDeviceFile,
} from '@/lib/files/pick-device-file'
import { getBridgeDragData } from '@/lib/files/workspace-bridge'
import {
  coordsForAnchoredFloating,
  type AnchoredFloatingCoords,
} from '@/lib/ui/anchored-floating'
import { cn } from '@/lib/utils'

type StoredFile = {
  id: string
  kind: string
  originalName: string
  size: number
  createdAt: string
}

export type UploadedRoomFile = {
  fileId: string
  name: string
  mimeType?: string
  scopeId: string
}

/** Imperative API so the room composer can accept OS file drops on the textarea. */
export type LocalUploadHandle = {
  uploadDeviceFile: (file: File | Blob, filename?: string) => Promise<void>
}

type PendingVoice = {
  blob: Blob
  mimeType: string
  objectUrl: string
  transcript: string
  sttBusy: boolean
  sttError: string | null
  providerLabelAr?: string
}

type LocalUploadPanelProps = {
  scopeId: string
  onUploaded?: () => void
  /** Fired when a file is saved to the room vault — attach to chat for the agent. */
  onFileReady?: (file: UploadedRoomFile) => void
  compact?: boolean
}

/**
 * Room file attach toolbar: pick / drop-on-composer → room vault, then auto Drive «عقل الشركة».
 */
export const LocalUploadPanel = forwardRef<
  LocalUploadHandle,
  LocalUploadPanelProps
>(function LocalUploadPanel(
  { scopeId, onUploaded, onFileReady, compact },
  ref
) {
  const mediaRef = useRef<ActiveRecording | null>(null)
  const liveCaptionRef = useRef<LiveCaptionHandle | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const pendingUrlRef = useRef<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [liveCaption, setLiveCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<StoredFile[]>([])
  const [open, setOpen] = useState(false)
  const [panelCoords, setPanelCoords] = useState<AnchoredFloatingCoords | null>(
    null
  )
  const [macConfigured, setMacConfigured] = useState(false)
  const [needsGoogle, setNeedsGoogle] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [connectingGoogle, setConnectingGoogle] = useState(false)
  const [pendingVoice, setPendingVoice] = useState<PendingVoice | null>(null)

  const refresh = useCallback(async () => {
    const headers = await authHeaders()
    const [listRes, statusRes] = await Promise.all([
      fetch(`/api/storage/upload?scopeId=${encodeURIComponent(scopeId)}`, {
        headers,
      }),
      fetch('/api/storage/upload?status=1', { headers }),
    ])
    if (listRes.ok) {
      const data = (await listRes.json()) as {
        files?: StoredFile[]
        error?: string
      }
      setFiles(data.files || [])
      if (data.error) setMessage(data.error)
    }
    if (statusRes.ok) {
      const status = (await statusRes.json()) as {
        macSyncConfigured?: boolean
      }
      setMacConfigured(Boolean(status.macSyncConfigured))
    }
  }, [scopeId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    return () => {
      mediaRef.current?.stream.getTracks().forEach((t) => t.stop())
      if (pendingUrlRef.current) {
        URL.revokeObjectURL(pendingUrlRef.current)
        pendingUrlRef.current = null
      }
    }
  }, [])

  const repositionPanel = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    setPanelCoords(
      coordsForAnchoredFloating(el.getBoundingClientRect(), {
        width: 280,
        estimatedHeight: panelRef.current?.offsetHeight || 200,
        gap: 8,
        padding: 12,
      })
    )
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setPanelCoords(null)
      return
    }
    repositionPanel()
    // Second pass after paint so estimated height matches real panel.
    const raf = requestAnimationFrame(() => repositionPanel())
    window.addEventListener('resize', repositionPanel)
    window.addEventListener('scroll', repositionPanel, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', repositionPanel)
      window.removeEventListener('scroll', repositionPanel, true)
    }
  }, [open, repositionPanel, files.length, message, needsGoogle, progress, pendingVoice])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingVoice) return
        setOpen(false)
      }
    }
    const onPointer = (e: MouseEvent | PointerEvent) => {
      if (pendingVoice) return
      const t = e.target as Node | null
      if (!t) return
      if (triggerRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [open, pendingVoice])

  useEffect(() => {
    return () => {
      try {
        liveCaptionRef.current?.stop()
      } catch {
        /* ignore */
      }
      liveCaptionRef.current = null
      mediaRef.current?.stream.getTracks().forEach((t) => t.stop())
      mediaRef.current = null
    }
  }, [])

  function stopLiveCaption() {
    try {
      liveCaptionRef.current?.stop()
    } catch {
      /* ignore */
    }
    liveCaptionRef.current = null
    setLiveCaption('')
  }

  function notifyReady(
    meta: {
      id?: string
      originalName?: string
      mimeType?: string
    },
    fallbackName: string,
    fallbackMime: string
  ) {
    if (!meta.id) return
    const payload: UploadedRoomFile = {
      fileId: meta.id,
      name: meta.originalName || fallbackName,
      mimeType: meta.mimeType || fallbackMime,
      scopeId,
    }
    onFileReady?.(payload)
    openFilePreviewInChat({
      fileId: payload.fileId,
      scopeId,
      name: payload.name,
      mimeType: payload.mimeType,
    })
  }

  async function syncToCompanyBrain(localFileId: string) {
    if (scopeId.startsWith('personal-')) {
      return {
        ok: true as const,
        needsGoogle: false as const,
        message:
          'حُفظ في مساحتك الشخصية فقط — لم يُشارك مع عقل الشركة ولا غرفة الفريق',
      }
    }
    try {
      const res = await fetch('/api/google/drive/brain/upload', {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ scopeId, localFileId }),
      })
      const data = (await res.json()) as {
        ok?: boolean
        needsGoogle?: boolean
        messageAr?: string
        error?: string
        driveName?: string
      }
      if (data.needsGoogle || data.error?.includes('اربط Google')) {
        setNeedsGoogle(true)
        return {
          ok: false as const,
          needsGoogle: true as const,
          message:
            'حُفظ في الغرفة — اربط Google لرفع عقل الشركة (إلزامي للمعرفة المشتركة)',
        }
      }
      if (!res.ok || data.ok === false) {
        return {
          ok: false as const,
          needsGoogle: false as const,
          message:
            data.messageAr ||
            data.error ||
            'حُفظ في الغرفة — تعذّر الرفع لـ Drive؛ أعد المحاولة بعد ربط Google',
        }
      }
      setNeedsGoogle(false)
      return {
        ok: true as const,
        needsGoogle: false as const,
        message: data.messageAr || `رُفع إلى عقل الشركة (Drive)`,
      }
    } catch (e) {
      return {
        ok: false as const,
        needsGoogle: false as const,
        message:
          e instanceof Error
            ? e.message
            : 'حُفظ في الغرفة — تعذّر مزامنة Drive',
      }
    }
  }

  async function uploadDirectToMac(
    file: File,
    direct: {
      uploadUrl: string
      secretHeader?: string | null
      secretValue?: string | null
    }
  ) {
    const headers: Record<string, string> = {
      'X-Scope-Id': scopeId,
      'X-Original-Name': encodeURIComponent(file.name),
      'X-Mime-Type': file.type || 'application/octet-stream',
      'Content-Type': file.type || 'application/octet-stream',
    }
    if (direct.secretHeader && direct.secretValue) {
      headers[direct.secretHeader] = direct.secretValue
    }
    setMessage('رفع مباشر إلى الماك… قد يستغرق وقتاً للملفات الكبيرة')
    const res = await fetch(direct.uploadUrl, {
      method: 'POST',
      headers,
      body: file,
    })
    const data = (await res.json()) as {
      ok?: boolean
      error?: string
      messageAr?: string
      file?: { id?: string; originalName?: string; mimeType?: string }
    }
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'فشل الرفع المباشر للماك')
    }
    return data
  }

  async function uploadBlob(
    file: File | Blob,
    filename: string,
    opts?: { transcript?: string }
  ) {
    setBusy(true)
    setMessage('')
    setProgress(0)
    try {
      const asFile =
        file instanceof File
          ? file
          : new File([file], filename, { type: file.type })

      const statusRes = await fetch('/api/storage/upload?status=1', {
        headers: await authHeaders(),
      })
      const status = (await statusRes.json()) as {
        hopMaxBytes?: number
        directUpload?: {
          uploadUrl: string
          secretHeader?: string | null
          secretValue?: string | null
          maxBytes?: number
        } | null
        macSyncConfigured?: boolean
        storage?: { backend?: string }
      }
      const hopMax = status.hopMaxBytes || 32 * 1024 * 1024
      setProgress(15)

      let roomFileId: string | undefined
      let roomMessage = ''
      const transcript = opts?.transcript?.trim() || ''

      if (asFile.size > hopMax && status.directUpload?.uploadUrl) {
        setProgress(40)
        const data = await uploadDirectToMac(asFile, status.directUpload)
        setProgress(70)
        roomFileId = data.file?.id
        roomMessage = data.messageAr || 'حُفظ مباشرة على الماك'
        notifyReady(
          data.file || {},
          asFile.name,
          asFile.type || 'application/octet-stream'
        )
      } else {
        setProgress(35)
        const body = new FormData()
        body.append('scopeId', scopeId)
        body.append('file', asFile)
        if (transcript) body.append('transcript', transcript)
        const res = await fetch('/api/storage/upload', {
          method: 'POST',
          headers: await authHeaders(),
          body,
        })
        setProgress(60)
        const data = (await res.json()) as {
          error?: string
          messageAr?: string
          ok?: boolean
          source?: string
          file?: {
            id?: string
            originalName?: string
            mimeType?: string
          }
          directUploadRequired?: boolean
          directUpload?: {
            uploadUrl: string
            secretHeader?: string | null
            secretValue?: string | null
          }
        }
        if (data.directUploadRequired && data.directUpload?.uploadUrl) {
          setProgress(70)
          const direct = await uploadDirectToMac(asFile, data.directUpload)
          roomFileId = direct.file?.id
          roomMessage = direct.messageAr || 'حُفظ مباشرة على الماك'
          notifyReady(
            direct.file || {},
            asFile.name,
            asFile.type || 'application/octet-stream'
          )
        } else if (!res.ok || data.ok === false) {
          setMessage(data.error || data.messageAr || 'تعذّر الرفع')
          return
        } else {
          roomFileId = data.file?.id
          roomMessage = data.messageAr || 'تم الحفظ في الغرفة'
          notifyReady(
            data.file || {},
            asFile.name,
            asFile.type || 'application/octet-stream'
          )
        }
      }

      setProgress(85)
      if (roomFileId) {
        const brain = await syncToCompanyBrain(roomFileId)
        setProgress(100)
        if (brain.needsGoogle) {
          setMessage(brain.message)
        } else if (brain.ok) {
          setMessage(`${roomMessage} · ${brain.message}`)
        } else {
          setMessage(`${roomMessage} · ${brain.message}`)
        }
      } else {
        setProgress(100)
        setMessage(roomMessage || 'تم الحفظ في الغرفة')
      }

      await refresh()
      onUploaded?.()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'خطأ في الرفع')
    } finally {
      setBusy(false)
      setTimeout(() => setProgress(null), 800)
    }
  }

  useImperativeHandle(ref, () => ({
    uploadDeviceFile: async (file, filename) => {
      const name =
        filename ||
        (file instanceof File ? file.name : `upload-${Date.now()}`)
      await uploadBlob(file, name)
    },
  }))

  async function pickAndUpload() {
    setMessage('اختر ملفاً — يُحفظ في الغرفة ثم عقل الشركة.')
    const picked = await pickDeviceFile()
    if (!picked) {
      setMessage('')
      return
    }
    await uploadBlob(picked.file, picked.file.name)
  }

  function onDropZoneDragOver(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!busy) setDragOver(true)
  }

  function onDropZoneDragLeave(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }

  function onDropZoneDrop(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (busy) return
    const bridge = getBridgeDragData(e.dataTransfer)
    if (bridge) {
      const payload: UploadedRoomFile = {
        fileId: bridge.fileId,
        name: bridge.name,
        mimeType: bridge.mimeType,
        scopeId: bridge.scopeId || scopeId,
      }
      onFileReady?.(payload)
      setMessage(`أُرفق من تيليجرام: «${bridge.name}» — اكتب ثم أرسل`)
      return
    }
    const file = fileFromDataTransfer(e.dataTransfer)
    if (!file) {
      setMessage('لم يُعثر على ملف في السحب — جرّب ملفاً واحداً')
      return
    }
    void uploadBlob(file, file.name)
  }

  async function connectGoogle() {
    setConnectingGoogle(true)
    setMessage('جاري فتح ربط Google…')
    try {
      await connectGoogleCalendar()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'تعذّر ربط Google')
      setConnectingGoogle(false)
    }
  }

  function clearPendingVoice() {
    if (pendingUrlRef.current) {
      URL.revokeObjectURL(pendingUrlRef.current)
      pendingUrlRef.current = null
    }
    setPendingVoice(null)
  }

  async function runSttOnPending(
    blob: Blob,
    mimeType: string,
    objectUrl: string
  ) {
    setPendingVoice({
      blob,
      mimeType,
      objectUrl,
      transcript: '',
      sttBusy: true,
      sttError: null,
    })
    setMessage('جاري النسخ العربي… راجع النص قبل الحفظ')
    const result = await transcribeVoiceBlob(blob, mimeType)
    setPendingVoice((prev) => {
      if (!prev || prev.objectUrl !== objectUrl) return prev
      if (!result.ok) {
        return {
          ...prev,
          sttBusy: false,
          sttError: result.error,
          transcript: '',
        }
      }
      return {
        ...prev,
        sttBusy: false,
        sttError: null,
        transcript: result.text,
        providerLabelAr: result.providerLabelAr,
      }
    })
    if (!result.ok) {
      setMessage(
        `${result.error} — يمكنك حفظ الصوت فقط، أو إعادة النسخ، أو الإلغاء`
      )
    } else {
      setMessage(
        `نُسخ عبر ${result.providerLabelAr || 'النموذج'} — راجع النص وعدّله ثم اضغط حفظ`
      )
    }
  }

  async function toggleMacRecord() {
    if (recording && mediaRef.current) {
      try {
        stopLiveCaption()
        const { blob, mimeType } = await mediaRef.current.stop()
        mediaRef.current = null
        setRecording(false)
        if (pendingUrlRef.current) {
          URL.revokeObjectURL(pendingUrlRef.current)
        }
        const objectUrl = URL.createObjectURL(blob)
        pendingUrlRef.current = objectUrl
        if (compact) setOpen(true)
        await runSttOnPending(blob, mimeType, objectUrl)
      } catch (e) {
        stopLiveCaption()
        setRecording(false)
        setMessage(e instanceof Error ? e.message : 'فشل حفظ التسجيل')
      }
      return
    }
    if (pendingVoice || busy) return
    const support = checkBrowserRecordSupport()
    if (!support.ok) {
      setMessage(support.reasonAr || 'التسجيل غير متاح')
      return
    }
    try {
      const active = await startBrowserRecording()
      mediaRef.current = active
      setRecording(true)
      setLiveCaption('')
      liveCaptionRef.current = startLiveCaptions({
        getPartialBlob: () => active.snapshot(),
        onStatus: setMessage,
        onPartial: (spoken) => setLiveCaption(spoken),
      })
      if (liveCaptionRef.current.mode === 'listening-only') {
        setMessage(
          'جاري الاستماع… الكلام يظهر أثناء الحديث إن أمكن؛ بعد الإيقاف راجع النص قبل الحفظ'
        )
      }
    } catch (e) {
      stopLiveCaption()
      setMessage(e instanceof Error ? e.message : 'تعذّر الوصول للميكروفون')
    }
  }

  async function savePendingVoice() {
    const pending = pendingVoice
    if (!pending || busy || pending.sttBusy) return
    const name = `voice-${Date.now()}.${extForAudioMime(pending.mimeType)}`
    const transcript = pending.transcript.trim()
    clearPendingVoice()
    await uploadBlob(pending.blob, name, {
      transcript: transcript || undefined,
    })
  }

  async function retryPendingStt() {
    const pending = pendingVoice
    if (!pending || pending.sttBusy || busy) return
    await runSttOnPending(pending.blob, pending.mimeType, pending.objectUrl)
  }

  function cancelPendingVoice() {
    clearPendingVoice()
    setMessage('أُلغي التسجيل — لم يُحفظ شيء')
  }

  const liveCaptionBox =
    recording && !pendingVoice ? (
      <div className="mt-2 space-y-1 rounded-lg border border-dashed border-ab-warn/50 bg-ab-warn/5 p-2">
        <p className="text-[10px] font-semibold text-ab-warn">
          الكلام يظهر أثناء الحديث (مسودة)
        </p>
        <p className="min-h-[2.5rem] whitespace-pre-wrap text-xs leading-relaxed text-ab-ink">
          {liveCaption.trim() || 'جاري الاستماع…'}
        </p>
        <p className="text-[10px] text-stone-500">
          بعد الإيقاف يُستبدل بنسخ عربي أدق — راجع ثم احفظ. لا يُرفع تلقائياً.
        </p>
      </div>
    ) : null

  const voiceReviewBox = pendingVoice ? (
    <div className="mt-2 space-y-2 rounded-lg border border-ab-border bg-white p-2">
      <p className="text-[10px] font-semibold text-ab-ink">
        مراجعة التسجيل قبل الحفظ
      </p>
      <audio
        controls
        src={pendingVoice.objectUrl}
        className="h-8 w-full"
        preload="metadata"
      />
      <label className="block space-y-1">
        <span className="text-[10px] text-stone-600">
          النص المنسوخ (عدّله إن لزم)
          {pendingVoice.providerLabelAr
            ? ` · ${pendingVoice.providerLabelAr}`
            : ''}
        </span>
        {pendingVoice.sttBusy ? (
          <div className="flex items-center gap-1.5 rounded-md border border-dashed border-ab-border px-2 py-2 text-[11px] text-stone-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            جاري النسخ العربي…
          </div>
        ) : (
          <textarea
            dir="rtl"
            rows={3}
            value={pendingVoice.transcript}
            onChange={(e) =>
              setPendingVoice((prev) =>
                prev ? { ...prev, transcript: e.target.value } : prev
              )
            }
            placeholder={
              pendingVoice.sttError
                ? 'تعذّر النسخ — اكتب النص يدوياً أو احفظ الصوت فقط'
                : 'سيظهر النص هنا للمراجعة'
            }
            className="w-full resize-y rounded-md border border-ab-border bg-stone-50 px-2 py-1.5 text-xs text-ab-ink outline-none focus:border-ab-accent"
          />
        )}
      </label>
      {pendingVoice.sttError && !pendingVoice.sttBusy && (
        <p className="text-[10px] text-ab-warn">{pendingVoice.sttError}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={busy || pendingVoice.sttBusy}
          onClick={() => void savePendingVoice()}
          className="inline-flex items-center rounded-md bg-ab-accent px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
        >
          حفظ
        </button>
        <button
          type="button"
          disabled={busy || pendingVoice.sttBusy}
          onClick={cancelPendingVoice}
          className="inline-flex items-center rounded-md border border-ab-border px-2.5 py-1.5 text-[11px] disabled:opacity-40"
        >
          إلغاء
        </button>
        {(pendingVoice.sttError || !pendingVoice.transcript) &&
          !pendingVoice.sttBusy && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void retryPendingStt()}
              className="inline-flex items-center rounded-md border border-ab-border px-2.5 py-1.5 text-[11px] text-ab-accent disabled:opacity-40"
            >
              إعادة النسخ
            </button>
          )}
      </div>
      <p className="text-[10px] leading-relaxed text-stone-500">
        لا يُرفع الملف حتى تضغط «حفظ». إن فشل النسخ يمكنك حفظ الصوت فقط أو كتابة
        النص يدوياً. قل طلبك («أبغا اللائحة…») ثم راجع النص — في الغرفة الوكيل
        الجاهز ينفّذ بعد الإرسال.
      </p>
    </div>
  ) : null

  const googleBanner = needsGoogle ? (
    <div className="mt-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-950">
      <p className="font-semibold">اربط Google لرفع عقل الشركة</p>
      <p className="mt-0.5 text-amber-900/90">
        الملف محفوظ في الغرفة، لكن معرفة الجمعية تلزم Drive. اربط الحساب ثم
        أعد الرفع أو اضغط «عقل» على الملف.
      </p>
      <button
        type="button"
        disabled={connectingGoogle}
        onClick={() => void connectGoogle()}
        className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-ab-accent px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
      >
        <Link2 className="h-3 w-3" />
        {connectingGoogle ? 'جاري الربط…' : 'اربط Google لرفع عقل الشركة'}
      </button>
    </div>
  ) : null

  if (compact) {
    const panel =
      open && panelCoords
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label="إرفاق ملف"
              dir="rtl"
              className="fixed z-[80] overflow-y-auto rounded-xl border border-ab-border bg-white p-2 shadow-lg"
              style={{
                top: panelCoords.top,
                left: panelCoords.left,
                width: panelCoords.width,
                maxHeight: panelCoords.maxHeight,
              }}
            >
              <p className="mb-1.5 px-1 text-[10px] leading-relaxed text-stone-500">
                اختر ملفاً أو سجّل صوتاً — أو اسحب الملف مباشرة إلى مربع الرسالة.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void pickAndUpload()}
                  className="inline-flex items-center gap-1 rounded-md border border-ab-border bg-white px-2 py-1.5 text-[11px] font-medium text-ab-ink hover:bg-stone-50 disabled:opacity-40"
                >
                  <FileUp className="h-3.5 w-3.5 text-ab-accent" aria-hidden />
                  اختر ملفاً
                </button>
                <button
                  type="button"
                  disabled={busy || Boolean(pendingVoice?.sttBusy)}
                  onClick={() => void toggleMacRecord()}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px]',
                    recording
                      ? 'border-ab-warn bg-ab-warn/10 text-ab-warn'
                      : 'border-ab-border'
                  )}
                >
                  <Mic className="h-3 w-3" />
                  {recording
                    ? 'إيقاف'
                    : macConfigured
                      ? 'تسجيل للماك'
                      : 'ملف صوتي'}
                </button>
              </div>
              {liveCaptionBox}
              {voiceReviewBox}
              {progress != null && (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100">
                  <div
                    className="h-full rounded-full bg-ab-accent transition-all"
                    style={{ width: `${Math.min(100, progress)}%` }}
                  />
                </div>
              )}
              {message && (
                <p className="mt-1.5 text-[10px] text-stone-500">{message}</p>
              )}
              {googleBanner}
              {files.length > 0 && (
                <ul className="mt-1.5 max-h-20 space-y-0.5 overflow-y-auto text-[10px] text-stone-600">
                  {files.slice(0, 5).map((f) => (
                    <li key={f.id} className="flex justify-between gap-2">
                      <button
                        type="button"
                        className="truncate text-start hover:text-ab-accent hover:underline"
                        title="إرفاق للشات وتعديل الوكيل"
                        onClick={() => {
                          onFileReady?.({
                            fileId: f.id,
                            name: f.originalName,
                            scopeId,
                          })
                          openFilePreviewInChat({
                            fileId: f.id,
                            scopeId,
                            name: f.originalName,
                          })
                          setOpen(false)
                        }}
                      >
                        {f.originalName}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className="shrink-0 text-ab-accent hover:underline"
                        onClick={() =>
                          void (async () => {
                            setBusy(true)
                            const brain = await syncToCompanyBrain(f.id)
                            setMessage(brain.message)
                            setBusy(false)
                          })()
                        }
                      >
                        عقل
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>,
            document.body
          )
        : null

    return (
      <div className="relative" dir="rtl">
        <button
          ref={triggerRef}
          type="button"
          disabled={busy}
          onClick={() => {
            if (pendingVoice && open) return
            if (recording) {
              void toggleMacRecord()
              return
            }
            setOpen((v) => !v)
          }}
          className={cn(
            'inline-flex h-10 w-10 items-center justify-center rounded-full border bg-white text-ab-ink hover:bg-stone-50 disabled:opacity-40',
            recording
              ? 'border-ab-warn text-ab-warn animate-pulse'
              : 'border-ab-border'
          )}
          aria-label={recording ? 'إيقاف التسجيل' : 'إرفاق ملف'}
          aria-expanded={open}
          aria-haspopup="dialog"
          title={
            recording
              ? 'إيقاف ثم مراجعة النص'
              : 'إرفاق ملف أو تسجيل صوتي — الكلام يظهر أثناء الحديث'
          }
        >
          <Paperclip className="h-4 w-4" />
        </button>
        {panel}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-md border border-ab-border bg-stone-50 p-2 transition-colors',
        dragOver && 'border-ab-accent bg-ab-accent/10 ring-2 ring-ab-accent/30',
        busy && 'opacity-60'
      )}
      dir="rtl"
      onDragOver={onDropZoneDragOver}
      onDragLeave={onDropZoneDragLeave}
      onDrop={onDropZoneDrop}
    >
      <p className="mb-2 text-[11px] leading-relaxed text-stone-600">
        <span className="font-semibold text-ab-ink">ارفع من جهازك</span>
        {' — '}
        Word / Excel / PDF / صور. يُحفظ في الغرفة ويُرفع تلقائياً إلى عقل الشركة
        (Drive).
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void pickAndUpload()}
          className="inline-flex items-center gap-1.5 rounded-md border border-ab-border bg-white px-2.5 py-1.5 text-xs font-medium text-ab-ink hover:bg-stone-50 disabled:opacity-40"
        >
          <FileUp className="h-3.5 w-3.5 text-ab-accent" aria-hidden />
          اختر ملفاً
        </button>
        <button
          type="button"
          disabled={busy || Boolean(pendingVoice?.sttBusy)}
          onClick={() => void toggleMacRecord()}
          className={cn(
            'inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs disabled:opacity-40',
            recording
              ? 'border-ab-warn bg-ab-warn/10 text-ab-warn'
              : 'border-ab-border bg-white'
          )}
        >
          <Mic className="h-3.5 w-3.5" />
          {recording
            ? 'إيقاف للمراجعة'
            : macConfigured
              ? 'تسجيل صوتي للماك'
              : 'ملف صوتي'}
        </button>
      </div>
      {liveCaptionBox}
      {voiceReviewBox}
      {progress != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
          <div
            className="h-full rounded-full bg-ab-accent transition-all"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      )}
      {message && <p className="mt-1 text-[11px] text-stone-500">{message}</p>}
      {googleBanner}
    </div>
  )
})
