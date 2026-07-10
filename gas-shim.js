/**
 * GAS-SHIM — Lớp giả lập Google Apps Script cho môi trường Node.js
 * Cho phép file code.js (viết cho Google Apps Script) chạy nguyên bản trên máy chủ nội bộ.
 * Dữ liệu các "sheet" được lưu vào file JSON: data/garage-data.json
 */
'use strict';
const fs = require('fs');
const path = require('path');

// Tắt riêng cảnh báo "SQLite is an experimental feature" cho console sạch
(function () {
  const goc = process.emitWarning;
  process.emitWarning = function (w, ...rest) {
    const msg = typeof w === 'string' ? w : (w && w.message) || '';
    if (/SQLite is an experimental/i.test(msg)) return;
    return goc.call(process, w, ...rest);
  };
})();

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'garage-data.json');
const DB_FILE = path.join(DATA_DIR, 'garage.db');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const TIMEZONE = 'GMT+7'; // Việt Nam
const TZ_OFFSET_MIN = 7 * 60;

// ─────────────────────────────────────────────────────────
//  LƯU / ĐỌC DỮ LIỆU (JSON, giữ nguyên kiểu Date)
// ─────────────────────────────────────────────────────────
function jsonReplacer(key, value) {
  const orig = this[key];
  if (orig instanceof Date) return { __date: orig.toISOString() };
  return value;
}
function jsonReviver(key, value) {
  if (value && typeof value === 'object' && typeof value.__date === 'string') {
    return new Date(value.__date);
  }
  return value;
}

// ─────────────────────────────────────────────────────────
//  RANGE — vùng ô (1-based như Google Sheets)
// ─────────────────────────────────────────────────────────
class Range {
  constructor(sheet, row, col, numRows, numCols) {
    this.sheet = sheet;
    this.row = row; this.col = col;
    this.numRows = numRows || 1; this.numCols = numCols || 1;
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const src = this.sheet._data[this.row - 1 + r] || [];
      const line = [];
      for (let c = 0; c < this.numCols; c++) {
        const v = src[this.col - 1 + c];
        line.push(v === undefined || v === null ? '' : v);
      }
      out.push(line);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(matrix) {
    const oldLen = this.sheet._data.length;
    for (let r = 0; r < this.numRows; r++) {
      const rowIdx = this.row - 1 + r;
      while (this.sheet._data.length <= rowIdx) this.sheet._data.push([]);
      const dst = this.sheet._data[rowIdx];
      const src = (matrix && matrix[r]) || [];
      for (let c = 0; c < this.numCols; c++) {
        const colIdx = this.col - 1 + c;
        while (dst.length <= colIdx) dst.push('');
        dst[colIdx] = src[c] === undefined ? '' : src[c];
      }
    }
    const from = Math.min(this.row - 1, oldLen);
    this.sheet._book._touchRows(this.sheet._name, from, this.row - 1 + this.numRows - 1);
    return this;
  }
  setValue(v) {
    const oldLen = this.sheet._data.length;
    const rowIdx = this.row - 1;
    while (this.sheet._data.length <= rowIdx) this.sheet._data.push([]);
    const dst = this.sheet._data[rowIdx];
    while (dst.length <= this.col - 1) dst.push('');
    dst[this.col - 1] = v === undefined ? '' : v;
    this.sheet._book._touchRows(this.sheet._name, Math.min(rowIdx, oldLen), rowIdx);
    return this;
  }
  // Các hàm định dạng: không cần trên máy chủ, giữ để chuỗi lệnh không lỗi
  setFontWeight() { return this; }
  setBackground() { return this; }
  setNumberFormat() { return this; }
  setFontColor() { return this; }
  setHorizontalAlignment() { return this; }
  clearContent() {
    for (let r = 0; r < this.numRows; r++) {
      const dst = this.sheet._data[this.row - 1 + r];
      if (!dst) continue;
      for (let c = 0; c < this.numCols; c++) {
        if (dst.length > this.col - 1 + c) dst[this.col - 1 + c] = '';
      }
    }
    this.sheet._book._touchRows(this.sheet._name, this.row - 1, this.row - 1 + this.numRows - 1);
    return this;
  }
}

// ─────────────────────────────────────────────────────────
//  SHEET — một bảng dữ liệu
// ─────────────────────────────────────────────────────────
class Sheet {
  constructor(book, name, data) {
    this._book = book;
    this._name = name;
    this._data = data || [];
  }
  getName() { return this._name; }
  getLastRow() { return this._data.length; }
  getLastColumn() {
    let m = 0;
    for (const r of this._data) if (r.length > m) m = r.length;
    return m;
  }
  getMaxRows() { return Math.max(this._data.length, 1000); }
  getMaxColumns() { return Math.max(this.getLastColumn(), 40); }
  getDataRange() {
    return new Range(this, 1, 1, Math.max(this._data.length, 1), Math.max(this.getLastColumn(), 1));
  }
  getRange(row, col, numRows, numCols) {
    return new Range(this, row, col, numRows || 1, numCols || 1);
  }
  appendRow(rowArr) {
    this._data.push((rowArr || []).map(v => (v === undefined ? '' : v)));
    this._book._touchRows(this._name, this._data.length - 1, this._data.length - 1);
    return this;
  }
  deleteRow(rowIdx) { // 1-based
    if (rowIdx >= 1 && rowIdx <= this._data.length) {
      this._data.splice(rowIdx - 1, 1);
      this._book._touch(this._name);
    }
    return this;
  }
  deleteRows(rowIdx, howMany) {
    this._data.splice(rowIdx - 1, howMany || 1);
    this._book._touch(this._name);
    return this;
  }
  clearContents() { this._data = []; this._book._touch(this._name); return this; }
  clear() { return this.clearContents(); }
  hideSheet() { return this; }
  showSheet() { return this; }
  setFrozenRows() { return this; }
  autoResizeColumns() { return this; }
}

// ─────────────────────────────────────────────────────────
//  SPREADSHEET — "file bảng tính" = toàn bộ cơ sở dữ liệu
// ─────────────────────────────────────────────────────────
class Spreadsheet {
  constructor(ownerEmail) {
    this._sheets = new Map();
    this._dirtyFull = new Set();          // bảng cần ghi lại toàn bộ (đổi cấu trúc)
    this._dirtyRows = new Map();          // name -> Set(chỉ số dòng 0-based) chỉ đổi giá trị ô
    this._ownerEmail = ownerEmail;
    this._db = null;
    this._openDb();
    this._load();
  }

  // Đánh dấu cả bảng cần ghi lại (khi thêm/xóa dòng, xóa sạch — đổi cấu trúc)
  _touch(name) { if (name) this._dirtyFull.add(name); }
  // Đánh dấu một khoảng dòng chỉ đổi giá trị (ghi lại đúng các dòng đó — rất nhanh)
  _touchRows(name, from0, to0) {
    if (!name) return;
    if (this._dirtyFull.has(name)) return;  // đã ghi lại toàn bộ thì khỏi cần
    let s = this._dirtyRows.get(name);
    if (!s) { s = new Set(); this._dirtyRows.set(name, s); }
    for (let i = from0; i <= to0; i++) s.add(i);
  }
  _hasDirty() { return this._dirtyFull.size > 0 || this._dirtyRows.size > 0; }
  _clearDirty() { this._dirtyFull.clear(); this._dirtyRows.clear(); }

  _openDb() {
    try {
      const { DatabaseSync } = require('node:sqlite');
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      this._db = new DatabaseSync(DB_FILE);
      // Bền hơn khi mất điện + nhanh hơn
      this._db.exec('PRAGMA journal_mode = WAL;');
      this._db.exec('PRAGMA synchronous = NORMAL;');
      this._db.exec('PRAGMA busy_timeout = 5000;');   // chờ tối đa 5s thay vì báo lỗi khi DB bận
      this._db.exec('PRAGMA cache_size = -16000;');    // ~16MB cache trong RAM
      this._db.exec('PRAGMA wal_autocheckpoint = 400;');
      this._db.exec('CREATE TABLE IF NOT EXISTS rows (sheet TEXT NOT NULL, ord INTEGER NOT NULL, cells TEXT NOT NULL, PRIMARY KEY (sheet, ord));');
      this._db.exec('CREATE INDEX IF NOT EXISTS idx_rows_sheet ON rows(sheet);');
    } catch (e) {
      this._db = null;
      console.error('[DATA] Không mở được SQLite (' + e.message + '). Cần Node.js >= 22.5. Tạm dùng file JSON.');
    }
  }

  _dbHasData() {
    if (!this._db) return false;
    try { return !!this._db.prepare('SELECT 1 FROM rows LIMIT 1').get(); } catch (e) { return false; }
  }

  _load() {
    try {
      // 1) Ưu tiên nạp từ SQLite nếu đã có dữ liệu
      if (this._dbHasData()) {
        const rows = this._db.prepare('SELECT sheet, ord, cells FROM rows ORDER BY sheet, ord').all();
        const bySheet = new Map();
        for (const r of rows) {
          if (!bySheet.has(r.sheet)) bySheet.set(r.sheet, []);
          bySheet.get(r.sheet)[r.ord] = JSON.parse(r.cells, jsonReviver);
        }
        for (const [name, data] of bySheet) {
          // Bù các ô trống nếu ord không liên tục
          for (let i = 0; i < data.length; i++) if (!data[i]) data[i] = [];
          this._sheets.set(name, new Sheet(this, name, data));
        }
        console.log('[DATA] Đã nạp từ SQLite:', DB_FILE, '(' + this._sheets.size + ' bảng)');
        return;
      }
      // 2) Chưa có DB nhưng có file JSON cũ → nạp rồi CHUYỂN sang SQLite (một lần)
      if (fs.existsSync(DATA_FILE)) {
        const obj = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'), jsonReviver);
        for (const name of Object.keys(obj.sheets || {})) {
          this._sheets.set(name, new Sheet(this, name, obj.sheets[name]));
          this._dirtyFull.add(name);
        }
        console.log('[DATA] Chuyển dữ liệu JSON cũ → SQLite (' + this._sheets.size + ' bảng)...');
        this.save(true);
        // Đổi tên file JSON cũ để không nạp lại lần sau
        try { fs.renameSync(DATA_FILE, DATA_FILE + '.migrated'); } catch (e) {}
        return;
      }
      console.log('[DATA] Chưa có dữ liệu — khởi tạo mới.');
    } catch (e) {
      console.error('[DATA] LỖI đọc dữ liệu:', e.message);
      throw e;
    }
  }

  save(force) {
    if (!this._hasDirty() && !force) return;
    // Dự phòng khi không có SQLite: ghi JSON nguyên tử
    if (!this._db) return this._saveJson();
    try {
      const del      = this._db.prepare('DELETE FROM rows WHERE sheet = ?');
      const ins      = this._db.prepare('INSERT INTO rows (sheet, ord, cells) VALUES (?, ?, ?)');
      const upsert   = this._db.prepare('INSERT OR REPLACE INTO rows (sheet, ord, cells) VALUES (?, ?, ?)');
      const delRow   = this._db.prepare('DELETE FROM rows WHERE sheet = ? AND ord = ?');

      const fullNames = force ? Array.from(this._sheets.keys()) : Array.from(this._dirtyFull);
      const fullSet = new Set(fullNames);

      this._db.exec('BEGIN');
      // 1) Ghi lại toàn bộ các bảng đổi cấu trúc (thêm/xóa/xóa sạch dòng)
      for (const name of fullNames) {
        const sh = this._sheets.get(name);
        del.run(name);
        if (sh) for (let i = 0; i < sh._data.length; i++) ins.run(name, i, JSON.stringify(sh._data[i] || [], jsonReplacer));
      }
      // 2) Ghi CHỈ các dòng đã đổi giá trị (không đụng phần còn lại của bảng)
      for (const [name, rowSet] of this._dirtyRows) {
        if (fullSet.has(name)) continue; // đã ghi lại toàn bộ ở trên
        const sh = this._sheets.get(name);
        for (const idx of rowSet) {
          if (sh && idx < sh._data.length) upsert.run(name, idx, JSON.stringify(sh._data[idx] || [], jsonReplacer));
          else delRow.run(name, idx); // dòng không còn (an toàn)
        }
      }
      this._db.exec('COMMIT');
      this._clearDirty();
    } catch (e) {
      try { this._db.exec('ROLLBACK'); } catch (x) {}
      console.error('[DATA] LỖI ghi SQLite:', e.message);
    }
  }

  _saveJson() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      const obj = { savedAt: new Date().toISOString(), sheets: {} };
      for (const [name, sh] of this._sheets) obj.sheets[name] = sh._data;
      const tmp = DATA_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(obj, jsonReplacer));
      fs.renameSync(tmp, DATA_FILE);
      this._clearDirty();
    } catch (e) { console.error('[DATA] LỖI ghi JSON:', e.message); }
  }

  backup() {
    try {
      // Không sao lưu khi chưa có dữ liệu (tránh tạo bản sao lưu rỗng)
      let coData = false;
      for (const sh of this._sheets.values()) { if (sh._data && sh._data.length > 0) { coData = true; break; } }
      if (!coData && this._db) { try { coData = !!this._db.prepare('SELECT 1 FROM rows LIMIT 1').get(); } catch (e) {} }
      if (!coData) return;

      if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
      const now = new Date();
      const stamp = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd_HHmmss') + '_' + ('00' + now.getMilliseconds()).slice(-3);
      if (this._db && fs.existsSync(DB_FILE)) {
        // Đưa hết dữ liệu WAL vào file .db chính trước khi sao lưu → bản sao tự chứa,
        // không phụ thuộc file -wal (quan trọng để phục hồi/copy an toàn).
        this.save(true);
        try { this._db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch (e) {}
        const dest = path.join(BACKUP_DIR, 'garage_' + stamp + '.db');
        // VACUUM INTO tạo bản sao nhất quán; tên có mili giây nên không trùng file đích
        try { this._db.exec("VACUUM INTO '" + dest.replace(/'/g, "''") + "'"); }
        catch (e) { fs.copyFileSync(DB_FILE, dest); } // fallback: giờ .db đã tự chứa nên vẫn đủ dữ liệu
        const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort();
        while (files.length > 60) fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
        console.log('[DATA] Đã sao lưu SQLite vào data/backups/');
      } else if (fs.existsSync(DATA_FILE)) {
        fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, 'garage-data_' + stamp + '.json'));
      }
    } catch (e) { console.error('[DATA] Lỗi sao lưu:', e.message); }
  }

  getSheetByName(name) { return this._sheets.get(name) || null; }
  insertSheet(name) {
    const sh = new Sheet(this, name, []);
    this._sheets.set(name, sh);
    this._touch(name);
    return sh;
  }
  getSheets() { return Array.from(this._sheets.values()); }

  // Checkpoint WAL rồi đóng DB gọn gàng (file .db tự chứa, an toàn để copy)
  close() {
    try {
      if (this._db) {
        this.save(true);
        try { this._db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch (e) {}
        this._db.close();
        this._db = null;
      }
    } catch (e) { console.error('[DATA] Lỗi đóng DB:', e.message); }
  }

  // Danh sách bản sao lưu (.db) — mới nhất trước
  dsSaoLuu() {
    try {
      if (!fs.existsSync(BACKUP_DIR)) return [];
      return fs.readdirSync(BACKUP_DIR)
        .filter(f => f.endsWith('.db'))
        .map(f => {
          const st = fs.statSync(path.join(BACKUP_DIR, f));
          return { ten: f, kichThuoc: st.size, thoiGian: st.mtime.toISOString() };
        })
        .sort((a, b) => a.thoiGian < b.thoiGian ? 1 : -1);
    } catch (e) { return []; }
  }

  // Phục hồi từ 1 bản sao lưu .db: sao lưu hiện tại trước cho an toàn, thay file,
  // rồi mở lại + nạp lại. Node đơn luồng nên thao tác trong 1 lời gọi là an toàn.
  phucHoiTuSaoLuu(tenFile) {
    try {
      const ten = String(tenFile || '').replace(/[\/\\]/g, '');
      if (!/^[\w.\-]+\.db$/.test(ten)) return { success: false, msg: 'Tên bản sao lưu không hợp lệ.' };
      const src = path.join(BACKUP_DIR, ten);
      if (!fs.existsSync(src)) return { success: false, msg: 'Không tìm thấy bản sao lưu: ' + ten };

      // Kiểm tra bản sao lưu có dữ liệu thật không (tránh phục hồi nhầm bản rỗng/hỏng)
      try {
        const { DatabaseSync } = require('node:sqlite');
        const kt = new DatabaseSync(src, { readOnly: true });
        let soDong = 0;
        try { const r = kt.prepare('SELECT COUNT(*) c FROM rows').get(); soDong = (r && r.c) || 0; } catch (e) { soDong = -1; }
        kt.close();
        if (soDong === 0) return { success: false, msg: 'Bản sao lưu này rỗng, không phục hồi để tránh mất dữ liệu.' };
        if (soDong < 0) return { success: false, msg: 'Bản sao lưu không hợp lệ (không đọc được).' };
      } catch (e) { return { success: false, msg: 'Không kiểm tra được bản sao lưu: ' + e.message }; }

      // 1) Sao lưu trạng thái hiện tại (đề phòng phục hồi nhầm)
      this.backup();
      // 2) Đóng DB hiện tại
      if (this._db) { try { this._db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch (e) {} this._db.close(); this._db = null; }
      // 3) Xóa file WAL/SHM cũ rồi ghi đè garage.db bằng bản sao lưu
      for (const suf of ['-wal', '-shm']) { try { fs.unlinkSync(DB_FILE + suf); } catch (e) {} }
      fs.copyFileSync(src, DB_FILE);
      // 4) Mở lại + nạp lại toàn bộ vào bộ nhớ
      this._sheets = new Map();
      this._dirtyFull = new Set(); this._dirtyRows = new Map();
      this._openDb();
      this._load();
      return { success: true, soBang: this._sheets.size };
    } catch (e) {
      return { success: false, msg: e.message };
    }
  }

  getOwner() {
    const email = this._ownerEmail;
    return { getEmail: () => email };
  }
  getName() { return 'Garage Pro (nội bộ)'; }
}

// ─────────────────────────────────────────────────────────
//  CÁC DỊCH VỤ GIẢ LẬP
// ─────────────────────────────────────────────────────────
function pad2(n) { return ('0' + n).slice(-2); }

const Utilities = {
  // Hỗ trợ các mẫu định dạng được dùng trong code.js
  formatDate(date, tz, pattern) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    // Chuyển về múi giờ GMT+7
    const t = new Date(d.getTime() + (TZ_OFFSET_MIN + d.getTimezoneOffset()) * 60000);
    return String(pattern)
      .replace(/yyyy/g, String(t.getFullYear()))
      .replace(/MM/g, pad2(t.getMonth() + 1))
      .replace(/dd/g, pad2(t.getDate()))
      .replace(/HH/g, pad2(t.getHours()))
      .replace(/mm/g, pad2(t.getMinutes()))
      .replace(/ss/g, pad2(t.getSeconds()));
  },
  sleep(ms) { const end = Date.now() + ms; while (Date.now() < end) {} },
  getUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
};

// Cache trong bộ nhớ (có hạn dùng như CacheService thật)
class MemCache {
  constructor() { this._m = new Map(); }
  get(key) {
    const it = this._m.get(key);
    if (!it) return null;
    if (it.exp && Date.now() > it.exp) { this._m.delete(key); return null; }
    return it.v;
  }
  put(key, value, ttlSec) {
    this._m.set(key, { v: String(value), exp: ttlSec ? Date.now() + ttlSec * 1000 : 0 });
  }
  remove(key) { this._m.delete(key); }
  removeAll(keys) { (keys || []).forEach(k => this._m.delete(k)); }
}
const _scriptCache = new MemCache();
const _userCache = new MemCache();
const CacheService = {
  getScriptCache: () => _scriptCache,
  getUserCache: () => _userCache
};

const Logger = { log: (...a) => console.log('[GAS]', ...a) };

// Session: máy chủ nội bộ không có tài khoản Google → trả rỗng.
// Việc xác thực dựa hoàn toàn vào bảng PhanQuyen (email + mã PIN).
const Session = {
  getScriptTimeZone: () => TIMEZONE,
  getActiveUser: () => ({ getEmail: () => '' }),
  getEffectiveUser: () => ({ getEmail: () => '' })
};

// Giao diện Sheets (menu, hộp thoại) — không tồn tại trên máy chủ, chỉ cần không lỗi
const _fakeMenu = { addItem() { return this; }, addSeparator() { return this; }, addToUi() {} };
const _fakeUi = {
  createMenu: () => _fakeMenu,
  alert: (msg) => console.log('[UI]', msg),
  showModalDialog: () => {}
};

const HtmlService = {
  createTemplateFromFile: () => ({
    evaluate: () => ({ setWidth() { return this; }, setHeight() { return this; }, setTitle() { return this; }, setXFrameOptionsMode() { return this; } })
  }),
  createHtmlOutputFromFile: () => ({ setTitle() { return this; } }),
  XFrameOptionsMode: { ALLOWALL: 1 }
};

// LockService: Node chạy đơn luồng, các hàm backend đồng bộ → khóa luôn thành công
const _fakeLock = { tryLock: () => true, waitLock: () => {}, releaseLock: () => {}, hasLock: () => true };
const LockService = {
  getScriptLock: () => _fakeLock,
  getUserLock: () => _fakeLock,
  getDocumentLock: () => _fakeLock
};

// ─────────────────────────────────────────────────────────
//  KHỞI TẠO
// ─────────────────────────────────────────────────────────
function createEnvironment(ownerEmail) {
  const book = new Spreadsheet(ownerEmail);
  const SpreadsheetApp = {
    getActiveSpreadsheet: () => book,
    getActive: () => book,
    flush: () => book.save(),
    getUi: () => _fakeUi
  };
  return { book, SpreadsheetApp, Session, Utilities, CacheService, Logger, HtmlService, LockService };
}

module.exports = { createEnvironment, DATA_FILE, DB_FILE, DATA_DIR };
