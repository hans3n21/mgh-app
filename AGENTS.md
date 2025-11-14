# AGENTS.md – MGH App (Root)

## Ziele
- Reproduzierbares Arbeiten für Menschen & Agenten
- Einheitliche Commands, saubere PRs
- Datenschutz: Keine Kundendaten an externe Dienste ohne Anonymisierung

## Projektüberblick
- **Stack**: Next.js 15.4.6 App Router + React 19 + TypeScript
- **Database**: Prisma + SQLite (dev.db)
- **Styling**: Tailwind CSS v4
- **Package Manager**: npm (package-lock.json)
- **Node Version**: >=18
- **Testing**: vitest (lib/mail/__tests__)

## Setup (lokal)
1. Node >=18 installiert
2. `npm install`
3. `npm run db:reset` (erste Installation)
4. `npm run dev`

## Standard-Commands
- **Install**: `npm install`
- **Dev**: `npm run dev`
- **Build**: `npm run build`
- **Start**: `npm start`
- **Lint**: `npm run lint`
- **DB Reset**: `npm run db:reset`
- **DB Seed**: `npm run db:seed`
- **Scripts**: `npm run smoke`, `npm run imap:check`, `npm run mail:sync`

## Arbeitsregeln
- **Vor PR**: `npm run lint && npm run build` muss erfolgreich sein
- **Path Aliases**: `@/*` → Root (tsconfig.json)
- **Kein** Editieren von uploads/, .env*, keys/
- **Kein** Push von Secrets

## Next.js App Router
- **Server Components** sind Standard
- **"use client"** nur für Interaktivität
- **Route Handler**: `app/api/**/route.ts`
- **Pages**: `app/**/page.tsx`

## Prisma/Database
- **Schema**: `prisma/schema.prisma` (SQLite dev.db)
- **Generate**: automatisch nach `npm install`
- **Client**: `lib/prisma.ts`
- **Seed**: `npm run db:seed`

## Sicherheit & PII
- **Externe LLMs**: nur mit anonymisierten Daten
- **Logs**: keine Kundendaten
- **Uploads**: `uploads/` nicht durch Agenten bearbeiten
- **Env-Variablen**: nur `NEXT_PUBLIC_*` im Client-Code

## Scripts (konkret vorhanden)
- `scripts/imap-check.ts` - IMAP-Verbindung testen
- `scripts/manual-sync.ts` - Mail-Synchronisation
- `scripts/smoke.ts` - Smoke Tests

## PR-Checkliste
- [ ] `npm run lint` erfolgreich
- [ ] `npm run build` erfolgreich
- [ ] Keine Secrets/PII in Code oder PR-Text
- [ ] DB-Änderungen dokumentiert (falls Schema geändert)

## No-Touch-Zonen für Agenten
- `uploads/` (User-Uploads)
- `.next/`, `node_modules/`
- `prisma/dev.db` (nur über Prisma CLI)