/**
 * NẠP DỮ LIỆU TỪ GOOGLE SHEETS (file .xlsx xuất ra) VÀO GARAGE PRO (SQLite)
 *
 * Cách dùng:
 *   1. Trong Google Sheets: Tệp → Tải xuống → Microsoft Excel (.xlsx)
 *   2. TẮT máy chủ Garage Pro nếu đang chạy
 *   3. Chạy:   node nap-du-lieu.js  duong/dan/Drive.xlsx
 *   4. Khởi động lại máy chủ (start.bat)
 *
 * Dữ liệu được ghi vào cơ sở dữ liệu SQLite data/garage.db (thay thế toàn bộ).
 * Bản dữ liệu cũ (nếu có) được sao lưu vào data/backups/ trước khi ghi đè.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const XLSX = require('./vendor/xlsx.full.min.js');
const { createEnvironment, DB_FILE } = require('./gas-shim');

const TZ_OFFSET_H = 7; // GMT+7 — khớp gas-shim.js

const fileExcel = process.argv[2];
if (!fileExcel) { console.log('Cách dùng:  node nap-du-lieu.js <file.xlsx>'); process.exit(1); }
if (!fs.existsSync(fileExcel)) { console.error('[LỖI] Không tìm thấy file: ' + fileExcel); process.exit(1); }

// ── Quy đổi ô ngày về Date chuẩn GMT+7 (không phụ thuộc múi giờ máy) ──
function wallToVN(d) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) - TZ_OFFSET_H * 3600 * 1000);
}
function pad2(n) { return ('0' + n).slice(-2); }
function doiGiaTri(v) {
  if (v instanceof Date) {
    if (v.getFullYear() < 1904) return pad2(v.getHours()) + ':' + pad2(v.getMinutes()); // ô chỉ có giờ
    return wallToVN(v);
  }
  if (v === undefined || v === null) return '';
  return v;
}

console.log('Đang đọc: ' + fileExcel + ' ...');
const wb = XLSX.read(fs.readFileSync(fileExcel), { type: 'buffer', cellDates: true });

// Đọc & làm sạch từng bảng
const sheets = {};
let tongDong = 0;
for (const name of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
  const data = rows.map(r => r.map(doiGiaTri));
  while (data.length && data[data.length - 1].every(c => c === '' || c === null)) data.pop();
  for (const r of data) { while (r.length && (r[r.length - 1] === '' || r[r.length - 1] === null)) r.pop(); }
  if (!data.length) { console.log('  (bỏ qua bảng rỗng: ' + name + ')'); continue; }
  sheets[name] = data;
  tongDong += data.length;
  console.log('  ✓ ' + name + ': ' + (data.length - 1) + ' dòng');
}
if (!sheets['LenhSuaChua'] && !sheets['DanhMucVatTu']) {
  console.error('\n[LỖI] File không có bảng của hệ thống Garage.'); process.exit(1);
}

// ── Mở CSDL qua shim, sao lưu, thay thế toàn bộ, ghi ──
const env = createEnvironment('admin@garage.local');
const book = env.book;
book.backup(); // sao lưu dữ liệu cũ (nếu có)

// Xóa mọi bảng cũ rồi nạp bảng mới
for (const sh of book.getSheets()) sh.clearContents();
for (const name of Object.keys(sheets)) {
  let sh = book.getSheetByName(name) || book.insertSheet(name);
  const data = sheets[name];
  sh.getRange(1, 1, data.length, Math.max(...data.map(r => r.length))).setValues(
    data.map(r => { const c = r.slice(); while (c.length < Math.max(...data.map(x => x.length))) c.push(''); return c; })
  );
}
book.save(true);

console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║  ✓ NẠP DỮ LIỆU VÀO SQLite THÀNH CÔNG               ║');
console.log('╚════════════════════════════════════════════════════╝');
console.log('  Số bảng : ' + Object.keys(sheets).length);
console.log('  Tổng dòng: ' + tongDong);
console.log('  CSDL    : ' + DB_FILE);
console.log('\nBây giờ hãy khởi động máy chủ (start.bat) và đăng nhập.');
