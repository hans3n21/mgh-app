# Whisper Voice-to-Text Setup für QNAP TS-432X

## Überblick

Dieses Setup ermöglicht Voice-to-Text direkt auf deinem QNAP NAS mit Whisper.cpp.

## Voraussetzungen

- QNAP TS-432X mit Container Station installiert
- Docker und Docker Compose Support
- Mindestens 2 GB freier RAM für Whisper

## Installation

### 1. Whisper Container starten

Der Whisper-Container ist bereits in der `docker-compose.yml` konfiguriert.

```bash
# Auf dem QNAP NAS (via SSH oder Container Station Terminal)
cd /share/Container/mgh-app

# Whisper-Container starten
docker-compose up -d whisper

# Logs überprüfen
docker-compose logs -f whisper
```

### 2. Modell-Download warten

Beim ersten Start lädt Whisper das Modell herunter (ca. 150 MB für "base").
Das kann 2-5 Minuten dauern.

**Verfügbare Modelle (in docker-compose.yml änderbar):**
- `tiny` - 75 MB, schnell, weniger genau
- `base` - 150 MB, guter Kompromiss (STANDARD)
- `small` - 500 MB, besser für Deutsch
- `medium` - 1.5 GB, sehr gut, aber langsamer
- `large` - 3 GB, beste Qualität (braucht viel RAM!)

### 3. Whisper API testen

```bash
# Via curl (ersetze <QNAP-IP> mit deiner NAS-IP)
curl http://<QNAP-IP>:9000/

# Sollte antworten mit: "Whisper ASR Webservice is up and running!"
```

### 4. Test-Aufnahme

Du kannst Whisper mit einer Test-Audiodatei testen:

```bash
# Beispiel mit einer WAV-Datei
curl -X POST -F "audio_file=@test.wav" http://<QNAP-IP>:9000/asr?task=transcribe&language=de&output=json
```

**Erwartete Antwort:**
```json
{
  "text": "Transkribierter Text hier"
}
```

## Integration in MGH-App

Die App nutzt die Whisper-API automatisch, wenn die Umgebungsvariable gesetzt ist:

```bash
# In .env.local auf dem QNAP
WHISPER_API_URL="http://whisper:9000"
```

**Hinweis:** Innerhalb des Docker-Netzwerks nutzt die App `http://whisper:9000` (Container-Name).
Von außerhalb nutzt du `http://<QNAP-IP>:9000`.

## Performance-Tuning

### Modell wechseln (für bessere Qualität)

In `docker-compose.yml`:

```yaml
whisper:
  environment:
    - ASR_MODEL=small  # Besser für Deutsch
```

Dann Container neu starten:

```bash
docker-compose down whisper
docker-compose up -d whisper
```

### Für ARM-Optimierung

Der Container nutzt automatisch ARM-optimierte Builds.
Falls es Performance-Probleme gibt, kannst du auf `tiny` oder `base` zurückwechseln.

## Troubleshooting

### Container startet nicht

```bash
# Logs checken
docker-compose logs whisper

# Container Status
docker-compose ps
```

### Modell lädt nicht

```bash
# Whisper-Cache löschen und neu starten
rm -rf ./whisper-cache/*
docker-compose restart whisper
```

### Speicherprobleme (OOM)

Falls der Container wegen Speichermangel abstürzt:

```yaml
whisper:
  environment:
    - ASR_MODEL=tiny  # Kleineres Modell nutzen
  deploy:
    resources:
      limits:
        memory: 1G  # RAM-Limit setzen
```

### Langsame Transkription

Das ist normal auf ARM-CPUs ohne GPU. Erwartete Zeiten:
- 10 Sekunden Audio = 5-15 Sekunden Verarbeitung (base)
- 10 Sekunden Audio = 2-5 Sekunden (tiny)

## Nächste Schritte

1. Voice-Input-Button in der App implementieren
2. N8N Workflow für Text-Verschönerung erstellen
3. Integration testen

Siehe `docs/VOICE_FEATURE.md` für die Frontend-Integration.
