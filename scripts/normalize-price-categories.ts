import { loadEnvConfig } from '@next/env'
import { PrismaClient } from '@prisma/client'
import { inferPriceMainCategory } from '../lib/prices/categories'

loadEnvConfig(process.cwd())

async function main() {
  const prisma = new PrismaClient()
  const apply = process.argv.includes('--apply')

  try {
    const items = await prisma.priceItem.findMany({
      orderBy: [{ mainCategory: 'asc' }, { category: 'asc' }, { label: 'asc' }],
    })

    let updated = 0
    let unchanged = 0

    for (const item of items) {
      const mainCategory = inferPriceMainCategory(item)
      if (!mainCategory || item.mainCategory === mainCategory) {
        unchanged++
        continue
      }

      if (apply) {
        await prisma.priceItem.update({
          where: { id: item.id },
          data: { mainCategory },
        })
      }
      updated++
      console.log(`${apply ? 'Updated' : 'Would update'} ${item.label}: ${item.mainCategory ?? '-'} -> ${mainCategory}`)
    }

    console.log(`Done. Mode=${apply ? 'apply' : 'dry-run'} Updated=${updated} Unchanged=${unchanged}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
