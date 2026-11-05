"""HUD nhỏ luôn nổi trên màn hình: việc nên làm ngay, đột phá, lộ trình, sự kiện."""
import tkinter as tk

from . import bridge as br
from . import config

BG = "#14161c"
FG = "#eef0f4"
MUTED = "#8b919b"
ACCENT = "#7CFF9E"
RED = "#ff6b6b"
ORANGE = "#ffb36b"
BLUE = "#8fb8ff"
REALMS = ["Phàm Nhân", "Luyện Khí", "Trúc Cơ", "Kết Đan", "Nguyên Anh", "Hóa Thần"]
LV_COLOR = {"urgent": RED, "do": ACCENT, "warn": ORANGE, "tip": BLUE, "info": MUTED}
LV_MARK = {"urgent": "‼", "do": "➤", "warn": "⚠", "tip": "•", "info": "·"}


def pct(x):
    return "?" if x is None else f"{x * 100:.0f}%"


def yrs(y):
    if y is None:
        return "∞"
    if y < 1:
        return f"{max(1, round(y * 12))} tháng"
    return f"{y:.1f} năm".replace(".", ",") if y < 10 else f"{round(y)} năm"


class Hud:
    def __init__(self, cfg):
        self.cfg = cfg
        self.root = tk.Tk()
        self.root.title("Trợ Đạo")
        self.root.configure(bg=BG)
        self.root.attributes("-topmost", True)
        self.root.overrideredirect(True)
        self.root.attributes("-alpha", 0.95)
        pos = cfg.get("hud_pos") or [40, 120]
        self.root.geometry(f"+{pos[0]}+{pos[1]}")
        self.paused = False
        self._build()
        self.bridge = br.Bridge(cfg)
        self.bridge.start()
        self.root.after(300, self.tick)

    # ------------------------------------------------------------ dựng giao diện
    def _build(self):
        bar = tk.Frame(self.root, bg="#1f232b")
        bar.pack(fill="x")
        title = tk.Label(bar, text="☯ Trợ Đạo", fg=ACCENT, bg="#1f232b", font=("Segoe UI", 10, "bold"))
        title.pack(side="left", padx=6, pady=3)
        for w in (bar, title):
            w.bind("<ButtonPress-1>", self._drag_start)
            w.bind("<B1-Motion>", self._drag_move)
            w.bind("<ButtonRelease-1>", self._drag_end)
        self.target_var = tk.StringVar(value=REALMS[int(self.cfg.get("target") or 4)])
        menu = tk.OptionMenu(bar, self.target_var, *REALMS[1:], command=self._set_target)
        menu.configure(bg="#1f232b", fg=FG, activebackground="#2a2f39", highlightthickness=0, bd=0, font=("Segoe UI", 9))
        menu["menu"].configure(bg="#1f232b", fg=FG)
        menu.pack(side="left", padx=4)
        for txt, cmd, tip in (("✕", self.quit, "thoát"), ("⏸", self.toggle_pause, "tạm dừng"), ("▶", self.launch, "mở Edge vào game")):
            b = tk.Label(bar, text=txt, fg=FG, bg="#1f232b", font=("Segoe UI", 10), cursor="hand2", padx=5)
            b.pack(side="right")
            b.bind("<Button-1>", lambda e, c=cmd: c())
            if txt == "⏸":
                self.pause_btn = b
        self.status = tk.Label(self.root, text="", fg=MUTED, bg=BG, font=("Segoe UI", 9), justify="left", anchor="w", wraplength=420)
        self.status.pack(fill="x", padx=8, pady=(4, 0))
        self.body = tk.Frame(self.root, bg=BG)
        self.body.pack(fill="both", padx=8, pady=(2, 8))

    def _drag_start(self, e):
        self._dx, self._dy = e.x_root - self.root.winfo_x(), e.y_root - self.root.winfo_y()

    def _drag_move(self, e):
        self.root.geometry(f"+{e.x_root - self._dx}+{e.y_root - self._dy}")

    def _drag_end(self, _e):
        self.cfg["hud_pos"] = [self.root.winfo_x(), self.root.winfo_y()]
        config.save(self.cfg)

    def _set_target(self, name):
        t = REALMS.index(name)
        self.cfg["target"] = t
        config.save(self.cfg)
        self.bridge.send_js(f"window.__vktTroDao && window.__vktTroDao.setTarget({t})")

    def toggle_pause(self):
        self.paused = not self.paused
        self.pause_btn.configure(text="▶▶" if self.paused else "⏸")

    def launch(self):
        err = br.launch_edge(self.cfg)
        if err:
            self.status.configure(text=err, fg=RED)

    def quit(self):
        self.bridge.stop_flag = True
        self.root.destroy()

    # ------------------------------------------------------------ vẽ nội dung
    def line(self, text, color=FG, bold=False, size=10, pad=1):
        tk.Label(self.body, text=text, fg=color, bg=BG, justify="left", anchor="w", wraplength=420,
                 font=("Segoe UI", size, "bold" if bold else "normal")).pack(fill="x", pady=pad)

    def tick(self):
        if not self.paused:
            self.render(self.bridge.latest)
        self.root.after(700, self.tick)

    def render(self, a):
        for w in self.body.winfo_children():
            w.destroy()
        st = a.get("state")
        if st in ("no_debug", "no_game", "error", "loading", "no_mod", "starting"):
            self.status.configure(text=a.get("msg", ""), fg=ORANGE if st != "error" else RED)
            if st == "no_debug":
                self.line("Edge thường không cho debug hồ sơ mặc định. Bấm ▶ để mở một Edge riêng vào game (đăng nhập / nạp save ở đó).", MUTED, size=9)
            return
        if not a.get("ok"):
            self.status.configure(text=a.get("reason") or "Đang chờ game…", fg=ORANGE)
            return
        s = a["S"]
        sect = s.get("sect") or {}
        self.status.configure(fg=MUTED, text=(
            f"{s['realm']} · tu vi {s['tuVi']:.1f}/{(s.get('need') or 0):.0f} · tuổi {int(s['tuoi'])}/{s.get('tho') or '?'}"
            f" · {s['lt']:.0f} LT" + (f" · {sect.get('capTen', '')} {s['ch']:.0f} CH" if sect else "") +
            f"\n{s['viTriTen']} · {((s.get('here') or {}).get('tuViNam') or 0):.2f} tu vi/năm · lịch luyện {yrs(s.get('lichLuyenNam'))}"
        ))
        self.line("Việc nên làm ngay", ACCENT, bold=True, pad=(4, 1))
        for act in a.get("actions", [])[: self.cfg.get("max_lines", 6)]:
            lv = act.get("lv", "info")
            self.line(f"{LV_MARK.get(lv, '•')} {act['text']}", LV_COLOR.get(lv, FG))
            if act.get("why"):
                self.line(f"    {act['why']}", MUTED, size=9)
        wish = [w for w in (a.get("wish") or []) if w.get("where")][:3]
        if wish:
            self.line("Nên mua (đang bày bán quanh đây)", "#e0a800", bold=True, pad=(4, 1))
            for w in wish:
                s = w["where"][0]
                self.line(f"★ {w['ten']} ~{w.get('price', '?')} LT → {s['ten']} ({', '.join(s.get('shops', [])[:2])}, đi {yrs(s.get('travel'))})", "#e0a800", size=9)
        tg = (a.get("targets") or {}).get("list") or []
        if tg:
            self.line(f"Bản đồ: ➤ {tg[0]['label']} ở {tg[0]['ten']} (đã vẽ trên bản đồ game)", BLUE, size=9, pad=(4, 0))
        bt = a.get("bt") or {}
        if bt and not bt.get("max"):
            if bt.get("chan"):
                self.line(f"Đột phá {bt.get('targetTen')}: {bt['chan']}", MUTED, size=9, pad=(4, 0))
            else:
                burn = next((b for b in bt.get("burns", []) if b.get("nac") == 1 and b.get("duoc")), None)
                self.line(f"Đột phá {bt.get('targetTen')}: {pct((bt.get('best') or {}).get('tiLe'))}"
                          + (f" · đốt thọ {burn['nam']} năm → {pct(burn.get('tiLe'))}" if burn else ""), ACCENT, bold=True, pad=(4, 0))
        plan = a.get("plan") or {}
        if plan.get("steps"):
            ok = plan.get("ok")
            self.line((f"Lộ trình tới {REALMS[plan['target']]}: ~{yrs(plan.get('totalYears'))}" if ok
                       else f"Lộ trình tới {REALMS[plan['target']]}: KHÔNG kịp thọ với tốc độ hiện tại"),
                      ACCENT if ok else RED, size=9, pad=(4, 0))
        enc = a.get("enc")
        if enc and not enc.get("utility") and enc.get("choices"):
            rec = next((c for c in enc["choices"] if c["index"] == enc.get("rec")), None)
            if rec:
                self.line(f"Sự kiện «{enc['ten']}» → {rec['text'][:80]}", BLUE, size=9, pad=(4, 0))


def run():
    cfg = config.load()
    Hud(cfg).root.mainloop()
