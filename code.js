/**
 * HỆ THỐNG GARAGE PRO - V8.1 (FIXED VERSION)
 * Đã loại bỏ tất cả hàm trùng lặp, sửa lỗi cú pháp
 */

// Chuẩn hóa SĐT: bỏ dấu nháy đầu, thêm lại số 0 nếu bị Sheets cắt mất
function chuanSDT(v) {
  var s = String(v == null ? '' : v).trim();
  if (s.charAt(0) === "'") s = s.substring(1);
  // SĐT di động VN 10 số nhưng Sheets lưu number làm mất 0 đầu → còn 9 số
  if (/^\d{9}$/.test(s)) s = '0' + s;
  return s;
}

// =====================================================================
//  MODULE PHÂN QUYỀN (BACKEND) — dễ mở rộng
//  Cách thêm vai trò mới: thêm 1 dòng vào VAITRO_CHUAN + 1 dòng vào MA_TRAN_QUYEN.
//  Cách thêm quyền mới: thêm 1 "khóa quyền" (vd 'kho.duyetXuat') vào MA_TRAN_QUYEN
//  rồi gọi capQuyen_('kho.duyetXuat') ở đầu hàm tương ứng.
// =====================================================================

// Khi không tìm thấy email trong sheet PhanQuyen thì gán vai trò này.
// 'Khách' = không có quyền nào (an toàn). Chủ sở hữu file luôn được coi là Admin
// (xem vaiTroHienTai_) nên bạn không bao giờ tự khóa mình ra ngoài.
var VAITRO_MAC_DINH = 'Khách';

// Chuẩn hóa tên vai trò (nhận cả biến thể có/không dấu) về khóa chuẩn.
function chuanVaiTro_(raw) {
  var r = String(raw || '').trim().toLowerCase();
  if (r === 'admin' || r === 'quản trị' || r === 'quan tri' || r === 'administrator') return 'admin';
  if (r === 'quản lý' || r === 'quan ly' || r === 'manager' || r === 'ql')           return 'quanly';
  if (r === 'thủ kho' || r === 'thu kho' || r === 'kho' || r === 'warehouse')         return 'thukho';
  if (r === 'cố vấn' || r === 'co van' || r === 'covan' || r === 'cố vấn dịch vụ' || r === 'advisor' || r === 'cvdv') return 'covan';
  if (!r) return chuanVaiTro_(VAITRO_MAC_DINH);
  return r; // vai trò lạ giữ nguyên (mặc định sẽ không có quyền nào)
}

// Ma trận quyền: khóaQuyền -> danh sách vai trò (đã chuẩn hóa) được phép.
// '*' nghĩa là mọi vai trò đã đăng nhập đều được.
var MA_TRAN_QUYEN = {
  // Lệnh sửa chữa
  'lenh.xem':        ['admin', 'quanly', 'covan'],
  'lenh.luu':        ['admin', 'quanly', 'covan'],
  'lenh.xoa':        ['admin'],            // chỉ Admin được xóa lệnh
  'lenh.traVe':      ['admin', 'quanly', 'covan'],
  'lenh.suaGiamGia': ['admin', 'quanly', 'covan'],
  'lenh.khoiPhuc':   ['admin'],            // khôi phục lệnh đã xóa: chỉ Admin
  // Kho & vật tư
  'kho.xemTonKho':   ['admin', 'quanly', 'thukho', 'covan'], // cố vấn chỉ XEM tồn kho
  'kho.luuVatTu':    ['admin', 'quanly', 'thukho'],
  'kho.suaVatTu':    ['admin', 'quanly', 'thukho'],
  'kho.xoaVatTu':    ['admin', 'quanly', 'thukho'],
  'kho.nhap':        ['admin', 'quanly', 'thukho'],
  'kho.banLe':       ['admin', 'quanly', 'thukho'],
  'kho.duyetXuat':   ['admin', 'quanly', 'thukho'],
  'kho.thuHoi':      ['admin', 'quanly', 'thukho'],
  'kho.xoaPhieu':    ['admin', 'quanly', 'thukho'],
  'kho.xoaLichSu':   ['admin', 'quanly'],
  // Khách hàng
  'khach.xem':       ['admin', 'quanly', 'covan'],
  'khach.luu':       ['admin', 'quanly'],
  'khach.xoa':       ['admin', 'quanly'],
  // Hệ thống
  'heThong.log':     ['admin'],
  'heThong.congCu':  ['admin']             // công cụ quản lý: chỉ Admin
};

// Lấy email người dùng hiện tại (an toàn).
function emailHienTai_() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; }
}

// =====================================================================
//  PHIÊN ĐĂNG NHẬP (Đường 2 — dùng cho Gmail thường, Execute as: Me)
//  Chủ file tự đăng nhập (qua getEffectiveUser). Người khác nhập email + PIN.
// =====================================================================
var _phienEmail = null; // email người dùng của phiên hiện tại (do frontend gửi lên)

// Email chủ sở hữu / người chạy script (Execute as: Me → luôn là chủ file)
function emailChuFile_() {
  var e = '';
  try { e = (Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (x) {}
  if (e) return e;
  try { e = (Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (x) {}
  return e;
}

// Đặt phiên cho lần gọi hiện tại (frontend truyền token = email đã đăng nhập)
function datPhien_(token) {
  _phienEmail = token ? String(token).trim().toLowerCase() : null;
  _cacheVaiTro = null; // reset cache vai trò khi đổi phiên
}

// Email người dùng hiện tại: ưu tiên phiên đăng nhập; nếu trống thử chủ file.
function emailHienTai_() {
  if (_phienEmail) return _phienEmail;
  // Không có phiên → thử nhận diện chủ file (tự đăng nhập)
  var chu = emailChuFile_();
  if (chu) return chu;
  try { return (Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) { return ''; }
}

// ─── WRAPPER API: nhận token phiên rồi gọi hàm thật ───
// Frontend gọi mọi thứ qua api(token, tenHam, mangThamSo) để backend biết ai đang gọi.
function api(token, tenHam, mangThamSo) {
  datPhien_(token);
  var args = mangThamSo || [];
  if (!/^[A-Za-z0-9_]+$/.test(tenHam)) throw new Error('Tên hàm không hợp lệ.');
  // Chặn gọi đệ quy chính nó và các hàm nội bộ (kết thúc bằng _)
  if (tenHam === 'api' || tenHam === 'datPhien_' || /_$/.test(tenHam)) {
    throw new Error('Không được phép gọi hàm này.');
  }
  var fn;
  try { fn = eval(tenHam); } catch (e) { throw new Error('Hàm không tồn tại: ' + tenHam); }
  if (typeof fn !== 'function') throw new Error('Hàm không tồn tại: ' + tenHam);
  return fn.apply(null, args);
}

// ─── ĐĂNG NHẬP ───
// Trả về thông tin phiên nếu hợp lệ. Chủ file không cần PIN.
function dangNhap(email, pin) {
  try {
    var e = String(email || '').trim().toLowerCase();
    var p = String(pin || '').trim();
    if (!e) return { success: false, msg: 'Vui lòng nhập email.' };

    var laChu = (e === emailChuFile_());
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('PhanQuyen');

    // Tìm người dùng trong bảng phân quyền
    var found = null;
    if (sh) {
      var vals = sh.getDataRange().getValues();
      for (var i = 1; i < vals.length; i++) {
        if (String(vals[i][0]).trim().toLowerCase() === e) { found = vals[i]; break; }
      }
    }

    if (found) {
      var tt = String(found[3] || '').trim().toLowerCase();
      // Chủ file không bao giờ bị khóa (lưới an toàn); người khác thì kiểm tra khóa
      if (!laChu && (tt === 'khóa' || tt === 'khoa' || tt === 'locked' || tt === 'disabled')) {
        return { success: false, msg: 'Tài khoản đã bị khóa. Liên hệ quản trị viên.' };
      }
      var maRieng = String(found[4] || '').trim().replace(/^'/, '');
      if (!maRieng) {
        // Chưa cấp mã: chủ file dùng mã dự phòng; người khác phải chờ admin cấp
        if (laChu) {
          if (p !== String(DELETE_SECRET_CODE)) return { success: false, msg: 'Bạn chưa đặt mã đăng nhập. Hãy nhập mã dự phòng của hệ thống.' };
        } else {
          return { success: false, msg: 'Tài khoản chưa được cấp mã đăng nhập. Liên hệ quản trị viên.' };
        }
      } else if (p !== maRieng) {
        return { success: false, msg: 'Mã đăng nhập không đúng.' };
      }
      datPhien_(e);
      var role = laChu ? 'admin' : chuanVaiTro_(String(found[2]).trim() || VAITRO_MAC_DINH);
      ghiLog('Đăng nhập', 'Đăng nhập thành công', e);
      return { success: true, currentUser: { email: e, name: String(found[1] || (laChu ? 'Chủ sở hữu' : e)), role: role, laChuFile: laChu } };
    }

    // Không có trong bảng: chỉ chủ file được vào (lối thoát hiểm, dùng mã dự phòng)
    if (laChu) {
      if (p !== String(DELETE_SECRET_CODE)) {
        return { success: false, msg: 'Bạn chưa có trong bảng phân quyền. Hãy nhập mã dự phòng của hệ thống để vào và tự cấp quyền.' };
      }
      datPhien_(e);
      ghiLog('Đăng nhập', 'Chủ file đăng nhập (mã dự phòng)', e);
      return { success: true, currentUser: { email: e, name: 'Chủ sở hữu', role: 'admin', laChuFile: true } };
    }

    return { success: false, msg: 'Email không có trong danh sách được cấp quyền.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

// Kiểm tra nhanh: phiên này có phải chủ file không (để frontend tự đăng nhập)
function kiemTraChuFile() {
  var effEmail = '';
  var actEmail = '';
  try { effEmail = (Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (e) {}
  try { actEmail = (Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) {}

  // Chủ file = effective user (khi Execute as: Me). Nếu effective trống, thử active.
  var chu = effEmail || actEmail;
  if (chu) {
    // Xác nhận đây đúng là chủ sở hữu spreadsheet (nếu lấy được owner)
    var owner = '';
    try { var o = SpreadsheetApp.getActiveSpreadsheet().getOwner(); owner = o ? (o.getEmail()||'').toLowerCase() : ''; } catch (e) {}
    if (!owner || owner === chu) {
      return { laChuFile: true, email: chu, name: 'Chủ sở hữu', role: 'admin' };
    }
  }
  // Không xác định được chủ file → yêu cầu đăng nhập thủ công
  return { laChuFile: false, effEmail: effEmail, actEmail: actEmail };
}

// Chẩn đoán nhận diện tài khoản: so email Google thấy với bảng PhanQuyen.
// Giúp tìm lỗi "đã thêm vào PhanQuyen nhưng vẫn bị Khách".
function chanDoanTaiKhoan() {
  var emailGoogle = emailHienTai_();
  var kq = {
    emailGoogle: emailGoogle,
    coTrongBang: false,
    vaiTroTimThay: '',
    vaiTroApDung: '',
    laChuFile: false,
    danhSachEmail: [],   // email trong bảng (để admin đối chiếu)
    ganGiong: ''         // email gần giống nhất nếu không khớp
  };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    try {
      var owner = ss.getOwner();
      if (owner && emailGoogle && owner.getEmail().toLowerCase() === emailGoogle.toLowerCase()) kq.laChuFile = true;
    } catch (e) {}

    var sh = ss.getSheetByName('PhanQuyen');
    if (sh) {
      var vals = sh.getDataRange().getValues();
      var target = emailGoogle.toLowerCase().trim();
      for (var i = 1; i < vals.length; i++) {
        var emailBang = String(vals[i][0] || '');
        var emailSach = emailBang.toLowerCase().trim();
        if (!emailSach) continue;
        kq.danhSachEmail.push(emailBang); // giữ nguyên gốc để admin thấy khoảng trắng/khác biệt
        if (emailSach === target) {
          kq.coTrongBang = true;
          kq.vaiTroTimThay = String(vals[i][2] || '');
        }
        // Tìm email gần giống (cùng phần trước @ hoặc chỉ khác khoảng trắng)
        if (!kq.coTrongBang && target && emailSach.replace(/\s/g, '') === target.replace(/\s/g, '')) {
          kq.ganGiong = emailBang;
        }
      }
    }
  } catch (e) {}
  kq.vaiTroApDung = vaiTroHienTai_();
  return kq;
}

// Lấy vai trò (đã chuẩn hóa) của người dùng hiện tại, có cache trong 1 lần thực thi.
var _cacheVaiTro = null;
function vaiTroHienTai_() {
  if (_cacheVaiTro !== null) return _cacheVaiTro;
  var email = emailHienTai_();
  var role = VAITRO_MAC_DINH;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    // Lưới an toàn: chủ sở hữu file luôn là Admin
    var chu = emailChuFile_();
    if (email && chu && email.toLowerCase() === chu) {
      _cacheVaiTro = 'admin';
      return _cacheVaiTro;
    }
    var sh = ss.getSheetByName('PhanQuyen');
    if (sh && email) {
      var vals = sh.getDataRange().getValues();
      for (var i = 1; i < vals.length; i++) {
        if (String(vals[i][0]).trim().toLowerCase() === email.toLowerCase()) {
          var tt = String(vals[i][3] || '').trim().toLowerCase();
          if (tt === 'khóa' || tt === 'khoa' || tt === 'locked' || tt === 'disabled') {
            _cacheVaiTro = 'khách';
            return _cacheVaiTro;
          }
          role = String(vals[i][2]).trim() || VAITRO_MAC_DINH;
          break;
        }
      }
    }
  } catch (e) {}
  _cacheVaiTro = chuanVaiTro_(role);
  return _cacheVaiTro;
}

// Bản đồ khu vực quyền tùy chỉnh (giữ đồng bộ với native/auth.js)
var KHOA_KHU_VUC_ = {
  'lenh.xem': 'lenh', 'lenh.luu': 'lenh', 'lenh.traVe': 'lenh', 'lenh.suaGiamGia': 'lenh',
  'lenh.xoa': 'lenh_xoa', 'lenh.khoiPhuc': 'lenh_xoa',
  'kho.xemTonKho': 'kho', 'kho.luuVatTu': 'kho', 'kho.suaVatTu': 'kho', 'kho.xoaVatTu': 'kho',
  'kho.nhap': 'kho', 'kho.banLe': 'kho', 'kho.duyetXuat': 'kho', 'kho.thuHoi': 'kho', 'kho.xoaPhieu': 'kho',
  'kho.xoaLichSu': 'kho_xoaLS',
  'khach.xem': 'khach', 'khach.luu': 'khach', 'khach.xoa': 'khach',
  'congviec.xem': 'congviec', 'congviec.luu': 'congviec', 'congviec.xoa': 'congviec',
  'baocao.phanTich': 'baocao',
  'tinNhan.dung': 'tinnhan', 'tinNhan.giamSat': 'tinnhan',
  'heThong.log': 'hethong', 'heThong.congCu': 'hethong'
};
// Đọc danh sách khu vực tùy chỉnh của email hiện tại; null nếu chưa tùy chỉnh.
function khuVucTuyChinh_(email) {
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('QuyenTruyCap');
    if (!sh) return null;
    var vals = sh.getDataRange().getValues();
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][0]).trim().toLowerCase() === String(email).toLowerCase()) {
        var raw = String(vals[i][1] || '').trim();
        return raw ? raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];
      }
    }
  } catch (e) {}
  return null;
}

// Kiểm tra người dùng hiện tại có 1 quyền cụ thể không (tôn trọng quyền tùy chỉnh).
function coQuyen_(khoaQuyen) {
  var role = vaiTroHienTai_();
  if (role === 'admin') {                       // admin luôn đủ quyền
    var dsA = MA_TRAN_QUYEN[khoaQuyen];
    return !!dsA && (dsA.indexOf('*') >= 0 || dsA.indexOf('admin') >= 0);
  }
  var tc = khuVucTuyChinh_(emailHienTai_());
  if (tc !== null) {                            // CÓ tùy chỉnh → theo khu vực được cấp
    var kv = KHOA_KHU_VUC_[khoaQuyen];
    if (!kv) {                                  // khóa không thuộc khu vực → theo vai trò
      var dsB = MA_TRAN_QUYEN[khoaQuyen];
      return !!dsB && (dsB.indexOf('*') >= 0 || dsB.indexOf(role) >= 0);
    }
    return tc.indexOf(kv) >= 0;
  }
  // CHƯA tùy chỉnh → y như cũ (theo vai trò)
  var ds = MA_TRAN_QUYEN[khoaQuyen];
  if (!ds) return false;
  if (ds.indexOf('*') >= 0) return true;
  return ds.indexOf(role) >= 0;
}

// Bảo vệ đầu hàm: trả về object lỗi nếu thiếu quyền, null nếu được phép.
// Dùng: var chan = capQuyen_('lenh.xoa'); if (chan) return chan;
function capQuyen_(khoaQuyen) {
  if (coQuyen_(khoaQuyen)) return null;
  return { success: false, msg: 'Bạn không có quyền thực hiện thao tác này (' + khoaQuyen + ').' };
}

// =====================================================================
//  CACHE DANH MỤC (tăng tốc tải) — tự xóa khi dữ liệu thay đổi
// =====================================================================
var CACHE_TTL = 300; // 5 phút

// Lấy dữ liệu từ cache, nếu không có thì gọi fnTinh() rồi lưu cache.
function layCache_(key, fnTinh) {
  try {
    var cache = CacheService.getScriptCache();
    var raw = cache.get(key);
    if (raw) return JSON.parse(raw);
    var val = fnTinh();
    try { cache.put(key, JSON.stringify(val), CACHE_TTL); } catch (e) {}
    return val;
  } catch (e) {
    return fnTinh(); // cache lỗi thì tính trực tiếp
  }
}

// Xóa cache danh mục khi có thay đổi (gọi sau khi lưu/sửa/xóa danh mục).
function xoaCacheDanhMuc_() {
  try {
    CacheService.getScriptCache().removeAll(['dm_congViec', 'dm_vatTu', 'dm_ncc', 'dm_nhanVien']);
  } catch (e) {}
}

// Đọc danh mục công việc (có cache)
function _docDanhMucCongViec() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('DanhMucCongViec');
  var out = [];
  if (sh) {
    var v = sh.getDataRange().getValues();
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][0]).trim()) out.push({ maCV: String(v[i][0]).trim(), moTa: String(v[i][1]||''), donGia: Number(v[i][2]||0) });
    }
  }
  return out;
}

// Đọc danh mục vật tư (có cache)
function _docDanhMucVatTu() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('DanhMucVatTu');
  var out = [];
  if (sh) {
    var v = sh.getDataRange().getValues();
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][0]).trim()) out.push({
        maVT: String(v[i][0]).trim(), tenVT: String(v[i][1]||''), donVi: String(v[i][2]||''),
        donGia: Number(v[i][3]||0), tonKho: Number(v[i][4]||0), tonMin: Number(v[i][5]||0), ncc: String(v[i][6]||'')
      });
    }
  }
  return out;
}

// ============ MENU & UI ============
function onOpen() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var email = '';
    try { email = Session.getActiveUser().getEmail() || ''; } catch (e) {}
    var owner = '';
    try { var o = ss.getOwner(); owner = o ? o.getEmail() : ''; } catch (e) {}
    // Chỉ chủ sở hữu file mới thấy menu công cụ (ẩn với người khác nếu file được chia sẻ)
    if (email && owner && email.toLowerCase() === owner.toLowerCase()) {
      SpreadsheetApp.getUi()
        .createMenu('🛠️ Quản Lý Garage')
        .addItem('Mở Hệ Thống', 'showRepairOrderForm')
        .addSeparator()
        .addItem('⚙️ Chuẩn Hóa Cấu Trúc', 'chuanHoaHeThong')
        .addToUi();
    } else {
      // Người khác: chỉ có lối mở hệ thống, không có công cụ chỉnh cấu trúc
      SpreadsheetApp.getUi()
        .createMenu('Garage Pro')
        .addItem('Mở Hệ Thống', 'showRepairOrderForm')
        .addToUi();
    }
  } catch (e) {
    // fallback an toàn
    SpreadsheetApp.getUi().createMenu('Garage Pro').addItem('Mở Hệ Thống', 'showRepairOrderForm').addToUi();
  }
}

function showRepairOrderForm() {
  var html = HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setWidth(1400)
    .setHeight(900)
    .setTitle('Garage Pro V8.1');
  SpreadsheetApp.getUi().showModalDialog(html, 'Hệ Thống Garage Pro');
}

function doGet(e) {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Garage Pro');
}

function chuanHoaHeThong() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = {
    'PhanQuyen': ['Email', 'Họ Tên', 'Phân Quyền', 'Trạng Thái', 'Mã Bảo Mật'],
    'LenhSuaChua': ['Mã Lệnh','Ngày Tiếp Nhận','Ngày Dự Kiến Xong','Biển Số Xe','Loại Xe','Hãng Xe','Năm SX','Số Km','Tên Khách Hàng','SĐT','Triệu Chứng','Kỹ Thuật Viên','Trạng Thái','Tổng Tiền Công','Tổng Tiền VT','Tổng Tạm Tính','Ghi Chú','Model Xe','Địa Chỉ KH','Số VIN','Thời Gian Cập Nhật','Giờ Tiếp Nhận','Giờ Dự Kiến','Số Km Trước','CCCD','Cố Vấn DV','Trạng Thái Xuất Kho','Giảm Giá Công','DP3','DP4','Giảm Giá VT','Tổng VAT','Tổng Giảm Giá','TỔNG CỘNG THANH TOÁN','Kiểu GG VAT','Số Máy','Mã Số Thuế','Ghi Chú KH','Nhật Ký'],
    'ChiTietCongViec': ['Mã Lệnh','STT','Mã CV','Mô Tả','Thời Gian','Đơn Giá','Thành Tiền','KTV','Trạng Thái','VAT','Giá Trị GG','Loại GG'],
    'VatTu': ['Mã Lệnh','STT','Mã VT','Tên VT','ĐVT','SL','Đơn Giá','Thành Tiền','Trạng Thái Xuất','NCC','VAT','Giá Trị GG','Loại GG'],
    'LichSuSuaChua': ['Mã Lệnh','Ngày Nhận','Ngày Hoàn Thành','Biển Số','Tên KH','SĐT','Tổng TT','Nội Dung'],
    'DanhSachKhachHang': ['SĐT','Tên KH','CCCD','Địa Chỉ','Nhật Ký'],
    'DanhSachXe': ['Biển Số','VIN','Hãng Xe','Model','Loại Xe','Năm SX','Số Km Cuối','Số Máy','Màu Sắc'],
    'DanhSachNCC': ['Tên NCC','SĐT','Địa Chỉ','Ghi Chú'],
    'DanhSachNhanVien': ['Mã NV','Họ Tên','Chức Danh','SĐT','Trạng Thái'],
    'DanhMucCongViec': ['Mã CV','Mô Tả','Đơn Giá'],
    'DanhMucVatTu': ['Mã VT','Tên VT','ĐVT','Đơn Giá Xuất','Tồn Kho','Tồn Min','NCC'],
    'LichSuKho': ['Thời Gian','Loại Phiếu','Mã Tham Chiếu','Mã VT','Tên VT','SL','Đơn Giá','NCC','Người TH','Ghi Chú','VAT'],
    'DonBanLe': ['Mã Đơn','Ngày Lập','Giờ Lập','Tên KH','SĐT','Trạng Thái','Tổng Tiền','Ghi Chú','CCCD','Địa Chỉ'],
    'ChiTietDonBanLe': ['Mã Đơn','STT','Mã VT','Tên PT','ĐVT','SL','Đơn Giá Xuất','VAT','Thành Tiền','Giảm Giá','Loại GG'],
    'PhieuNhapKho': ['Mã Phiếu','Ngày Lập','Giờ Lập','NCC','SĐT','Trạng Thái','Tổng Tiền','Ghi Chú','Người Lập'],
    'ChiTietPhieuNhap': ['Mã Phiếu','STT','Mã VT','Tên PT','ĐVT','SL','Giá Nhập','VAT','Giá Xuất','Thành Tiền']
  };
  for (var name in sheets) {
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, sheets[name].length).setValues([sheets[name]]).setFontWeight('bold').setBackground('#cfe2f3');
  }
  SpreadsheetApp.getUi().alert('✅ Đã chuẩn hóa 16 bảng!');
}

// ============ TIỆN ÍCH NGÀY GIỜ ============
function safeParseDateString(val, formatType) {
  if (val == null || String(val).trim() === '') return '';
  try {
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return '';
      return Utilities.formatDate(val, Session.getScriptTimeZone(), formatType === 'datetime' ? 'dd/MM/yyyy HH:mm' : 'yyyy-MM-dd');
    }
    var str = String(val).trim();
    if (str.indexOf('T') > 0) {
      var d = new Date(str);
      if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), formatType === 'datetime' ? 'dd/MM/yyyy HH:mm' : 'yyyy-MM-dd');
    }
    if (formatType === 'dateInput' && str.indexOf('/') > 0) {
      var parts = str.split('/');
      if (parts.length === 3) return parts[2] + '-' + parts[1] + '-' + parts[0];
    }
    return str;
  } catch(e) { return String(val); }
}

function formatSheetTime(val) {
  if (!val) return '';
  if (val instanceof Date) return Utilities.formatDate(val, Session.getScriptTimeZone(), 'HH:mm');
  var num = parseFloat(val);
  if (!isNaN(num) && num >= 0 && num < 1) {
    var totalMins = Math.round(num * 24 * 60);
    return ('0' + Math.floor(totalMins/60)).slice(-2) + ':' + ('0' + (totalMins%60)).slice(-2);
  }
  return String(val).replace(/'/g, '').trim();
}

// ============ KHỞI TẠO DỮ LIỆU ============
// Trả về vai trò & tên hiện tại (nhẹ) — dùng để frontend poll cập nhật phân quyền realtime
function getCurrentUserRole() {
  var email = emailHienTai_();
  var name = email || 'Người dùng';
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PhanQuyen');
    if (sh && email) {
      var vals = sh.getDataRange().getValues();
      for (var i = 1; i < vals.length; i++) {
        if (String(vals[i][0]).trim().toLowerCase() === email.toLowerCase()) {
          name = String(vals[i][1]) || email; break;
        }
      }
    }
  } catch (e) {}
  return { email: email, name: name, role: vaiTroHienTai_() };
}

function getInitialData() {
  try {
    var data = {
      danhMucCongViec: [],
      danhMucVatTu: [],
      danhSachCoVan: [],
      danhSachKTV: [],
      currentUser: { email: 'Guest', name: 'Khách', role: 'Khách' },
      badges: { orders: 0, stockDrafts: 0, retail: 0, importDrafts: 0 }
    };
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var userEmail = emailHienTai_(); // lấy từ phiên đăng nhập (đã set qua api)
    var laChu = (userEmail && userEmail === emailChuFile_());

    // Phân quyền (dùng module thống nhất, có lưới an toàn chủ sở hữu)
    var shPQ = ss.getSheetByName('PhanQuyen');
    var userName = '';
    if (shPQ && userEmail) {
      var pqVals = shPQ.getDataRange().getValues();
      for (var i = 1; i < pqVals.length; i++) {
        if (String(pqVals[i][0]).trim().toLowerCase() === userEmail.toLowerCase()) {
          userName = String(pqVals[i][1]) || userEmail;
          break;
        }
      }
    }
    var userRole = vaiTroHienTai_(); // 'admin' | 'quanly' | 'thukho' | 'khách'...
    if (!userName) userName = laChu ? 'Chủ sở hữu' : (userEmail || 'Người dùng');
    data.currentUser = { email: userEmail, name: userName, role: userRole, laChuFile: laChu };
    
    // Nhân viên
    data.nhanVien = {}; // tên -> { sdt, chucDanh }
    var shNV = ss.getSheetByName('DanhSachNhanVien');
    if (shNV) {
      var nvVals = shNV.getDataRange().getValues();
      for (var i = 1; i < nvVals.length; i++) {
        var ten = String(nvVals[i][1]).trim();
        var cd = String(nvVals[i][2]).trim().toLowerCase();
        var sdtNV = String(nvVals[i][3] || '').trim();
        var tt = String(nvVals[i][4] || '').trim().toLowerCase();
        if (ten && tt !== 'nghỉ việc') {
          if (cd.indexOf('cố vấn') >= 0 || cd.indexOf('cv') >= 0) data.danhSachCoVan.push(ten);
          if (cd.indexOf('kỹ thuật') >= 0 || cd.indexOf('ktv') >= 0 || cd.indexOf('thợ') >= 0) data.danhSachKTV.push(ten);
          data.nhanVien[ten] = { sdt: sdtNV, chucDanh: String(nvVals[i][2]).trim() };
        }
      }
    }
    
    // Badges (đọc LenhSuaChua 1 lần, tính cả orders lẫn stockDrafts)
    var shLSC = ss.getSheetByName('LenhSuaChua');
    if (shLSC) {
      var v = shLSC.getDataRange().getValues();
      for (var i = 1; i < v.length; i++) {
        var st = String(v[i][12]).trim();
        if (st === 'Đang Tiếp Nhận' || st === 'Đang Sửa Chữa') data.badges.orders++;
        // Lệnh chờ xuất kho: đang sửa chữa nhưng vật tư chưa xuất
        if (st === 'Đang Sửa Chữa' && String(v[i][26] || 'Chưa Xuất').trim() !== 'Đã Xuất') data.badges.stockDrafts++;
      }
    }
    var shDBL = ss.getSheetByName('DonBanLe');
    if (shDBL) {
      var v = shDBL.getDataRange().getValues();
      for (var i = 1; i < v.length; i++) if (String(v[i][5]).trim() === 'Chờ Xuất Kho') data.badges.retail++;
    }
    var shPN = ss.getSheetByName('PhieuNhapKho');
    if (shPN) {
      var v = shPN.getDataRange().getValues();
      for (var i = 1; i < v.length; i++) if (String(v[i][5]).trim() === 'Chờ Nhập Kho') data.badges.importDrafts++;
    }

    // Danh mục (dùng cache 5 phút để tăng tốc)
    data.danhMucCongViec = layCache_('dm_congViec', _docDanhMucCongViec);
    data.danhMucVatTu    = layCache_('dm_vatTu', _docDanhMucVatTu);

    return JSON.parse(JSON.stringify(data));
  } catch(e) {
    Logger.log('getInitialData error: ' + e.message);
    return {
      danhMucCongViec: [], danhMucVatTu: [], danhSachCoVan: [], danhSachKTV: [],
      currentUser: { email: 'admin', name: 'Admin', role: 'Admin' },
      badges: { orders: 0, stockDrafts: 0, retail: 0, importDrafts: 0 }
    };
  }
}

// ============ DASHBOARD ============
function getDashboardData() {
  var dash = { todayRevenue: 0, monthRevenue: 0, pendingOrders: 0, repairingOrders: 0, completedOrders: 0, lowStockCount: 0, totalStockValue: 0, revenue6Months: { labels: [], data: [] } };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet(), now = new Date();
    var todayStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var currentMonth = now.getMonth() + 1, currentYear = now.getFullYear();

    // Khởi tạo 6 tháng gần nhất (gồm tháng hiện tại)
    var months = []; // [{key:'2026-06', label:'T6/26', total:0}, ...]
    for (var k = 5; k >= 0; k--) {
      var dM = new Date(currentYear, currentMonth - 1 - k, 1);
      var mm = dM.getMonth() + 1, yy = dM.getFullYear();
      months.push({ key: yy + '-' + (mm < 10 ? '0' + mm : mm), label: 'T' + mm + '/' + String(yy).slice(2), total: 0 });
    }
    var monthIndex = {};
    for (var k = 0; k < months.length; k++) monthIndex[months[k].key] = k;

    var shLSC = ss.getSheetByName('LenhSuaChua');
    if (shLSC) {
      var vals = shLSC.getDataRange().getValues();
      for (var i = 1; i < vals.length; i++) {
        if (!vals[i][0]) continue;
        var ngayTN = safeParseDateString(vals[i][1], 'dateInput');
        var status = String(vals[i][12]).trim();
        var total = Number(vals[i][33] || 0);
        if (status === 'Đang Tiếp Nhận') dash.pendingOrders++;
        else if (status === 'Đang Sửa Chữa') dash.repairingOrders++;
        else if (status === 'Hoàn Thành') {
          dash.completedOrders++;
          if (ngayTN === todayStr) dash.todayRevenue += total;
          if (ngayTN) {
            var p = ngayTN.split('-');
            if (p.length === 3) {
              if (parseInt(p[0]) === currentYear && parseInt(p[1]) === currentMonth) dash.monthRevenue += total;
              // Cộng vào biểu đồ 6 tháng
              var mKey = p[0] + '-' + p[1];
              if (monthIndex[mKey] !== undefined) months[monthIndex[mKey]].total += total;
            }
          }
        }
      }
    }

    // Đổ dữ liệu biểu đồ 6 tháng
    for (var k = 0; k < months.length; k++) {
      dash.revenue6Months.labels.push(months[k].label);
      dash.revenue6Months.data.push(months[k].total);
    }

    var shVT = ss.getSheetByName('DanhMucVatTu');
    if (shVT) {
      var vals = shVT.getDataRange().getValues();
      for (var i = 1; i < vals.length; i++) {
        if (!vals[i][0]) continue;
        dash.totalStockValue += Number(vals[i][4]||0) * Number(vals[i][3]||0);
        if (Number(vals[i][4]||0) <= Number(vals[i][5]||0)) dash.lowStockCount++;
      }
    }
  } catch(e) { Logger.log('Dashboard error: ' + e.message); }
  return dash;
}

// ============ TRA CỨU ============
function lookupHistoryCustomer(keyword) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DanhSachKhachHang');
  if (!sh || !String(keyword).trim()) return null;
  var k = String(keyword).trim().toLowerCase();
  var vals = sh.getDataRange().getValues();
  for (var i = vals.length - 1; i >= 1; i--) {
    if (String(vals[i][0]).trim().toLowerCase() === k) {
      return { sdt: chuanSDT(vals[i][0]), tenKhachHang: String(vals[i][1]||''), cccd: String(vals[i][2]||''), diaChiKH: String(vals[i][3]||'') };
    }
  }
  return null;
}

function lookupHistoryVehicle(keyword) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DanhSachXe');
  if (!sh || !String(keyword).trim()) return null;
  var k = String(keyword).trim().toUpperCase();
  var vals = sh.getDataRange().getValues();
  for (var i = vals.length - 1; i >= 1; i--) {
    if (String(vals[i][0]).trim().toUpperCase() === k) {
      return {
        bienSoXe: String(vals[i][0]||''), vinXe: String(vals[i][1]||''), hangXe: String(vals[i][2]||''),
        modelXe: String(vals[i][3]||''), loaiXe: String(vals[i][4]||''), namSX: String(vals[i][5]||''), soKmCuoi: String(vals[i][6]||''),
        soMay: String(vals[i][7]||''), mauSac: String(vals[i][8]||'')
      };
    }
  }
  return null;
}

// ============ TỒN KHO ============
function getInventoryData() {
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DanhMucVatTu');
    if (!sh) return [];
    var data = sh.getDataRange().getValues(), result = [];
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim()) {
        result.push({
          maVT: String(data[i][0]).trim(), tenVT: String(data[i][1]).trim(), donVi: String(data[i][2]).trim(),
          donGia: Number(data[i][3])||0, tonKho: Number(data[i][4])||0, tonMin: Number(data[i][5])||0, ncc: String(data[i][6])||''
        });
      }
    }
    return result;
  } catch(e) { return []; }
}

function saveMultipleSpareParts(items) {
  try {
    var _chan = capQuyen_('kho.luuVatTu'); if (_chan) return _chan;
    if (!items || !items.length) return { success: false, msg: 'Không có dữ liệu' };
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DanhMucVatTu');
    if (!sh) return { success: false, msg: 'Không tìm thấy bảng DanhMucVatTu' };
    var data = sh.getDataRange().getValues();
    var existing = {};
    for (var i = 1; i < data.length; i++) {
      var code = String(data[i][0]).trim().toLowerCase();
      if (code) existing[code] = true;
    }
    var dup = [];
    for (var j = 0; j < items.length; j++) {
      if (existing[String(items[j].maVT).trim().toLowerCase()]) dup.push(items[j].maVT);
    }
    if (dup.length > 0) return { success: false, msg: 'Mã trùng: ' + dup.join(', ') };
    for (var k = 0; k < items.length; k++) {
      sh.appendRow([items[k].maVT, items[k].tenVT, items[k].donVi||'Cái', items[k].donGiaXuat||0, 0, items[k].tonMin||5, items[k].ncc||'']);
    }
    xoaCacheDanhMuc_();
    SpreadsheetApp.flush();
    return { success: true };
  } catch(e) { return { success: false, msg: e.message }; }
}

function updateSparePart(oldCode, newData) {
  try {
    var _chan = capQuyen_('kho.suaVatTu'); if (_chan) return _chan;
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DanhMucVatTu');
    if (!sh) return { success: false, msg: 'Không tìm thấy bảng' };
    var data = sh.getDataRange().getValues();
    var target = String(oldCode).trim().toLowerCase();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toLowerCase() === target) {
        sh.getRange(i+1, 1, 1, 7).setValues([[
          newData.maVT, newData.tenVT, newData.donVi||'Cái',
          Number(newData.donGia)||0, data[i][4], Number(newData.tonMin)||5, newData.ncc||''
        ]]);
        xoaCacheDanhMuc_();
    SpreadsheetApp.flush();
        return { success: true };
      }
    }
    return { success: false, msg: 'Không tìm thấy mã' };
  } catch(e) { return { success: false, msg: e.message }; }
}

function deleteSparePart(maVT) {
  try {
    var _chan = capQuyen_('kho.xoaVatTu'); if (_chan) return _chan;
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DanhMucVatTu');
    if (!sh) return { success: false, msg: 'Không tìm thấy bảng' };
    var data = sh.getDataRange().getValues();
    var target = String(maVT).trim().toLowerCase();
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]).trim().toLowerCase() === target) {
        sh.deleteRow(i + 1);
        xoaCacheDanhMuc_();
    SpreadsheetApp.flush();
        return { success: true };
      }
    }
    return { success: false, msg: 'Không tìm thấy' };
  } catch(e) { return { success: false, msg: e.message }; }
}

// ============ LỆNH SỬA CHỮA ============
function searchOrders(filters) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('LenhSuaChua');
  if (!sheet) return [];
  var vals = sheet.getDataRange().getValues(), results = [];
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    if (!String(r[0]).trim()) continue;
    var match = true;
    if (filters.maLenh && !String(r[0]).toLowerCase().includes(filters.maLenh.toLowerCase())) match = false;
    if (filters.bienSo && !String(r[3]).toLowerCase().includes(filters.bienSo.toLowerCase())) match = false;
    if (filters.tenKhachHang && !String(r[8]).toLowerCase().includes(filters.tenKhachHang.toLowerCase())) match = false;
    if (filters.trangThai && filters.trangThai !== 'Tất cả' && String(r[12]) !== filters.trangThai) match = false;
    if (match) {
      results.push({
        maLenh: String(r[0]), ngayTiepNhan: safeParseDateString(r[1], 'dateInput'),
        gioTiepNhan: formatSheetTime(r[21]), ngayDuKienXong: safeParseDateString(r[2], 'dateInput'),
        gioDuKienXong: formatSheetTime(r[22]), bienSoXe: String(r[3]),
        tenKhachHang: String(r[8]), sdt: chuanSDT(r[9]), trangThai: String(r[12]),
        thoiGianCapNhat: safeParseDateString(r[20], 'datetime') || '',
        loaiCongViec: String(r[28] || ''),
        trangThaiXuat: String(r[26] || 'Chưa Xuất')
      });
    }
  }
  return results.reverse();
}

function getOrderDetails(maLenh) {
  if (!maLenh) throw new Error('Mã lệnh không hợp lệ');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var masterVals = ss.getSheetByName('LenhSuaChua').getDataRange().getValues();
  var details = { main: {}, congViec: [], vatTu: [] };
  var target = String(maLenh).trim().toLowerCase();
  for (var i = 1; i < masterVals.length; i++) {
    if (String(masterVals[i][0]).trim().toLowerCase() === target) {
      var r = masterVals[i];
      details.main = {
        maLenh: String(r[0]||''), ngayTiepNhan: safeParseDateString(r[1], 'dateInput'),
        gioTiepNhan: formatSheetTime(r[21]), ngayDuKienXong: safeParseDateString(r[2], 'dateInput'),
        gioDuKienXong: formatSheetTime(r[22]), bienSoXe: String(r[3]||''),
        loaiXe: String(r[4]||''), hangXe: String(r[5]||''), namSX: String(r[6]||''),
        soKm: String(r[7]||''), tenKhachHang: String(r[8]||''), sdt: chuanSDT(r[9]),
        trieuChung: String(r[10]||''), kyThuatVien: String(r[11]||''), trangThai: String(r[12]||''),
        ghiChu: String(r[16]||''), modelXe: String(r[17]||''), diaChiKH: String(r[18]||''),
        vinXe: String(r[19]||''), cccd: String(r[24]||''), coVanDichVu: String(r[25]||''),
        trangThaiXuatKho: String(r[26]||'Chưa Xuất'),
        loaiCongViec: String(r[28]||''),
        tongGiamGia: Number(r[32]||0), giaTriGiamGia: Number(r[32]||0),
        tongCongThanhToan: Number(r[33]||0),
        soMay: String(r[34]||''), mauSac: String(r[35]||''),
        ghiChuKhachHang: String(r[36]||''), nhatKy: String(r[37]||'')
      };
      break;
    }
  }
  var shCV = ss.getSheetByName('ChiTietCongViec');
  if (shCV) {
    var cvVals = shCV.getDataRange().getValues();
    for (var i = 1; i < cvVals.length; i++) {
      if (String(cvVals[i][0]).trim().toLowerCase() === target) {
        details.congViec.push({
          maCV: String(cvVals[i][2]||''), moTa: String(cvVals[i][3]||''),
          thoiGian: Number(cvVals[i][4]||0), donGia: Number(cvVals[i][5]||0),
          ktv: String(cvVals[i][7]||''), trangThai: String(cvVals[i][8]||''),
          vat: String(cvVals[i][9]||'8'), giamGia: Number(cvVals[i][10]||0), giamGiaKieu: String(cvVals[i][11]||'tien')
        });
      }
    }
  }
  var shVT = ss.getSheetByName('VatTu');
  if (shVT) {
    var vtVals = shVT.getDataRange().getValues();
    for (var i = 1; i < vtVals.length; i++) {
      if (String(vtVals[i][0]).trim().toLowerCase() === target) {
        details.vatTu.push({
          stt: Number(vtVals[i][1] || (i)),
          maVT: String(vtVals[i][2]||''), tenVT: String(vtVals[i][3]||''),
          donVi: String(vtVals[i][4]||''), soLuong: Number(vtVals[i][5]||0),
          donGia: Number(vtVals[i][6]||0), trangThaiXuat: String(vtVals[i][8]||'Chưa Xuất'),
          vat: String(vtVals[i][10]||'8'), giamGia: Number(vtVals[i][11]||0), giamGiaKieu: String(vtVals[i][12]||'tien')
        });
      }
    }
  }
  // Bổ sung số Km cuối của xe (từ DanhSachXe) để cảnh báo khi nhập km mới
  try {
    var bs = String(details.main.bienSoXe || '').trim().toLowerCase();
    if (bs) {
      var shXe = ss.getSheetByName('DanhSachXe');
      if (shXe) {
        var xeVals = shXe.getDataRange().getValues();
        for (var ix = 1; ix < xeVals.length; ix++) {
          if (String(xeVals[ix][0]).trim().toLowerCase() === bs) {
            details.main.soKmCuoi = Number(xeVals[ix][6] || 0);
            break;
          }
        }
      }
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(details));
}

// KTV chính = thợ có tổng THỜI GIAN công việc nhiều nhất (một việc có thể nhiều KTV).
function ktvChinhTuCongViec_(congViec) {
  var time = {};
  (congViec || []).forEach(function (cv) {
    var tg = Number(cv.thoiGian || cv.thoiGianCV || 0) || 0;
    String(cv.ktv || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (k) {
      time[k] = (time[k] || 0) + tg;
    });
  });
  var best = '', max = -1;
  Object.keys(time).forEach(function (k) { if (time[k] > max) { max = time[k]; best = k; } });
  return best;
}

function saveOrder(data) {
  try {
    var _chan = capQuyen_('lenh.luu'); if (_chan) return _chan;
    var laMoi = !String(data.maLenh || '').trim();
    // Lưu lần đầu: BẮT BUỘC chọn loại công việc
    if (laMoi && !String(data.loaiCongViec || '').trim()) {
      return { success: false, msg: 'Vui lòng chọn Loại công việc trước khi lưu lệnh.' };
    }
    // GUARD: Chỉ cho Hoàn Thành khi toàn bộ vật tư đã xuất kho
    if (String(data.trangThai).trim() === 'Hoàn Thành') {
      // KTV chính KHÔNG bắt buộc nhập tay: tự tính từ công việc (thợ nhiều thời gian nhất)
      if (!String(data.kyThuatVien || '').trim()) {
        data.kyThuatVien = ktvChinhTuCongViec_(data.congViec);
      }
      var dsVT = data.vatTu || [];
      var conChuaXuat = false;
      for (var k = 0; k < dsVT.length; k++) {
        if (String(dsVT[k].trangThaiXuat || 'Chưa Xuất').trim() !== 'Đã Xuất') { conChuaXuat = true; break; }
      }
      if (dsVT.length > 0 && conChuaXuat) {
        return { success: false, msg: 'Chỉ được Hoàn Thành khi toàn bộ vật tư đã xuất kho!' };
      }
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var shMaster = ss.getSheetByName('LenhSuaChua');
    var valsMaster = shMaster.getDataRange().getValues();
    var isUpd = false, rowIdx = -1;
    
    if (data.maLenh) {
      var tM = String(data.maLenh).trim().toLowerCase();
      for (var i = 1; i < valsMaster.length; i++) {
        if (String(valsMaster[i][0]).trim().toLowerCase() === tM) { isUpd = true; rowIdx = i + 1; break; }
      }
    } else {
      // Sinh mã lệnh dạng RO + yyyyMM + NNN (theo tháng của ngày tiếp nhận), tăng dần.
      // Khớp định dạng dữ liệu gốc (RO202507001). Có xét cả mã RO cũ (LSC/LCS xem như đã bỏ).
      var ngayVao = String(data.ngayTiepNhan || '').match(/^(\d{4})-(\d{2})/);
      var now2 = new Date();
      var pre = ngayVao ? ('RO' + ngayVao[1] + ngayVao[2])
                        : ('RO' + Utilities.formatDate(now2, Session.getScriptTimeZone() || 'GMT+7', 'yyyyMM'));
      var maxThang = 0, maCoTon = {};
      for (var i = 1; i < valsMaster.length; i++) {
        var ma0 = String(valsMaster[i][0] || '').trim();
        if (ma0) maCoTon[ma0.toUpperCase()] = true;
        var mm2 = ma0.match(/^RO(\d{6})(\d{3})$/i);
        if (mm2 && ('RO' + mm2[1]).toUpperCase() === pre.toUpperCase()) {
          var n2 = parseInt(mm2[2], 10);
          if (n2 > maxThang) maxThang = n2;
        }
      }
      var stt = maxThang + 1;
      data.maLenh = pre + ('00' + stt).slice(-3);
      while (maCoTon[data.maLenh.toUpperCase()]) { stt++; data.maLenh = pre + ('00' + stt).slice(-3); }
    }
    
    var sdtText = data.sdt ? "'" + data.sdt : '';
    var cccdText = data.cccd ? "'" + data.cccd : '';
    
    // Nếu update: giữ nguyên ngày/giờ tiếp nhận gốc từ sheet
    var ngayTN = data.ngayTiepNhan;
    var gioTN  = data.gioTiepNhan  || '';
    var nhatKyLenh = '';
    var nowStrLenh = new Date().toLocaleString('vi-VN');
    if (isUpd) {
      var origRow = valsMaster[rowIdx - 1];
      ngayTN = origRow[1] || ngayTN;  // Giữ giá trị gốc cột B (ngày TN)
      gioTN  = origRow[21] || gioTN;  // Giữ giá trị gốc cột V (giờ TN)
      nhatKyLenh = String(origRow[37] || '');
      // Ghi nhật ký nếu trạng thái thay đổi
      var ttCu = String(origRow[12] || '').trim();
      var ttMoi = String(data.trangThai || '').trim();
      if (ttCu && ttMoi && ttCu !== ttMoi) {
        nhatKyLenh = '[' + nowStrLenh + '] Đổi trạng thái: "' + ttCu + '" → "' + ttMoi + '"'
                     + (nhatKyLenh ? '\n' + nhatKyLenh : '');
      }
    } else {
      // Tạo mới
      nhatKyLenh = '[' + nowStrLenh + '] Tạo lệnh sửa chữa (trạng thái: ' + (data.trangThai || '') + ')';
    }
    
    var rD = [
      data.maLenh, ngayTN, data.ngayDuKienXong, data.bienSoXe,
      data.loaiXe, data.hangXe, data.namSX, data.soKm, data.tenKhachHang,
      sdtText, data.trieuChung, data.kyThuatVien, data.trangThai,
      data.tongTienCongGoc||0, data.tongTienVatTuGoc||0, data.tongCongThanhToan||0,
      data.ghiChu, data.modelXe||'', data.diaChiKH||'', data.vinXe||'',
      new Date(), gioTN, data.gioDuKienXong||'', data.soKm||'',
      cccdText, data.coVanDichVu||'', isUpd ? (valsMaster[rowIdx-1][26]||'Chưa Xuất') : 'Chưa Xuất',
      0, (data.loaiCongViec || ''), 0, 0,
      data.tongThueVat||0, data.tongGiamGia||0, data.tongCongThanhToan||0,
      data.soMay||'', data.mauSac||'',
      data.ghiChuKhachHang||'',
      nhatKyLenh
    ];
    
    if (isUpd) shMaster.getRange(rowIdx, 1, 1, 38).setValues([rD]);
    else shMaster.appendRow(rD);
    
    // Chi tiết công việc
    var tMa = String(data.maLenh).trim().toLowerCase();
    var shCV = ss.getSheetByName('ChiTietCongViec');
    if (shCV) {
      var vC = shCV.getDataRange().getValues();
      for (var i = vC.length - 1; i >= 1; i--) {
        if (String(vC[i][0]).trim().toLowerCase() === tMa) shCV.deleteRow(i + 1);
      }
      for (var j = 0; j < data.congViec.length; j++) {
        var cv = data.congViec[j];
        shCV.appendRow([data.maLenh, j+1, cv.maCV, cv.moTa, cv.thoiGian, cv.donGia, cv.thanhTienDong, cv.ktv, cv.trangThai||'Chưa làm', cv.vat||8, cv.giamGia||0, cv.giamGiaKieu||'tien']);
      }
    }
    
    // Chi tiết vật tư
    var shVT = ss.getSheetByName('VatTu');
    if (shVT) {
      var vV = shVT.getDataRange().getValues();

      // ── GUARD (Cách 1): không cho sửa SL / xóa vật tư ĐÃ XUẤT trực tiếp ──
      // Vật tư đã xuất kho đã trừ tồn; muốn đổi phải "Thu hồi" (hoàn tồn) rồi xuất lại.
      var daXuatCu = {}; // maVT(lower) -> tổng SL đã xuất hiện có
      for (var i = 1; i < vV.length; i++) {
        if (String(vV[i][0]).trim().toLowerCase() === tMa && String(vV[i][8]).trim() === 'Đã Xuất') {
          var k0 = String(vV[i][2]).trim().toLowerCase();
          daXuatCu[k0] = (daXuatCu[k0] || 0) + Number(vV[i][5] || 0);
        }
      }
      var coBanDaXuat = Object.keys(daXuatCu).length > 0;
      if (coBanDaXuat) {
        var daXuatMoi = {}; // maVT(lower) -> tổng SL còn đánh dấu Đã Xuất trong payload
        for (var j = 0; j < data.vatTu.length; j++) {
          var vtx = data.vatTu[j];
          if (String(vtx.trangThaiXuat || '').trim() === 'Đã Xuất') {
            var kx = String(vtx.maVT).trim().toLowerCase();
            daXuatMoi[kx] = (daXuatMoi[kx] || 0) + Number(vtx.soLuong || 0);
          }
        }
        // Mỗi vật tư đã xuất trước đây phải còn nguyên (đúng SL) trong payload
        for (var mk in daXuatCu) {
          if (daXuatMoi[mk] === undefined) {
            return { success: false, msg: 'Vật tư đã xuất kho không thể xóa trực tiếp. Hãy dùng chức năng "Thu hồi vật tư" ở trang Kho để hoàn tồn trước, rồi sửa lại lệnh.' };
          }
          if (Number(daXuatMoi[mk]) !== Number(daXuatCu[mk])) {
            return { success: false, msg: 'Không thể đổi số lượng vật tư đã xuất kho. Hãy "Thu hồi vật tư" (hoàn tồn) rồi xuất lại theo số lượng mới.' };
          }
        }
        // Không cho "phù phép" vật tư mới thành Đã Xuất mà không qua duyệt xuất kho
        for (var mk2 in daXuatMoi) {
          if (daXuatCu[mk2] === undefined) {
            return { success: false, msg: 'Không thể đánh dấu "Đã Xuất" cho vật tư mới trong lúc sửa lệnh. Hãy lưu ở trạng thái "Chưa Xuất" rồi bấm "Duyệt xuất kho".' };
          }
        }
      }
      // ── hết GUARD ──

      for (var i = vV.length - 1; i >= 1; i--) {
        if (String(vV[i][0]).trim().toLowerCase() === tMa) shVT.deleteRow(i + 1);
      }
      for (var j = 0; j < data.vatTu.length; j++) {
        var vt = data.vatTu[j];
        var ttXuat = String(vt.trangThaiXuat || 'Chưa Xuất').trim() === 'Đã Xuất' ? 'Đã Xuất' : 'Chưa Xuất';
        shVT.appendRow([data.maLenh, j+1, vt.maVT, vt.tenVT, vt.donVi, vt.soLuong, vt.donGia, vt.thanhTienDong, ttXuat, '', vt.vat||8, vt.giamGia||0, vt.giamGiaKieu||'tien']);
      }
    }
    
    // Lưu lịch sử nếu hoàn thành
    if (data.trangThai === 'Hoàn Thành') {
      var shLS = ss.getSheetByName('LichSuSuaChua');
      if (shLS) {
        var lsV = shLS.getDataRange().getValues();
        for (var i = lsV.length - 1; i >= 1; i--) {
          if (String(lsV[i][0]).trim().toLowerCase() === tMa) shLS.deleteRow(i + 1);
        }
        shLS.appendRow([data.maLenh, data.ngayTiepNhan, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'), data.bienSoXe, data.tenKhachHang, sdtText, data.tongCongThanhToan, '🔧 ' + data.hangXe]);
      }
    }
    
    // Cập nhật DanhSachXe (km cuối + thông tin xe) để cảnh báo km lần sau
    try {
      var shXe = ss.getSheetByName('DanhSachXe');
      if (shXe && data.bienSoXe) {
        var bsKey = String(data.bienSoXe).trim().toLowerCase();
        var xeV = shXe.getDataRange().getValues();
        var foundXe = -1;
        for (var ix = 1; ix < xeV.length; ix++) {
          if (String(xeV[ix][0]).trim().toLowerCase() === bsKey) { foundXe = ix + 1; break; }
        }
        var kmMoi = Number(data.soKm || 0) || 0;
        if (foundXe > 0) {
          var kmCu = Number(xeV[foundXe - 1][6] || 0) || 0;
          // Chỉ nâng km cuối, không hạ
          if (kmMoi >= kmCu) shXe.getRange(foundXe, 7).setValue(kmMoi);
          if (data.mauSac) shXe.getRange(foundXe, 9).setValue(data.mauSac);
        } else {
          shXe.appendRow([data.bienSoXe, data.vinXe || '', data.hangXe || '', data.modelXe || '', data.loaiXe || '', data.namSX || '', kmMoi, data.soMay || '', data.mauSac || '']);
        }
      }
    } catch (e) {}

    SpreadsheetApp.flush();
    ghiLog('Lệnh SC', isUpd ? 'Cập nhật lệnh' : 'Tạo lệnh mới', data.maLenh);
    return { success: true, maLenh: data.maLenh };
  } catch(e) {
    return { success: false, msg: e.message };
  }
}



// ============ PHIẾU NHẬP ============
function getImportOrders() {
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PhieuNhapKho');
    if (!sh) return [];
    var data = sh.getDataRange().getValues(), res = [];
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]).trim()) {
        var d = data[i][1];
        var ngayStr = (d instanceof Date) ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy') : String(d);
        var g = data[i][2];
        var gioStr = (g instanceof Date) ? Utilities.formatDate(g, Session.getScriptTimeZone(), 'HH:mm') : String(g);
        res.push({
          maPhieu: String(data[i][0]), ngayLap: ngayStr, gioLap: gioStr,
          ncc: String(data[i][3]), sdt: chuanSDT(data[i][4]), trangThai: String(data[i][5]),
          tongTien: Number(data[i][6])||0, ghiChu: String(data[i][7])
        });
      }
    }
    return res;
  } catch(e) { return []; }
}

function getImportOrderDetails(maPhieu) {
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ChiTietPhieuNhap');
    if (!sh) return [];
    var data = sh.getDataRange().getValues(), res = [];
    var target = String(maPhieu).trim().toLowerCase();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toLowerCase() === target) {
        res.push({
          maVT: String(data[i][2]||''), tenVT: String(data[i][3]||''),
          donVi: String(data[i][4]||''), soLuong: Number(data[i][5])||0,
          giaNhap: Number(data[i][6])||0, vat: String(data[i][7]||'8'),
          giaXuat: Number(data[i][8])||0, thanhTien: Number(data[i][9])||0
        });
      }
    }
    return res;
  } catch(e) { return []; }
}

function saveImportOrder(data) {
  try {
    var _chan = capQuyen_('kho.nhap'); if (_chan) return _chan;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var shPN = ss.getSheetByName('PhieuNhapKho'), shCT = ss.getSheetByName('ChiTietPhieuNhap');
    if (!shPN || !shCT) return { success: false, msg: 'Thiếu bảng dữ liệu' };
    
    if (!data.maPhieu) {
      var vals = shPN.getDataRange().getValues(), maxN = 0;
      for (var i = 1; i < vals.length; i++) {
        if (String(vals[i][0]).toUpperCase().indexOf('PN') === 0) {
          var num = parseInt(String(vals[i][0]).replace('PN',''), 10);
          if (num > maxN) maxN = num;
        }
      }
      data.maPhieu = 'PN' + (maxN > 0 ? (maxN + 1) : 10001);
    }
    
    var dbVals = shPN.getDataRange().getValues(), isUpd = false, rowIdx = -1;
    for (var i = 1; i < dbVals.length; i++) {
      if (String(dbVals[i][0]).trim().toLowerCase() === String(data.maPhieu).trim().toLowerCase()) { isUpd = true; rowIdx = i + 1; break; }
    }
    
    var rd = [data.maPhieu, data.ngayLap, data.gioLap, data.ncc, data.sdtNCC||'', data.trangThaiChinhThucDuyet||'Chờ Nhập Kho', data.tongTien, data.ghiChu];
    if (isUpd) shPN.getRange(rowIdx, 1, 1, 8).setValues([rd]);
    else shPN.appendRow(rd);
    
    var ctVals = shCT.getDataRange().getValues();
    for (var i = ctVals.length - 1; i >= 1; i--) {
      if (String(ctVals[i][0]).trim().toLowerCase() === String(data.maPhieu).trim().toLowerCase()) shCT.deleteRow(i + 1);
    }
    for (var j = 0; j < data.items.length; j++) {
      var it = data.items[j];
      var tt = Math.round(Number(it.soLuong) * Number(it.giaNhap) * (1 + Number(it.vat||0)/100));
      shCT.appendRow([data.maPhieu, j+1, it.maVT, it.tenVT, it.donVi, it.soLuong, it.giaNhap, it.vat, it.donGiaXuat, tt]);
    }
    
    if (data.trangThaiChinhThucDuyet === 'Đã Nhập Kho') {
      var shDM = ss.getSheetByName('DanhMucVatTu'), shLog = ss.getSheetByName('LichSuKho');
      var dmData = shDM.getDataRange().getValues();
      var userEmail = Session.getActiveUser().getEmail() || 'Admin';
      for (var j = 0; j < data.items.length; j++) {
        var item = data.items[j];
        for (var k = 1; k < dmData.length; k++) {
          if (String(dmData[k][0]).trim().toLowerCase() === String(item.maVT).trim().toLowerCase()) {
            shDM.getRange(k+1, 5).setValue(Number(dmData[k][4]||0) + Number(item.soLuong));
            if (Number(item.donGiaXuat) > 0) shDM.getRange(k+1, 4).setValue(item.donGiaXuat);
            break;
          }
        }
        shLog.appendRow([new Date(), 'Nhập Kho', data.maPhieu, item.maVT, item.tenVT, item.soLuong, item.giaNhap, data.ncc, userEmail, 'Nhập từ NCC', item.vat]);
      }
    }
    
    xoaCacheDanhMuc_();
    SpreadsheetApp.flush();
    ghiLog('Kho', 'Lưu phiếu nhập kho', data.maPhieu);
    return { success: true, maPhieu: data.maPhieu };
  } catch(e) { return { success: false, msg: e.message }; }
}

function deleteImportOrder(maPhieu) {
  try {
    var _chan = capQuyen_('kho.xoaPhieu'); if (_chan) return _chan;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var target = String(maPhieu).trim().toLowerCase();
    ['PhieuNhapKho','ChiTietPhieuNhap'].forEach(function(s) {
      var sh = ss.getSheetByName(s);
      if (sh) {
        var data = sh.getDataRange().getValues();
        for (var i = data.length - 1; i >= 1; i--) {
          if (String(data[i][0]).trim().toLowerCase() === target) sh.deleteRow(i + 1);
        }
      }
    });
    return { success: true };
  } catch(e) { return { success: false }; }
}

// ============ BÁN LẺ ============
function getRetailOrders() {
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DonBanLe');
    if (!sh) return [];
    var data = sh.getDataRange().getValues(), res = [];
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]).trim()) {
        var d = data[i][1];
        var ngayStr = (d instanceof Date) ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy') : String(d);
        var g = data[i][2];
        var gioStr = (g instanceof Date) ? Utilities.formatDate(g, Session.getScriptTimeZone(), 'HH:mm') : String(g);
        res.push({
          maDon: String(data[i][0]), ngayLap: ngayStr, gioLap: gioStr,
          tenKhachHang: String(data[i][3]), sdt: chuanSDT(data[i][4]),
          trangThai: String(data[i][5]), tongTien: Number(data[i][6])||0, ghiChu: String(data[i][7])
        });
      }
    }
    return res;
  } catch(e) { return []; }
}

function getRetailOrderDetails(maDon) {
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ChiTietDonBanLe');
    if (!sh) return [];
    var data = sh.getDataRange().getValues(), res = [];
    var target = String(maDon).trim().toLowerCase();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toLowerCase() === target) {
        res.push({
          maVT: String(data[i][2]||''), tenVT: String(data[i][3]||''),
          donVi: String(data[i][4]||''), soLuong: Number(data[i][5])||0,
          donGiaXuat: Number(data[i][6])||0, vat: String(data[i][7]||'8'),
          thanhTien: Number(data[i][8])||0,
          giamGia: Number(data[i][9])||0, giamGiaKieu: String(data[i][10]||'tien')
        });
      }
    }
    return res;
  } catch(e) { return []; }
}

function saveRetailOrder(data) {
  try {
    var _chan = capQuyen_('kho.banLe'); if (_chan) return _chan;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var shDBL = ss.getSheetByName('DonBanLe'), shCT = ss.getSheetByName('ChiTietDonBanLe');
    if (!shDBL || !shCT) return { success: false, msg: 'Thiếu bảng' };
    
    if (!data.maDon) {
      var vals = shDBL.getDataRange().getValues(), maxN = 0;
      for (var i = 1; i < vals.length; i++) {
        if (String(vals[i][0]).toUpperCase().indexOf('BL') === 0) {
          var num = parseInt(String(vals[i][0]).replace('BL',''), 10);
          if (num > maxN) maxN = num;
        }
      }
      data.maDon = 'BL' + (maxN > 0 ? (maxN + 1) : 10001);
    }
    
    var dbVals = shDBL.getDataRange().getValues(), isUpd = false, rowIdx = -1;
    for (var i = 1; i < dbVals.length; i++) {
      if (String(dbVals[i][0]).trim().toLowerCase() === String(data.maDon).trim().toLowerCase()) { isUpd = true; rowIdx = i + 1; break; }
    }
    
    var sdtText = data.sdt ? "'" + data.sdt : '';
    var rd = [data.maDon, data.ngayLap, data.gioLap, data.tenKhachHang, sdtText, data.trangThai, data.tongTien, data.ghiChu, data.cccd||'', data.diaChiKH||''];
    if (isUpd) shDBL.getRange(rowIdx, 1, 1, 10).setValues([rd]);
    else shDBL.appendRow(rd);
    
    var ctVals = shCT.getDataRange().getValues();
    for (var i = ctVals.length - 1; i >= 1; i--) {
      if (String(ctVals[i][0]).trim().toLowerCase() === String(data.maDon).trim().toLowerCase()) shCT.deleteRow(i + 1);
    }
    for (var j = 0; j < data.items.length; j++) {
      var it = data.items[j];
      var baseVAT = Number(it.soLuong) * Number(it.donGiaXuat) * (1 + Number(it.vat||0)/100);
      var giam = (it.giamTien != null) ? Number(it.giamTien) : 0;
      var tt = Math.round(Math.max(baseVAT - giam, 0));
      shCT.appendRow([data.maDon, j+1, it.maVT, it.tenVT, it.donVi, it.soLuong, it.donGiaXuat, it.vat, tt, it.giamGia||0, it.giamGiaKieu||'tien']);
    }
    
    xoaCacheDanhMuc_();
    SpreadsheetApp.flush();
    ghiLog('Kho', 'Lưu đơn bán lẻ', data.maDon);
    return { success: true, maDon: data.maDon };
  } catch(e) { return { success: false, msg: e.message }; }
}

function deleteRetailOrder(maDon) {
  try {
    var _chan = capQuyen_('kho.xoaPhieu'); if (_chan) return _chan;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var target = String(maDon).trim().toLowerCase();
    ['DonBanLe','ChiTietDonBanLe'].forEach(function(s) {
      var sh = ss.getSheetByName(s);
      if (sh) {
        var data = sh.getDataRange().getValues();
        for (var i = data.length - 1; i >= 1; i--) {
          if (String(data[i][0]).trim().toLowerCase() === target) sh.deleteRow(i + 1);
        }
      }
    });
    return { success: true };
  } catch(e) { return { success: false }; }
}

// ============ CHỜ XUẤT KHO ============
function getPendingExportOrders() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var shMaster = ss.getSheetByName('LenhSuaChua'), shVT = ss.getSheetByName('VatTu');
    if (!shMaster || !shVT) return [];
    var masterVals = shMaster.getDataRange().getValues();
    var vtVals = shVT.getDataRange().getValues();
    var vtMap = {};
    for (var i = 1; i < vtVals.length; i++) {
      var ml = String(vtVals[i][0]).trim().toLowerCase();
      if (!ml) continue;
      var ttDung = String(vtVals[i][8]||'Chưa Xuất').trim();
      if (ttDung === 'Đã Xuất') continue;
      if (!vtMap[ml]) vtMap[ml] = [];
      vtMap[ml].push({
        maVT: String(vtVals[i][2]), tenVT: String(vtVals[i][3]),
        donVi: String(vtVals[i][4]), soLuong: Number(vtVals[i][5]||0),
        donGia: Number(vtVals[i][6]||0), vat: String(vtVals[i][10]||'8')
      });
    }
    var pending = [];
    for (var i = 1; i < masterVals.length; i++) {
      var ml = String(masterVals[i][0]).trim();
      var mlKey = ml.toLowerCase();
      if (vtMap[mlKey] && vtMap[mlKey].length > 0) {
        pending.push({
          maLenh: ml, ngay: safeParseDateString(masterVals[i][1], 'dateInput'),
          bienSoXe: String(masterVals[i][3]), tenKhachHang: String(masterVals[i][8]),
          vatTuList: vtMap[mlKey]
        });
      }
    }
    return pending;
  } catch(e) { return []; }
}

function approveROExport(maLenh) {
  try {
    var _chan = capQuyen_('kho.duyetXuat'); if (_chan) return _chan;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var shMaster = ss.getSheetByName('LenhSuaChua'), shVT = ss.getSheetByName('VatTu');
    var shDM = ss.getSheetByName('DanhMucVatTu'), shLog = ss.getSheetByName('LichSuKho');
    if (!shMaster || !shVT || !shDM || !shLog) return { success: false, msg: 'Lỗi CSDL' };
    
    var target = String(maLenh).trim().toLowerCase();
    var masterVals = shMaster.getDataRange().getValues();
    var foundIdx = -1, bienSo = '';
    for (var i = 1; i < masterVals.length; i++) {
      if (String(masterVals[i][0]).trim().toLowerCase() === target) {
        foundIdx = i + 1; bienSo = String(masterVals[i][3]); break;
      }
    }
    if (foundIdx === -1) return { success: false, msg: 'Không tìm thấy lệnh' };
    
    var vtVals = shVT.getDataRange().getValues();
    var dmVals = shDM.getDataRange().getValues();
    var rowsToUpdate = [], count = 0;
    var canhBaoAm = []; // cảnh báo vật tư sẽ bị tồn âm
    var userEmail = Session.getActiveUser().getEmail() || 'Admin';
    
    for (var i = 1; i < vtVals.length; i++) {
      if (String(vtVals[i][0]).trim().toLowerCase() === target && String(vtVals[i][8]) !== 'Đã Xuất') {
        var maVT = String(vtVals[i][2]), tenVT = String(vtVals[i][3]);
        var sl = Number(vtVals[i][5]||0), dongia = Number(vtVals[i][6]||0);
        var vat = String(vtVals[i][10]||'8');
        
        for (var k = 1; k < dmVals.length; k++) {
          if (String(dmVals[k][0]).trim().toLowerCase() === maVT.trim().toLowerCase()) {
            var tonCu = Number(dmVals[k][4]||0);
            var tonMoi = tonCu - sl;
            if (tonMoi < 0) canhBaoAm.push({ maVT: maVT, tenVT: tenVT, tonCu: tonCu, xuat: sl, tonMoi: tonMoi });
            shDM.getRange(k+1, 5).setValue(tonMoi);
            break;
          }
        }
        shLog.appendRow([new Date(), 'Xuất Kho Lệnh SC', maLenh, maVT, tenVT, sl, dongia, bienSo, userEmail, 'Xuất theo lệnh', vat]);
        rowsToUpdate.push(i + 1);
        count++;
      }
    }
    
    if (count === 0) return { success: false, msg: 'Tất cả đã xuất' };
    
    for (var r = 0; r < rowsToUpdate.length; r++) {
      shVT.getRange(rowsToUpdate[r], 9).setValue('Đã Xuất');
    }
    shMaster.getRange(foundIdx, 27).setValue('Đã Xuất');
    
    xoaCacheDanhMuc_();
    SpreadsheetApp.flush();
    ghiLog('Kho', 'Duyệt xuất kho lệnh SC', maLenh);
    var kq = { success: true };
    if (canhBaoAm.length) {
      kq.canhBao = canhBaoAm;
      kq.msg = 'Đã xuất kho nhưng ' + canhBaoAm.length + ' vật tư bị TỒN ÂM — cần kiểm tra & nhập bù.';
    }
    return kq;
  } catch(e) { return { success: false, msg: e.message }; }
}

// ============ LỊCH SỬ KHO ============
function getInventoryLogs() {
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('LichSuKho');
    if (!sh) return [];
    var data = sh.getDataRange().getValues();
    var grouped = {}, orderList = [];
    for (var i = 1; i < data.length; i++) {
      var ref = String(data[i][2]).trim();
      if (!ref) continue;
      if (!grouped[ref]) {
        grouped[ref] = {
          thoiGian: Utilities.formatDate(new Date(data[i][0]), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
          loaiPhieu: String(data[i][1]), maThamChieu: ref,
          ncc: String(data[i][7]), nguoiThucHien: String(data[i][8]),
          ghiChu: String(data[i][9]), items: [], tongTien: 0, soMon: 0
        };
        orderList.push(ref);
      }
      var sl = Number(data[i][5])||0, gia = Number(data[i][6])||0, vat = Number(data[i][10])||0;
      var tt = sl * gia * (1 + vat/100);
      grouped[ref].items.push({ maVT: data[i][3], tenVT: data[i][4], soLuong: sl, donGia: gia, vat: vat, thanhTien: tt });
      grouped[ref].tongTien += tt;
      grouped[ref].soMon++;
    }
    var results = [];
    for (var i = orderList.length - 1; i >= 0; i--) results.push(grouped[orderList[i]]);
    return results;
  } catch(e) { return []; }
}

function deleteInventoryHistory(maThamChieu) {
  try {
    var _chan = capQuyen_('kho.xoaLichSu'); if (_chan) return _chan;
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('LichSuKho');
    if (!sh) return { success: false, msg: 'Không tìm thấy bảng' };
    var target = String(maThamChieu).trim().toLowerCase();
    var data = sh.getDataRange().getValues();
    var deleted = 0;
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][2]).trim().toLowerCase() === target) {
        sh.deleteRow(i + 1);
        deleted++;
      }
    }
    return { success: deleted > 0, msg: 'Đã xóa ' + deleted + ' dòng' };
  } catch(e) { return { success: false, msg: e.message }; }
}

// ============ BÁO CÁO ============
function getMonthlyReportData(month, year) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('LenhSuaChua');
    if (!sh) return [];
    var vals = sh.getDataRange().getValues(), reportData = [];

    // Gom chi tiết công việc & vật tư theo mã lệnh (để tính chính xác, đúng cả lệnh cũ)
    var congByLenh = {}, vtByLenh = {}, giamByLenh = {};
    var shCV = ss.getSheetByName('ChiTietCongViec');
    if (shCV) {
      var cvv = shCV.getDataRange().getValues();
      for (var i = 1; i < cvv.length; i++) {
        var ml = String(cvv[i][0]).trim().toLowerCase();
        if (!ml) continue;
        var tg = Number(cvv[i][4] || 0), dg = Number(cvv[i][5] || 0);
        var base = tg * dg; // giá gốc chưa VAT chưa giảm
        congByLenh[ml] = (congByLenh[ml] || 0) + base;
        giamByLenh[ml] = (giamByLenh[ml] || 0) + giamTuChiTiet_(cvv[i][10], cvv[i][11], base, Number(cvv[i][9] || 0));
      }
    }
    var shVT = ss.getSheetByName('VatTu');
    if (shVT) {
      var vtv = shVT.getDataRange().getValues();
      for (var i = 1; i < vtv.length; i++) {
        var ml = String(vtv[i][0]).trim().toLowerCase();
        if (!ml) continue;
        var sl = Number(vtv[i][5] || 0), dgv = Number(vtv[i][6] || 0);
        var baseVT = sl * dgv; // giá gốc chưa VAT chưa giảm
        vtByLenh[ml] = (vtByLenh[ml] || 0) + baseVT;
        giamByLenh[ml] = (giamByLenh[ml] || 0) + giamTuChiTiet_(vtv[i][11], vtv[i][12], baseVT, Number(vtv[i][10] || 0));
      }
    }

    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][12]).trim() === 'Hoàn Thành') {
        var ngayTN = safeParseDateString(vals[i][1], 'dateInput');
        if (ngayTN) {
          var parts = ngayTN.split('-');
          if (parts.length >= 2 && parseInt(parts[0]) === year && parseInt(parts[1]) === month) {
            var ma = String(vals[i][0]).trim().toLowerCase();
            // Ưu tiên cột tổng đã lưu; nếu = 0 (lệnh cũ) thì dùng giá trị tính từ chi tiết
            var tienCong = Number(vals[i][13] || 0) || (congByLenh[ma] || 0);
            var tienVT   = Number(vals[i][14] || 0) || (vtByLenh[ma] || 0);
            var giamGia  = Number(vals[i][32] || 0) || (giamByLenh[ma] || 0);
            var thanhToan = Number(vals[i][33] || 0);
            reportData.push({
              maLenh: vals[i][0], ngayHoanThanh: ngayTN, bienSo: vals[i][3],
              khachHang: vals[i][8], tongCong: tienCong,
              tongVatTu: tienVT, giamGia: giamGia,
              thanhToan: thanhToan
            });
          }
        }
      }
    }
    return reportData;
  } catch(e) { return []; }
}

// Tính số tiền giảm của 1 dòng chi tiết theo kiểu (% hoặc tiền)
function giamTuChiTiet_(giaTriGG, loaiGG, base, vat) {
  var gt = Number(giaTriGG || 0);
  if (!gt) return 0;
  var kieu = String(loaiGG || 'tien').toLowerCase();
  if (kieu === 'phan_tram' || kieu === '%') {
    var baseVAT = base * (1 + (Number(vat) || 0) / 100);
    return baseVAT * gt / 100;
  }
  return gt; // giảm theo số tiền
}
// =============================================================
// SERVER_V2.JS – BỔ SUNG BACKEND CHO CÁC TÍNH NĂNG MỚI
// Thêm vào Core.js (phía dưới cùng, trước dấu ngoặc kết thúc)
// =============================================================

// ─── MÃ BẢO MẬT & XÁC THỰC THAO TÁC NHẠY CẢM ──────────────
// Mã chung dùng làm dự phòng khi người dùng chưa đặt mã riêng trong PhanQuyen.
// Khuyến nghị: mỗi người đặt mã riêng ở cột "Mã Bảo Mật" của sheet PhanQuyen.
var DELETE_SECRET_CODE = '112233'; // <<< MÃ DỰ PHÒNG, NÊN ĐỔI

// Đọc một giá trị cấu hình từ bảng CaiDat (khóa, giá trị).
function _docCaiDat_(khoa) {
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CaiDat');
    if (!sh) return '';
    var vals = sh.getDataRange().getValues();
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][0]).trim() === khoa) return String(vals[i][1] || '').trim();
    }
  } catch (e) {}
  return '';
}

// Mã bảo mật của hệ thống dùng cho thao tác nhạy cảm (xóa, trả lệnh...).
// Lưu ở bảng CaiDat (đổi được, hiển thị được) — KHÔNG dùng PIN đăng nhập (đã băm).
function maBaoMatHeThong_() {
  var m = _docCaiDat_('MaBaoMat');
  return m || String(DELETE_SECRET_CODE);
}

// Xác thực mã cho thao tác nhạy cảm.
function xacThucMaBaoMat_(code) {
  var nhap = String(code == null ? '' : code).trim();
  if (!nhap) return false;
  return nhap === maBaoMatHeThong_();
}

// ─── RATE-LIMIT THAO TÁC XÓA (chống lạm dụng/nhầm hàng loạt) ───
var GIOI_HAN_XOA_MOI_GIO = 20; // tối đa số thao tác xóa/giờ cho mỗi người

// Kiểm tra & ghi nhận 1 thao tác xóa. Trả về object lỗi nếu vượt ngưỡng, null nếu OK.
function kiemTraRateXoa_() {
  try {
    var cache = CacheService.getUserCache();
    var key = 'xoa_' + (emailHienTai_() || 'anon');
    var raw = cache.get(key);
    var arr = raw ? JSON.parse(raw) : [];
    var now = Date.now();
    // Lọc các mốc trong vòng 1 giờ
    arr = arr.filter(function(t) { return now - t < 3600 * 1000; });
    if (arr.length >= GIOI_HAN_XOA_MOI_GIO) {
      return { success: false, msg: 'Bạn đã thực hiện quá ' + GIOI_HAN_XOA_MOI_GIO + ' thao tác xóa trong 1 giờ. Vui lòng thử lại sau.' };
    }
    arr.push(now);
    cache.put(key, JSON.stringify(arr), 3600); // giữ 1 giờ
    return null;
  } catch (e) { return null; } // nếu cache lỗi thì không chặn (an toàn vận hành)
}

// ─── TRẢ LỆNH VỀ ADMIN (có mã bảo mật) ───────────────────
function returnOrderToAdmin(maLenh, lyDo, secretCode) {
  try {
    var _chan = capQuyen_('lenh.traVe'); if (_chan) return _chan;
    // Kiểm tra mã bảo mật
    if (!xacThucMaBaoMat_(secretCode)) {
      return { success: false, msg: 'Mã bảo mật không đúng!' };
    }

    var ss  = SpreadsheetApp.getActiveSpreadsheet();
    var sh  = ss.getSheetByName('LenhSuaChua');
    if (!sh) return { success: false, msg: 'Không tìm thấy bảng LenhSuaChua' };

    var data   = sh.getDataRange().getValues();
    var target = String(maLenh).trim().toLowerCase();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toLowerCase() === target) {
        var nhatKyCu = String(data[i][37] || '');
        var dòngLog = '[' + new Date().toLocaleString('vi-VN') + '] TRẢ VỀ ADMIN – ' + (lyDo || '');
        var nhatKyMoi = dòngLog + (nhatKyCu ? '\n' + nhatKyCu : '');
        sh.getRange(i + 1, 38).setValue(nhatKyMoi); // cột Nhật Ký (col 38) - log, không sửa
        // Đặt lại trạng thái về Đang Tiếp Nhận
        sh.getRange(i + 1, 13).setValue('Đang Tiếp Nhận');
        SpreadsheetApp.flush();
        ghiLog('Lệnh SC', 'Trả lệnh về Admin: ' + (lyDo || ''), maLenh);
        return { success: true };
      }
    }
    return { success: false, msg: 'Không tìm thấy lệnh ' + maLenh };
  } catch(e) {
    return { success: false, msg: e.message };
  }
}

// ─── XÓA LỆNH (có mã bảo mật) ────────────────────────────
// Ghi đè hàm deleteOrder cũ trong Core.js
// (Nếu Core.js đã có deleteOrder, thay nội dung bằng hàm này)
function deleteOrder(maLenh, secretCode) {
  try {
    var _chan = capQuyen_('lenh.xoa'); if (_chan) return _chan;
    // Kiểm tra mã bảo mật
    if (!xacThucMaBaoMat_(secretCode)) {
      return { success: false, msg: 'Mã bảo mật không đúng!' };
    }
    var _rate = kiemTraRateXoa_(); if (_rate) return _rate;

    var ss     = SpreadsheetApp.getActiveSpreadsheet();
    var target = String(maLenh).trim().toLowerCase();

    // Sao lưu toàn bộ dữ liệu lệnh trước khi xóa (để khôi phục trong 24h)
    var backup = { maLenh: maLenh, master: null, congViec: [], vatTu: [] };
    var shM = ss.getSheetByName('LenhSuaChua');
    if (shM) {
      var mv = shM.getDataRange().getValues();
      for (var i = 1; i < mv.length; i++) {
        if (String(mv[i][0]).trim().toLowerCase() === target) { backup.master = mv[i]; break; }
      }
    }
    var shCV = ss.getSheetByName('ChiTietCongViec');
    if (shCV) {
      var cvv = shCV.getDataRange().getValues();
      for (var i = 1; i < cvv.length; i++) {
        if (String(cvv[i][0]).trim().toLowerCase() === target) backup.congViec.push(cvv[i]);
      }
    }
    var shVT = ss.getSheetByName('VatTu');
    if (shVT) {
      var vtv = shVT.getDataRange().getValues();
      for (var i = 1; i < vtv.length; i++) {
        if (String(vtv[i][0]).trim().toLowerCase() === target) backup.vatTu.push(vtv[i]);
      }
    }

    // Ghi vào sheet LenhDaXoa
    var shDel = ss.getSheetByName('LenhDaXoa');
    if (!shDel) {
      shDel = ss.insertSheet('LenhDaXoa');
      shDel.appendRow(['Mã Lệnh', 'Thời Gian Xóa', 'Người Xóa', 'Dữ Liệu (JSON)']);
    }
    shDel.appendRow([maLenh, new Date(), emailHienTai_() || 'N/A', JSON.stringify(backup)]);

    // Xóa khỏi các sheet chính
    ['LenhSuaChua','ChiTietCongViec','VatTu'].forEach(function(name) {
      var sh = ss.getSheetByName(name);
      if (!sh) return;
      var vals = sh.getDataRange().getValues();
      for (var i = vals.length - 1; i >= 1; i--) {
        if (String(vals[i][0]).trim().toLowerCase() === target) {
          sh.deleteRow(i + 1);
        }
      }
    });

    SpreadsheetApp.flush();
    ghiLog('Xóa dữ liệu', 'Xóa lệnh sửa chữa (có thể khôi phục 24h)', maLenh);
    return { success: true };
  } catch(e) {
    return { success: false, msg: e.message };
  }
}

// ─── KHÔI PHỤC LỆNH ĐÃ XÓA (Admin, mã bảo mật, trong 24h) ───
function getDeletedOrders() {
  if (!coQuyen_('lenh.khoiPhuc')) return [];
  try { donDepLenhDaXoa(); } catch (e) {} // dọn rác quá 24h
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('LenhDaXoa');
  if (!sh) return [];
  var vals = sh.getDataRange().getValues();
  var now = new Date().getTime();
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    if (!String(vals[i][0]).trim()) continue;
    var tXoa = new Date(vals[i][1]).getTime();
    var conLai = 24 * 3600 * 1000 - (now - tXoa); // ms còn lại
    if (conLai <= 0) continue; // quá 24h → không hiển thị
    var info = {};
    try { info = JSON.parse(vals[i][3]); } catch (e) {}
    var m = info.master || [];
    out.push({
      maLenh:     String(vals[i][0]),
      thoiGianXoa: Utilities.formatDate(new Date(vals[i][1]), Session.getScriptTimeZone() || 'GMT+7', 'dd/MM/yyyy HH:mm'),
      nguoiXoa:   String(vals[i][2] || ''),
      gioConLai:  Math.max(0, Math.round(conLai / 3600000 * 10) / 10), // giờ còn lại (1 chữ số thập phân)
      bienSo:     m[3] || '',
      tenKH:      m[8] || '',
      soCongViec: (info.congViec || []).length,
      soVatTu:    (info.vatTu || []).length
    });
  }
  return out;
}

function restoreOrder(maLenh, secretCode) {
  try {
    var _chan = capQuyen_('lenh.khoiPhuc'); if (_chan) return _chan;
    if (!xacThucMaBaoMat_(secretCode)) {
      return { success: false, msg: 'Mã bảo mật không đúng!' };
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('LenhDaXoa');
    if (!sh) return { success: false, msg: 'Không có dữ liệu lệnh đã xóa.' };
    var vals = sh.getDataRange().getValues();
    var target = String(maLenh).trim().toLowerCase();
    var now = new Date().getTime();
    for (var i = vals.length - 1; i >= 1; i--) {
      if (String(vals[i][0]).trim().toLowerCase() === target) {
        var tXoa = new Date(vals[i][1]).getTime();
        if (now - tXoa > 24 * 3600 * 1000) {
          return { success: false, msg: 'Đã quá 24 giờ — không thể khôi phục lệnh này nữa.' };
        }
        var info = {};
        try { info = JSON.parse(vals[i][3]); } catch (e) { return { success: false, msg: 'Dữ liệu sao lưu lỗi.' }; }

        // Kiểm tra lệnh chưa tồn tại lại (tránh trùng)
        var shM = ss.getSheetByName('LenhSuaChua');
        var mv = shM.getDataRange().getValues();
        for (var k = 1; k < mv.length; k++) {
          if (String(mv[k][0]).trim().toLowerCase() === target) {
            return { success: false, msg: 'Lệnh ' + maLenh + ' đã tồn tại, không cần khôi phục.' };
          }
        }
        // Khôi phục master + chi tiết
        if (info.master) shM.appendRow(info.master);
        var shCV = ss.getSheetByName('ChiTietCongViec');
        (info.congViec || []).forEach(function(r) { if (shCV) shCV.appendRow(r); });
        var shVT = ss.getSheetByName('VatTu');
        (info.vatTu || []).forEach(function(r) { if (shVT) shVT.appendRow(r); });

        // Xóa bản sao lưu
        sh.deleteRow(i + 1);
        SpreadsheetApp.flush();
        ghiLog('Lệnh SC', 'Khôi phục lệnh đã xóa', maLenh);
        return { success: true };
      }
    }
    return { success: false, msg: 'Không tìm thấy lệnh ' + maLenh + ' trong thùng rác (có thể đã quá hạn).' };
  } catch (e) {
    return { success: false, msg: e.message };
  }
}

// Xóa hẳn (vĩnh viễn) 1 lệnh khỏi thùng rác — cần mã bảo mật
function xoaHanLenh(maLenh, secretCode) {
  try {
    var _chan = capQuyen_('lenh.khoiPhuc'); if (_chan) return _chan;
    if (!xacThucMaBaoMat_(secretCode)) return { success: false, msg: 'Mã bảo mật không đúng!' };
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('LenhDaXoa');
    if (!sh) return { success: false, msg: 'Không có dữ liệu lệnh đã xóa.' };
    var vals = sh.getDataRange().getValues();
    var target = String(maLenh).trim().toLowerCase();
    for (var i = vals.length - 1; i >= 1; i--) {
      if (String(vals[i][0]).trim().toLowerCase() === target) {
        sh.deleteRow(i + 1);
        SpreadsheetApp.flush();
        ghiLog('Lệnh SC', 'Xóa vĩnh viễn lệnh', maLenh);
        return { success: true };
      }
    }
    return { success: false, msg: 'Không tìm thấy lệnh ' + maLenh + '.' };
  } catch (e) { return { success: false, msg: e.message }; }
}

// Xóa hẳn nhiều lệnh cùng lúc — cần mã bảo mật
function xoaHanNhieuLenh(mangMa, secretCode) {
  try {
    var _chan = capQuyen_('lenh.khoiPhuc'); if (_chan) return _chan;
    if (!xacThucMaBaoMat_(secretCode)) return { success: false, msg: 'Mã bảo mật không đúng!' };
    if (!mangMa || !mangMa.length) return { success: false, msg: 'Chưa chọn lệnh nào.' };
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('LenhDaXoa');
    if (!sh) return { success: false, msg: 'Không có dữ liệu lệnh đã xóa.' };
    var canXoa = {};
    mangMa.forEach(function(m) { canXoa[String(m).trim().toLowerCase()] = true; });
    var vals = sh.getDataRange().getValues();
    var soXoa = 0;
    // Xóa từ dưới lên để không lệch chỉ số dòng
    for (var i = vals.length - 1; i >= 1; i--) {
      if (canXoa[String(vals[i][0]).trim().toLowerCase()]) {
        sh.deleteRow(i + 1);
        soXoa++;
      }
    }
    SpreadsheetApp.flush();
    ghiLog('Lệnh SC', 'Xóa vĩnh viễn ' + soXoa + ' lệnh', mangMa.join(', '));
    return { success: true, soXoa: soXoa };
  } catch (e) { return { success: false, msg: e.message }; }
}

// Dọn dẹp các bản sao lưu quá 24h (chạy thủ công hoặc bằng trigger thời gian)
function donDepLenhDaXoa() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('LenhDaXoa');
  if (!sh) return { success: true, daXoa: 0 };
  var vals = sh.getDataRange().getValues();
  var now = new Date().getTime();
  var count = 0;
  for (var i = vals.length - 1; i >= 1; i--) {
    if (!String(vals[i][0]).trim()) continue;
    var tXoa = new Date(vals[i][1]).getTime();
    if (now - tXoa > 24 * 3600 * 1000) { sh.deleteRow(i + 1); count++; }
  }
  if (count > 0) SpreadsheetApp.flush();
  return { success: true, daXoa: count };
}

// ─── XÓA PHIẾU NHẬP KHO (có mã bảo mật) ────────────────
function deleteImportOrderSecure(maPhieu, secretCode) {
  try {
    var _chan = capQuyen_('kho.xoaPhieu'); if (_chan) return _chan;
    if (!xacThucMaBaoMat_(secretCode)) {
      return { success: false, msg: 'Mã bảo mật không đúng!' };
    }
    var _rate = kiemTraRateXoa_(); if (_rate) return _rate;
    var ss     = SpreadsheetApp.getActiveSpreadsheet();
    var target = String(maPhieu).trim().toLowerCase();
    ['PhieuNhapKho','ChiTietPhieuNhap'].forEach(function(name) {
      var sh = ss.getSheetByName(name);
      if (!sh) return;
      var vals = sh.getDataRange().getValues();
      for (var i = vals.length - 1; i >= 1; i--) {
        if (String(vals[i][0]).trim().toLowerCase() === target) sh.deleteRow(i + 1);
      }
    });
    SpreadsheetApp.flush();
    return { success: true };
  } catch(e) { return { success: false, msg: e.message }; }
}

// ─── XÓA ĐƠN BÁN LẺ (có mã bảo mật) ───────────────────
function deleteRetailOrderSecure(maDon, secretCode) {
  try {
    var _chan = capQuyen_('kho.xoaPhieu'); if (_chan) return _chan;
    if (!xacThucMaBaoMat_(secretCode)) {
      return { success: false, msg: 'Mã bảo mật không đúng!' };
    }
    var _rate = kiemTraRateXoa_(); if (_rate) return _rate;
    var ss     = SpreadsheetApp.getActiveSpreadsheet();
    var target = String(maDon).trim().toLowerCase();
    ['DonBanLe','ChiTietDonBanLe'].forEach(function(name) {
      var sh = ss.getSheetByName(name);
      if (!sh) return;
      var vals = sh.getDataRange().getValues();
      for (var i = vals.length - 1; i >= 1; i--) {
        if (String(vals[i][0]).trim().toLowerCase() === target) sh.deleteRow(i + 1);
      }
    });
    SpreadsheetApp.flush();
    return { success: true };
  } catch(e) { return { success: false, msg: e.message }; }
}

// ─── LƯU ĐƠN (cập nhật có giảm giá tổng & MST) ──────────
// Hàm saveOrder bên Core.js cần lưu thêm:
//   col 34: kieuGiamGia   (e.g. 'phan_tram' / 'so_tien')
//   col 35: giaTriGiamGia
//   col 36: giamGiaVAT    (e.g. 'truoc_vat' / 'sau_vat')
//   col 37: tongGiamGia
//   col 38: tongCongThanhToan
//   col 39: maSoThue
//   col 40: soMay (nếu chưa có)
// Đây là phần PATCH cho hàm saveOrder (thêm vào cuối chuỗi setValues):
//
// Trong Core.js, tìm dòng shMaster.getRange(foundIdx, 1, 1, ...).setValues([...])
// và bổ sung thêm các cột giảm giá. Hoặc dùng hàm bổ trợ dưới đây:

function saveOrderDiscountFields(maLenh, discountData) {
  // Gọi sau saveOrder để cập nhật các cột giảm giá
  try {
    var _chan = capQuyen_('lenh.suaGiamGia'); if (_chan) return _chan;
    var sh  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('LenhSuaChua');
    var vals = sh.getDataRange().getValues();
    var target = String(maLenh).trim().toLowerCase();
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][0]).trim().toLowerCase() === target) {
        // Giả sử cột LenhSuaChua theo thứ tự trong chuanHoaHeThong:
        // col 27=GiamGiaCong(index 26), col 28=DP3, col 29=DP4, col 30=GiamGiaVT,
        // col 31=TongVAT, col 32=TongGiamGia, col 33=TongCongThanhToan,
        // col 34=KieuGGVAT, col 35=SoMay, col 36=MaSoThue
        var row = i + 1;
        sh.getRange(row, 33).setValue(discountData.tongGiamGia        || 0);
        sh.getRange(row, 34).setValue(discountData.tongCongThanhToan  || 0);
        sh.getRange(row, 35).setValue(discountData.kieuGiamGia        || 'phan_tram');
        sh.getRange(row, 36).setValue(discountData.giaTriGiamGia      || 0);
        sh.getRange(row, 37).setValue(discountData.giamGiaVAT         || 'sau_vat');
        sh.getRange(row, 38).setValue(discountData.maSoThue           || '');
        SpreadsheetApp.flush();
        return { success: true };
      }
    }
    return { success: false, msg: 'Không tìm thấy lệnh' };
  } catch(e) { return { success: false, msg: e.message }; }
}

// ─── CHỜ XUẤT KHO: XEM TỪNG VẬT TƯ THEO LỆNH ────────────
// Trả về danh sách chi tiết từng dòng vật tư chờ xuất
function getPendingExportDetails() {
  try {
    var ss      = SpreadsheetApp.getActiveSpreadsheet();
    var shM     = ss.getSheetByName('LenhSuaChua');
    var shVT    = ss.getSheetByName('VatTu');
    if (!shM || !shVT) return [];

    var masterVals = shM.getDataRange().getValues();
    var vtVals     = shVT.getDataRange().getValues();

    // Map lệnh
    var masterMap = {};
    for (var i = 1; i < masterVals.length; i++) {
      var ml = String(masterVals[i][0]).trim().toLowerCase();
      masterMap[ml] = {
        maLenh:        String(masterVals[i][0]),
        ngay:          safeParseDateString(masterVals[i][1], 'dateInput'),
        bienSoXe:      String(masterVals[i][3]),
        tenKhachHang:  String(masterVals[i][8]),
        trangThai:     String(masterVals[i][12])
      };
    }

    var results = [];
    for (var i = 1; i < vtVals.length; i++) {
      var ml     = String(vtVals[i][0]).trim().toLowerCase();
      var ttXuat = String(vtVals[i][8] || 'Chưa Xuất').trim();
      if (ttXuat === 'Đã Xuất') continue;
      var master = masterMap[ml];
      if (!master) continue;
      results.push({
        maLenh:       master.maLenh,
        ngay:         master.ngay,
        bienSoXe:     master.bienSoXe,
        tenKhachHang: master.tenKhachHang,
        trangThaiLenh:master.trangThai,
        stt:          Number(vtVals[i][1] || i),
        maVT:         String(vtVals[i][2]),
        tenVT:        String(vtVals[i][3]),
        donVi:        String(vtVals[i][4]),
        soLuong:      Number(vtVals[i][5] || 0),
        donGia:       Number(vtVals[i][6] || 0),
        vat:          String(vtVals[i][10] || '8')
      });
    }
    return results;
  } catch(e) { return []; }
}

// ─── THU HỒI VẬT TƯ ĐÃ XUẤT (Kho thu hồi) ──────────────
function revokePartExport(maLenh, maVT, stt) {
  try {
    var _chan = capQuyen_('kho.thuHoi'); if (_chan) return _chan;
    var ss     = SpreadsheetApp.getActiveSpreadsheet();
    var shVT   = ss.getSheetByName('VatTu');
    var shDM   = ss.getSheetByName('DanhMucVatTu');
    var shLog  = ss.getSheetByName('LichSuKho');
    if (!shVT || !shDM) return { success: false, msg: 'Không tìm thấy bảng' };

    var target  = String(maLenh).trim().toLowerCase();
    var targetVT= String(maVT).trim().toLowerCase();
    var vals    = shVT.getDataRange().getValues();
    var dmVals  = shDM.getDataRange().getValues();
    var user    = Session.getActiveUser().getEmail() || 'Admin';

    for (var i = 1; i < vals.length; i++) {
      var ml  = String(vals[i][0]).trim().toLowerCase();
      var mvt = String(vals[i][2]).trim().toLowerCase();
      var st  = Number(vals[i][1] || 0);
      if (ml === target && mvt === targetVT && (stt == null || st === Number(stt))) {
        var sl   = Number(vals[i][5] || 0);
        var dg   = Number(vals[i][6] || 0);
        var vat  = vals[i][10];
        // Cộng lại tồn kho
        for (var k = 1; k < dmVals.length; k++) {
          if (String(dmVals[k][0]).trim().toLowerCase() === targetVT) {
            shDM.getRange(k + 1, 5).setValue(Number(dmVals[k][4] || 0) + sl);
            break;
          }
        }
        // Reset trạng thái xuất
        shVT.getRange(i + 1, 9).setValue('Chưa Xuất');
        // Ghi log
        if (shLog) {
          shLog.appendRow([new Date(), 'Thu Hồi VT', maLenh, maVT, String(vals[i][3]),
                           sl, dg, '', user, 'Thu hồi vật tư đã xuất', vat]);
        }
        // Reset trạng thái tổng lệnh nếu cần
        var shM = ss.getSheetByName('LenhSuaChua');
        if (shM) {
          var mVals = shM.getDataRange().getValues();
          for (var j = 1; j < mVals.length; j++) {
            if (String(mVals[j][0]).trim().toLowerCase() === target) {
              shM.getRange(j + 1, 27).setValue('Chưa Xuất');
              break;
            }
          }
        }
        xoaCacheDanhMuc_();
    SpreadsheetApp.flush();
        return { success: true };
      }
    }
    return { success: false, msg: 'Không tìm thấy dòng vật tư' };
  } catch(e) { return { success: false, msg: e.message }; }
}

// ─── IN ẤN NHẬP KHO ──────────────────────────────────────
// Dữ liệu cho in phiếu nhập kho (backend cung cấp đủ)
// Frontend tự render HTML print từ getImportOrderDetails

// ─── IN ẤN BÁN LẺ ───────────────────────────────────────
// Frontend tự render HTML print từ getRetailOrderDetails

// ─── LẤY CHI TIẾT ĐƠN NHẬP KHO (ĐÃ CÓ, DÙNG LẠI) ─────
// getImportOrderDetails(maPhieu) → [{maVT,tenVT,...}]

// ─── LOCK: Nhập/Xuất/Bán lẻ đã hoàn thành không sửa ─────
// Hàm kiểm tra trạng thái trước khi save
function checkEditLock(loai, ma) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetMap = { import: 'PhieuNhapKho', retail: 'DonBanLe' };
    var sh = ss.getSheetByName(sheetMap[loai]);
    if (!sh) return { locked: false };
    var vals = sh.getDataRange().getValues();
    var target = String(ma).trim().toLowerCase();
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][0]).trim().toLowerCase() === target) {
        var tt = String(vals[i][5]).trim();
        var locked = (tt === 'Đã Nhập Kho' || tt === 'Đã Xuất Kho');
        return { locked: locked, trangThai: tt };
      }
    }
    return { locked: false };
  } catch(e) { return { locked: false }; }
}
// ============================================================
// BACKEND PATCH – Thêm vào code.js (Google Apps Script)
// Dán 2 hàm này vào CUỐI file code.js
// ============================================================

// ─── [FIX 4] Lấy danh sách NCC để auto-fill khi nhập kho ──
function getNccList() {
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DanhSachNCC');
    if (!sh) return [];
    var data = sh.getDataRange().getValues();
    var res = [];
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim()) {
        res.push({
          tenNCC: String(data[i][0]).trim(),
          sdt:    chuanSDT(data[i][1]),
          diaChi: String(data[i][2]).trim(),
          ghiChu: String(data[i][3]).trim()
        });
      }
    }
    return res;
  } catch(e) { return []; }
}

// ─── [FIX 6] Xóa lịch sử kho có kiểm tra mã bảo mật ──────
// DELETE_SECRET_CODE đã được khai báo ở trên trong code.js ('112233')
function deleteInventoryHistorySecure(maThamChieu, secretCode, confirmThuHoi) {
  try {
    var _chan = capQuyen_('kho.xoaLichSu'); if (_chan) return _chan;
    if (!xacThucMaBaoMat_(secretCode)) {
      return { success: false, msg: 'Mã bảo mật không đúng!' };
    }
    var _rate = kiemTraRateXoa_(); if (_rate) return _rate;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ref = String(maThamChieu).trim();

    // Xác định loại phiếu của giao dịch này
    var loaiPhieu = '';
    var shLog = ss.getSheetByName('LichSuKho');
    if (shLog) {
      var lv = shLog.getDataRange().getValues();
      for (var i = 1; i < lv.length; i++) {
        if (String(lv[i][2]).trim().toLowerCase() === ref.toLowerCase()) { loaiPhieu = String(lv[i][1]).trim(); break; }
      }
    }

    // Nếu là phiếu XUẤT KHO LỆNH SC và lệnh đã Hoàn Thành → yêu cầu hoàn trả + thu hồi
    if (loaiPhieu.indexOf('Xuất Kho Lệnh SC') >= 0) {
      var shM = ss.getSheetByName('LenhSuaChua');
      var rowLenh = -1, trangThai = '';
      if (shM) {
        var mv = shM.getDataRange().getValues();
        for (var i = 1; i < mv.length; i++) {
          if (String(mv[i][0]).trim().toLowerCase() === ref.toLowerCase()) {
            rowLenh = i + 1; trangThai = String(mv[i][12]).trim(); break;
          }
        }
      }
      if (rowLenh > 0 && trangThai === 'Hoàn Thành') {
        if (!confirmThuHoi) {
          // Chưa xác nhận → báo cho frontend hỏi người dùng
          return {
            success: false,
            needConfirm: true,
            msg: 'Lệnh ' + ref + ' đã HOÀN THÀNH. Để xóa lịch sử xuất kho, hệ thống sẽ hoàn trả trạng thái lệnh về "Đang Sửa Chữa" và thu hồi vật tư (đặt lại "Chưa Xuất"). Bạn có chắc chắn?'
          };
        }
        // Đã xác nhận → thu hồi vật tư + hạ trạng thái lệnh
        var shVT = ss.getSheetByName('VatTu');
        if (shVT) {
          var vtv = shVT.getDataRange().getValues();
          for (var i = 1; i < vtv.length; i++) {
            if (String(vtv[i][0]).trim().toLowerCase() === ref.toLowerCase()) {
              shVT.getRange(i + 1, 9).setValue('Chưa Xuất'); // cột 9 = Trạng Thái Xuất
            }
          }
        }
        shM.getRange(rowLenh, 13).setValue('Đang Sửa Chữa');  // cột 13 = Trạng Thái
        shM.getRange(rowLenh, 27).setValue('Chưa Xuất');       // cột 27 = Trạng Thái Xuất Kho
        ghiLog('Kho', 'Thu hồi vật tư & hoàn trả trạng thái lệnh (xóa lịch sử xuất kho)', ref);
      }
    }

    var kq = deleteInventoryHistory(maThamChieu);
    if (kq && kq.success) ghiLog('Xóa dữ liệu', 'Xóa lịch sử kho (' + (loaiPhieu || 'không rõ loại') + ')', ref);
    return kq;
  } catch(e) {
    return { success: false, msg: e.message };
  }
}



// ============ KHÁCH HÀNG (kèm nhật ký thay đổi) ============
// Lịch sử sửa chữa của 1 khách hàng (theo SĐT) — KHÔNG có thông tin tiền
function getCustomerRepairHistory(sdt) {
  if (!coQuyen_('khach.xem')) return [];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var shM = ss.getSheetByName('LenhSuaChua');
  if (!shM) return [];
  var key = chuanSDT(sdt);
  var mv = shM.getDataRange().getValues();

  // Gom chi tiết CV/VT theo mã lệnh
  var cvByLenh = {}, vtByLenh = {};
  var shCV = ss.getSheetByName('ChiTietCongViec');
  if (shCV) {
    var cvv = shCV.getDataRange().getValues();
    for (var i = 1; i < cvv.length; i++) {
      var ml = String(cvv[i][0]).trim();
      if (!ml) continue;
      if (!cvByLenh[ml]) cvByLenh[ml] = [];
      cvByLenh[ml].push(String(cvv[i][3] || '')); // mô tả công việc
    }
  }
  var shVT = ss.getSheetByName('VatTu');
  if (shVT) {
    var vtv = shVT.getDataRange().getValues();
    for (var i = 1; i < vtv.length; i++) {
      var ml = String(vtv[i][0]).trim();
      if (!ml) continue;
      if (!vtByLenh[ml]) vtByLenh[ml] = [];
      vtByLenh[ml].push({ tenVT: String(vtv[i][3] || ''), soLuong: Number(vtv[i][5] || 0), donVi: String(vtv[i][4] || '') });
    }
  }

  var out = [];
  for (var i = 1; i < mv.length; i++) {
    if (chuanSDT(mv[i][9]) !== key) continue;
    var ma = String(mv[i][0]).trim();
    var ttLenh = String(mv[i][12] || '').trim();
    // Giờ vào = ngày tiếp nhận (cột 1) + giờ tiếp nhận (cột 21)
    var vao = dinhDangNgayGio_(mv[i][1], mv[i][21]);
    // Giờ ra: nếu đã Hoàn Thành dùng Thời Gian Cập Nhật (cột 20); chưa xong thì hiện dự kiến
    var ra;
    if (ttLenh === 'Hoàn Thành') {
      ra = dinhDangNgayGio_(mv[i][20], '');
    } else {
      ra = dinhDangNgayGio_(mv[i][2], mv[i][22]);
      if (ra) ra = '(dự kiến) ' + ra;
    }
    out.push({
      maLenh:      ma,
      bienSo:      String(mv[i][3] || ''),
      soKm:        String(mv[i][7] || ''),
      ngayVao:     vao,
      ngayRa:      ra,
      trangThai:   ttLenh,
      ghiChuKH:    String(mv[i][36] || ''), // Ghi Chú KH
      congViec:    cvByLenh[ma] || [],
      vatTu:       vtByLenh[ma] || []
    });
  }
  // Mới nhất trước
  out.reverse();
  return out;
}

// Định dạng ngày + giờ an toàn (nhận cả Date object lẫn chuỗi).
function dinhDangNgayGio_(ngay, gio) {
  var tz = Session.getScriptTimeZone() || 'GMT+7';
  var ngayStr = '';
  if (ngay instanceof Date) {
    ngayStr = Utilities.formatDate(ngay, tz, 'dd/MM/yyyy');
  } else {
    ngayStr = String(ngay || '').trim();
    // Nếu là dạng yyyy-MM-dd thì đổi sang dd/MM/yyyy cho dễ đọc
    var m = ngayStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) ngayStr = m[3] + '/' + m[2] + '/' + m[1];
  }
  var gioStr = '';
  if (gio instanceof Date) {
    gioStr = Utilities.formatDate(gio, tz, 'HH:mm');
  } else {
    gioStr = String(gio || '').trim();
    // Nếu ngày đã chứa cả giờ (vd "21/06/2026 19:10") thì không thêm nữa
  }
  if (ngayStr && gioStr && ngayStr.indexOf(':') < 0) return ngayStr + ' ' + gioStr;
  return ngayStr || gioStr || '';
}

function getDanhSachKhachHang() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DanhSachKhachHang');
  if (!sh) return [];
  var vals = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    if (!String(vals[i][0]).trim()) continue;
    out.push({
      sdt:    chuanSDT(vals[i][0]),
      tenKH:  String(vals[i][1] || ''),
      cccd:   String(vals[i][2] || ''),
      diaChi: String(vals[i][3] || ''),
      nhatKy: String(vals[i][4] || '')
    });
  }
  return out;
}

function saveKhachHangMoi(data) {
  try {
    var _chan = capQuyen_('khach.luu'); if (_chan) return _chan;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('DanhSachKhachHang');
    if (!sh) return { success: false, msg: 'Không tìm thấy sheet DanhSachKhachHang' };
    var sdt = chuanSDT(data.sdt);
    if (!sdt || !String(data.tenKH || '').trim()) return { success: false, msg: 'Thiếu SĐT hoặc Tên khách hàng' };
    var sdtStore = "'" + sdt; // lưu dạng text giữ số 0 đầu

    var vals = sh.getDataRange().getValues();
    var rowIdx = -1;
    for (var i = 1; i < vals.length; i++) {
      if (chuanSDT(vals[i][0]) === sdt) { rowIdx = i + 1; break; }
    }
    var nowStr = new Date().toLocaleString('vi-VN');

    if (rowIdx > 0) {
      // Cập nhật: ghi log các trường thay đổi
      var old = vals[rowIdx - 1];
      var changes = [];
      if (String(old[1] || '') !== String(data.tenKH || ''))  changes.push('Tên: "' + (old[1]||'') + '" → "' + data.tenKH + '"');
      if (String(old[2] || '') !== String(data.cccd || ''))   changes.push('CCCD: "' + (old[2]||'') + '" → "' + data.cccd + '"');
      if (String(old[3] || '') !== String(data.diaChi || '')) changes.push('Địa chỉ: "' + (old[3]||'') + '" → "' + data.diaChi + '"');
      var nhatKyCu = String(old[4] || '');
      var nhatKyMoi = nhatKyCu;
      if (changes.length) {
        nhatKyMoi = '[' + nowStr + '] ' + changes.join('; ') + (nhatKyCu ? '\n' + nhatKyCu : '');
      }
      sh.getRange(rowIdx, 1, 1, 5).setValues([[sdtStore, data.tenKH, data.cccd || '', data.diaChi || '', nhatKyMoi]]);
      if (changes.length) ghiLog('Khách hàng', 'Cập nhật: ' + changes.join('; '), sdt);
      return { success: true, msg: changes.length ? 'Đã cập nhật & ghi nhật ký thay đổi!' : 'Đã lưu (không có thay đổi).' };
    } else {
      var nhatKyTao = '[' + nowStr + '] Tạo mới khách hàng';
      sh.appendRow([sdtStore, data.tenKH, data.cccd || '', data.diaChi || '', nhatKyTao]);
      ghiLog('Khách hàng', 'Tạo mới khách hàng', sdt);
      return { success: true, msg: 'Đã thêm khách hàng mới!' };
    }
  } catch (e) {
    return { success: false, msg: e.message };
  }
}

// ============ LOG HỆ THỐNG ============
function ghiLog(loai, hanhDong, doiTuong) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('LogHeThong');
    if (!sh) {
      sh = ss.insertSheet('LogHeThong');
      sh.appendRow(['Thời Gian', 'Loại', 'Hành Động', 'Đối Tượng', 'Người Thực Hiện']);
    }
    var user = 'Hệ thống';
    try { user = Session.getActiveUser().getEmail() || 'Hệ thống'; } catch (e) {}
    sh.appendRow([new Date().toLocaleString('vi-VN'), loai || '', hanhDong || '', doiTuong || '', user]);
  } catch (e) { /* không chặn luồng chính nếu log lỗi */ }
}

function getSystemLogs() {
  if (!coQuyen_('heThong.log')) return []; // thiếu quyền → trả rỗng, frontend không vỡ
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('LogHeThong');
  if (!sh) return [];
  var vals = sh.getDataRange().getValues();
  var out = [];
  for (var i = vals.length - 1; i >= 1; i--) { // mới nhất trước
    if (!String(vals[i][0]).trim()) continue;
    out.push({
      thoiGian:      String(vals[i][0] || ''),
      loai:          String(vals[i][1] || ''),
      hanhDong:      String(vals[i][2] || ''),
      doiTuong:      String(vals[i][3] || ''),
      nguoiThucHien: String(vals[i][4] || '')
    });
  }
  return out;
}

// ============ XÓA KHÁCH HÀNG (Admin/Quản lý, cần mã bảo mật) ============
function deleteKhachHangSecure(sdt, secretCode) {
  try {
    var _chan = capQuyen_('khach.xoa'); if (_chan) return _chan;
    if (!xacThucMaBaoMat_(secretCode)) {
      return { success: false, msg: 'Mã bảo mật không đúng!' };
    }
    var _rate = kiemTraRateXoa_(); if (_rate) return _rate;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('DanhSachKhachHang');
    if (!sh) return { success: false, msg: 'Không tìm thấy sheet khách hàng' };
    var key = chuanSDT(sdt);
    var vals = sh.getDataRange().getValues();
    for (var i = vals.length - 1; i >= 1; i--) {
      if (chuanSDT(vals[i][0]) === key) {
        sh.deleteRow(i + 1);
        ghiLog('Khách hàng', 'Xóa khách hàng', key);
        SpreadsheetApp.flush();
        return { success: true };
      }
    }
    return { success: false, msg: 'Không tìm thấy khách hàng ' + sdt };
  } catch (e) {
    return { success: false, msg: e.message };
  }
}

// =====================================================================
//  QUẢN LÝ NHÂN SỰ & PHÂN QUYỀN (chỉ Admin — qua heThong.congCu)
// =====================================================================

// ----- NHÂN SỰ -----
// Danh sách nhân sự cho dropdown (KTV, Cố vấn, map nhân viên).
// Dùng để LÀM MỚI sau khi thêm/sửa/xóa nhân viên mà không cần đăng nhập lại.
// Cùng logic phân loại với getInitialData để đồng bộ.
function getNhanSuLists() {
  var kq = { danhSachKTV: [], danhSachCoVan: [], nhanVien: {} };
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DanhSachNhanVien');
    if (!sh) return kq;
    var v = sh.getDataRange().getValues();
    for (var i = 1; i < v.length; i++) {
      var ten = String(v[i][1]).trim();
      var cd = String(v[i][2]).trim().toLowerCase();
      var tt = String(v[i][4] || '').trim().toLowerCase();
      if (ten && tt !== 'nghỉ việc') {
        if (cd.indexOf('cố vấn') >= 0 || cd.indexOf('cv') >= 0) kq.danhSachCoVan.push(ten);
        if (cd.indexOf('kỹ thuật') >= 0 || cd.indexOf('ktv') >= 0 || cd.indexOf('thợ') >= 0) kq.danhSachKTV.push(ten);
        kq.nhanVien[ten] = { sdt: String(v[i][3] || '').trim(), chucDanh: String(v[i][2]).trim() };
      }
    }
  } catch (e) {}
  return kq;
}

function getNhanVienList() {
  if (!coQuyen_('heThong.congCu')) return [];
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DanhSachNhanVien');
  if (!sh) return [];
  var vals = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    if (!String(vals[i][0]).trim() && !String(vals[i][1]).trim()) continue;
    out.push({
      maNV:      String(vals[i][0] || ''),
      hoTen:     String(vals[i][1] || ''),
      chucDanh:  String(vals[i][2] || ''),
      sdt:       chuanSDT(vals[i][3]),
      trangThai: String(vals[i][4] || 'Đang làm')
    });
  }
  return out;
}

function saveNhanVien(data) {
  try {
    var _chan = capQuyen_('heThong.congCu'); if (_chan) return _chan;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('DanhSachNhanVien');
    if (!sh) return { success: false, msg: 'Không tìm thấy sheet DanhSachNhanVien' };
    var maNV = String(data.maNV || '').trim();
    if (!maNV || !String(data.hoTen || '').trim()) return { success: false, msg: 'Thiếu Mã NV hoặc Họ tên' };
    var sdtStore = data.sdt ? ("'" + chuanSDT(data.sdt)) : '';
    var vals = sh.getDataRange().getValues();
    var rowIdx = -1;
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][0]).trim().toLowerCase() === maNV.toLowerCase()) { rowIdx = i + 1; break; }
    }
    var row = [maNV, data.hoTen, data.chucDanh || '', sdtStore, data.trangThai || 'Đang làm'];
    if (rowIdx > 0) {
      sh.getRange(rowIdx, 1, 1, 5).setValues([row]);
      ghiLog('Nhân sự', 'Cập nhật nhân viên: ' + data.hoTen + ' (' + (data.chucDanh||'') + ')', maNV);
    } else {
      sh.appendRow(row);
      ghiLog('Nhân sự', 'Thêm nhân viên: ' + data.hoTen, maNV);
    }
    SpreadsheetApp.flush();
    return { success: true };
  } catch (e) { return { success: false, msg: e.message }; }
}

function deleteNhanVien(maNV) {
  try {
    var _chan = capQuyen_('heThong.congCu'); if (_chan) return _chan;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('DanhSachNhanVien');
    if (!sh) return { success: false, msg: 'Không tìm thấy sheet' };
    var key = String(maNV).trim().toLowerCase();
    var vals = sh.getDataRange().getValues();
    for (var i = vals.length - 1; i >= 1; i--) {
      if (String(vals[i][0]).trim().toLowerCase() === key) {
        sh.deleteRow(i + 1);
        ghiLog('Nhân sự', 'Xóa nhân viên', maNV);
        SpreadsheetApp.flush();
        return { success: true };
      }
    }
    return { success: false, msg: 'Không tìm thấy nhân viên ' + maNV };
  } catch (e) { return { success: false, msg: e.message }; }
}

// ----- PHÂN QUYỀN -----
function getPhanQuyenList() {
  if (!coQuyen_('heThong.congCu')) return [];
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PhanQuyen');
  if (!sh) return [];
  var vals = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    if (!String(vals[i][0]).trim()) continue;
    out.push({
      email:     String(vals[i][0] || ''),
      hoTen:     String(vals[i][1] || ''),
      phanQuyen: String(vals[i][2] || ''),
      trangThai: String(vals[i][3] || 'Hoạt động'),
      coMaRieng: !!String(vals[i][4] || '').trim()  // chỉ báo đã đặt mã, không lộ mã
    });
  }
  return out;
}

function savePhanQuyen(data) {
  try {
    var _chan = capQuyen_('heThong.congCu'); if (_chan) return _chan;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('PhanQuyen');
    if (!sh) return { success: false, msg: 'Không tìm thấy sheet PhanQuyen' };
    var email = String(data.email || '').trim();
    if (!email || !String(data.phanQuyen || '').trim()) return { success: false, msg: 'Thiếu Email hoặc Phân quyền' };
    var vals = sh.getDataRange().getValues();
    var rowIdx = -1;
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][0]).trim().toLowerCase() === email.toLowerCase()) { rowIdx = i + 1; break; }
    }
    // Mã bảo mật: chỉ cập nhật khi người dùng nhập mới; để trống thì giữ mã cũ
    var maMoi = String(data.maBaoMat || '').trim();
    var maCu = rowIdx > 0 ? String(vals[rowIdx - 1][4] || '').trim() : '';
    var maLuu = maMoi || maCu;
    var maStore = maLuu ? ("'" + maLuu) : ''; // lưu text để giữ số 0 đầu nếu có
    var row = [email, data.hoTen || '', data.phanQuyen, data.trangThai || 'Hoạt động', maStore];
    if (rowIdx > 0) {
      sh.getRange(rowIdx, 1, 1, 5).setValues([row]);
      ghiLog('Phân quyền', 'Cập nhật quyền: ' + email + ' → ' + data.phanQuyen + (maMoi ? ' (đổi mã bảo mật)' : ''), email);
    } else {
      sh.appendRow(row);
      ghiLog('Phân quyền', 'Thêm người dùng: ' + email + ' (' + data.phanQuyen + ')', email);
    }
    SpreadsheetApp.flush();
    return { success: true };
  } catch (e) { return { success: false, msg: e.message }; }
}

function deletePhanQuyen(email) {
  try {
    var _chan = capQuyen_('heThong.congCu'); if (_chan) return _chan;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('PhanQuyen');
    if (!sh) return { success: false, msg: 'Không tìm thấy sheet' };
    // Không cho tự xóa chính mình (tránh khóa bản thân)
    if (String(email).trim().toLowerCase() === (emailHienTai_() || '').toLowerCase()) {
      return { success: false, msg: 'Không thể xóa quyền của chính bạn.' };
    }
    var key = String(email).trim().toLowerCase();
    var vals = sh.getDataRange().getValues();
    for (var i = vals.length - 1; i >= 1; i--) {
      if (String(vals[i][0]).trim().toLowerCase() === key) {
        sh.deleteRow(i + 1);
        ghiLog('Phân quyền', 'Xóa người dùng khỏi phân quyền', email);
        SpreadsheetApp.flush();
        return { success: true };
      }
    }
    return { success: false, msg: 'Không tìm thấy ' + email };
  } catch (e) { return { success: false, msg: e.message }; }
}

// =====================================================================
//  BÁO CÁO NÂNG CAO (giá trị thực tế cao)
// =====================================================================

// 1) DOANH THU THEO CỐ VẤN — trong 1 tháng
function getRevenueByAdvisor(month, year) {
  if (!coQuyen_('lenh.xem')) return [];
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('LenhSuaChua');
    if (!sh) return [];
    var vals = sh.getDataRange().getValues();
    var map = {}; // coVan -> { soLenh, doanhThu }
    for (var i = 1; i < vals.length; i++) {
      if (!vals[i][0]) continue;
      if (String(vals[i][12]).trim() !== 'Hoàn Thành') continue;
      var ngayTN = safeParseDateString(vals[i][1], 'dateInput');
      if (!ngayTN) continue;
      var p = ngayTN.split('-');
      if (p.length < 2 || parseInt(p[0]) !== year || parseInt(p[1]) !== month) continue;
      var cv = String(vals[i][25] || '').trim() || '(Chưa gán)';
      var tt = Number(vals[i][33] || 0);
      if (!map[cv]) map[cv] = { coVan: cv, soLenh: 0, doanhThu: 0 };
      map[cv].soLenh++;
      map[cv].doanhThu += tt;
    }
    var out = [];
    for (var k in map) out.push(map[k]);
    out.sort(function(a, b) { return b.doanhThu - a.doanhThu; });
    return out;
  } catch (e) { return []; }
}

// 2) TOP PHỤ TÙNG BÁN CHẠY — trong 1 tháng (theo số lượng dùng trong lệnh hoàn thành)
function getTopSpareParts(month, year, limit) {
  if (!coQuyen_('lenh.xem')) return [];
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var shM = ss.getSheetByName('LenhSuaChua');
    var shVT = ss.getSheetByName('VatTu');
    if (!shM || !shVT) return [];
    // Tập mã lệnh hoàn thành trong tháng
    var mv = shM.getDataRange().getValues();
    var lenhTrongThang = {};
    for (var i = 1; i < mv.length; i++) {
      if (!mv[i][0]) continue;
      if (String(mv[i][12]).trim() !== 'Hoàn Thành') continue;
      var ngayTN = safeParseDateString(mv[i][1], 'dateInput');
      if (!ngayTN) continue;
      var p = ngayTN.split('-');
      if (p.length >= 2 && parseInt(p[0]) === year && parseInt(p[1]) === month) {
        lenhTrongThang[String(mv[i][0]).trim().toLowerCase()] = true;
      }
    }
    // Gom vật tư
    var vtv = shVT.getDataRange().getValues();
    var map = {}; // maVT -> { maVT, tenVT, soLuong, doanhThu }
    for (var i = 1; i < vtv.length; i++) {
      var ml = String(vtv[i][0]).trim().toLowerCase();
      if (!lenhTrongThang[ml]) continue;
      var maVT = String(vtv[i][2] || '').trim();
      if (!maVT) continue;
      var sl = Number(vtv[i][5] || 0);
      var tt = Number(vtv[i][7] || 0) || sl * Number(vtv[i][6] || 0);
      if (!map[maVT]) map[maVT] = { maVT: maVT, tenVT: String(vtv[i][3] || ''), soLuong: 0, doanhThu: 0 };
      map[maVT].soLuong += sl;
      map[maVT].doanhThu += tt;
    }
    var out = [];
    for (var k in map) out.push(map[k]);
    out.sort(function(a, b) { return b.soLuong - a.soLuong; });
    return out.slice(0, limit || 10);
  } catch (e) { return []; }
}

// 3) BIÊN LỢI NHUẬN VẬT TƯ — so giá xuất (DanhMucVatTu) vs giá nhập gần nhất (ChiTietPhieuNhap)
function getInventoryMargin() {
  if (!coQuyen_('kho.xemTonKho')) return [];
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var shVT = ss.getSheetByName('DanhMucVatTu');
    if (!shVT) return [];

    // Giá nhập gần nhất theo mã VT (duyệt ChiTietPhieuNhap từ dưới lên)
    var giaNhapMoiNhat = {};
    var shCT = ss.getSheetByName('ChiTietPhieuNhap');
    if (shCT) {
      var ctv = shCT.getDataRange().getValues();
      for (var i = ctv.length - 1; i >= 1; i--) {
        var maVT = String(ctv[i][2] || '').trim();
        if (maVT && giaNhapMoiNhat[maVT] === undefined) {
          giaNhapMoiNhat[maVT] = Number(ctv[i][6] || 0); // cột Giá Nhập
        }
      }
    }

    var vals = shVT.getDataRange().getValues();
    var out = [];
    for (var i = 1; i < vals.length; i++) {
      var maVT = String(vals[i][0]).trim();
      if (!maVT) continue;
      var giaXuat = Number(vals[i][3] || 0);
      var giaNhap = giaNhapMoiNhat[maVT];
      if (giaNhap === undefined) giaNhap = 0;
      var bien = giaXuat - giaNhap;
      var phanTram = giaNhap > 0 ? Math.round(bien / giaNhap * 1000) / 10 : 0;
      out.push({
        maVT: maVT, tenVT: String(vals[i][1] || ''),
        giaNhap: giaNhap, giaXuat: giaXuat,
        bienLoiNhuan: bien, phanTram: phanTram,
        tonKho: Number(vals[i][4] || 0),
        coGiaNhap: giaNhapMoiNhat[String(vals[i][0]).trim()] !== undefined
      });
    }
    // Sắp xếp biên lợi nhuận thấp nhất lên đầu (cảnh báo hàng lỗ/biên mỏng)
    out.sort(function(a, b) { return a.phanTram - b.phanTram; });
    return out;
  } catch (e) { return []; }
}

// 4) CẢNH BÁO TỒN KHO — danh sách vật tư hết / sắp hết (cho dashboard)
function getLowStockList() {
  if (!coQuyen_('kho.xemTonKho')) return { hetHang: [], sapHet: [] };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('DanhMucVatTu');
    if (!sh) return { hetHang: [], sapHet: [] };
    var vals = sh.getDataRange().getValues();
    var hetHang = [], sapHet = [];
    for (var i = 1; i < vals.length; i++) {
      if (!vals[i][0]) continue;
      var ton = Number(vals[i][4] || 0), min = Number(vals[i][5] || 0);
      var item = { maVT: String(vals[i][0]).trim(), tenVT: String(vals[i][1] || ''), tonKho: ton, tonMin: min, donVi: String(vals[i][2] || '') };
      if (ton <= 0) hetHang.push(item);
      else if (ton <= min) sapHet.push(item);
    }
    return { hetHang: hetHang, sapHet: sapHet };
  } catch (e) { return { hetHang: [], sapHet: [] }; }
}

// 5) NHẮC BẢO DƯỠNG ĐỊNH KỲ — xe đến hạn theo thời gian hoặc km
// Tiêu chí: lần sửa gần nhất cách > soThangNhac tháng, HOẶC km hiện tại đã tăng đáng kể.
function getMaintenanceReminders(soThangNhac) {
  if (!coQuyen_('khach.xem')) return [];
  try {
    var nhac = Number(soThangNhac || 4); // mặc định nhắc sau 4 tháng
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var shM = ss.getSheetByName('LenhSuaChua');
    if (!shM) return [];
    var vals = shM.getDataRange().getValues();
    // Lấy lần HOÀN THÀNH gần nhất của mỗi biển số
    var lastByXe = {}; // bienSo -> { ngay(Date), maLenh, tenKH, sdt, km }
    for (var i = 1; i < vals.length; i++) {
      if (!vals[i][0]) continue;
      if (String(vals[i][12]).trim() !== 'Hoàn Thành') continue;
      var bs = String(vals[i][3] || '').trim().toUpperCase();
      if (!bs) continue;
      var ngayStr = safeParseDateString(vals[i][1], 'dateInput');
      if (!ngayStr) continue;
      var d = new Date(ngayStr + 'T00:00:00');
      if (!lastByXe[bs] || d.getTime() > lastByXe[bs].ngay.getTime()) {
        lastByXe[bs] = { ngay: d, maLenh: String(vals[i][0]), tenKH: String(vals[i][8] || ''), sdt: chuanSDT(vals[i][9]), km: Number(vals[i][7] || 0) };
      }
    }
    var now = new Date();
    var nguong = nhac * 30 * 24 * 3600 * 1000; // ms
    var out = [];
    for (var bs in lastByXe) {
      var rec = lastByXe[bs];
      var cachNgay = now.getTime() - rec.ngay.getTime();
      if (cachNgay >= nguong) {
        out.push({
          bienSo: bs, tenKH: rec.tenKH, sdt: rec.sdt, km: rec.km,
          lanCuoi: Utilities.formatDate(rec.ngay, Session.getScriptTimeZone() || 'GMT+7', 'dd/MM/yyyy'),
          soNgayQua: Math.round(cachNgay / (24 * 3600 * 1000))
        });
      }
    }
    out.sort(function(a, b) { return b.soNgayQua - a.soNgayQua; });
    return out;
  } catch (e) { return []; }
}

// =====================================================================
//  MODULE THÔNG TIN XE (liên kết lịch sử sửa chữa)
// =====================================================================

// Danh sách tất cả xe + thống kê nhanh (số lần sửa, lần gần nhất, tổng chi tiêu)
function getDanhSachXe() {
  if (!coQuyen_('khach.xem')) return [];
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var shXe = ss.getSheetByName('DanhSachXe');
    if (!shXe) return [];

    // Thống kê từ LenhSuaChua theo biển số
    var stat = {}; // bienSo(UPPER) -> { soLan, lanGanNhat(Date), tongChi, tenKH, sdt }
    var shM = ss.getSheetByName('LenhSuaChua');
    if (shM) {
      var mv = shM.getDataRange().getValues();
      for (var i = 1; i < mv.length; i++) {
        if (!mv[i][0]) continue;
        var bs = String(mv[i][3] || '').trim().toUpperCase();
        if (!bs) continue;
        if (!stat[bs]) stat[bs] = { soLan: 0, lanGanNhat: null, tongChi: 0, tenKH: '', sdt: '' };
        stat[bs].soLan++;
        stat[bs].tenKH = String(mv[i][8] || '') || stat[bs].tenKH;
        stat[bs].sdt = chuanSDT(mv[i][9]) || stat[bs].sdt;
        if (String(mv[i][12]).trim() === 'Hoàn Thành') stat[bs].tongChi += Number(mv[i][33] || 0);
        var ngayStr = safeParseDateString(mv[i][1], 'dateInput');
        if (ngayStr) {
          var d = new Date(ngayStr + 'T00:00:00');
          if (!stat[bs].lanGanNhat || d.getTime() > stat[bs].lanGanNhat.getTime()) stat[bs].lanGanNhat = d;
        }
      }
    }

    var vals = shXe.getDataRange().getValues();
    var tz = Session.getScriptTimeZone() || 'GMT+7';
    var out = [];
    for (var i = 1; i < vals.length; i++) {
      var bs = String(vals[i][0] || '').trim();
      if (!bs) continue;
      var s = stat[bs.toUpperCase()] || { soLan: 0, lanGanNhat: null, tongChi: 0, tenKH: '', sdt: '' };
      out.push({
        bienSo: bs, vin: String(vals[i][1] || ''), hangXe: String(vals[i][2] || ''),
        model: String(vals[i][3] || ''), loaiXe: String(vals[i][4] || ''), namSX: String(vals[i][5] || ''),
        soKmCuoi: Number(vals[i][6] || 0), soMay: String(vals[i][7] || ''), mauSac: String(vals[i][8] || ''),
        soLanSua: s.soLan, tongChiTieu: s.tongChi,
        tenKH: s.tenKH, sdt: s.sdt,
        lanGanNhat: s.lanGanNhat ? Utilities.formatDate(s.lanGanNhat, tz, 'dd/MM/yyyy') : ''
      });
    }
    // Sắp xếp theo lần sửa gần nhất (mới nhất trước) — xe chưa sửa xuống cuối
    out.sort(function(a, b) {
      if (!a.lanGanNhat) return 1;
      if (!b.lanGanNhat) return -1;
      return 0;
    });
    return out;
  } catch (e) { return []; }
}

// Chi tiết 1 xe theo biển số + toàn bộ lịch sử sửa chữa (không tiền chi tiết, có tổng thanh toán)
function getXeDetail(bienSo) {
  if (!coQuyen_('khach.xem')) return null;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var key = String(bienSo || '').trim().toUpperCase();
    if (!key) return null;

    // Thông tin xe
    var info = null;
    var shXe = ss.getSheetByName('DanhSachXe');
    if (shXe) {
      var xv = shXe.getDataRange().getValues();
      for (var i = 1; i < xv.length; i++) {
        if (String(xv[i][0]).trim().toUpperCase() === key) {
          info = {
            bienSo: String(xv[i][0] || ''), vin: String(xv[i][1] || ''), hangXe: String(xv[i][2] || ''),
            model: String(xv[i][3] || ''), loaiXe: String(xv[i][4] || ''), namSX: String(xv[i][5] || ''),
            soKmCuoi: Number(xv[i][6] || 0), soMay: String(xv[i][7] || ''), mauSac: String(xv[i][8] || '')
          };
          break;
        }
      }
    }
    if (!info) info = { bienSo: bienSo, vin: '', hangXe: '', model: '', loaiXe: '', namSX: '', soKmCuoi: 0, soMay: '', mauSac: '' };

    // Gom chi tiết CV/VT theo mã lệnh
    var cvByLenh = {}, vtByLenh = {};
    var shCV = ss.getSheetByName('ChiTietCongViec');
    if (shCV) {
      var cvv = shCV.getDataRange().getValues();
      for (var i = 1; i < cvv.length; i++) {
        var ml = String(cvv[i][0]).trim();
        if (!ml) continue;
        if (!cvByLenh[ml]) cvByLenh[ml] = [];
        cvByLenh[ml].push(String(cvv[i][3] || ''));
      }
    }
    var shVT = ss.getSheetByName('VatTu');
    if (shVT) {
      var vtv = shVT.getDataRange().getValues();
      for (var i = 1; i < vtv.length; i++) {
        var ml = String(vtv[i][0]).trim();
        if (!ml) continue;
        if (!vtByLenh[ml]) vtByLenh[ml] = [];
        vtByLenh[ml].push({ tenVT: String(vtv[i][3] || ''), soLuong: Number(vtv[i][5] || 0), donVi: String(vtv[i][4] || '') });
      }
    }

    // Lịch sử lệnh của xe
    var lichSu = [];
    var shM = ss.getSheetByName('LenhSuaChua');
    if (shM) {
      var mv = shM.getDataRange().getValues();
      for (var i = 1; i < mv.length; i++) {
        if (String(mv[i][3] || '').trim().toUpperCase() !== key) continue;
        var ma = String(mv[i][0]).trim();
        var tt = String(mv[i][12] || '').trim();
        var vao = dinhDangNgayGio_(mv[i][1], mv[i][21]);
        var ra = (tt === 'Hoàn Thành') ? dinhDangNgayGio_(mv[i][20], '') : '';
        lichSu.push({
          maLenh: ma, soKm: String(mv[i][7] || ''), trangThai: tt,
          ngayVao: vao, ngayRa: ra,
          tenKH: String(mv[i][8] || ''), sdt: chuanSDT(mv[i][9]),
          thanhToan: (tt === 'Hoàn Thành') ? Number(mv[i][33] || 0) : 0,
          ghiChuKH: String(mv[i][36] || ''),
          congViec: cvByLenh[ma] || [],
          vatTu: vtByLenh[ma] || []
        });
      }
    }
    lichSu.reverse(); // mới nhất trước
    return { info: info, lichSu: lichSu };
  } catch (e) { return null; }
}

// =====================================================================
//  NẠP DỮ LIỆU LỆNH HÀNG LOẠT (từ file Excel) — chỉ Admin
//  Mỗi lệnh: { ngay, bks, tenKH, dongXe, km, giamGia, congViec:[{moTa,sl,donGia}], vatTu:[{maVT,tenVT,dvt,sl,donGia}] }
//  Tự thêm xe & khách mới. Lệnh nạp vào ở trạng thái "Hoàn Thành".
// =====================================================================
function napLenhHangLoat(danhSachLenh, batDauTuMa) {
  var _chan = capQuyen_('heThong.congCu'); if (_chan) return _chan;
  try {
    if (!danhSachLenh || !danhSachLenh.length) return { success: false, msg: 'Không có dữ liệu để nạp.' };
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var shM = ss.getSheetByName('LenhSuaChua');
    var shCV = ss.getSheetByName('ChiTietCongViec');
    var shVT = ss.getSheetByName('VatTu');
    var shXe = ss.getSheetByName('DanhSachXe');
    var shKH = ss.getSheetByName('DanhSachKhachHang');
    if (!shM || !shCV || !shVT) return { success: false, msg: 'Thiếu sheet hệ thống. Chạy chuanHoaHeThong() trước.' };

    // Tập biển số & SĐT đã có (để thêm mới)
    var xeCo = {};
    if (shXe) { var xv = shXe.getDataRange().getValues(); for (var i = 1; i < xv.length; i++) xeCo[String(xv[i][0]).trim().toUpperCase()] = true; }
    var khCo = {};
    if (shKH) { var kv = shKH.getDataRange().getValues(); for (var i = 1; i < kv.length; i++) khCo[chuanSDT(kv[i][0])] = true; }

    // Mã lệnh đã tồn tại + bộ đếm theo tháng (mã = RO + yyyyMM + 001 tăng dần)
    var maCo = {};
    var demTheoThang = {}; // 'RO202507' -> số lớn nhất đã dùng
    var mv = shM.getDataRange().getValues();
    for (var i = 1; i < mv.length; i++) {
      var ma0 = String(mv[i][0] || '').trim();
      if (!ma0) continue;
      maCo[ma0] = true;
      var mm = ma0.match(/^(RO\d{6})(\d{3})$/i);
      if (mm) {
        var pre = mm[1].toUpperCase(), num = parseInt(mm[2], 10);
        if (!demTheoThang[pre] || num > demTheoThang[pre]) demTheoThang[pre] = num;
      }
    }

    var rowsM = [], rowsCV = [], rowsVT = [], rowsXe = [], rowsKH = [];
    var soLenh = 0, soXeMoi = 0, soKHMoi = 0;
    var now = new Date();

    for (var k = 0; k < danhSachLenh.length; k++) {
      var L = danhSachLenh[k];
      var bks = String(L.bks || '').trim().toUpperCase();
      if (!bks) continue;
      var sdt = chuanSDT(L.sdt || '');
      var tenKH = String(L.tenKH || '').trim();
      var km = parseInt(String(L.km || '').replace(/[^0-9]/g, '')) || 0; // "10K" -> 10
      if (/k$/i.test(String(L.km || ''))) km = km * 1000; // 10K -> 10000

      var ngay = L.ngay || ''; // yyyy-MM-dd (ngày vào)

      // Mã lệnh = RO + năm + tháng (của ngày vào) + số thứ tự 001, tăng dần theo tháng
      var ym = String(ngay).match(/^(\d{4})-(\d{2})/);
      var prefix = ym ? ('RO' + ym[1] + ym[2]) : ('RO' + Utilities.formatDate(now, Session.getScriptTimeZone() || 'GMT+7', 'yyyyMM'));
      demTheoThang[prefix] = (demTheoThang[prefix] || 0) + 1;
      var maLenh = prefix + ('00' + demTheoThang[prefix]).slice(-3);
      while (maCo[maLenh]) { // an toàn nếu vẫn trùng
        demTheoThang[prefix]++;
        maLenh = prefix + ('00' + demTheoThang[prefix]).slice(-3);
      }
      maCo[maLenh] = true;

      // Tiền công & vật tư (gốc, CHƯA thuế = "Thành tiền" trong file) + thuế thật từng dòng
      var tongCong = 0, tongVT = 0, tongThue = 0;
      var cvList = L.congViec || [], vtList = L.vatTu || [];
      for (var a = 0; a < cvList.length; a++) {
        var tienCV = Number(cvList[a].thanhTien || (Number(cvList[a].sl || 1) * Number(cvList[a].donGia || 0)));
        tongCong += tienCV;
        tongThue += Number(cvList[a].thue || 0);
      }
      for (var b = 0; b < vtList.length; b++) {
        var tienVT = Number(vtList[b].thanhTien || (Number(vtList[b].sl || 1) * Number(vtList[b].donGia || 0)));
        tongVT += tienVT;
        tongThue += Number(vtList[b].thue || 0);
      }
      var giamGia = Number(L.giamGia || 0);
      var baseTotal = tongCong + tongVT; // chưa thuế, chưa giảm

      // Thanh toán = cột "Tổng" trong file (đã có thuế). Nếu thiếu thì tính từ thuế từng dòng.
      var thanhToan = Number(L.tongThu || 0);
      var vat = tongThue; // tổng thuế = cộng thuế từng dòng (đã đúng theo file)
      if (thanhToan <= 0) {
        thanhToan = baseTotal + vat - giamGia;
      }

      // Ghi master (38 cột) — trạng thái Hoàn Thành; ngày ra = ngày vào
      var rD = new Array(38).fill('');
      rD[0] = maLenh; rD[1] = ngay; rD[2] = ngay; rD[3] = bks;
      rD[4] = ''; rD[5] = 'MG'; rD[6] = ''; rD[7] = km; rD[8] = tenKH;
      rD[9] = sdt ? ("'" + sdt) : ''; rD[10] = 'Nạp từ Excel'; rD[11] = ''; rD[12] = 'Hoàn Thành';
      rD[13] = tongCong; rD[14] = tongVT; rD[15] = baseTotal; rD[16] = 'Nhập từ file tổng hợp';
      rD[17] = String(L.dongXe || ''); rD[18] = ''; rD[19] = String(L.vin || '');
      rD[20] = ngay; rD[21] = ''; rD[22] = ''; rD[23] = km;   // Thời gian cập nhật = ngày vào (ngày ra)
      rD[24] = ''; rD[25] = ''; rD[26] = 'Đã Xuất';
      rD[27] = 0; rD[28] = 0; rD[29] = 0; rD[30] = 0;
      rD[31] = vat; rD[32] = giamGia; rD[33] = thanhToan;
      rD[34] = ''; rD[35] = ''; rD[36] = ''; rD[37] = '[Nạp từ Excel] ' + now.toLocaleString('vi-VN');
      rowsM.push(rD);

      // Chi tiết công việc (VAT thật từng dòng)
      for (var a = 0; a < cvList.length; a++) {
        var cv = cvList[a];
        var tien = Number(cv.thanhTien || (Number(cv.sl || 1) * Number(cv.donGia || 0)));
        var vatCV = (cv.vat != null) ? Number(cv.vat) : 8;
        rowsCV.push([maLenh, a + 1, '', String(cv.moTa || 'Công dịch vụ'), Number(cv.sl || 1), Number(cv.donGia || 0), tien, '', 'Hoàn thành', vatCV, 0, 'tien']);
      }
      // Chi tiết vật tư (VAT thật từng dòng)
      for (var b = 0; b < vtList.length; b++) {
        var vt = vtList[b];
        var tien = Number(vt.thanhTien || (Number(vt.sl || 1) * Number(vt.donGia || 0)));
        var vatVT = (vt.vat != null) ? Number(vt.vat) : 8;
        rowsVT.push([maLenh, b + 1, String(vt.maVT || ''), String(vt.tenVT || ''), String(vt.dvt || ''), Number(vt.sl || 1), Number(vt.donGia || 0), tien, 'Đã Xuất', '', vatVT, 0, 'tien']);
      }

      // Thêm xe mới
      if (!xeCo[bks]) {
        xeCo[bks] = true; soXeMoi++;
        rowsXe.push([bks, String(L.vin || ''), 'MG', String(L.dongXe || ''), '', '', km, '', '']);
      }
      // Thêm khách mới (nếu có SĐT)
      if (sdt && !khCo[sdt]) {
        khCo[sdt] = true; soKHMoi++;
        rowsKH.push(["'" + sdt, tenKH, '', '', '[Nạp từ Excel]']);
      }
      soLenh++;
    }

    // Ghi hàng loạt (nhanh hơn append từng dòng)
    if (rowsM.length)  shM.getRange(shM.getLastRow() + 1, 1, rowsM.length, rowsM[0].length).setValues(rowsM);
    if (rowsCV.length) shCV.getRange(shCV.getLastRow() + 1, 1, rowsCV.length, rowsCV[0].length).setValues(rowsCV);
    if (rowsVT.length) shVT.getRange(shVT.getLastRow() + 1, 1, rowsVT.length, rowsVT[0].length).setValues(rowsVT);
    if (rowsXe.length && shXe) shXe.getRange(shXe.getLastRow() + 1, 1, rowsXe.length, rowsXe[0].length).setValues(rowsXe);
    if (rowsKH.length && shKH) shKH.getRange(shKH.getLastRow() + 1, 1, rowsKH.length, rowsKH[0].length).setValues(rowsKH);

    SpreadsheetApp.flush();
    ghiLog('Nạp dữ liệu', 'Nạp ' + soLenh + ' lệnh từ Excel (+' + soXeMoi + ' xe, +' + soKHMoi + ' KH)', 'Excel');
    return { success: true, soLenh: soLenh, soXeMoi: soXeMoi, soKHMoi: soKHMoi };
  } catch (e) {
    return { success: false, msg: e.message };
  }
}

// =====================================================================
//  BÁO CÁO THEO KHOẢNG THỜI GIAN + TỔNG HỢP THEO TUẦN
// =====================================================================

// Số tuần ISO trong năm (để gom theo tuần)
function tuanCuaNgay_(d) {
  var date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var dayNum = (date.getDay() + 6) % 7; // T2=0..CN=6
  date.setDate(date.getDate() - dayNum + 3);
  var firstThursday = new Date(date.getFullYear(), 0, 4);
  var diff = date - firstThursday;
  return 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
}

// Đầu tuần (thứ 2) của 1 ngày, trả 'yyyy-MM-dd'
function dauTuan_(d) {
  var date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var dayNum = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - dayNum);
  return Utilities.formatDate(date, Session.getScriptTimeZone() || 'GMT+7', 'dd/MM/yyyy');
}

// Báo cáo tổng hợp theo khoảng thời gian (tuNgay, denNgay dạng 'yyyy-MM-dd')
function getReportByRange(tuNgay, denNgay) {
  if (!coQuyen_('lenh.xem')) return { success: false, msg: 'Không có quyền xem báo cáo.' };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var shM = ss.getSheetByName('LenhSuaChua');
    if (!shM) return { success: false, msg: 'Không có dữ liệu.' };

    var tu = tuNgay ? new Date(tuNgay + 'T00:00:00') : new Date(2000, 0, 1);
    var den = denNgay ? new Date(denNgay + 'T23:59:59') : new Date(2100, 0, 1);

    // Gom chi tiết để tính tiền công/VT/giảm giá
    var congByLenh = {}, vtByLenh = {}, giamByLenh = {};
    var shCV = ss.getSheetByName('ChiTietCongViec');
    if (shCV) {
      var cvv = shCV.getDataRange().getValues();
      for (var i = 1; i < cvv.length; i++) {
        var ml = String(cvv[i][0]).trim().toLowerCase(); if (!ml) continue;
        var base = Number(cvv[i][4] || 0) * Number(cvv[i][5] || 0);
        congByLenh[ml] = (congByLenh[ml] || 0) + base;
        giamByLenh[ml] = (giamByLenh[ml] || 0) + giamTuChiTiet_(cvv[i][10], cvv[i][11], base, Number(cvv[i][9] || 0));
      }
    }
    var shVT = ss.getSheetByName('VatTu');
    if (shVT) {
      var vtv = shVT.getDataRange().getValues();
      for (var i = 1; i < vtv.length; i++) {
        var ml = String(vtv[i][0]).trim().toLowerCase(); if (!ml) continue;
        var baseVT = Number(vtv[i][5] || 0) * Number(vtv[i][6] || 0);
        vtByLenh[ml] = (vtByLenh[ml] || 0) + baseVT;
        giamByLenh[ml] = (giamByLenh[ml] || 0) + giamTuChiTiet_(vtv[i][11], vtv[i][12], baseVT, Number(vtv[i][10] || 0));
        // Top phụ tùng cần mã/tên
      }
    }

    var mv = shM.getDataRange().getValues();
    var chiTiet = [];           // danh sách lệnh
    var theoCoVan = {};         // doanh thu theo cố vấn
    var theoTuan = {};          // doanh thu theo tuần
    var tongDoanhThu = 0, tongGiam = 0, tongCongAll = 0, tongVTAll = 0, soLenh = 0;

    for (var i = 1; i < mv.length; i++) {
      if (!mv[i][0]) continue;
      if (String(mv[i][12]).trim() !== 'Hoàn Thành') continue;
      var ngayStr = safeParseDateString(mv[i][1], 'dateInput');
      if (!ngayStr) continue;
      var d = new Date(ngayStr + 'T12:00:00');
      if (d < tu || d > den) continue;

      var ma = String(mv[i][0]).trim().toLowerCase();
      var tienCong = Number(mv[i][13] || 0) || (congByLenh[ma] || 0);
      var tienVT = Number(mv[i][14] || 0) || (vtByLenh[ma] || 0);
      var giam = Number(mv[i][32] || 0) || (giamByLenh[ma] || 0);
      var thanhToan = Number(mv[i][33] || 0);

      chiTiet.push({
        maLenh: String(mv[i][0]), ngay: ngayStr, bienSo: String(mv[i][3] || ''),
        khachHang: String(mv[i][8] || ''), tienCong: tienCong, tienVT: tienVT,
        giamGia: giam, thanhToan: thanhToan, coVan: String(mv[i][25] || '(Chưa gán)')
      });

      tongDoanhThu += thanhToan; tongGiam += giam; tongCongAll += tienCong; tongVTAll += tienVT; soLenh++;

      var cvan = String(mv[i][25] || '').trim() || '(Chưa gán)';
      if (!theoCoVan[cvan]) theoCoVan[cvan] = { coVan: cvan, soLenh: 0, doanhThu: 0 };
      theoCoVan[cvan].soLenh++; theoCoVan[cvan].doanhThu += thanhToan;

      var tuanKey = dauTuan_(d);
      if (!theoTuan[tuanKey]) theoTuan[tuanKey] = { tuan: tuanKey, soLenh: 0, doanhThu: 0, _sort: d.getTime() };
      theoTuan[tuanKey].soLenh++; theoTuan[tuanKey].doanhThu += thanhToan;
    }

    // Top phụ tùng trong khoảng (lặp VatTu theo lệnh hợp lệ)
    var lenhHopLe = {};
    chiTiet.forEach(function(c) { lenhHopLe[c.maLenh.toLowerCase()] = true; });
    var topPart = {};
    if (shVT) {
      var vtv2 = shVT.getDataRange().getValues();
      for (var i = 1; i < vtv2.length; i++) {
        var ml = String(vtv2[i][0]).trim().toLowerCase();
        if (!lenhHopLe[ml]) continue;
        var maVT = String(vtv2[i][2] || '').trim(); if (!maVT) continue;
        var sl = Number(vtv2[i][5] || 0);
        var tt = Number(vtv2[i][7] || 0) || sl * Number(vtv2[i][6] || 0);
        if (!topPart[maVT]) topPart[maVT] = { maVT: maVT, tenVT: String(vtv2[i][3] || ''), soLuong: 0, doanhThu: 0 };
        topPart[maVT].soLuong += sl; topPart[maVT].doanhThu += tt;
      }
    }

    var coVanArr = []; for (var k in theoCoVan) coVanArr.push(theoCoVan[k]);
    coVanArr.sort(function(a, b) { return b.doanhThu - a.doanhThu; });
    var tuanArr = []; for (var k in theoTuan) tuanArr.push(theoTuan[k]);
    tuanArr.sort(function(a, b) { return a._sort - b._sort; });
    tuanArr.forEach(function(t) { delete t._sort; });
    var partArr = []; for (var k in topPart) partArr.push(topPart[k]);
    partArr.sort(function(a, b) { return b.soLuong - a.soLuong; });

    return {
      success: true,
      tuNgay: tuNgay, denNgay: denNgay,
      tongHop: { soLenh: soLenh, tongDoanhThu: tongDoanhThu, tongGiam: tongGiam, tongCong: tongCongAll, tongVT: tongVTAll },
      chiTiet: chiTiet,
      theoCoVan: coVanArr,
      theoTuan: tuanArr,
      topPhuTung: partArr.slice(0, 20)
    };
  } catch (e) {
    return { success: false, msg: e.message };
  }
}

// Tổng hợp theo tuần (8 tuần gần nhất) cho dashboard
function getWeeklySummary() {
  if (!coQuyen_('lenh.xem')) return { labels: [], data: [] };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var shM = ss.getSheetByName('LenhSuaChua');
    if (!shM) return { labels: [], data: [] };
    var now = new Date();
    // 8 tuần gần nhất
    var tuans = [];
    for (var w = 7; w >= 0; w--) {
      var d = new Date(now.getTime() - w * 7 * 24 * 3600 * 1000);
      var key = dauTuan_(d);
      tuans.push({ key: key, total: 0, count: 0 });
    }
    var idx = {}; tuans.forEach(function(t, i) { idx[t.key] = i; });

    var mv = shM.getDataRange().getValues();
    for (var i = 1; i < mv.length; i++) {
      if (!mv[i][0] || String(mv[i][12]).trim() !== 'Hoàn Thành') continue;
      var ngayStr = safeParseDateString(mv[i][1], 'dateInput');
      if (!ngayStr) continue;
      var d = new Date(ngayStr + 'T12:00:00');
      var key = dauTuan_(d);
      if (idx[key] !== undefined) {
        tuans[idx[key]].total += Number(mv[i][33] || 0);
        tuans[idx[key]].count++;
      }
    }
    return {
      labels: tuans.map(function(t) { return t.key.substring(0, 5); }), // dd/MM
      data: tuans.map(function(t) { return t.total; }),
      counts: tuans.map(function(t) { return t.count; })
    };
  } catch (e) { return { labels: [], data: [] }; }
}


// =====================================================================
//  BÁO CÁO XUẤT KHO THEO NGÀY + TỒN PHỤ TÙNG (V9)
//  Nguồn xuất kho: bảng VatTu (phụ tùng đã xuất theo lệnh) gắn ngày lệnh,
//  cộng ChiTietDonBanLe (bán lẻ). Nguồn nhập: ChiTietPhieuNhap + LichSuKho.
//  Tồn "ước tính tại thời điểm xuất" được suy ngược từ tồn kho hiện tại
//  (DanhMucVatTu) trừ đi các nhập sau đó, cộng lại các xuất sau đó.
// =====================================================================

// Gom mọi giao dịch kho (nhập +, xuất -) cho toàn bộ hoặc 1 mã VT.
// Trả mảng { maVT, tenVT, ngay:'yyyy-MM-dd', loai:'Xuất'|'Nhập', soLuong, thamChieu, _t (mốc sắp xếp) }
function _thuThapGiaoDichKho_(loMaVT) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var loc = loMaVT ? String(loMaVT).trim().toLowerCase() : null;
  var gd = [];

  // Map mã lệnh -> ngày tiếp nhận (cho xuất kho theo lệnh)
  var ngayLenh = {};
  var shM = ss.getSheetByName('LenhSuaChua');
  if (shM) {
    var mv = shM.getDataRange().getValues();
    for (var i = 1; i < mv.length; i++) {
      var ma = String(mv[i][0]).trim().toLowerCase(); if (!ma) continue;
      ngayLenh[ma] = safeParseDateString(mv[i][1], 'dateInput'); // yyyy-MM-dd
    }
  }

  // 1) XUẤT theo lệnh sửa chữa (bảng VatTu, chỉ tính "Đã Xuất")
  var shVT = ss.getSheetByName('VatTu');
  if (shVT) {
    var vt = shVT.getDataRange().getValues();
    for (var i = 1; i < vt.length; i++) {
      var maVT = String(vt[i][2] || '').trim(); if (!maVT) continue;
      if (loc && maVT.toLowerCase() !== loc) continue;
      if (String(vt[i][8] || '').trim() !== 'Đã Xuất') continue;
      var ml = String(vt[i][0]).trim().toLowerCase();
      var ngay = ngayLenh[ml] || '';
      if (!ngay) continue;
      var sl = Number(vt[i][5]) || 0; if (sl <= 0) continue;
      gd.push({ maVT: maVT, tenVT: String(vt[i][3] || ''), ngay: ngay, loai: 'Xuất', soLuong: sl, thamChieu: String(vt[i][0]), _t: ngay });
    }
  }

  // 2) XUẤT bán lẻ (ChiTietDonBanLe + DonBanLe lấy ngày)
  var ngayDon = {};
  var shDBL = ss.getSheetByName('DonBanLe');
  if (shDBL) {
    var dv = shDBL.getDataRange().getValues();
    for (var i = 1; i < dv.length; i++) {
      var md = String(dv[i][0]).trim().toLowerCase(); if (!md) continue;
      ngayDon[md] = safeParseDateString(dv[i][1], 'dateInput');
    }
  }
  var shCDBL = ss.getSheetByName('ChiTietDonBanLe');
  if (shCDBL) {
    var cv = shCDBL.getDataRange().getValues();
    for (var i = 1; i < cv.length; i++) {
      var maVT = String(cv[i][2] || '').trim(); if (!maVT) continue;
      if (loc && maVT.toLowerCase() !== loc) continue;
      var md = String(cv[i][0]).trim().toLowerCase();
      var ngay = ngayDon[md] || '';
      if (!ngay) continue;
      var sl = Number(cv[i][5]) || 0; if (sl <= 0) continue;
      gd.push({ maVT: maVT, tenVT: String(cv[i][3] || ''), ngay: ngay, loai: 'Xuất', soLuong: sl, thamChieu: String(cv[i][0]), _t: ngay });
    }
  }

  // 3) NHẬP theo phiếu nhập (ChiTietPhieuNhap + PhieuNhapKho lấy ngày)
  var ngayPhieu = {};
  var shPN = ss.getSheetByName('PhieuNhapKho');
  if (shPN) {
    var pv = shPN.getDataRange().getValues();
    for (var i = 1; i < pv.length; i++) {
      var mp = String(pv[i][0]).trim().toLowerCase(); if (!mp) continue;
      ngayPhieu[mp] = safeParseDateString(pv[i][1], 'dateInput');
    }
  }
  var shCPN = ss.getSheetByName('ChiTietPhieuNhap');
  if (shCPN) {
    var cp = shCPN.getDataRange().getValues();
    for (var i = 1; i < cp.length; i++) {
      var maVT = String(cp[i][2] || '').trim(); if (!maVT) continue;
      if (loc && maVT.toLowerCase() !== loc) continue;
      var mp = String(cp[i][0]).trim().toLowerCase();
      var ngay = ngayPhieu[mp] || '';
      if (!ngay) continue;
      var sl = Number(cp[i][5]) || 0; if (sl <= 0) continue;
      gd.push({ maVT: maVT, tenVT: String(cp[i][3] || ''), ngay: ngay, loai: 'Nhập', soLuong: sl, thamChieu: String(cp[i][0]), _t: ngay });
    }
  }

  // 4) LichSuKho: bổ sung nhập/xuất/thu hồi thủ công (không trùng nguồn trên)
  var shLK = ss.getSheetByName('LichSuKho');
  if (shLK) {
    var lk = shLK.getDataRange().getValues();
    for (var i = 1; i < lk.length; i++) {
      var maVT = String(lk[i][3] || '').trim(); if (!maVT) continue;
      if (loc && maVT.toLowerCase() !== loc) continue;
      var loaiPhieu = String(lk[i][1] || '').trim();
      var ref = String(lk[i][2] || '').trim().toLowerCase();
      // Bỏ qua nếu đã tính ở nguồn tài liệu (phiếu nhập/đơn/lệnh) để tránh đếm 2 lần
      if (ngayPhieu[ref] || ngayDon[ref] || ngayLenh[ref]) continue;
      var ngay = safeParseDateString(lk[i][0], 'dateInput');
      if (!ngay) continue;
      var sl = Number(lk[i][5]) || 0; if (sl <= 0) continue;
      var laNhap = /nhập/i.test(loaiPhieu);
      var laThuHoi = /thu hồi|thu hoi/i.test(loaiPhieu);
      // Thu hồi = trả lại kho → coi như nhập (+). Xuất → (-).
      var loai = (laNhap || laThuHoi) ? 'Nhập' : 'Xuất';
      gd.push({ maVT: maVT, tenVT: String(lk[i][4] || ''), ngay: ngay, loai: loai, soLuong: sl, thamChieu: String(lk[i][2]), _t: ngay });
    }
  }

  // Sắp xếp theo ngày tăng dần (cùng ngày: nhập trước, xuất sau — để tồn hợp lý)
  gd.sort(function (a, b) {
    if (a.ngay !== b.ngay) return a.ngay < b.ngay ? -1 : 1;
    if (a.loai !== b.loai) return a.loai === 'Nhập' ? -1 : 1;
    return 0;
  });
  return gd;
}

// Tồn kho hiện tại theo mã (từ DanhMucVatTu)
function _tonKhoHienTai_() {
  var map = {};
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DanhMucVatTu');
  if (!sh) return map;
  var d = sh.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) {
    var ma = String(d[i][0]).trim(); if (!ma) continue;
    map[ma.toLowerCase()] = {
      maVT: ma, tenVT: String(d[i][1] || ''), donVi: String(d[i][2] || 'Cái'),
      tonKho: Number(d[i][4]) || 0, tonMin: Number(d[i][5]) || 0
    };
  }
  return map;
}

// ─── TỔNG QUAN XUẤT KHO: biểu đồ xuất theo ngày + danh sách phụ tùng đã xuất ───
function getStockExportOverview(tuNgay, denNgay) {
  if (!coQuyen_('kho.xemTonKho')) return { success: false, msg: 'Không có quyền xem kho.' };
  try {
    var tu = tuNgay || '0000-00-00', den = denNgay || '9999-99-99';
    var gd = _thuThapGiaoDichKho_(null);
    var ton = _tonKhoHienTai_();

    var theoNgay = {};          // ngay -> tổng SL xuất
    var theoVT = {};            // maVT -> { tongXuat, soLan }
    var tongXuat = 0, soLuot = 0;

    for (var i = 0; i < gd.length; i++) {
      var g = gd[i];
      if (g.loai !== 'Xuất') continue;
      if (g.ngay < tu || g.ngay > den) continue;
      theoNgay[g.ngay] = (theoNgay[g.ngay] || 0) + g.soLuong;
      var k = g.maVT.toLowerCase();
      if (!theoVT[k]) theoVT[k] = { maVT: g.maVT, tenVT: g.tenVT, tongXuat: 0, soLan: 0 };
      theoVT[k].tongXuat += g.soLuong; theoVT[k].soLan++;
      tongXuat += g.soLuong; soLuot++;
    }

    // Chuỗi ngày liên tục (điền 0 cho ngày không xuất) để biểu đồ đẹp
    var ngayArr = Object.keys(theoNgay).sort();
    var labels = [], data = [];
    if (ngayArr.length) {
      var d0 = new Date(ngayArr[0] + 'T00:00:00');
      var d1 = new Date(ngayArr[ngayArr.length - 1] + 'T00:00:00');
      // Giới hạn tối đa 180 điểm để không quá dày
      var maxDays = 180;
      var soNgay = Math.round((d1 - d0) / 86400000) + 1;
      if (soNgay > maxDays) {
        // Gom theo tuần nếu khoảng quá dài
        var tuanMap = {};
        for (var key in theoNgay) {
          var dk = new Date(key + 'T00:00:00');
          var wk = dauTuan_(dk);
          tuanMap[wk] = (tuanMap[wk] || 0) + theoNgay[key];
        }
        var wkeys = Object.keys(tuanMap).sort(function (a, b) {
          return _ddmmyyyyToNum_(a) - _ddmmyyyyToNum_(b);
        });
        labels = wkeys; data = wkeys.map(function (w) { return tuanMap[w]; });
      } else {
        var cur = new Date(d0);
        for (var s = 0; s < soNgay; s++) {
          var key2 = Utilities.formatDate(cur, Session.getScriptTimeZone() || 'GMT+7', 'yyyy-MM-dd');
          labels.push(Utilities.formatDate(cur, Session.getScriptTimeZone() || 'GMT+7', 'dd/MM'));
          data.push(theoNgay[key2] || 0);
          cur.setDate(cur.getDate() + 1);
        }
      }
    }

    // Danh sách phụ tùng đã xuất (kèm tồn hiện tại) — sắp theo SL xuất giảm dần
    var dsVT = [];
    for (var kk in theoVT) {
      var t = ton[kk] || {};
      dsVT.push({
        maVT: theoVT[kk].maVT, tenVT: theoVT[kk].tenVT || (t.tenVT || ''),
        donVi: t.donVi || 'Cái', tongXuat: Math.round(theoVT[kk].tongXuat * 100) / 100,
        soLan: theoVT[kk].soLan, tonHienTai: t.tonKho || 0, tonMin: t.tonMin || 0
      });
    }
    dsVT.sort(function (a, b) { return b.tongXuat - a.tongXuat; });

    return {
      success: true, tuNgay: tuNgay, denNgay: denNgay,
      tongXuat: Math.round(tongXuat * 100) / 100, soLuot: soLuot, soPhuTung: dsVT.length,
      bieuDo: { labels: labels, data: data },
      danhSach: dsVT
    };
  } catch (e) { return { success: false, msg: e.message }; }
}

// Đổi 'dd/MM/yyyy' -> số để sắp xếp
function _ddmmyyyyToNum_(s) {
  var m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return 0;
  return Number(m[3] + m[2] + m[1]);
}

// ─── CHI TIẾT 1 PHỤ TÙNG: xuất theo ngày + tồn ước tính tại mỗi lần xuất ───
function getStockPartDetail(maVT, tuNgay, denNgay) {
  if (!coQuyen_('kho.xemTonKho')) return { success: false, msg: 'Không có quyền xem kho.' };
  try {
    if (!maVT) return { success: false, msg: 'Thiếu mã phụ tùng.' };
    var ton = _tonKhoHienTai_();
    var info = ton[String(maVT).trim().toLowerCase()] || { maVT: maVT, tenVT: '', donVi: 'Cái', tonKho: 0, tonMin: 0 };
    var gd = _thuThapGiaoDichKho_(maVT); // đã sắp theo ngày tăng dần

    // Suy ngược tồn theo thời gian: đi từ CUỐI về ĐẦU.
    // tonSau (sau giao dịch cuối) = tồn hiện tại. Với mỗi giao dịch đi lùi:
    //   tonTruoc = tonSau - (nhập? +sl : -sl)
    // => gán tonSauKhi cho từng giao dịch (tồn ngay sau khi giao dịch đó xảy ra).
    var tonSau = info.tonKho;
    for (var i = gd.length - 1; i >= 0; i--) {
      gd[i].tonSauKhi = Math.round(tonSau * 100) / 100;
      var delta = gd[i].loai === 'Nhập' ? gd[i].soLuong : -gd[i].soLuong;
      tonSau = tonSau - delta; // lùi về tồn trước giao dịch
    }
    // tonSau bây giờ = tồn ước tính TRƯỚC giao dịch đầu tiên (tồn đầu kỳ)

    // Lọc theo khoảng ngày cho hiển thị
    var tu = tuNgay || '0000-00-00', den = denNgay || '9999-99-99';
    var suKien = [], theoNgayXuat = {};
    var tongXuat = 0, tongNhap = 0;
    for (var j = 0; j < gd.length; j++) {
      var g = gd[j];
      if (g.ngay < tu || g.ngay > den) continue;
      suKien.push({
        ngay: g.ngay, loai: g.loai, soLuong: g.soLuong,
        thamChieu: g.thamChieu, tonSauKhi: g.tonSauKhi
      });
      if (g.loai === 'Xuất') { tongXuat += g.soLuong; theoNgayXuat[g.ngay] = (theoNgayXuat[g.ngay] || 0) + g.soLuong; }
      else tongNhap += g.soLuong;
    }

    // Biểu đồ: cột = SL xuất/ngày; đường = tồn cuối mỗi ngày (lấy tonSauKhi của giao dịch cuối trong ngày)
    var ngayCuoi = {}; // ngay -> tồn sau giao dịch cuối cùng trong ngày (trong khoảng)
    for (var s2 = 0; s2 < suKien.length; s2++) ngayCuoi[suKien[s2].ngay] = suKien[s2].tonSauKhi;
    var ngayArr = Object.keys(ngayCuoi).sort();
    var labels = [], slXuat = [], tonCuoi = [];
    for (var n = 0; n < ngayArr.length; n++) {
      var key = ngayArr[n];
      labels.push(key.slice(8, 10) + '/' + key.slice(5, 7)); // dd/MM
      slXuat.push(Math.round((theoNgayXuat[key] || 0) * 100) / 100);
      tonCuoi.push(ngayCuoi[key]);
    }

    // Sự kiện mới nhất lên đầu bảng
    suKien.reverse();

    return {
      success: true,
      maVT: info.maVT, tenVT: info.tenVT, donVi: info.donVi,
      tonHienTai: info.tonKho, tonMin: info.tonMin,
      tonDauKy: Math.round(tonSau * 100) / 100,
      tongXuat: Math.round(tongXuat * 100) / 100, tongNhap: Math.round(tongNhap * 100) / 100,
      bieuDo: { labels: labels, slXuat: slXuat, tonCuoi: tonCuoi },
      suKien: suKien
    };
  } catch (e) { return { success: false, msg: e.message }; }
}


// =====================================================================
//  NẠP DỮ LIỆU TỪ EXCEL NGAY TRÊN HỆ THỐNG (V9)
//  Frontend dùng SheetJS đọc file .xlsx thành { tenBang: [[...hàng...]] }
//  rồi gửi lên. Backend ghi đè từng bảng. CHỈ ADMIN được dùng.
//  Ngày/giờ đã được frontend chuyển sang chuỗi ISO / 'HH:mm' trước khi gửi.
// =====================================================================
function napToanBoDuLieu(payload) {
  var _chan = capQuyen_('heThong.congCu'); if (_chan) return _chan;
  try {
    if (!payload || !payload.sheets) return { success: false, msg: 'Không có dữ liệu để nạp.' };
    var sheets = payload.sheets;
    var che = payload.cheDo === 'thay' ? 'thay' : 'thay'; // hiện chỉ hỗ trợ "thay thế toàn bộ"
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Các bảng hợp lệ của hệ thống (bỏ qua bảng lạ như 'Trang tính1')
    var BANG_HOP_LE = {
      'PhanQuyen':1,'LenhSuaChua':1,'ChiTietCongViec':1,'VatTu':1,'LichSuSuaChua':1,
      'DanhSachKhachHang':1,'DanhSachXe':1,'DanhSachNCC':1,'DanhSachNhanVien':1,
      'DanhMucCongViec':1,'DanhMucVatTu':1,'LichSuKho':1,'DonBanLe':1,'ChiTietDonBanLe':1,
      'PhieuNhapKho':1,'ChiTietPhieuNhap':1,'LenhDaXoa':1,'LogHeThong':1
    };

    var ketQua = [];
    var tongDong = 0;
    for (var ten in sheets) {
      if (!BANG_HOP_LE[ten]) continue;
      var rows = sheets[ten] || [];
      if (!rows.length) continue;
      // Chuyển ô ngày ISO -> Date để backend xử lý đúng như dữ liệu gốc
      var data = [];
      for (var r = 0; r < rows.length; r++) {
        var line = [];
        for (var c = 0; c < rows[r].length; c++) {
          line.push(_phucHoiOData_(rows[r][c]));
        }
        data.push(line);
      }
      var sh = ss.getSheetByName(ten);
      if (!sh) sh = ss.insertSheet(ten);
      sh.clearContents();
      if (data.length && data[0].length) {
        sh.getRange(1, 1, data.length, data[0].length).setValues(_vuong_(data));
      }
      ketQua.push({ bang: ten, dong: Math.max(0, data.length - 1) });
      tongDong += Math.max(0, data.length - 1);
    }

    // Bảo đảm còn tài khoản admin dự phòng để không tự khóa mình ra ngoài
    _baoDamAdminDuPhong_();

    SpreadsheetApp.flush();
    xoaCacheDanhMuc_();
    ghiLog('Nạp dữ liệu', 'Nạp toàn bộ từ Excel: ' + ketQua.length + ' bảng, ' + tongDong + ' dòng', 'Excel');
    return { success: true, soBang: ketQua.length, tongDong: tongDong, chiTiet: ketQua };
  } catch (e) {
    return { success: false, msg: e.message };
  }
}

// Chuỗi ISO ngày (yyyy-MM-ddTHH:mm...) -> Date; còn lại giữ nguyên
function _phucHoiOData_(v) {
  if (v == null) return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
    var d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return v;
}

// Chuẩn hóa ma trận về cùng số cột (tránh lỗi setValues khi hàng lệch cột)
function _vuong_(data) {
  var maxC = 0;
  for (var i = 0; i < data.length; i++) if (data[i].length > maxC) maxC = data[i].length;
  for (var i = 0; i < data.length; i++) {
    while (data[i].length < maxC) data[i].push('');
  }
  return data;
}

// Luôn bảo đảm có tài khoản dự phòng admin@garage.local (không xóa tài khoản thật)
// để người dùng không bao giờ tự khóa mình ra ngoài khi nạp file thiếu admin.
function _baoDamAdminDuPhong_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('PhanQuyen');
  if (!sh) {
    sh = ss.insertSheet('PhanQuyen');
    sh.appendRow(['Email', 'Họ Tên', 'Phân Quyền', 'Trạng Thái', 'Mã Bảo Mật']);
  }
  var d = sh.getDataRange().getValues();
  var coDuPhong = false;
  for (var i = 1; i < d.length; i++) {
    if (String(d[i][0]).trim().toLowerCase() === 'admin@garage.local') { coDuPhong = true; break; }
  }
  if (!coDuPhong) {
    sh.appendRow(['admin@garage.local', 'Quản trị viên (dự phòng)', 'Admin', 'Hoạt động', '112233']);
  }
}
