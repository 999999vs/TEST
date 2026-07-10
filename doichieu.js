/**
 * doichieu.js — ĐỐI CHIẾU KẾT QUẢ NATIVE vs GAS trên dữ liệu thật
 * Chạy: node doichieu.js
 * Với mỗi hàm: gọi cả native và GAS (cùng dữ liệu, cùng tham số), so sánh sâu.
 * Chỉ khi KHỚP thì hàm mới an toàn để đăng ký vào registry native.
 */
'use strict';
const fs = require('fs');
const { createEnvironment } = require('./gas-shim');

// Nạp dữ liệu thật nếu chưa có
if (!fs.existsSync('./data/garage-data.json')) {
  require('child_process').execSync('node nap-du-lieu.js /mnt/user-data/uploads/Drive.xlsx', { stdio: 'ignore' });
}

// Môi trường cho GAS: cần phiên = chủ file để qua phân quyền → dùng admin thật
const ADMIN = 'picturesamonation@gmail.com';
const env = createEnvironment(ADMIN);
const codeText = fs.readFileSync('./code.js', 'utf8');
const factory = new Function('SpreadsheetApp', 'Session', 'Utilities', 'CacheService', 'Logger', 'HtmlService', 'LockService',
  codeText + '\n;return { api: api };');
const backend = factory(env.SpreadsheetApp, env.Session, env.Utilities, env.CacheService, env.Logger, env.HtmlService, env.LockService);

const lists = require('./native/lists');
const stock = require('./native/stock');

function gas(fn, args) { return backend.api(ADMIN, fn, args || []); }

// So sánh sâu, chuẩn hóa Date -> ISO để so được
function chuan(x) {
  if (x instanceof Date) return '__D:' + x.toISOString();
  if (Array.isArray(x)) return x.map(chuan);
  if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x).sort()) o[k] = chuan(x[k]); return o; }
  return x;
}
function deepEq(a, b) { return JSON.stringify(chuan(a)) === JSON.stringify(chuan(b)); }

const book = env.book;
let pass = 0, fail = 0;
function test(ten, nativeVal, gasVal) {
  const ok = deepEq(nativeVal, gasVal);
  if (ok) { pass++; console.log('  ✓ ' + ten); }
  else {
    fail++;
    console.log('  ✗ ' + ten + '  ← LỆCH');
    const ns = JSON.stringify(chuan(nativeVal)), gs = JSON.stringify(chuan(gasVal));
    console.log('     native:', ns.slice(0, 200));
    console.log('     gas   :', gs.slice(0, 200));
    // tìm điểm lệch đầu tiên
    for (let i = 0; i < Math.max(ns.length, gs.length); i++) {
      if (ns[i] !== gs[i]) { console.log('     lệch tại vị trí', i, ':', JSON.stringify(ns.slice(i, i + 60)), 'vs', JSON.stringify(gs.slice(i, i + 60))); break; }
    }
  }
}

console.log('ĐỐI CHIẾU NATIVE vs GAS:');
test('getDanhSachKhachHang', lists.getDanhSachKhachHang(book), gas('getDanhSachKhachHang'));
test('getNccList', lists.getNccList(book), gas('getNccList'));
test('getNhanVienList', lists.getNhanVienList(book), gas('getNhanVienList'));
test('getPhanQuyenList', lists.getPhanQuyenList(book), gas('getPhanQuyenList'));
test('getInventoryData', lists.getInventoryData(book), gas('getInventoryData'));
test('getLowStockList', lists.getLowStockList(book), gas('getLowStockList'));
test('getSystemLogs', lists.getSystemLogs(book), gas('getSystemLogs'));
test('getInventoryLogs', lists.getInventoryLogs(book), gas('getInventoryLogs'));
test('getInventoryMargin', lists.getInventoryMargin(book), gas('getInventoryMargin'));
test('getTopSpareParts(6,2026,10)', lists.getTopSpareParts(book, 6, 2026, 10), gas('getTopSpareParts', [6, 2026, 10]));
test('getStockExportOverview', stock.getStockExportOverview(book, '2025-07-01', '2026-07-31'), gas('getStockExportOverview', ['2025-07-01', '2026-07-31']));
test('getStockPartDetail', stock.getStockPartDetail(book, 'SAC0700198', '2025-07-01', '2026-07-31'), gas('getStockPartDetail', ['SAC0700198', '2025-07-01', '2026-07-31']));

console.log('\n=== ' + pass + ' KHỚP / ' + fail + ' LỆCH ===');
process.exit(fail ? 1 : 0);
