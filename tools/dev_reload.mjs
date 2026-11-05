// Dev: nạp lại mod/vkt_tro_dao/main.js vào tab game đang mở (Edge chạy với --remote-debugging-port).
// Game không cho đăng ký trùng id mod trong một phiên, nên bản dev đăng ký dưới id tạm.
//   node tools/dev_reload.mjs            nạp lại
//   node tools/dev_reload.mjs eval "<js>" chạy JS trong trang, in kết quả
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.VKT_PORT || 9222);
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = list.find((t) => t.type === 'page' && t.url.includes('van-kiep-tu-tien'));
if (!page) {
  console.error('Không thấy tab game');
  process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => new Promise((r) => {
  const i = ++id;
  pending.set(i, r);
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return `LỖI: ${r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text}`;
  return r.result?.result?.value;
};

const [, , cmd, arg] = process.argv;
if (cmd === 'eval') {
  const v = await evaluate(arg);
  console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
} else {
  // Tải lại trang để xóa sạch các bản dev cũ (game không cho gỡ mod đã đăng ký trong phiên)
  if (cmd !== 'nore') {
    await send('Page.reload', {});
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const ok = await evaluate("!!(window.tuTien && window.tuTien.phase === 'ready' && window.tuTien.state().run)");
      if (ok === true) break;
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  const src = fs
    .readFileSync(path.join(ROOT, 'mod', 'vkt_tro_dao', 'main.js'), 'utf8')
    .replace("    id: MOD_ID,", `    id: 'vtd_dev_${Date.now()}',`);
  console.log(await evaluate(`(()=>{const a=window.__vktTroDao;if(a&&a.ui){try{a.ui.unsub&&a.ui.unsub()}catch(e){}try{clearInterval(a.ui.shopTimer)}catch(e){}try{a.ui.layer&&a.ui.layer.removeChildren();a.ui.layer=null}catch(e){}}delete window.__vktTroDao;document.querySelectorAll('.vtd-win').forEach(e=>e.remove());return 'đã gỡ bản cũ'})()`));
  console.log(await evaluate(`${src};'đã nạp bản dev'`));
}
ws.close();
process.exit(0);
