"""Lokaler Analysedienst fuer Mails (GLiNER2). Mailtexte verlassen den Rechner nicht.

Nur die Modellinstallation braucht Internet (Start-MailAi.ps1 -Install). Im Betrieb
laeuft der Dienst im Offline-Modus: Hugging Face und Transformers duerfen nichts
nachladen, und die Standardinstallation von gliner2 (ein Cloud-API-Client) wird nie
benutzt, nur die lokale Ausfuehrung (gliner2[local]).
"""
import hmac
import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# Offline erzwingen, bevor irgendein ML-Paket geladen wird.
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

MAX_TEXT = 60_000
MAX_BODY = 262_144
THRESHOLD = 0.4

# Modellseitige Labels -> Typen der App (lib/mail/extraction.ts EntityType).
PII_LABELS = {
    "person": ("name", "name of a private person (first and/or last name)"),
    "street": ("address", "street name with house number"),
    "city": ("postalCode", "postal code with city or town"),
    "email": ("email", "email address"),
    "phone": ("phone", "phone or mobile number"),
    "iban": ("iban", "IBAN bank account number"),
    "customer_number": ("customerNumber", "customer number or customer id"),
}
FIELD_KEY = re.compile(r"[a-z][a-z0-9_]{0,63}")


class RequestError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def validate_text(payload):
    text = payload.get("text") if isinstance(payload, dict) else None
    if not isinstance(text, str) or not text.strip():
        raise RequestError(400, "Invalid text")
    if len(text) > MAX_TEXT:
        raise RequestError(413, "Text too long")
    return text


def validate_fields(payload):
    fields = payload.get("fields")
    if not isinstance(fields, dict) or not 1 <= len(fields) <= 80:
        raise RequestError(400, "Invalid fields")
    for key, description in fields.items():
        if not FIELD_KEY.fullmatch(key) or not isinstance(description, str) or not 1 <= len(description) <= 200:
            raise RequestError(400, "Invalid field")
    intents = payload.get("intents", [])
    if not isinstance(intents, list) or len(intents) > 10 or any(not isinstance(i, str) or not 1 <= len(i) <= 80 for i in intents):
        raise RequestError(400, "Invalid intents")
    return fields, intents


def spans(result, rename=None):
    out = []
    for label, items in (result.get("entities") or {}).items():
        for item in items or []:
            if not isinstance(item, dict) or "start" not in item:
                continue
            entry = {"label": rename(label) if rename else label, "text": item["text"], "start": int(item["start"]),
                     "end": int(item["end"]), "confidence": round(float(item.get("confidence", 0)), 4)}
            intent = item.get("intent")
            if isinstance(intent, dict) and intent.get("label"):
                entry["intent"] = intent["label"]
                entry["intentConfidence"] = round(float(intent.get("confidence", 0)), 4)
            out.append(entry)
    return sorted(out, key=lambda s: s["start"])


class Runtime:
    def __init__(self, data):
        self.data = data
        self.pii = None
        self.fields = None
        self.failed = False
        self.lock = threading.Lock()

    def load(self):
        try:
            import torch
            from gliner2 import AutoExtractor
            torch.set_num_threads(max(1, min(8, int(os.environ.get("MAIL_AI_THREADS", "2")))))
            models = self.data / "models"
            self.pii = AutoExtractor.from_pretrained(str(models / "pii"))
            if os.environ.get("MAIL_AI_FIELDS", "1") == "1" and (models / "fields").exists():
                self.fields = AutoExtractor.from_pretrained(str(models / "fields"))
        except Exception as error:
            # Keine Mailinhalte oder Details protokollieren.
            self.failed = True
            print(f"Modellstart fehlgeschlagen ({type(error).__name__}). Installation und freien RAM pruefen.", flush=True)

    def status(self):
        return "ready" if self.pii is not None else "failed" if self.failed else "loading"

    def run(self, fn):
        if self.pii is None:
            raise RequestError(503, "Model unavailable")
        with self.lock:
            return fn()

    def detect_pii(self, payload):
        text = validate_text(payload)
        labels = {label: {"description": desc} for label, (_, desc) in PII_LABELS.items()}
        result = self.run(lambda: self.pii.extract_entities_long(
            text, labels, threshold=THRESHOLD, include_confidence=True, include_spans=True))
        entities = spans(result)
        for s in entities:
            s["type"] = PII_LABELS[s.pop("label")][0]
        return {"entities": entities}

    def extract_fields(self, payload):
        text = validate_text(payload)
        fields, intents = validate_fields(payload)
        if self.fields is None:
            raise RequestError(503, "Field model unavailable")

        def work():
            from gliner2 import AttributeGroup
            schema = self.fields.create_schema().entities({k: {"description": v} for k, v in fields.items()})
            if intents:
                schema = schema.entity_attributes({"intent": AttributeGroup(labels=intents)})
            return self.fields.extract_long(text, schema, threshold=THRESHOLD, include_confidence=True, include_spans=True)

        found = spans(self.run(work))
        for s in found:
            s["field"] = s.pop("label")
        return {"spans": found}


def handler_for(runtime, token):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Keine Zugriffsprotokolle: weder Mailtexte noch Schluessel.

        def reply(self, status, payload):
            data = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def authorized(self):
            supplied = self.headers.get("Authorization", "")
            return hmac.compare_digest(supplied.encode("utf-8"), ("Bearer " + token).encode("utf-8"))

        def do_GET(self):
            if not self.authorized():
                return self.reply(401, {"error": "Unauthorized"})
            if self.path != "/health":
                return self.reply(404, {"error": "Not found"})
            return self.reply(200, {"status": runtime.status(), "fields": runtime.fields is not None})

        def do_POST(self):
            self.connection.settimeout(30)
            try:
                if not self.authorized():
                    return self.reply(401, {"error": "Unauthorized"})
                routes = {"/pii": runtime.detect_pii, "/fields": runtime.extract_fields}
                if self.path not in routes:
                    return self.reply(404, {"error": "Not found"})
                if self.headers.get("Transfer-Encoding"):
                    raise RequestError(400, "Chunked requests unsupported")
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= MAX_BODY:
                    raise RequestError(413, "Request too large")
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict):
                    raise RequestError(400, "Invalid request")
                self.reply(200, routes[self.path](payload))
            except RequestError as error:
                self.reply(error.status, {"error": str(error)})
            except (ValueError, UnicodeError):
                self.reply(400, {"error": "Invalid JSON"})
            except (BrokenPipeError, ConnectionResetError, TimeoutError):
                pass
            except Exception:
                self.reply(500, {"error": "Inference failed"})
    return Handler


def main():
    token = os.environ.get("MAIL_AI_TOKEN", "")
    token_path = os.environ.get("MAIL_AI_TOKEN_FILE")
    if token_path:
        token = Path(token_path).read_text(encoding="utf-8-sig").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{32,200}", token):
        raise SystemExit("MAIL_AI_TOKEN oder MAIL_AI_TOKEN_FILE mit einem Zufallsschluessel (32+ Zeichen) setzen.")
    runtime = Runtime(Path(os.environ.get("MAIL_AI_DATA", "data")))
    # Standard nur lokal: der Dienst laeuft auf demselben Rechner wie die App.
    host = os.environ.get("MAIL_AI_HOST", "127.0.0.1")
    port = int(os.environ.get("MAIL_AI_PORT", "8766"))
    server = ThreadingHTTPServer((host, port), handler_for(runtime, token))
    threading.Thread(target=runtime.load, daemon=True).start()
    print(f"Mail-Analyse lauscht auf {host}:{port}. Modelle werden geladen; /health meldet den Stand.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
