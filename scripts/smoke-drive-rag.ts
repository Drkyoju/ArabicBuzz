import { config } from 'dotenv'
config({ path: '.env.local' })
import { hybridArabicSearch } from '../lib/rag/hybrid'

async function main() {
  const hits = await hybridArabicSearch('محضر اجتماع', 'shared-demo', 3, {
    source: 'drive',
  })
  console.log(
    hits.map((h) => ({
      title: h.titleAr,
      score: Number(h.rrfScore.toFixed(4)),
      drive: Boolean(h.metadata.sourceFileId?.startsWith('gdrive:')),
    }))
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
