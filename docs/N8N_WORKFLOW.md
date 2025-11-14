# N8N Workflow für Text-Verschönerung

## Überblick

Dieser N8N-Workflow nimmt Stichpunkte oder rohen Text und macht daraus eine professionelle Kundennachricht.

## Workflow-Aufbau

```
Webhook Trigger
    ↓
LLM Node (Claude/GPT/Ollama)
    ↓
Response zurück
```

## 1. Webhook-Node einrichten

1. Neuen Workflow in N8N erstellen
2. **Webhook-Node** hinzufügen:
   - Method: `POST`
   - Path: `/compose-message` (oder beliebig)
   - Response Mode: `Respond to Webhook`

## 2. LLM-Node konfigurieren

### Option A: OpenAI (GPT-4)

**Node:** OpenAI Chat Model

**Konfiguration:**
```json
{
  "model": "gpt-4",
  "messages": [
    {
      "role": "system",
      "content": "Du bist ein freundlicher Mitarbeiter einer Gitarrenbauwerkstatt. Formuliere aus Stichpunkten oder kurzen Notizen eine professionelle, freundliche E-Mail an einen Kunden. Verwende eine persönliche Ansprache und bleibe höflich aber nicht übertrieben formell. Achte auf korrekte deutsche Rechtschreibung."
    },
    {
      "role": "user",
      "content": "{{ $json.rawText }}"
    }
  ]
}
```

### Option B: Anthropic Claude

**Node:** Anthropic Chat Model

**Konfiguration:**
```json
{
  "model": "claude-3-5-sonnet-20241022",
  "messages": [
    {
      "role": "user",
      "content": "Formuliere aus folgenden Notizen eine professionelle Kundennachricht für eine Gitarrenbauwerkstatt:\n\n{{ $json.rawText }}\n\nKunde: {{ $json.customerName }}\nAuftrag: {{ $json.orderTitle }}"
    }
  ]
}
```

### Option C: Ollama (Self-Hosted)

**Node:** Ollama Chat Model

**Konfiguration:**
```json
{
  "baseUrl": "http://your-ollama-server:11434",
  "model": "llama3.1",
  "messages": [
    {
      "role": "system",
      "content": "Du bist ein freundlicher Mitarbeiter. Formuliere aus Notizen eine höfliche E-Mail."
    },
    {
      "role": "user",
      "content": "{{ $json.rawText }}"
    }
  ]
}
```

## 3. Response formatieren

**Code-Node** nach dem LLM:

```javascript
// Get the LLM response
const llmResponse = $input.item.json.message?.content || $input.item.json.output;

// Return formatted response
return {
  json: {
    formattedText: llmResponse,
    subject: null, // Optional: Betreff extrahieren
    success: true
  }
};
```

## 4. Webhook Response

**Respond to Webhook-Node:**

```json
{
  "formattedText": "{{ $json.formattedText }}",
  "subject": "{{ $json.subject }}",
  "timestamp": "{{ $now }}"
}
```

## Beispiel-Prompts

### Einfacher Prompt (für schnelle Antworten)

**User-Input:**
```
Kunde angerufen
Lieferung verzögert wegen Material
neue Lieferzeit KW 15
```

**LLM Output:**
```
Sehr geehrter Herr [Name],

vielen Dank für Ihr Verständnis bezüglich der telefonischen Rücksprache.

Leider verzögert sich die Fertigstellung Ihres Auftrags aufgrund von Materialbeschaffung. Die neue voraussichtliche Lieferzeit liegt in Kalenderwoche 15.

Wir halten Sie selbstverständlich auf dem Laufenden und melden uns umgehend, sobald es Neuigkeiten gibt.

Mit freundlichen Grüßen
```

### Erweitert mit Kontext

**System Prompt:**
```
Du bist {{ $json.staffName || 'ein Mitarbeiter' }} von MGH Guitar Manufacturing.
Formuliere eine E-Mail für Kunde {{ $json.customerName }} bezüglich Auftrag {{ $json.orderTitle }}.

Stil:
- Freundlich aber professionell
- Duzen nur wenn der Kunde es auch tut
- Deutsche Rechtschreibung (neue Rechtschreibung)
- Keine übertriebene Förmlichkeit
- Konkrete Informationen, keine Floskeln
```

## In MGH-App integrieren

### 1. N8N Webhook-URL kopieren

In N8N: Webhook-Node → Production URL kopieren

Beispiel: `https://n8n.your-domain.com/webhook/compose-message`

### 2. In .env.local eintragen

```bash
N8N_WEBHOOK_URL="https://n8n.your-domain.com/webhook/compose-message"
```

### 3. Container neu starten

```bash
docker-compose restart mgh-app
```

## Optional: "Text verbessern"-Button

Falls du einen separaten Button möchtest (zusätzlich zu Voice):

```typescript
// In MessageSystem.tsx ergänzen
<button
  onClick={async () => {
    if (!newMessage.trim()) return;
    setProcessing(true);
    try {
      const res = await fetch('/api/compose-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: newMessage,
          customerName: order?.customer?.name,
          orderTitle: order?.title,
        }),
      });
      const data = await res.json();
      if (data.text) {
        setNewMessage(data.text);
      }
    } finally {
      setProcessing(false);
    }
  }}
  className="text-xs px-2 py-1 bg-purple-600 hover:bg-purple-700 rounded"
>
  ✨ Text verbessern
</button>
```

## Testen

### 1. In N8N testen

Workflow aktivieren → "Execute Workflow" → Test-Payload eingeben:

```json
{
  "rawText": "Kunde angerufen, Gitarre fertig, abholen KW 14",
  "customerName": "Max Mustermann",
  "orderTitle": "E-Gitarre Custom",
  "language": "de"
}
```

### 2. Via API testen

```bash
curl -X POST http://localhost:4000/api/compose-message \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Kunde angerufen, Material verzögert, neue Lieferzeit KW 15",
    "customerName": "Max Mustermann",
    "orderTitle": "Stratocaster Custom"
  }'
```

## Erweiterte Features

### 1. Mehrsprachigkeit

Füge Spracherkennung hinzu:

```javascript
// In N8N Code-Node vor LLM
const lang = $json.language || 'de';
const systemPrompt = lang === 'en'
  ? 'You are a friendly guitar workshop employee...'
  : 'Du bist ein freundlicher Mitarbeiter...';

return { json: { ...$json, systemPrompt } };
```

### 2. Template-Auswahl

Verschiedene Prompts für verschiedene Szenarien:

```javascript
const templates = {
  'status_update': 'Formuliere ein Status-Update für den Kunden...',
  'delay_notice': 'Formuliere eine höfliche Verzögerungsmitteilung...',
  'completion': 'Formuliere eine Fertigstellungsmeldung...',
};

const prompt = templates[$json.templateType] || templates.status_update;
```

### 3. Betreff-Generierung

LLM-Prompt erweitern:

```
Formuliere eine E-Mail UND einen passenden Betreff (max. 60 Zeichen).

Format:
BETREFF: [Dein Betreff]
---
[Dein E-Mail-Text]
```

Dann in Code-Node parsen:

```javascript
const text = $input.item.json.output;
const [subject, body] = text.split('---').map(s => s.trim());
const subjectLine = subject.replace('BETREFF:', '').trim();

return {
  json: {
    formattedText: body,
    subject: subjectLine
  }
};
```

## Kosten-Überlegungen

**Cloud-LLMs:**
- OpenAI GPT-4: ~$0.01 pro Anfrage
- Anthropic Claude: ~$0.008 pro Anfrage

**Self-Hosted (kostenlos):**
- Ollama auf QNAP (Llama 3.1)
- Braucht mehr RAM (4-8 GB)

## Troubleshooting

### N8N nicht erreichbar

```bash
# N8N Container Status prüfen
docker ps | grep n8n

# Logs checken
docker logs n8n
```

### API antwortet nicht

```bash
# App-Logs prüfen
docker-compose logs -f mgh-app

# .env prüfen
echo $N8N_WEBHOOK_URL
```

### LLM-Qualität schlecht

- Größeres Modell wählen (`gpt-4` statt `gpt-3.5-turbo`)
- System-Prompt verbessern mit mehr Kontext
- Few-Shot-Examples hinzufügen
