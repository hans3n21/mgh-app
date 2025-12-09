import { prisma } from '@/lib/prisma'

async function main() {
  const terms = process.argv.slice(2)
  if (terms.length === 0) {
    console.log('Usage: tsx scripts/find-entities.ts <term1> [term2] ...')
    process.exit(1)
  }

  for (const raw of terms) {
    const term = raw.trim()
    console.log(`\n=== Suche nach: "${term}" ===`)

    // Customers by name/email/phone
    const customers = await prisma.customer.findMany({
      where: {
        OR: [
          { name: { contains: term } },
          { email: { contains: term } },
          { phone: { contains: term } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    console.log(`Kunden (${customers.length}):`)
    for (const c of customers) {
      console.log(`- ${c.id} | ${c.name} | ${c.email ?? ''} | ${c.phone ?? ''}`)
    }

    // Orders by title + joined customer
    const orders = await prisma.order.findMany({
      where: {
        OR: [
          { title: { contains: term } },
          { customer: { name: { contains: term } } },
        ],
      },
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    console.log(`Aufträge (${orders.length}):`)
    for (const o of orders) {
      console.log(`- ${o.id} | ${o.title} | ${o.type} | ${o.customer?.name ?? ''}`)
    }

    // Mails by from/subject
    const mails = await prisma.mail.findMany({
      where: {
        OR: [
          { fromName: { contains: term } },
          { fromEmail: { contains: term } },
          { subject: { contains: term } },
        ],
      },
      select: { id: true, fromName: true, fromEmail: true, subject: true, orderId: true, date: true },
      orderBy: { date: 'desc' },
      take: 50,
    })
    console.log(`Mails (${mails.length}):`)
    for (const m of mails) {
      const d = m.date ? new Date(m.date).toISOString() : ''
      console.log(`- ${m.id} | ${m.fromName ?? ''} <${m.fromEmail ?? ''}> | ${m.subject ?? ''} | order=${m.orderId ?? ''} | ${d}`)
    }
  }
}

main().finally(async () => {
  await prisma.$disconnect()
})


