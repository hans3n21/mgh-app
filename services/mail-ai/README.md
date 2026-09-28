# Lokale Mail-Analyse (GLiNER)

Kleiner Dienst, der auf demselben Rechner wie die MGH-App läuft und zwei lokale
Modelle bereitstellt:

- `POST /pii`: Personenangaben mit Position (`fastino/gliner2-privacy-filter-PII-multi`)
- `POST /fields`: Auftragsangaben mit Absicht (`fastino/gliner2.5-multi-v1`), vorbereitet für die Vorschläge
- `GET /health`: Status (`loading`, `ready`, `failed`)

Alle Aufrufe brauchen `Authorization: Bearer <Schlüssel>`. Der Dienst lauscht nur auf
`127.0.0.1`, protokolliert keine Mailinhalte und lädt im Betrieb nichts aus dem Internet
(`HF_HUB_OFFLINE=1`). Das Paket `gliner2` enthält ohne Zusatz nur einen Cloud-API-Client;
installiert und genutzt wird ausschließlich die lokale Ausführung (`gliner2[local]`).

## Einrichten (einmalig, braucht Internet)

```powershell
cd services\mail-ai
.\Start-MailAi.ps1 -Install
```

Installiert Python-Pakete in `.venv` (CPU-PyTorch) und lädt beide Modelle mit festen
Ständen nach `data\models` (zusammen ca. 2,3 GB). Danach ist kein Internet mehr nötig.

## Starten

```powershell
.\Start-MailAi.ps1            # beide Modelle, 2 Threads
.\Start-MailAi.ps1 -NoFields  # nur Personenangaben, spart ca. 1 GB RAM
```

Den Schlüssel aus `data\access-token.txt` in der App unter Einstellungen → Lokale
Mail-Analyse eintragen (Adresse `http://127.0.0.1:8766`), speichern, „Dienst testen“.

## Messwerte (28.09.2026, 12 erfundene Mails, nur CPU)

- Personenangaben: 23 von 24 gefunden, rund 0,5 s je kurzer Mail, 8 s bei 8.000 Zeichen
- Zusammen mit den Regeln werden auch zitierte Mailteile vor einem KI-Versand geschwärzt

Tests ohne Modell: `python -m unittest test_server`
