"""Local MGH pilot. Only model downloads need internet; mail inference stays local."""
import hmac
import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MODEL = "convaiinnovations/laya-multilingual"
MODEL_REVISION = "e4e9ddf21a7b1903b7acffd8814ad4307bf63a67"
CHOICES = {"confirmed", "tentative", "rejected", "unclear"}
MAX_LEN = 1024
HEAD_LEN = 384


class RequestError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def validate_payload(payload):
    if not isinstance(payload, dict) or set(payload) != {"state", "questions"}:
        raise RequestError(400, "Invalid request")
    state, questions = payload["state"], payload["questions"]
    if not isinstance(state, str) or not state.strip() or len(state) > 6000:
        raise RequestError(400, "Invalid state")
    if not isinstance(questions, dict) or not 1 <= len(questions) <= 24:
        raise RequestError(400, "Invalid questions")
    for name, q in questions.items():
        if not re.fullmatch(r"c\d{1,2}", name) or not isinstance(q, dict):
            raise RequestError(400, "Invalid question")
        if set(q) != {"type", "instructions", "criteria"} or q["type"] != "choice":
            raise RequestError(400, "Invalid question type")
        if not isinstance(q["instructions"], str) or not 1 <= len(q["instructions"]) <= 600:
            raise RequestError(400, "Invalid instructions")
        criteria = q["criteria"]
        if not isinstance(criteria, dict) or set(criteria) != CHOICES:
            raise RequestError(400, "Invalid criteria")
        if any(not isinstance(v, str) or not 1 <= len(v) <= 300 for v in criteria.values()):
            raise RequestError(400, "Invalid criterion")
    return state, questions


def check_budget(agent, state, questions):
    """Fail before inference rather than silently losing late corrections or options."""
    def count(text):
        return len(agent.tok(text.replace(agent.tok.mask_token, " "), add_special_tokens=False)["input_ids"])
    if count(state) > MAX_LEN - HEAD_LEN - 8:
        raise RequestError(413, "State exceeds pilot context budget")
    for q in questions.values():
        options = [count(" " + k + ": " + v) for k, v in q["criteria"].items()]
        if any(n > 48 for n in options) or count("choice question: " + q["instructions"]) + sum(options) + 4 > HEAD_LEN:
            raise RequestError(413, "Question exceeds pilot context budget")


class Runtime:
    def __init__(self):
        self.agent = None
        self.revision = ""
        self.failed = False
        self.lock = threading.Lock()

    def load(self):
        try:
            # Loaded lazily so request validation can be tested without model dependencies.
            import torch
            import laya
            from huggingface_hub import snapshot_download
            torch.set_num_threads(max(1, min(4, int(os.environ.get("MGH_AI_THREADS", "2")))))
            data = Path(os.environ.get("MGH_AI_DATA", "data"))
            data.mkdir(parents=True, exist_ok=True)
            revision_file = data / "model-revision.txt"
            revision = os.environ.get("MGH_AI_REVISION") or (revision_file.read_text().strip() if revision_file.exists() else MODEL_REVISION)
            # Resolve and remember the exact checkpoint on first boot. Later boots reuse it.
            path = snapshot_download(MODEL, revision=revision)
            self.revision = Path(path).name
            revision_file.write_text(self.revision, encoding="utf-8")
            self.agent = laya.load(path, device="cpu")
        except Exception as error:
            # Do not log model exceptions or request contents.
            self.failed = True
            print(f"Model startup failed ({type(error).__name__}). Check free RAM, package installation and model download.", flush=True)

    def analyze(self, payload):
        state, questions = validate_payload(payload)
        if self.agent is None or not self.lock.acquire(blocking=False):
            raise RequestError(503, "Model unavailable or busy")
        try:
            check_budget(self.agent, state, questions)
            answers = {}
            # One question at a time bounds peak RAM on the 4 GB QNAP.
            for key, question in questions.items():
                result = self.agent.predict(state, {key: question}, max_len=MAX_LEN, head_max_len=HEAD_LEN)
                answer = result["answers"][key]
                answers[key] = {"choice": answer["choice"], "probabilities": answer["probabilities"]}
            return {"model": MODEL, "revision": self.revision, "answers": answers}
        finally:
            self.lock.release()


def handler_for(runtime, token):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # No access logs, mail bodies, tokens or model outputs.

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
            status = "ready" if runtime.agent is not None else "failed" if runtime.failed else "loading"
            return self.reply(200, {"status": status, "model": MODEL, "revision": runtime.revision})

        def do_POST(self):
            self.connection.settimeout(15)
            try:
                if not self.authorized():
                    return self.reply(401, {"error": "Unauthorized"})
                if self.path != "/analyze":
                    return self.reply(404, {"error": "Not found"})
                if self.headers.get("Transfer-Encoding"):
                    raise RequestError(400, "Chunked requests unsupported")
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 65536:
                    raise RequestError(413, "Request too large")
                payload = json.loads(self.rfile.read(length))
                self.reply(200, runtime.analyze(payload))
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
    token = os.environ.get("MGH_AI_TOKEN", "")
    token_path = os.environ.get("MGH_AI_TOKEN_FILE")
    if token_path:
        token = Path(token_path).read_text(encoding="utf-8-sig").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{32,200}", token):
        raise SystemExit("Set MGH_AI_TOKEN or MGH_AI_TOKEN_FILE to a random access key (32+ characters).")
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    os.environ.setdefault("USE_TF", "0")
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    runtime = Runtime()
    host = os.environ.get("MGH_AI_HOST", "127.0.0.1")
    port = int(os.environ.get("MGH_AI_PORT", "8765"))
    server = ThreadingHTTPServer((host, port), handler_for(runtime, token))
    threading.Thread(target=runtime.load, daemon=True).start()
    print(f"Local mail AI listening on {host}:{port}. Model loading; health endpoint reports readiness.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
