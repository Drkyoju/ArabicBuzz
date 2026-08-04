import { config } from 'dotenv'
config({ path: '.env.local' })
import { PrismaClient } from '@prisma/client'
import {
  hybridArabicSearch,
  buildArabicTsQuery,
} from '../lib/rag/hybrid'

async function main() {
  const p = new PrismaClient()
  const sample = await p.$queryRawUnsafe(
    `SELECT title_ar, left(content,120) c, length(content)::int len
     FROM knowledge_documents
     where title_ar like '%محضر%' limit 2`
  )
  console.log('sample', sample)
  const tsq = buildArabicTsQuery('محضر اجتماع')
  console.log('tsq', tsq)
  try {
    const lex = await p.$queryRawUnsafe(
      `SELECT title_ar
       FROM knowledge_documents
       WHERE source_file_id LIKE 'gdrive:%'
         AND tsv_content @@ to_tsquery('arabic', $1)
       LIMIT 5`,
      tsq
    )
    console.log('lex', lex)
  } catch (e) {
    console.log('lex err', e instanceof Error ? e.message : e)
  }
  const like = await p.$queryRawUnsafe(
    `SELECT title_ar FROM knowledge_documents WHERE content ILIKE '%محضر%' OR title_ar ILIKE '%محضر%' LIMIT 5`
  )
  console.log('like', like)
  const hits = await hybridArabicSearch('محضر', 'shared-demo', 5, {
    source: 'drive',
  })
  console.log(
    'hybrid',
    hits.map((h) => ({ t: h.titleAr, s: h.rrfScore }))
  )
  await p.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
