/**
 * Compact UI surfaces (briefs, activity rows, truncating lines) should not show
 * raw `**bold**` / list markers from agent or Telegram markdown.
 */
export function plainFromMarkdown(input: string | null | undefined): string {
  if (!input) return ''
  let s = input
  // fenced / inline code
  s = s.replace(/```[\s\S]*?```/g, (block) =>
    block.replace(/^```\w*\n?/, '').replace(/```$/, '').trim()
  )
  s = s.replace(/`([^`]+)`/g, '$1')
  // images / links
  s = s.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  // bold / italic / strike
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '$1')
  s = s.replace(/___(.+?)___/g, '$1')
  s = s.replace(/\*\*(.+?)\*\*/g, '$1')
  s = s.replace(/__(.+?)__/g, '$1')
  s = s.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
  s = s.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '$1')
  s = s.replace(/~~(.+?)~~/g, '$1')
  // headings / quotes / list markers at line start
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '')
  s = s.replace(/^\s{0,3}>\s?/gm, '')
  s = s.replace(/^\s*[-*+]\s+/gm, '')
  s = s.replace(/^\s*\d+\.\s+/gm, '')
  // collapse leftover emphasis markers
  s = s.replace(/\*{1,3}/g, '')
  s = s.replace(/_{1,3}/g, '')
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}
