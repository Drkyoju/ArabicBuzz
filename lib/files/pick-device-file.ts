/**
 * Pick a file from the user's device for room upload.
 * Uses File System Access API when available (Chrome/Edge), else <input type=file>.
 * Never claims whole-disk access — only the file(s) the user explicitly chooses.
 */

export type DevicePickResult = {
  file: File
  /** True when showOpenFilePicker was used (user granted picker access). */
  viaFileSystemAccess: boolean
}

const ACCEPT_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    '.docx',
  ],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
    '.xlsx',
  ],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': [
    '.pptx',
  ],
  'text/plain': ['.txt'],
  'text/markdown': ['.md'],
  'text/csv': ['.csv'],
  'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.tiff'],
}

function supportsShowOpenFilePicker(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { showOpenFilePicker?: unknown })
      .showOpenFilePicker === 'function'
  )
}

/** Open native file picker (File System Access) or classic file input. */
export async function pickDeviceFile(opts?: {
  multiple?: boolean
}): Promise<DevicePickResult | null> {
  if (supportsShowOpenFilePicker()) {
    try {
      const picker = (
        window as unknown as {
          showOpenFilePicker: (o: Record<string, unknown>) => Promise<
            { getFile: () => Promise<File> }[]
          >
        }
      ).showOpenFilePicker
      const handles = await picker({
        multiple: Boolean(opts?.multiple),
        excludeAcceptAllOption: false,
        types: [
          {
            description: 'مستندات وصور للعمل',
            accept: ACCEPT_TYPES,
          },
        ],
      })
      if (!handles?.length) return null
      const file = await handles[0].getFile()
      return { file, viaFileSystemAccess: true }
    } catch (e) {
      // User cancelled or permission denied — fall through to input
      if (e instanceof DOMException && e.name === 'AbortError') return null
    }
  }

  return pickViaHiddenInput()
}

function pickViaHiddenInput(): Promise<DevicePickResult | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept =
      '.pdf,application/pdf,image/*,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,*/*'
    input.style.display = 'none'
    const cleanup = () => {
      input.remove()
    }
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      cleanup()
      resolve(file ? { file, viaFileSystemAccess: false } : null)
    })
    // Some browsers fire focus without change on cancel
    window.addEventListener(
      'focus',
      () => {
        setTimeout(() => {
          if (!input.isConnected) return
          if (!input.files?.length) {
            cleanup()
            resolve(null)
          }
        }, 400)
      },
      { once: true }
    )
    document.body.appendChild(input)
    input.click()
  })
}
