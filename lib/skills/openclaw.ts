import path from 'path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export interface OpenClawSkill {
  id: string
  name: string
  description: string
  scope: 'personal' | 'shared'
  author?: string
  systemInstructions: string
  toolsRequired?: string[]
}

/** Lazy fs — avoids Turbopack DirAssetReference walks over process.cwd(). */
function nodeFs() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:fs') as typeof import('node:fs')
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\w\u0600-\u06FF]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'skill'
}

function splitFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { data: {}, body: content.trim() }
  const data = (parseYaml(match[1]) as Record<string, unknown>) || {}
  return { data, body: match[2].trim() }
}

export function parseSkillFile(filePathOrContent: string): OpenClawSkill {
  const fs = nodeFs()
  let content = filePathOrContent
  let fileStem = 'skill'
  if (
    filePathOrContent.includes(path.sep) ||
    filePathOrContent.endsWith('.md')
  ) {
    try {
      if (fs.existsSync(filePathOrContent)) {
        content = fs.readFileSync(filePathOrContent, 'utf8')
        fileStem = path.basename(filePathOrContent, path.extname(filePathOrContent))
      }
    } catch {
      /* treat as content */
    }
  }

  const { data, body } = splitFrontmatter(content)
  const name = String(data.name || fileStem)
  const id = String(data.id || slugify(name))
  const scope =
    data.scope === 'personal' || data.scope === 'shared' ? data.scope : 'shared'
  const tools =
    (data.toolsRequired as string[] | undefined) ||
    (data.tools as string[] | undefined)

  if (!data.description && !body) {
    throw new Error(`Invalid skill: missing description/body for ${id}`)
  }

  return {
    id,
    name,
    description: String(data.description || name),
    scope,
    author: data.author ? String(data.author) : undefined,
    systemInstructions: body,
    toolsRequired: tools,
  }
}

export function serializeOpenClawSkill(skill: OpenClawSkill): string {
  const front = {
    name: skill.name,
    description: skill.description,
    scope: skill.scope,
    id: skill.id,
    ...(skill.author ? { author: skill.author } : {}),
    ...(skill.toolsRequired ? { toolsRequired: skill.toolsRequired } : {}),
  }
  return `---\n${stringifyYaml(front).trim()}\n---\n\n${skill.systemInstructions.trim()}\n`
}

export function loadSkillsFromDirectory(dirPath: string): OpenClawSkill[] {
  const fs = nodeFs()
  if (!fs.existsSync(dirPath)) return []
  const out: OpenClawSkill[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.md')) {
        try {
          out.push(parseSkillFile(full))
        } catch (e) {
          console.warn('Skipping invalid skill', full, e)
        }
      }
    }
  }
  walk(dirPath)
  return out
}

/** Opaque to Turbopack — avoids DirAssetReference on the whole project root. */
function runtimeCwd(): string {
  const p = process as NodeJS.Process
  return Reflect.apply(p.cwd, p, [])
}

export function saveSkillToWorkspace(
  skill: OpenClawSkill,
  root = 'workspace/skills'
): string {
  const fs = nodeFs()
  const dir = path.join(/* turbopackIgnore: true */ runtimeCwd(), root)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, `${skill.id}.md`)
  fs.writeFileSync(filePath, serializeOpenClawSkill(skill), 'utf8')
  return filePath
}

export function loadAllOpenClawSkills(): OpenClawSkill[] {
  const roots = ['.openclaw/skills', 'workspace/skills', 'skills']
  const map = new Map<string, OpenClawSkill>()
  const cwd = runtimeCwd()
  for (const root of roots) {
    const skills = loadSkillsFromDirectory(
      path.join(/* turbopackIgnore: true */ cwd, root)
    )
    for (const s of skills) map.set(s.id, s)
  }
  return [...map.values()]
}
