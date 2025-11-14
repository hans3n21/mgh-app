# AGENTS.md – App Directory (Next.js App Router)

## Struktur (konkret vorhanden)
```
app/
├── (auth)/           # Route Groups
│   ├── layout.tsx    # Auth Layout
│   └── signin/page.tsx
├── api/              # API Route Handlers
├── app/              # Haupt-App-Bereich
│   ├── customers/
│   ├── orders/
│   ├── posteingang/
│   ├── prices/
│   ├── procurement/
│   └── settings/
├── layout.tsx        # Root Layout
├── page.tsx          # Homepage
└── globals.css
```

## Routing-Konventionen
- **page.tsx** = Route
- **layout.tsx** = Shared Layout
- **route.ts** = API Handler (GET, POST, PUT, DELETE)
- **(auth)/** = Route Group (Layout ohne URL)

## Server vs Client Components
- **Standard**: Server Components
- **Client**: `"use client"` nur bei:
  - useState, useEffect, onClick
  - Browser-APIs (localStorage, window)
  - Event Handler

## API Routes (`app/api/`)
```typescript
// Handler Pattern
export async function GET(request: NextRequest) {
  return Response.json({ data })
}

// Dynamic Routes
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return Response.json(await getData(params.id))
}
```

## Konkrete API-Endpunkte
- `/api/attachments/[id]` - Attachment-Download
- `/api/auth/[...nextauth]` - NextAuth Handler
- `/api/customers` - Customer CRUD
- `/api/datasheets/create` - Datasheet-Erstellung
- `/api/feedback` - Feedback-System
- `/api/inbox/*` - Mail-Inbox-Operationen
- `/api/mail/*` - Mail-Sync & Health
- `/api/mails` - Mail CRUD
- `/api/orders` - Order CRUD
- `/api/prices` - Preislisten
- `/api/procurement` - Beschaffung

## Path Aliases
- `@/*` = Root-Verzeichnis
- `@/components/*` = `components/*`
- `@/lib/*` = `lib/*`

## Styling
- **Tailwind CSS**: Utility-first, keine Inline-Styles
- **Global**: `app/globals.css`