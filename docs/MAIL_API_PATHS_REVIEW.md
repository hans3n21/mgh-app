# Mail API Paths Review

Stand: 2026-06-18

Ziel: Klaeren, welche Funktion die drei Mail-API-Familien haben und welche Pfade aktiv, Infrastruktur oder Legacy/Stubs sind.

## Kurzfazit

Die drei Pfade haben grundsaetzlich unterschiedliche Rollen:

- `/api/mails/*`: Mail-Datenlayer fuer Anzeige, Detail, Reply, Thread, Extraktion und Zuordnung.
- `/api/mail/*`: Mail-Systemlayer fuer IMAP/SMTP-Infrastruktur wie Sync, Move, Send, Trash-Suche.
- `/api/inbox/*`: UI-Helfer fuer die aktuelle Inbox, plus mehrere Konzeptreste aus einem Lead/Thread-Ansatz.

Nicht alles ist doppelt. Es gibt aber Ueberschneidungen bei Assign/Reply/Create-Order, die spaeter vereinheitlicht werden sollten.

## Aktive Hauptverbraucher

| UI / Code | Verwendete API-Pfade | Bewertung |
|---|---|---|
| `components/inbox/InboxPage.tsx` | `/api/mails`, `/api/mails/unread-count`, `/api/mail/sync`, `/api/inbox/events`, `/api/inbox/update-meta` | Aktiver Hauptposteingang |
| `components/inbox/InboxPreview.tsx` | `/api/mails/[id]/mark-read`, `/api/mails/[id]/extraction`, `/api/mails/thread/[threadId]`, `/api/inbox/summarize`, `/api/inbox/translate` | Aktive Mail-Vorschau, KI und PII-Review |
| `components/inbox/ReplyComposer.tsx` | `/api/inbox/templates`, `/api/inbox/translate`, `/api/mails/[id]/reply` | Aktives Antworten aus der Inbox |
| `components/inbox/DatasheetSidebar.tsx` | `/api/inbox/assign-order`, `/api/mails/[id]` | Aktives Zuordnen/Bearbeiten im Sidebar-Kontext |
| `components/MessageSystem.tsx` | `/api/mails/[id]` DELETE | Aktive Auftragskommunikation, Mail-Artefakte entfernen |
| `components/MailAccountManagement.tsx` | `/api/mail/sync` | Sync aus Einstellungen |

## `/api/mails/*`

Rolle: fachlicher Mail-Datenlayer.

| Route | Funktion | Status |
|---|---|---|
| `/api/mails` | Mails listen, filtern, paginieren, optional Threads gruppieren | aktiv |
| `/api/mails/unread-count` | Ungelesen-Zaehler total/pro Account | aktiv |
| `/api/mails/[id]` | Mail lesen, Order-Zuordnung patchen, Mail + verlinkte Artefakte loeschen | aktiv |
| `/api/mails/[id]/reply` | Antwort via SMTP auf bestehende Mail senden | aktiv |
| `/api/mails/[id]/create-order` | Auftrag aus Mail erzeugen und Specs/Artefakte verknuepfen | aktiv, teils von alter Detailroute genutzt |
| `/api/mails/[id]/context` | Kontext fuer Mail: Kunde, offene Auftraege, Typ-/Spec-Vorschlaege | aktiv/nuetzlich, aktuell eher fuer Detail-/Sidebar-Flows |
| `/api/mails/[id]/mark-read` | Read-State einer Mail setzen | aktiv |
| `/api/mails/[id]/extraction` | PII-/Entity-Extraktion laden und manuell korrigieren | aktiv |
| `/api/mails/thread/[threadId]` | Thread-Mails fuer Vorschau laden | aktiv |

Empfehlung: Diese Familie als kanonischen Mail-Datenlayer behalten.

## `/api/mail/*`

Rolle: Infrastruktur fuer Mail-System.

| Route | Funktion | Status |
|---|---|---|
| `/api/mail/sync` | IMAP-Sync starten/status abfragen | aktiv |
| `/api/mail/health` | Mail-Konfiguration pruefen | Infrastruktur |
| `/api/mail/move` | Mail per IMAP in Zielordner bewegen | Infrastruktur, derzeit kaum direkt aus UI genutzt |
| `/api/mail/assign` | Generischer Wrapper um `assignMailToOrder` | potenzieller Adapter/Duplikat |
| `/api/mail/send` | Generischer FormData-Sendepfad | potenzieller Adapter/Duplikat zu Reply-/Message-Flows |
| `/api/mail/trash` | Trash-Suche | nuetzlich fuer Reparatur/Recherche, aktuell nicht sichtbar aktiv |
| `/api/mail/customer/[id]` | Mails eines Kunden laden | nuetzlich, aktuell keine starke UI-Referenz gefunden |
| `/api/mail/thread/[id]` | Thread laden, aelterer Pfad neben `/api/mails/thread/[threadId]` | Duplikat-Kandidat |

Empfehlung: `/api/mail/sync`, `/api/mail/health`, `/api/mail/move` als Systemlayer behalten. Fuer `assign/send/thread/customer/trash` klaeren, ob sie Adapter bleiben oder in `/api/mails/*` aufgehen.

## `/api/inbox/*`

Rolle: UI-Helfer fuer Posteingang. Gemischt mit Konzeptresten.

| Route | Funktion | Status |
|---|---|---|
| `/api/inbox/assign-order` | Mail per Posteingang einem Auftrag zuweisen | aktiv, aber ueberschneidet sich mit `/api/mails/[id]` PATCH und `/api/mail/assign` |
| `/api/inbox/update-meta` | Bulk-Metadaten; aktuell praktisch nur `isRead` | aktiv, aber Star/Tags sind TODO |
| `/api/inbox/events` | SSE fuer Live-Updates | aktiv |
| `/api/inbox/templates` | Kompatibilitaetsroute fuer ReplyComposer, neue Route ist `/api/reply-templates` | aktiv, aber Adapter |
| `/api/inbox/summarize` | KI-Zusammenfassung mit PII-Anonymisierung | aktiv |
| `/api/inbox/translate` | KI-Uebersetzung mit PII-Anonymisierung | aktiv |
| `/api/inbox/create-order` | Antwortet 501, weil angenommene Thread-Funktion nicht passt | Stub/Legacy |
| `/api/inbox/reply` | Antwortet 501, weil `InboxMessage`-Model fehlt | Stub/Legacy |
| `/api/inbox/create-lead` | Antwortet 501, weil Lead/Thread-Models fehlen | Stub/Legacy |
| `/api/inbox/leads` | Antwortet 501, weil Lead-Model fehlt | Stub/Legacy |
| `/api/inbox/link-to-lead` | Antwortet 501, weil `leadId` im Mail-Model fehlt | Stub/Legacy |

Empfehlung: Aktive UI-Helfer behalten. Die 501-Lead/Thread-Stubs nicht weiter ausbauen, solange kein Lead-Konzept fachlich beschlossen ist.

## Vereinheitlichungsvorschlag

Kurzfristig nichts loeschen.

1. Kanonisch festlegen:
   - Mail lesen/listen/thread/extraction/reply: `/api/mails/*`
   - IMAP/SMTP-Systemaktionen: `/api/mail/*`
   - Inbox-spezifische UI-Aggregate/SSE/KI: `/api/inbox/*`
2. 501-Stubs aus sichtbarer UI entfernen, falls noch erreichbar.
3. Doppelte Aktionen spaeter als Adapter behalten oder umleiten:
   - Assign: bevorzugt `/api/mails/[id]` PATCH oder ein zentraler Service `assignMailToOrder`.
   - Reply: bevorzugt `/api/mails/[id]/reply` fuer Antworten auf Mails.
   - Thread: bevorzugt `/api/mails/thread/[threadId]`.
4. Erst nach Build/Smoke und UI-Pruefung alte Routen loeschen.
