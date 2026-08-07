import type { ToolSet } from 'ai'

/** Subset native/MCP tools by name — shared by assistants + Telegram lean sets. */
export function pickToolSubset(
  all: ToolSet,
  names: readonly string[]
): ToolSet {
  const out: ToolSet = {}
  for (const name of names) {
    if (all[name]) out[name] = all[name]
  }
  return out
}
