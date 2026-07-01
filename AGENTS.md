# AGENTS.md – MGH App (Root)

## Ziele
- Reproduzierbares Arbeiten für Menschen & Agenten
- Einheitliche Commands, saubere PRs
- Datenschutz: Keine Kundendaten an externe Dienste ohne Anonymisierung

## Projektüberblick
- **Stack**: Next.js 15.4.6 App Router + React 19 + TypeScript
- **Database**: Prisma + PostgreSQL (via `DATABASE_URL`)
- **Styling**: Tailwind CSS v4
- **Auth**: NextAuth v4 (Credentials-Provider, JWT)
- **Mail**: IMAP (imapflow) + SMTP (nodemailer)
- **Package Manager**: npm (package-lock.json)
- **Node Version**: >=18
- **Testing**: vitest (lib/mail/__tests__)
- **PDF**: jspdf + html2canvas (Datenblätter)
- **Validation**: zod

## Features (Überblick)

### Posteingang / Mail-System
- IMAP-Sync aller aktiven Mail-Accounts
- Mail-Threading (In-Reply-To / References)
- Zitierte Inhalte in Threads werden eingeklappt
- Mails einem Auftrag oder Kunden zuordnen
- Antworten direkt aus der App (SMTP)
- Antwort-Vorlagen (ReplyTemplate)
- Ungelesen-Indikator auf Dashboard, Auftragsübersicht und Kommunikation-Tab

### PII-Anonymisierung (DSGVO)
- **Erkennung**: Regex (E-Mail, Telefon, IBAN, Adresse, PLZ, Kundennr.), DB-Abgleich (Kunden), Kontext-Patterns (Anrede, Grußformel) — international (DE/EN/FR/ES/IT/NL/SE)
- **Review**: Annotierte Textansicht mit manueller Markierung/Entmarkierung
- **Tokenisierung**: PII wird durch Platzhalter ersetzt (z.B. `{{NAME_1}}`, `{{ADRESSE_1}}`)
- **Rehydrierung**: KI-Antwort wird wieder mit Originaldaten aufgefüllt
- **Dateien**: `lib/mail/extraction.ts`, `lib/pii/anonymize.ts`, `lib/pii/tokenizer.ts`

### KI-Integration (extern via N8N-Webhooks)
- Zusammenfassen (`/api/inbox/summarize`)
- Übersetzen (`/api/inbox/translate`)
- Nachricht verfassen (`/api/compose-message`)
- Alle Anfragen werden PII-anonymisiert gesendet, Antworten rehydriert

### Aufträge
- CRUD mit human-readable IDs (ORD-2026-001)
- 8 Auftragstypen (GUITAR, BODY, NECK, REPAIR, PICKGUARD, PICKUPS, ENGRAVING, FINISH_ONLY)
- Spec-Presets pro Auftragstyp (`lib/order-presets.ts`)
- Datenblatt-PDF-Generierung mit Versionierung
- Preis-Kalkulation (OrderItem, OrderExtra)
- Bild-Verwaltung mit Scopes und Lightbox (inkl. PDF-Vorschau)
- Client-seitige Bildkomprimierung vor Upload
- Update-Nachrichten an Kunden (Template konfigurierbar)

### Aufgaben-Delegation (OrderTask)
- Aufgaben an Kollegen delegieren, optional mit Anhängen
- Status: open / done
- Anzeige im Dashboard und im Kommunikations-Tab

### Spracheingabe (Speech-to-Text)
- Web Speech API (de-DE) als Standard
- Konfigurierbar: OpenAI Whisper API als Alternative
- Mikrofon-Button in allen Texteingabefeldern

### Sonstiges
- Kundenverwaltung (Customer CRUD)
- Beschaffung (ProcurementItem)
- WooCommerce-Integration
- Feedback-System
- Backup/Restore (PostgreSQL JSON-Backup)
- Benutzerverwaltung mit Rollen (admin, admin_no_feedback, staff)
- PWA-fähig (Service Worker)
- SSE / Realtime für Posteingang-Updates

## Setup (lokal)
1. Node >=18, PostgreSQL verfügbar
2. `.env` mit `DATABASE_URL` und Mail-Credentials
3. `npm install`
4. `npx prisma migrate dev` (erste Installation)
5. `npm run db:seed`
6. `npm run dev`

## Standard-Commands
| Command | Beschreibung |
|---|---|
| `npm run dev` | Dev-Server (Turbopack) |
| `npm run dev:network` | Dev mit HTTPS + Netzwerkzugriff |
| `npm run build` | Produktions-Build |
| `npm start` | Produktions-Server |
| `npm run start:network` | Produktions-Server (Netzwerk) |
| `npm run lint` | ESLint |
| `npm run db:reset` | DB zurücksetzen + Seed |
| `npm run db:seed` | Seed-Daten laden |
| `npm run db:backup` | PostgreSQL-Backup |
| `npm run smoke` | Smoke Tests |
| `npm run imap:check` | IMAP-Verbindung testen |
| `npm run mail:sync` | Mail-Synchronisation (einmalig) |
| `npm run mail:sync-worker` | Mail-Sync-Worker (dauerhaft) |

## Arbeitsregeln
- **Vor PR**: `npm run lint && npm run build` muss erfolgreich sein
- **Path Aliases**: `@/*` → Root (tsconfig.json)
- **Kein** Editieren von uploads/, .env*, keys/
- **Kein** Push von Secrets

## Projektstruktur
```
app/                    # Next.js App Router (Pages + API)
├── (auth)/             # Auth-Bereich (Login)
├── api/                # 68 API Route Handler
└── app/                # Haupt-App (/app/*)
    ├── customers/      # Kundenverwaltung
    ├── orders/         # Aufträge
    ├── posteingang/    # Mail-Inbox
    ├── prices/         # Preise & Leistungen
    ├── procurement/    # Beschaffung
    └── settings/       # Einstellungen
components/             # React-Komponenten (~45 Dateien)
├── inbox/              # Posteingang-UI (15 Komponenten)
├── spec/               # Spec-Formulare
lib/                    # Business Logic
├── mail/               # Mail-Verarbeitung (20 Module)
├── pii/                # PII-Anonymisierung
├── inbox/              # Inbox-Parsing
├── lang/               # Spracherkennung
prisma/                 # Database
├── schema.prisma       # 26 Models, 3 Enums
├── migrations/         # 12 Migrations
└── seed.ts             # Seed-Daten
scripts/                # Utility-Scripts (19 Dateien)
uploads/                # User-Uploads (NO-TOUCH)
```

## Sicherheit & PII
- **Externe LLMs**: nur mit anonymisierten Daten (PII-Pipeline)
- **Logs**: keine Kundendaten
- **Uploads**: `uploads/` nicht durch Agenten bearbeiten
- **Env-Variablen**: nur `NEXT_PUBLIC_*` im Client-Code
- **Passwörter**: bcrypt-gehasht

## PR-Checkliste
- [ ] `npm run lint` erfolgreich
- [ ] `npm run build` erfolgreich
- [ ] Keine Secrets/PII in Code oder PR-Text
- [ ] DB-Änderungen: Migration erstellt (`npx prisma migrate dev --name beschreibung`)
- [ ] Neue API-Endpunkte in `app/api/AGENTS.md` dokumentiert

## No-Touch-Zonen für Agenten
- `uploads/` (User-Uploads)
- `.next/`, `node_modules/`
- `.env`, `.env.*`, `keys/`
- Datenbank direkt (nur über Prisma CLI)
