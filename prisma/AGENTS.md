# AGENTS.md – Prisma Database

## Struktur (konkret)
```
prisma/
├── schema.prisma         # Database Schema
├── migrations/           # 10 Migrations vorhanden
├── dev.db               # SQLite Development DB
└── seed.ts              # Database Seeding
```

## Database Config
- **Provider**: SQLite (file:./dev.db)
- **Generator**: prisma-client-js
- **Client**: `lib/prisma.ts`

## Commands (konkret verfügbar)
- **Reset**: `npm run db:reset`
- **Seed**: `npm run db:seed`
- **Generate**: `npx prisma generate`
- **Migrate**: `npx prisma migrate dev`
- **Studio**: `npx prisma studio`

## Hauptmodels (aus Schema)
```prisma
model Order {
  id         String      @id  // Human-readable: ORD-2025-001
  title      String
  type       OrderType   // GUITAR, BODY, NECK, REPAIR, PICKGUARD, PICKUPS, ENGRAVING, FINISH_ONLY
  status     OrderStatus // intake, quote, in_progress, finishing, setup, awaiting_customer, complete, design_review
  customer   Customer
  assignee   User?
  specs      OrderSpecKV[]
  images     OrderImage[]
  mails      Mail[]
  items      OrderItem[]
  extras     OrderExtra[]
  datasheets Datasheet[]
}

model Mail {
  id        String @id @default(cuid())
  messageId String @unique
  subject   String?
  text      String?
  html      String?
  order     Order?
  unread    Boolean @default(true)
  attachments Attachment[]
}

model User {
  id    String @id @default(cuid())
  name  String
  email String @unique
  role  Role   @default(staff) // admin, staff
}
```

## Migration History (konkret vorhanden)
- `20250811201322_fix_order_creation`
- `20250812191556_add_wc_order_id`
- `20250812193652_billing_fields`
- `20250813095322_add_mail_models`
- `20250813102740_add_datasheet_model`
- `20250813132828_add_customer_address`
- `20250813141040_drop_customer_address_line2`
- `20250814213059_add_feedback_model`
- `20250815133259_add_reply_templates`
- `20250819_add_mail_read_status`

## Client Usage
```typescript
import { prisma } from '@/lib/prisma'

// Create Order with Relations
const order = await prisma.order.create({
  data: {
    id: 'ORD-2025-001',
    title: 'Custom Stratocaster',
    type: 'GUITAR',
    customer: { connect: { id: customerId } },
    specs: {
      create: [
        { key: 'body_wood', value: 'Alder' },
        { key: 'neck_wood', value: 'Maple' }
      ]
    }
  },
  include: { customer: true, specs: true }
})
```

## Workflow
1. Schema ändern: `prisma/schema.prisma`
2. Migration: `npx prisma migrate dev --name beschreibung`
3. Client generiert automatisch
4. Seed: `npm run db:seed`

## Testing
- **Test Framework**: vitest (lib/mail/__tests__)
- **Test DB**: Separate Test-Database empfohlen