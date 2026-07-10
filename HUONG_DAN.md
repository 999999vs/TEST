# GARAGE PRO — BẢN CHẠY NỘI BỘ (LAN)

Phần mềm quản lý gara ô tô chạy trên máy tính của bạn, các máy khác trong gara
truy cập qua trình duyệt trong mạng nội bộ. **Không cần Internet, không cần
Google, không cần cài thêm gói nào** — dữ liệu nằm hoàn toàn trên máy chủ của bạn.

---

## 1. Yêu cầu

- 1 máy tính làm **máy chủ** (Windows / macOS / Linux đều được) có cài **Node.js**
  phiên bản 14 trở lên. Tải tại: https://nodejs.org (chọn bản LTS, bấm Next liên tục).
- Các máy khác chỉ cần **trình duyệt** (Chrome, Edge, Firefox...) và cùng mạng
  LAN/WiFi với máy chủ.

## 2. Cài đặt & khởi động

1. Giải nén thư mục `garage-pro-lan` vào ổ đĩa máy chủ (ví dụ `D:\garage-pro-lan`).
2. **Windows**: nhấp đúp file `start.bat`.
   **macOS / Linux**: mở Terminal trong thư mục, chạy `./start.sh` (hoặc `node server.js`).
3. Cửa sổ đen hiện ra thông báo, ví dụ:

   ```
   Mở trên máy này    :  http://localhost:8080
   Máy khác trong LAN :  http://192.168.1.10:8080
   ```

4. Trên máy chủ: mở trình duyệt vào `http://localhost:8080`.
   Trên máy khác trong gara: gõ địa chỉ `http://192.168.1.10:8080` (thay bằng IP
   máy chủ hiển thị ở bước 3).

> Giữ cửa sổ đen mở trong lúc làm việc. Đóng cửa sổ = tắt máy chủ (dữ liệu đã
> được lưu tự động, không mất gì).

## 3. Đăng nhập lần đầu

| Email | Mã đăng nhập |
|---|---|
| `admin@garage.local` | `112233` |

Sau khi vào, hãy vào phần **Phân quyền / Nhân sự** để:
- Đổi mã đăng nhập của tài khoản quản trị.
- Tạo tài khoản cho cố vấn dịch vụ, thủ kho, quản lý (mỗi người 1 email bất kỳ
  + mã PIN riêng — email chỉ là tên đăng nhập, không cần email thật).

Vai trò và quyền hạn giữ nguyên như bản Google Sheets:
**Admin** (toàn quyền) · **Quản lý** · **Thủ kho** · **Cố vấn** (không xóa lệnh, chỉ xem tồn kho).

## 4. Nạp dữ liệu từ Google Sheets sang

Nếu bạn đang có dữ liệu trên Google Sheets (bản Apps Script cũ):

1. Mở Google Sheets → **Tệp → Tải xuống → Microsoft Excel (.xlsx)**.
2. Chép file vừa tải vào thư mục cài đặt (cạnh `server.js`).
3. **Tắt máy chủ** nếu đang chạy (đóng cửa sổ đen).
4. Mở Command Prompt/Terminal trong thư mục cài đặt, chạy:

   ```
   node nap-du-lieu.js Drive.xlsx
   ```
   (thay `Drive.xlsx` bằng tên file của bạn)

5. Khởi động lại máy chủ. Xong!

Công cụ tự sao lưu dữ liệu cũ vào `data/backups/` trước khi ghi đè, chuyển
đúng kiểu ngày/giờ về múi giờ Việt Nam, giữ số 0 đầu của số điện thoại và cắt
các dòng trống thừa. Tài khoản trong bảng **PhanQuyen** trên Sheets được giữ
nguyên — mọi người đăng nhập bằng email + mã cũ như trước; tài khoản dự phòng
`admin@garage.local` luôn được tự thêm nếu thiếu.

## 5. Dữ liệu & sao lưu

- Toàn bộ dữ liệu nằm trong file: `data/garage-data.json`.
- Mỗi lần khởi động máy chủ, hệ thống tự sao lưu vào `data/backups/`
  (giữ 60 bản gần nhất).
- **Muốn sao lưu thủ công**: chỉ cần copy thư mục `data/` sang USB/ổ khác.
- **Khôi phục**: chép file sao lưu đè lên `data/garage-data.json` rồi khởi động lại.
- Báo cáo vẫn xuất được ra Excel (.xlsx) ngay trong ứng dụng như trước.

## 6. Đổi cổng (nếu 8080 bị chiếm)

Windows: sửa file `start.bat`, thêm dòng `set PORT=9090` trước dòng `node server.js`.
macOS/Linux: chạy `PORT=9090 node server.js`.

## 7. Mở tường lửa Windows (nếu máy khác không vào được)

Lần đầu chạy, Windows sẽ hỏi "Allow access" → chọn **Allow** cho Private networks.
Nếu lỡ bấm Cancel: vào *Windows Security → Firewall → Allow an app*, thêm
`Node.js` hoặc mở cổng 8080 (inbound rule, TCP).

## 8. Cài như ứng dụng desktop (tùy chọn)

Mở trang trong Chrome/Edge → biểu tượng **Cài đặt ứng dụng** trên thanh địa chỉ
(hoặc menu ⋮ → *Cast, save and share → Install page as app*). Ứng dụng sẽ có icon
riêng, cửa sổ riêng như phần mềm desktop thật.

## 9. Chạy tự động khi bật máy (tùy chọn, Windows)

Nhấn `Win+R` → gõ `shell:startup` → Enter → kéo **shortcut** của `start.bat` vào
thư mục vừa mở. Máy chủ sẽ tự chạy mỗi lần bật máy.

## 10. Cấu trúc thư mục

```
garage-pro-lan/
├─ server.js        ← máy chủ HTTP nội bộ
├─ gas-shim.js      ← lớp giả lập Google Apps Script (lưu dữ liệu JSON)
├─ code.js          ← toàn bộ nghiệp vụ backend (GIỮ NGUYÊN bản gốc)
├─ Index.html       ← giao diện (GIỮ NGUYÊN bản gốc, được vá tự động khi phục vụ)
├─ vendor/          ← Chart.js, SheetJS, Font Awesome (chạy offline)
├─ data/
│  ├─ garage-data.json   ← CƠ SỞ DỮ LIỆU — nhớ sao lưu!
│  └─ backups/           ← sao lưu tự động
├─ start.bat / start.sh
└─ HUONG_DAN.md
```

Vì `code.js` và `Index.html` được giữ nguyên bản, mọi chỉnh sửa nghiệp vụ sau này
bạn chỉ cần thay 2 file đó rồi khởi động lại máy chủ.

## 11. Lưu ý an toàn

- Phần mềm dùng cơ chế xác thực email + mã PIN như bản gốc, phù hợp mạng nội bộ
  tin cậy của gara. **Không** mở cổng ra Internet công cộng.
- Mã dự phòng hệ thống (dùng khi xóa lệnh, trả lệnh...) nằm trong `code.js`,
  biến `DELETE_SECRET_CODE` (mặc định `112233`) — nên đổi.

## 12. Tính năng "Xuất Kho & Tồn" (mới)

Mục **Xuất Kho & Tồn** trên thanh menh trái cho phép:
- Xem **biểu đồ số lượng xuất kho theo ngày** cho toàn bộ phụ tùng trong khoảng thời gian chọn (tự gom theo tuần nếu khoảng quá dài).
- Danh sách phụ tùng đã xuất, sắp theo số lượng xuất nhiều nhất, kèm tồn kho hiện tại (đánh dấu đỏ nếu dưới mức tồn tối thiểu).
- Bấm vào một phụ tùng để xem **biểu đồ kép**: cột = số lượng xuất mỗi ngày, đường = lượng tồn còn lại sau mỗi giao dịch; kèm bảng liệt kê từng lần xuất/nhập với tồn ước tính tại thời điểm đó.
- Nút **Xuất Excel** để tải toàn bộ số liệu ra file.

Nguồn dữ liệu xuất kho: phụ tùng đã xuất theo lệnh sửa chữa + đơn bán lẻ. Lượng tồn theo thời gian được suy ngược từ tồn kho hiện tại và các giao dịch nhập/xuất đã ghi nhận, nên là con số **ước tính** — chính xác nhất ở các mốc gần hiện tại.

## 13. Nạp dữ liệu ngay trên hệ thống (không cần dòng lệnh)

Ngoài công cụ `nap-du-lieu.js` chạy bằng dòng lệnh, giờ bạn có thể nạp ngay trong ứng dụng:

1. Đăng nhập bằng tài khoản **Admin**.
2. Vào **Công Cụ Quản Lý → Nạp toàn bộ dữ liệu (khôi phục từ Google Sheets)**.
3. Chọn file Excel xuất từ Google Sheets, xem thông tin các bảng đọc được, rồi bấm **Thay thế toàn bộ & nạp**.
4. Hệ thống tự sao lưu dữ liệu cũ, ghi đè, rồi tải lại trang.

Sau khi nạp, đăng nhập bằng tài khoản trong bảng PhanQuyen của file. Tài khoản dự phòng **admin@garage.local / 112233** luôn được giữ để bạn không bị khóa ngoài dù file không có admin.

## 14. Kiến trúc "tách dần" khỏi Apps Script (dành cho kỹ thuật)

Hệ thống đang chuyển dần từ khối `code.js` (viết cho Google Apps Script) sang
lớp API riêng bằng Node.js trong thư mục `native/`. Máy chủ ưu tiên gọi hàm
native; hàm nào chưa tách thì tự động chuyển về `code.js`. Cả hai dùng chung
kho dữ liệu nên hệ thống chạy liền mạch trong suốt quá trình tách.

Toàn bộ lời gọi giờ đi qua lớp native (cửa ngõ duy nhất); 10 hàm đọc đã viết lại
thuần Node.js, 46 hàm còn lại chạy qua cầu nối dùng thân hàm gốc đã kiểm chứng.
Đã đối chiếu khớp 100%% với bản gốc. Chi tiết & cách tách tiếp xem `native/README.md`.

## 15. Lưu trữ SQLite & sao lưu/phục hồi

Dữ liệu lưu trong cơ sở dữ liệu **SQLite** (`data/garage.db`) với chế độ WAL —
bền khi mất điện (đã kiểm thử tắt cứng, dữ liệu không mất), ghi nhanh theo giao
dịch, và nhiều người dùng đồng thời an toàn. Nếu máy chạy Node.js quá cũ (dưới
22.5), hệ thống tự chuyển sang lưu file JSON dự phòng.

- **Tự chuyển đổi**: nếu còn file JSON cũ (`garage-data.json`), lần khởi động đầu
  sẽ tự nạp và chuyển sang SQLite, đổi tên file cũ thành `.migrated`.
- **Sao lưu**: tự động mỗi lần khởi động; hoặc bấm **Công Cụ → Sao lưu ngay**.
  Bản sao lưu là file `.db` hoàn chỉnh trong `data/backups/` (giữ 60 bản gần nhất).
- **Phục hồi**: vào **Công Cụ → Sao lưu & phục hồi**, "Tải danh sách sao lưu",
  chọn một bản rồi bấm phục hồi. Trạng thái hiện tại được tự sao lưu trước; bản
  rỗng/hỏng sẽ bị từ chối để tránh mất dữ liệu.
- **Sao lưu thủ công ra ngoài**: chỉ cần copy thư mục `data/` (hoặc riêng
  `data/garage.db`) sang USB/ổ khác.

## 16. Tính năng vận hành mới

**Nhắc bảo dưỡng** (menu trái → "Nhắc Bảo Dưỡng"): liệt kê các xe không quay lại
quá 3/4/6/12 tháng, kèm SĐT, km và ngày sửa gần nhất. Với mỗi xe có nút soạn
sẵn tin nhắn nhắc (sao chép để gửi Zalo/SMS), nút gọi trực tiếp và mở Zalo.

**Mã QR trên bản in**: mọi phiếu in (lệnh xưởng, báo giá, quyết toán) giờ có mã
QR chứa mã lệnh ở góc trên — quét bằng điện thoại để tra cứu nhanh.

**Trang Công Cụ dạng bảng chọn**: các công cụ hệ thống (nạp dữ liệu, sao lưu,
chuyển mã, khôi phục lệnh, nhân sự, phân quyền...) hiển thị dạng lưới ô. Bấm vào
ô nào thì mở đúng công cụ đó; có nút "Quay lại danh sách công cụ".

## 17. Tin nhắn nội bộ & Phân tích

**Tin nhắn nội bộ** (menu "Tin Nhắn Nội Bộ"): kênh chung để thông báo công việc
cho cả nhóm, và tin nhắn 1-1 giữa hai người. Có đánh dấu "Quan trọng" và huy
hiệu đếm tin chưa đọc trên menu.

*Giám sát công khai (minh bạch)*: Admin/Quản lý có tab "Giám sát" xem được kênh
chung và danh sách các cuộc trò chuyện 1-1. Khi admin mở xem nội dung một cuộc
1-1, hệ thống **bắt buộc nhập lý do và ghi vào nhật ký công khai** (ai xem, xem
của ai, khi nào, lý do). Nhân viên biết rõ điều này — đây là quản lý minh bạch,
hợp pháp, không phải theo dõi lén. Chỉ Admin mới được xem nội dung tin 1-1.

**Phân tích & báo cáo** (menu "Phân Tích", cho Admin/Quản lý) gồm 4 mảng:
- *Gợi ý nhập hàng*: tốc độ xuất từng phụ tùng → còn đủ bán bao lâu, nên đặt bao nhiêu.
- *Năng suất KTV & cố vấn*: số lệnh, doanh thu, trung bình mỗi lệnh theo từng người.
- *Khách hàng*: tỷ lệ quay lại, khách VIP theo chi tiêu, phân bố tần suất ghé.
- *Xu hướng & dự báo*: doanh thu 12 tháng + dự báo 3 tháng tới.

## 18. Tối ưu cơ sở dữ liệu cho nhiều người dùng

Trước đây, mỗi thay đổi nhỏ (sửa 1 lệnh) khiến hệ thống ghi lại **toàn bộ** bảng
đó xuống SQLite; với bảng lớn (vật tư ~2.800 dòng) việc này làm máy chủ "đứng"
một nhịp, gây lag/lỗi khi nhiều người thao tác cùng lúc.

Nay hệ thống **ghi theo từng dòng**: chỉ dòng thực sự thay đổi mới được ghi lại
(sửa 1 lệnh ≈ ghi 1 dòng thay vì cả bảng). Kết quả kiểm thử: nhanh hơn ~5 lần
trên bảng lớn, và khoảng cách càng lớn khi dữ liệu càng nhiều. Đã kiểm chứng:
75 request dồn dập cùng lúc, 25 thao tác lưu song song — không mất dữ liệu, không
lỗi; dữ liệu vẫn nguyên vẹn sau khi tắt cứng (mất điện).

Các thao tác đổi cấu trúc (thêm/xóa dòng) vẫn ghi lại toàn bảng để đảm bảo đúng.
SQLite chạy chế độ WAL + chờ khi bận (busy_timeout) nên nhiều truy cập an toàn.

## 19. Kiểm thử tải lớn & cache truy vấn nặng

Đã kiểm thử tải cao với dữ liệu thật: 500+ request đọc đồng thời (50 luồng),
tạo 40 lệnh cùng lúc, sửa cùng 1 lệnh 20 lần đồng thời, 1000 vật tư/lần, và
3000 request liên tục. Kết quả: không sập, không mất dữ liệu, mã RO không trùng,
bộ nhớ ổn định (~100MB, không rò rỉ), dữ liệu nguyên vẹn sau mất điện. Input rác
(JSON hỏng, thiếu tham số, sai quyền) được xử lý an toàn, server không văng.

Thêm **cache ngắn hạn (4 giây)** cho các truy vấn đọc nặng (dashboard, phân tích,
tồn kho, danh sách). Giúp nhiều người mở cùng lúc mượt hơn — đuôi trễ p99 giảm
từ ~1,2 giây xuống ~0,3 giây. Cache **tự xóa ngay khi có bất kỳ thao tác ghi nào**,
nên không bao giờ hiển thị dữ liệu cũ sau khi sửa.

## 20. Bảng điều phối xưởng & Tìm nhanh (Spotlight)

**Điều phối xưởng** (menu "Điều Phối Xưởng"): bảng ba cột theo trạng thái — Chờ
tiếp nhận · Đang sửa chữa · Hoàn thành. Mỗi xe là một thẻ hiển thị mã lệnh, biển
số, khách, KTV. **Kéo thẻ sang cột khác để đổi trạng thái** ngay (nhấp đúp để mở
lệnh). Có ô lọc nhanh theo biển số/khách/mã lệnh. Nhìn một cái thấy ngay toàn
cảnh xưởng đang có xe nào ở đâu.

**Tìm nhanh kiểu Spotlight**: nhấn **Ctrl + K** (hoặc **⌘ + K** trên Mac), hoặc
bấm nút "Tìm nhanh" trên thanh trên cùng. Gõ để tìm xuyên suốt lệnh sửa chữa
(theo mã/biển số/khách/SĐT), khách hàng, phụ tùng — kèm các lối tắt điều hướng
đến từng trang. Dùng phím ↑ ↓ để chọn, Enter để mở, Esc để đóng.

## 21. Kiểm tra logic nghiệp vụ & Trung tâm thông báo realtime

**Rà soát logic (gara chuyên nghiệp):** luồng cốt lõi ĐÚNG — tạo lệnh (vật tư
"Chưa Xuất", tồn chưa đổi) → duyệt xuất kho (trừ tồn, ghi lịch sử, chống xuất
kho hai lần) → chặn hoàn thành khi chưa xuất kho / chưa có KTV. Phát hiện 2 lỗ hổng:
  - **Tồn kho âm**: xuất quá tồn không bị chặn. ĐÃ VÁ: duyệt xuất kho vẫn cho
    xuất nhưng trả cảnh báo, và tồn âm hiện lên thông báo quan trọng để nhập bù.
  - **Lệch tồn khi sửa số lượng vật tư đã xuất**: xem phương hướng trong phần trao đổi.

**Trung tâm thông báo (chuông góc trên):** hiển thị số việc cần xử lý (lệnh chờ
duyệt xuất kho, phụ tùng hết hàng, tồn âm...). Xử lý xong việc thì số tự giảm,
hết việc thì mất số. Cảnh báo quan trọng (như tồn âm) có nút **X** để tắt và
hiện thành toast nổi bật.

**Realtime (SSE):** khi bất kỳ ai trong mạng LAN thay đổi dữ liệu, mọi máy khác
cập nhật thông báo/badge trong ~2 giây mà không cần tải lại trang. Nếu trình
duyệt không hỗ trợ, hệ thống tự chuyển sang kiểm tra định kỳ mỗi 20 giây.

## 22. Vá lỗ hổng tồn kho (Cách 1) & Kiểm kê kho

**Cách 1 — khóa vật tư đã xuất:** không thể sửa số lượng hay xóa vật tư đã xuất
kho trực tiếp trong lệnh (vì tồn đã bị trừ). Muốn đổi phải dùng "Thu hồi vật tư"
ở trang Kho để hoàn tồn trước, rồi sửa và xuất lại. Vẫn cho sửa các trường khác
(KTV, triệu chứng...) và thêm vật tư mới ở trạng thái "Chưa Xuất". Nhờ đó tồn kho
không bao giờ bị lệch do sửa lệnh.

**Kiểm kê kho** (menu "Kiểm Kê Kho", cho Admin/Quản lý/Thủ kho): đếm thực tế và
cân bằng lại tồn. Nhập số lượng đếm được vào cột "Thực tế đếm", hệ thống hiện
ngay chênh lệch so với tồn sổ. Bấm "Lưu cân bằng kho" để đặt tồn = thực tế; mỗi
chênh lệch được ghi thành một dòng "Kiểm Kê Cân Bằng" trong Lịch sử kho (có mã
phiếu KK..., ai làm, tồn sổ → thực tế). Dòng khớp sổ không ghi. Có ô tìm kiếm,
lọc "chỉ hiện dòng đã nhập/lệch", và ghi chú đợt kiểm kê.

## 23. Nâng cấp bảo mật (chuẩn thực hành tốt nhất)

Đã triển khai một lớp bảo mật hoàn chỉnh:

**1. Token phiên do server cấp.** Khi đăng nhập đúng, server tạo một token bí mật
ngẫu nhiên (64 ký tự) và trả cho trình duyệt. Từ đó client chỉ gửi token này —
không còn gửi email làm danh tính. Server tự tra danh tính + quyền từ token.
Gọi API bằng email kiểu cũ, token sai, hoặc không token đều bị từ chối. Token
hết hạn sau 12 giờ; đăng xuất hủy token ngay.

**2. Băm PIN bằng scrypt.** Mã đăng nhập không còn lưu dạng thô. Khi khởi động,
mọi PIN cũ tự động được băm (scrypt + muối ngẫu nhiên). Kiểm tra mã dùng so sánh
an toàn theo thời gian (chống dò theo thời gian phản hồi).

**3. Chống dò mật khẩu.** Sai mã quá 5 lần sẽ khóa đăng nhập tạm 5 phút.

**4. Mã hóa đường truyền (HTTPS/TLS).** Server tự tạo chứng chỉ tự ký (thư mục
certs/) và chạy HTTPS — toàn bộ dữ liệu giữa trình duyệt và server được mã hóa.
Lần đầu, trình duyệt sẽ báo "chứng chỉ tự ký"; chọn Nâng cao → Tiếp tục là vào
(chỉ cần làm một lần cho mỗi máy). Nếu muốn tạm chạy HTTP, đặt biến môi trường
GARAGE_HTTP=1.

**Vì sao TLS thay vì tự mã hóa trong JS?** Cách chuẩn mực để "mã hóa khi gửi,
giải mã ở server" chính là TLS/HTTPS. Tự viết mã hóa trong trình duyệt không an
toàn hơn (khóa nằm sẵn ở client) và dễ sai — nên hệ thống dùng TLS.

**Lưu ý triển khai:** thư viện tạo chứng chỉ (selfsigned) đã đóng gói sẵn trong
node_modules/ để chạy offline. Nếu thư mục này bị thiếu, server tự chạy HTTP và
nhắc cách bật lại.

## 24. Sửa cảnh báo HTTPS & Bộ khung kết nối (connector)

**Sửa cảnh báo "không bảo mật":** chứng chỉ nay tự động gồm các địa chỉ IP LAN
thật của máy chủ (hết lỗi "sai tên miền"), và tự tạo lại khi máy đổi mạng. Để
bỏ hẳn cảnh báo, cài chứng chỉ làm tin cậy trên từng máy khách — xem file
HUONG_DAN_HTTPS.txt. Tải chứng chỉ tại: https://<IP-máy-chủ>:8080/chung-chi

**Bộ khung kết nối (menu "Kết Nối & Tích Hợp", chỉ Admin):** nơi cắm dịch vụ
ngoài — Zalo OA, SMS Brandname, Hóa đơn điện tử. Mỗi kết nối là một adapter độc
lập trong thư mục connectors/. Nhập thông tin từ nhà cung cấp, bật kết nối, bấm
"Kiểm tra" để xác nhận. Bí mật (token, mật khẩu) được che khi hiển thị và lưu
riêng trong data/connectors.json (không nằm trong bảng dữ liệu chung). Muốn thêm
dịch vụ mới sau này chỉ cần thêm một file adapter — không đụng nghiệp vụ cốt lõi.

Lưu ý: các dịch vụ này cần Internet và tài khoản riêng của bạn với nhà cung cấp,
nên chúng là phần "khi cần thì bật". Bộ khung đã sẵn sàng để cắm vào.

## 25. Cập nhật không cần khởi động lại server (nạp nóng)

Từ nay, chỉ cần **chép đè file mới lên** (Index.html, code.js, các file trong
native/ hoặc connectors/) là hệ thống **tự áp dụng trong ~1 giây mà không cần tắt/
mở lại server**:
  - Đổi giao diện (Index.html) → server phục vụ bản mới, mọi trình duyệt đang mở
    tự hiện thông báo và tải lại.
  - Đổi backend (code.js, native/, connectors/) → server tự dựng lại phần xử lý,
    GIỮ NGUYÊN dữ liệu, kết nối và phiên đăng nhập của mọi người (không ai bị đăng
    xuất). Nếu bản mới có lỗi, server tự giữ bản cũ để không gián đoạn.

Không còn cảnh phải Ctrl+C rồi chạy lại `node server.js` mỗi lần cập nhật. (Riêng
việc đổi mã bảo mật lõi hoặc cấu hình cổng/HTTPS thì vẫn nên khởi động lại.)

## 26. Lịch hẹn dịch vụ, Bảo hành & Loại công việc của lệnh

**Loại công việc (trong form lệnh):** mỗi lệnh nay chọn được loại — Bảo dưỡng,
SCC, Bảo hiểm, Bảo hành, Đồng sơn, Khác. Lưu cùng lệnh, hiện ở danh sách và tìm
kiếm được.

**Lịch hẹn dịch vụ (menu "Lịch Hẹn"):** đặt lịch khách hẹn mang xe tới (ngày, giờ,
biển số, khách, loại dịch vụ). Lọc theo khoảng ngày và trạng thái (Chờ xác nhận →
Đã xác nhận → Đã đến → Đã hủy). Từ một lịch hẹn có thể bấm "Tạo lệnh" để mở form
lệnh đã điền sẵn thông tin khách.

**Bảo hành (menu "Bảo Hành"):** tạo phiếu bảo hành cho xe/phụ tùng với ngày bắt
đầu và thời hạn (tháng); hệ thống tự tính ngày hết hạn và trạng thái Còn hạn/Hết
hạn. Tìm theo biển số/khách/SĐT/mã lệnh, lọc "chỉ còn hạn". Khi xe quay lại, tra
nhanh xem còn bảo hành không.

## 27. Điều phối xưởng nâng cao: quy tắc trạng thái & KTV theo công việc

Bảng điều phối nay có **4 cột**: Chờ tiếp nhận · Đang sửa chữa · Tạm dừng · Hoàn
thành. Kéo thẻ xe giữa các cột theo quy trình:

- **Chờ tiếp nhận → Đang sửa chữa:** hiện danh sách công việc, **gán KTV cho từng
  hạng mục**, bấm OK để xác nhận bắt đầu sửa. Có thể đổi lại KTV khi chưa hoàn thành.
- **Đang sửa chữa → Hoàn thành:** hiện công việc kèm KTV, **tick từng việc đã xong**
  (việc đã xong được làm mờ). Lệnh **chỉ chuyển "Hoàn thành" khi TẤT CẢ công việc
  hoàn thành**; nếu chưa, giữ nguyên "Đang sửa chữa" và báo còn mấy việc.
- **Kéo sang Tạm dừng:** chọn công việc cần dừng + nhập **lý do**, xác nhận. Thẻ
  hiện lý do tạm dừng.
- **Hoàn thành → Đang sửa chữa:** hỏi xác nhận **mở lại lệnh** rồi mới đổi.

Thẻ xe hiển thị tiến độ công việc (x/y đã xong) và loại công việc. Trạng thái từng
công việc và KTV **đồng bộ hai chiều với phần lệnh** — sửa ở board thấy trong lệnh
và ngược lại; sửa lệnh không làm mất trạng thái đã đặt ở board.

**Cột Hoàn thành chỉ hiển thị lệnh hoàn thành trong 3 ngày gần nhất** để bảng luôn
gọn (lệnh cũ vẫn tra được ở trang Lệnh sửa chữa).

## 27. Quy trình điều phối xưởng theo trạng thái công việc

Bảng điều phối có 4 cột: Chờ tiếp nhận · Đang sửa chữa · Tạm dừng · Hoàn thành.
Kéo thẻ xe giữa các cột sẽ mở đúng hộp thoại theo quy trình:

  - **Chờ tiếp nhận → Đang sửa chữa:** hiện danh sách công việc, gán KTV cho từng
    hạng mục, bấm OK để bắt đầu. Công việc được gán KTV tự chuyển sang "Đang làm".
  - **Đổi KTV khi đang sửa:** di chuột vào thẻ, bấm nút bút chì để đổi KTV từng
    hạng mục mà không đổi trạng thái lệnh (chỉ khi lệnh chưa hoàn thành).
  - **→ Hoàn thành:** hiện danh sách công việc + KTV, tick việc đã xong (việc đã
    hoàn thành bị làm mờ). Lệnh **chỉ** chuyển "Hoàn thành" khi **tất cả** công
    việc đã hoàn thành; nếu chưa, giữ nguyên "Đang sửa chữa" và báo còn mấy việc.
  - **Hoàn thành → Đang sửa chữa:** hỏi xác nhận trước khi mở lại lệnh đã xong.
  - **Tạm dừng:** chọn công việc cần dừng, nhập lý do, xác nhận. Lệnh sang cột
    Tạm dừng, thẻ hiển thị lý do.

Trạng thái từng công việc và KTV được **đồng bộ hai chiều** với form lệnh: mở lệnh
ra thấy badge trạng thái (● Đang làm / Hoàn thành / Tạm dừng) và KTV của từng hạng
mục; sửa ở đâu cũng khớp nhau vì dùng chung bảng ChiTietCongViec.

## 28. Sửa mã bảo mật & Nâng cấp bảo hành

**Mã bảo mật (sửa lỗi + hiển thị):** trước đây mã bảo mật bị lấy từ cột PIN — mà
PIN đã được băm sau đợt nâng cấp bảo mật, nên nhập mã luôn báo sai, không xóa/trả
lệnh được. Đã tách mã bảo mật thành một mã riêng (lưu ở bảng CaiDat), mặc định
112233. Trong trang Phân quyền (Admin) có ô **hiển thị mã bảo mật** (nút Hiện/Ẩn)
và nút **Đổi mã**. Mã này dùng khi xóa lệnh, trả lệnh, xóa phiếu kho...

**Bảo hành nâng cấp:** form bảo hành mới có:
  - **3 loại:** Công việc · Phụ tùng · Hãng xe (chính hãng).
  - **Autofill:** nhập biển số/SĐT rồi bấm kính lúp → tự điền tên khách, SĐT và
    thông tin xe (hãng, loại, model, năm).
  - **Chọn lệnh:** hiện các lệnh xe đã vào trong 12 tháng để chọn.
  - **Bảo hành công việc:** chọn lệnh → hiện các công việc của lệnh → tích chọn
    việc cần bảo hành.
  - **Bảo hành phụ tùng:** chọn lệnh → hiện các phụ tùng của lệnh → tích chọn
    (nhiều mục) → chốt vào nội dung bảo hành.
  - **Bảo hành hãng xe:** không cần chọn lệnh, ghi theo chính sách nhà sản xuất.
  Bảng bảo hành hiển thị loại của từng phiếu.

## 29. Phân quyền tùy chỉnh theo từng tài khoản

Ngoài phân quyền theo vai trò (Admin/Quản lý/Thủ kho/Cố vấn) vẫn giữ nguyên, giờ
có thể **cấp quyền truy cập riêng cho từng tài khoản**. Trong trang Phân quyền,
bấm nút hình thanh trượt ở dòng tài khoản để mở "Tùy chỉnh quyền truy cập", rồi
tích chọn các khu vực tài khoản đó được vào:
  - Lệnh sửa chữa & điều phối · Xóa & khôi phục lệnh (nhạy cảm) · Kho & vật tư ·
    Xóa lịch sử kho (nhạy cảm) · Khách hàng & xe · Danh mục công việc · Báo cáo &
    phân tích · Tin nhắn nội bộ · Hệ thống (nhạy cảm).

Nguyên tắc:
  - Tài khoản **chưa** tùy chỉnh → dùng đúng quyền mặc định theo vai trò (không đổi
    gì so với trước).
  - Tài khoản **có** tùy chỉnh → chỉ vào được đúng các khu vực được cấp; menu tự
    ẩn/hiện theo đó, và thao tác bị chặn ở cả phần lệnh, kho... (kiểm soát hai lớp).
  - **Admin** luôn có đủ quyền, không thể tự khóa mình ra ngoài.
  - Nút "Bỏ tùy chỉnh" đưa tài khoản về mặc định theo vai trò.

Quyền tùy chỉnh lưu ở bảng riêng (QuyenTruyCap), không ảnh hưởng bảng PhanQuyen.

## 30. Sửa lỗi thêm nhân viên & rà soát liên kết hệ thống

**Lỗi đã sửa:** khi thêm/sửa/xóa nhân viên, danh sách KTV và Cố vấn (dùng trong
dropdown của lệnh sửa chữa và bảng điều phối) chỉ được nạp một lần lúc đăng nhập,
nên nhân viên mới không xuất hiện cho tới khi tải lại trang. Nay sau mỗi lần
lưu/xóa nhân viên, hệ thống tự làm mới ngay danh sách KTV/Cố vấn và cập nhật lại
các ô chọn — chức danh mới xuất hiện tức thì. Nhân viên "Nghỉ việc" tự loại khỏi
danh sách.

Phân loại theo chức danh: có chữ "kỹ thuật"/"ktv"/"thợ" → vào danh sách KTV; có
chữ "cố vấn"/"cv" → vào danh sách Cố vấn.

**Đã rà soát liên kết toàn hệ thống:** 106 hàm giao diện gọi đều khớp backend;
không có mục đăng ký thừa; 22 menu khớp 22 trang; danh mục công việc & vật tự tự
làm mới sau khi thêm. Không phát hiện lỗi liên kết nào khác.

## 31. Kiểm tra realtime & Lớp animation

**Realtime (đã kiểm tra & cải thiện):**
  - Cơ chế: server phát hiện thay đổi dữ liệu và đẩy tín hiệu qua SSE cho mọi
    trình duyệt đang mở (quét mỗi 1,2 giây).
  - Đã sửa nhiễu: trước đây các hàm ĐỌC (tìm lệnh, xem chi tiết) cũng làm hệ thống
    tưởng có thay đổi và đẩy tín hiệu giả. Nay chỉ thao tác GHI mới đẩy tín hiệu;
    các hàm đọc còn được cache ngắn nên nhanh hơn.
  - Mới: **trang đang xem tự làm mới** khi có người khác thay đổi dữ liệu (bảng
    điều phối, danh sách lệnh, kho, lịch hẹn, bảo hành...). Ví dụ hai người cùng
    xem bảng điều phối, một người kéo thẻ thì người kia thấy cập nhật ngay — không
    cần bấm tải lại. Hệ thống tránh làm mới khi bạn đang mở biểu mẫu để không ngắt
    thao tác.

**Lớp animation (chỉ CSS, không ảnh hưởng hệ thống):** thẻ điều phối và thẻ KPI
nâng nhẹ khi di chuột, nút phản hồi khi bấm, dòng bảng và menu đổi màu mượt, huy
hiệu thông báo nhấp nhẹ, biểu mẫu/hộp thoại xuất hiện mượt. Tất cả tự tắt nếu máy
người dùng bật chế độ "giảm chuyển động" (prefers-reduced-motion).

## 32. Sửa lỗi biểu đồ dashboard nạp lại liên tục

**Nguyên nhân:** tính năng "trang tự làm mới" (thêm ở bản trước) vô tình tạo vòng
lặp: một số hàm ĐỌC mà dashboard gọi khi tải (nhắc bảo dưỡng, và tương tự ở các
trang chờ-xuất/bán-lẻ/nhập/lịch-sử kho) chưa được đánh dấu "chỉ đọc", nên bị coi
là có thay đổi dữ liệu → hệ thống báo "có cập nhật" → trang tự nạp lại → gọi lại
các hàm đó → lặp vô tận, khiến 3 biểu đồ (doanh thu 6 tháng, tỉ trọng lệnh, doanh
thu tuần) load lại liên tục.

**Đã sửa:** đánh dấu đúng các hàm đó là "chỉ đọc" (không làm tăng phiên bản dữ
liệu), nên tải trang không còn tự kích hoạt làm mới. Đồng thời thêm lớp bảo vệ:
mỗi trang chỉ tự làm mới tối đa 1 lần mỗi 2,5 giây. Đã kiểm chứng: mở dashboard
đứng yên không còn phát tín hiệu thay đổi; ghi dữ liệu (tạo/sửa lệnh) vẫn phát
tín hiệu realtime bình thường.

## 33. Quy trình KTV, KTV chính & sửa đổi lưu lệnh

**Phân KTV cho công việc (trong Điều phối xưởng):** khi kéo lệnh sang Đang sửa
chữa (hoặc bấm nút đổi KTV), danh sách KTV để chọn chính là **nhân viên có chức
danh Kỹ thuật viên**. Một công việc **chọn được nhiều KTV** (tick nhiều chip).

**KTV chính của lệnh:** ô "KTV chính" trong lệnh không cần chọn tay — nó **tự cập
nhật khi lệnh hoàn thành**, lấy thợ có **tổng thời gian công việc nhiều nhất**
trong lệnh (việc có nhiều KTV thì mỗi người được tính đủ thời gian việc đó). KTV
chi tiết từng việc do quản đốc phân trong Điều phối xưởng.

**Trả lệnh:** khi trả một lệnh đã Hoàn Thành về Đang sửa chữa, các công việc đang
"Hoàn thành" được đưa về "Đang làm" (chưa hoàn thành) để sửa tiếp.

**Sửa đổi lưu lệnh:**
  - Lập lệnh mới **bắt buộc chọn Loại công việc** mới lưu được.
  - Chuyển sang Đang sửa chữa **không còn bắt buộc chọn KTV** ở lệnh — KTV lấy từ
    phần Điều phối xưởng cho từng công việc. Khi Hoàn Thành cũng không bắt nhập
    KTV (tự tính KTV chính).

**Live-refresh theo phạm vi:** mỗi thao tác ghi được gắn "danh mục" (lệnh, kho,
lịch hẹn, bảo hành...). Trang đang xem **chỉ tự làm mới khi thay đổi đúng danh mục
liên quan** — ví dụ đang xem Kho thì người khác sửa lịch hẹn sẽ không làm Kho nạp
lại. Cơ chế chỉ làm mới phần dữ liệu hiển thị, không đổi logic vận hành.

## 34. Điều phối xưởng tách khỏi trạng thái tổng lệnh

Mô hình mới, rõ vai trò:
  - **Cố vấn** điều khiển trạng thái tổng của lệnh ở form lệnh: Tiếp nhận → Đang
    sửa chữa → Hoàn thành. Chỉ khi cố vấn chuyển sang **"Đang sửa chữa"** thì xe
    (kèm công việc, khách, biển số) mới **xuất hiện trong Điều phối xưởng**.
  - **Điều phối xưởng (quản đốc)** chỉ tác động vào **công việc và KTV**: phân KTV
    từng việc, đánh dấu việc xong, tạm dừng việc. Các thao tác này **KHÔNG đổi
    trạng thái tổng của lệnh**. Cột trên bảng (Chờ sửa chữa · Đang sửa chữa · Tạm
    dừng · Xong—chờ nghiệm thu) được **suy ra từ trạng thái công việc**.
  - **KTV chính** của lệnh tự cập nhật theo thợ nhiều thời gian nhất khi phân/hoàn
    thành công việc.
  - **Trả lệnh** (cố vấn đưa lệnh đã Hoàn thành về Đang sửa chữa): công việc đang
    "Hoàn thành" tự về "Đang làm" và card hiện lại đúng cột trong điều phối.

**Thông báo:**
  - Điều phối nhận thông báo **"Xe chờ phân công"** khi có xe vào sửa chữa mà công
    việc chưa được phân/bắt đầu.
  - Cố vấn nhận thông báo **"Xe đã sửa xong — chờ nghiệm thu"** khi mọi công việc
    của xe đã hoàn thành, để vào form chốt lệnh.

**Chống nháy / vẽ lại liên tục:**
  - Dashboard: khi có thay đổi, **chỉ cập nhật số liệu, KHÔNG vẽ lại biểu đồ** (biểu
    đồ chỉ vẽ khi mở trang hoặc bấm làm mới) — hết cảnh biểu đồ nhấp nháy.
  - Điều phối: khi công việc thay đổi lúc đang xem, bảng **không tự vẽ lại** (tránh
    nháy) mà hiện dải **"Có công việc vừa thay đổi — bấm để cập nhật"**; bấm mới tải lại.

## 35. Mở lại lệnh đã hoàn thành về "Đang sửa chữa"

Khi mở một lệnh đã Hoàn Thành, ngoài nút "Trả về Admin" (đưa về Tiếp nhận) nay có
thêm nút **"Mở lại (→ Đang sửa chữa)"**. Bấm nút này: trạng thái lệnh chuyển về
"Đang sửa chữa", các công việc đang "Hoàn thành" tự về "Đang làm", và lệnh **quay
lại Điều phối xưởng** để sửa tiếp. Trước đây lệnh hoàn thành bị khóa nên không mở
lại về đang sửa được — nay đã khắc phục.

## 36. Sửa lỗi vỡ bố cục (board xếp dọc + trang phân tích/công cụ/log/khách hàng bị đẩy)

Nguyên nhân: khi thêm dải thông báo cho Điều phối ở bản trước, thẻ mở
`<div class="board-cols">` (khung lưới 4 cột) bị xóa nhầm. Hậu quả dây chuyền:
  - 4 cột điều phối mất khung lưới → xếp dọc, mỗi cột chiếm hết chiều ngang, để lại
    nhiều khoảng trống.
  - Một thẻ đóng `</div>` bị lạc chỗ đóng nhầm vùng nội dung, khiến các trang nằm
    sau Điều phối trong mã (Phân tích, Khách hàng, Log, Công cụ) bị lồng sai và bị
    đẩy nội dung xuống.
Đã khôi phục thẻ khung lưới; kiểm tra cân bằng thẻ toàn trang (0 lệch). Board trở
lại 4 cột ngang, các trang trên hiển thị bình thường.

## 37. Hết nháy trang khi live-refresh (nạp nền im lặng)

Trước đây khi có thay đổi dữ liệu, các trang danh sách (lệnh, kho, chờ xuất, bán lẻ,
nhập, lịch hẹn, bảo hành, lịch sử) tự làm mới bằng cách hiện lớp phủ "đang tải" và
xóa bảng về "Đang tải..." rồi vẽ lại → gây nháy.

Nay live-refresh chạy ở chế độ **nạp nền im lặng**: vẫn tự cập nhật dữ liệu nhưng
KHÔNG hiện lớp phủ và KHÔNG xóa bảng — dữ liệu được thay tại chỗ nên không nháy.
Hành vi hệ thống giữ nguyên; thao tác thủ công (bấm nút, mở trang) vẫn hiện "đang
tải" bình thường. Điều phối vẫn dùng dải "bấm để cập nhật", dashboard không vẽ lại
biểu đồ — như trước.

## 38. Giải pháp HTTPS tin cậy: CA gốc + chứng chỉ máy chủ (hết "không bảo mật")

Nguyên nhân cài rồi vẫn báo không bảo mật: bản cũ dùng một chứng chỉ tự ký vừa là
CA vừa là cert máy chủ — Chrome/Cốc Cốc đời mới không tin loại này.

Nay hệ thống tạo theo chuẩn (như mkcert):
  - **CA gốc riêng** (certs/ca-cert.pem) — cài một lần trên mỗi máy.
  - **Chứng chỉ máy chủ** do CA gốc ký, kèm sẵn localhost + mọi IP LAN.
Cài CA gốc vào "Trusted Root" → tất cả trình duyệt báo an toàn (ổ khóa xanh).
Chi tiết các bước cài (Windows/Android/macOS) xem file HUONG_DAN_HTTPS.txt.

Lưu ý: sau khi cập nhật phải **khởi động lại server** (server.js đổi thì không nạp
nóng). CA gốc giữ nguyên khi đổi mạng; chỉ cert máy chủ tự cấp lại theo IP mới.
Khóa bí mật certs/ca-key.pem phải giữ trên máy chủ, không chia sẻ.

## 39. Chuyển mục không nháy

Khi chuyển giữa các mục, trang đã mở trước đó giữ nguyên nội dung cũ trong DOM và
được nạp NỀN im lặng (không lớp phủ "đang tải", không xóa bảng) → chuyển tức thì,
không chớp. Lần đầu mở một mục mới vẫn hiện loading bình thường. Dashboard khi quay
lại chỉ cập nhật số liệu, không vẽ lại biểu đồ. Hiệu ứng chuyển trang đổi sang mờ
dần nhanh (0,18s), bỏ trượt để êm mắt.

## 40. Hồ sơ kỹ thuật xe & cảnh báo bảo dưỡng

Mỗi xe có một hồ sơ kỹ thuật lưu:
  - **Thông số**: số VIN, số máy, động cơ, nhiên liệu, hộp số, ghi chú kỹ thuật /
    lỗi thường gặp.
  - **Hạng mục / hệ thống theo dõi**: dầu máy, lọc dầu/gió, bugi, dầu phanh, nước
    làm mát, dầu hộp số, má phanh, dây curoa cam, lốp, ắc quy... — mỗi mục có mốc
    bảo dưỡng gần nhất (km + ngày) và chu kỳ (km / tháng).

**Cảnh báo tự động**: dựa trên **km hiện tại** (lấy từ lệnh gần nhất của xe) và
ngày, mỗi hạng mục hiện trạng thái: Còn tốt (xanh) · Sắp đến hạn (vàng) · Quá hạn
(đỏ) · Chưa có mốc (xám). Kèm số km còn lại / ngày đến hạn.

**Thao tác nhanh**:
  - "Áp dụng mẫu chuẩn" tạo sẵn bộ hạng mục thông dụng kèm chu kỳ tham khảo.
  - "Đánh dấu vừa bảo dưỡng" đặt mốc = km hiện tại + hôm nay (dùng khi vừa thay).
  - Thêm / sửa / xóa hạng mục tùy xe.

**Liên kết**:
  - **Danh sách xe**: nút hồ sơ kỹ thuật ở mỗi dòng xe.
  - **Lệnh sửa chữa**: nút "Hồ sơ kỹ thuật" trong phần Phương tiện, và một **dải
    cảnh báo** tự hiện khi nhập biển số — cho cố vấn biết ngay xe đang quá hạn /
    sắp đến hạn hạng mục gì để tư vấn thêm dịch vụ.

Dữ liệu lưu ở 2 bảng riêng (HoSoKyThuat, HangMucKyThuat), tự tạo khi dùng.

## 41. Lịch bảo dưỡng chính hãng MG + tự cập nhật mốc khi hoàn thành lệnh

**Nguồn dữ liệu**: bảng giá bảo dưỡng MG (11/10/2023) được nạp sẵn thành catalog 7
dòng xe: MG ZS 1.5L, New MG ZS (Com+/Lux+), MG HS 1.5T, MG HS 2.0T, MG5 MT (số
sàn), MG5 CVT (tự động), MG RX5 1.5T — mỗi dòng kèm chu kỳ km theo ĐÚNG nhà sản
xuất (vd MG5: dầu máy 10.000km, bugi 30.000km; HS 2.0T: bugi 20.000km...).

**Áp mẫu theo dòng xe**: trong Hồ sơ kỹ thuật, nút "Áp dụng mẫu chuẩn" nay mở hộp
chọn dòng xe — hệ thống **tự nhận diện model** của xe và chọn sẵn; áp vào là có
ngay lịch bảo dưỡng chính hãng. Không nhận diện được thì chọn tay hoặc dùng mẫu chung.

**Tự động cập nhật mốc khi hoàn thành lệnh**: khi một lệnh chuyển sang Hoàn Thành,
hệ thống dò tên công việc + phụ tùng trong lệnh (vd "Thay dầu động cơ", "Thay bugi",
phụ tùng "Lọc dầu động cơ"), khớp với hạng mục đang theo dõi và **đặt lại mốc = số
km + ngày của lệnh**. Nhờ đó cảnh báo bảo dưỡng luôn chính xác mà không cần bấm tay.
Nếu xe chưa có hồ sơ, hệ thống tự áp mẫu theo model rồi cập nhật.

Mẹo: đặt tên công việc rõ ràng ("Thay dầu động cơ", "Thay lọc gió", "Đảo lốp"...) để
khớp tự động tốt nhất.

## 42. Hồ sơ kỹ thuật: tự khởi tạo, kiểm tra hạng mục, quét lệnh gần nhất

**Tự áp lịch chính hãng (không cần bấm nút)**: mở hồ sơ kỹ thuật của một xe lần đầu,
hệ thống TỰ nhận diện dòng xe MG và áp lịch bảo dưỡng chính hãng + nhóm kiểm tra hao
mòn (má phanh, lốp, ắc quy, gạt mưa), rồi TỰ quét lệnh sửa chữa gần nhất để đặt mốc —
tất cả tự động. Nút "Đổi/áp lịch theo dòng xe" chỉ dùng khi muốn đổi model thủ công.

**Tự quét lệnh gần nhất**: nút "Quét lệnh gần nhất" (và tự động khi khởi tạo) đọc mô
tả công việc + phụ tùng của lệnh mới nhất, khớp với hạng mục theo dõi và đặt lại mốc
(km/ngày) + đánh dấu "Đã thay thế".

**Kiểm tra thực tế từng hạng mục**: mỗi hạng mục có ô chọn kết quả kiểm tra — **Đạt ·
Cần thay thế · Không đạt · Đã thay thế** (kèm màu). Chọn "Đã thay thế" sẽ đồng thời đặt
lại mốc bảo dưỡng. Ô "Theo lịch" (tính theo km/thời gian) và "Kiểm tra thực tế" (thợ
đánh giá) tách riêng, cho cái nhìn đầy đủ. Số mục "cần thay/không đạt" hiện ở dải cảnh
báo đầu hồ sơ.

Bảng HangMucKyThuat được bổ sung 2 cột: Tình Trạng, Ngày KT (tự tạo, không cần sửa dữ liệu cũ).
