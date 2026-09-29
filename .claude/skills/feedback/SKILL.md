---
name: feedback
description: Feedback aus der MGH-App (PointOut-Widget) in Claude Code abarbeiten – offene Einträge anzeigen, einen Eintrag samt Screenshot und Bedienschritten lesen, umsetzen und als erledigt markieren. Einsetzen bei "/feedback", "/feedback <id>", "was steht im Feedback?", "arbeite das Feedback ab".
argument-hint: "[feedback-id]"
---

# Feedback abarbeiten

Kolleg:innen schicken Feedback über den Knopf unten rechts in der App (PointOut). Es liegt in der Tabelle `Feedback` der **Produktivdatenbank**; Screenshots unter `FILES_ROOT/uploads/feedback/`. Zugriff nur über das Skript, nie direkt per SQL:

```bash
npm run -s feedback                  # offene Einträge
npm run -s feedback -- all           # inkl. erledigte
npm run -s feedback -- show <id>     # Details, Schritte, Screenshot-Pfad
npm run -s feedback -- resolve <id>  # erledigt
npm run -s feedback -- reopen <id>
```

`<id>` darf ein eindeutiger ID-Anfang sein. Im Dashboard kopiert der Knopf neben jedem Eintrag `/feedback <id>`.

## Ablauf

**Ohne ID:** Liste holen und kurz zusammenfassen – gruppiert (Fehler zuerst, dann gleiche Seite/gleiches Thema zusammen), mit Einschätzung, was schnell geht und was eine Rückfrage braucht. Dann fragen, womit angefangen werden soll.

**Mit ID:**
1. `show <id>` ausführen. Gibt es einen Screenshot, die Datei mit dem Read-Tool ansehen – die Markierungen darin zeigen die gemeinte Stelle.
2. Die Seite im Code finden (Pfad wie `/app/orders/ORD-…` → `app/app/orders/[id]/…`). Die „Letzten Schritte“ zeigen, was geklickt wurde und welche JS-Fehler oder fehlgeschlagenen Anfragen es gab – damit nachstellen.
3. Ist unklar, was gemeint ist, oder gibt es mehrere sinnvolle Lösungen: bei Johannes nachfragen, bevor gebaut wird. Altes Feedback (ohne Screenshot, „altes Formular“) ist oft knapp formuliert.
4. Umsetzen wie jede andere Änderung: Regeln aus `AGENTS.md`, `npm run lint`, bei sichtbaren Änderungen im Browser prüfen.
5. Erst **nach** Johannes' Bestätigung `resolve <id>` ausführen – das Häkchen sehen alle Kolleg:innen, auch wenn die Änderung noch nicht auf dem Hauptrechner läuft. Vor Commits fragen.

## Datenschutz

Screenshots und Text können Kundendaten zeigen (Namen, Mails, Aufträge). Nur so viel davon ansehen, wie für das Verständnis nötig ist; Kundendaten nicht in Antworten, Commit-Nachrichten, Code-Kommentare oder Tests übernehmen. In der Zusammenfassung Einträge über Seite und Thema benennen, nicht über Kundennamen.
