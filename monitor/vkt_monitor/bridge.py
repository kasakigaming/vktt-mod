"""Cầu nối tới trang game: tìm tab, bơm engine Trợ Đạo nếu chưa có, đọc snapshot.

Chạy ở luồng nền; HUD đọc kết quả mới nhất qua `latest`.
"""
import json
import os
import subprocess
import threading
import time

from . import cdp, config

EDGE_CANDIDATES = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"),
]


def find_edge(cfg):
    if cfg.get("edge_path") and os.path.exists(cfg["edge_path"]):
        return cfg["edge_path"]
    for p in EDGE_CANDIDATES:
        if os.path.exists(p):
            return p
    return None


def launch_edge(cfg):
    """Mở Edge (hồ sơ riêng, có cổng debug) vào thẳng game. Edge chặn debug trên hồ sơ mặc định."""
    exe = find_edge(cfg)
    if not exe:
        return "Không tìm thấy msedge.exe: đặt edge_path trong data/config.json"
    os.makedirs(config.EDGE_PROFILE, exist_ok=True)
    subprocess.Popen([
        exe,
        f"--remote-debugging-port={cfg['port']}",
        f"--user-data-dir={config.EDGE_PROFILE}",
        "--no-first-run",
        config.GAME_URL,
    ])
    return None


SNAPSHOT_JS = r"""
(() => {
  const a = window.__vktTroDao;
  if (!a) return JSON.stringify({ missing: true, game: !!window.tuTien, phase: window.tuTien && window.tuTien.phase });
  const s = a.snapshot && a.snapshot();
  return JSON.stringify(s || { waiting: true });
})()
"""


class Bridge(threading.Thread):
    daemon = True

    def __init__(self, cfg):
        super().__init__(name="vkt-bridge")
        self.cfg = cfg
        self.latest = {"state": "starting", "msg": "Đang khởi động…"}
        self.page = None
        self.stop_flag = False
        self.pending = []          # lệnh JS từ HUD (vd. đổi mục tiêu)
        self.lock = threading.Lock()

    def send_js(self, js):
        with self.lock:
            self.pending.append(js)

    def _connect(self):
        try:
            ws = cdp.find_game(self.cfg["port"])
        except OSError:
            return "no_debug"
        if not ws:
            return "no_game"
        self.page = cdp.Page(ws)
        return "ok"

    def _inject_if_needed(self):
        info = json.loads(self.page.evaluate(SNAPSHOT_JS) or "{}")
        if info.get("missing"):
            if not info.get("game") or info.get("phase") != "ready":
                return {"state": "loading", "msg": "Game đang tải…"}
            if not self.cfg.get("inject", True):
                return {"state": "no_mod", "msg": "Game chưa cài mod Trợ Đạo (inject đang tắt trong config)."}
            with open(config.MOD_JS, "r", encoding="utf-8") as f:
                src = f.read()
            self.page.evaluate(src + ";'ok'")
            time.sleep(1.0)
            info = json.loads(self.page.evaluate(SNAPSHOT_JS) or "{}")
        if self.cfg.get("target") and not getattr(self, "_target_set", False):
            self.page.evaluate(f"window.__vktTroDao && window.__vktTroDao.setTarget({int(self.cfg['target'])})")
            self._target_set = True
        return info

    def run(self):
        while not self.stop_flag:
            try:
                if self.page is None:
                    st = self._connect()
                    if st == "no_debug":
                        self.latest = {"state": "no_debug", "msg": f"Không thấy trình duyệt có cổng debug {self.cfg['port']}. Bấm ▶ để mở Edge."}
                        time.sleep(2)
                        continue
                    if st == "no_game":
                        self.latest = {"state": "no_game", "msg": "Edge đã mở nhưng chưa có tab game Vạn Kiếp Tu Tiên."}
                        self.page = None
                        time.sleep(2)
                        continue
                with self.lock:
                    jobs, self.pending = self.pending, []
                for js in jobs:
                    self.page.evaluate(js)
                info = self._inject_if_needed()
                if "state" in info and not info.get("ok"):
                    self.latest = info
                else:
                    info["state"] = "ok" if info.get("ok") else "wait"
                    self.latest = info
            except Exception as e:  # mất kết nối, tab đóng, trang tải lại…
                self.latest = {"state": "error", "msg": f"Mất kết nối: {e}"}
                if self.page:
                    self.page.close()
                self.page = None
                time.sleep(1.5)
                continue
            time.sleep(max(0.2, self.cfg.get("poll_ms", 1000) / 1000.0))
