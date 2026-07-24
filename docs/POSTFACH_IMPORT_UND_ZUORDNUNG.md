# Postfach: Import und Zuordnung (Stand Codebasis)

Dieses Dokument beschreibt **wie E-Mails in die App gelangen** und **wie sie Kunden bzw. Aufträgen zugeordnet werden**. Es ist für Kontext-Prompts (z. B. Verbesserung des Postfachs) gedacht.

---

## 1. Überblick

| Komponente | Rolle |
|------------|--------|
| **IMAP-Sync** | Holt Nachrichten vom Server, parst sie, speichert sie in PostgreSQL, legt Anhänge ab. |
| **Kunden-Zuordnung** | Primär über **Absender-E-Mail** und die **Customer-Tabelle** (nur bei eindeutigem Treffer). |
| **Auftrags-Zuordnung** | Automatisch über **Betreff**, **Thread-Kopf**, **E-Mail des Kunden** (nur INBOX) und später **manuell**; Verknüpfung mit **Kommunikations-Tab** des Auftrags. |

Zentrale Dateien:

- `lib/mail/sync.ts` – Import-Pipeline (`ingestMessage`)
- `lib/mail/threading.ts` – Thread-ID & geerbte `orderId` aus Headern
- `lib/mail/customer.ts` – `findCustomerForEmail`
- `lib/mail/actions.ts` – `assignMailToOrder` (manuelle/logische Erweiterung der Zuordnung)
- `lib/mail/linkArtifacts.ts` – `linkMailArtifactsToOrder` (Auftrags-Kommunikation + Bilder)
- `lib/mail/autoLinkOrder.ts` – zusätzliche Heuristik (siehe Abschnitt 7)

---

## 2. Welche Postfächer werden synchronisiert?

Pro **aktivem** `MailAccount` werden fest diese IMAP-Ordner abgearbeitet:

- `INBOX`
- `Sent`
- `Trash`

(Siehe `syncAccount` in `lib/mail/sync.ts`. Spam/Junk-Ordner sind **nicht** in dieser Liste.)

---

## 3. Wie läuft der technische Import?

### 3.1 Inkrementell vs. erster Lauf

- Pro Account und Ordner existiert ein **Sync-Cursor** in `SystemSetting` unter Keys wie `sync:<accountId>:<Ordnername>`.
- Gespeichert werden u. a. **`lastUid`** und **`uidValidity`**. Wenn sich die UIDVALIDITY am Server ändert, wird der Cursor verworfen → erneuter Abruf ab Anfang.
- **Neue** Nachrichten: IMAP-`FETCH` ab `lastUid + 1` bis `*`.
- Nach jedem Lauf: **`reconcileFolder`** – vergleicht Server-UIDs mit der DB; Mails, die auf dem Server im Ordner nicht mehr existieren, werden **nicht** physisch gelöscht, sondern mit **`isDeleted: true`** markiert (Links zu Auftrag/Kunde bleiben erhalten laut Kommentar im Code).

### 3.2 Auslösung

- API: `POST /api/mail/sync` (optional `fullSync: true` im Body → löscht alle `sync:*`-Cursor, **kompletter Neuabruf** pro Ordner).
- Skripte: `npm run mail:sync`, Worker: `npm run mail:sync-worker`.

### 3.3 Identität einer Mail

- Schlüssel in der DB: **`(accountId, messageId)`** eindeutig (`messageId` aus Header oder stabiler Fallback aus Account/Ordner/UID, damit Resync keine Dubletten erzeugt).
- **Upsert**: Ordnerwechsel (z. B. INBOX → Trash) aktualisiert dieselbe Zeile (`folder`, `uid`, Inhalt/Flags).

### 3.4 Inhalt & Anhänge

- Body: `text`, `html` in `Mail` (große Textfelder).
- Anhänge: `saveAttachment` in `lib/mail/attachments.ts` → **Vercel Blob** (wenn Token gesetzt) sonst **`uploads/mail/<mailId>/`** mit DB-Pfadpräfix `local:…`.
- Nach Speichern: **Entity-Extraktion** (`extractAndStore`) für PII/Chips.
- Wenn `orderId` gesetzt ist: **`linkMailArtifactsToOrder`** (siehe Abschnitt 6).

---

## 4. Kunden-Zuordnung beim Import

**Funktion:** `findCustomerForEmail(fromEmail)` in `lib/mail/customer.ts`.

| Regel | Ergebnis |
|--------|-----------|
| Genau **ein** `Customer` mit gleicher E-Mail (**case-insensitive**) | `customerId` wird gesetzt |
| Kein Treffer oder **mehrere** Treffer | `customerId` bleibt **unset** (mehrdeutig → keine automatische Zuordnung) |

Es gibt **keinen** automatischen Anleg von Kunden nur durch Mail-Eingang in dieser Pipeline.

---

## 5. Auftrags-Zuordnung beim Import (`ingestMessage`)

Reihenfolge und Logik (vereinfacht):

1. **Betreff:** Regex auf Auftrags-ID `ORD-YYYY-NNN` (optional in eckigen Klammern). Wenn ein **Order** mit dieser **id** existiert → `orderId`.
2. **Thread:** `computeThreadId(inReplyTo, references, messageId)` sucht bekannte Mails; wenn der Vorfahr eine `orderId` hat → übernehmen.
3. **Fallback nur für `folderName === 'INBOX'`:** Wenn noch keine `orderId`: suche den **zuletzt angelegten** Auftrag (`orderBy: createdAt desc`), dessen **Kunden-E-Mail** dem **Absender** entspricht (case-insensitive). Erster Treffer gewinnt.

**Wichtig:** Bei **Sent** und **Trash** greift der Kunden-E-Mail-Fallback für neue Aufträge **nicht** – nur Betreff + Thread.

### 5.1 Vererbung innerhalb eines Threads

- Wenn für die neue Mail eine `orderId` ermittelt wurde **und** es ein `threadId` gibt: **`updateMany`** setzt dieselbe `orderId` für alle Mails im Thread, die noch **`orderId: null`** haben. So erscheinen INBOX/Sent/Trash derselben Konversation am Auftrag.

---

## 6. Was passiert bei verknüpftem Auftrag?

**`linkMailArtifactsToOrder(mailId, orderId)`** (`lib/mail/linkArtifacts.ts`):

- Legt im Auftrag eine **`Message`** an (Kommunikations-Tab), falls noch nicht vorhanden, mit Markertoken **`[Mail:<mailId>]`** im Body (idempotent).
- **Eingehende** Anhänge (nicht Sent / nicht `senderId`): für jeden Anhang ein **`OrderImage`** mit Pfad `/api/attachments/<id>`, falls noch nicht vorhanden.

Bei **Wechsel** des Auftrags auf einer Mail werden alte Artefakte am **vorherigen** Auftrag bereinigt (Mail-Nachricht mit Token, „Mail-Anhang“-Bilder).

---

## 7. Zusätzliche Auto-Verknüpfung (Modul, wenig angebunden)

**Datei:** `lib/mail/autoLinkOrder.ts` – **`autoLinkOrderForMail(mailId)`**:

1. Parsed Mail-Text/HTML nach **Ordernummer** (`parseMail` + Regex `ORD-…`).
2. Sonst: wenn `fromEmail` einem Kunden entspricht und dieser **genau einen nicht-`complete`-Auftrag** hat → diesem Auftrag zuweisen.

**Hinweis:** Im aktuellen Repo wird diese Funktion **nicht** aus API-Routen aufgerufen (nur definiert). Die **Haupt-Auto-Logik** beim Ankommen der Mail ist **`ingestMessage`**, nicht dieses Modul.

---

## 8. Manuelle / UI-Zuordnung

| Mechanismus | Verhalten |
|-------------|-----------|
| **`PATCH /api/mails/[id]`** mit `{ orderId }` | Lädt `customerId` vom Auftrag; ruft **`assignMailToOrder`**; bei gesetztem Auftrag **`linkMailArtifactsToOrder`**. |
| **`POST /api/mail/assign`** | Body: `mailId`, `orderId`, optional `customerId` → **`assignMailToOrder`**. |
| **`POST /api/inbox/assign-order`** | `messageId` (= Mail-Primary-Key `id`), `orderId` → Update + **`linkMailArtifactsToOrder`**. |

### 8.1 `assignMailToOrder` (Besonderheit)

Nach dem Setzen von `orderId` auf der Mail:

1. **Alle Mails mit gleichem `threadId`** erhalten dieselbe **`orderId`**.
2. **Zusätzliche Heuristik:** Gleicher **Account**, normalisierter **Betreff** (ohne Re:/AW:/…), **Überlappung der Beteiligten** (From/To) im Zeitfenster **±12 Monate** um das Datum der Mail → weitere Mails ohne `orderId` werden mitverknüpft (für Fälle mit kaputten Thread-Headern).

---

## 9. Grenzen & typische Lücken (für Prompt-Design relevant)

- **Kunde:** keine Zuordnung bei mehreren Datensätzen mit gleicher E-Mail.
- **Auftrag beim Import:** INBOX-Fallback nimmt **immer den jüngsten** Auftrag des Kunden – bei mehreren parallelen Aufträgen oft **falsch**, wenn keine ORD-Nummer im Betreff steht.
- **Sent/Trash:** kein „neuester Auftrag per Kundenmail“-Fallback.
- **Volumen:** erster Sync oder `fullSync` lädt den **gesamten** Ordnerinhalt (historisch) – kein eingebautes Datums-Limit im Sync.
- **Spam:** nicht Teil der Standard-Sync-Ordner; alles was in INBOX landet, wird importiert.
- **`autoLinkOrderForMail`:** Heuristik für „ein offener Auftrag“ existiert, ist aber **nicht** in der Sync-Pipeline verdrahtet.

---

## 10. Begriffe für Prompts

- **„Import“** = IMAP-Sync → `Mail`-Zeile + optional `Attachment`, Extraktion, ggf. `linkMailArtifactsToOrder`.
- **„Kunde“** = Relation `Mail.customerId` aus eindeutiger E-Mail-Zuordnung.
- **„Auftrag“** = Relation `Mail.orderId`; zusätzlich können **`Order.message`** und **`Order.orderImage`** aus der Mail befüllt werden.
- **„Thread“** = `threadId` über `In-Reply-To` / `References`; Vererbung der `orderId` an den ganzen Thread.

---

*Generiert als Architektur-Snapshot; bei Schema- oder Code-Änderungen dieses Dokument anpassen.*
