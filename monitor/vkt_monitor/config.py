"""Cấu hình bền vững của monitor (data/config.json)."""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data")
CONFIG_PATH = os.path.join(DATA, "config.json")
MOD_JS = os.path.join(ROOT, "mod", "vkt_tro_dao", "main.js")
EDGE_PROFILE = os.path.join(DATA, "edge-profile")
GAME_URL = "https://van-kiep-tu-tien.vuhaiquan2k1.workers.dev/"

DEFAULTS = {
    "port": 9222,            # cổng remote debugging của Edge / Chrome
    "poll_ms": 1000,         # bao lâu đọc lại bảng hướng dẫn một lần
    "hud_pos": None,         # [x, y] vị trí cửa sổ
    "target": None,          # cảnh giới mục tiêu (1..5); None = theo bảng trong game
    "inject": True,          # game chưa cài mod Trợ Đạo thì tự bơm engine vào trang
    "edge_path": "",         # để trống = tự tìm msedge.exe
    "max_lines": 6,          # số việc "Ngay" hiện trên HUD
}


def load():
    cfg = dict(DEFAULTS)
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg.update(json.load(f))
        except (OSError, ValueError):
            pass
    return cfg


def save(cfg):
    os.makedirs(DATA, exist_ok=True)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
