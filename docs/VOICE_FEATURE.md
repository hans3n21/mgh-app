# Voice-to-Text Feature - Setup & Nutzung

## Überblick

Mitarbeiter können in der Kommunikation-Ansicht eines Auftrags Sprachnachrichten aufnehmen, die automatisch in Text umgewandelt werden. Optional kann der Text dann via N8N professionalisiert werden.

## Workflow

```
1. Mitarbeiter klickt 🎤-Button
2. Spricht Nachricht ein
3. Audio → Whisper API (auf QNAP)
4. Text wird in Textarea eingefügt
5. Optional: "Text verbessern" via N8N
6. Nachricht senden
```

## Installation

### Schritt 1: Whisper auf QNAP einrichten

```bash
# Via SSH auf QNAP
cd /share/Container/mgh-app

# docker-compose.yml wurde bereits erweitert
# Whisper-Container starten
docker-compose up -d whisper

# Logs prüfen (Modell-Download dauert 2-5 Min)
docker-compose logs -f whisper
```

**Erwartete Ausgabe:**
```
whisper-stt | Downloading model 'base'...
whisper-stt | Model loaded successfully
whisper-stt | Server running on http://0.0.0.0:9000
```

### Schritt 2: Umgebungsvariable setzen

In `.env.local` auf dem QNAP:

```bash
# Whisper API (Container-internes Netzwerk)
WHISPER_API_URL="http://whisper:9000"

# Optional: N8N für Text-Verschönerung
N8N_WEBHOOK_URL="https://your-n8n.com/webhook/compose-message"
```

### Schritt 3: App neu deployen

```bash
# Auf QNAP
cd /share/Container/mgh-app
docker-compose down
docker-compose up -d
```

## Verwendung

### In der App

1. Auftrag öffnen → Tab "Kommunikation"
2. Neue Nachricht schreiben
3. 🎤-Button klicken
4. Sprechen (z.B. "Kunde hat angerufen, Material verzögert, neue Lieferzeit Kalenderwoche fünfzehn")
5. Stopp-Button klicken
6. Text wird automatisch eingefügt
7. Optional bearbeiten oder direkt senden

### Browser-Berechtigungen

Beim ersten Mal fragt der Browser nach Mikrofon-Zugriff.

**Wichtig:** HTTPS ist erforderlich für Mikrofon-Zugriff (außer localhost).

## Technische Details

### Unterstützte Audio-Formate

- WebM (Browser-Standard)
- Whisper konvertiert automatisch

### Sprachen

Standardmäßig Deutsch (`de`), kann in der Komponente geändert werden:

```typescript
<VoiceInputButton
  language="en" // oder "de", "fr", "es", etc.
  onTranscript={(text) => ...}
/>
```

### Performance

**Whisper Base Model auf TS-432X:**
- 10 Sekunden Audio = ~8-12 Sekunden Verarbeitung
- 30 Sekunden Audio = ~25-40 Sekunden Verarbeitung

**Schneller mit `tiny` Model:**

In `docker-compose.yml`:
```yaml
whisper:
  environment:
    - ASR_MODEL=tiny  # statt base
```

Dann `docker-compose restart whisper`

## Troubleshooting

### Button macht nichts

**Browser-Konsole prüfen:**
```
F12 → Console
```

**Häufige Fehler:**
- `NotAllowedError`: Mikrofon-Berechtigung verweigert
- `NotFoundError`: Kein Mikrofon gefunden
- `NotSecureContext`: HTTP statt HTTPS (außer localhost)

**Lösung:**
- Berechtigungen prüfen (Browser-Einstellungen → Mikrofon)
- HTTPS nutzen oder via localhost testen

### Whisper API nicht erreichbar

```bash
# Auf QNAP: Container-Status prüfen
docker ps | grep whisper

# Sollte "Up" sein, z.B.:
# whisper-stt   Up 10 minutes   0.0.0.0:9000->9000/tcp

# Logs prüfen
docker logs whisper-stt

# Von QNAP aus testen
curl http://localhost:9000/
# Sollte antworten: "Whisper ASR Webservice is up and running!"
```

### Schlechte Transkriptions-Qualität

**Optionen:**

1. **Größeres Modell** (besser, aber langsamer):
   ```yaml
   # docker-compose.yml
   whisper:
     environment:
       - ASR_MODEL=small  # statt base
   ```

2. **Sprache explizit setzen** (hilft bei Dialekten):
   ```typescript
   <VoiceInputButton language="de" />
   ```

3. **Deutlich sprechen:**
   - Nicht zu schnell
   - Klare Aussprache
   - Ruhige Umgebung

### Audio-Datei zu groß

Falls Aufnahmen länger als 1 Minute:

In `app/api/voice-to-text/route.ts` kann man Limits setzen.

**Empfehlung:** Mehrere kurze Aufnahmen statt einer langen.

## N8N Text-Verschönerung (Optional)

### Setup

1. N8N Workflow erstellen (siehe `N8N_WORKFLOW.md`)
2. Webhook-URL in `.env.local` eintragen
3. App-Container neu starten

### Automatische Nutzung

Nach Voice-Transkription könnte man automatisch N8N aufrufen:

```typescript
// In VoiceInputButton.tsx nach erfolgreicher Transkription
const improveText = async (rawText: string) => {
  const res = await fetch('/api/compose-message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: rawText }),
  });
  const data = await res.json();
  return data.text || rawText;
};
```

### Manueller "Verbessern"-Button

Kann in `MessageSystem.tsx` ergänzt werden (siehe N8N_WORKFLOW.md).

## Sicherheit

### Datenschutz

**Whisper läuft lokal auf dem NAS:**
- Kein Cloud-Service
- Keine Daten verlassen das NAS
- DSGVO-konform

**N8N (optional):**
- Wenn N8N lokal läuft: Auch DSGVO-konform
- Cloud-LLM (OpenAI/Claude): Daten werden extern verarbeitet
  → Ggf. Kunden informieren oder Self-Hosted LLM nutzen (Ollama)

### HTTPS

Für Produktion **unbedingt HTTPS** nutzen:

**Option A: Reverse Proxy (nginx/Caddy)**
```nginx
server {
    listen 443 ssl;
    server_name mgh.your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:4000;
    }
}
```

**Option B: Cloudflare Tunnel**
- Kostenlos
- Automatisches SSL
- Kein Port-Forwarding nötig

## Erweiterungen

### 1. Sprachauswahl

Dropdown vor Voice-Button:

```typescript
const [language, setLanguage] = useState<'de' | 'en'>('de');

<select value={language} onChange={(e) => setLanguage(e.target.value)}>
  <option value="de">🇩🇪 Deutsch</option>
  <option value="en">🇬🇧 English</option>
</select>

<VoiceInputButton language={language} ... />
```

### 2. Audio-Vorschau

Vor dem Senden Audio abspielen:

```typescript
// In VoiceInputButton nach Aufnahme
const audioUrl = URL.createObjectURL(audioBlob);
<audio src={audioUrl} controls />
```

### 3. Offline-Fallback

Falls Whisper nicht verfügbar:

```typescript
// In VoiceInputButton
if (!response.ok && response.status === 503) {
  // Whisper nicht verfügbar
  // Browser Web Speech API als Fallback?
  const recognition = new (window as any).webkitSpeechRecognition();
  // ...
}
```

## Performance-Tuning

### Whisper-Modell-Vergleich

| Modell | Größe | RAM | Geschwindigkeit | Qualität (DE) |
|--------|-------|-----|-----------------|---------------|
| tiny   | 75 MB | 500 MB | 2-3x schneller | ⭐⭐ |
| base   | 150 MB | 1 GB | Standard | ⭐⭐⭐ |
| small  | 500 MB | 2 GB | 0.5x | ⭐⭐⭐⭐ |
| medium | 1.5 GB | 4 GB | 0.3x | ⭐⭐⭐⭐⭐ |

**Empfehlung für TS-432X:** `base` (guter Kompromiss)

### Container-Ressourcen

Falls RAM knapp:

```yaml
whisper:
  deploy:
    resources:
      limits:
        memory: 2G  # Max 2 GB RAM
      reservations:
        memory: 1G  # Min 1 GB RAM
```

## Roadmap / Ideen

- [ ] Audio-Clips speichern (für Training/Qualität)
- [ ] Mehrere Sprachen auto-detect
- [ ] Echtzeit-Transkription (während Aufnahme)
- [ ] Voice-Commands ("Senden", "Abbrechen")
- [ ] Speaker Diarization (wer hat was gesagt)
- [ ] Automatische Punkt-Setzung

## Support

Bei Problemen:

1. Logs prüfen: `docker-compose logs whisper`
2. API testen: `curl http://localhost:9000/`
3. Browser-Konsole prüfen (F12)
4. Issue erstellen mit Logs

## Siehe auch

- [WHISPER_SETUP.md](../WHISPER_SETUP.md) - Detailliertes Whisper-Setup
- [N8N_WORKFLOW.md](./N8N_WORKFLOW.md) - N8N Text-Verschönerung
- [Whisper.cpp GitHub](https://github.com/ggerganov/whisper.cpp)
