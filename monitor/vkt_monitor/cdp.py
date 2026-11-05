"""Client Chrome DevTools Protocol tối giản: tìm tab game, chạy JS, lấy kết quả.

Chỉ dùng Runtime.evaluate. Không bấm, không gõ hộ người chơi.
"""
import json
import urllib.request

import websocket  # websocket-client

GAME_HOST = "van-kiep-tu-tien"


class CdpError(RuntimeError):
    pass


def list_targets(port):
    with urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=2) as r:
        return json.loads(r.read().decode("utf-8"))


def find_game(port):
    """Trả websocket URL của tab game, hoặc None nếu chưa mở game."""
    for t in list_targets(port):
        if t.get("type") == "page" and GAME_HOST in t.get("url", ""):
            return t.get("webSocketDebuggerUrl")
    return None


class Page:
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=8, suppress_origin=True)
        self._id = 0

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass

    def call(self, method, params=None):
        self._id += 1
        my_id = self._id
        self.ws.send(json.dumps({"id": my_id, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == my_id:
                if "error" in msg:
                    raise CdpError(msg["error"].get("message", str(msg["error"])))
                return msg.get("result", {})

    def evaluate(self, expression, await_promise=False):
        res = self.call("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": await_promise,
        })
        if res.get("exceptionDetails"):
            d = res["exceptionDetails"]
            raise CdpError((d.get("exception") or {}).get("description") or d.get("text") or "JS lỗi")
        return (res.get("result") or {}).get("value")
