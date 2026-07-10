/**
 * GARAGE PRO — MÁY CHỦ NỘI BỘ (LAN)
 * Chạy: node server.js   (yêu cầu Node.js >= 14, không cần cài thêm gói nào)
 *
 * - Máy chủ đọc code.js (backend gốc viết cho Google Apps Script) và chạy nó
 *   trên nền lớp giả lập trong gas-shim.js. Dữ liệu lưu tại data/garage-data.json.
 * - Giao diện Index.html được phục vụ nguyên bản, chỉ "bơm" thêm một đoạn
 *   polyfill google.script.run để mọi lời gọi backend đi qua HTTP nội bộ.
 * - Toàn bộ thư viện (Chart.js, SheetJS, Font Awesome) nằm trong thư mục
 *   vendor/ → hoạt động hoàn toàn OFFLINE, không cần Internet.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createEnvironment, DB_FILE } = require('./gas-shim');
let native = require('./native'); // lớp API đã tách khỏi Apps Script (nạp nóng được)
const security = require('./native/security'); // xác thực, băm PIN, phiên token

// ── HTTPS: nạp hoặc tạo chứng chỉ tự ký để mã hóa đường truyền (TLS) ──
let https = null, TLS = null;
(function chuanBiTLS() {
  if (process.env.GARAGE_HTTP === '1') return; // ép chạy HTTP nếu muốn
  try { https = require('https'); } catch (e) { https = null; return; }
  try {
    const { chuanBiTLS } = require('./tao-chung-chi');
    const kq = chuanBiTLS(path.join(__dirname, 'certs'));
    if (!kq) { https = null; return; }
    TLS = { key: kq.key, cert: kq.cert };
    console.log('[TLS] HTTPS bật: CA gốc riêng + chứng chỉ máy chủ do CA ký (IP: ' + kq.ips.join(', ') + ').');
    console.log('[TLS] CÀI CA GỐC 1 lần/máy: mở http(s)://<địa-chỉ>:8080/garage-ca.crt → cài vào "Trusted Root Certification Authorities".');
  } catch (e) { https = null; TLS = null; console.log('[TLS] Không bật được HTTPS, chạy HTTP:', e.message); }
})();

// ══════════════ CẤU HÌNH ══════════════
const PORT = Number(process.env.PORT || 8080);
const HOST = '0.0.0.0'; // lắng nghe mọi địa chỉ trong mạng LAN

// Tài khoản quản trị mặc định (tạo sẵn lần chạy đầu — đổi mã trong ứng dụng sau khi vào)
const ADMIN_EMAIL = 'admin@garage.local';
const ADMIN_NAME = 'Quản trị viên';
const ADMIN_PIN = '112233';

// Chỉ cho phép gọi các hàm này qua HTTP (mọi hàm khác đi qua wrapper api()
// của backend — nơi đã có sẵn kiểm tra phiên + phân quyền)
const HTTP_FN_WHITELIST = new Set(['api', 'dangNhap', 'kiemTraChuFile', 'dangXuat']);

// ══════════════ NẠP BACKEND (code.js) ══════════════
const env = createEnvironment(ADMIN_EMAIL);

// Dựng backend từ code.js (dùng lại được khi nạp nóng — không cần khởi động lại)
function dungBackend() {
  const codeText = fs.readFileSync(path.join(__dirname, 'code.js'), 'utf8');
  const factory = new Function(
    'SpreadsheetApp', 'Session', 'Utilities', 'CacheService', 'Logger', 'HtmlService', 'LockService',
    codeText + '\n;return { api: api, dangNhap: dangNhap, kiemTraChuFile: kiemTraChuFile, chuanHoaHeThong: (typeof chuanHoaHeThong==="function"?chuanHoaHeThong:null), ghiLog: (typeof ghiLog==="function"?ghiLog:null), datPhien: datPhien_, resolveFn: function(n){ if(!/^[A-Za-z0-9_]+$/.test(n)||/_$/.test(n)||n==="api")return null; try{var f=eval(n);return typeof f==="function"?f:null;}catch(e){return null;} } };'
  );
  return factory(env.SpreadsheetApp, env.Session, env.Utilities, env.CacheService, env.Logger, env.HtmlService, env.LockService);
}
let backend = dungBackend();

// ══════════════ KHỞI TẠO DỮ LIỆU LẦN ĐẦU ══════════════
(function initData() {
  const book = env.book;
  const firstRun = !book.getSheetByName('LenhSuaChua');
  if (firstRun && typeof backend.chuanHoaHeThong === 'function') {
    console.log('[INIT] Lần chạy đầu — tạo cấu trúc 16 bảng dữ liệu...');
    backend.chuanHoaHeThong();
  }
  // Bảo đảm luôn có tài khoản quản trị
  let shPQ = book.getSheetByName('PhanQuyen');
  if (!shPQ) {
    shPQ = book.insertSheet('PhanQuyen');
    shPQ.appendRow(['Email', 'Họ Tên', 'Phân Quyền', 'Trạng Thái', 'Mã Bảo Mật']);
  }
  const vals = shPQ.getDataRange().getValues();
  let hasAdmin = false;
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim().toLowerCase() === ADMIN_EMAIL) { hasAdmin = true; break; }
  }
  if (!hasAdmin) {
    shPQ.appendRow([ADMIN_EMAIL, ADMIN_NAME, 'Admin', 'Hoạt động', ADMIN_PIN]);
    console.log('[INIT] Đã tạo tài khoản quản trị: ' + ADMIN_EMAIL + ' / mã: ' + ADMIN_PIN);
  }
  book.save(true);
  // Băm mọi PIN còn lưu dạng thô (bảo mật khi lưu trữ)
  try {
    const n = security.diTruBamPin(book);
    if (n > 0) { console.log('[BẢO MẬT] Đã băm ' + n + ' mã PIN đang lưu dạng thô.'); book.save(true); }
  } catch (e) { console.error('[BẢO MẬT] Lỗi băm PIN:', e.message); }
  book.backup(); // sao lưu mỗi lần khởi động
})();

// ══════════════ VÁ GIAO DIỆN (Index.html) ══════════════
const POLYFILL = `
<script>
/* ===== Polyfill google.script.run → HTTP nội bộ (tự động bơm bởi server.js) ===== */
(function () {
  function taoChuoi() {
    var okFn = function () {}, errFn = function (e) { console.error(e); };
    var px; // proxy — khai báo trước để các hàm chuỗi trả về CHÍNH PROXY
    var chuoi = {
      withSuccessHandler: function (f) { okFn = f || okFn; return px; },
      withFailureHandler: function (f) { errFn = f || errFn; return px; },
      withUserObject: function () { return px; }
    };
    px = new Proxy(chuoi, {
      get: function (target, prop) {
        if (prop in target) return target[prop];
        return function () {
          var args = Array.prototype.slice.call(arguments);
          fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fn: String(prop), args: args })
          }).then(function (r) {
            if (!r.ok) throw new Error('Máy chủ trả về lỗi HTTP ' + r.status);
            return r.json();
          }).then(function (d) {
            if (d && d.__auth) { if (typeof window.__hetPhien === 'function') window.__hetPhien(); errFn(new Error(d.__error || 'Hết phiên')); }
            else if (d && d.__error) errFn(new Error(d.__error));
            else okFn(d ? d.result : null);
          }).catch(function (e) { errFn(e); });
        };
      }
    });
    return px;
  }
  window.google = window.google || {};
  window.google.script = window.google.script || {};
  Object.defineProperty(window.google.script, 'run', { get: taoChuoi });
})();
</script>`;

function patchHtml(html) {
  return html
    // Thư viện CDN → bản nội bộ trong vendor/
    .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js@4\.4\.0\/dist\/chart\.umd\.min\.js/g, '/vendor/chart.umd.min.js')
    .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/xlsx@0\.18\.5\/dist\/xlsx\.full\.min\.js/g, '/vendor/xlsx.full.min.js')
    .replace(/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome\/[^"']+/g, '/vendor/fontawesome/css/all.min.css')
    .replace(/https:\/\/fonts\.googleapis\.com\/[^"']+/g, '/vendor/empty.css')
    .replace(/https:\/\/cdn-icons-png\.flaticon\.com\/[^"']+/g, '/vendor/icon.svg')
    // Bơm polyfill ngay sau <head>
    .replace(/<head>/i, '<head>' + POLYFILL);
}

let HTML_CACHE = null;
function getHtml() {
  if (!HTML_CACHE) {
    HTML_CACHE = patchHtml(fs.readFileSync(path.join(__dirname, 'Index.html'), 'utf8'));
  }
  return HTML_CACHE;
}

// ══════════════ MÁY CHỦ HTTP ══════════════
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon'
};

function serveVendor(req, res, urlPath) {
  // Chống thoát thư mục
  const rel = path.normalize(urlPath.replace(/^\/vendor\//, '')).replace(/^(\.\.[\/\\])+/, '');
  const file = path.join(__dirname, 'vendor', rel);
  if (!file.startsWith(path.join(__dirname, 'vendor'))) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400'
    });
    res.end(buf);
  });
}

// Ghi log hệ thống từ lớp native (tận dụng hàm ghiLog của code.js nếu có)
function ghiLogNative(loai, hanhDong, doiTuong) {
  try {
    if (backend && typeof backend.ghiLog === 'function') return backend.ghiLog(loai, hanhDong, doiTuong);
  } catch (e) {}
  // Dự phòng: ghi thẳng vào bảng LogHeThong
  try {
    const sh = env.book.getSheetByName('LogHeThong');
    if (sh) sh.appendRow([new Date(), '', '', loai, hanhDong, doiTuong]);
  } catch (e) {}
}

function handleApi(req, res) {
  let body = '';
  req.on('data', c => { body += c; if (body.length > 20 * 1024 * 1024) req.destroy(); });
  req.on('end', async () => {
    let out;
    try {
      const { fn, args } = JSON.parse(body || '{}');
      if (!HTTP_FN_WHITELIST.has(fn)) throw new Error('Hàm không được phép gọi trực tiếp: ' + fn);
      const arr = Array.isArray(args) ? args : [];
      const ipKey = (req.socket && req.socket.remoteAddress) || 'ip';

      // ── ĐĂNG NHẬP: xác thực (băm PIN) + chống dò + cấp token phiên ──
      if (fn === 'dangNhap') {
        const email = String(arr[0] || '').trim().toLowerCase();
        const pin = arr[1];
        const khoaKey = 'login:' + (email || ipKey);
        const conKhoa = security.biKhoa(khoaKey);
        if (conKhoa > 0) {
          out = { result: { success: false, msg: 'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ' + Math.ceil(conKhoa / 60) + ' phút.' } };
        } else {
          const kq = security.xacThucDangNhap(env.book, email, pin, { ownerEmail: ADMIN_EMAIL, backupCode: ADMIN_PIN });
          if (kq.success) {
            security.xoaThatBai(khoaKey);
            const token = security.taoPhien(kq.currentUser);
            try { ghiLogNative('Đăng nhập', 'Đăng nhập thành công', email); } catch (e) {}
            out = { result: { success: true, currentUser: kq.currentUser, token: token } };
          } else {
            security.ghiThatBai(khoaKey);
            out = { result: kq };
          }
        }

      // ── ĐĂNG XUẤT: hủy token phiên ──
      } else if (fn === 'dangXuat') {
        security.xoaPhien(arr[0]);
        out = { result: { success: true } };

      // ── CỬA NGÕ NATIVE: arr[0] là TOKEN phiên (không còn là email) ──
      } else if (fn === 'api' && arr.length >= 2) {
        const token = arr[0], tenHam = arr[1], thamSo = Array.isArray(arr[2]) ? arr[2] : [];
        const phien = security.layPhien(token);
        if (!phien) {
          out = { __error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', __auth: true };
        } else {
          const email = phien.email, role = phien.role;
          const r = native.goi(tenHam, {
            book: env.book, email, role, args: thamSo,
            ghiLog: ghiLogNative, backend, token: email
          });
          let value = (r && Object.prototype.hasOwnProperty.call(r, '__value')) ? r.__value : r;
          if (value && typeof value.then === 'function') value = await value; // hàm bất đồng bộ (connector)
          out = { result: value === undefined ? null : value, __native: !!(r && r.__native) };
        }
      } else {
        // kiemTraChuFile (và trường hợp api thiếu tham số) → GAS như cũ
        const result = backend[fn].apply(null, arr);
        out = { result: result === undefined ? null : result };
      }
    } catch (e) {
      out = { __error: e && e.message ? e.message : String(e) };
    }
    // Lưu dữ liệu nếu có thay đổi (ghi nguyên tử, an toàn)
    try { env.book.save(); } catch (e) { console.error('[DATA]', e.message); }
    let json;
    try { json = JSON.stringify(out); }
    catch (e) { json = JSON.stringify({ __error: 'Không tuần tự hóa được kết quả: ' + e.message }); }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(json);
  });
}

// ===== SSE (realtime): đẩy tín hiệu khi dữ liệu thay đổi =====
const _sseClients = new Set();
function handleSSE(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 3000\n\n');
  res.write('event: hello\ndata: {"ok":true}\n\n');
  _sseClients.add(res);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 25000);
  req.on('close', () => { clearInterval(ping); _sseClients.delete(res); });
}
// Theo dõi phiên bản dữ liệu; đổi thì đẩy cho mọi client (realtime ~2s)
let _phienCu = -1;
setInterval(() => {
  let v;
  try { v = native.phienBanDuLieu ? native.phienBanDuLieu() : 0; } catch (e) { return; }
  if (v !== _phienCu) {
    _phienCu = v;
    let cat = [];
    try { cat = native.layCatThayDoi ? native.layCatThayDoi() : []; } catch (e) {}
    const msg = 'event: change\ndata: ' + JSON.stringify({ ver: v, cat }) + '\n\n';
    for (const c of _sseClients) { try { c.write(msg); } catch (e) { _sseClients.delete(c); } }
  }
}, 1200);

// ══════════════ NẠP NÓNG (cập nhật không cần khởi động lại) ══════════════
function _dayReload(lyDo) {
  const msg = 'event: reload\ndata: ' + JSON.stringify({ lyDo: lyDo || '' }) + '\n\n';
  for (const c of _sseClients) { try { c.write(msg); } catch (e) { _sseClients.delete(c); } }
}

// Nạp lại backend (code.js + native + connectors) mà KHÔNG mất dữ liệu/kết nối.
// Giữ bản cũ nếu bản mới lỗi (an toàn).
function napLaiBackend() {
  const nativeCu = native, backendCu = backend;
  try {
    for (const k of Object.keys(require.cache)) {
      // Nạp lại native/ và connectors/, NHƯNG giữ security.js (chứa phiên đăng nhập + chống dò)
      if (/[\\/](native|connectors)[\\/]/.test(k) && !/[\\/]security\.js$/.test(k)) delete require.cache[k];
    }
    const nativeMoi = require('./native');
    const backendMoi = dungBackend();
    if (!nativeMoi || typeof nativeMoi.goi !== 'function' || !backendMoi) throw new Error('Bản mới không hợp lệ');
    native = nativeMoi; backend = backendMoi;
    console.log('[NẠP NÓNG] Đã nạp lại backend từ đĩa.');
    return { success: true };
  } catch (e) {
    native = nativeCu; backend = backendCu;
    console.error('[NẠP NÓNG] Lỗi, giữ bản cũ:', e.message);
    return { success: false, msg: e.message };
  }
}

// Theo dõi file thay đổi → tự áp dụng (debounce). Thay file là xong, không restart.
(function theoDoiCapNhat() {
  let hen = null, canBackend = false, canFront = false;
  const kichHoat = () => {
    clearTimeout(hen);
    hen = setTimeout(() => {
      let lyDo = '';
      if (canBackend) { const r = napLaiBackend(); lyDo = r.success ? 'Đã cập nhật hệ thống' : 'Cập nhật backend lỗi'; canBackend = false; }
      if (canFront) { HTML_CACHE = null; if (!lyDo) lyDo = 'Đã cập nhật giao diện'; canFront = false; }
      _dayReload(lyDo);
      console.log('[NẠP NÓNG] ' + (lyDo || 'Đã áp dụng thay đổi') + ' — client sẽ tự tải lại.');
    }, 400);
  };
  const watch = (target, laBackend) => {
    try {
      fs.watch(path.join(__dirname, target), { persistent: false }, () => {
        if (laBackend) canBackend = true; else canFront = true;
        kichHoat();
      });
    } catch (e) {}
  };
  watch('Index.html', false);
  watch('code.js', true);
  watch('native', true);
  watch('connectors', true);
})();

function xuLyRequest(req, res) {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (req.method === 'POST' && urlPath === '/api') return handleApi(req, res);
  if (urlPath === '/events') return handleSSE(req, res);
  if (urlPath.startsWith('/vendor/')) return serveVendor(req, res, urlPath);
  // Tải CA GỐC để cài làm tin cậy trên mỗi máy (hết cảnh báo "không bảo mật")
  if (urlPath === '/chung-chi' || urlPath === '/garage-ca.crt') {
    try {
      const crt = fs.readFileSync(path.join(__dirname, 'certs', 'ca-cert.pem'));
      res.writeHead(200, { 'Content-Type': 'application/x-x509-ca-cert', 'Content-Disposition': 'attachment; filename="garage-pro-ca.crt"' });
      return res.end(crt);
    } catch (e) { res.writeHead(404); return res.end('Chua co CA (dang chay HTTP).'); }
  }
  if (urlPath === '/' || urlPath === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(getHtml());
  }
  if (urlPath === '/favicon.ico') { res.writeHead(302, { Location: '/vendor/icon.svg' }); return res.end(); }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Khong tim thay');
}

const dungHttps = !!(https && TLS);
const server = dungHttps ? https.createServer(TLS, xuLyRequest) : http.createServer(xuLyRequest);

// Dọn phiên hết hạn định kỳ
setInterval(() => { try { security.donPhienHetHan(); } catch (e) {} }, 60000);

server.listen(PORT, HOST, () => {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) ips.push(ni.address);
    }
  }
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║        GARAGE PRO — MÁY CHỦ NỘI BỘ ĐÃ SẴN SÀNG           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  const proto = dungHttps ? 'https' : 'http';
  console.log('  Mở trên máy này :  ' + proto + '://localhost:' + PORT);
  ips.forEach(ip => console.log('  Máy khác trong LAN :  ' + proto + '://' + ip + ':' + PORT));
  console.log('');
  if (dungHttps) console.log('  Bảo mật: HTTPS (mã hóa đường truyền). Lần đầu trình duyệt báo "chứng chỉ tự ký" — chọn nâng cao/tiếp tục để vào.');
  else console.log('  Bảo mật: HTTP. Để bật mã hóa HTTPS: chạy "npm install selfsigned" rồi khởi động lại.');
  console.log('  Đăng nhập lần đầu:  ' + ADMIN_EMAIL + '   |   mã: ' + ADMIN_PIN);
  console.log('  Dữ liệu (SQLite):  ' + DB_FILE);
  console.log('  (Nhấn Ctrl+C để dừng máy chủ — dữ liệu được lưu tự động)');
  console.log('');
});

// Lưu dữ liệu định kỳ + khi thoát
setInterval(() => { try { env.book.save(); } catch (e) {} }, 15000);
function thoat() {
  console.log('\n[EXIT] Đang lưu dữ liệu...');
  try { env.book.close(); } catch (e) { try { env.book.save(true); } catch (x) {} }
  process.exit(0);
}
process.on('SIGINT', thoat);
process.on('SIGTERM', thoat);
