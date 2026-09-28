import json
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from unittest.mock import Mock
from server import Runtime, RequestError, check_budget, handler_for, validate_payload


def payload():
    return {"state": "Kein Ebenholz, bitte Ahorn.", "questions": {"c0": {
        "type": "choice", "instructions": "Wünscht der Kunde Ebenholz?",
        "criteria": {"confirmed": "Wunsch", "tentative": "Frage", "rejected": "Ablehnung", "unclear": "Unklar"},
    }}}


class RuntimeTests(unittest.TestCase):
    def test_request_shape(self):
        self.assertEqual(validate_payload(payload())[0], "Kein Ebenholz, bitte Ahorn.")
        invalid = payload()
        invalid["questions"]["c0"]["criteria"]["run_shell"] = "Extra action"
        with self.assertRaises(RequestError):
            validate_payload(invalid)

    def test_busy_service_does_not_queue_more_inference(self):
        runtime = Runtime()
        runtime.agent = Mock()
        runtime.lock.acquire()
        with self.assertRaises(RequestError) as error:
            runtime.analyze(payload())
        self.assertEqual(error.exception.status, 503)
        runtime.agent.predict.assert_not_called()
        runtime.lock.release()

    def test_long_mail_is_rejected_not_truncated(self):
        agent = Mock()
        agent.tok.mask_token = "[MASK]"
        agent.tok.return_value = {"input_ids": list(range(1000))}
        with self.assertRaises(RequestError) as error:
            check_budget(agent, "long mail", payload()["questions"])
        self.assertEqual(error.exception.status, 413)

    def test_failure_releases_inference_lock(self):
        runtime = Runtime()
        runtime.agent = Mock()
        runtime.agent.tok.mask_token = "[MASK]"
        runtime.agent.tok.return_value = {"input_ids": [1, 2]}
        runtime.agent.predict.side_effect = RuntimeError("internal")
        with self.assertRaises(RuntimeError):
            runtime.analyze(payload())
        self.assertFalse(runtime.lock.locked())


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.runtime = Runtime()
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler_for(self.runtime, "test-token"))
        self.worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.worker.join()

    def call(self, method, path, token=None, body=None):
        connection = HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        try:
            headers = {"Authorization": "Bearer " + token} if token else {}
            connection.request(method, path, body=json.dumps(body) if body else None, headers=headers)
            response = connection.getresponse()
            return response.status, json.loads(response.read())
        finally:
            connection.close()

    def test_authentication_and_loading_state(self):
        self.assertEqual(self.call("GET", "/health")[0], 401)
        self.assertEqual(self.call("POST", "/analyze", "wrong", payload())[0], 401)
        self.assertEqual(self.call("GET", "/health", "test-token")[1]["status"], "loading")
        self.assertEqual(self.call("POST", "/analyze", "test-token", payload())[0], 503)


if __name__ == "__main__":
    unittest.main()
