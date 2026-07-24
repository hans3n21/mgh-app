# AGENTS.md – Prisma Database

## Konfiguration
- **Provider**: PostgreSQL
- **URL**: `env("DATABASE_URL")`
- **Client**: `lib/prisma.ts` (Singleton)
- **Generator**: prisma-client-js

## Commands
| Command | Beschreibung |
|---|---|
| `npm run db:reset` | DB zurücksetzen + Seed |
| `npm run db:seed` | Seed-Daten laden |
| `npm run db:backup` | PostgreSQL-Backup erstellen |
| `npx prisma generate` | Client generieren |
| `npx prisma migrate dev --name beschreibung` | Neue Migration |
| `npx prisma studio` | DB-Browser |

## Enums (3)

### OrderType
`GUITAR`, `BODY`, `NECK`, `REPAIR`, `PICKGUARD`, `PICKUPS`, `ENGRAVING`, `FINISH_ONLY`

### OrderStatus
`intake`, `quote`, `in_progress`, `finishing`, `setup`, `awaiting_customer`, `complete`, `design_review`

### Role
`admin`, `admin_no_feedback`, `staff`

## Models (26)

### Kern-Models

**User** — Benutzer mit Rollen
| Feld | Typ | Hinweis |
|---|---|---|
| id | String | @id @default(cuid()) |
| name | String | |
| email | String | @unique |
| passwordHash | String | bcrypt |
| role | Role | @default(staff) |
| → | Order[], Message[], OrderView[], OrderTask[] (assignee + creator), MailAccount[], ProcurementItem[] | |

**Customer** — Kunden
| Feld | Typ | Hinweis |
|---|---|---|
| id | String | @id @default(cuid()) |
| name | String | |
| email | String? | |
| phone | String? | |
| addressLine1, postalCode, city, country | String? | country @default("DE") |
| → | Order[], Mail[] | |

**Order** — Aufträge
| Feld | Typ | Hinweis |
|---|---|---|
| id | String | @id, human-readable: ORD-2026-001 |
| title | String | |
| type | OrderType | |
| status | OrderStatus | @default(intake) |
| customerId | String | → Customer |
| assigneeId | String? | → User |
| wcOrderId | String? | WooCommerce-ID |
| finalAmountCents | Int? | Gesamtpreis in Cent |
| paymentStatus | String | @default("open") |
| paymentMethod | String? | |
| → | Customer, User?, OrderSpecKV[], OrderImage[], OrderItem[], Message[], OrderExtra[], Mail[], Datasheet[], OrderView[], OrderTask[], OrderFieldSuggestion[] |

### Auftrags-Details

**OrderSpecKV** — Key-Value Spezifikationen
- `orderId`, `key`, `value`
- Keys aus `lib/order-presets.ts` (z.B. body_shape, neck_wood, finish_body)

**OrderImage** — Auftragsbilder
- `orderId`, `path`, `comment?`, `position`, `attach` (an Kunde senden), `scope?` (body/neck/finish), `fieldKey?`

**OrderItem** — Preis-Positionen
- `orderId`, `priceItemId?`, `label`, `qty`, `unitPrice`, `total`, `notes?`
- → PriceItem (optionale Verknüpfung zur Preisliste)

**OrderExtra** — Zusatzkosten
- `orderId`, `label`, `amountCents`

**OrderView** — Ungelesen-Tracking
- `orderId`, `userId`, `lastSeenAt`, `acknowledgedAt?`
- @@unique([orderId, userId])
- Bestimmt den Ungelesen-Indikator im Dashboard und der Auftragsübersicht

**OrderTask** — Aufgaben-Delegation
- `orderId`, `assigneeId`, `creatorId`, `title`, `note?`
- `status`: "open" | "done"
- `completedAt?`
- Anzeige im Dashboard des zugewiesenen Mitarbeiters

**OrderFieldSuggestion** — Auto-Vorschläge aus Mails
- `orderId`, `field`, `value`, `mailId?`
- `status`: "suggested" | "accepted" | "rejected"
- `acceptedBy?`, `acceptedAt?`

### Mail-System

**MailAccount** — IMAP/SMTP-Konfiguration
- `name`, `email` (@unique), `imapHost/Port/User/Pass`, `smtpHost/Port/User/Pass`
- `isDefault`, `isActive`, `userId?`

**Mail** — E-Mails
| Feld | Typ | Hinweis |
|---|---|---|
| id | String | @id @default(cuid()) |
| messageId | String | @unique (IMAP Message-ID) |
| threadId | String? | Threading |
| accountId | String | → MailAccount |
| uid | Int | IMAP UID |
| folder | String | z.B. "INBOX" |
| subject, fromEmail, fromName | String? | |
| to, cc, bcc | Json | |
| text, html | String? | @db.Text |
| snippet | String? | Vorschau |
| date | DateTime | |
| inReplyTo, references | String?, Json? | Threading |
| orderId, customerId, senderId | String? | Zuordnungen |
| isRead, isDeleted | Boolean | |
| → | MailAccount, Order?, Customer?, User?, Attachment[], MailExtraction? |

**Attachment** — Mail-Anhänge
- `mailId`, `filename`, `mimeType?`, `size`, `path`, `cid?`

**MailExtraction** — PII-Entities pro Mail
- `mailId` (@unique), `entities` (Json)
- Entities-Format: `{ type, text, start, end, confidence, source, pii }`
- Wird bei erstem Öffnen extrahiert und gecached

### Preise & Beschaffung

**PriceItem** — Preisliste
- `category`, `label`, `description?`, `unit?`
- `price?`, `min?`, `max?`, `priceText?`
- `mainCategory?`, `active`

**ProcurementItem** — Beschaffungsliste
- `name`, `qty`, `unit?`, `status` (offen/bestellt/geliefert/archiviert)
- `neededBy?`, `note?`, `link?`, `orderId?`, `createdBy?`, `archivedAt?`

**GlobalKnowledgeEntry** - zentrale Wissensbasis
- `title`, `keywords`, `content`, `category?`
- `status` (`draft`/`review`/`approved`/`archived`), `kiFreigabe`, `isActive`
- Wird von der KI zusaetzlich zu postfachbezogenem `KnowledgeEntry` gelesen
- Konkrete Preise bleiben in `PriceItem`

### Content & Templates

**Datasheet** — Auftragsdatenblätter
- `orderId`, `type`, `fields` (Json), `version`
- Versioniert: neue Version bei jeder Regenerierung

**ReplyTemplate** — Antwort-Vorlagen
- `key` (@unique), `lang` (@default("de")), `subject?`, `body`
- `variables` (Json): Platzhalter-Definitionen

**Feedback** — User-Feedback
- `message`, `page`, `url`, `timestamp`, `userAgent?`
- `resolved`, `resolvedBy?`, `resolvedAt?`

**SystemSetting** — App-Einstellungen
- `key` (@id), `value` (JSON-String)
- z.B. N8N-Webhook-URLs, KI-Konfiguration

### Auth (NextAuth)

**Account** — OAuth-Accounts (NextAuth)
**Session** — Sessions (NextAuth)
**VerificationToken** — Verifizierungs-Tokens (NextAuth)

## Migration History (12 Migrations)
1. `20250811201322_fix_order_creation`
2. `20250812191556_add_wc_order_id`
3. `20250812193652_billing_fields`
4. `20250813095322_add_mail_models`
5. `20250813102740_add_datasheet_model`
6. `20250813132828_add_customer_address`
7. `20250813141040_drop_customer_address_line2`
8. `20250814213059_add_feedback_model`
9. `20250815133259_add_reply_templates`
10. `20250819_add_mail_read_status`
11. `20250822124911_robust_mail_system`
12. `20251010134625_add_datasheet_versioning`

**Hinweis**: Neue Models (OrderView, OrderTask, MailExtraction, OrderFieldSuggestion, SystemSetting) wurden nach der letzten formellen Migration hinzugefügt — Schema-Änderungen ggf. über `prisma db push` oder noch ausstehende Migrations.

## Workflow für Schema-Änderungen
1. `prisma/schema.prisma` bearbeiten
2. `npx prisma migrate dev --name beschreibung`
3. Client wird automatisch generiert
4. Seed aktualisieren falls nötig: `npm run db:seed`
5. `app/api/AGENTS.md` aktualisieren falls neue Endpunkte
