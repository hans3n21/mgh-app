# AGENTS.md – App Directory (Next.js App Router)

## Routing

### URLs
| URL | Seite | Auth |
|---|---|---|
| `/` | Redirect → `/app` oder `/signin` | - |
| `/signin` | Login (E-Mail/Passwort) | nein |
| `/app` | Dashboard | ja |
| `/app/orders` | Auftragsliste | ja |
| `/app/orders/[id]` | Auftragsdetail | ja |
| `/app/customers` | Kundenverwaltung | ja |
| `/app/prices` | Preise & Leistungen | ja |
| `/app/procurement` | Beschaffung | ja |
| `/app/settings` | Einstellungen | ja |
| `/app/posteingang` | E-Mail-Inbox | ja |
| `/app/posteingang/[id]` | Mail-Detail | ja |

### Verzeichnisstruktur
```
app/
├── page.tsx                    # Redirect (eingeloggt → /app)
├── layout.tsx                  # Root: HTML, Fonts, PWA-Meta, Service Worker
├── globals.css                 # Tailwind + Custom Styles
│
├── (auth)/                     # Route Group (kein /auth/ im URL)
│   ├── layout.tsx              # SessionProvider (session=null)
│   └── signin/page.tsx         # Login-Formular
│
├── api/                        # 68 API Route Handler (siehe api/AGENTS.md)
│
└── app/                        # Haupt-App (/app/*)
    ├── layout.tsx              # Auth-Guard, Navigation, Mobile-Nav, Auto-Backup
    ├── page.tsx                # Dashboard (Server) → DashboardClient
    ├── DashboardClient.tsx     # Dashboard: Aufträge, Tasks, Ungelesen-Count
    │
    ├── orders/
    │   ├── page.tsx            # Auftragsliste (Server) → OrderList
    │   └── [id]/
    │       ├── page.tsx        # Auftragsdetail (Server) → OrderDetailClient
    │       ├── OrderDetailClient.tsx  # Tabs, Specs, Bilder, Nachrichten
    │       └── OrderHeader.tsx        # Header mit Status, Zuweisung
    │
    ├── customers/
    │   ├── page.tsx            # Kundenverwaltung (Server)
    │   └── CustomersClient.tsx # Kundenliste, CRUD
    │
    ├── prices/
    │   ├── page.tsx            # Preise (Server)
    │   ├── PricesClient.tsx    # (Legacy)
    │   └── PricesClientNew.tsx # Preisliste mit Kategorien
    │
    ├── procurement/
    │   ├── page.tsx            # Beschaffung (Server)
    │   └── ProcurementClient.tsx # Beschaffungsliste, Status-Tracking
    │
    ├── settings/
    │   └── page.tsx            # Einstellungen (User, Mail, Templates, Backup, Speech)
    │
    └── posteingang/
        ├── page.tsx            # Inbox (Server) → InboxClient
        ├── InboxClient.tsx     # Wrapper für InboxPage
        ├── InlineSpecEditor.tsx # Inline-Spec-Editor im Posteingang
        ├── [id]/page.tsx       # Mail-Detailansicht
        └── components/
            ├── AttachmentsPanel.tsx    # Anhänge-Übersicht
            ├── MailContent.tsx         # Mail-Text-Anzeige
            ├── OrderChooseAndEdit.tsx  # Auftrag auswählen
            ├── OrderSideSheet.tsx      # Auftrags-Seitensheet
            └── ReplyComposer.tsx       # Antwort-Editor
```

## Konventionen

### Server vs Client Components
- **Standard**: Server Components (direkter DB-Zugriff via Prisma)
- **"use client"** nur bei: useState, useEffect, onClick, Browser-APIs
- **Pattern**: `page.tsx` (Server) lädt Daten → rendert `*Client.tsx` (Client)

### Path Aliases
- `@/*` → Root-Verzeichnis (`tsconfig.json`)
- `@/components/*`, `@/lib/*`, `@/app/*`

### Styling
- **Tailwind CSS v4**: Utility-first
- **Dark Mode**: Standard (bg-slate-950, text-slate-100)
- **Keine** Inline-Styles oder CSS-Module

## Komponenten-Architektur

### `components/` (Shared Components)

#### Inbox (15 Dateien) — `components/inbox/`
| Komponente | Beschreibung |
|---|---|
| `InboxPage.tsx` | Hauptlayout: Toolbar, Liste, Preview, Auto-Sync (SSE) |
| `InboxList.tsx` | Virtuell scrollbare Mail-Liste mit Status-Indikatoren |
| `InboxPreview.tsx` | Mail-Vorschau: Text, Chips, PII-Annotation, ReplyComposer |
| `InboxToolbar.tsx` | Suche, Filter, Ordner-Auswahl, Sync-Button |
| `InboxActions.tsx` | Lead erstellen, Auftrag zuweisen |
| `AnnotatedMailText.tsx` | PII-markierter Mail-Text mit manuellem Markieren/Entmarkieren |
| `EntityContextMenu.tsx` | Kontextmenü für PII-Entities (Legacy, ersetzt durch AnnotatedMailText-Popup) |
| `ReplyComposer.tsx` | Antwort-Editor mit Vorlagen, Spracheingabe |
| `ParsedChips.tsx` | Extrahierte Felder als Chips (Drag & Drop) |
| `DatasheetSidebar.tsx` | Datenblatt-Sidebar mit Typ-Vorschlägen |
| `OrderDatasheetForm.tsx` | Spec-Formular im Posteingang |
| `OrderImages.tsx` | Bildverwaltung mit Carousel-Modal |
| `OrderPricing.tsx` | Preiskalkulation im Posteingang |
| `EmptyState.tsx` | Leerer Zustand (keine Mails) |
| `RowSkeleton.tsx` | Loading-Skeleton für Mail-Zeilen |

#### Aufträge & Specs
| Komponente | Beschreibung |
|---|---|
| `OrderDetailTabs.tsx` | Tab-Ansicht (Status, Specs, Positionen, Bilder, Nachrichten) |
| `OrderDetailTabsNew.tsx` | Erweiterte Tabs mit Presets und Validierung |
| `OrderSpecsSidebar.tsx` | Spec-Sidebar für Auftragsdetails |
| `OrderList.tsx` | Auftragsliste mit Filter und Löschen |
| `CreateOrderButton.tsx` | Button/Modal für neuen Auftrag |
| `DeleteOrderButton.tsx` | Lösch-Button mit Bestätigung |
| `OpenOrdersModal.tsx` | Modal zur Auftragsauswahl |
| `ItemsManager.tsx` | Positions-Verwaltung (Preis, Menge) |
| `spec/SpecFormCompact.tsx` | Kompaktes Spec-Formular |
| `specs/SpecForm.tsx` | Vollständiges Spec-Formular |

#### Kommunikation & Medien
| Komponente | Beschreibung |
|---|---|
| `MessageSystem.tsx` | Chat-System: Nachrichten, E-Mail, Notizen, PDF-Export, Spracheingabe |
| `ImageCarouselModal.tsx` | Lightbox: Bilder-Galerie mit PDF-iframe-Unterstützung |
| `ImageUploader.tsx` | Bild-Upload mit Scope-Zuordnung |
| `DatasheetPDFGenerator.tsx` | PDF-Generator für Datenblätter |
| `SuggestionBanner.tsx` | Auto-Vorschläge aus Mails |

#### Einstellungen
| Komponente | Beschreibung |
|---|---|
| `UserManagement.tsx` | Benutzerverwaltung (CRUD, Rollen) |
| `MailAccountManagement.tsx` | Mail-Account-Verwaltung (IMAP/SMTP) |
| `ReplyTemplateManagement.tsx` | Antwort-Vorlagen verwalten |
| `BackupManagement.tsx` | Backup erstellen/wiederherstellen |
| `SpeechSettings.tsx` | Spracherkennung konfigurieren |
| `UpdateTemplateSettings.tsx` | Update-Vorlage konfigurieren |

#### Input-Komponenten
| Komponente | Beschreibung |
|---|---|
| `VoiceInputButton.tsx` | Mikrofon-Button (Web Speech API / Whisper) |
| `AutoFillInput.tsx` | Input mit Datalist-Autocomplete |
| `PickguardInput.tsx` | Ja/Nein + Details für Pickguard |
| `BindingInput.tsx` | Ja/Nein + Details für Binding |
| `NeckBindingInput.tsx` | Ja/Nein + Details für Hals-Binding |
| `BatteryCompartmentInput.tsx` | Ja/Nein + Details für Batteriefach |
| `SpokewheelInput.tsx` | Ja/Nein für Spokewheel |

#### Layout & Navigation
| Komponente | Beschreibung |
|---|---|
| `Navigation.tsx` | Hauptnavigation (Sidebar), Logout, Unread-Badge |
| `GlobalMobileNav.tsx` | Mobile Navigation |
| `SessionProvider.tsx` | NextAuth SessionProvider-Wrapper |
| `FeedbackButton.tsx` | Feedback-Button (floating) |
| `FeedbackDashboard.tsx` | Feedback-Übersicht (Admin) |

## Wichtige Libs

### `lib/mail/` — Mail-Verarbeitung (20 Module)
| Modul | Beschreibung |
|---|---|
| `sync.ts` | IMAP-Sync aller aktiven Accounts |
| `threading.ts` | Thread-Zuordnung (In-Reply-To/References) |
| `actions.ts` | Reply senden, Trash |
| `sendMail.ts` | SMTP-Versand |
| `client.ts` | IMAP/SMTP-Client Singletons |
| `extraction.ts` | Entity-Erkennung (Regex + DB + Kontext) |
| `parseMail.ts` | Structured Parsing (InstrumentType, Specs) |
| `buildSuggestions.ts` | Spec-Vorschläge mit Confidence-Scoring |
| `suggestOrderType.ts` | Auftragstyp-Vorschlag aus Mail-Inhalt |
| `attachments.ts` | Anhang-Speicherung (Vercel Blob) |
| `customer.ts` | Kunden-Zuordnung per E-Mail |
| `autoLinkOrder.ts` | Auto-Verknüpfung Mail→Auftrag |
| `ensureOrderFromMail.ts` | Order aus Mail erstellen |
| `linkArtifacts.ts` | Mail-Inhalt mit Order verknüpfen |
| `mapToDatasheet.ts` | ParsedData → Datenblatt |
| `migrateSpecKV.ts` | Spec-Key Normalisierung |
| `account.ts` | Default Mail-Account |

### `lib/pii/` — PII-Anonymisierung
| Modul | Beschreibung |
|---|---|
| `anonymize.ts` | Orchestrierung: Entities laden → Tokenisieren → Rehydrieren |
| `tokenizer.ts` | Text-Platzhalter: `{{NAME_1}}`, `{{ADRESSE_1}}` etc. |

### `lib/` — Sonstige
| Modul | Beschreibung |
|---|---|
| `prisma.ts` | Prisma Client Singleton |
| `auth.ts` | NextAuth Konfiguration |
| `logger.ts` | JSON-Logging |
| `realtime.ts` | SSE Pub/Sub für Inbox-Updates |
| `woocommerce.ts` | WooCommerce REST API Integration |
| `order-presets.ts` | Auftragstyp-Presets (Felder, Kategorien, Labels) |
| `autofill-data.ts` | Autovervollständigung für Spec-Felder |
| `backup-auto.ts` | Auto-Backup Logik |
| `restore-json.ts` | DB-Wiederherstellung aus JSON |
| `lang/detectLang.ts` | Spracherkennung (DE/EN) |
