/**
 * Immutable-ish file version naming: report.docx → report-v1.1.docx → report-v1.2.docx
 */
export function stripVersionSuffix(name: string): {
  base: string
  ext: string
  version: number | null
} {
  const m = name.match(/^(.*?)(?:-v(\d+)\.(\d+))?(\.[^.]+)?$/i)
  if (!m) {
    const dot = name.lastIndexOf('.')
    return {
      base: dot > 0 ? name.slice(0, dot) : name,
      ext: dot > 0 ? name.slice(dot) : '',
      version: null,
    }
  }
  const baseRaw = m[1] || name
  const major = m[2] ? Number(m[2]) : null
  const minor = m[3] ? Number(m[3]) : null
  const ext = m[4] || ''
  const version =
    major != null && minor != null ? major * 1000 + minor : null
  return { base: baseRaw.replace(/-معدّل$/i, ''), ext, version }
}

export function nextVersionFileName(
  sourceName: string,
  existingNames: string[]
): { fileName: string; versionTag: string } {
  const { base, ext } = stripVersionSuffix(sourceName)
  const re = new RegExp(
    `^${escapeRe(base)}-v(\\d+)\\.(\\d+)${escapeRe(ext)}$`,
    'i'
  )
  let maxMinor = 0
  let major = 1
  for (const n of existingNames) {
    const hit = n.match(re)
    if (hit) {
      major = Math.max(major, Number(hit[1]) || 1)
      if (Number(hit[1]) === major) {
        maxMinor = Math.max(maxMinor, Number(hit[2]) || 0)
      }
    }
  }
  // Also treat bare "base.ext" as v1.0 present
  const bare = `${base}${ext}`
  if (existingNames.some((n) => n.toLowerCase() === bare.toLowerCase())) {
    maxMinor = Math.max(maxMinor, 0)
  }
  const nextMinor = maxMinor + 1
  const versionTag = `v${major}.${nextMinor}`
  return {
    fileName: `${base}-${versionTag}${ext || '.docx'}`,
    versionTag,
  }
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
