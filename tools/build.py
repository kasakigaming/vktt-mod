"""Đóng gói mod Trợ Đạo:

  dist/vkt_tro_dao.zip      cài trong game: Cấu hình → Mods → Cài mod → chọn file zip
  dist/vkt_tro_dao.user.js  userscript (Tampermonkey / Violentmonkey)

Chạy:  python tools/build.py
"""
import os
import re
import sys
import zipfile

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOD_DIR = os.path.join(ROOT, "mod", "vkt_tro_dao")
DIST = os.path.join(ROOT, "dist")

USERSCRIPT_HEAD = """// ==UserScript==
// @name         Trợ Đạo (Vạn Kiếp Tu Tiên)
// @namespace    vkt_tro_dao
// @version      {version}
// @description  Bảng hướng dẫn chơi realtime: việc nên làm, lộ trình tối ưu, đột phá, chỗ tu, sự kiện.
// @match        https://van-kiep-tu-tien.vuhaiquan2k1.workers.dev/*
// @grant        none
// @run-at       document-start
// ==/UserScript==
"""


def main():
    os.makedirs(DIST, exist_ok=True)
    src = open(os.path.join(MOD_DIR, "main.js"), encoding="utf-8").read()
    version = re.search(r"const VERSION = '([^']+)'", src).group(1)
    zpath = os.path.join(DIST, "vkt_tro_dao.zip")
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for name in ("mod.yaml", "main.js"):
            z.write(os.path.join(MOD_DIR, name), f"vkt_tro_dao/{name}")
    upath = os.path.join(DIST, "vkt_tro_dao.user.js")
    with open(upath, "w", encoding="utf-8", newline="\n") as f:
        f.write(USERSCRIPT_HEAD.format(version=version) + src)
    print(f"Trợ Đạo {version}:\n  {zpath}\n  {upath}")


if __name__ == "__main__":
    main()
