# AGENTS.md – API Routes

## Konventionen
- **Pattern**: `app/api/**/route.ts`
- **Methods**: GET, POST, PUT, PATCH, DELETE
- **Response**: `Response.json({ ... })` mit passenden Status-Codes
- **Validation**: zod für Request-Bodies
- **Auth**: NextAuth Session-Check wo nötig
- **DB**: `import { prisma } from '@/lib/prisma'`
- **Error-Format**: `{ error: string, details?: any }`

## Alle Endpunkte (68 Routes)

### Auth
| Route | Methods | Beschreibung |
|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | NextAuth Handler (Login, Session, Callback) |

### Users
| Route | Methods | Beschreibung |
|---|---|---|
| `/api/users` | GET, POST | Alle User auflisten / neuen User anlegen |
| `/api/users/[id]` | GET, PUT, DELETE | User lesen, bearbeiten, löschen |

### Customers
| Route | Methods | Beschreibung |
|---|---|---|
| `/api/customers` | GET, POST | Kundenliste / neuen Kunden anlegen |
| `/api/customers/[id]` | GET, PUT, DELETE | Kunde lesen, bearbeiten, löschen |

### Orders
| Route | Methods | Beschreibung |
|---|---|---|
| `/api/orders` | GET, POST | Auftragsliste / neuen Auftrag anlegen |
| `/api/orders/open` | GET | Nur offene Aufträge |
| `/api/orders/[id]` | GET, PUT, DELETE | Auftrag lesen, bearbeiten, löschen |
| `/api/orders/[id]/acknowledge` | POST | Auftrag als gelesen markieren (OrderView) |
| `/api/orders/[id]/assign` | POST | Auftrag einem Mitarbeiter zuweisen |
| `/api/orders/[id]/spec` | GET, PUT | Auftrags-Specs (OrderSpecKV) |
| `/api/orders/[id]/spec/autofill-from-mail` | POST | Specs automatisch aus Mail-Daten befüllen |
| `/api/orders/[id]/suggestions` | GET, POST | Feld-Vorschläge aus Mail-Extraktion |
| `/api/orders/[id]/items` | GET, POST | Auftrags-Positionen (OrderItem) |
| `/api/orders/[id]/items/[itemId]` | PUT, DELETE | Position bearbeiten/löschen |
| `/api/orders/[id]/extras` | GET, POST | Zusatzkosten (OrderExtra) |
| `/api/orders/[id]/images` | GET, POST | Auftragsbilder hochladen/auflisten |
| `/api/orders/[id]/images/link` | POST | Bestehendes Bild mit Auftrag verknüpfen |
| `/api/orders/[id]/messages` | GET, POST | Nachrichten/Notizen zum Auftrag |
| `/api/orders/[id]/tasks` | GET, POST | Aufgaben (OrderTask) erstellen/auflisten |
| `/api/orders/[id]/tasks/[taskId]` | PUT, DELETE | Aufgabe bearbeiten/löschen |
| `/api/orders/[id]/datasheet/latest` | GET | Neuestes Datenblatt des Auftrags |
| `/api/orders/[id]/woocommerce` | POST | Auftrag an WooCommerce senden |

### Mails (CRUD)
| Route | Methods | Beschreibung |
|---|---|---|
| `/api/mails` | GET | Alle Mails auflisten (mit Filter) |
| `/api/mails/unread-count` | GET | Anzahl ungelesener Mails |
| `/api/mails/[id]` | GET, PUT, DELETE | Mail lesen, bearbeiten, löschen |
| `/api/mails/[id]/reply` | POST | Auf Mail antworten (SMTP) |
| `/api/mails/[id]/forward-datev` | POST | Mail samt Anhaengen an DATEV weiterleiten |
| `/api/mails/[id]/mark-read` | POST | Mail als gelesen markieren |
| `/api/mails/[id]/context` | GET | Kontext-Daten zur Mail (Kunde, Auftrag) |
| `/api/mails/[id]/extraction` | GET, PATCH | PII-Entities extrahieren / manuell bearbeiten |
| `/api/mails/thread/[threadId]` | GET | Alle Mails eines Threads |

### Mail-System
| Route | Methods | Beschreibung |
|---|---|---|
| `/api/mail/sync` | POST | IMAP-Synchronisation auslösen |
| `/api/mail/health` | GET | Mail-System Health Check |
| `/api/mail/send` | POST | E-Mail versenden |
| `/api/mail/trash` | POST | Mail in Papierkorb verschieben |
| `/api/mail/move` | POST | Mail in anderen Ordner verschieben |
| `/api/mail/assign` | POST | Mail einem Auftrag zuweisen |
| `/api/mail/customer/[id]` | GET | Alle Mails eines Kunden |
| `/api/mail/thread/[id]` | GET | Thread-Daten laden |

### Mail-Accounts
| Route | Methods | Beschreibung |
|---|---|---|
| `/api/mail-accounts` | GET, POST | Mail-Accounts auflisten / anlegen |
| `/api/mail-accounts/[id]` | GET, PUT, DELETE | Account bearbeiten/löschen |
| `/api/mail-accounts/[id]/test` | POST | IMAP/SMTP-Verbindung testen |

### Inbox-Aktionen
| Route | Methods | Beschreibung |
|---|---|---|
| `/api/inbox/assign-order` | POST | Mail einem bestehenden Auftrag zuweisen |
| `/api/inbox/create-order` | POST | Neuen Auftrag aus Mail erstellen |
| `/api/inbox/create-lead` | POST | Lead/Interessent aus Mail erstellen |
| `/api/inbox/leads` | GET | Alle Leads auflisten |
| `/api/inbox/link-to-lead` | POST | Mail mit bestehendem Lead verknüpfen |
| `/api/inbox/reply` | POST | Auf Mail antworten (aus Inbox-UI) |
| `/api/inbox/update-meta` | POST | Mail-Metadaten aktualisieren |
| `/api/inbox/events` | GET | Server-Sent Events (Realtime-Updates) |
| `/api/inbox/templates` | GET | Antwort-Vorlagen laden |

### KI-Integration (N8N-Webhooks)
| Route | Methods | Beschreibung |
|---|---|---|
| `/api/inbox/summarize` | POST | Mail zusammenfassen (PII-anonymisiert) |
| `/api/inbox/translate` | POST | Mail übersetzen (PII-anonymisiert) |
| `/api/compose-message` | POST | Nachricht per KI verfassen (PII-anonymisiert) |

### Wissensbasis
| Route | Methods | Beschreibung |
|---|---|---|
| `/api/knowledge` | GET, POST | Globale Wissensbasis lesen und Review-Eintraege anlegen |
| `/api/knowledge/[id]` | PATCH, DELETE | Globalen Wissenseintrag bearbeiten oder loeschen |

### Speech-to-Text
| Route | Methods | Beschreibung |
|---|---|---|
| `/api/voice-to-text` | POST | Audio → Text (OpenAI Whisper Fallback) |

### Datasheets & Attachments
| Route | Methods | Beschreibung |
|---|---|---|
| `/api/datasheets/create` | POST | Neues Datenblatt erstellen |
| `/api/attachments/[id]` | GET | Attachment herunterladen |

### Preise & Beschaffung
| Route | Methods | Beschreibung |
|---|---|---|
| `/api/prices` | GET, POST | Preisliste auflisten / anlegen |
| `/api/prices/[id]` | PUT, DELETE | Preis bearbeiten/löschen |
| `/api/procurement` | GET, POST | Beschaffungsliste |

### Reply-Templates
| Route | Methods | Beschreibung |
|---|---|---|
| `/api/reply-templates` | GET, POST | Antwort-Vorlagen CRUD |
| `/api/reply-templates/[id]` | PUT, DELETE | Vorlage bearbeiten/löschen |

### Admin / System
| Route | Methods | Beschreibung |
|---|---|---|
| `/api/health` | GET | App Health Check |
| `/api/feedback` | GET, POST | Feedback erfassen/auflisten |
| `/api/admin/backup` | GET, POST | Backup erstellen/auflisten |
| `/api/admin/backup/auto` | POST | Automatisches tägliches Backup |
| `/api/admin/restore` | POST | Datenbank aus Backup wiederherstellen |

## Request/Response-Pattern
```typescript
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = schema.parse(body)
    const result = await prisma.customer.create({ data })
    return Response.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

## PII-Flow bei KI-Endpunkten
1. Mail-Text laden + Entities extrahieren (`lib/mail/extraction.ts`)
2. PII tokenisieren → `{{NAME_1}}`, `{{ADRESSE_1}}` etc. (`lib/pii/tokenizer.ts`)
3. Anonymisierten Text an N8N-Webhook senden
4. Antwort rehydrieren → Platzhalter durch Originaldaten ersetzen (`lib/pii/anonymize.ts`)
5. Rehydrierte Antwort an Client zurückgeben

## File Uploads
- **Storage**: `uploads/` Verzeichnis + Vercel Blob
- **Access**: `/api/attachments/[id]`
- **Komprimierung**: Client-seitig via Canvas API vor Upload
