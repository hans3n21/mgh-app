# Lokale Mail-KI: Vorschläge, Prüfen, Lernen

Stand 29.09.2026. Alles läuft lokal auf dem Rechner der App; Mailtexte gehen an keinen Cloud-Dienst.
Einrichtung und Betrieb: [services/mail-ai/README.md](../services/mail-ai/README.md).

## Ablauf

1. **Nach dem Mail-Abruf** prüft die App neue Mails im Hintergrund (`lib/mail-ai/background.ts`):
   - Personenangaben mit dem lokalen Analysedienst (GLiNER) zusätzlich zu den Regeln → `MailExtraction` (Quelle `ml`).
   - Kundenmails aktiver Aufträge mit dem lokalen Sprachmodell (Ollama/Gemma) → Auftragsvorschläge
     (Feld, wörtlicher Wert, Absicht, Beleg) als ungeprüfte Markierungen in `MailTrainingReview`.
   - Reihenfolge: zuerst Auftrags-, dann Kundenmails; automatische Absender (noreply, newsletter …) werden übersprungen.
2. **Beim Zuordnen einer Mail zu einem Auftrag** (auch beim Anlegen aus der Mail) werden sie und ihr Gespräch sofort ausgewertet.
3. **Im Auftrag** zeigt die Vorschlagsleiste (`components/SuggestionBanner.tsx`) die Vorschläge mit Belegsatz:
   Übernehmen, Ändern, Erledigt, Falsch erkannt; „Alle Wünsche übernehmen“ für Felder mit genau einem Wunsch.
   Übernommen werden nur Wunsch/Änderung aus dem neuen Mailteil, mit Altwert-Prüfung.
4. **Jede Entscheidung ist ein Lernbeispiel** (Stelle in der Mail + Entscheidung + Bearbeiter, keine Textkopie).
   Trefferquote je Feld: Einstellungen → Lokale Mail-Analyse. Optional bekommt das Modell zwei geprüfte Stellen
   als Beispiel (KI-Training → Lokale Modelle → „Lernbeispiele beifügen“, Kennung `+ex`).

Vor jedem externen KI-Aufruf (Zusammenfassen, Übersetzen, Verfassen) schwärzt `lib/pii/anonymize.ts` den tatsächlich
gesendeten Text inklusive Zitatverlauf: gespeicherte Funde, Regeln und – falls aktiviert – der lokale Analysedienst.

## Trainingsmodus (nur Admins)

Im Posteingang „Trainingsmodus öffnen“ (auch im Papierkorb, dem Archiv). Markierungen für Datenschutz und
Auftragsangaben prüfen, korrigieren, übersehene Stellen markieren; „Lokales Modell prüfen“ erzeugt Vorschläge wie die
Hintergrundprüfung. Korrekturen an Datenschutzstellen aktualisieren `MailExtraction`; manuell verworfene Stellen
werden als `dismissed` gemerkt und von Neuerkennung und Anonymisierung respektiert.

## Datenhaltung

- `MailTrainingReview` (je Mail): Markierungen mit Position, Absicht, Herkunft, Prüfstatus und Verlauf (vorher/nachher,
  Alt-/Neuwert bei Übernahme). Wird beim endgültigen Löschen der Mail mitgelöscht.
- `MailExtraction`: Personenangaben inklusive menschlicher Entscheidungen.
- `AiTrainingCase`/`AiTrainingResult`: aus dem entfernten Codex-Modellvergleich, werden nicht mehr beschrieben; Tabellen bleiben vorerst.
- JSON-Backup und Restore berücksichtigen alle genannten Tabellen.

## Prüfen

```bash
npx vitest run lib/mail-ai lib/mail-training lib/pii lib/ai-training
npx tsx scripts/bench-mail-ai.ts pii
npx tsx scripts/bench-mail-ai.ts fields --model gemma4:e4b
```

Testsatz: `lib/mail-ai/__fixtures__/order-cases.json` (12 erfundene Mails, keine Kundendaten).
