// ==UserScript==
// @name         Trợ Đạo (Vạn Kiếp Tu Tiên)
// @namespace    vkt_tro_dao
// @version      1.3.1
// @description  Bảng hướng dẫn chơi realtime: việc nên làm, lộ trình tối ưu, đột phá, chỗ tu, sự kiện.
// @match        https://van-kiep-tu-tien.vuhaiquan2k1.workers.dev/*
// @grant        none
// @run-at       document-start
// ==/UserScript==
// Trợ Đạo (vkt_tro_dao): bảng hướng dẫn chơi realtime cho Vạn Kiếp Tu Tiên.
//
// Cách chạy: cài như mod (Cấu hình → Mods → Cài mod → chọn file .zip hoặc main.js),
// hoặc userscript, hoặc để monitor Python bơm vào qua cổng debug của Edge.
//
// Nguyên tắc:
//  - Chỉ ĐỌC. Mọi phép tính chạy trên tuTien.game.readCtx() (bản sao kiếp), không
//    gọi lệnh tuTien.game.* làm đổi trạng thái, không bấm hộ người chơi.
//  - Con số lấy từ chính hàm lõi của game (tuTien.core), không tự chép công thức.
//    Hàm nào bản game mới đổi tên thì khối đó tự ẩn (safe), phần còn lại vẫn chạy.
(function () {
  'use strict';
  if (window.__vktTroDao && window.__vktTroDao.version) return; // đã nạp

  const VERSION = '1.3.1';
  const MOD_ID = 'vkt_tro_dao';
  const LS = (k) => `mod:${MOD_ID}:${k}`;
  const REALM_SHORT = ['Phàm Nhân', 'Luyện Khí', 'Trúc Cơ', 'Kết Đan', 'Nguyên Anh', 'Hóa Thần'];
  const INJURY = ['Lành lặn', 'Thương nhẹ', 'Thương nặng', 'Trọng thương'];

  // ---------------------------------------------------------------- tiện ích
  const safe = (fn, dflt) => {
    try {
      const v = fn();
      return v === undefined ? dflt : v;
    } catch (e) {
      return dflt;
    }
  };
  const pct = (x, d = 0) => (x == null || !Number.isFinite(x) ? '?' : `${(x * 100).toFixed(d)}%`);
  const sgnPct = (x, d = 0) => (x >= 0 ? '+' : '−') + `${Math.abs(x * 100).toFixed(d).replace('.', ',')}%`;
  const num = (x, d = 1) => (x == null || !Number.isFinite(x) ? '?' : x.toFixed(d).replace('.', ','));
  const yrs = (y) => {
    if (y == null || !Number.isFinite(y)) return '∞';
    if (y < 1) return `${Math.max(1, Math.round(y * 12))} tháng`;
    if (y < 10) return `${num(y, 1)} năm`;
    return `${Math.round(y)} năm`;
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const lsGet = (k, d) => safe(() => {
    const v = localStorage.getItem(LS(k));
    return v == null ? d : JSON.parse(v);
  }, d);
  const lsSet = (k, v) => safe(() => localStorage.setItem(LS(k), JSON.stringify(v)));

  // ---------------------------------------------------------------- engine
  class Engine {
    constructor(tt) {
      this.tt = tt;
      this.C = tt.core;
    }
    m(name) {
      return this.C[name] || {};
    }
    itemName(id) {
      return safe(() => this.tt.content.items.get(id).ten, id);
    }
    item(id) {
      return safe(() => this.tt.content.items.get(id), null);
    }
    placeName(ctx, slot) {
      return safe(() => ctx.run.noiChon[slot].tenMoi, null) || safe(() => ctx.world.info(slot).ten, slot);
    }
    realmName(cg, tieu) {
      return safe(() => this.m('kernel/realms').tenCanhGioi(cg, tieu), `${REALM_SHORT[cg]}`);
    }
    realmDef(cg) {
      return safe(() => this.m('kernel/realms').canhGioi(cg), null);
    }
    tuViCan(cg, tieu) {
      return safe(() => this.m('kernel/realms').tuViCan(cg, tieu), null);
    }

    // Linh khí nếu nơi này thành động phủ của mình (giả lập trên bản sao ctx, rồi trả lại như cũ)
    caveQi(ctx, slot) {
      const nc = ctx.run.noiChon;
      const had = Object.prototype.hasOwnProperty.call(nc, slot);
      const old = had ? nc[slot] : undefined;
      try {
        nc[slot] = { ...(old || {}), chuNhan: 'nguoi_choi', dongPhu: { heSo: 1, kho: {}, linhDien: [] } };
        return safe(() => this.m('progress/be_quan').linhKhiTai(ctx, slot), null);
      } finally {
        if (had) nc[slot] = old;
        else delete nc[slot];
      }
    }

    // Bảng nhiệm vụ sư môn, xếp: cấp ≤ mình trước, rồi cống hiến / năm đi đường
    missions(ctx, S) {
      if (!S.sect) return [];
      const viec = safe(() => ctx.run.noiChon[S.sect.slot].treoThuong.viec, []) || [];
      const clean = (t) => String(t).replace(/[\ue000-\ue002]/g, '');
      const out = viec.map((v) => {
        const ten = clean(v.ten);
        const tierName = (ten.match(/·\s*([^·]+)$/) || [])[1] || '';
        const tier = REALM_SHORT.findIndex((r) => tierName.trim().startsWith(r));
        const travel = safe(() => this.m('world/travel').travelYears(ctx, v.slot), 1);
        return { ten: ten.replace(/\s*·\s*[^·]+$/, ''), tier: tierName.trim(), tierIdx: tier < 0 ? 9 : tier, ch: v.congHien || 0, slot: v.slot, travel, id: v.id };
      });
      return out
        .filter((m) => m.tierIdx <= S.cg)
        .sort((a, b) => a.tierIdx - b.tierIdx || b.ch / (0.3 + b.travel) - a.ch / (0.3 + a.travel));
    }

    // Cùng vùng đất với chỗ đang đứng (khác vùng = cách biển, phải đi thuyền ở bến)
    sameLand(ctx, S, slot) {
      return !safe(() => ctx.world.cachNuoc(S.viTri, slot), false);
    }
    // Nơi đã mở mây (đi tới được). Lỗi / thiếu hàm thì coi như đã mở.
    revealed(ctx, slot) {
      return safe(() => this.m('world/suong').slotDaMo(ctx, slot), true) !== false;
    }

    // ---------------------------------------------------------- trạng thái
    status(ctx) {
      const nv = ctx.run.nhanVat;
      const ch = this.m('character/character');
      const ll = this.m('progress/lich_luyen');
      const km = safe(() => this.m('character/kinh_mach').tinhKinhMach(nv, ctx.content), {});
      const bq = safe(() => this.m('progress/be_quan').chuanBiBeQuan(ctx), null);
      const sect = safe(() => this.m('progress/tong_mon').tongMonCua(ctx), null);
      const capBac = safe(() => this.m('progress/tong_mon').CAP_BAC, null);
      const tho = safe(() => ch.thoNguyenToiDa(nv), null);
      const need = this.tuViCan(nv.canhGioi, nv.tieuCanhGioi);
      const bottleneck = safe(() => ch.atBottleneck(nv), false);
      return {
        ten: nv.ten,
        cg: nv.canhGioi,
        tieu: nv.tieuCanhGioi,
        realm: this.realmName(nv.canhGioi, nv.tieuCanhGioi),
        tuVi: nv.tuVi,
        need,
        bottleneck,
        binhCanhCan: bottleneck ? safe(() => ch.binhCanhThreshold(nv), null) : null,
        tuoi: nv.tuoi,
        tho,
        thoCon: tho != null ? tho - nv.tuoi : null,
        nam: ctx.run.nam,
        lt: nv.linhThach,
        ch: nv.congHien,
        thuongThe: nv.thuongThe || 0,
        tamMa: safe(() => nv.chiSo.tam_ma, 0),
        daoTam: safe(() => nv.chiSo.dao_tam, 0),
        linhCan: nv.linhCan,
        speed: safe(() => ch.tocDoTuLuyen(nv, ctx.content), null),
        diemNghich: km.diemNghich || 0,
        coCongPhap: !!km.coCongPhapThong,
        tocDoCP: safe(() => km.biDong.toc_do, 0),
        dotPhaCP: safe(() => km.biDong.dot_pha, 0),
        here: bq && {
          loai: bq.loai,
          ten: bq.ten,
          tuViNam: bq.tuViNam,
          linhKhi: safe(() => bq.linhKhi.ten, '?'),
          heSoNoi: bq.heSoNoi,
          danDung: bq.danDung || [],
          yeuDan: bq.yeuDan || [],
        },
        viTri: ctx.run.viTri,
        viTriTen: this.placeName(ctx, ctx.run.viTri),
        lichLuyen: safe(() => ll.lichLuyen(nv), null),
        lichLuyenMax: safe(() => ll.lichLuyenToiDa(nv.canhGioi), null),
        lichLuyenNam: safe(() => ll.namLichLuyenCon(nv), null),
        sect: sect && {
          slot: sect.slot,
          ten: this.placeName(ctx, sect.slot),
          capBac: sect.capBac,
          capTen: safe(() => capBac[sect.capBac].ten || capBac[sect.capBac], `bậc ${sect.capBac}`),
          congTich: sect.congTich,
        },
        caves: safe(() => this.m('progress/dong_phu').dongPhuCua(ctx), []),
        inCombat: !!ctx.run.tran,
        inEncounter: !!ctx.run.active,
      };
    }

    // ---------------------------------------------------------- đột phá
    btPrep(ctx, lc) {
      return safe(() => this.m('progress/dot_pha').chuanBiDotPha(ctx, lc || { dan: [], thieuDot: 0 }), null);
    }

    breakthrough(ctx, S) {
      if (S.cg >= 5) return { max: true };
      const base = this.btPrep(ctx);
      if (!base) return null;
      const pills = (base.pillOptions || []).filter((p) => !p.reason).map((p) => p.id);
      // Chọn tổ hợp đan tốt nhất trong túi (tối đa 2 loại)
      let best = { dan: [], tiLe: base.tiLe };
      const combos = [[]];
      for (let i = 0; i < pills.length; i++) {
        combos.push([pills[i]]);
        for (let j = i + 1; j < pills.length; j++) combos.push([pills[i], pills[j]]);
      }
      for (const dan of combos) {
        const p = this.btPrep(ctx, { dan, thieuDot: 0 });
        if (p && p.tiLe > best.tiLe) best = { dan, tiLe: p.tiLe };
      }
      const burns = (base.chan ? [] : base.thieuDot || []).map((b, i) => {
        const p = this.btPrep(ctx, { dan: best.dan, thieuDot: i + 1 });
        return { nac: i + 1, nam: b.nam, duoc: b.duoc, tiLe: p ? p.tiLe : null };
      });
      const src = (code) => (base.nguon || []).filter((n) => n.ma === code).reduce((a, n) => a + n.gt, 0);
      const fixes = [];
      // Tu vi chưa đầy
      if (base.som === 1 && S.here && S.need != null) {
        const conThieu = Math.max(0, S.need - S.tuVi);
        fixes.push({ gain: -src('som') || 0.1, text: `Bế quan cho đầy tu vi (còn ${num(conThieu, 0)}, ~${yrs(conThieu / Math.max(1e-6, S.here.tuViNam))} ở đây)`, kind: 'fill' });
      }
      if (src('phan_phe') < 0) fixes.push({ gain: -src('phan_phe'), text: `Tháo mảnh gây điểm nghịch (${S.diemNghich}) khỏi kinh mạch trước khi xung kích`, kind: 'nghich' });
      if (src('thuong_the') < 0) fixes.push({ gain: -src('thuong_the'), text: `Chữa lành thương thế (${INJURY[S.thuongThe]})`, kind: 'heal' });
      if (src('tam_ma') < 0) fixes.push({ gain: -src('tam_ma'), text: `Hạ tâm ma (đang ${S.tamMa}): Thanh Tâm Đan khi xung kích trừ 15, trà/hương/hoàn hạ tâm ma`, kind: 'tamma' });
      if (src('that_bai') < 0) {
        const heal = this.scarPills(S.cg + 1);
        fixes.push({ gain: -src('that_bai'), text: `Chữa đạo cơ chấn tổn bằng ${heal.map((h) => h.ten).join(' / ') || 'đan ôn dưỡng đạo cơ'}${heal[0] ? ` (${heal[0].nguon})` : ''}`, kind: 'scar' });
      }
      if (src('linh_khi') < 0) fixes.push({ gain: -src('linh_khi'), text: 'Xung kích ở chỗ linh khí tốt hơn (động phủ ở linh địa linh khí cao, hoặc mượn linh mạch)', kind: 'lk' });
      if (!(base.nguon || []).some((n) => n.ma === 'noi' || n.ma === 'noi_su_mon')) {
        fixes.push({ gain: S.cg + 1 >= 4 ? 0.05 : 0.1, text: 'Xung kích trong động phủ của mình (+10%, Nguyên Anh trở lên +5%) hoặc ở sư môn (+5%)', kind: 'noi' });
      }
      if (!(base.nguon || []).some((n) => n.ma === 'ho_phap')) {
        fixes.push({ gain: 0.05, text: 'Có hộ pháp: một người quen (cảnh giới chênh < 2) đang ở cùng chỗ, cùng nước: +5%', kind: 'hophap' });
      }
      // Đan đột phá chưa có trong túi
      const shopPills = (base.tiLe >= 1 ? [] : this.breakPills(S.cg + 1))
        .filter((p) => !best.dan.includes(p.id) && ((this.item(p.id) || {}).canh_gioi ?? 0) <= S.cg + 1)
        .slice(0, 3);
      for (const p of shopPills) fixes.push({ gain: p.gt, text: `${p.ten} (${sgnPct(p.gt)}): ${this.sources(p.id)}`, kind: 'pill', id: p.id });
      fixes.sort((a, b) => b.gain - a.gain);
      // Tỉ lệ nếu tu tới Đại viên mãn đầy (bỏ phạt "đột phá sớm") và số tu vi / năm cần để tới đó
      const somPen = src('som');
      const fullTiLe = Math.max(0, Math.min(1, best.tiLe - somPen));
      let fillTv = 0;
      if (base.som) {
        const bcT = safe(() => this.m('character/character').BINH_CANH_TIEU, [])[S.cg] || 0;
        for (let t = S.tieu; t <= 3; t++) {
          const need = this.tuViCan(S.cg, t) || 0;
          fillTv += t === S.tieu ? Math.max(0, need - S.tuVi) : need;
          if (t < 3) fillTv += bcT * need;
        }
      }
      const fillYears = S.here ? fillTv / Math.max(1e-6, S.here.tuViNam) : null;
      return {
        fullTiLe,
        fillTv,
        fillYears,
        target: S.cg + 1,
        targetTen: REALM_SHORT[S.cg + 1],
        chan: base.chan || null,
        som: base.som,
        tiLe: base.tiLe,
        best,
        bestTen: best.dan.map((d) => this.itemName(d)),
        nguon: (base.nguon || []).filter((n) => n.ma !== 'floor').map((n) => ({ ten: n.ten, gt: n.gt, ma: n.ma })),
        burns,
        tamMa: base.tamMa || null,
        cho: base.cho || null,
        fixes,
        namXungKich: safe(() => this.realmDef(S.cg + 1).namXungKich, null),
      };
    }

    // Đan trợ đột phá (theo content) lên cảnh giới `target`. Danh sách tĩnh: cache.
    // `withSrc`: số món đầu được tra nguồn (itemSources chậm ~80 ms/món).
    breakPills(target, withSrc = 0) {
      this._pillCache = this._pillCache || new Map();
      if (!this._pillCache.has(target)) {
        const out = [];
        for (const it of safe(() => [...this.tt.content.items.values()], [])) {
          const d = it.dot_pha;
          if (!d || !d.ti_le) continue;
          if (d.canh_gioi !== undefined && d.canh_gioi !== target) continue;
          out.push({ id: it.id, ten: it.ten, gt: d.ti_le, gia: it.gia });
        }
        this._pillCache.set(target, out.sort((a, b) => b.gt - a.gt));
      }
      return this._pillCache.get(target).map((p, i) => (i < withSrc ? { ...p, nguon: this.sources(p.id) } : p));
    }
    scarPills(target) {
      this._scarCache = this._scarCache || new Map();
      if (!this._scarCache.has(target)) {
        const out = [];
        for (const it of safe(() => [...this.tt.content.items.values()], [])) {
          const u = (it.dung || []).find((x) => x && x.heal_breakthrough_scar !== undefined);
          if (u && u.heal_breakthrough_scar === target) out.push({ id: it.id, ten: it.ten, gia: it.gia });
        }
        this._scarCache.set(target, out);
      }
      return this._scarCache.get(target).map((p, i) => (i < 1 ? { ...p, nguon: this.sources(p.id) } : p));
    }
    // Nguồn của một món (tiệm / luyện / phần thưởng). Phụ thuộc vị trí (chỗ gần nhất) nên cache theo vị trí.
    sources(itemId) {
      const ctx = this._ctx;
      const key = `${itemId}@${ctx ? ctx.run.viTri : ''}`;
      this._srcCache = this._srcCache || new Map();
      if (!this._srcCache.has(key)) {
        const arr = safe(() => this.m('world/lookup').itemSources(ctx, itemId), []);
        this._srcCache.set(key, arr.map((s) => s.text).slice(0, 2).join(' ') || 'chưa rõ nguồn');
      }
      return this._srcCache.get(key);
    }

    // ---------------------------------------------------------- chỗ tu luyện
    // Tu vi/năm ở `slot` nếu ngồi ở đó theo từng kiểu chỗ, dùng hàm lõi linhKhiTai.
    sites(ctx, S) {
      const w = ctx.world;
      const bq = this.m('progress/be_quan');
      const dp = this.m('progress/dong_phu');
      const wm = this.m('world/wild_master');
      const noi = this.m('world/noi');
      const dh = this.m('encounter/do_hiem');
      const CHO = safe(() => bq.CHO_BE_QUAN, {});
      const HSDP = safe(() => dp.HE_SO_DONG_PHU, { trong: 1, phe_tich: 1.15, son_thuy: 1.25 });
      const speed = S.speed || 1;
      const all = safe(() => (Array.isArray(w.slots) ? w.slots : [...w.slots.values()]), []);
      const here = S.viTri;
      const maxDist = 900; // gần như cả vùng; còn mây vẫn tính (đi qua ô đã mở gần nhất)
      const own = new Set(S.caves || []);
      const rows = [];
      for (const sl of all) {
        const id = sl.id || sl;
        const d = safe(() => w.distance(here, id), Infinity);
        if (!(d <= maxDist) && !own.has(id) && id !== (S.sect && S.sect.slot)) continue;
        if (!this.sameLand(ctx, S, id)) continue;
        const fog = !this.revealed(ctx, id);
        const info = safe(() => w.info(id), null);
        if (!info || !info.diaDanh) continue;
        const lk = safe(() => bq.linhKhiTai(ctx, id), null);
        if (!lk) continue;
        const kind = safe(() => noi.placeKind(ctx, ctx.run, id).id, '');
        let seat = null;
        let caveLk = null;
        let seatTen = '';
        let note = '';
        let action = '';
        if (own.has(id)) {
          seat = safe(() => ctx.run.noiChon[id].dongPhu.heSo, 1.1);
          seatTen = 'Động phủ của ngươi';
          action = 'Về động phủ bế quan';
        } else if (S.sect && id === S.sect.slot) {
          seat = safe(() => CHO.tong_mon.heSo, 1);
          seatTen = 'Động phủ đệ tử (sư môn)';
          action = 'Về sư môn bế quan';
        } else {
          // undefined = khai phủ được; lỗi = không biết → coi như không khai được
          let why;
          try {
            why = dp.lyDoKhongLap(ctx, id) || '';
          } catch (e) {
            why = 'không kiểm tra được';
          }
          const wild = safe(() => CHO[bq.loaiChoBeQuan(ctx, id)].heSo, 0.9);
          if (!why || /tối đa/.test(why)) {
            const k = /phe_tich/.test(kind) ? 'phe_tich' : /son_thuy/.test(kind) ? 'son_thuy' : 'trong';
            const vacant = safe(() => wm.isWildMasterVacant(ctx, id), false);
            seat = (HSDP[k] || 1) * (vacant ? 1.1 : 1);
            seatTen = `Khai động phủ (×${num(seat, 2)})`;
            action = why ? 'Khai phủ (phải bỏ động phủ cũ: đã đủ số)' : 'Khai phủ rồi bế quan';
            // Khai phủ xong, game tính linh khí theo nền của ô (capNen) chứ không theo linh khí trường:
            // giả lập "đã là động phủ của mình" trên bản sao ctx rồi hỏi lại game.
            caveLk = this.caveQi(ctx, id);
          } else {
            const cho = safe(() => bq.loaiChoBeQuan(ctx, id), 'hoang_da');
            seat = wild;
            seatTen = safe(() => CHO[cho].ten, 'Ngoài trời');
            action = `Bế quan (${seatTen.toLowerCase()}, 1 mốc / lần)`;
            note = why;
          }
        }
        const master = safe(() => wm.wildMasterAt(ctx, id), null);
        // Nếu đánh thắng chủ: khai phủ được, ×1,1
        let ifWin = null;
        if (master) {
          const k = /phe_tich/.test(kind) ? 'phe_tich' : /son_thuy/.test(kind) ? 'son_thuy' : 'trong';
          ifWin = 5 * speed * (HSDP[k] || 1) * 1.1 * (this.caveQi(ctx, id) || lk).heSo;
        }
        const chenh = safe(() => dh.doChenh(this.tt.game.env, ctx.run, id), null);
        const muc = chenh != null ? safe(() => dh.mucHiem(chenh), null) : null;
        const lkUse = caveLk || lk;
        const tvNam = 5 * speed * seat * lkUse.heSo;
        rows.push({
          choLoai: safe(() => bq.loaiChoBeQuan(ctx, id), ''),
          slot: id,
          ten: this.placeName(ctx, id),
          dist: d,
          qi: safe(() => this.m('world/spirit_qi').spiritQi(ctx, id), info.capNen),
          lk: lkUse.ten,
          lkHeSo: lkUse.heSo,
          seat,
          seatTen,
          action,
          tvNam,
          ifWin,
          note,
          master: master && { title: master.title, ten: safe(() => ctx.content.enemies.get(master.enemyId).ten, master.enemyId), cg: safe(() => ctx.content.enemies.get(master.enemyId).canh_gioi, null) },
          danger: muc ? muc.ten : '?',
          dangerId: muc ? muc.id : '',
          own: own.has(id) || (S.sect && id === S.sect.slot),
          matBi: safe(() => noi.coMatBi(ctx, ctx.run, id), false),
          visited: !!ctx.run.noiChon[id],
          fog,
        });
      }
      const safeRows = rows.filter((r) => r.dangerId !== 'tu_dia');
      // Ưu tiên tốc độ; hòa thì chỗ ngồi lâu được (động phủ / sư môn) rồi gần hơn
      safeRows.sort((a, b) => b.tvNam - a.tvNam || b.seat - a.seat || a.dist - b.dist);
      const top = safeRows.slice(0, 8);
      for (const r of top) r.travel = safe(() => this.m('world/travel').travelYears(ctx, r.slot), null);
      // Chỗ an toàn/ngang sức tốt nhất (dùng cho lộ trình và lời khuyên dời chỗ)
      const safeBest = safeRows.find((r) => ['an_toan', 'ngang_suc'].includes(r.dangerId)) || top[0] || null;
      if (safeBest && safeBest.travel === undefined) safeBest.travel = safe(() => this.m('world/travel').travelYears(ctx, safeBest.slot), null);
      // Chỗ có chủ: đánh thắng thì khai phủ ×1,1, xếp theo tốc độ nếu thắng
      const masters = rows
        .filter((r) => r.master && r.ifWin && r.ifWin > (safeBest ? safeBest.tvNam : 0) && r.dangerId !== 'tu_dia')
        .sort((a, b) => b.ifWin - a.ifWin || a.dist - b.dist)
        .slice(0, 5);
      for (const r of masters) r.travel = safe(() => this.m('world/travel').travelYears(ctx, r.slot), null);
      const secrets = rows.filter((r) => r.matBi && !r.visited).sort((a, b) => a.dist - b.dist).slice(0, 5);
      for (const r of secrets) r.travel = safe(() => this.m('world/travel').travelYears(ctx, r.slot), null);
      const allSafe = rows.filter((r) => ['an_toan', 'ngang_suc'].includes(r.dangerId)).sort((a, b) => a.dist - b.dist).slice(0, 30);
      const sectRow = S.sect ? rows.find((r) => r.slot === S.sect.slot) || null : null;
      if (sectRow && sectRow.travel === undefined) sectRow.travel = safe(() => this.m('world/travel').travelYears(ctx, sectRow.slot), null);
      return { top, safeBest, sectRow, masters, secrets, allSafe, hereRate: S.here ? S.here.tuViNam : null };
    }

    // ---------------------------------------------------------- lộ trình
    plan(ctx, S, target, sites, bt) {
      if (target <= S.cg) return { done: true, target };
      const bcTieu = safe(() => this.m('character/character').BINH_CANH_TIEU, [0, 0, 0.15, 0.2, 0.25, 0.3]);
      const base = sites && (sites.safeBest || sites.top[0]);
      const spiritQi = base ? base.qi : null;
      const bestSeat = base ? base.seat : 1;
      const lkLevels = safe(() => this.m('progress/be_quan').LINH_KHI, null);
      const lkHeSoAt = (tier) => {
        if (spiritQi == null) return base ? base.lkHeSo : 0.85;
        const diff = spiritQi - tier;
        const arr = Array.isArray(lkLevels) && lkLevels.length ? lkLevels : [{ max: -1.5, heSo: 0.7 }, { max: -0.5, heSo: 0.85 }, { max: 0.5, heSo: 1 }, { max: Infinity, heSo: 1.25 }];
        for (const l of arr) if (diff <= (l.max ?? Infinity)) return l.heSo;
        return arr[arr.length - 1].heSo;
      };
      const speed = S.speed || 1;
      const steps = [];
      let age = S.tuoi;
      let ok = true;
      for (let r = S.cg; r < target; r++) {
        const def = this.realmDef(r);
        let tv = 0;
        const startTieu = r === S.cg ? S.tieu : 0;
        for (let t = startTieu; t <= 3; t++) {
          const need = this.tuViCan(r, t) || 0;
          const have = r === S.cg && t === S.tieu ? Math.min(S.tuVi, need) : 0;
          tv += need - have;
          if (t < 3) tv += (bcTieu[r] || 0) * need; // bình cảnh giữa tiểu cảnh giới
        }
        const tier = r + 0.375; // giữa cảnh giới
        const rate = 5 * speed * bestSeat * lkHeSoAt(tier);
        const years = tv / Math.max(1e-6, rate);
        const next = this.realmDef(r + 1);
        // Tỉ lệ xung kích ước lượng: hiện tại (nếu đúng cảnh giới) hoặc gốc + động phủ + công pháp + đan tốt nhất
        let p;
        if (r === S.cg && bt && bt.planP != null) p = bt.planP;
        else if (r === S.cg && bt && bt.best && bt.fullTiLe != null) p = bt.fullTiLe;
        else {
          const pills = this.breakPills(r + 1).filter((x) => ((this.item(x.id) || {}).canh_gioi ?? 0) <= r + 1).slice(0, 2).reduce((a, x) => a + x.gt, 0);
          const burnT = safe(() => this.m('balance/breakthrough').THIEU_DOT.tiLe[r + 1], 0.08);
          // gốc + động phủ + linh khí dồi dào + 2 đan + hộ pháp + tâm pháp + đốt 1 nấc thọ
          p = Math.min(0.95, (next ? next.tiLeDotPha : 0.1) + (r + 1 >= 4 ? 0.05 : 0.1) + 0.05 + pills + 0.05 + 0.06 + burnT);
        }
        p = Math.max(0.02, p);
        const tries = 1 / p;
        const btYears = (next ? next.namXungKich || 1 : 1) * tries + Math.max(0, tries - 1) * 4; // hồi phục trung bình 4 năm mỗi lần hỏng
        const tho = def ? def.thoNguyen : null;
        const endAge = age + years + btYears;
        const margin = tho != null ? tho - endAge : null;
        if (margin != null && margin < 0) ok = false;
        // Tốc độ tối thiểu để kịp thọ (chừa thời gian xung kích)
        const budget = tho != null ? tho - age - btYears : null;
        const needRate = budget != null && budget > 0 ? tv / budget : null;
        steps.push({ realm: r, ten: REALM_SHORT[r], toTen: REALM_SHORT[r + 1], tuVi: tv, rate, years, p, btYears, tho, startAge: age, endAge, margin, needRate });
        age = endAge;
      }
      return { target, steps, ok, totalYears: age - S.tuoi };
    }

    // ---------------------------------------------------------- sự kiện đang mở
    encounter(ctx) {
      const v = safe(() => this.tt.game.encounterView(), null);
      if (!v || v.done) return null;
      // Địch bỏ chạy: đuổi khi tỉ lệ bắt kịp cao (nó yếu hơn mình), không thì buông
      if (v.waiting === 'enemy_escape') {
        const opts = safe(() => this.tt.game.pursuitOptions(), []) || [];
        const chase = opts.find((o) => o.id === 'chase');
        const pc = chase ? Number((String(chase.moTa).match(/(\d+)%/) || [])[1] || 0) / 100 : 0;
        const pick = chase && pc >= 0.7 && (ctx.run.nhanVat.thuongThe || 0) < 2 ? chase : opts.find((o) => o.id === 'release') || opts[0];
        return { id: v.id, ten: v.ten, noi: v.noi, kind: v.kind, pursuit: pick ? pick.id : null, pursuitTen: pick ? `${pick.ten} (${pick.moTa})` : '', choices: [], rec: null };
      }
      // Thắng xong, game chờ xử lý kẻ bại
      if (v.waiting === 'xu_tri') {
        const opts = safe(() => this.tt.game.cachXuTri(), []) || [];
        const pick = opts.find((o) => o.id === 'ket_lieu') || opts[0];
        return { id: v.id, ten: v.ten, noi: v.noi, kind: v.kind, xuTri: pick ? pick.id : null, xuTriTen: pick ? pick.ten : '', choices: [], rec: null, opts };
      }
      const def = safe(() => ctx.content.encounters.get(v.id), null);
      // Tiện ích (tiệm, bảo khố, chấp sự…) không phải "sự kiện may rủi": không chấm điểm
      // (săn yêu cũng là "tiện ích" nhưng có trận: vẫn chấm)
      const hasRisk = (v.choices || []).some((c) => c.risk);
      if (!def || v.kind === 'cua_hang' || (def.tien_ich && !hasRisk)) return { id: v.id, ten: v.ten, noi: v.noi, kind: v.kind, utility: true, choices: [], rec: null };
      const list = safe(() => this.m('encounter/encounter').currentChoices(ctx, def, ctx.run.active), def ? def.choices : []);
      const choices = (v.choices || []).map((c) => {
        const raw = list ? list[c.index] : null;
        const fx = raw ? this.summarizeChoice(raw) : { gains: [], losses: [], combat: false, sc: { sure: 0, ok: 0, fail: 0 }, hasCheck: false };
        const p = this.chanceOf(c.chance, raw, ctx);
        const risks = { sure: c.risk || this.combatRisk(ctx, fx.cb.sure), ok: this.combatRisk(ctx, fx.cb.ok), fail: this.combatRisk(ctx, fx.cb.fail) };
        const q = fx.hasCheck ? (p == null ? 0.5 : p) : 1;
        const pFight = fx.cb.sure ? 1 : (fx.cb.ok ? q : 0) + (fx.cb.fail ? 1 - q : 0);
        const worst = [risks.sure, risks.ok, risks.fail].filter(Boolean).sort((a, b) => this.riskRank(b) - this.riskRank(a))[0] || null;
        const risk = this.riskOf(worst);
        const score = this.scoreChoice(fx, p, risks, ctx.run.nhanVat.thuongThe || 0);
        if (fx.combat) fx.losses.unshift(`${pFight >= 0.999 ? 'chắc chắn' : `${Math.round(pFight * 100)}%`} phải đánh`);
        return {
          index: c.index,
          text: String(c.text || '').replace(/\s+/g, ' ').trim(),
          available: c.available !== false,
          locked: c.lockedReason || '',
          p,
          risk,
          gains: fx.gains,
          losses: fx.losses,
          combat: fx.combat,
          leave: !!c.thoat,
          score,
        };
      });
      const avail = choices.filter((c) => c.available);
      let rec = null;
      if (avail.length) rec = avail.reduce((a, b) => (b.score > a.score ? b : a));
      return { id: v.id, ten: v.ten, noi: v.noi, kind: v.kind, waiting: v.waiting, choices, rec: rec && rec.index };
    }
    chanceOf(chance, raw, ctx) {
      if (chance == null) {
        if (raw && raw.check) return safe(() => this.m('kernel/checks').checkChance(ctx, raw.check), null);
        return null;
      }
      if (typeof chance === 'number') return chance;
      for (const k of ['p', 'tiLe', 'ti_le', 'value', 'chance']) if (typeof chance[k] === 'number') return chance[k];
      if (raw && raw.check) return safe(() => this.m('kernel/checks').checkChance(ctx, raw.check), null);
      return null;
    }
    riskRank(r) {
      return { an_toan: 0, ngang_suc: 1, unknown: 2, hiem: 3, tu_dia: 4 }[r && r.level] ?? 2;
    }
    riskOf(risk) {
      if (!risk) return { text: '', bad: false };
      const LV = { an_toan: 'an toàn (thắng gọn)', ngang_suc: 'ngang sức (thắng nhưng bị thương)', hiem: 'HIỂM (dự kiến thua)', tu_dia: 'TỬ ĐỊA', unknown: 'không dò ra' };
      const lvl = typeof risk === 'object' ? risk.level : String(risk);
      const t = `${LV[lvl] || lvl}${risk.enemy ? ` vs ${risk.enemy}` : ''}${risk.realm ? ` (${risk.realm})` : ''}`;
      return { text: t, bad: ['hiem', 'tu_dia', 'unknown'].includes(lvl), level: lvl, raw: risk };
    }
    // Tóm tắt hệ quả một lựa chọn. Điểm tách 3 phần:
    //   sure = hiệu ứng chắc chắn (effects), ok = khi thành (success/partial), fail = khi bại (failure).
    // Thang điểm thô, chỉ để xếp hạng: tu vi (năm) ×3, linh thạch (bậc) ×2, chỉ số 4, thương thế −6/bậc…
    summarizeChoice(ch) {
      const gains = [];
      const losses = [];
      const sc = { sure: 0, ok: 0, fail: 0 };
      const cb = { sure: null, ok: null, fail: null }; // hiệu ứng combat đầu tiên của từng nhánh
      let combat = false;
      const walk = (arr, side) => {
        for (const e of arr || []) {
          if (!e || typeof e !== 'object') continue;
          if (e.combat !== undefined) {
            combat = true;
            if (!cb[side]) cb[side] = e;
          }
          const plus = (txt, v) => {
            if (side !== 'fail') gains.push(txt);
            sc[side] += v;
          };
          const minus = (txt, v) => {
            losses.push(side === 'fail' ? `nếu bại: ${txt}` : txt);
            sc[side] -= v;
          };
          if (e.tu_vi !== undefined && e.tu_vi > 0) plus(`tu vi ~${e.tu_vi} năm`, 3 * e.tu_vi);
          if (e.linh_thach !== undefined) {
            // {bac: n} = theo bậc cảnh giới (nhân với giá chuẩn), số thường / {so} = linh thạch thô
            const o = typeof e.linh_thach === 'object' ? e.linh_thach : { so: e.linh_thach };
            if (o.bac !== undefined) {
              if (o.bac > 0) plus(`linh thạch (×${o.bac} theo cảnh giới)`, 2 * o.bac);
              else if (o.bac < 0) minus(`mất linh thạch (×${-o.bac} theo cảnh giới)`, 2 * -o.bac);
            } else if (typeof o.so === 'number') {
              if (o.so > 0) plus(`+${o.so} linh thạch`, o.so / 20);
              else if (o.so < 0) minus(`${o.so} linh thạch`, -o.so / 20);
            }
          }
          if (e.cong_hien !== undefined) {
            const v = typeof e.cong_hien === 'object' ? e.cong_hien.so : e.cong_hien;
            if (v > 0) plus(`cống hiến +${v}`, v / 8);
            else if (v < 0) minus(`cống hiến ${v}`, -v / 8);
          }
          if (e.add_item !== undefined) plus('nhận vật phẩm', 1.5);
          if (e.treo_thuong_xong) plus('xong nhiệm vụ (nhận thưởng)', 8);
          if (e.stat) plus('tăng chỉ số', 4);
          if (e.dao_tam !== undefined && e.dao_tam > 0) plus(`đạo tâm +${e.dao_tam}`, 2);
          if (e.tho_nguyen !== undefined) {
            if (e.tho_nguyen > 0) plus(`thọ +${e.tho_nguyen}`, e.tho_nguyen / 5);
            else minus(`thọ ${e.tho_nguyen}`, -e.tho_nguyen / 2);
          }
          if (e.tu_luyen) plus(`tu luyện ${yrs(e.tu_luyen.nam)}`, 1.5 * (e.tu_luyen.nam || 0) * (e.tu_luyen.he_so || 1));
          if (e.injury !== undefined) minus(`thương thế +${e.injury}`, 6 * e.injury);
          if (e.time !== undefined && e.time > 0.05) minus(`tốn ${yrs(e.time)}`, 2 * e.time);
          if (e.tam_ma !== undefined && e.tam_ma > 0) minus(`tâm ma +${e.tam_ma}`, e.tam_ma);
        }
      };
      walk(ch.effects, 'sure');
      walk(ch.success, 'ok');
      walk(ch.partial, 'ok');
      walk(ch.failure, 'fail');
      const uniq = (a) => [...new Set(a)];
      return { gains: uniq(gains), losses: uniq(losses), combat, cb, sc, hasCheck: !!ch.check };
    }
    // Mức hiểm của một trận (dùng mô phỏng trận của game). an_toan / ngang_suc / hiem / tu_dia / unknown
    combatRisk(ctx, eff) {
      if (!eff) return null;
      return safe(() => this.m('encounter/choice_risk').revealedCombatRisk(ctx, eff.combat, eff), null);
    }
    // Điểm kỳ vọng với xác suất thành p (không có check: coi như chắc thành), trừ rủi ro trận theo xác suất phải đánh
    scoreChoice(fx, p, risks, injury) {
      const q = fx.hasCheck ? (p == null ? 0.5 : p) : 1;
      let v = fx.sc.sure + q * fx.sc.ok + (1 - q) * fx.sc.fail;
      // Trận thắng gọn còn được lịch luyện (+2) và chiến lợi phẩm: gần như có lợi
      const PEN = { an_toan: -1, ngang_suc: 6, hiem: 30, tu_dia: 80, unknown: 15 };
      const pen = (r) => (r ? PEN[r.level] ?? 15 : 8) * (injury >= 2 && r && r.level !== 'an_toan' ? 5 : 1);
      if (fx.cb.sure) v -= pen(risks.sure);
      else {
        if (fx.cb.ok) v -= q * pen(risks.ok);
        if (fx.cb.fail) v -= (1 - q) * pen(risks.fail);
      }
      return v;
    }

    // ---------------------------------------------------------- trận đang mở
    combat(ctx, S) {
      if (!ctx.run.tran) return null;
      const dk = safe(() => this.tt.game.duKienTran(), null);
      const out = { raw: dk, text: '', win: null, advice: [] };
      if (dk) {
        out.win = dk.thang ?? dk.win ?? null;
        const kq = dk.ketQua || {};
        const hurt = INJURY[kq.thuongThe || 0];
        if (kq.enemyFled) out.text = `Dự kiến: đối phương tháo chạy sau ${dk.nHiep} hiệp.`;
        else if (out.win) out.text = `Dự kiến THẮNG sau ${dk.nHiep} hiệp, mất ~${Math.round(dk.khiHuyetMat || 0)} khí huyết${kq.thuongThe ? ` (${hurt.toLowerCase()})` : ''}.`;
        else out.text = `Dự kiến THUA sau ${dk.nHiep} hiệp${kq.thuongThe ? ` → ${hurt.toLowerCase()}` : ''}${kq.biCuop ? `, bị cướp ~${Math.round(kq.biCuop * 100)}% túi` : ''}. Sát thương ta ${Math.round(dk.stTa || 0)}/hiệp, địch ${Math.round(dk.stDich || 0)}/hiệp.`;
      }
      if (S.thuongThe >= 2) out.advice.push({ lv: 'urgent', text: 'Đang thương nặng: THUA LÀ CHẾT. Chỉ đánh khi chắc thắng với dư máu, không thì bỏ chạy.' });
      if (out.win === false) {
        const kq = (dk && dk.ketQua) || {};
        const thoCon = S.thoCon || 0;
        out.advice.push({
          lv: 'urgent',
          text: `Dự kiến không thắng: Bỏ chạy. Ưu tiên "Ném đồ dụ địch" bằng đồ rẻ / linh thạch (yêu thú không nhận linh thạch). ${
            thoCon > 40
              ? `Không đủ đồ ném thì Huyết độn (đốt vài năm thọ, chắc thoát): thọ còn ${Math.round(thoCon)} năm nên rẻ hơn thua trận${kq.thuongThe ? ` (${INJURY[kq.thuongThe].toLowerCase()}, mất ~${Math.round((kq.biCuop || 0) * 100)}% túi)` : ''}.`
              : 'Thọ còn ít: tránh Huyết độn, ném đồ là chính.'
          }`,
        });
      }
      if (S.diemNghich > 0) out.advice.push({ lv: 'warn', text: `Điểm nghịch ${S.diemNghich}: mỗi lượt có thể phản phệ. Sau trận tháo mảnh tương khắc.` });
      out.throwables = this.throwables(ctx);
      return out;
    }
    // Đồ nên ném khi bỏ chạy: không phải đan đột phá / chữa, không phải mảnh đang lắp
    throwables(ctx) {
      const nv = ctx.run.nhanVat;
      const equipped = new Set(safe(() => this.m('character/kinh_mach').tinhKinhMach(nv, ctx.content).manh.map((m) => m.item && (m.item.id || m.item)), []));
      const out = [];
      for (const [id, n] of Object.entries(nv.tuiDo || {})) {
        if (!(n > 0) || equipped.has(id)) continue;
        const it = this.item(id);
        if (!it) continue;
        const keep = it.dot_pha || (it.dung || []).some((u) => u && (u.heal_breakthrough_scar !== undefined || u.heal !== undefined || u.tho_nguyen !== undefined));
        out.push({ id, ten: it.ten, so: n, gia: it.gia || 0, keep: !!keep });
      }
      return out.sort((a, b) => a.keep - b.keep || a.gia - b.gia);
    }

    // ---------------------------------------------------------- nên mua gì
    // Danh sách món đáng mua, ưu tiên nhỏ = gấp. Chỉ món chưa có trong túi.
    wishlist(ctx, S, bt) {
      const nv = ctx.run.nhanVat;
      const have = (id) => (nv.tuiDo[id] || 0) > 0;
      const items = safe(() => [...this.tt.content.items.values()], []);
      const W = [];
      const push = (it, why, prio) => {
        if (!it || have(it.id) || W.some((w) => w.id === it.id)) return;
        W.push({ id: it.id, ten: it.ten, why, prio, gia: it.gia || 0 });
      };
      if (!S.coCongPhap) push(this.item('item.dan_khi_quyet'), 'Công pháp nhập môn: không có thì tu ×0,5', 0);
      // Món dùng được ở cảnh giới này hoặc kế tiếp (không gợi ý đan Hóa Thần cho Phàm Nhân)
      const reachable = (it) => (it.canh_gioi ?? 0) <= S.cg + 1;
      const baseRate = safe(() => this.realmDef(S.cg + 1).tiLeDotPha, 0);
      if (bt && !bt.max && baseRate < 1) {
        if ((bt.nguon || []).some((n) => n.ma === 'that_bai')) for (const p of this.scarPills(S.cg + 1)) push(this.item(p.id), `Chữa đạo cơ chấn tổn: mỗi viên +5% khi lên ${REALM_SHORT[S.cg + 1]}`, 0.5);
        for (const p of this.breakPills(S.cg + 1).filter((p) => reachable(this.item(p.id) || {})).slice(0, 3)) push(this.item(p.id), `Đột phá lên ${REALM_SHORT[S.cg + 1]} ${sgnPct(p.gt)} (tối đa 2 loại / lần)`, 1);
      }
      // Đan tu luyện đúng cảnh giới hiện tại
      const tl = items
        .filter((it) => it.tu_luyen && it.tu_luyen.canh_gioi === S.cg)
        .sort((a, b) => b.tu_luyen.toc_do * b.tu_luyen.nam - a.tu_luyen.toc_do * a.tu_luyen.nam)
        .slice(0, 2);
      const half = (S.speed || 0) > 1.5 ? ' (tốc độ đã quá ×1,5 nên đan chỉ còn ~nửa sức)' : '';
      for (const it of tl) push(it, `Bế quan +${Math.round(it.tu_luyen.toc_do * 100)}% trong ${it.tu_luyen.nam} năm${half}`, 1.5);
      // Đan phá bình cảnh của cảnh giới hiện tại
      const bc = items.find((it) => (it.dung || []).some((u) => u && u.pha_binh_canh && u.pha_binh_canh.canh_gioi === S.cg));
      if (bc) push(bc, 'Phá bình cảnh giữa các tiểu cảnh giới (tiết kiệm vài năm tích lũy)', S.bottleneck ? 0.2 : 2.5);
      // Hạ tâm ma (rẻ)
      if (S.tamMa > 0) {
        const tm = items
          .filter((it) => (it.dung || []).some((u) => u && u.tam_ma < 0) && (it.canh_gioi ?? 0) <= S.cg && !(it.tu_luyen))
          .sort((a, b) => (a.gia || 0) - (b.gia || 0))
          .slice(0, 2);
        for (const it of tm) push(it, `Hạ tâm ma ${(it.dung.find((u) => u && u.tam_ma < 0) || {}).tam_ma} (đang ${S.tamMa}: mỗi điểm −1% đột phá)`, 2);
      }
      return W.sort((a, b) => a.prio - b.prio);
    }

    // Quét tiệm quanh đây: món trong wishlist đang bày bán ở đâu (hàng thật, theo kỳ hàng của game)
    shops(ctx, S, wish) {
      if (!wish.length) return { byItem: {}, scanned: 0 };
      // Quét lại khi đổi chỗ, đổi danh sách, hoặc mỗi 3 năm (kỳ hàng của tiệm)
      const key = `${S.viTri}|${Math.floor(ctx.run.nam / 3)}|${wish.map((w) => w.id).join(',')}`;
      if (this._shopCache && this._shopCache.key === key) return this._shopCache.val;
      const w = ctx.world;
      const dir = this.m('encounter/director');
      const mk = this.m('encounter/shop/market');
      const noi = this.m('world/noi');
      const want = new Set(wish.map((x) => x.id));
      const wild = /son_thuy|hoang_da|di_tich|bi_canh|linh_mach|dong_phu|bien/;
      const all = safe(() => (Array.isArray(w.slots) ? w.slots : [...w.slots.values()]), []);
      const byItem = {};
      const boards = [];
      let scanned = 0;
      for (const sl of all) {
        const id = sl.id || sl;
        const d = safe(() => w.distance(S.viTri, id), Infinity);
        if (!(d <= 520)) continue;
        if (!this.sameLand(ctx, S, id)) continue;
        const info = safe(() => w.info(id), null);
        if (!info || !info.diaDanh) continue;
        const kind = safe(() => noi.placeKind(ctx, ctx.run, id).id, '');
        if (wild.test(kind)) continue;
        this._shopIds = this._shopIds || new Map(); // tiệm của một nơi gần như cố định
        this._boardAt = this._boardAt || new Map();
        if (!this._shopIds.has(id)) {
          const acts = safe(() => dir.placeActivities(ctx, id), []);
          this._shopIds.set(id, acts.map((a) => a.id).filter((eid) => safe(() => ctx.content.encounters.get(eid).kind === 'cua_hang', false)));
          this._boardAt.set(id, acts.some((a) => a.id === 'ev.bang_treo_thuong'));
        }
        if (this._boardAt.get(id)) boards.push({ slot: id, ten: this.placeName(ctx, id), dist: d });
        const shopIds = this._shopIds.get(id);
        if (!shopIds.length) continue;
        scanned++;
        const stock = safe(() => mk.shopItemsAt(ctx, shopIds, id), []);
        for (const itemId of stock) {
          if (!want.has(itemId)) continue;
          (byItem[itemId] = byItem[itemId] || []).push({ slot: id, ten: this.placeName(ctx, id), dist: d, shopIds, shops: shopIds.map((e) => safe(() => ctx.content.encounters.get(e).ten, e)) });
        }
      }
      for (const arr of Object.values(byItem)) {
        arr.sort((a, b) => a.dist - b.dist);
        for (const s of arr.slice(0, 2)) s.travel = safe(() => this.m('world/travel').travelYears(ctx, s.slot), null);
      }
      boards.sort((a, b) => a.dist - b.dist);
      for (const b of boards.slice(0, 2)) b.travel = safe(() => this.m('world/travel').travelYears(ctx, b.slot), null);
      const val = { byItem, scanned, boards: boards.slice(0, 2) };
      this._shopCache = { key, val };
      return val;
    }

    // Điểm đến trên bản đồ (theo thứ tự ưu tiên; điểm đầu là điểm chính)
    targets(ctx, S, sites, wish, shops, sect, actions) {
      const T = [];
      const xy = (slot) => safe(() => ctx.world.slot(slot), null);
      const add = (slot, kind, label, why) => {
        const p = xy(slot);
        if (!p || T.some((t) => t.slot === slot && t.kind === kind)) return;
        T.push({ slot, kind, label, why, x: p.x, y: p.y, ten: this.placeName(ctx, slot) });
      };
      for (const a of actions) if (a.slot && a.kind) add(a.slot, a.kind, a.mapLabel || a.text.slice(0, 40), a.text);
      for (const w of wish.slice(0, 4)) {
        const s = shops.byItem[w.id] && shops.byItem[w.id][0];
        if (s) add(s.slot, 'mua', `Mua ${w.ten}`, `${w.why} · ${s.shops.join(', ')}`);
      }
      if (sites && sites.safeBest && sites.safeBest.slot !== S.viTri) add(sites.safeBest.slot, 'tu', `Tu ${num(sites.safeBest.tvNam, 1)}/năm`, sites.safeBest.action);
      if (sect && !sect.none && sect.slot && sect.slot !== S.viTri) add(sect.slot, 'tong', 'Sư môn', 'Bổng lộc, nhiệm vụ, bảo khố');
      for (const m of (sites && sites.masters) || []) add(m.slot, 'chu', `${m.master.title} (thắng → ${num(m.ifWin, 1)}/năm)`, `${m.master.ten}`);
      for (const s of (sites && sites.secrets) || []) add(s.slot, 'bi', 'Mật bí', 'Có thể có truyền thừa / động phủ ẩn');
      const here = xy(S.viTri);
      return { list: T.slice(0, 12), here: here && { x: here.x, y: here.y } };
    }

    // Nơi săn gần nhất an toàn (khi lịch luyện thấp)
    huntSpot(ctx, S, sites) {
      const rows = (sites && sites.allSafe) || [];
      const r = rows.find((r) => r.slot !== S.viTri && r.dangerId === 'an_toan' && !/thon_tran|tong_mon/.test(r.choLoai || '') && this.huntsLeft(ctx, r.slot) > 0) || null;
      if (r && r.travel === undefined) r.travel = safe(() => this.m('world/travel').travelYears(ctx, r.slot), null);
      return r;
    }
    // Loài săn an toàn ở chỗ đang đứng (dùng mô phỏng trận của game). Ưu tiên đầu đàn nếu vẫn an toàn.
    huntPick() {
      const g = this.tt.game;
      // undefined = không bị chặn (không dùng safe(): safe đổi undefined thành giá trị mặc định)
      let block;
      try {
        block = g.targetHuntBlock();
      } catch (e) {
        block = 'lỗi';
      }
      if (block) return null;
      const list = safe(() => g.huntTargets(), []);
      let best = null;
      for (const t of list) {
        const apex = safe(() => g.huntRisk(t.id, true), null);
        const norm = safe(() => g.huntRisk(t.id), null);
        const cand = apex && apex.level === 'an_toan' ? { id: t.id, ten: t.ten, apex: true, months: t.apexMonths || 4, gain: 6 } : norm && norm.level === 'an_toan' ? { id: t.id, ten: t.ten, apex: false, months: t.months || 2, gain: 2 } : null;
        if (cand && (!best || cand.gain / cand.months > best.gain / best.months)) best = cand;
      }
      return best;
    }
    // Số lượt săn còn ở một nơi (0 nếu nơi đó không săn được)
    huntsLeft(ctx, slot) {
      const acts = safe(() => this.m('encounter/director').placeActivities(ctx, slot).map((a) => a.id), []);
      if (!acts.includes('ev.san_yeu')) return 0;
      const max = safe(() => this.m('balance/encounter').HUNTS_PER_SLOT, 3) || 3;
      const used = safe(() => this.m('world/hunt').huntCount(ctx, slot), 0);
      return Math.max(0, Math.floor(max - used + 1e-9));
    }

    // ---------------------------------------------------------- tông môn
    sect(ctx, S) {
      if (!S.sect) {
        if (S.cg > 1) return { none: true, hint: 'Không có sư môn. Từ Trúc Cơ khó vào tông (cần tạp dịch / tiến cử); vẫn có thể tu một mình bằng động phủ.' };
        const lc = safe(() => S.linhCan.pham, '');
        const free = ['song', 'thien', 'bien_di'].includes(lc);
        const all = safe(() => ctx.world.data.diaDanh.filter((d) => d.loai === 'tong_mon' && !d.an), []);
        // ô bản đồ của địa danh: tra thẳng bảng slot (slotCuaDiaDanh trả sai / lỗi)
        if (!this._slotOfDd) {
          this._slotOfDd = new Map();
          for (const s of safe(() => ctx.world.data.slot, [])) if (s.dia_danh) this._slotOfDd.set(s.dia_danh, s.id);
        }
        const list = all
          .map((d) => {
            const slot = this._slotOfDd.get(d.id) || null;
            return { ten: d.ten, tang: d.tang, he: (d.he || []).join('/'), chinhMa: d.chinh_ma, slot, dist: slot ? safe(() => ctx.world.distance(S.viTri, slot), 9999) : 9999 };
          })
          .filter((x) => x.slot && x.chinhMa !== 'ma' && this.sameLand(ctx, S, x.slot))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 8);
        for (const s of list) s.travel = safe(() => this.m('world/travel').travelYears(ctx, s.slot), 99);
        list.sort((a, b) => a.travel - b.travel);
        // Luật của game: đại tông / tông môn chỉ thu vào kỳ "Tông môn tuyển đồ" (8–15 năm, kéo 0,5–1,5 năm);
        // song / thiên / biến dị linh căn được môn phái (tông nhỏ) thu thẳng ngoài kỳ.
        const now = ctx.run.nam;
        const recruiting = safe(() => (ctx.run.theGioi.dangDien || []).filter((x) => x.id === 'world.tong_mon_tuyen_do' && x.denNam > now), []);
        const open = [];
        for (const r of recruiting) {
          const info = safe(() => ctx.world.info(r.slot), null);
          const ty = safe(() => this.m('world/travel').travelYears(ctx, r.slot), 99);
          if (!info || ty > r.denNam - now) continue; // hết kỳ trước khi tới
          open.push({ ten: info.ten, tang: safe(() => info.diaDanh.tang, ''), he: safe(() => info.diaDanh.he.join('/'), ''), slot: r.slot, travel: ty, conNam: r.denNam - now, tuyenDo: true });
        }
        const direct = free ? list.filter((s) => s.tang === 'mon_phai').map((s) => ({ ...s, direct: true })) : [];
        list.length = Math.min(list.length, 4);
        const tier = { mon_phai: 1, tong_mon: 2, dai_tong_mon: 3 };
        open.sort((a, b) => (tier[b.tang] || 1) - (tier[a.tang] || 1) || a.travel - b.travel);
        let best = null;
        let how = '';
        if (open.length) {
          best = open[0];
          how = `đang kỳ tuyển đồ (còn ${yrs(best.conNam)}): thi căn cốt hoặc vấn tâm (ngộ tính, đạo tâm)${['thien', 'bien_di'].includes(lc) ? ', linh căn của ngươi miễn thi' : ''}`;
        } else if (direct.length) {
          best = direct[0];
          how = 'môn phái thu thẳng song / thiên / biến dị linh căn ngoài kỳ tuyển đồ (vào "Sơn môn" xin nhập môn)';
        } else if (list.length) {
          best = list.find((s) => s.tang !== 'dai_tong_mon') || list[0];
          how = 'chưa có kỳ tuyển đồ gần: dâng lễ vật làm tạp dịch (đại tông không nhận), hoặc chờ cáo thị tuyển đồ';
        }
        return { none: true, free, list, open, best, how, hint: how };
      }
      const tm = this.m('progress/tong_mon');
      const thieu = safe(() => tm.thieuDeThangCap(ctx), []);
      const bong = safe(() => tm.bongLoc(ctx), null);
      const expel = safe(() => tm.yearsUntilExpelled(ctx), null);
      return { ...S.sect, thieu, bong, expel };
    }

    // ---------------------------------------------------------- việc nên làm ngay
    actions(ctx, S, bt, sites, plan, enc, cmb, sect, wish, shops, ready, cd, km) {
      const A = [];
      // extra: { slot, kind, mapLabel } để vẽ điểm đến lên bản đồ
      const add = (lv, text, why, extra) => A.push({ lv, text, why: why || '', ...(extra || {}) });
      if (cmb) {
        // Đang giao chiến: chỉ lời khuyên cho trận này
        const fled = !!safe(() => cmb.raw.ketQua.enemyFled, false);
        add(cmb.win === false && !fled ? 'urgent' : 'do', `Đang giao chiến. ${cmb.text || ''}${cmb.win || fled ? ' → Giao chiến (bật Auto).' : ''}`);
        for (const a of cmb.advice) add(a.lv, a.text);
        return A;
      }
      if (enc && enc.pursuit) add('do', `Địch tháo chạy: chọn "${enc.pursuitTen}".`, 'Đuổi kịp thì được đủ chiến lợi phẩm và lịch luyện; tỉ lệ thấp hoặc đang thương nặng thì buông.', { kind: 'pursuit', pursuit: enc.pursuit });
      if (enc && enc.xuTri) add('do', `Thắng trận "${enc.ten}": chọn "${enc.xuTriTen}" (dứt hậu họa, không bị truy thù về sau).`, 'Tha mạng có thể bị trả thù / truy đuổi; phế tu vi cũng gây thù.', { kind: 'xu_tri', xuTri: enc.xuTri });
      if (enc && !cmb && !enc.utility && !enc.xuTri && !enc.pursuit) {
        const r = enc.choices.find((c) => c.index === enc.rec);
        if (r) add('do', `Sự kiện "${enc.ten}": chọn "${r.text.slice(0, 70)}"`, [r.p != null ? `thành ${pct(r.p)}` : '', r.gains.join(', '), r.risk.text ? `trận: ${r.risk.text}` : ''].filter(Boolean).join(' · '));
      }
      if (!S.coCongPhap) add('urgent', 'Chưa có công pháp thông: tu luyện chỉ ×0,5. Mua/nhận Dẫn Khí Quyết (thư viện ~30 LT) và gắn vào kinh mạch kề đan điền.', this.sources('item.dan_khi_quyet'));
      if (S.thuongThe >= 2) add('urgent', `${INJURY[S.thuongThe]}: thua trận là chết. Tránh mọi trận; bế quan/nghỉ ~${yrs(S.thuongThe === 3 ? 2 : 1)} để lành (bế quan lành nhanh ×1,5).`);
      else if (S.thuongThe === 1) add('warn', 'Thương nhẹ: tu luyện và đột phá bị trừ. Nghỉ/bế quan ~4 tháng để lành.');
      // Thọ
      if (plan && plan.steps && plan.steps[0] && plan.steps[0].margin != null && plan.steps[0].margin < 0) {
        const s0 = plan.steps[0];
        add(
          'urgent',
          `Thọ không đủ tới ${s0.toTen}: cần ${num(s0.tuVi, 0)} tu vi, chỗ tốt nhất quanh đây chỉ ~${num(s0.rate, 1)}/năm (thiếu ~${yrs(-s0.margin)}).`,
          `${s0.needRate ? `Cần ≥ ${num(s0.needRate, 1)} tu vi/năm. ` : ''}Tăng tốc: chỗ linh khí "dồi dào" (thường phải đánh chủ), đan tu luyện của cảnh giới, tâm pháp phẩm cao; hoặc xung kích sớm từ Hậu kỳ để còn thọ.`,
        );
      }
      // Đột phá: chỉ xung khi đã gần mức tối đa chuẩn bị được (hoặc thọ không cho chờ)
      const R = ready;
      if (bt && !bt.max && !bt.chan && R) {
        bt.burnAdvice = !!(R.go && R.useBurn);
        bt.waitFill = !R.go;
        if (R.go) {
          add(
            R.urgent && R.nowBest < R.target ? 'urgent' : 'do',
            `Xung kích ${bt.targetTen} ngay: ${pct(R.nowBest)}${R.useBurn ? ` (kèm đốt ${R.burn.nam} năm thọ)` : ''}${bt.bestTen.length ? `, dùng ${bt.bestTen.join(' + ')}` : ''}.`,
            R.urgent && R.nowBest < R.target ? `Thọ còn ${Math.round(S.thoCon)} năm, không đủ chuẩn bị thêm: thử ngay.` : `Đã sát mức tối đa chuẩn bị được (~${pct(R.maxRate)}).`,
          );
        } else {
          add('do', `CHƯA xung kích ${bt.targetTen}: bây giờ ${pct(R.nowBest)}, chuẩn bị đủ được ~${pct(R.maxRate)}${R.maxSoft > R.maxRate + 0.01 ? ` (tới ${pct(R.maxSoft)} nếu có cả hộ pháp / tâm pháp)` : ''}. Làm theo danh sách "Chuẩn bị" bên dưới.`, 'Mỗi lần hỏng: mất vài năm, thêm chấn tổn −5%, hao tu vi, có thể tắc kinh mạch hoặc tụt cảnh giới.');
          let k = 0;
          for (const x of R.levers) {
            if (k >= 5) break;
            if (x.far) continue;
            k++;
            const w = x.where;
            const slot = x.slot || (w && w.slot) || null;
            const afford = !w || !w.cost || w.unit !== 'LT' || S.lt >= w.cost * (x.n || 1);
            const costTxt = w && w.cost ? ` · ${w.cost * (x.n || 1)} ${w.unit}${w.unit === 'CH' ? ` (có ${Math.floor(S.ch || 0)})` : afford ? '' : ` (thiếu ${w.cost * (x.n || 1) - Math.floor(S.lt)})`}` : '';
            add(
              x.kind === 'fill' ? 'do' : 'tip',
              `Chuẩn bị ${sgnPct(x.gain)}: ${x.ten}${w ? ` · lấy ở ${w.ten}` : ''}${costTxt}.`,
              '',
              slot && slot !== S.viTri ? { slot: this.goSlot(ctx, S, slot), kind: x.kind === 'loc' ? 'tu' : 'mua', mapLabel: x.kind === 'loc' ? 'Nơi xung kích' : `Lấy ${this.itemName(x.item || '') || 'đồ'}`, prep: x.kind } : { prep: x.kind },
            );
          }
          // Đang đứng đúng chỗ bán / ở sư môn và đủ tiền: mua ngay
          for (const x of R.levers) {
            const w = x.where;
            if (x.far || !w || !x.item || w.slot !== S.viTri) continue;
            const n = x.n || 1;
            const have = w.unit === 'CH' ? S.ch || 0 : S.lt || 0;
            const can = Math.min(n, Math.floor(have / Math.max(1, w.cost)));
            if (can <= 0 || (w.kind === 'sect' && !w.du)) continue;
            add('urgent', `Mua ngay ${can} ${this.itemName(x.item)} ở ${w.ten} (${can * w.cost} ${w.unit}): ${sgnPct((x.gain / n) * can)} tỉ lệ xung kích.`, '', { kind: w.kind === 'sect' ? 'buy_sect' : 'buy_here', item: x.item, n: can, shopIds: w.shopIds || ['ev.bao_kho'] });
          }
          const needLT = R.levers.filter((x) => x.where && x.where.unit === 'LT' && x.where.cost).reduce((a, x) => a + x.where.cost * (x.n || 1), 0);
          if (needLT > S.lt) {
            const b = shops && shops.boards && shops.boards[0];
            add('tip', `Thiếu ~${Math.round(needLT - S.lt)} LT cho đồ chuẩn bị: nhận việc ở Bảng treo thưởng${b ? ` (gần nhất ${b.ten}, đi ${yrs(b.travel)})` : ''}, bán đồ săn được ở Lái buôn / Thương hội, lĩnh bổng lộc, ghé mật bí "Động phủ ẩn" (linh thạch lớn).`, '', b ? { slot: this.goSlot(ctx, S, b.slot), kind: 'mua', mapLabel: 'Bảng treo thưởng' } : null);
          }
        }
      }
      if (S.bottleneck) add('do', `Đang chạm bình cảnh: bế quan tích lũy${S.binhCanhCan ? ` ${num(S.binhCanhCan, 0)} tu vi` : ''}, hoặc dùng đan phá bình cảnh (Phá Chướng Đan cho Trúc Cơ, Toái Bích Đan cho Kết Đan).`);
      if (S.diemNghich > 0 && !(bt && !bt.chan)) add('warn', `Kinh mạch có ${S.diemNghich} điểm nghịch (mảnh tương khắc): trong trận dễ phản phệ, khi xung kích −3%/điểm.`);
      // Lịch luyện
      const inSect = !!(S.sect && S.sect.slot === S.viTri);
      // Nhiệm vụ đã nhận (sư môn / bảng treo thưởng): nhắc đi làm
      const clean = (t) => String(t || '').replace(/[\ue000-\ue002]/g, '');
      for (const v of safe(() => ctx.run.viecNhan || [], [])) {
        if (!v || !v.slot) continue;
        const ten = clean(v.ten);
        const conHan = v.han != null && v.namNhan != null ? v.namNhan + v.han - ctx.run.nam : null;
        const here = v.slot === S.viTri;
        add(
          'do',
          here ? `Đang ở chỗ làm nhiệm vụ "${ten}": mở nó trong danh sách nơi này (mục "Chuyện lớn").` : `Đang nhận nhiệm vụ "${ten}": đi tới ${this.placeName(ctx, v.slot)} (${yrs(safe(() => this.m('world/travel').travelYears(ctx, v.slot), null))}).`,
          conHan != null ? `Còn hạn ~${yrs(conHan)}. Tới nơi Trợ Đạo chấm từng lựa chọn.` : 'Tới nơi Trợ Đạo chấm từng lựa chọn.',
          { slot: v.slot, kind: 'nhiem_vu_nhan', mission: ten, mapLabel: 'Nhiệm vụ' },
        );
      }
      if (S.lichLuyenNam != null && plan && plan.steps && plan.steps[0] && S.lichLuyenNam < Math.min(plan.steps[0].years, 30)) {
        const low = S.lichLuyenNam < 1;
        if (inSect || (S.cg === 0 && S.sect)) {
          const ms = this.missions(ctx, S);
          const m = ms[0];
          add(
            low ? 'do' : 'tip',
            low
              ? `Lịch luyện đã cạn (bế quan chỉ ×0,5): ${m ? `nhận nhiệm vụ "${m.ten}" (${m.tier}, +${m.ch} CH, đi ${yrs(m.travel)})` : 'nhận nhiệm vụ cấp thấp ở Điện nhiệm vụ'} rồi về bế quan tiếp.`
              : `Lịch luyện đủ ~${yrs(S.lichLuyenNam)} bế quan. Bế quan dùng hết trước, cạn rồi thì nhận nhiệm vụ tông (Điện nhiệm vụ) để nạp lại.`,
            `Nhiệm vụ cấp thấp vừa có cống hiến vừa có lịch luyện; đi đường cũng nạp.${S.cg === 0 ? ' Phàm Nhân máu ít: tránh săn yêu.' : ' Săn yêu chỗ "An toàn" cũng nạp tốt.'}`,
            low && m ? { slot: m.slot, kind: 'nhiem_vu', mission: m.ten, mapLabel: 'Nhiệm vụ' } : null,
          );
        } else if (S.cg >= 1) {
          const hereRow = sites && (sites.allSafe || []).find((r) => r.slot === S.viTri);
          const hereLeft = this.huntsLeft(ctx, S.viTri);
          const hp = hereLeft > 0 ? this.huntPick() : null;
          if (hereRow && hp) {
            add(
              low ? 'do' : 'tip',
              `Lịch luyện chỉ đủ ~${yrs(S.lichLuyenNam)} bế quan: săn yêu ngay tại đây. Vào "Săn yêu" → "Săn loài khác…" → ${hp.apex ? 'lùng đầu đàn ' : ''}${hp.ten} (an toàn, ~${hp.months} tháng).`,
              `Game mô phỏng trận báo an toàn. ${hp.apex ? 'Đầu đàn +6 lịch luyện' : 'Thắng +2 lịch luyện'}; còn ${hereLeft} lượt săn ở đây.`,
              { kind: 'san_here', hunt: hp },
            );
          } else {
            const h = this.huntSpot(ctx, S, sites);
            add(
              low ? 'do' : 'tip',
              `Lịch luyện chỉ đủ ~${yrs(S.lichLuyenNam)} bế quan (cạn thì tu ×0,5). ${h ? `Săn yêu ở ${h.ten} (An toàn, còn ${this.huntsLeft(ctx, h.slot)} lượt, đi ${yrs(h.travel)})` : 'Săn yêu ở chỗ "An toàn"'}.`,
              'Trận thắng +2, tinh anh +6, boss +10; đi đường cũng nạp thêm. Chỉ đánh khi dự kiến báo thắng.',
              h ? { slot: h.slot, kind: 'san', mapLabel: 'Săn yêu' } : null,
            );
          }
        } else {
          add('tip', `Lịch luyện đủ ~${yrs(S.lichLuyenNam)} bế quan; đi đường / làm việc trong thôn để nạp thêm. Phàm Nhân máu ít: tránh đánh nhau.`);
        }
      }
      // Chỗ tu: chỉ gợi ý chỗ "An toàn"/"Ngang sức", hơn ≥15%
      let okSite = sites && sites.safeBest && ['an_toan', 'ngang_suc'].includes(sites.safeBest.dangerId) ? sites.safeBest : null;
      // Sư môn chậm hơn không quá ~13% thì ưu tiên sư môn (nhiệm vụ, cống hiến, bảo khố, ít bị quấy)
      const sr = sites && sites.sectRow;
      if (okSite && sr && sr.slot !== okSite.slot && sr.tvNam >= okSite.tvNam * 0.87) okSite = { ...sr, action: 'Về sư môn bế quan (kèm nhiệm vụ / cống hiến)' };
      if (okSite && S.here && okSite.tvNam > S.here.tuViNam * 1.15 && okSite.slot !== S.viTri) {
        add(
          'do',
          `Đi tới ${okSite.ten}: ${okSite.action} → ${num(okSite.tvNam, 2)} tu vi/năm (hiện ${num(S.here.tuViNam, 2)}).`,
          `${okSite.lk} · ${okSite.danger} · đi ${yrs(okSite.travel)}${okSite.seat < 1 ? ' · ngoài trời mỗi lần chỉ ngồi 1 mốc, hay bị quấy' : ''}`,
          { slot: okSite.slot, kind: 'tu', mapLabel: `${/Khai/.test(okSite.action) ? 'Khai phủ' : 'Tu'} ${num(okSite.tvNam, 1)}/năm` },
        );
      }
      // Mua sắm: món gấp nhất có bán quanh đây
      // Có ở bảo khố sư môn: đổi bằng cống hiến
      const capTen = safe(() => this.m('progress/tong_mon').CAP_BAC, null);
      for (const w of (wish || []).filter((x) => x.sect && x.prio <= 2 && !(R && !R.go && (R.levers || []).some((l) => l.item === x.id))).slice(0, 2)) {
        const can = w.sect.du;
        const thieu = Math.max(0, w.sect.gia - Math.floor(S.ch || 0));
        add(
          'tip',
          `${w.ten}: đổi ở Bảo khố ${S.sect.ten} giá ${w.sect.gia} CH${can ? '' : ` (cần ${safe(() => capTen[w.sect.capBac].ten || capTen[w.sect.capBac], `bậc ${w.sect.capBac}`)})`}${thieu ? ` · còn thiếu ${thieu} CH` : ' · đủ cống hiến'}.`,
          `${w.why}. Kiếm cống hiến: nhiệm vụ Điện nhiệm vụ, trấn thủ, đào quặng, quyên linh thạch (4 LT = 1 CH).`,
          inSect ? null : { slot: S.sect.slot, kind: 'tong', mapLabel: 'Bảo khố sư môn' },
        );
      }
      const prepItems = new Set(((R && !R.go && R.levers) || []).map((x) => x.item).filter(Boolean));
      const buyable = (wish || []).filter((x) => !prepItems.has(x.id) && !x.sect && x.prio <= 2 && shops && shops.byItem[x.id] && shops.byItem[x.id].length);
      for (const w of buyable.slice(0, 2)) {
        const s = shops.byItem[w.id][0];
        const price = safe(() => this.m('world/phong_tho').giaMua(ctx, w.id), w.gia);
        const afford = S.lt >= price;
        if (s) {
          add(
            w.prio <= 0.5 ? 'do' : 'tip',
            `Mua ${w.ten} ở ${s.ten} (${s.shops.slice(0, 2).join(', ')}) ~${price} LT${afford ? '' : ` · còn thiếu ${price - Math.floor(S.lt)} LT`}.`,
            `${w.why} · đi ${yrs(s.travel)}`,
            { slot: s.slot, kind: 'mua', mapLabel: `Mua ${w.ten}` },
          );
        }
      }
      // Tông môn
      if (sect) {
        if (sect.none && sect.best && S.cg <= 1) {
          const pick = sect.best;
          const tangTen = { mon_phai: 'môn phái', tong_mon: 'tông môn', dai_tong_mon: 'đại tông' }[pick.tang] || pick.tang;
          const here = pick.slot === S.viTri;
          add(
            pick.tuyenDo || pick.direct ? 'urgent' : 'do',
            `Việc số 1: ${here ? 'ở đây, vào "Sơn môn" xin nhập' : 'vào'} ${pick.ten} (${tangTen}${pick.he ? `, hệ ${pick.he}` : ''}${here ? '' : `, đi ${yrs(pick.travel)}`}).`,
            `Cách vào: ${sect.how}. Có tông thì bế quan ở động phủ đệ tử, có bảo khố (Trúc Cơ Đan), nhiệm vụ lấy cống hiến.${!pick.tuyenDo && sect.list.some((s) => s.tang !== 'mon_phai') ? ' Đại tông linh khí cao hơn nhưng phải chờ kỳ tuyển đồ (Trợ Đạo sẽ báo khi có).' : ''}`,
            here ? null : { slot: pick.slot, kind: 'tong', mapLabel: `Vào ${pick.ten}` },
          );
        }
        if (!sect.none) {
          const at = sect.slot === S.viTri;
          const go = at ? null : { slot: sect.slot, kind: 'tong', mapLabel: 'Về sư môn' };
          if (sect.bong && sect.bong.nam >= 5) add('tip', `${at ? '' : 'Khi về sư môn: '}lĩnh bổng lộc ở Chấp sự đường (${sect.bong.nam} năm: +${sect.bong.linhThach} LT, +${sect.bong.congHien} CH; tối đa tích 10 năm).`, '', go);
          if (sect.thieu && sect.thieu.length === 0) add('do', 'Đủ điều kiện thăng cấp tông môn: vào Chấp sự đường xin khảo hạch.', '', go);
          if (sect.expel != null && sect.expel < 3) add('urgent', `Sắp bị xóa tên khỏi tông môn (~${yrs(sect.expel)}): về sơn môn trình diện.`, '', go);
        }
      }
      // Đan tu luyện trong túi
      if (S.here && S.here.danDung && S.here.danDung.length) add('tip', `Có đan tu luyện dùng được khi bế quan: ${S.here.danDung.map((d) => this.itemName(d.id || d)).join(', ')}.`);
      // Đã tới chỗ nên khai phủ mà chưa khai
      const sb = sites && sites.safeBest;
      if (sb && sb.slot === S.viTri && /Khai phủ/.test(sb.action) && S.here && S.here.loai !== 'dong_phu' && !(enc && !enc.utility) && !cmb) {
        add('do', `Khai động phủ ngay tại ${sb.ten} (vào nơi này → "Khai phủ", mất nửa năm) rồi bế quan: ${num(sb.tvNam, 2)} tu vi/năm, ngồi bao lâu cũng được.`, `${sb.lk} · ${sb.danger}. Ngồi ngoài trời chỉ ${num(S.here.tuViNam, 2)}/năm, 1 mốc mỗi lần, hay bị quấy.`, { kind: 'tu' });
      }
      // Việc chính: bế quan ở đây, nếu không có lời khuyên dời đi / xung kích / sự kiện đang mở
      const moving = A.some((a) => (a.kind === 'tu' || a.kind === 'tong') && (a.lv === 'do' || a.lv === 'urgent'));
      const canBreak = bt && !bt.max && !bt.chan && R && R.go;
      const fullPeak = S.tieu >= 3 && S.need != null && S.tuVi >= S.need - 1e-6;
      if (fullPeak && !canBreak && !cmb) {
        add('warn', 'Tu vi Đại viên mãn đã đầy: bế quan thêm không tăng gì. ĐỪNG chọn bế quan "Tới tiểu cảnh giới kế" (game sẽ tự xung kích luôn). Dùng thời gian để chuẩn bị: kiếm linh thạch / cống hiến, mua đan, chữa chấn tổn, tìm hộ pháp.');
      }
      if (!moving && !canBreak && !fullPeak && !cmb && !(enc && !enc.utility) && S.here) {
        const r = S.here.tuViNam;
        const conThieu = Math.max(0, (S.need || 0) - S.tuVi);
        const toNext = conThieu / Math.max(1e-6, r);
        const ll = S.lichLuyenNam;
        const mode = ll != null && ll < toNext ? `"Tới khi cạn lịch luyện" (~${yrs(ll)})` : `"Tới tiểu cảnh giới kế" (~${yrs(toNext)})`;
        const seatNote = S.here.loai === 'tong_mon' ? 'động phủ đệ tử ngồi tối đa 3 mốc / lần' : S.here.loai === 'dong_phu' ? 'động phủ ngồi bao lâu cũng được' : 'ngoài trời chỉ 1 mốc / lần, hay bị quấy';
        add('do', `Bế quan tại ${S.viTriTen}: ${num(r, 2)} tu vi/năm (linh khí ${S.here.linhKhi.toLowerCase()}). Chọn ${mode}.`, `Còn thiếu ${num(conThieu, 1)} tu vi tới tiểu cảnh giới kế; ${seatNote}.`);
      }
      // Kinh mạch xếp chưa tối ưu
      if (km && km.better && !cmb) {
        add(
          'do',
          `Xếp lại kinh mạch: ${[km.after.sp - km.before.sp > 0.005 ? `tốc ×${num(km.before.sp, 2)} → ×${num(km.after.sp, 2)}` : '', km.after.dp - km.before.dp > 0.001 ? `đột phá +${Math.round(km.before.dp * 100)}% → +${Math.round(km.after.dp * 100)}%` : '', km.before.ng !== km.after.ng ? `điểm nghịch ${km.before.ng} → ${km.after.ng}` : '', km.after.atk - km.before.atk > 1 ? `sức đánh ${Math.round(km.before.atk)} → ${Math.round(km.after.atk)}` : ''].filter(Boolean).join(', ')}.`,
          'Tab "Kinh mạch" của Trợ Đạo có cách xếp và nút Áp dụng (game tự gỡ và đặt lại, không tốn gì).',
          { kind: 'kinh_mach' },
        );
      }
      // Cơ duyên: mật bí gần, đang làm mới được (truyền thừa cổ tu 1 lần / kiếp: hàng trăm tu vi)
      if (cd && cd.secrets && !cmb) {
        const near = cd.secrets.find((r) => r.ready && r.dangerId !== 'tu_dia' && r.dangerId !== 'nguy_hiem' && r.travel != null && r.travel <= Math.max(0.6, (S.thoCon || 0) * 0.02));
        if (near && near.slot !== S.viTri) {
          add('tip', `Cơ duyên: ghé ${near.ten} (nơi có mật bí${near.fog ? ', còn mây' : ''}, ${near.danger}, đi ${yrs(near.travel)}).`, `${cd.done.truyen ? '' : 'Có thể gặp "Truyền thừa cổ tu" (1 lần mỗi kiếp: tu vi lớn, ngộ tính +3, đạo tâm +2) hoặc '}"Động phủ ẩn" (nhiều linh thạch). Mỗi nơi ~5 năm bốc sự kiện một lần.`, { slot: near.slot, kind: 'co_duyen', mapLabel: 'Cơ duyên' });
        }
      }
      // Điểm đến còn mây: game không cho đi thẳng, đi chặng ô đã mở gần nhất
      for (const a of A) {
        if (!a.slot || a.slot === S.viTri) continue;
        const r = this.route(ctx, S, a.slot);
        if (r.fog && r.via) {
          a.dest = a.slot;
          a.slot = r.via;
          a.text += ` (đích còn mây: đi tới ${r.viaTen} trước, mây tan dần)`;
        }
      }
      const order = { urgent: 0, do: 1, warn: 2, tip: 3, info: 4 };
      return A.sort((a, b) => order[a.lv] - order[b.lv]);
    }

    // ---------------------------------------------------------- đường đi qua mây
    // Game không cho đi thẳng tới nơi còn phủ mây. Chọn ô đã mở gần đích nhất (và không quá xa mình);
    // tới đó mây quanh tan, đi tiếp được.
    route(ctx, S, slot) {
      if (!slot || this.revealed(ctx, slot)) return { slot, via: null, fog: false };
      const w = ctx.world;
      const all = safe(() => (Array.isArray(w.slots) ? w.slots : [...w.slots.values()]), []);
      const dHere = safe(() => w.distance(S.viTri, slot), Infinity);
      let best = null;
      let bestScore = Infinity;
      for (const sl of all) {
        const id = sl.id || sl;
        if (id === S.viTri) continue;
        const dT = safe(() => w.distance(id, slot), Infinity);
        if (!(dT < dHere)) continue;
        if (!this.revealed(ctx, id) || !this.sameLand(ctx, S, id)) continue;
        const sc = dT + 0.25 * safe(() => w.distance(S.viTri, id), 0);
        if (sc < bestScore) {
          bestScore = sc;
          best = id;
        }
      }
      return { slot, via: best, viaTen: best ? this.placeName(ctx, best) : '', fog: true };
    }
    // slot nên bấm đi ngay (đích nếu đã mở, không thì chặng qua mây)
    goSlot(ctx, S, slot) {
      const r = this.route(ctx, S, slot);
      return r.via || r.slot;
    }

    // ---------------------------------------------------------- chuẩn bị xung kích
    // Liệt kê mọi nguồn có thể cộng thêm tỉ lệ, tính tỉ lệ tối đa đạt được, và quyết định
    // xung ngay hay chuẩn bị tiếp. Mục tiêu: không xung khi còn cách mức tối đa xa (mỗi lần hỏng
    // mất vài năm, thêm chấn tổn −5%, tu vi hao).
    readiness(ctx, S, bt, sites, wish, shops) {
      if (!bt || bt.max) return null;
      const tgt = S.cg + 1;
      const src = (code) => (bt.nguon || []).filter((n) => n.ma === code).reduce((a, n) => a + n.gt, 0);
      const BAL = this.m('balance/breakthrough');
      const NOI = safe(() => (tgt >= 4 ? BAL.NOI_CONG_HIGH : BAL.NOI_CONG), { dong_phu: 0.1, son_thuy: 0.05, thanh_tri: -0.05 });
      const LKB = safe(() => BAL.TI_LE_LINH_KHI, [-0.05, -0.02, 0, 0.05]);
      const LKN = ['Rất loãng', 'Loãng', 'Trung bình', 'Dồi dào'];
      const lkBonus = (ten) => LKB[Math.max(0, LKN.indexOf(ten))] ?? 0;
      const L = [];
      const lever = (o) => L.push(o);
      // 1. Tu đầy Đại viên mãn
      if (bt.som > 0) lever({ kind: 'fill', gain: -src('som'), ten: `Tu tới Đại viên mãn đầy (${num(bt.fillTv, 0)} tu vi, ~${yrs(bt.fillYears)})`, years: bt.fillYears || 0 });
      // 2. Chữa chấn tổn
      const scars = Math.round(-src('that_bai') / 0.05);
      if (scars > 0) {
        const sp = this.scarPills(tgt)[0];
        const where = sp ? this.whereToGet(ctx, S, sp.id, shops) : null;
        lever({ kind: 'scar', gain: -src('that_bai'), ten: `Chữa ${scars} vết chấn tổn bằng ${scars} viên ${sp ? sp.ten : 'đan ôn dưỡng đạo cơ'}`, item: sp && sp.id, n: scars, where, cost: where ? where.cost * scars : null, unit: where ? where.unit : '' });
      }
      // 3. Đan đột phá: 2 loại mạnh nhất dùng được cho cảnh giới đích
      const haveGain = Math.max(0, (bt.best.tiLe || 0) - (bt.tiLe || 0));
      const top2 = this.breakPills(tgt).filter((p) => ((this.item(p.id) || {}).canh_gioi ?? 0) <= tgt).slice(0, 2);
      const inBag = new Set(bt.best.dan || []);
      for (const p of top2) {
        if (inBag.has(p.id)) continue;
        const where = this.whereToGet(ctx, S, p.id, shops);
        lever({ kind: 'pill', gain: p.gt, ten: `${p.ten} (${sgnPct(p.gt)})`, item: p.id, where, cost: where ? where.cost : null, unit: where ? where.unit : '' });
      }
      // 4. Nơi xung kích: động phủ (+NOI.dong_phu) + linh khí dồi dào (+5%)
      const curLoc = src('noi') + src('noi_su_mon') + src('linh_khi');
      let bestLoc = null;
      const consider = (slot, ten, noiGain, lkTen, how) => {
        const g = noiGain + lkBonus(lkTen);
        if (!bestLoc || g > bestLoc.g) bestLoc = { slot, ten, g, how, lkTen };
      };
      for (const c of S.caves || []) {
        const lk = safe(() => this.m('progress/be_quan').linhKhiTai(ctx, c), null);
        if (lk) consider(c, this.placeName(ctx, c), NOI.dong_phu || 0.1, lk.ten, 'động phủ của ngươi');
      }
      for (const r of (sites && sites.allSafe) || []) {
        if (/Khai/.test(r.action || '')) consider(r.slot, r.ten, NOI.dong_phu || 0.1, r.lk, 'khai động phủ ở đây');
      }
      if (S.sect && sites && sites.sectRow) consider(S.sect.slot, S.sect.ten, tgt >= 4 ? NOI.tong_mon || 0.05 : 0.05, sites.sectRow.lk, 'sư môn');
      if (bestLoc && bestLoc.g - curLoc > 0.005) lever({ kind: 'loc', gain: bestLoc.g - curLoc, ten: `Xung kích ở ${bestLoc.ten} (${bestLoc.how}, linh khí ${bestLoc.lkTen.toLowerCase()})`, slot: bestLoc.slot });
      // 5. Hộ pháp
      if (!src('ho_phap')) {
        const friends = safe(() => this.tt.game.inviteOptions(), []) || [];
        const f = friends.find((x) => !x.reason);
        lever({ kind: 'hophap', gain: 0.05, ten: f ? `Mời ${f.name} đi cùng làm hộ pháp (Nhân mạch → Mời đồng hành)` : 'Có hộ pháp: người quen cảnh giới chênh < 2, cùng nước, đứng cùng chỗ (kết giao trước)', soft: !f });
      }
      // 6. Tâm ma / thương thế / phản phệ
      if (src('tam_ma') < 0) lever({ kind: 'tamma', gain: -src('tam_ma'), ten: `Hạ tâm ma (đang ${S.tamMa}): Thanh Tâm Đan, trà / hương / hoàn hạ tâm ma` });
      if (src('thuong_the') < 0) lever({ kind: 'heal', gain: -src('thuong_the'), ten: `Chữa lành thương thế (${INJURY[S.thuongThe]})` });
      if (src('phan_phe') < 0) lever({ kind: 'nghich', gain: -src('phan_phe'), ten: `Tháo mảnh gây điểm nghịch (${S.diemNghich}) khỏi kinh mạch` });
      // 7. Công pháp trợ đột phá (tối đa 12%)
      const cpCap = safe(() => BAL.CONG_PHAP_CAP, 0.12);
      const cpNow = src('cong_phap');
      if (cpCap - cpNow > 0.02) {
        const cp = safe(() => [...this.tt.content.items.values()], [])
          .filter((it) => it.loai === 'cong_phap' && it.bi_dong && it.bi_dong.dot_pha && (it.canh_gioi ?? 0) <= S.cg && !(ctx.run.nhanVat.tuiDo[it.id] > 0))
          .sort((a, b) => b.bi_dong.dot_pha - a.bi_dong.dot_pha)[0];
        if (cp) {
          const where = this.whereToGet(ctx, S, cp.id, shops);
          lever({ kind: 'cp', gain: Math.min(cp.bi_dong.dot_pha, cpCap - cpNow), ten: `Tâm pháp ${cp.ten} (đột phá ${sgnPct(cp.bi_dong.dot_pha)}) gắn lên kinh mạch`, item: cp.id, where, cost: where ? where.cost : null, unit: where ? where.unit : '', soft: true });
        }
      }
      // 8. Đốt thọ (nấc 1)
      const burn = (bt.burns || []).find((b) => b.nac === 1 && b.duoc);
      const burnGain = burn && burn.tiLe != null ? burn.tiLe - bt.best.tiLe : 0;
      L.sort((a, b) => b.gain - a.gain);
      // Ngân sách thực tế: linh thạch / cống hiến kiếm được trong nửa thọ còn lại (ước lượng thu nhập theo cảnh giới)
      const INC_LT = [10, 40, 80, 180, 450, 1000][S.cg] || 40;
      const INC_CH = [10, 15, 25, 40, 60, 80][S.cg] || 15;
      const spare = Math.max(0, (S.thoCon || 0) * 0.5 - (bt.fillYears || 0));
      let budLT = (S.lt || 0) + INC_LT * spare;
      let budCH = (S.ch || 0) + INC_CH * spare;
      const buy = L.filter((x) => x.where && x.where.cost && x.where.unit !== 'LT (giá gốc)').sort((a, b) => b.gain / (b.where.cost * (b.n || 1)) - a.gain / (a.where.cost * (a.n || 1)));
      for (const x of buy) {
        // chấn tổn: chữa được bao nhiêu vết thì tính bấy nhiêu
        if (x.kind === 'scar' && x.n > 1) {
          const bud = x.where.unit === 'CH' ? budCH : budLT;
          const k = Math.min(x.n, Math.floor(bud / x.where.cost));
          if (k > 0 && k < x.n) {
            x.gain = (x.gain / x.n) * k;
            x.ten = x.ten.replace(/Chữa \d+ vết/, `Chữa ${k}/${x.n} vết`).replace(/bằng \d+ viên/, `bằng ${k} viên`);
            x.n = k;
          }
        }
        const c = x.where.cost * (x.n || 1);
        if (x.where.unit === 'CH') {
          if (c <= budCH) budCH -= c;
          else x.far = true;
        } else if (c <= budLT) budLT -= c;
        else x.far = true;
        if (!x.far) x.years = Math.max(x.years || 0, x.where.unit === 'CH' ? Math.max(0, c - (S.ch || 0)) / INC_CH : Math.max(0, c - (S.lt || 0)) / INC_LT);
      }
      for (const x of L) if (x.where && x.where.unit === 'LT (giá gốc)') x.soft = true; // không biết chỗ bán: không tính chắc
      const hard = L.filter((x) => !x.soft && !x.far);
      const now = bt.best.tiLe || 0;
      const maxRate = Math.min(1, now + hard.reduce((a, x) => a + x.gain, 0) + Math.max(0, burnGain));
      const maxSoft = Math.min(1, maxRate + L.filter((x) => x.soft || x.far).reduce((a, x) => a + x.gain, 0));
      // Ngưỡng: còn cách mức tối đa ≤ 6% thì xung; tối thiểu 60% nếu mức tối đa cho phép
      const thoCon = S.thoCon || 0;
      const prepYears = hard.reduce((a, x) => Math.max(a, x.years || 0), 0) + (bt.fillYears || 0) * 0 + hard.filter((x) => x.kind === 'pill' || x.kind === 'scar' || x.kind === 'loc').length * 0.7;
      const urgent = thoCon < Math.max(8, prepYears + (safe(() => this.realmDef(tgt).namXungKich, 2) + 4) * 2);
      const target = Math.max(Math.min(maxRate - 0.06, 0.6), Math.min(maxRate, 0.25));
      const withBurn = now + Math.max(0, burnGain);
      const useBurn = burn && burnGain > 0.03 && burn.nam <= thoCon * 0.35;
      const nowBest = useBurn ? withBurn : now;
      const go = !bt.chan && (nowBest >= target - 1e-9 || urgent);
      return { tgt, now, nowBest, useBurn, burn, maxRate, maxSoft, target, levers: L, go, urgent, scars, prepYears, incLT: INC_LT };
    }
    // Chỗ lấy một món: bảo khố sư môn (CH) > tiệm bày bán (LT) > nguồn khác
    whereToGet(ctx, S, itemId, shops) {
      const tm = this.m('progress/tong_mon');
      if (S.sect) {
        const it = this.item(itemId);
        const r = it && safe(() => tm.hangTong(ctx, it.loai), []).find((x) => x.id === itemId);
        if (r) return { kind: 'sect', ten: `Bảo khố ${S.sect.ten}`, cost: r.gia, unit: 'CH', slot: S.sect.slot, du: (S.sect.capBac || 0) >= (r.capBac || 0) };
      }
      const sh = shops && shops.byItem && shops.byItem[itemId] && shops.byItem[itemId][0];
      if (sh) return { kind: 'shop', ten: `${sh.ten} (${sh.shops.slice(0, 2).join(', ')})`, cost: safe(() => this.m('world/phong_tho').giaMua(ctx, itemId), (this.item(itemId) || {}).gia), unit: 'LT', slot: sh.slot, shopIds: sh.shopIds };
      return { kind: 'other', ten: this.sources(itemId), cost: (this.item(itemId) || {}).gia || null, unit: 'LT (giá gốc)' };
    }

    // ---------------------------------------------------------- cơ duyên (mật bí, bí cảnh)
    coDuyen(ctx, S) {
      const w = ctx.world;
      const noi = this.m('world/noi');
      const dh = this.m('encounter/do_hiem');
      const all = safe(() => (Array.isArray(w.slots) ? w.slots : [...w.slots.values()]), []);
      const hist = ctx.run.history || {};
      const used = (id) => safe(() => (hist[id] ? hist[id].length ?? hist[id].dem ?? 1 : 0), 0);
      const tt = { truyen: used('ev.truyen_thua_co_tu'), dpa: used('ev.dong_phu_an') };
      const rows = [];
      const realms = [];
      for (const sl of all) {
        const id = sl.id || sl;
        const d = safe(() => w.distance(S.viTri, id), Infinity);
        if (!(d <= 1100)) continue;
        if (!this.sameLand(ctx, S, id)) continue;
        const sec = safe(() => noi.coMatBi(ctx, ctx.run, id), false);
        const win = safe(() => noi.secretRealmWindow(ctx, ctx.run, id), null);
        if (!sec && !win) continue;
        const nc = ctx.run.noiChon[id];
        const lastRefresh = nc && nc.namLamMoi != null ? nc.namLamMoi : null;
        const ready = lastRefresh == null || ctx.run.nam - lastRefresh >= 5;
        const chenh = safe(() => dh.doChenh(this.tt.game.env, ctx.run, id), null);
        const muc = chenh != null ? safe(() => dh.mucHiem(chenh), null) : null;
        const row = { slot: id, ten: this.placeName(ctx, id), dist: d, kind: safe(() => noi.placeKind(ctx, ctx.run, id).ten, ''), ready, next: lastRefresh != null ? lastRefresh + 5 - ctx.run.nam : 0, danger: muc ? muc.ten : '?', dangerId: muc ? muc.id : '', fog: !this.revealed(ctx, id) };
        if (sec) rows.push(row);
        if (win) realms.push({ ...row, open: !!win.open, win });
      }
      const ok = (r) => r.dangerId !== 'tu_dia' && r.dangerId !== 'nguy_hiem';
      rows.sort((a, b) => b.ready - a.ready || ok(b) - ok(a) || a.dist - b.dist);
      const top = rows.slice(0, 10);
      for (const r of top) r.travel = safe(() => this.m('world/travel').travelYears(ctx, r.slot), null);
      realms.sort((a, b) => b.open - a.open || a.dist - b.dist);
      const rtop = realms.slice(0, 5);
      for (const r of rtop) r.travel = safe(() => this.m('world/travel').travelYears(ctx, r.slot), null);
      return { secrets: top, realms: rtop, done: tt };
    }

    // ---------------------------------------------------------- tối ưu kinh mạch
    // Thử xếp lại toàn bộ công pháp / pháp khí (đang lắp + trong túi) trên bản sao nhân vật.
    // Tham lam: mỗi bước đặt (món, chỗ, hướng) làm điểm tăng nhiều nhất. Điểm = tốc độ tu luyện
    // + trợ đột phá (+ chút sức đánh) − điểm nghịch.
    meridianPlan(ctx, S, mode) {
      const km = this.m('character/kinh_mach');
      const ch = this.m('character/character');
      const ct = ctx.content;
      const nv0 = ctx.run.nhanVat;
      const key = JSON.stringify([nv0.kinhMach.manh, nv0.tuiDo, nv0.kinhMach.trangThai, mode, S.cg]);
      if (this._kmCache && this._kmCache.key === key) return this._kmCache.val;
      const nv = structuredClone(nv0);
      const bt = mode === 'bt';
      const score = () => {
        const r = km.tinhKinhMach(nv, ct);
        const sp = safe(() => ch.tocDoTuLuyen(nv, ct), 0);
        const dp = Math.min(0.12, safe(() => r.biDong.dot_pha, 0) || 0);
        const atk = (r.chieu || []).reduce((a, c) => a + (c.uyLuc || 0), 0);
        return { v: sp * 100 + dp * (bt ? 400 : 120) + atk * 0.3 - (r.diemNghich || 0) * (bt ? 40 : 12), sp, dp, ng: r.diemNghich || 0, atk };
      };
      const before = score();
      const beforeManh = nv.kinhMach.manh.slice();
      for (const m of nv.kinhMach.manh) nv.tuiDo[m.item] = (nv.tuiDo[m.item] || 0) + 1;
      nv.kinhMach.manh = [];
      const cands = Object.keys(nv.tuiDo).filter((id) => nv.tuiDo[id] > 0 && safe(() => km.laManh(ct.items.get(id)), false));
      const placed = [];
      let cur = score();
      for (let step = 0; step < 14; step++) {
        let best = null;
        for (const id of cands) {
          if (!(nv.tuiDo[id] > 0)) continue;
          const pls = safe(() => km.validPlacements(nv, ct, id, [0, 1, 2, 3]), []);
          for (const pl of pls) {
            nv.kinhMach.manh.push(pl);
            nv.tuiDo[id]--;
            const sc = score();
            nv.kinhMach.manh.pop();
            nv.tuiDo[id]++;
            if (sc.v > cur.v + 0.05 && (!best || sc.v > best.sc.v)) best = { pl, sc };
          }
        }
        if (!best) break;
        nv.kinhMach.manh.push(best.pl);
        nv.tuiDo[best.pl.item]--;
        placed.push(best.pl);
        cur = best.sc;
      }
      const same = JSON.stringify(placed.map((p) => [p.item, p.x, p.y, p.xoay]).sort()) === JSON.stringify(beforeManh.map((p) => [p.item, p.x, p.y, p.xoay]).sort());
      const val = {
        before,
        after: cur,
        better: !same && cur.v > before.v + 0.5,
        placed: placed.map((p) => ({ ...p, ten: this.itemName(p.item) })),
        unused: cands.filter((id) => nv.tuiDo[id] > 0).map((id) => this.itemName(id)),
        mode,
      };
      this._kmCache = { key, val };
      return val;
    }

    // ---------------------------------------------------------- tổng hợp
    // ---------------------------------------------------------- chấm TỪNG NÚT (khung sự kiện / khung nơi chốn)
    // Đơn vị điểm: "năm tu luyện ở chỗ tốt nhất". > 0 = lời hơn ngồi bế quan chừng ấy thời gian.
    valCtx(ctx, S, snap) {
      const sn = snap || {};
      const best = Math.max((sn.sites && sn.sites.safeBest && sn.sites.safeBest.tvNam) || 0, (S.here && S.here.tuViNam) || 0, 0.1);
      const lev = (sn.ready && sn.ready.levers) || [];
      const needCH = lev.some((x) => x.where && x.where.unit === 'CH' && !x.far) || !!(sn.sect && sn.sect.thieu && sn.sect.thieu.length);
      return {
        best,
        bestTen: (sn.sites && sn.sites.safeBest && sn.sites.safeBest.ten) || '',
        tl: 5 * (S.speed || 1),
        chY: [10, 15, 25, 40, 60, 80][S.cg] || 15,
        ltY: [10, 40, 80, 180, 450, 1000][S.cg] || 40,
        needCH,
        chMul: safe(() => this.m('progress/tong_mon').heSoCongHien(ctx), 1) || 1,
        lev,
        wish: sn.wish || [],
        ch: S.ch || 0,
        lt: S.lt || 0,
      };
    }
    // Xác suất một điều kiện "if" đúng (ngẫu nhiên → p; "won" → theo mức hiểm trận)
    condP(ctx, cond) {
      if (cond == null) return 1;
      if (cond === 'won') return 'won';
      if (typeof cond === 'object' && Object.keys(cond).length === 1 && typeof cond.ngau_nhien === 'number') return cond.ngau_nhien;
      try {
        return this.m('kernel/conditions').checkCondition(cond, ctx) ? 1 : 0;
      } catch (e) {
        return 0.5;
      }
    }
    walkVal(ctx, S, V, arr, out, w, winP, pre) {
      for (const e of arr || []) {
        if (!e || typeof e !== 'object') continue;
        // phần thưởng của "phúc phận" (if node_flag phuc.X): tính chung ở hiệu ứng phuc_phan bên dưới
        if (e.if && typeof e.if === 'object' && typeof e.if.node_flag === 'string' && e.if.node_flag.startsWith('phuc.')) continue;
        let p = 1;
        if (e.if !== undefined) {
          const c = this.condP(ctx, e.if);
          p = c === 'won' ? winP : c;
          if (!p) continue;
        }
        const k = w * p;
        const add = (v, txt) => {
          out.v += k * v;
          if (txt && k > 0.15) out.parts.push(`${pre}${txt}${p < 0.99 ? ` (${Math.round(p * 100)}%)` : ''}`);
        };
        if (e.tu_luyen !== undefined) {
          const o = typeof e.tu_luyen === 'object' ? e.tu_luyen : { nam: e.tu_luyen };
          const tv = V.tl * (o.nam || 0) * (o.he_so ?? 1);
          out.time += k * (o.nam || 0);
          add(tv / V.best, `+${num(tv)} tu vi`);
        }
        if (typeof e.time === 'number') out.time += k * e.time;
        if (e.tu_vi !== undefined && e.tu_vi > 0) add((e.tu_vi * V.tl) / V.best, `tu vi ~${num(e.tu_vi)} năm tu`);
        if (e.cong_hien !== undefined) {
          const o = typeof e.cong_hien === 'object' ? e.cong_hien : { so: e.cong_hien };
          const n = Math.round((o.so || 0) * (o.theo_canh_gioi ? V.chMul : 1));
          add(n > 0 ? (n / V.chY) * (V.needCH ? 1.6 : 0.7) : n / V.chY, `${n > 0 ? '+' : ''}${n} cống hiến`);
        }
        if (e.linh_thach !== undefined) {
          const o = typeof e.linh_thach === 'object' ? e.linh_thach : { so: e.linh_thach };
          if (o.bac !== undefined) add(o.bac * 0.4, o.bac > 0 ? 'được linh thạch' : 'mất linh thạch');
          else if (typeof o.so === 'number') add(o.so / V.ltY, `${o.so > 0 ? '+' : ''}${o.so} linh thạch`);
        }
        if (e.gia_nhap_mon_phai !== undefined && !S.sect) add(30, 'ĐƯỢC NHẬP TÔNG');
        if (e.stat && typeof e.stat === 'object') for (const [sk, sv] of Object.entries(e.stat)) if (typeof sv === 'number') add(1.2 * sv, `${{ ngo_tinh: 'ngộ tính', can_cot: 'căn cốt', than_phap: 'thân pháp', than_thuc: 'thần thức', dao_tam: 'đạo tâm', co_duyen: 'cơ duyên', tam_ma: 'tâm ma' }[sk] || sk.replace(/_/g, ' ')} ${sv > 0 ? '+' : ''}${sv}`);
        if (typeof e.dao_tam === 'number' && e.dao_tam > 0) add(0.8 * e.dao_tam, `đạo tâm +${e.dao_tam}`);
        if (e.phuc_phan) {
          // phúc phận: tung xác suất (lần đầu trong cửa sổ năm = ti_le[0]); trúng thì các hiệu ứng "if node_flag phuc.<nhom>" chạy
          const tl = ((e.phuc_phan.ti_le || [0.25])[0]) || 0.25;
          const flag = `phuc.${e.phuc_phan.nhom}`;
          const rew = arr.filter((f) => f && f.if && f.if.node_flag === flag).map((f) => ({ ...f, if: undefined }));
          if (rew.length) {
            const tmp = { v: 0, parts: [], time: 0 };
            this.walkVal(ctx, S, V, rew, tmp, 1, winP, '');
            out.v += k * tl * tmp.v;
            out.time += k * tl * tmp.time;
            if (k > 0.15) for (const t of tmp.parts) out.parts.push(`${pre}${t}${tl < 0.99 ? ` (${Math.round(tl * 100)}%)` : ''}`);
          } else add(1.2 * tl, `${Math.round(tl * 100)}% được +1 chỉ số`);
        }
        if (typeof e.tam_ma === 'number' && e.tam_ma < 0) add(-0.15 * e.tam_ma * (S.tamMa > 0 ? 2 : 0.3), `tâm ma ${e.tam_ma}`);
        if (typeof e.heal === 'number') add(S.thuongThe > 0 ? 1.5 * Math.min(e.heal, S.thuongThe) : 0, `chữa ${e.heal} bậc thương thế`);
        if (e.kinh_nghiem_nghe) add(0.15, 'kinh nghiệm nghề');
        if (typeof e.injury === 'number' && e.injury > 0) add(-1.5 * e.injury * (S.thuongThe >= 1 ? 2 : 1), `thương thế +${e.injury}`);
        if (typeof e.tam_ma === 'number' && e.tam_ma > 0) add(-0.15 * e.tam_ma, `tâm ma +${e.tam_ma}`);
        if (typeof e.tho_nguyen === 'number') add(e.tho_nguyen > 0 ? e.tho_nguyen / 4 : e.tho_nguyen / 2, `thọ ${e.tho_nguyen > 0 ? '+' : ''}${e.tho_nguyen}`);
        if (e.add_item !== undefined) add(0.4, 'nhận vật phẩm');
        // treo_thuong: 'tong_mon' = bảng sư môn (Điện nhiệm vụ); true = bảng của chính nơi này (trấn, thành)
        if (e.treo_thuong !== undefined) out.board = e.treo_thuong === 'tong_mon' ? 'tong_mon' : 'thanh_tran';
        if (e.lap_dong_phu) out.cave = true;
        // "Mở tĩnh thất" ở sư môn = mở KHO ĐỒ sư môn (game: mo_tinh_that → kho_do), không phải chỗ bế quan
        if (e.mo_tinh_that) out.kho = true;
        if (e.be_quan || e.be_quan_linh_mach) out.seat = e.be_quan_linh_mach ? 'lm' : typeof e.be_quan === 'object' ? e.be_quan : 'thuong';
        if (e.linh_bong_loc) out.bong = true;
        if (e.ap_che_tam_ma) add(S.tamMa > 0 ? 1 + S.tamMa * 0.2 : 0, `sư phụ áp chế tâm ma (đang ${S.tamMa})`);
        if (e.thanh_tich === 'tien_cu') add(2, 'được tiến cử chân truyền');
        if (e.treo_thuong_xong) add(4, 'xong nhiệm vụ, nhận thưởng');
        if (e.combat !== undefined && !out.combatEff) out.combatEff = e;
        if (e.san_yeu !== undefined) out.hunt = true;
        if (e.goto_scene) out.more = true;
      }
    }
    // Chấm một lựa chọn (raw = định nghĩa trong data; vc = lựa chọn đang hiện của game nếu có)
    evalChoice(ctx, S, V, raw, vc) {
      const out = { v: 0, parts: [], time: 0 };
      if (!raw) return out;
      const q = raw.check ? this.chanceOf(vc && vc.chance, raw, ctx) ?? 0.5 : 1;
      // mức hiểm trận (game tự dò khi lựa chọn đang hiện)
      const all = [...(raw.effects || []), ...(raw.success || []), ...(raw.partial || []), ...(raw.failure || [])];
      const ce = all.find((e) => e && typeof e === 'object' && e.combat !== undefined);
      let risk = vc && vc.risk ? vc.risk.level || vc.risk : null;
      if (!risk && ce) risk = safe(() => (this.combatRisk(ctx, ce) || {}).level, null);
      const winP = { an_toan: 0.97, ngang_suc: 0.75, hiem: 0.3, tu_dia: 0.05 }[risk] ?? 0.6;
      this.walkVal(ctx, S, V, raw.effects, out, 1, winP, '');
      this.walkVal(ctx, S, V, raw.success, out, q, winP, '');
      this.walkVal(ctx, S, V, raw.partial, out, 0, winP, '');
      this.walkVal(ctx, S, V, raw.failure, out, 1 - q, winP, 'hỏng: ');
      if (out.time > 0.01) {
        out.v -= out.time;
        out.parts.push(`tốn ${yrs(out.time)}`);
      }
      if (raw.check) out.parts.unshift(`thành ${pct(q)}`);
      if (ce) {
        const RT = { an_toan: 'trận an toàn', ngang_suc: 'trận ngang sức (dễ bị thương)', hiem: 'trận HIỂM (dễ thua)', tu_dia: 'TỬ ĐỊA' };
        out.v += { an_toan: 0.5, ngang_suc: -2, hiem: -15, tu_dia: -40 }[risk] ?? -4;
        out.parts.unshift(RT[risk] || 'phải đánh (chưa dò được sức địch)');
        out.risk = risk || 'unknown';
      }
      const empty = !all.length && !raw.check;
      if (empty) out.leave = true;
      return out;
    }
    // Lời / lỗ khi khai phủ ở một ô
    caveEval(ctx, S, V, slot) {
      let why;
      try {
        why = this.m('progress/dong_phu').lyDoKhongLap(ctx, slot) || '';
      } catch (e) {
        why = '';
      }
      if (why && !/tối đa/.test(why)) return { v: -2, parts: [why] };
      const lk = this.caveQi(ctx, slot);
      const kind = safe(() => this.m('world/noi').placeKind(ctx, ctx.run, slot).id, '');
      const HS = safe(() => this.m('progress/dong_phu').HE_SO_DONG_PHU, { trong: 1, phe_tich: 1.15, son_thuy: 1.25 });
      const seat = HS[/phe_tich/.test(kind) ? 'phe_tich' : /son_thuy/.test(kind) ? 'son_thuy' : 'trong'] || 1;
      const tv = lk ? 5 * (S.speed || 1) * seat * lk.heSo : 0;
      const cmp = `${num(tv, 2)} tu vi/năm (hiện ${num((S.here && S.here.tuViNam) || 0, 2)}; tốt nhất quanh đây ${num(V.best, 2)}${V.bestTen ? ` ở ${V.bestTen}` : ''})`;
      const parts = [`khai phủ ở đây: ${cmp}`, '+đột phá trong động phủ'];
      if (why) parts.push('phải bỏ động phủ cũ (đã đủ số)');
      return { v: tv >= V.best * 0.97 ? 4 : tv >= V.best * 0.85 ? 0.5 : -1, parts };
    }
    // Nút "Mua / Đổi X": vật đang cần cho đột phá / danh sách cần
    itemNeed(V, text) {
      const t = String(text || '');
      // đúng tên món (không bắt nhầm "Trúc Cơ Đan phương" = đan phương)
      const has = (nm) => {
        if (!nm) return false;
        const i = t.indexOf(nm);
        if (i < 0) return false;
        const after = t.slice(i + nm.length);
        return !/^\s*[\p{L}]/u.test(after) && (i === 0 || /\s/.test(t[i - 1]));
      };
      for (const x of V.lev) {
        const nm = x.item && this.itemName(x.item);
        if (!has(nm)) continue;
        const w = x.where || {};
        const cost = (w.cost || 0) * (x.n || 1);
        const have = w.unit === 'CH' ? V.ch : w.unit === 'LT' ? V.lt : null;
        if (have != null && cost > have) return { v: 1, why: `cần cho đột phá (${sgnPct(x.gain)}) nhưng chưa đủ: ${cost} ${w.unit === 'CH' ? 'cống hiến' : 'linh thạch'}, đang có ${Math.floor(have)}` };
        return { v: x.far ? 1 : 5, why: `CẦN cho đột phá (${sgnPct(x.gain)})${x.far ? ', nhưng khó gom đủ tiền' : ''}` };
      }
      for (const w of V.wish) {
        const nm = w.ten || this.itemName(w.id);
        if (has(nm)) return { v: 3 - (w.prio || 0), why: `đang cần: ${w.why || 'có trong danh sách Mua'}` };
      }
      return null;
    }
    // Việc trên một bảng treo thưởng (game: world/bounty.bangTreoThuong): 'tong_mon' = bảng sư môn,
    // 'thanh_tran' = bảng của nơi đang đứng. Chỉ giữ việc hợp cảnh giới và đi tới kịp hạn; xếp theo lời / thời gian.
    boardJobs(ctx, S, V, kind) {
      const slot = kind === 'tong_mon' ? S.sect && S.sect.slot : S.viTri;
      if (!slot) return [];
      const list = safe(() => this.m('world/bounty').bangTreoThuong(ctx, slot, kind), []) || [];
      const clean = (t) => String(t).replace(/[-]/g, '');
      const out = [];
      for (const j of list) {
        const ten0 = clean(j.ten || '');
        const tierName = ((ten0.match(/·\s*([^·]+)$/) || [])[1] || '').trim();
        const tier = REALM_SHORT.findIndex((r) => tierName.startsWith(r));
        if (tier > S.cg) continue;
        const travel = safe(() => this.m('world/travel').travelYears(ctx, j.slot), 1) || 0;
        const han = j.han || 99;
        if (travel > han - 0.25) continue; // không kịp hạn
        const lt = j.thuong || 0;
        const ch = j.congHien || 0;
        const val = lt / V.ltY + (ch / V.chY) * (V.needCH ? 1.6 : 0.8) - travel * 0.7 + 0.3;
        const thuong = [lt ? `+${lt} linh thạch` : '', ch ? `+${ch} cống hiến` : ''].filter(Boolean).join(', ') || 'thưởng nhỏ';
        out.push({ ten: ten0.replace(/\s*·\s*[^·]+$/, ''), tier: tierName, travel, han, lt, ch, val, thuong, slot: j.slot });
      }
      return out.sort((a, b) => b.val - a.val);
    }
    // Phần chấm cần biết hoàn cảnh: món cần mua, bảng nhiệm vụ, khai phủ, chỗ bế quan, bổng lộc, săn
    extraEval(ctx, S, V, r, text) {
      const it = this.itemNeed(V, text);
      if (it) {
        r.v = Math.max(r.v, it.v);
        r.parts.unshift(it.why);
      }
      if (r.board) {
        const jobs = this.boardJobs(ctx, S, V, r.board);
        const where = r.board === 'tong_mon' ? 'bảng sư môn' : 'bảng của nơi này';
        if (jobs.length) {
          const m = jobs[0];
          r.v = Math.max(r.v, m.val);
          r.parts.push(`mở ${where}: nên nhận "${m.ten}" (${m.thuong} · đi ${yrs(m.travel)}, hạn ${yrs(m.han)})`);
          if (jobs.length > 1) r.parts.push(`hoặc "${jobs[1].ten}"`);
        } else r.parts.push(`${where} không có việc hợp cảnh giới / kịp hạn`);
      }
      if (r.kho) r.parts.push('mở kho đồ sư môn (cất / lấy đồ), KHÔNG phải chỗ bế quan');
      if (r.cave) {
        const ce = this.caveEval(ctx, S, V, S.viTri);
        r.v += ce.v;
        r.parts.unshift(...ce.parts);
      }
      if (r.seat) {
        // hỏi thẳng game: tốc độ tu + tiền thuê / cống hiến mỗi năm của chỗ ngồi này
        const bq = this.m('progress/be_quan');
        let opt = null;
        if (r.seat === 'lm') {
          // linh mạch sư môn (game: he_so [1,1.1,1.3,1.4,1.5][cấp bậc], mốc [3,3,4,4,4], trừ cống hiến / năm)
          const cap = (S.sect && S.sect.capBac) || 0;
          opt = { ten: 'Linh mạch sư môn', he_so: [1, 1.1, 1.3, 1.4, 1.5][cap] || 1, moc_toi_da: [3, 3, 4, 4, 4][cap] || 3, meritPerYear: safe(() => this.m('progress/tong_mon').giaLinhMachNam(ctx), 0) || 0 };
        } else if (typeof r.seat === 'object') opt = r.seat;
        const prep = safe(() => (opt ? bq.chuanBiBeQuan(ctx, opt) : bq.chuanBiBeQuan(ctx)), null);
        const rate = prep && prep.tuViNam != null ? prep.tuViNam : (S.here && S.here.tuViNam) || 0;
        const rent = (prep && prep.rentPerYear) || 0;
        const merit = (opt && opt.meritPerYear) || 0;
        const fee = [rent ? `thuê ${num(rent, 0)} linh thạch/năm` : '', merit ? `tốn ${num(merit, 1)} cống hiến/năm` : ''].filter(Boolean).join(', ');
        const good = rate >= V.best * 0.97;
        r.v += (good ? 3 : 0.2) + (rate / Math.max(0.1, V.best) - 1) * 3 - (merit / V.chY) * (V.needCH ? 1.6 : 0.5) - rent / V.ltY;
        if (rent && V.lt < rent) {
          r.v -= 3;
          r.parts.push(`không đủ tiền thuê (${num(rent, 0)} linh thạch/năm, có ${Math.floor(V.lt)})`);
        }
        r.parts.push(`bế quan ~${num(rate, 2)} tu vi/năm${opt && opt.ten ? ` (${opt.ten})` : ''}${fee ? `, ${fee}` : ''}${good ? '' : `; chỗ tốt nhất ${num(V.best, 2)}${V.bestTen ? ` ở ${V.bestTen}` : ''}`}`);
      }
      if (r.bong) {
        const b = safe(() => this.m('progress/tong_mon').bongLoc(ctx), null);
        const lt = (b && b.linhThach) || 0;
        const ch = (b && b.congHien) || 0;
        if (lt || ch) {
          r.v += 0.3 + lt / V.ltY + (ch / V.chY) * (V.needCH ? 1.6 : 0.7);
          r.parts.push(`lĩnh bổng ${b.nam ? `${b.nam} năm ` : ''}: +${lt} linh thạch, +${ch} cống hiến (miễn phí)`);
        } else r.parts.push('chưa có bổng để lĩnh');
      }
      if (r.hunt && !r.risk) r.parts.push('săn: chọn "Săn loài khác…" để chọn loài an toàn');
      if (r.more && !r.parts.length) r.parts.push('mở thêm lựa chọn');
      if (r.leave) r.parts.push('rời đi, không mất gì');
      return r;
    }
    finishTags(list) {
      const cands = list.filter((x) => !x.lock && !x.leave);
      const top = cands.reduce((a, b) => (!a || b.v > a.v ? b : a), null);
      for (const x of list) {
        if (x.lock) x.tag = 'lock';
        else if (x === top && x.v > 0.05) x.tag = 'best';
        else if (x.v <= -3 || x.risk === 'hiem' || x.risk === 'tu_dia') x.tag = 'bad';
        else if (x.leave) x.tag = top && top.v > 0.05 ? 'leave' : 'best';
        else x.tag = x.v >= 0 ? 'ok' : 'meh';
      }
      // không có gì lời: khuyên rời đi
      if (!list.some((x) => x.tag === 'best')) {
        const lv = list.find((x) => x.leave);
        if (lv) lv.tag = 'best';
      }
      return list;
    }
    // Khung sự kiện đang mở
    adviseEncounter(ctx, S, V) {
      const v = safe(() => this.tt.game.encounterView(), null);
      if (!v || v.done || !(v.choices || []).length) return null;
      const def = safe(() => ctx.content.encounters.get(v.id), null);
      if (!def) return null;
      const raws = safe(() => this.m('encounter/encounter').currentChoices(ctx, def, ctx.run.active), null) || def.choices || [];
      const list = v.choices.map((c) => {
        const raw = raws[c.index];
        const text = String(c.text || '').replace(/\s+/g, ' ').trim();
        const r = this.extraEval(ctx, S, V, this.evalChoice(ctx, S, V, raw, c), text);
        return { text, v: r.v, risk: r.risk, leave: r.leave, lock: c.available === false, why: c.available === false ? c.lockedReason || 'chưa đủ điều kiện' : r.parts.slice(0, 4).join(' · ') };
      });
      return { kind: 'enc', ten: v.ten, list: this.finishTags(list) };
    }
    // Khung nơi chốn (danh sách việc ở một nơi)
    advisePlace(ctx, S, V) {
      const nv = safe(() => this.tt.game.noiView(), null);
      if (!nv || !(nv.hoatDong || []).length) return null;
      const list = nv.hoatDong.map((a) => {
        const ten = String(a.ten || '').trim();
        if (a.lockedReason) return { ten, lock: true, v: 0, why: a.lockedReason };
        let r = { v: 0, parts: [] };
        if (a.id === 'ev.khai_phu') r = this.caveEval(ctx, S, V, S.viTri);
        else if (a.id === 'ev.san_yeu') {
          const pick = this.huntPick();
          const left = this.huntsLeft(ctx, S.viTri);
          const llNeed = S.lichLuyen != null && S.lichLuyenMax != null && S.lichLuyen < S.lichLuyenMax;
          if (pick) r = { v: llNeed ? 1.5 : 0.6, parts: [`vào rồi bấm "Săn loài khác…" → ${pick.ten}${pick.apex ? ' (đầu đàn)' : ''}: an toàn`, llNeed ? 'cần lịch luyện để đột phá' : 'được yêu bì / yêu đan bán lấy tiền', `còn ${left} lượt`] };
          else r = { v: -3, parts: ['không có loài nào an toàn với sức ngươi: bỏ qua'], risk: 'hiem' };
        } else {
          const def = safe(() => ctx.content.encounters.get(a.id), null);
          let best = null;
          for (const raw of (def && def.choices) || []) {
            if (!raw || !raw.text) continue;
            if (raw.requires) {
              let ok = true;
              try {
                ok = this.m('kernel/conditions').checkCondition(raw.requires, ctx);
              } catch (e) {
                ok = true;
              }
              if (!ok) continue;
            }
            const e0 = this.evalChoice(ctx, S, V, raw, null);
            if (e0.leave) continue;
            const e = this.extraEval(ctx, S, V, e0, raw.text);
            e.text = String(raw.text || '').replace(/\{[^}]+\}/g, '…');
            if (!best || e.v > best.v) best = e;
          }
          if (best) r = { v: best.v, risk: best.risk, parts: [`vào rồi chọn "${best.text}"`, ...best.parts] };
          else r = { v: 0, parts: [def && (def.choices || []).some((c) => c && c.text && (c.effects || []).length) ? 'lúc này chưa có lựa chọn nào dùng được (chưa đủ điều kiện)' : 'chỉ để xem'] };
          // Các điện có lựa chọn sinh động (danh sách đổi theo kho): mô tả tay
          const HALL = {
            'ev.tang_kinh_cac': 'đổi công pháp bằng cống hiến (tâm pháp tăng tốc tu / trợ đột phá, gắn vào kinh mạch)',
            'ev.bao_kho': 'đổi đan dược / vật phẩm bằng cống hiến',
            'ev.dan_phong': 'mượn lò luyện đan, đổi đan phương bằng cống hiến',
            'ev.khi_phong': 'mượn lò luyện khí, đổi đồ phổ bằng cống hiến',
            'ev.phu_duong': 'vẽ phù, đổi bút / phù phương',
            'ev.nhan_su_tong_mon': 'chỉ xem bảng nhân sự, không được gì',
            'ev.bai_su': 'bái sư phụ (cần đủ cấp bậc): về sau "Thỉnh giáo" được ngộ tính, áp chế tâm ma, tiến cử chân truyền. Nên chọn người cảnh giới cao',
            'ev.thinh_giao': 'thỉnh giáo sư phụ: +ngộ tính / áp chế tâm ma / học nghề',
            'ev.tinh_that_tong_mon': 'kho đồ sư môn (cất / lấy đồ), KHÔNG phải chỗ bế quan',
            'ev.khach_diem': 'thuê phòng dưỡng thương (chỉ dùng khi đang bị thương, tới Trúc Cơ)',
          };
          if (a.id === 'ev.tang_kinh_cac') {
            const cp = V.lev.find((x) => x.kind === 'cp' && x.where && x.where.kind === 'sect');
            if (cp) r = { v: cp.far ? 1 : 4, parts: [`đổi ${cp.ten}${cp.where.cost ? ` (${cp.where.cost} cống hiến)` : ''}`] };
          }
          if (HALL[a.id] && r.v <= 0.05) r.parts = [HALL[a.id]];
          else if (HALL[a.id] && !best) r.parts.unshift(HALL[a.id]);
          if (a.loai === 'su_kien' || a.loai === 'overlay') r.parts.unshift('sự kiện, vào xem rồi rời được');
        }
        return { ten, v: r.v, risk: r.risk, why: r.parts.slice(0, 4).join(' · ') };
      });
      return { kind: 'noi', list: this.finishTags(list) };
    }
    buttonAdvice(snap) {
      const ctx = safe(() => this.tt.game.readCtx(), null);
      if (!ctx || ctx.run.tran) return null;
      const S = this.status(ctx);
      const V = this.valCtx(ctx, S, snap);
      return { enc: safe(() => this.adviseEncounter(ctx, S, V), null), noi: safe(() => this.advisePlace(ctx, S, V), null) };
    }

    analyze(target) {
      const st = safe(() => this.tt.state(), null);
      if (!st || !st.run) return { ok: false, reason: 'Chưa vào kiếp nào.' };
      if (st.run.ketThuc) return { ok: false, reason: 'Kiếp đã kết thúc: sang Bến Vong Xuyên (luân hồi). Ưu tiên mở khóa Linh căn / Thiên tư.' };
      const ctx = safe(() => this.tt.game.readCtx(), null);
      if (!ctx) return { ok: false, reason: 'Không đọc được trạng thái.' };
      this._ctx = ctx;
      const S = this.status(ctx);
      const tgt = Math.max(S.cg + 1, Math.min(5, target || 4));
      const bt = this.breakthrough(ctx, S);
      const sites = safe(() => this.sites(ctx, S), null);
      let plan = safe(() => this.plan(ctx, S, tgt, sites, bt), null);
      const enc = safe(() => this.encounter(ctx), null);
      const cmb = safe(() => this.combat(ctx, S), null);
      const sect = safe(() => this.sect(ctx, S), null);
      if (sect && !sect.none) sect.slot = S.sect.slot;
      const wish = safe(() => this.wishlist(ctx, S, bt), []);
      const shops = safe(() => this.shops(ctx, S, wish), { byItem: {}, scanned: 0 });
      // Bảo khố sư môn (đổi bằng cống hiến): game liệt kê theo loại vật
      const tmMod = this.m('progress/tong_mon');
      const sectStock = new Map();
      if (S.sect) {
        for (const loai of new Set(wish.map((w) => safe(() => this.item(w.id).loai, null)).filter(Boolean))) {
          for (const r of safe(() => tmMod.hangTong(ctx, loai), [])) sectStock.set(r.id, r);
        }
      }
      for (const w of wish) {
        const sk = sectStock.get(w.id);
        if (sk) {
          w.sect = { gia: sk.gia, capBac: sk.capBac, du: (S.sect.capBac || 0) >= (sk.capBac || 0) };
          if (w.prio > 0.3) w.prio -= 0.3; // có sẵn ở sư môn: dễ lấy hơn
        }
        w.where = (shops.byItem[w.id] || []).slice(0, 2);
        w.price = safe(() => this.m('world/phong_tho').giaMua(ctx, w.id), w.gia);
        if (!w.where.length) w.src = this.sources(w.id);
      }
      const ready = safe(() => this.readiness(ctx, S, bt, sites, wish, shops), null);
      if (ready && bt) {
        bt.planP = Math.max(ready.maxRate, bt.fullTiLe || 0);
        plan = safe(() => this.plan(ctx, S, tgt, sites, bt), plan);
      }
      const cd = safe(() => this.coDuyen(ctx, S), null);
      const km = ctx.run.tran || ctx.run.active ? (this._kmCache && this._kmCache.val) || null : safe(() => this.meridianPlan(ctx, S, ready && !ready.go ? 'tu' : 'bt'), null);
      const actions = this.actions(ctx, S, bt, sites, plan, enc, cmb, sect, wish, shops, ready, cd, km);
      const targets = safe(() => this.targets(ctx, S, sites, wish, shops, sect, actions), { list: [] });
      this._ctx = null;
      return { ok: true, at: Date.now(), version: VERSION, target: tgt, S, bt, ready, cd, km, sites, plan, enc, cmb, sect, wish, shops: { scanned: shops.scanned, boards: shops.boards || [] }, actions, targets };
    }
  }

  // ---------------------------------------------------------------- hướng dẫn tĩnh theo giai đoạn
  const PHASE_GUIDE = {
    0: [
      'Lấy công pháp ngay (Dẫn Khí Quyết ~30 LT ở thư viện, hoặc sự kiện "Lão đạo qua đường"): không có công pháp thì tu ×0,5.',
      'Song / thiên / biến dị linh căn: môn phái (tông nhỏ) thu thẳng bất cứ lúc nào; đại tông chỉ thu vào kỳ tuyển đồ (Trợ Đạo báo khi có).',
      'Phàm Nhân → Luyện Khí: 100%, chỉ cần đủ tu vi. Ghé nơi có mật bí sớm: truyền thừa cổ tu ở cảnh giới thấp gần như cho lên thẳng vài tiểu cảnh giới.',
    ],
    1: [
      'Trong tông: nhiệm vụ cấp thấp (Điện nhiệm vụ), đào quặng 1 lần / năm, bổng lộc; quyên 4 LT = 1 CH khi thiếu.',
      'Lên Trúc Cơ gốc 30%: KHÔNG xung khi còn thấp. Gom Trúc Cơ Đan (+15%), Thanh Tâm Đan (+3%), chữa chấn tổn (Ôn Cơ Đan), xung trong động phủ (+10%) chỗ linh khí dồi dào (+5%), có hộ pháp (+5%), tu đầy Đại viên mãn, đốt 1 nấc thọ (+10%): được 70–90%.',
      'Lịch luyện cạn thì tu ×0,5: săn "loài khác…" an toàn (đầu đàn +6), nhiệm vụ, đi đường.',
    ],
    2: [
      'Động phủ: sau khi khai, linh khí lấy theo nền của ô chứ không theo linh khí trường. Trợ Đạo đã tính sẵn tu vi / năm thật.',
      'Thăng Nội môn (200 công tích + thắng khảo hạch): mở Bổ Khuyết Đan (chữa chấn tổn Kết Đan), Kết Kim Đan (+12%).',
      'Bình cảnh giữa tiểu cảnh giới: Phá Chướng Đan. Đan tu luyện Trúc Cơ: Bồi Nguyên, Tinh Nguyên.',
      'Lên Kết Đan gốc 25%: gom Kết Kim Đan + Thanh Tâm Đan, động phủ, hộ pháp, đốt thọ, rồi mới xung.',
    ],
    3: [
      'Kết Đan cần chỗ linh khí > 2,5 mới khỏi "loãng": thường phải đánh chủ hoặc vào đại tông.',
      'Đan tu luyện Kết Đan (Long Hổ Đan +60% / 50 năm, Kim Lộ Đan); tâm pháp phẩm cao; Toái Bích Đan phá bình cảnh.',
      'Lên Nguyên Anh gốc 10% và có trận tâm ma: Dưỡng Anh (+9%), Hóa Anh (+6%), Trấn Hồn (+5%, tâm ma −30), hộ pháp, động phủ (+5%), đốt thọ (+7% / nấc).',
    ],
    4: ['Nguyên Anh: thăng Trưởng lão (4000 công tích) để mở đan cao cấp; Bồi Anh Đan tu luyện. Lên Hóa Thần gốc 5%: Ngộ Đạo Trà, Thiên Nhất / Vấn Tâm Đan, hộ pháp, đốt thọ.'],
    5: ['Hóa Thần là đỉnh. Giữ thọ bằng Vạn Thọ Đan, Hoàng Trung Lý; tích điểm luân hồi cho kiếp sau.'],
  };


  // ---------------------------------------------------------------- giao diện
  const CSS = `
  .vtd{position:fixed;z-index:99999;display:flex;flex-direction:column;color:var(--muc,#2a2118);font-family:inherit;
    font-size:calc(13px * var(--co-chu,1));line-height:1.4;background:var(--nen-hud,#f6efdff5);
    border:1px solid var(--vien-muc,#8a6a45);box-shadow:0 10px 30px #0006,0 0 0 1px #fff6 inset;overflow:hidden}
  .vtd.desk{width:430px;max-height:82vh;border-radius:10px}
  .vtd.mob{left:0!important;right:0;bottom:0;top:auto!important;width:auto;max-height:62vh;border-radius:14px 14px 0 0;
    font-size:calc(14px * var(--co-chu,1));padding-bottom:env(safe-area-inset-bottom)}
  .vtd.min .vtd-tabs,.vtd.min .vtd-body,.vtd.min .vtd-foot{display:none}
  .vtd-grip,.vtd-head,.vtd-sum,.vtd-tabs,.vtd-foot{flex:none}
  .vtd-grip{display:none;width:44px;height:5px;border-radius:3px;background:#0003;margin:6px auto 0}
  .vtd.mob .vtd-grip{display:block}
  .vtd-head{display:flex;align-items:center;gap:8px;padding:8px 10px 6px;cursor:move;user-select:none;
    background:linear-gradient(180deg,#8a1c1c14,#0000)}
  .vtd.mob .vtd-head{cursor:pointer}
  .vtd-logo{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:var(--chu-do,#8a1c1c);
    color:#fff;font-size:15px;flex:none;box-shadow:0 1px 3px #0004}
  .vtd-title{flex:1;min-width:0}
  .vtd-title b{display:block;color:var(--chu-do,#8a1c1c);font-size:1.02em;letter-spacing:.3px}
  .vtd-title span{display:block;font-size:.82em;color:var(--muc-nhat,#6b5a45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .vtd-head select{font:inherit;font-size:.86em;padding:2px 4px;border:1px solid var(--vien-hud,#c9b48f);border-radius:6px;background:#fff8}
  .vtd-ib{border:0;background:#0000000d;width:28px;height:28px;border-radius:7px;cursor:pointer;color:var(--muc-nhat,#6b5a45);font-size:14px;flex:none}
  .vtd-ib:hover{background:#0000001f}
  .vtd-sum{padding:0 10px 8px;display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;font-size:.84em}
  .vtd-bar{position:relative;height:16px;border-radius:8px;background:#0000001a;overflow:hidden}
  .vtd-bar i{position:absolute;left:0;top:0;bottom:0;border-radius:8px}
  .vtd-bar em{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:.86em;
    font-weight:600;color:#2a2118;text-shadow:0 0 3px #fff}
  .vtd-bar .tv{background:linear-gradient(90deg,#3c8d5a,#6fc28c)}
  .vtd-bar .tho{background:linear-gradient(90deg,#b8863b,#e0b860)}
  .vtd-bar .tho.low{background:linear-gradient(90deg,#b03030,#e06060)}
  .vtd-bar .bt{background:linear-gradient(90deg,#6b4bb0,#a07ce0)}
  .vtd-bar .bt-max{background:#a07ce044}
  .vtd-bar .mark{position:absolute;top:-2px;bottom:-2px;width:2px;background:#8a1c1c}
  .vtd-now{grid-column:1/-1;padding:7px 9px;border-radius:8px;background:#2e7d4f18;border:1px solid #2e7d4f55;font-weight:600}
  .vtd-now.urgent{background:#c0392b18;border-color:#c0392b77}
  .vtd-tabs{display:flex;gap:4px;padding:0 8px 6px;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid var(--vien-hud,#c9b48f)}
  .vtd-tabs::-webkit-scrollbar{display:none}
  .vtd-tabs button{flex:none;border:1px solid transparent;background:#0000000a;padding:4px 10px;border-radius:14px;cursor:pointer;
    color:var(--muc-nhat,#6b5a45);font:inherit;font-size:.9em;white-space:nowrap}
  .vtd.mob .vtd-tabs button{padding:6px 12px}
  .vtd-tabs button.on{background:var(--chu-do,#8a1c1c);color:#fff;font-weight:600}
  .vtd-tabs button .n{display:inline-block;min-width:16px;margin-left:4px;padding:0 4px;border-radius:8px;background:#c0392b;color:#fff;font-size:.8em}
  .vtd-body{overflow:auto;padding:8px 10px 10px;-webkit-overflow-scrolling:touch}
  .vtd-card{margin:0 0 7px;padding:8px 10px;border-radius:9px;background:#ffffff70;border:1px solid #0000001a;border-left-width:4px}
  .vtd-card.urgent{border-left-color:#c0392b;background:#c0392b10}
  .vtd-card.do{border-left-color:#2e7d4f}
  .vtd-card.warn{border-left-color:#d68910}
  .vtd-card.tip{border-left-color:#7f8c8d}
  .vtd-card.info{border-left-color:#5d6d7e}
  .vtd-card .tt{display:flex;gap:7px;align-items:flex-start}
  .vtd-card .ic{flex:none;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-size:11px;color:#fff;margin-top:1px}
  .vtd-card.urgent .ic{background:#c0392b}.vtd-card.do .ic{background:#2e7d4f}.vtd-card.warn .ic{background:#d68910}
  .vtd-card.tip .ic,.vtd-card.info .ic{background:#7f8c8d}
  .vtd-card .why{display:block;color:var(--muc-nhat,#6b5a45);font-size:.88em;margin-top:3px}
  .vtd-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
  .vtd-btn{border:1px solid var(--vien-muc,#8a6a45);background:#fff9;border-radius:7px;padding:3px 10px;cursor:pointer;font:inherit;font-size:.88em;color:var(--muc,#2a2118)}
  .vtd.mob .vtd-btn{padding:6px 12px}
  .vtd-btn.pri{background:var(--chu-do,#8a1c1c);color:#fff;border-color:var(--chu-do,#8a1c1c)}
  .vtd-btn:hover{filter:brightness(1.05)}
  .vtd-h{margin:10px 0 5px;font-weight:700;color:var(--chu-do,#8a1c1c);font-size:.95em;display:flex;align-items:center;gap:6px}
  .vtd-h::after{content:"";flex:1;height:1px;background:#8a1c1c33}
  .vtd-t{width:100%;border-collapse:collapse;font-size:.88em}
  .vtd-t td,.vtd-t th{padding:4px 4px;border-bottom:1px solid #0000001a;text-align:left;vertical-align:top}
  .vtd-t th{color:var(--muc-nhat,#6b5a45);font-weight:600;font-size:.92em}
  .vtd-t td.r,.vtd-t th.r{text-align:right;white-space:nowrap}
  .vtd-chip{display:inline-block;padding:0 6px;border-radius:9px;font-size:.82em;background:#0000000f;margin:1px 3px 1px 0;white-space:nowrap}
  .vtd-chip.g{background:#2e7d4f22;color:#1e5d37}.vtd-chip.r{background:#c0392b22;color:#8f2418}.vtd-chip.y{background:#d6891022;color:#8a5a08}
  .vtd-chip.p{background:#6b4bb022;color:#4b2f8a}
  .vtd-g{color:#2e7d4f}.vtd-r{color:#c0392b}.vtd-m{color:var(--muc-nhat,#6b5a45);font-size:.9em}
  .vtd-gauge{margin:6px 0 4px}
  .vtd-gauge .vtd-bar{height:20px}
  .vtd-legend{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:.82em;color:var(--muc-nhat,#6b5a45);margin:6px 0}
  .vtd-legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:3px;vertical-align:middle}
  .vtd-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .vtd-kpi{padding:6px 8px;border-radius:8px;background:#ffffff70;border:1px solid #0000001a}
  .vtd-kpi b{display:block;font-size:1.15em}
  .vtd-kpi span{font-size:.8em;color:var(--muc-nhat,#6b5a45)}
  .vtd-rec{box-shadow:0 0 0 2px #2e7d4f inset}
  details.vtd-more summary{cursor:pointer;color:var(--muc-nhat,#6b5a45);font-size:.88em;margin:4px 0}
  .vtd-foot{font-size:.78em;color:var(--muc-nhat,#6b5a45);padding:4px 10px;border-top:1px solid var(--vien-hud,#c9b48f);display:flex;justify-content:space-between}
  .ui-item-tile-wrap.vtd-buyw{position:relative;border-radius:5px;box-shadow:0 0 0 3px #e0a800,0 0 14px 4px #e0a800cc !important;
    animation:vtdPulse 1.4s ease-in-out infinite}
  .ui-item-tile-wrap.vtd-buyw::before{content:"★ mua";position:absolute;z-index:3;left:2px;top:2px;
    white-space:nowrap;font-size:9px;line-height:12px;padding:0 3px;border-radius:3px;background:#e0a800;color:#1a1200;font-weight:700;pointer-events:none}
  @keyframes vtdPulse{50%{box-shadow:0 0 0 3px #ffcf33,0 0 20px 7px #ffcf33aa}}
  .vtd-tip{margin-top:4px;padding:3px 5px;border-left:3px solid #d4a017;background:#d4a01722;font-size:.92em}
  .vtd-fab{position:fixed;z-index:99998;right:14px;bottom:84px;width:46px;height:46px;border-radius:50%;border:0;cursor:pointer;
    background:var(--chu-do,#8a1c1c);color:#fff;font-size:20px;box-shadow:0 4px 14px #0006;display:none}
  .vtd-fab.show{display:block}
  /* nhãn khuyên chọn gắn vào từng nút của game */
  .lua-chon-nut button:has(.vtd-ann),.hud-noi-cot li>button:has(.vtd-ann){flex-wrap:wrap;height:auto}
  .vtd-ann{display:block;flex-basis:100%;width:100%;margin-top:3px;font-size:.78em;line-height:1.35;font-weight:400;
    color:#5b4a36;white-space:normal;text-align:left;letter-spacing:0;text-transform:none}
  .vtd-ann b{display:inline-block;padding:0 6px;border-radius:9px;margin-right:5px;font-size:.95em;font-weight:700;color:#fff;background:#8a7a64}
  .vtd-ann[data-k=best] b{background:#2e7d4f}
  .vtd-ann[data-k=best]{color:#1f5a37;font-weight:600}
  .vtd-ann[data-k=bad] b{background:#b03a2e}
  .vtd-ann[data-k=bad]{color:#8a2a20}
  .vtd-ann[data-k=leave] b,.vtd-ann[data-k=lock] b{background:#9a8f80}
  .vtd-ann[data-k=meh] b{background:#b9a27a}
  .vtd-place{font-size:.9em;line-height:1.45}
  .vtd-place .vtd-pbest{color:#1f5a37;font-weight:600}
  `;

  const LV_IC = { urgent: '!', do: '➤', warn: '⚠', tip: '•', info: 'i' };
  const TABS = [
    ['now', 'Ngay'],
    ['bt', 'Đột phá'],
    ['cd', 'Cơ duyên'],
    ['km', 'Kinh mạch'],
    ['site', 'Nơi tu'],
    ['buy', 'Mua'],
    ['plan', 'Lộ trình'],
    ['ev', 'Sự kiện'],
  ];
  const isMobile = () => safe(() => window.matchMedia('(max-width: 760px), (hover: none) and (max-width: 1100px)').matches, false);
  const bar = (cls, frac, label, extra = '') => `<div class="vtd-bar"><i class="${cls}" style="width:${Math.max(0, Math.min(100, (frac || 0) * 100)).toFixed(1)}%"></i>${extra}<em>${label}</em></div>`;

  class UI {
    constructor(tt, mod, engine) {
      this.tt = tt;
      this.mod = mod;
      this.E = engine;
      this.tab = lsGet('tab', 'now');
      const optTarget = safe(() => Number(mod.options.muc_tieu), 4);
      this.target = lsGet('target', optTarget || 4);
      this.last = null;
      this.timer = null;
      this.lastRun = null;
    }
    injectCss() {
      let st = document.getElementById('vtd-css');
      if (!st) {
        st = document.createElement('style');
        st.id = 'vtd-css';
        document.head.appendChild(st);
      }
      if (st.textContent !== CSS) st.textContent = CSS;
    }
    init() {
      this.injectCss();
      if (this.unsub) return;
      this.unsub = this.tt.subscribe(() => this.schedule());
      this.shopTimer = setInterval(() => this.highlightShop(), 800);
      window.addEventListener('resize', () => this.layout());
      const fab = document.createElement('button');
      fab.className = 'vtd-fab';
      fab.textContent = '☯';
      fab.title = 'Mở Trợ Đạo';
      fab.onclick = () => this.show();
      document.body.appendChild(fab);
      this.fab = fab;
      if (lsGet('hidden', false)) fab.classList.add('show');
    }
    mount() {
      this.injectCss();
      const w = document.createElement('div');
      w.className = 'vtd';
      w.innerHTML = `<div class="vtd-grip"></div>
        <div class="vtd-head"><div class="vtd-logo">☯</div><div class="vtd-title"><b>Trợ Đạo</b><span class="vtd-sub">…</span></div>
          <select title="Cảnh giới mục tiêu">${REALM_SHORT.slice(1).map((n, i) => `<option value="${i + 1}">→ ${n}</option>`).join('')}</select>
          <button class="vtd-ib" data-a="min" title="Thu gọn">▾</button><button class="vtd-ib" data-a="close" title="Ẩn">✕</button></div>
        <div class="vtd-sum"></div>
        <div class="vtd-tabs">${TABS.map(([k, t]) => `<button data-t="${k}">${t}</button>`).join('')}</div>
        <div class="vtd-body"></div><div class="vtd-foot"></div>`;
      document.body.appendChild(w);
      this.w = w;
      const sel = w.querySelector('select');
      sel.value = String(this.target);
      sel.onchange = () => {
        this.target = Number(sel.value);
        lsSet('target', this.target);
        this.refresh(true);
      };
      const toggleMin = () => {
        w.classList.toggle('min');
        lsSet('min', w.classList.contains('min'));
        this.renderHead();
      };
      w.querySelector('[data-a=min]').onclick = (e) => {
        e.stopPropagation();
        toggleMin();
      };
      w.querySelector('[data-a=close]').onclick = (e) => {
        e.stopPropagation();
        this.hide();
      };
      w.querySelector('.vtd-head').addEventListener('click', (e) => {
        if (this.mobile && !e.target.closest('button,select')) toggleMin();
      });
      w.querySelectorAll('[data-t]').forEach((b) => {
        b.onclick = () => {
          this.tab = b.dataset.t;
          lsSet('tab', this.tab);
          this.render();
        };
      });
      this.drag(w, w.querySelector('.vtd-head'));
      w.addEventListener('click', (e) => this.onClick(e));
      if (lsGet('min', false)) w.classList.add('min');
      this.layout();
      this.refresh(true);
    }
    layout() {
      if (!this.w) return;
      this.mobile = isMobile();
      this.w.classList.toggle('mob', this.mobile);
      this.w.classList.toggle('desk', !this.mobile);
      if (this.mobile) {
        this.w.style.left = '0px';
        this.w.style.top = 'auto';
      } else {
        const pos = lsGet('pos', { x: window.innerWidth - 450, y: 80 });
        this.w.style.left = `${Math.max(0, Math.min(window.innerWidth - 160, pos.x))}px`;
        this.w.style.top = `${Math.max(0, Math.min(window.innerHeight - 60, pos.y))}px`;
      }
    }
    onClick(e) {
      if (e.target.closest('[data-ann]')) {
        lsSet('ann', !lsGet('ann', true));
        this._annKey = null;
        this.annotate();
        this.render();
        return;
      }
      if (e.target.closest('[data-map]')) {
        lsSet('mapOff', !lsGet('mapOff', false));
        this.drawMap();
        this.render();
        return;
      }
      const ap = e.target.closest('[data-apply-km]');
      if (ap) return this.applyMeridian();
      const b = e.target.closest('[data-go]');
      if (!b) return;
      const slot = b.dataset.slot;
      if (b.dataset.go === 'xem') this.centerOn(slot);
      else {
        const r = this.E.route(this.tt.game.readCtx(), { viTri: safe(() => this.tt.state().run.viTri, '') }, slot);
        safe(() => this.tt.game.travelTo(r.via || slot));
        if (this.mobile) {
          this.w.classList.add('min');
          this.renderHead();
        }
      }
    }
    // Xếp kinh mạch theo kế hoạch: gỡ hết rồi đặt lại (lệnh của game, như người chơi tự kéo)
    applyMeridian() {
      const km = this.last && this.last.km;
      if (!km || !km.placed.length) return;
      const g = this.tt.game;
      safe(() => g.goHetManh());
      let ok = 0;
      for (const p of km.placed) {
        safe(() => {
          g.datManh({ item: p.item, x: p.x, y: p.y, xoay: p.xoay });
          ok++;
        });
      }
      safe(() => this.tt.ui.toast(`Trợ Đạo: đã xếp ${ok}/${km.placed.length} mảnh kinh mạch.`));
      this.E._kmCache = null;
      this.refresh(true);
    }
    centerOn(slot) {
      safe(() => {
        const p = this.tt.game.env.world.slot(slot);
        this.tt.map.cam.centerOn(p.x, p.y);
        this.tt.map.requestRender();
      });
    }
    goButtons(slot, dest) {
      if (!slot) return '';
      return `<div class="vtd-acts"><button class="vtd-btn" data-go="xem" data-slot="${esc(dest || slot)}">📍 Xem trên bản đồ</button><button class="vtd-btn pri" data-go="di" data-slot="${esc(slot)}">➜ Đi tới</button></div>`;
    }
    show() {
      if (!this.w) this.mount();
      this.w.style.display = '';
      if (this.fab) this.fab.classList.remove('show');
      lsSet('hidden', false);
    }
    hide() {
      if (this.w) this.w.style.display = 'none';
      if (this.fab) this.fab.classList.add('show');
      lsSet('hidden', true);
    }
    toggle() {
      if (!this.w || this.w.style.display === 'none') this.show();
      else this.hide();
    }
    drag(w, h) {
      let sx, sy, ox, oy;
      const mv = (e) => {
        w.style.left = `${Math.max(0, ox + e.clientX - sx)}px`;
        w.style.top = `${Math.max(0, oy + e.clientY - sy)}px`;
      };
      const up = () => {
        document.removeEventListener('mousemove', mv);
        document.removeEventListener('mouseup', up);
        lsSet('pos', { x: parseInt(w.style.left, 10), y: parseInt(w.style.top, 10) });
      };
      h.addEventListener('mousedown', (e) => {
        if (this.mobile || e.target.closest('button,select')) return;
        sx = e.clientX;
        sy = e.clientY;
        ox = parseInt(w.style.left, 10) || 0;
        oy = parseInt(w.style.top, 10) || 0;
        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup', up);
        e.preventDefault();
      });
    }
    schedule() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.refresh(false), 350);
      this.kickAnn();
    }
    // ---- nhãn khuyên chọn trên từng nút của game (khung sự kiện + khung nơi chốn)
    kickAnn() {
      if (this._annT) return;
      this._annT = setTimeout(() => {
        this._annT = null;
        safe(() => this.annotate());
      }, 160);
    }
    initAnn() {
      if (this._annObs || typeof MutationObserver === 'undefined') return;
      const isOwn = (n) => n.nodeType === 1 && n.classList && (n.classList.contains('vtd-ann') || n.classList.contains('vtd') || n.classList.contains('vtd-tip'));
      this._annObs = new MutationObserver((ms) => {
        for (const m of ms) {
          const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
          if (t && t.closest && t.closest('.vtd,.vtd-ann')) continue;
          const nodes = [...m.addedNodes, ...m.removedNodes];
          if (nodes.length && nodes.every(isOwn)) continue;
          this.kickAnn();
          return;
        }
      });
      this._annObs.observe(document.body, { childList: true, subtree: true });
    }
    annText(b) {
      return [...b.childNodes]
        .filter((n) => !(n.nodeType === 1 && n.classList.contains('vtd-ann')))
        .map((n) => n.textContent)
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
    }
    annotate() {
      const on = lsGet('ann', true);
      const vis = (b) => b.offsetParent !== null;
      const encB = [...document.querySelectorAll('.lua-chon-nut button')].filter(vis);
      const noiB = [...document.querySelectorAll('.hud-noi-cot li > button')].filter(vis);
      const clear = (b) => {
        const s = b.querySelector(':scope > .vtd-ann');
        if (s) s.remove();
        b.style.outline = '';
      };
      if (!on) {
        [...encB, ...noiB].forEach(clear);
        this.renderPlaceBox(null);
        return;
      }
      if (!encB.length && !noiB.length) return;
      const run = safe(() => this.tt.state().run, null);
      if (!run) return;
      const texts = [...encB, ...noiB].map((b) => this.annText(b));
      const key = [run.nam, run.viTri, run.active && run.active.id, JSON.stringify(run.active && run.active.scene), texts.join('¦')].join('|');
      const missing = [...encB, ...noiB].some((b) => !b.querySelector(':scope > .vtd-ann'));
      if (key === this._annKey && !missing) return;
      this._annKey = key;
      const adv = this.E.buttonAdvice(this.last && this.last.ok ? this.last : null) || {};
      const BADGE = { best: '★ NÊN CHỌN', ok: '✓ được', meh: '· lời ít', bad: '✗ TRÁNH', leave: '↩ rời', lock: '🔒 khóa' };
      const put = (b, a) => {
        if (!a) return clear(b);
        let s = b.querySelector(':scope > .vtd-ann');
        if (!s) {
          s = document.createElement('span');
          s.className = 'vtd-ann';
          b.appendChild(s);
        }
        const html = `<b>${BADGE[a.tag] || '·'}</b>${esc(a.why || '')}`;
        if (s.innerHTML !== html) s.innerHTML = html;
        s.dataset.k = a.tag;
        b.style.outline = a.tag === 'best' ? '2px solid #2e7d4f' : a.tag === 'bad' ? '1px dashed #b03a2e' : '';
      };
      const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (adv.enc) {
        const L = adv.enc.list;
        encB.forEach((b, i) => {
          const t = norm(this.annText(b));
          const a = L.find((x) => x.text && t.startsWith(norm(x.text).slice(0, 18))) || (encB.length === L.length ? L[i] : null);
          put(b, a);
        });
      } else encB.forEach(clear);
      if (adv.noi) {
        const L = adv.noi.list;
        noiB.forEach((b) => {
          const t = norm(this.annText(b));
          put(b, L.find((x) => x.ten && t.includes(norm(x.ten))) || null);
        });
      } else noiB.forEach(clear);
      this.renderPlaceBox(adv.noi);
    }
    // Khối "Trợ Đạo" cuối khung nơi chốn: nên làm gì ở đây
    renderPlaceBox(noi) {
      const el = this.placeEl;
      if (!el || !el.isConnected) return;
      if (!noi || !lsGet('ann', true)) {
        el.innerHTML = '';
        return;
      }
      const best = noi.list.find((x) => x.tag === 'best');
      const a = this.last && this.last.ok ? this.last.actions.find((x) => ['urgent', 'do'].includes(x.level)) : null;
      el.innerHTML = `<div class="vtd-place">${best ? `<div class="vtd-pbest">★ Ở đây nên: ${esc(best.ten)}${best.why ? ` (${esc(best.why)})` : ''}</div>` : '<div>Ở đây không có việc gì lời: rời đi.</div>'}${a ? `<div>Việc chính của Trợ Đạo: ${esc(a.text)}</div>` : ''}<div class="hud-phu">Nhãn trên từng nút: ★ nên chọn · ✓ được · ✗ tránh · ↩ rời.</div></div>`;
    }
    refresh(force) {
      const run = safe(() => this.tt.state().run, null);
      if (!force && run && run === this.lastRun) return;
      this.lastRun = run;
      const t0 = performance.now();
      this.last = safe(() => this.E.analyze(this.target), { ok: false, reason: 'Lỗi phân tích (xem console).' });
      this.last.ms = Math.round(performance.now() - t0);
      window.__vktTroDao.lastSnapshot = this.last;
      if (this.onUpdate) safe(() => this.onUpdate(this.last));
      this.render();
      safe(() => this.drawMap());
      safe(() => this.highlightShop());
    }

    // ------------------------------------------------ bản đồ: điểm đến, cỡ chữ cố định khi zoom
    mountMap(layer) {
      this.layer = layer;
      safe(() => {
        if (!this._camHooked) {
          this._camHooked = true;
          let pend = false;
          this.tt.map.cam.onChange(() => {
            if (pend) return;
            pend = true;
            requestAnimationFrame(() => {
              pend = false;
              if (Math.abs((this.tt.map.cam.scale || 1) - (this._drawnScale || 0)) > 0.02) this.drawMap();
            });
          });
        }
      });
      this.drawMap();
      return () => {
        this.layer = null;
      };
    }
    drawMap() {
      const L = this.layer;
      const P = this.tt.pixi;
      if (!L || !P) return;
      for (const c of L.removeChildren()) safe(() => c.destroy({ children: true }));
      const a = this.last;
      if (!a || !a.ok || !a.targets || lsGet('mapOff', false)) return safe(() => this.tt.map.requestRender());
      const z = safe(() => this.tt.map.cam.scale, 1) || 1;
      this._drawnScale = z;
      const k = 1 / z; // 1 px màn hình theo tọa độ thế giới
      const COLOR = { tu: 0x2e7d4f, mua: 0xc9a227, tong: 0x2f5fa8, san: 0xd68910, chu: 0xc0392b, bi: 0x8e44ad, co_duyen: 0x8e44ad, nhiem_vu: 0x2f5fa8, nhiem_vu_nhan: 0x2f5fa8 };
      const list = a.targets.list.slice(0, 8);
      const here = a.targets.here;
      const g = new P.Graphics();
      L.addChild(g);
      const main = list[0];
      if (main && here) {
        const dx = main.x - here.x;
        const dy = main.y - here.y;
        const len = Math.hypot(dx, dy) || 1;
        const step = 7 * k;
        for (let s = 0; s < len; s += step * 2) {
          const e = Math.min(len, s + step);
          g.moveTo(here.x + (dx * s) / len, here.y + (dy * s) / len).lineTo(here.x + (dx * e) / len, here.y + (dy * e) / len);
        }
        g.stroke({ width: 2.5 * k, color: COLOR[main.kind] || 0x2e7d4f, alpha: 0.9 });
      }
      list.forEach((t, i) => {
        const col = COLOR[t.kind] || 0x555555;
        const big = i === 0;
        const r = (big ? 9 : 6) * k;
        g.circle(t.x, t.y, r).stroke({ width: (big ? 3 : 2) * k, color: col, alpha: 0.95 });
        g.circle(t.x, t.y, r * 0.38).fill({ color: col, alpha: 0.95 });
        if (big) g.circle(t.x, t.y, r + 5 * k).stroke({ width: 1.5 * k, color: col, alpha: 0.45 });
        const txt = new P.Text({ text: `${big ? '➤ ' : ''}${t.label}`, style: { fontSize: big ? 14 : 12, fill: col, fontWeight: '700' } });
        txt.resolution = 2;
        txt.scale.set(k);
        const padX = 5 * k;
        const padY = 2 * k;
        const bw = txt.width + padX * 2;
        const bh = txt.height + padY * 2;
        const bx = t.x - bw / 2;
        const by = t.y - r - 6 * k - bh;
        const bg = new P.Graphics();
        bg.roundRect(bx, by, bw, bh, 4 * k).fill({ color: 0xfffaf0, alpha: 0.93 }).stroke({ width: (big ? 2 : 1.2) * k, color: col });
        bg.moveTo(t.x, by + bh).lineTo(t.x, t.y - r).stroke({ width: 1.2 * k, color: col });
        txt.x = bx + padX;
        txt.y = by + padY;
        L.addChild(bg);
        L.addChild(txt);
      });
      safe(() => this.tt.map.requestRender());
    }

    // ------------------------------------------------ tiệm: tô sáng ô hàng nên mua
    highlightShop() {
      const a = this.last;
      const tiles = document.querySelectorAll('.hud-man .ui-item-tile');
      if (!tiles.length) return;
      const want = new Map();
      if (a && a.ok) {
        for (const w of a.wish || []) want.set(w.ten, w.why);
        for (const x of (a.ready && a.ready.levers) || []) if (x.item) want.set(this.E.itemName(x.item), `chuẩn bị đột phá ${sgnPct(x.gain)}`);
      }
      for (const t of tiles) {
        const name = t.getAttribute('aria-label') || '';
        const why = want.get(name);
        const wrap = t.closest('.ui-item-tile-wrap') || t;
        if (why) {
          if (!wrap.classList.contains('vtd-buyw')) wrap.classList.add('vtd-buyw');
          t.title = `Trợ Đạo: ${why}`;
        } else if (wrap.classList.contains('vtd-buyw')) wrap.classList.remove('vtd-buyw');
      }
    }

    // ------------------------------------------------ vẽ bảng
    renderHead() {
      if (!this.w) return;
      const a = this.last;
      const sub = this.w.querySelector('.vtd-sub');
      const sum = this.w.querySelector('.vtd-sum');
      this.w.querySelector('[data-a=min]').textContent = this.w.classList.contains('min') ? '▴' : '▾';
      if (!a || !a.ok) {
        sub.textContent = a ? a.reason : 'Đang chờ game…';
        sum.innerHTML = '';
        return;
      }
      const S = a.S;
      sub.textContent = `${S.ten || ''} · ${S.realm} · ${S.viTriTen}`;
      const R = a.ready;
      const first = a.actions.find((x) => x.lv === 'urgent' || x.lv === 'do') || a.actions[0];
      const tvFrac = S.need ? S.tuVi / S.need : 0;
      const thoFrac = S.tho ? S.tuoi / S.tho : 0;
      const btBar = R
        ? bar('bt', R.nowBest, `Xung ${a.bt.targetTen}: ${pct(R.nowBest)} / tối đa ${pct(R.maxRate)}`, `<i class="bt-max" style="width:${(R.maxRate * 100).toFixed(1)}%"></i><span class="mark" style="left:${(R.target * 100).toFixed(1)}%"></span>`)
        : bar('bt', 1, a.bt && a.bt.max ? 'Đỉnh cao nhất' : 'Đột phá: —');
      sum.innerHTML = `${bar('tv', tvFrac, `Tu vi ${num(S.tuVi, 0)}/${num(S.need, 0)} · ${num(S.here ? S.here.tuViNam : 0, 1)}/năm`)}
        ${bar(`tho${S.thoCon < 20 ? ' low' : ''}`, thoFrac, `Thọ ${Math.floor(S.tuoi)}/${S.tho} · còn ${Math.round(S.thoCon)}`)}
        <div style="grid-column:1/-1">${btBar}</div>
        ${first && (this.tab !== 'now' || this.w.classList.contains('min')) ? `<div class="vtd-now ${first.lv === 'urgent' ? 'urgent' : ''}">${esc(first.text)}</div>` : ''}`;
    }
    render() {
      if (!this.w) return;
      this.renderHead();
      const a = this.last;
      const body = this.w.querySelector('.vtd-body');
      const foot = this.w.querySelector('.vtd-foot');
      this.w.querySelectorAll('[data-t]').forEach((b) => {
        b.classList.toggle('on', b.dataset.t === this.tab);
        const n = a && a.ok ? { now: a.actions.filter((x) => x.lv === 'urgent').length, ev: a.enc && !a.enc.utility ? 1 : 0, km: a.km && a.km.better ? 1 : 0 }[b.dataset.t] : 0;
        const label = (TABS.find((t) => t[0] === b.dataset.t) || [])[1];
        b.innerHTML = `${label}${n ? `<span class="n">${n}</span>` : ''}`;
      });
      if (!a || !a.ok) {
        body.innerHTML = `<div class="vtd-card warn">${esc(a ? a.reason : 'Đang chờ game…')}</div>`;
        foot.innerHTML = `<span>Trợ Đạo ${VERSION}</span>`;
        return;
      }
      const fn = { now: this.rNow, bt: this.rBt, cd: this.rCd, km: this.rKm, buy: this.rBuy, plan: this.rPlan, site: this.rSite, ev: this.rEv }[this.tab] || this.rNow;
      const keepScroll = body.scrollTop;
      body.innerHTML = fn.call(this, a);
      body.scrollTop = keepScroll;
      foot.innerHTML = `<span>Trợ Đạo ${VERSION} · năm ${Math.floor(a.S.nam)}</span><span>${a.ms} ms · mục tiêu ${REALM_SHORT[a.target]}</span>`;
    }
    card(x) {
      return `<div class="vtd-card ${x.lv}"><div class="tt"><span class="ic">${LV_IC[x.lv] || '•'}</span><div>${esc(x.text)}${x.why ? `<span class="why">${esc(x.why)}</span>` : ''}</div></div>${this.goButtons(x.slot, x.dest)}</div>`;
    }
    rNow(a) {
      const main = a.actions.filter((x) => x.lv !== 'tip').map((x) => this.card(x)).join('');
      const tips = a.actions.filter((x) => x.lv === 'tip');
      const map = lsGet('mapOff', false);
      const legend = `<div class="vtd-legend"><span><i style="background:#2e7d4f"></i>tu / khai phủ</span><span><i style="background:#c9a227"></i>mua</span><span><i style="background:#2f5fa8"></i>sư môn / nhiệm vụ</span><span><i style="background:#d68910"></i>săn</span><span><i style="background:#c0392b"></i>có chủ</span><span><i style="background:#8e44ad"></i>cơ duyên</span><button class="vtd-btn" data-map="1">${map ? 'Bật' : 'Tắt'} vẽ bản đồ</button><button class="vtd-btn" data-ann="1">${lsGet('ann', true) ? 'Tắt' : 'Bật'} nhãn trên nút</button></div>`;
      const g = (PHASE_GUIDE[a.S.cg] || []).map((t) => `<div class="vtd-card tip"><div class="tt"><span class="ic">•</span><div>${esc(t)}</div></div></div>`).join('');
      return `${main}${tips.length ? `<div class="vtd-h">Nên làm thêm</div>${tips.map((x) => this.card(x)).join('')}` : ''}${legend}
        <details class="vtd-more"><summary>Bí quyết giai đoạn ${esc(REALM_SHORT[a.S.cg])}</summary>${g}</details>`;
    }
    rBt(a) {
      const b = a.bt;
      if (!b) return '<div class="vtd-card warn">Không đọc được thông tin đột phá.</div>';
      if (b.max) return '<div class="vtd-card do">Đã ở cảnh giới cao nhất.</div>';
      const R = a.ready;
      let h = '';
      if (R) {
        h += `<div class="vtd-grid"><div class="vtd-kpi"><span>Bây giờ</span><b>${pct(R.nowBest, 1)}</b></div><div class="vtd-kpi"><span>Chuẩn bị đủ (khả thi)</span><b class="vtd-g">${pct(R.maxRate, 1)}</b></div>
          <div class="vtd-kpi"><span>Ngưỡng nên xung</span><b>${pct(R.target, 0)}</b></div><div class="vtd-kpi"><span>Cả món khó lấy</span><b>${pct(R.maxSoft, 1)}</b></div></div>`;
        h += `<div class="vtd-card ${R.go ? 'do' : 'warn'}"><div class="tt"><span class="ic">${R.go ? '➤' : '⏸'}</span><div>${R.go ? `Xung kích ${esc(b.targetTen)} ngay (${pct(R.nowBest)})${R.useBurn ? `, kèm đốt ${R.burn.nam} năm thọ` : ''}.` : `Chưa xung: còn cách ngưỡng ${pct(R.target - R.nowBest)}.`}${b.chan ? `<span class="why">${esc(b.chan)}</span>` : ''}${R.urgent ? '<span class="why">Thọ không đủ chuẩn bị thêm.</span>' : ''}</div></div></div>`;
        const rows = R.levers
          .map((x) => {
            const w = x.where;
            const st = x.far ? '<span class="vtd-chip r">quá xa / quá đắt</span>' : x.soft ? '<span class="vtd-chip y">chưa chắc lấy được</span>' : '<span class="vtd-chip g">làm được</span>';
            return `<tr><td>${esc(x.ten)}${w ? `<br><span class="vtd-m">${esc(w.ten)}${w.cost ? ` · ${w.cost * (x.n || 1)} ${esc(w.unit)}` : ''}</span>` : ''}<br>${st}</td><td class="r vtd-g">${sgnPct(x.gain)}</td></tr>`;
          })
          .join('');
        h += `<div class="vtd-h">Chuẩn bị (xếp theo % tăng)</div><table class="vtd-t">${rows || '<tr><td>Không còn gì để thêm.</td></tr>'}</table>
          <div class="vtd-m">Ngân sách ước tính: thu ~${R.incLT} LT/năm ở cảnh giới này, dùng nửa thọ còn lại để chuẩn bị.</div>`;
      }
      const src = b.nguon.map((n) => `<tr><td>${esc(n.ten)}</td><td class="r ${n.gt >= 0 ? 'vtd-g' : 'vtd-r'}">${sgnPct(n.gt, 1)}</td></tr>`).join('');
      const burns = b.burns.map((x) => `<tr><td>Đốt ${x.nam} năm thọ${x.nac === 2 ? ' (cưỡng ép, phẩm −1)' : ''}</td><td class="r">${x.duoc ? pct(x.tiLe, 1) : '<span class="vtd-r">không đủ thọ</span>'}</td></tr>`).join('');
      return `${h}<details class="vtd-more"><summary>Các dòng cộng / trừ tỉ lệ tại ${esc(a.S.viTriTen)}</summary><table class="vtd-t">${src}</table></details>
        ${burns ? `<details class="vtd-more"><summary>Thiêu đốt thọ nguyên</summary><table class="vtd-t">${burns}</table><div class="vtd-m">Thọ đốt mất vĩnh viễn dù thành hay bại.</div></details>` : ''}
        ${b.tamMa ? `<div class="vtd-card warn"><div class="tt"><span class="ic">⚠</span><div>Lên ${esc(b.targetTen)} phải đánh tâm ma (${esc(b.tamMa.ten)}, ${b.tamMa.diem} điểm).</div></div></div>` : ''}
        <div class="vtd-m">Hỏng: tốn ${b.namXungKich ?? '?'} năm + hồi phục 2–6 năm, thêm chấn tổn −5%, hao tu vi, có thể tắc kinh mạch / tụt cảnh giới.</div>`;
    }
    rCd(a) {
      const c = a.cd;
      if (!c) return '<div class="vtd-card warn">Không quét được cơ duyên.</div>';
      let h = `<div class="vtd-card ${c.done.truyen ? 'info' : 'do'}"><div class="tt"><span class="ic">✦</span><div>Truyền thừa cổ tu: ${c.done.truyen ? 'đã nhận ở kiếp này.' : '<b>chưa nhận</b>. 1 lần mỗi kiếp, chỉ ở nơi có mật bí (linh địa, di tích, bí cảnh): tu vi rất lớn (có khi vượt 2 tiểu cảnh giới), ngộ tính +3, đạo tâm +2. Cần ngộ tính đủ để qua kiểm tra.'}</div></div></div>`;
      h += `<div class="vtd-h">Nơi có mật bí (cả chỗ còn mây)</div><table class="vtd-t"><tr><th>Nơi</th><th>Hiểm</th><th class="r">Đi</th></tr>${c.secrets
        .map((r) => `<tr><td>${esc(r.ten)} ${r.fog ? '<span class="vtd-chip">mây</span>' : ''}${r.ready ? '<span class="vtd-chip g">bốc được</span>' : `<span class="vtd-chip">${yrs(r.next)} nữa</span>`}<br><span class="vtd-m">${esc(r.kind)}</span></td><td>${esc(r.danger)}</td><td class="r">${yrs(r.travel)}<br><button class="vtd-btn" data-go="di" data-slot="${esc(r.slot)}">Đi</button></td></tr>`)
        .join('')}</table><div class="vtd-m">Mỗi nơi bốc sự kiện ~5 năm một lần; sự kiện mật bí hiếm. "Động phủ ẩn" cho nhiều linh thạch (2 lần / kiếp).</div>`;
      if (c.realms.length) h += `<div class="vtd-h">Bí cảnh</div><table class="vtd-t">${c.realms.map((r) => `<tr><td>${esc(r.ten)} ${r.open ? '<span class="vtd-chip g">đang mở</span>' : '<span class="vtd-chip">đóng</span>'}</td><td>${esc(r.danger)}</td><td class="r">${yrs(r.travel)}</td></tr>`).join('')}</table>`;
      return h;
    }
    rKm(a) {
      const k = a.km;
      if (!k) return '<div class="vtd-card info">Đang trong trận / sự kiện: tính kinh mạch sau.</div>';
      const kpi = (t, b0, b1, f) => `<div class="vtd-kpi"><span>${t}</span><b>${f(b0)} → <span class="${b1 > b0 + 1e-9 ? 'vtd-g' : b1 < b0 - 1e-9 ? 'vtd-r' : ''}">${f(b1)}</span></b></div>`;
      let h = `<div class="vtd-grid">${kpi('Tốc độ tu luyện', k.before.sp, k.after.sp, (v) => `×${num(v, 2)}`)}${kpi('Trợ đột phá', k.before.dp, k.after.dp, (v) => `+${Math.round(v * 100)}%`)}
        ${kpi('Sức đánh (tổng uy lực)', k.before.atk, k.after.atk, (v) => Math.round(v))}${kpi('Điểm nghịch', -k.before.ng, -k.after.ng, (v) => Math.abs(v))}</div>`;
      h += k.better
        ? `<div class="vtd-card do"><div class="tt"><span class="ic">➤</span><div>Cách xếp tốt hơn (${k.mode === 'bt' ? 'ưu tiên đột phá, không điểm nghịch' : 'ưu tiên tốc độ tu luyện'}).</div></div><div class="vtd-acts"><button class="vtd-btn pri" data-apply-km="1">Áp dụng cách xếp này</button></div></div>`
        : '<div class="vtd-card info"><div class="tt"><span class="ic">✓</span><div>Kinh mạch đã xếp tốt với đồ đang có.</div></div></div>';
      const rot = ['0°', '90°', '180°', '270°'];
      h += `<div class="vtd-h">Vị trí từng mảnh</div><table class="vtd-t"><tr><th>Mảnh</th><th class="r">Cột, hàng</th><th class="r">Xoay</th></tr>${k.placed.map((p) => `<tr><td>${esc(p.ten)}</td><td class="r">${p.x + 1}, ${p.y + 1}</td><td class="r">${rot[p.xoay] || p.xoay}</td></tr>`).join('')}</table>`;
      if (k.unused.length) h += `<div class="vtd-m">Không nên lắp (vướng chỗ / tương khắc / không lợi): ${esc(k.unused.join(', '))}</div>`;
      h += '<div class="vtd-m">Mẹo: tâm pháp kề đan điền; mảnh cùng hệ linh căn được hợp màu; tránh đặt hai hệ tương khắc cạnh nhau (Kim–Mộc, Mộc–Thổ, Thổ–Thủy, Thủy–Hỏa, Hỏa–Kim). Dùng lượt "Thông" mở ô tắc kề vùng đã thông để có thêm chỗ.</div>';
      return h;
    }
    rBuy(a) {
      const W = a.wish || [];
      if (!W.length) return '<div class="vtd-card do">Hiện không có món nào cần mua gấp.</div>';
      const inShop = document.querySelector('.hud-man .ui-item-tile');
      let h = `<div class="vtd-m">Đã quét hàng ${a.shops ? a.shops.scanned : 0} nơi có tiệm (cả chỗ còn mây). Có ${num(a.S.lt, 0)} LT${a.S.sect ? `, ${num(a.S.ch, 0)} CH` : ''}.${inShop ? ' Ô nên mua trong tiệm đang mở có viền vàng.' : ''}</div>`;
      for (const w of W) {
        const where = w.where || [];
        const afford = a.S.lt >= (w.price || 0);
        h += `<div class="vtd-card ${w.prio <= 1 ? 'do' : 'tip'}"><div class="tt"><span class="ic">★</span><div><b>${esc(w.ten)}</b> · ~${w.price} LT ${afford ? '<span class="vtd-chip g">đủ tiền</span>' : `<span class="vtd-chip r">thiếu ${Math.max(0, w.price - Math.floor(a.S.lt))}</span>`}
          <span class="why">${esc(w.why)}</span>
          ${w.sect ? `<span class="why">Bảo khố sư môn: <b>${w.sect.gia} CH</b>${w.sect.du ? '' : ' (chưa đủ cấp bậc)'}</span>` : ''}
          ${where.length ? where.map((s) => `<span class="why">Bán ở <b>${esc(s.ten)}</b> (${esc(s.shops.slice(0, 3).join(', '))}) · đi ${yrs(s.travel)}</span>`).join('') : w.sect ? '' : `<span class="why">Quanh đây không ai bày bán. Nguồn: ${esc(w.src || '?')}</span>`}</div></div>${where[0] ? this.goButtons(this.E.goSlot(this.tt.game.readCtx(), a.S, where[0].slot), where[0].slot) : ''}</div>`;
      }
      return h;
    }
    rPlan(a) {
      const p = a.plan;
      if (!p) return '<div class="vtd-card warn">Không lập được lộ trình.</div>';
      if (p.done) return '<div class="vtd-card do">Đã đạt mục tiêu. Chọn mục tiêu cao hơn ở đầu bảng.</div>';
      const rows = p.steps
        .map((s) => `<tr><td><b>${esc(s.ten)} → ${esc(s.toTen)}</b><br><span class="vtd-m">${num(s.tuVi, 0)} tu vi · ${num(s.rate, 1)}/năm</span></td><td class="r">${yrs(s.years)}</td><td class="r">${pct(s.p)}</td><td class="r ${s.margin != null && s.margin < 0 ? 'vtd-r' : 'vtd-g'}">${Math.round(s.endAge)}/${s.tho ?? '?'}</td></tr>`)
        .join('');
      const bad = p.steps.find((s) => s.margin != null && s.margin < 0);
      const best = a.sites && (a.sites.safeBest || a.sites.top[0]);
      return `<div class="vtd-card ${p.ok ? 'do' : 'urgent'}"><div class="tt"><span class="ic">${p.ok ? '✓' : '!'}</span><div>${p.ok ? `Khả thi: ~${yrs(p.totalYears)} tới ${esc(REALM_SHORT[p.target])}.` : `Theo tốc độ hiện tại sẽ hết thọ ở chặng ${esc(bad.ten)} → ${esc(bad.toTen)}${bad.needRate ? `: cần ≥ ${num(bad.needRate, 1)} tu vi/năm (đang ~${num(bad.rate, 1)})` : ''}.`}</div></div></div>
        <table class="vtd-t"><tr><th>Chặng</th><th class="r">Bế quan</th><th class="r">Xung</th><th class="r">Tuổi/thọ</th></tr>${rows}</table>
        <div class="vtd-m">Giả định: ngồi ở chỗ tốt nhất an toàn${best ? ` (${esc(best.ten)})` : ''}; tỉ lệ xung = chuẩn bị đủ (động phủ, linh khí, 2 đan mạnh nhất, hộ pháp, tâm pháp, đốt 1 nấc thọ).</div>
        <div class="vtd-h">Đường tối ưu</div>${[0, 1, 2, 3, 4].filter((r) => r >= a.S.cg && r < p.target).map((r) => `<div class="vtd-card tip"><div class="tt"><span class="ic">${r + 1}</span><div><b>${esc(REALM_SHORT[r])} → ${esc(REALM_SHORT[r + 1])}:</b> ${esc((PHASE_GUIDE[r] || []).join(' '))}</div></div></div>`).join('')}`;
    }
    rSite(a) {
      const s = a.sites;
      if (!s) return '<div class="vtd-card warn">Không quét được bản đồ.</div>';
      const row = (r) => `<tr><td>${esc(r.ten)}${r.own ? ' ★' : ''} ${r.fog ? '<span class="vtd-chip">mây</span>' : ''}<br><span class="vtd-m">${esc(r.seatTen)}${r.note ? ` · ${esc(r.note)}` : ''}</span></td><td class="r"><b>${num(r.tvNam, 2)}</b></td><td>${esc(r.lk)}<br><span class="vtd-m">${esc(r.danger)}</span></td><td class="r">${yrs(r.travel)}<br><button class="vtd-btn" data-go="di" data-slot="${esc(r.slot)}">Đi</button></td></tr>`;
      const head = '<tr><th>Nơi</th><th class="r">/năm</th><th>Linh khí</th><th class="r">Đi</th></tr>';
      const ms = s.masters.map((r) => `<tr><td>${esc(r.ten)}<br><span class="vtd-m">${esc(r.master.title)} ${esc(r.master.ten)}${r.master.cg != null ? ` (${esc(REALM_SHORT[r.master.cg] || r.master.cg)})` : ''}</span></td><td class="r">${num(r.ifWin, 2)}</td><td>${esc(r.lk)}<br><span class="vtd-m">${esc(r.danger)}</span></td><td class="r">${yrs(r.travel)}</td></tr>`).join('');
      return `<div class="vtd-m">Hiện ${num(s.hereRate, 2)} tu vi/năm. ★ = chỗ của ngươi; "mây" = chưa khám phá (Trợ Đạo dẫn qua ô đã mở gần nhất).</div>
        <table class="vtd-t">${head}${s.top.map(row).join('')}</table>
        ${ms ? `<div class="vtd-h">Có chủ: thắng chủ → khai phủ ×1,1</div><table class="vtd-t"><tr><th>Nơi / chủ</th><th class="r">Nếu thắng</th><th>Linh khí</th><th class="r">Đi</th></tr>${ms}</table>` : ''}`;
    }
    rEv(a) {
      let h = '';
      if (a.cmb) {
        h += `<div class="vtd-h">Trận đang mở</div><div class="vtd-card ${a.cmb.win === false ? 'urgent' : 'do'}">${esc(a.cmb.text || 'Xem dự kiến trên màn trận.')}</div>`;
        for (const x of a.cmb.advice) h += this.card(x);
        const th = (a.cmb.throwables || []).filter((x) => !x.keep).slice(0, 8);
        if (th.length) h += `<div class="vtd-m">Nên ném trước (rẻ, không cần): ${esc(th.map((x) => `${x.ten} (${x.gia})`).join(', '))}</div>`;
      }
      const e = a.enc;
      if (!e) return h || '<div class="vtd-m">Chưa có sự kiện nào đang mở. Mở một sự kiện, bảng sẽ chấm từng lựa chọn.</div>';
      if (e.utility) return `${h}<div class="vtd-m">Đang ở "${esc(e.ten)}" (tiện ích), không chấm điểm.</div>`;
      if (e.xuTri || e.pursuit) return `${h}<div class="vtd-card do">${esc(e.xuTri ? `Chọn "${e.xuTriTen}"` : `Chọn "${e.pursuitTen}"`)}</div>`;
      h += `<div class="vtd-h">${esc(e.ten)} · ${esc(e.noi || '')}</div>`;
      for (const c of e.choices) {
        h += `<div class="vtd-card ${c.index === e.rec ? 'do vtd-rec' : 'tip'}"><div class="tt"><span class="ic">${c.index === e.rec ? '➤' : c.index + 1}</span><div>${esc(c.text)}
          <span class="why">${c.p != null ? `<span class="vtd-chip p">thành ${pct(c.p)}</span>` : ''}${c.gains.map((g) => `<span class="vtd-chip g">${esc(g)}</span>`).join('')}${c.losses.map((g) => `<span class="vtd-chip r">${esc(g)}</span>`).join('')}${c.risk.text ? `<span class="vtd-chip ${c.risk.bad ? 'r' : 'y'}">trận: ${esc(c.risk.text)}</span>` : ''}${c.locked ? `<span class="vtd-chip">khóa: ${esc(c.locked)}</span>` : ''}</span></div></div></div>`;
      }
      return h;
    }
  }

  // ---------------------------------------------------------------- khởi động
  const api = { version: VERSION, lastSnapshot: null, engine: null, ui: null };
  window.__vktTroDao = api;
  api.snapshot = () => {
    // bản gọn cho monitor bên ngoài (JSON được)
    const a = api.lastSnapshot;
    if (!a) return null;
    return JSON.parse(JSON.stringify(a, (k, v) => (k === 'raw' ? undefined : v)));
  };
  api.refresh = () => api.ui && api.ui.refresh(true);
  api.setTarget = (t) => {
    if (!api.ui) return;
    api.ui.target = Number(t);
    lsSet('target', api.ui.target);
    if (api.ui.w) api.ui.w.querySelector('select').value = String(t);
    api.ui.refresh(true);
  };

  function start(tt, mod) {
    const engine = new Engine(tt);
    const ui = new UI(tt, mod, engine);
    api.engine = engine;
    api.ui = ui;
    let dock = null;
    safe(() => {
      mod.ui.addPanel({
        id: 'bang',
        title: 'Trợ Đạo',
        mount(el) {
          el.innerHTML = '<p>Bảng Trợ Đạo là cửa sổ nổi (kéo được). Bấm để bật / tắt.</p><button class="nut-chinh">Bật / tắt Trợ Đạo</button>';
          el.querySelector('button').onclick = () => ui.toggle();
        },
      });
      dock = mod.ui.addDock({
        id: 'ngay',
        title: 'Trợ Đạo',
        mount(el) {
          const draw = () => {
            const a = api.lastSnapshot;
            el.textContent = a && a.ok && a.actions[0] ? a.actions[0].text : 'Trợ Đạo đang chờ…';
          };
          draw();
          el.style.cursor = 'pointer';
          el.onclick = () => ui.show();
          const t = setInterval(draw, 1500);
          return () => clearInterval(t);
        },
      });
    });
    // Lớp vẽ trên bản đồ (tọa độ thế giới = tọa độ slot)
    safe(() =>
      mod.ui.addSlot('mapLayer', {
        id: 'chi_duong',
        mount: (layer) => ui.mountMap(layer),
      }),
    );
    // Dòng gợi ý trong tooltip / thẻ vật phẩm (ở tiệm, túi đồ…)
    safe(() =>
      mod.ui.addSlot('itemTooltip', {
        id: 'goi_y',
        mount(el, _tt, itemId) {
          const a = api.lastSnapshot;
          if (!a || !a.ok) return;
          const w = (a.wish || []).find((x) => x.id === itemId);
          const it = engine.item(itemId);
          let txt = '';
          if (w) txt = `Trợ Đạo: NÊN MUA. ${w.why}`;
          else if (it && it.dot_pha && it.dot_pha.ti_le) txt = `Trợ Đạo: đan đột phá ${sgnPct(it.dot_pha.ti_le * 1)}${it.dot_pha.canh_gioi !== undefined ? ` khi lên ${REALM_SHORT[it.dot_pha.canh_gioi]}` : ''}${it.dot_pha.canh_gioi !== undefined && it.dot_pha.canh_gioi !== a.S.cg + 1 ? ' (chưa dùng được bây giờ)' : ''}.`;
          else if (it && it.tu_luyen) txt = `Trợ Đạo: bế quan ${REALM_SHORT[it.tu_luyen.canh_gioi]} +${Math.round(it.tu_luyen.toc_do * 100)}% trong ${it.tu_luyen.nam} năm${it.tu_luyen.canh_gioi !== a.S.cg ? ' (không đúng cảnh giới hiện tại)' : ''}.`;
          if (!txt) return;
          const d = document.createElement('div');
          d.className = 'vtd-tip';
          d.textContent = txt;
          el.appendChild(d);
        },
      }),
    );
    // Khối cuối khung nơi chốn: nên làm gì ở đây
    safe(() =>
      mod.ui.addSlot('placeInfo', {
        id: 'nen_lam',
        title: 'Trợ Đạo',
        mount(el) {
          ui.placeEl = el;
          ui._annKey = null;
          ui.kickAnn();
          return () => {
            if (ui.placeEl === el) ui.placeEl = null;
          };
        },
      }),
    );
    ui.onUpdate = (a) => {
      if (dock && a && a.ok && a.actions[0]) safe(() => dock.setValue(a.actions[0].text.slice(0, 24)));
      ui._annKey = null;
      ui.kickAnn();
    };
    ui.init();
    ui.initAnn();
    const autoOpen = safe(() => mod.options.tu_mo, true) !== false;
    if (autoOpen && !lsGet('hidden', false)) ui.show();
    else ui.refresh(true);
    safe(() => tt.ui.toast('Trợ Đạo đã nạp. Ẩn bảng thì bấm nút ☯ để mở lại.'));
  }

  const entry = {
    id: MOD_ID,
    name: 'Trợ Đạo',
    version: VERSION,
    apiVersion: 1,
    author: 'vkt_tro_dao',
    ready(tt, mod) {
      start(tt, mod);
    },
  };
  (window.tuTienMods ??= []).push(entry);
})();
