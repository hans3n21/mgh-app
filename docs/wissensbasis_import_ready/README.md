# Wissensbasis Import Ready

Diese Dateien sind aus `docs/wissensbasis/*.md` abgeleitete, preisbereinigte KI-Wissensquellen.

## Zweck

- Redaktionelle Originaldateien bleiben unveraendert.
- Konkrete Preise, Versandkosten und Mindestbetraege bleiben Review-Quelle, aber nicht dauerhafte KI-Wahrheit.
- Regeln, Ablaeufe, Rueckfragen und Sprachlogik koennen nach Pruefung als `KnowledgeEntry` importiert werden.

## Import

Dry-run:

```bash
npm run knowledge:sync -- --mail-account-id cmmepxgcl000161pglisrfl7f --dir docs/wissensbasis_import_ready
```

Apply als inaktives Review-Wissen:

```bash
npm run knowledge:sync -- --mail-account-id cmmepxgcl000161pglisrfl7f --dir docs/wissensbasis_import_ready --apply
```

Die Dateien enthalten ausschliesslich preisbereinigte Regeltexte. Freigegebene Dateien stehen auf `status: approved` und `ki_freigabe: true`; konkrete Preislisten, Versandkosten und Mindestbetraege bleiben in den redaktionellen Originalen bzw. in `docs/STRUCTURED_VALUES_REVIEW.md`.
