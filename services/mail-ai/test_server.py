import json
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import Mock

from server import RequestError, Runtime, handler_for, spans, validate_fields, validate_text

TOKEN = "t" * 40


class ValidationTests(unittest.TestCase):
    def test_text_limits(self):
        self.assertEqual(validate_text({"text": "Hallo"}), "Hallo")
        for bad in ({}, {"text": ""}, {"text": 5}, {"text": "x" * 60_001}):
            with self.assertRaises(RequestError):
                validate_text(bad)

    def test_fields_reject_unexpected_keys(self):
        fields, intents = validate_fields({"fields": {"neck_wood": "Halsholz"}, "intents": ["firm wish"]})
        self.assertEqual(list(fields), ["neck_wood"])
        self.assertEqual(intents, ["firm wish"])
        for bad in ({"fields": {}}, {"fields": {"Neck Wood!": "x"}}, {"fields": {"a": "x"}, "intents": [1]}):
            with self.assertRaises(RequestError):
                validate_fields(bad)

    def test_spans_keep_offsets_and_intent(self):
        result = {"entities": {"neck_wood": [{"text": "Ahorn", "start": 9, "end": 14, "confidence": 0.9,
                                              "intent": {"label": "firm wish", "confidence": 0.8}}]}}
        self.assertEqual(spans(result), [{"label": "neck_wood", "text": "Ahorn", "start": 9, "end": 14,
                                          "confidence": 0.9, "intent": "firm wish", "intentConfidence": 0.8}])


class RuntimeTests(unittest.TestCase):
    def test_pii_types_are_mapped_to_app_types(self):
        runtime = Runtime(Path("."))
        runtime.pii = Mock()
        runtime.pii.extract_entities_long.return_value = {"entities": {
            "person": [{"text": "Anna Beispiel", "start": 0, "end": 13, "confidence": 0.99}],
            "city": [{"text": "12345 Musterstadt", "start": 15, "end": 32, "confidence": 0.9}]}}
        out = runtime.detect_pii({"text": "Anna Beispiel, 12345 Musterstadt"})["entities"]
        self.assertEqual([(e["type"], e["start"]) for e in out], [("name", 0), ("postalCode", 15)])
        self.assertNotIn("label", out[0])

    def test_unloaded_model_answers_503(self):
        with self.assertRaises(RequestError) as error:
            Runtime(Path(".")).detect_pii({"text": "Hallo"})
        self.assertEqual(error.exception.status, 503)


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.runtime = Runtime(Path("."))
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler_for(self.runtime, TOKEN))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def request(self, method, path, body=None, token=TOKEN):
        conn = HTTPConnection("127.0.0.1", self.server.server_address[1], timeout=5)
        data = json.dumps(body).encode() if body is not None else None
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        conn.request(method, path, body=data, headers=headers)
        res = conn.getresponse()
        return res.status, json.loads(res.read())

    def test_requires_token(self):
        self.assertEqual(self.request("GET", "/health", token="x" * 40)[0], 401)
        self.assertEqual(self.request("POST", "/pii", {"text": "Hallo"}, token="x" * 40)[0], 401)

    def test_health_reports_loading(self):
        self.assertEqual(self.request("GET", "/health"), (200, {"status": "loading", "fields": False}))

    def test_unknown_path(self):
        self.assertEqual(self.request("POST", "/shell", {"text": "x"})[0], 404)


if __name__ == "__main__":
    unittest.main()
