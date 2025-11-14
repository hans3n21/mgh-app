# AGENTS.md – API Routes

## Konkrete Endpunkte (vorhanden)
```
api/
├── attachments/[id]/route.ts     # Attachment-Download
├── auth/[...nextauth]/route.ts   # NextAuth Handler
├── customers/route.ts            # Customer CRUD
├── datasheets/create/route.ts    # Datasheet-Erstellung
├── feedback/route.ts             # Feedback-System
├── inbox/                        # Mail-Inbox-Operationen
│   ├── assign-order/route.ts
│   ├── create-lead/route.ts
│   ├── create-order/route.ts
│   ├── events/route.ts
│   ├── leads/route.ts
│   ├── link-to-lead/route.ts
│   ├── reply/route.ts
│   ├── templates/route.ts
│   └── update-meta/route.ts
├── mail/
│   ├── health/route.ts           # Mail Health Check
│   └── sync/route.ts             # Mail-Synchronisation
├── mails/
│   ├── [id]/                     # Mail CRUD (5 Handler)
│   ├── route.ts
│   └── unread-count/route.ts
├── orders/
│   ├── [id]/                     # Order CRUD (10 Handler)
│   └── route.ts
├── prices/route.ts               # Preislisten
└── procurement/route.ts          # Beschaffung
```

## Route Handler Pattern
```typescript
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) { }
export async function POST(request: NextRequest) { }
export async function PUT(request: NextRequest) { }
export async function DELETE(request: NextRequest) { }
```

## Request/Response
```typescript
import { NextRequest } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email()
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = schema.parse(body)
    const result = await createData(data)
    return Response.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

## Database Access
```typescript
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({ data: orderData })
    await tx.orderItem.createMany({ data: items })
    return order
  })
  return Response.json(result)
}
```

## Error Handling
- **Struktur**: `{ error: string, details?: any }`
- **Status Codes**: 200, 201, 400, 401, 404, 500
- **Validation**: zod für Request-Body

## Mail Integration (konkret)
- **Health**: `/api/mail/health`
- **Sync**: `/api/mail/sync`
- **IMAP Check**: `npm run imap:check`
- **Manual Sync**: `npm run mail:sync`

## File Uploads
- **Storage**: `uploads/` Verzeichnis
- **Access**: `/api/attachments/[id]`