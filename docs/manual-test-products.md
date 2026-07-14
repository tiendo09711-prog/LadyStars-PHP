# Kịch bản manual test đầy đủ — Trang Sản phẩm (`/products`)

> Phạm vi khảo sát: UI hiện tại tại `http://localhost:5173/products`, hai tab **Sản phẩm** và **Lịch sử sửa/xóa**, modal thêm/sửa/xóa/chi tiết/import/export, thao tác hàng loạt và không gian in mã vạch. Tài liệu được đối chiếu theo source frontend, API Laravel và phân quyền hiển thị hiện tại.

## 1. Nguyên tắc an toàn và cách ghi nhận

- Chỉ test thao tác ghi/xóa trên dữ liệu test có tiền tố `QA-PROD-<ngày>-...`; không dùng sản phẩm thật.
- Các ca xóa, sửa tồn hoặc import có thể làm đổi dữ liệu. Nên test trên database local/test và chuẩn bị dữ liệu riêng theo mục 3.
- Chạy toàn bộ ca có nhãn **Cả hai** bằng cả tài khoản **ADMIN** và **EMPLOYEE**. Ca có nhãn riêng phải đăng nhập đúng vai trò.
- Với mỗi ca, ghi: `PASS/FAIL`, tài khoản, thời gian, trình duyệt, độ phân giải, ảnh/video, thông báo lỗi, request/response lỗi trong DevTools > Network.
- Không chỉ kiểm tra toast/modal. Sau thao tác ghi phải bấm **Làm mới**, tìm lại sản phẩm, mở **Chi tiết**, kiểm tra **Lịch sử sửa/xóa**, và nếu liên quan tồn thì đối chiếu đúng từng kho.
- Khi test lỗi mạng/403/409/422/500, chỉ dùng DevTools chặn request hoặc môi trường test; không sửa dữ liệu thật.

## 2. Ma trận quyền phải đạt

| Chức năng                                      | ADMIN |                                                                              EMPLOYEE |
| ---------------------------------------------- | ----: | ------------------------------------------------------------------------------------: |
| Mở `/products`, xem/tìm/lọc/sắp xếp/phân trang |    Có |                                                                                    Có |
| Xem chi tiết và tồn theo kho                   |    Có |                                                                                    Có |
| Mở liên kết tuổi tồn kho                       |    Có |                                                                                    Có |
| Thêm sản phẩm mới                              |    Có |                                                             Có (UI hiện tại cho phép) |
| Import dòng mới                                |    Có |                                                                                    Có |
| Import cập nhật dòng trùng mã                  |    Có | Không; dù chọn trên UI, request phải bị ép thành **Thêm mới** và dòng trùng bị bỏ qua |
| Xuất Excel                                     |    Có |                                                                                    Có |
| Chọn sản phẩm và in mã vạch                    |    Có |                                                                                    Có |
| Sửa một sản phẩm                               |    Có |                                                                        Không hiển thị |
| Đổi trạng thái/cập nhật danh mục hàng loạt     |    Có |                                                                        Không hiển thị |
| Xóa một/nhiều sản phẩm                         |    Có |                                                                        Không hiển thị |
| Xem/lọc/xuất lịch sử sửa/xóa                   |    Có |                                                                   Có theo UI hiện tại |

> **Kiểm tra bảo mật quan trọng:** Ẩn nút ở frontend chưa đủ. Với EMPLOYEE, API sửa/xóa/import-update cũng phải từ chối nếu nghiệp vụ yêu cầu admin-only. Source route backend hiện không thể hiện middleware role tại các route sản phẩm; hãy coi các ca `PERM-06..08` là ca bảo mật bắt buộc và báo lỗi nghiêm trọng nếu API vẫn ghi dữ liệu.

## 3. Dữ liệu chuẩn bị

Tạo trong môi trường test:

1. `QA-PROD-A`: mã duy nhất, barcode duy nhất, trạng thái **Mới**, tồn `Kho A = 10`, `Kho B = 0`, đủ giá vốn/giá bán/giá sỉ, danh mục A.
2. `QA-PROD-B`: trạng thái **Đang bán**, tồn `Kho A = 0`, `Kho B = 7`, có màu/kích cỡ/xuất xứ/VAT/bảo hành.
3. `QA-PROD-ZERO`: tổng tồn bằng 0, chưa phát sinh tham chiếu; dùng để xóa thành công.
4. `QA-PROD-STOCK`: còn tồn > 0; dùng để kiểm tra chặn xóa.
5. Một sản phẩm có tên tiếng Việt dài, ký tự `& < > " '`, mã/barcode hợp lệ; dùng cho hiển thị, export và in.
6. Ít nhất 17 sản phẩm để có 2 trang (mỗi trang 15 dòng).
7. Ít nhất 2 danh mục hoạt động và 2 kho hoạt động; nếu có thể thêm 1 kho ngừng hoạt động để kiểm tra không xuất hiện.
8. Một ADMIN và một EMPLOYEE đang hoạt động.
9. File CSV mẫu tải trực tiếp từ nút **Tải file mẫu CSV**, cùng các biến thể nêu ở nhóm IMPORT.

## 4. Smoke, route, tab và trạng thái chung

### NAV-01 — Mở trang trực tiếp (Cả hai)

**Bước:** Đăng nhập → nhập `http://localhost:5173/products` → Enter.  
**Mong đợi:** Route mở thành công; tab **Sản phẩm** active; URL là `/products`; có thanh lọc, tổng số sản phẩm, bảng 9 cột; không trắng trang, không lỗi console nghiêm trọng.

### NAV-02 — Mở từ menu (Cả hai)

**Bước:** Từ trang khác → mở menu sản phẩm → bấm mục **Sản phẩm**.  
**Mong đợi:** Điều hướng đúng `/products`; mục menu/current route thể hiện active.

### NAV-03 — Chuyển tab lịch sử và quay lại (Cả hai)

**Bước:** Bấm **Lịch sử sửa/xóa** → bấm **Sản phẩm**.  
**Mong đợi:** URL lần lượt `/products?tab=history` và `/products`; panel đúng thay đổi, không reload toàn trang.

### NAV-04 — Deep link/tab query sai (Cả hai)

**Bước:** Mở `/products?tab=history`; sau đó mở `/products?tab=abc`.  
**Mong đợi:** Link đầu mở tab lịch sử; query không hợp lệ fallback tab **Sản phẩm**, không crash.

### NAV-05 — Back/Forward trình duyệt (Cả hai)

**Bước:** Từ `/products` bấm tab lịch sử → Back → Forward.  
**Mong đợi:** Nội dung luôn khớp URL; không lặp navigation hoặc mất layout.

### NAV-06 — Loading/empty/load failure (Cả hai)

**Bước:** (a) Reload với mạng chậm; (b) lọc từ khóa chắc chắn không có; (c) DevTools chặn `GET /api/products/products`, reload, rồi bỏ chặn và bấm **Làm mới**.  
**Mong đợi:** (a) hiện **Đang tải dữ liệu...**; (b) hiện **Chưa có dữ liệu sản phẩm**; (c) không treo/crash và sau bỏ chặn tải lại được. Nếu lỗi tải bị biến thành empty mà không có thông báo rõ, ghi nhận lỗi UX.

### NAV-07 — Session hết hạn (Cả hai)

**Bước:** Mở trang → làm token/session hết hạn trong môi trường test → bấm **Làm mới** hoặc **Lọc**.  
**Mong đợi:** Không lộ dữ liệu/không loop request; chuyển đăng nhập hoặc hiện lỗi xác thực nhất quán.

## 5. Danh sách, tìm kiếm và bộ lọc

### LIST-01 — Tổng số và dữ liệu cột (Cả hai)

**Bước:** Bấm **Làm mới** → đối chiếu từng cột của `QA-PROD-A`.  
**Mong đợi:** Tổng số đúng; Mã SP, tên/danh mục, barcode, giá vốn, giá bán, tổng tồn, trạng thái, nút thao tác đúng; tiền/số theo định dạng `vi-VN`; giá trị thiếu hiển thị `—` hợp lý.

### LIST-02 — Tìm theo tên chính xác/một phần/không dấu hoa thường (Cả hai)

**Bước:** Nhập lần lượt tên đầy đủ, một đoạn tên, biến thể hoa/thường → mỗi lần bấm **Lọc** hoặc Enter.  
**Mong đợi:** Chỉ dữ liệu khớp; Enter tương đương nút **Lọc**; không có dòng ngoài điều kiện.

### LIST-03 — Tìm theo mã, barcode, danh mục (Cả hai)

**Bước:** Lần lượt nhập mã SP, barcode, tên danh mục → bấm **Lọc**.  
**Mong đợi:** Trả đúng sản phẩm theo backend hiện hỗ trợ cả bốn trường; barcode dài không bị biến dạng.

### LIST-04 — Khoảng trắng và ký tự đặc biệt (Cả hai)

**Bước:** Nhập `  QA-PROD-A  ` → **Lọc**; sau đó nhập `%`, `_`, `'`, `"`, `<script>`, emoji → **Lọc**.  
**Mong đợi:** Khoảng trắng đầu/cuối được trim; ký tự đặc biệt không crash/500/SQL error/XSS; text không được render thành HTML.

### LIST-05 — Từ khóa không có kết quả và xóa lọc (Cả hai)

**Bước:** Nhập chuỗi duy nhất không tồn tại → **Lọc** → bấm **Làm mới**.  
**Mong đợi:** Empty state đúng; có nhãn **Đang lọc**; **Làm mới** xóa từ khóa, trạng thái, kho, sort về `createdAt desc`, trang về 1.

### LIST-06 — Lọc từng trạng thái (Cả hai)

**Bước:** Chọn lần lượt **Mới**, **Đang bán**, **Ngừng bán**, **Hết hàng** → **Lọc**.  
**Mong đợi:** Tất cả dòng đúng trạng thái; trạng thái distinct từ dữ liệu nếu có cũng xuất hiện và lọc đúng.

### LIST-07 — Lọc từng kho (Cả hai)

**Bước:** Chọn **Kho A** → **Lọc**; lặp lại Kho B.  
**Mong đợi:** Chỉ sản phẩm có tồn `> 0` tại kho đã chọn; `QA-PROD-A` có ở Kho A nhưng không ở Kho B; kho inactive không xuất hiện.

### LIST-08 — Kết hợp tên + trạng thái + kho (Cả hai)

**Bước:** Nhập tên/mã → chọn trạng thái → chọn kho → **Lọc**.  
**Mong đợi:** Điều kiện là giao (AND); tổng số và dữ liệu đều đúng; đổi draft nhưng chưa bấm **Lọc** chưa làm đổi danh sách.

### LIST-09 — Quét barcode ở danh sách (Cả hai)

**Bước:** Đặt con trỏ ở ô tìm kiếm → dùng scanner quét barcode hợp lệ; lặp lại barcode không tồn tại.  
**Mong đợi:** Barcode được điền và áp dụng ngay, trang về 1; barcode hợp lệ ra đúng dòng, barcode lạ ra empty; focus quay lại ô tìm kiếm.

### LIST-10 — Double submit/race tìm kiếm (Cả hai)

**Bước:** Bấm **Lọc** nhanh 2 lần; sau đó lọc A rồi ngay lập tức lọc B trong mạng chậm.  
**Mong đợi:** Không nhân đôi dữ liệu; kết quả cuối khớp bộ lọc cuối; không để response cũ ghi đè response mới.

## 6. Sắp xếp và phân trang

### SORT-01 — Tất cả cột sortable (Cả hai)

**Bước:** Với từng header **Mã SP**, **Tên sản phẩm**, **Mã vạch**, **Giá vốn**, **Giá bán**, **Tổng tồn**, **Trạng thái**, bấm 1 lần rồi bấm lần 2.  
**Mong đợi:** Lần đầu sort giảm, lần hai sort tăng; icon và dòng mô tả sort khớp; thứ tự đúng kiểu dữ liệu (giá/tồn theo số, không theo chuỗi).

### SORT-02 — Sort với giá trị trùng/null (Cả hai)

**Bước:** Sort cột có hai giá trị bằng nhau và một giá trị trống.  
**Mong đợi:** Thứ tự ổn định nhờ ID phụ, không trùng/mất dòng khi đổi trang; null không gây crash.

### SORT-03 — Phân trang cơ bản (Cả hai)

**Bước:** Khi >15 bản ghi, bấm **Trang sau**, **Trang trước**, số trang đầu/cuối nếu component hiển thị.  
**Mong đợi:** Mỗi trang tối đa 15; không lặp/mất dòng; nút biên disabled đúng; tổng số không đổi.

### SORT-04 — Filter/sort reset page (Cả hai)

**Bước:** Sang trang 2 → áp dụng bộ lọc; sau đó đổi sort.  
**Mong đợi:** Filter đưa về trang 1. Sort không hiển thị trang vượt quá tổng; dữ liệu khớp sort mới.

### SORT-05 — Dữ liệu thay đổi làm mất trang cuối (ADMIN)

**Bước:** Ở trang cuối chỉ có một fixture zero-stock → xóa fixture đó.  
**Mong đợi:** Không mắc kẹt ở trang rỗng ngoài tổng trang; UI điều hướng về trang hợp lệ hoặc hiển thị trạng thái nhất quán.

## 7. Chọn dòng và menu

### SEL-01 — Chọn/bỏ một dòng (Cả hai)

**Bước:** Tick checkbox của `QA-PROD-A` → bỏ tick.  
**Mong đợi:** Checkbox, tổng **Đã chọn N** và summary thay đổi đúng.

### SEL-02 — Chọn tất cả trang hiện tại (Cả hai)

**Bước:** Tick checkbox header → bỏ tick header.  
**Mong đợi:** Chọn/bỏ đúng 15 dòng trang hiện tại; không tự chọn dữ liệu trang khác.

### SEL-03 — Giữ lựa chọn qua phân trang/lọc (Cả hai)

**Bước:** Chọn một dòng trang 1 → sang trang 2 chọn thêm → quay lại; sau đó lọc để dòng cũ không hiển thị.  
**Mong đợi:** Tổng selected phản ánh state thực tế. Lưu ý thao tác **In mã vạch** chỉ nhận selected đang hiển thị; nếu selected chỉ nằm ngoài trang phải báo yêu cầu chọn sản phẩm đang hiển thị.

### SEL-04 — Thao tác khi chưa chọn (Cả hai)

**Bước:** Không tick dòng → **Thao tác** → **In mã vạch**; ADMIN thử thêm **Đổi trạng thái**, **Xóa**, **Cập nhật danh mục**.  
**Mong đợi:** Hiện cảnh báo **Vui lòng tích chọn ít nhất một sản phẩm...**; không mở workspace/modal và không gọi API ghi.

### MENU-01 — Đóng menu bằng click ngoài/Escape/scroll/resize (Cả hai)

**Bước:** Mở menu **Thêm mới ▼**, **Thao tác**, và menu `...` của dòng; lần lượt click ngoài, nhấn Escape, scroll bảng, resize.  
**Mong đợi:** Menu đóng; không click xuyên; không còn popup sai vị trí.

### MENU-02 — Menu dòng sát mép viewport (Cả hai)

**Bước:** Mở `...` ở dòng đầu/cuối khi viewport hẹp và bảng đang scroll ngang.  
**Mong đợi:** Menu nằm trong viewport, không bị bảng cắt, không che sai dòng; chọn đúng sản phẩm.

## 8. Chi tiết sản phẩm

### DETAIL-01 — Mở/đóng chi tiết (Cả hai)

**Bước:** Tại `QA-PROD-A` bấm `...` → **Chi tiết** → đóng bằng `X`; mở lại rồi click backdrop.  
**Mong đợi:** Đúng tên/mã; cả hai cách đóng hoạt động; không thay đổi dữ liệu.

### DETAIL-02 — Đối chiếu đầy đủ trường (Cả hai)

**Bước:** Mở chi tiết `QA-PROD-B`; đối chiếu mã, barcode, loại, danh mục, thương hiệu, NCC, đơn vị, các giá, VAT, tổng tồn, có thể bán, bảo hành, màu, kích cỡ, xuất xứ, ngày tạo.  
**Mong đợi:** Giá trị đúng; giá định dạng tiền; trường thiếu là `—`; trạng thái đúng tone.

### DETAIL-03 — Chi tiết tồn theo kho (Cả hai)

**Bước:** Trong modal bấm **Chi tiết tồn kho** → bấm lại để thu gọn.  
**Mong đợi:** Có loading; danh sách từng kho và số lượng đúng; tổng các kho bằng **Tổng tồn**; không có stock hiển thị empty state; mở/đóng không gọi nhầm sản phẩm.

### DETAIL-04 — Lỗi tải tồn (Cả hai)

**Bước:** Chặn `GET /api/products/products/{id}/stocks` → mở chi tiết → **Chi tiết tồn kho**.  
**Mong đợi:** Không crash/không hiển thị số giả. Nếu chỉ hiện empty mà không báo lỗi, ghi nhận lỗi UX.

### DETAIL-05 — Link tuổi tồn (Cả hai)

**Bước:** Bấm mã SP; quay lại. Bấm badge **Tồn lâu/Bán chậm** hoặc **Kiểm tra tồn lâu**; bấm badge **Đang xả** nếu có.  
**Mong đợi:** Mở `/products/storage-duration` với `q=<mã>` và tab đúng rủi ro; Back quay lại danh sách; không mất route/layout.

## 9. Thêm sản phẩm (ADMIN và EMPLOYEE)

### CREATE-01 — Mở/hủy modal

**Bước:** Bấm **Thêm mới** → bấm **Hủy**; mở lại → bấm `X`; mở lại → click backdrop.  
**Mong đợi:** Modal **Thêm sản phẩm**; cả ba cách đóng hoạt động khi không lưu; không tạo record.

### CREATE-02 — Tạo tối thiểu hợp lệ

**Bước:** **Thêm mới** → nhập mã duy nhất, tên; chọn **Loại sản phẩm**, **Đơn vị**, **Danh mục**; nhập **Giá bán**; tại **Thêm kho hàng** chọn Kho A, nhập tồn `0` → bấm **Tạo sản phẩm**.  
**Mong đợi:** Nút chuyển **Đang lưu...**, chống double click; modal đóng; sản phẩm tạo thành công, barcode được tự sinh, tổng tồn 0, trang về 1.

### CREATE-03 — Tạo đầy đủ nhiều kho

**Bước:** Điền mọi trường (giá vốn/sỉ, khối lượng, size, màu, trạng thái, VAT, bảo hành, xuất xứ) → thêm Kho A `10`, Kho B `7` → **Tạo sản phẩm**.  
**Mong đợi:** Tổng preview 17; sau lưu chi tiết đúng mọi trường; tồn từng kho 10/7 và tổng 17.

### CREATE-04 — Bắt buộc và focus lỗi đầu

**Bước:** Mở modal trống → **Tạo sản phẩm**. Sửa lần lượt rồi submit lại: mã, tên, loại, đơn vị, giá bán, danh mục, kho.  
**Mong đợi:** Mỗi trường bắt buộc có lỗi rõ; focus/scroll tới lỗi đầu theo thứ tự; không gọi API cho tới khi hợp lệ.

### CREATE-05 — Validation số

**Bước:** Thử lần lượt `-1`, chữ, khoảng trắng, số thập phân và số cực lớn tại giá bán/giá vốn/giá sỉ/khối lượng; thử VAT/bảo hành âm và thập phân.  
**Mong đợi:** Giá/khối lượng không âm; giá bán bắt buộc; dữ liệu không hợp lệ bị chặn phía UI hoặc backend 422 với thông báo, không tạo dữ liệu hỏng. VAT/bảo hành phải không âm và theo quy tắc nghiệp vụ; nếu browser cho số không hợp lệ lọt qua, ghi bug.

### CREATE-06 — Validation tồn kho

**Bước:** Chọn kho → xóa số lượng → submit; thử `-1`, `1.5`, chữ, paste ký tự; thử `0` và số nguyên lớn.  
**Mong đợi:** Chỉ số nguyên không âm; trống/âm/thập phân/chữ bị chặn; `0` hợp lệ; tổng tồn cập nhật đúng.

### CREATE-07 — Thêm/bỏ kho

**Bước:** Thêm 2 kho → bỏ một kho → thử bỏ kho cuối cùng.  
**Mong đợi:** Kho bị bỏ quay lại dropdown; dữ liệu quantity của kho bị bỏ không lưu; nút bỏ kho cuối disabled; không thể submit không có kho.

### CREATE-08 — Chọn hết kho/kho inactive

**Bước:** Thêm tất cả kho hoạt động.  
**Mong đợi:** Dropdown disabled và hiện **Đã chọn hết kho đang hoạt động**; kho inactive không xuất hiện; không có kho trùng.

### CREATE-09 — Mã trùng và dữ liệu trim

**Bước:** Nhập mã đã tồn tại và tên có khoảng trắng đầu/cuối → submit.  
**Mong đợi:** API trả lỗi trùng mã, modal giữ dữ liệu và hiện thông báo; không tạo record; tên/mã hợp lệ được trim khi lưu.

### CREATE-10 — Unicode/XSS/độ dài biên

**Bước:** Nhập tên/màu/size/xuất xứ tiếng Việt, emoji, chuỗi HTML; thử 255 và 256+ ký tự ở trường giới hạn → submit.  
**Mong đợi:** Unicode giữ nguyên; HTML chỉ là text; quá giới hạn trả 422 rõ ràng; không crash/XSS.

### CREATE-11 — Lỗi mạng/server và retry

**Bước:** Điền hợp lệ → chặn POST create → **Tạo sản phẩm** → bỏ chặn → bấm lại.  
**Mong đợi:** Modal không đóng khi lỗi, dữ liệu còn nguyên, nút hết loading, thông báo rõ; retry chỉ tạo đúng 1 record.

## 10. Sửa sản phẩm — ADMIN

### EDIT-01 — Quyền và dữ liệu prefill

**Bước:** ADMIN bấm `...` → **Sửa** ở `QA-PROD-A`.  
**Mong đợi:** Modal **Sửa sản phẩm**, dữ liệu prefill đúng; mã và barcode disabled; tải đúng tồn từng kho.

### EDIT-02 — Sửa thông tin không đổi tồn

**Bước:** Đổi tên, giá, trạng thái, danh mục, thuộc tính → không đổi tồn → **Cập nhật**.  
**Mong đợi:** Chỉ trường đổi thay đổi; mã/barcode/tồn các kho giữ nguyên; danh sách và chi tiết cập nhật.

### EDIT-03 — Đổi tồn kho hiện có

**Bước:** Sửa Kho A `10 → 12`, Kho B giữ nguyên → **Cập nhật**.  
**Mong đợi:** Chỉ Kho A được gửi/đổi; Kho B không mất; tổng tồn tăng đúng 2; **Tồn hiện tại** trước lưu đúng giá trị cũ.

### EDIT-04 — Thêm kho mới khi sửa

**Bước:** Chọn **Thêm kho hàng** → thêm kho chưa có, nhập `3` → **Cập nhật**.  
**Mong đợi:** Tạo stock kho mới 3; stock cũ giữ nguyên; tổng tăng đúng.

### EDIT-05 — Bỏ kho khi sửa

**Bước:** Có ít nhất 2 kho → bấm nút bỏ một kho → **Cập nhật**.  
**Mong đợi cần xác minh:** Nếu nghiệp vụ coi bỏ kho là xóa/đưa tồn về 0 thì backend phải thực hiện đúng và có xác nhận; nếu backend chỉ bỏ dòng khỏi payload nhưng stock cũ vẫn còn, UI không được tạo hiểu nhầm. Ghi bug nếu hành vi không rõ hoặc trái mong đợi.

### EDIT-06 — Validation và cancel

**Bước:** Xóa tên/giá/danh mục hoặc nhập số âm → **Cập nhật**; sau đó bấm **Hủy**.  
**Mong đợi:** Validation giống create; không gọi API khi sai; Hủy không lưu bất kỳ thay đổi draft nào.

### EDIT-07 — Concurrent update

**Bước:** Mở cùng sản phẩm ở hai tab ADMIN; tab A sửa tên và lưu; tab B sửa giá và lưu.  
**Mong đợi:** Không âm thầm làm mất trường vừa đổi ở A; vì PATCH chỉ gửi payload form hiện có, đối chiếu toàn bộ trường. Nếu last-write-wins làm mất dữ liệu mà không cảnh báo, ghi lỗi concurrency.

### EDIT-08 — Lỗi load stock/update

**Bước:** Chặn GET stocks khi mở edit; thử lưu. Sau đó bỏ chặn, mở lại và chặn PATCH khi bấm **Cập nhật**.  
**Mong đợi:** Không cho lưu khi stock chưa tải; hiện **Không tải được tồn kho...**; PATCH lỗi giữ modal/dữ liệu và cho retry.

## 11. Xóa một sản phẩm — ADMIN

### DEL-01 — Hủy xác nhận

**Bước:** `QA-PROD-ZERO` → `...` → **Xóa** → bấm **Hủy**; lặp lại bằng `X` và backdrop.  
**Mong đợi:** Modal đóng, sản phẩm vẫn còn, không gọi DELETE.

### DEL-02 — Xóa thành công sản phẩm tồn 0

**Bước:** Mở xác nhận → kiểm tra đúng tên/mã → bấm **Xóa**.  
**Mong đợi:** Nút **Đang xóa...**, không đóng được khi đang xử lý; sau thành công dòng biến mất và tổng giảm 1.

### DEL-03 — Chặn xóa sản phẩm còn tồn/tồn khóa

**Bước:** Xóa `QA-PROD-STOCK`.  
**Mong đợi:** HTTP 409; modal giữ mở và hiện **Không thể xóa sản phẩm đang còn tồn kho hoặc tồn khóa...**; sản phẩm và tồn không đổi.

### DEL-04 — Chặn xóa do tham chiếu nghiệp vụ

**Bước:** Với fixture tồn 0 nhưng có lịch sử giao dịch/chi tiết hóa đơn/phiếu kho, thử xóa.  
**Mong đợi:** Nếu backend có invariant tham chiếu thì trả 409 cụ thể, không xóa dây chuyền. Nếu xóa được làm mất liên kết dữ liệu, báo lỗi nghiêm trọng.

### DEL-05 — Lỗi mạng/double click

**Bước:** Chặn DELETE → bấm **Xóa** nhiều lần → bỏ chặn và retry.  
**Mong đợi:** Chỉ một request khi loading; lỗi hiển thị trong modal; retry thành công một lần, không crash 404.

## 12. Thao tác hàng loạt — ADMIN

### BULK-01 — Đổi trạng thái nhanh

**Bước:** Chọn 2 fixture → **Thao tác** → **Đổi trạng thái sản phẩm** → chọn từng trạng thái.  
**Mong đợi:** Tất cả selected đổi đúng; các trường khác không đổi; dữ liệu reload; không tác động dòng không chọn.

### BULK-02 — Tùy chọn trạng thái

**Bước:** Chọn dòng → mở submenu trạng thái → **Tùy chọn khác...** → chọn trạng thái → **Cập nhật**; thử **Hủy**/`X`/backdrop.  
**Mong đợi:** Modal ghi đúng số selected; nút disabled hợp lý khi loading; cancel không ghi.

### BULK-03 — Cập nhật danh mục

**Bước:** Chọn 2 dòng → **Thao tác** → **Cập nhật danh mục** → chưa chọn danh mục quan sát nút → chọn danh mục B → **Cập nhật**.  
**Mong đợi:** Nút update disabled khi chưa chọn; cả hai dòng đổi danh mục; không đổi trường khác.

### BULK-04 — Xóa nhiều: Cancel

**Bước:** Chọn fixture → **Thao tác** → **Xóa các dòng đã chọn** → bấm Cancel tại confirm trình duyệt.  
**Mong đợi:** Không DELETE, lựa chọn giữ nguyên.

### BULK-05 — Xóa nhiều: tất cả thành công

**Bước:** Chọn nhiều fixture tồn 0 không tham chiếu → xác nhận OK.  
**Mong đợi:** Xóa tất cả, clear selection, tổng giảm đúng.

### BULK-06 — Kết quả một phần

**Bước:** Chọn một fixture xóa được và một fixture còn tồn → xác nhận xóa; lặp tương tự với đổi trạng thái/cập nhật danh mục bằng cách chặn một PATCH.  
**Mong đợi:** Hiện `Đã xóa/cập nhật X/Y`; dòng thành công đúng, dòng lỗi giữ nguyên; reload không che lỗi; selected không trỏ ID đã xóa.

### BULK-07 — Lựa chọn qua trang

**Bước:** Chọn dòng ở trang 1 và trang 2 → thực hiện đổi trạng thái/xóa (chỉ fixture an toàn).  
**Mong đợi:** Tác động đúng toàn bộ ID selected, không chỉ trang hiện tại; số lượng confirm đúng.

## 13. Import CSV — ADMIN và EMPLOYEE

### IMPORT-01 — Mở/đóng và tải file mẫu

**Bước:** Bấm mũi tên cạnh **Thêm mới** → **Nhập từ file** → bấm **Tải file mẫu CSV** → đóng bằng Hủy/X/backdrop.  
**Mong đợi:** Tải `mau-import-san-pham.csv`, UTF-8 BOM, phân cách `;`, header và dòng mẫu mở đúng tiếng Việt; đóng không import.

### IMPORT-02 — Không file/không kho

**Bước:** Không chọn file; quan sát **Upload và nhập**. Trong môi trường không có kho active thử mở modal.  
**Mong đợi:** Nút upload disabled khi chưa có file; không có kho phải báo/không cho import; lỗi tải kho hiển thị rõ.

### IMPORT-03 — Chọn/đổi file

**Bước:** Bấm vùng **Chọn file CSV** → chọn CSV → bấm lại chọn file khác; thử chọn file không `.csv`.  
**Mong đợi:** Hiện đúng tên file cuối; file picker lọc `.csv`; backend vẫn kiểm tra file/kích thước.

### IMPORT-04 — Thêm mới hợp lệ dấu `;` và `,`

**Bước:** Chọn kho A, mode **Thêm mới** → upload CSV hợp lệ delimiter `;`; lặp với CSV delimiter `,`.  
**Mong đợi:** Modal kết quả ghi đúng created/updated/skipped/stockAdded; barcode tự sinh nếu thiếu; sản phẩm và tồn nằm đúng kho; `voucherId` chỉ hiển thị nếu backend trả.

### IMPORT-05 — Mã trùng ở mode Thêm mới

**Bước:** CSV chứa mã đã tồn tại và một mã mới → mode **Thêm mới** → upload.  
**Mong đợi:** Mã trùng bị skip với cảnh báo dòng; mã mới được tạo; sản phẩm trùng và tồn của nó không bị sửa/cộng.

### IMPORT-06 — ADMIN cập nhật mã trùng

**Bước:** ADMIN chọn **Cập nhật thông tin (sửa dữ liệu và cộng tồn)** → CSV có mã `QA-PROD-A`, đổi tên/giá, qty `3` → upload vào Kho A.  
**Mong đợi:** `updated=1`, `created=0`; thông tin đổi và tồn Kho A được **cộng thêm 3**, không set thành 3; các kho khác giữ nguyên.

### IMPORT-07 — EMPLOYEE không được import-update

**Bước:** EMPLOYEE mở import; nếu dropdown vẫn cho chọn **Cập nhật thông tin**, chọn nó → upload dòng trùng mã qty >0.  
**Mong đợi:** Request bị ép mode **Thêm mới**; dòng bị skip; không đổi thông tin/tồn. Nếu vẫn update/cộng tồn, FAIL bảo mật.

### IMPORT-08 — Dòng thiếu tên/mã/barcode

**Bước:** CSV gồm: thiếu tên; thiếu mã nhưng có tên; thiếu barcode; dòng rỗng.  
**Mong đợi theo backend hiện tại:** thiếu tên và dòng rỗng bị skip/cảnh báo; thiếu mã được sinh mã tự động; thiếu barcode được sinh barcode; số summary đúng từng dòng.

### IMPORT-09 — Số âm/thập phân/chữ/rất lớn

**Bước:** CSV có qty âm, qty thập phân, giá âm, giá chữ, số rất lớn.  
**Mong đợi:** Dữ liệu không hợp lệ phải bị reject/skip rõ ràng, không tạo giá/tồn âm, NaN hoặc overflow. Backend hiện cast số trực tiếp; nếu chấp nhận giá âm hoặc dữ liệu sai, ghi bug validation.

### IMPORT-10 — Header/encoding/cột lạ

**Bước:** Thử header tiếng Việt chuẩn, không dấu, alias tiếng Anh, BOM/no-BOM, thứ tự cột khác, cột thừa, header trống, file chỉ header, encoding không UTF-8.  
**Mong đợi:** Alias hỗ trợ map đúng; cột thừa bị bỏ qua an toàn; file không dữ liệu summary 0; header/file không đọc được báo lỗi 422; không tạo record rác.

### IMPORT-11 — Trùng barcode/mã trong cùng file

**Bước:** CSV có hai dòng cùng mã; hai dòng khác mã nhưng cùng barcode.  
**Mong đợi:** Không tạo duplicate; dòng lỗi bị skip và liệt kê đúng line; transaction không làm sai summary/tồn.

### IMPORT-12 — File lớn và giới hạn 20 MB

**Bước:** Upload file sát 20 MB và file >20 MB.  
**Mong đợi:** File hợp lệ xử lý có loading và không double submit; >20 MB bị 422, không ghi một phần ngoài quy tắc transaction.

### IMPORT-13 — Lỗi mạng và đóng khi loading

**Bước:** Chặn POST import → upload; trong lúc loading thử Hủy/X/backdrop.  
**Mong đợi:** Nút/đóng bị disabled phù hợp; lỗi hiện rõ, modal giữ file để retry; không import hai lần.

## 14. Xuất Excel — Cả hai vai trò

### EXPORT-01 — Mở/đóng và focus

**Bước:** **Thao tác** → **Xuất dữ liệu** → đóng bằng X, Hủy, backdrop, Escape; mở lại và Tab/Shift+Tab.  
**Mong đợi:** Modal reset mặc định mỗi lần; focus nằm trong modal, trap đúng, Escape đóng khi không loading, focus quay về trigger.

### EXPORT-02 — Trang hiện tại

**Bước:** Áp dụng filter/sort → mở export → chọn **Trang hiện tại** → **Xuất file**.  
**Mong đợi:** `.xlsx` chứa đúng các dòng đang hiển thị (tối đa 15), đúng thứ tự/filter; không chứa trang khác.

### EXPORT-03 — Tất cả dữ liệu theo bộ lọc

**Bước:** Có >100 kết quả hoặc đủ nhiều trang → chọn **Tất cả dữ liệu** → export.  
**Mong đợi:** Số dòng bằng tổng filtered, không duplicate/missing; đúng sort và kho/trạng thái/từ khóa hiện áp dụng.

### EXPORT-04 — Chọn/bỏ/tìm cột

**Bước:** Tìm tên cột → **Chọn tất cả/Bỏ tất cả** vùng lọc → tick một số cột → export.  
**Mong đợi:** Chỉ cột đã chọn xuất hiện; toggle chỉ tác động cột đang lọc; ít nhất một cột bắt buộc.

### EXPORT-05 — Không chọn cột

**Bước:** Bỏ toàn bộ cột → bấm **Xuất file**.  
**Mong đợi:** Cảnh báo **Vui lòng chọn ít nhất 1 cột...**; không tạo file.

### EXPORT-06 — Đổi tên workbook/sheet/header

**Bước:** Đổi tên file, tên sheet và custom label từng cột; thử để trống, ký tự Excel cấm, tên rất dài.  
**Mong đợi:** Tên hợp lệ được áp dụng; trống fallback mặc định; ký tự/tên không hợp lệ được sanitize hoặc báo rõ, không crash.

### EXPORT-07 — Dữ liệu và định dạng

**Bước:** Mở file bằng Excel/LibreOffice; kiểm tra Unicode, mã/barcode có số 0 đầu, ngày, giá, tồn, ký tự công thức bắt đầu `= + - @`.  
**Mong đợi:** Tiếng Việt đúng; mã/barcode không mất số 0/chuyển scientific; dữ liệu text không gây CSV/Excel formula injection; giá/tồn đúng.

### EXPORT-08 — Empty/error/loading

**Bước:** Lọc empty → export current/all; sau đó chặn một request tải trang khi export all.  
**Mong đợi:** Empty tạo file header hoặc báo không có dữ liệu nhất quán; lỗi hiện **Xuất Excel thất bại**, modal không treo; không thể đóng/double export khi loading.

### EXPORT-09 — Tab Google Sheets

**Bước:** Trong modal bấm tab **Google Sheets**; dùng ArrowLeft/ArrowRight giữa hai tab.  
**Mong đợi:** Hiển thị đúng trạng thái chưa hỗ trợ/coming soon, không giả vờ export; keyboard tab semantics đúng.

## 15. In mã vạch — Cả hai vai trò

### BAR-01 — Mở workspace

**Bước:** Tick 2 sản phẩm → **Thao tác** → **In mã vạch**.  
**Mong đợi:** Header tab trang ẩn; hiện **In mã vạch sản phẩm**, đúng 2 sản phẩm/2 tem; mỗi dòng quantity mặc định 1.

### BAR-02 — Quay lại

**Bước:** Đổi cấu hình/quantity → bấm **Quay lại danh sách**.  
**Mong đợi:** Trở lại `/products`, tab/header hiện lại; selection còn để có thể mở lại; không reload toàn trang.

### BAR-03 — Tìm và thêm sản phẩm

**Bước:** Gõ tên/mã/barcode trong ô **Tìm hoặc quét...** → chọn kết quả; chọn lại sản phẩm đã có.  
**Mong đợi:** Debounce/loading/dropdown đúng; thêm mới thành dòng qty 1; chọn sản phẩm đã có tăng qty 1; ô search được xóa.

### BAR-04 — Enter/scanner/no-result/race

**Bước:** Nhập mã chính xác → Enter; quét barcode; nhập mã không có; gõ nhanh A rồi B.  
**Mong đợi:** Exact match thêm đúng; không exact thì chọn kết quả hợp lý/hiện dropdown; no-result báo rõ; response cũ không ghi đè; focus thuận tiện cho lần quét tiếp.

### BAR-05 — Nhiều sản phẩm trùng mã quét

**Bước:** Với dữ liệu test có nhiều match theo query nhưng không exact duy nhất, quét/Enter.  
**Mong đợi:** Không tự thêm nhầm; báo **Có nhiều sản phẩm khớp...**, yêu cầu chọn thủ công.

### BAR-06 — Sửa số tem

**Bước:** Nhập qty `2`, `0`, `-1`, rỗng, thập phân, chữ, số rất lớn.  
**Mong đợi:** Tối thiểu 1; tổng tem cập nhật; không NaN/âm/thập phân nếu tem yêu cầu số nguyên; số quá lớn phải có guard hiệu năng hoặc cảnh báo.

### BAR-07 — Xóa dòng/xóa toàn bộ

**Bước:** Bấm icon xóa một dòng; sau đó **Thao tác** → **Xóa danh sách toàn bộ đã chọn**.  
**Mong đợi:** Dòng/tổng giảm đúng; xóa toàn bộ cho empty state và clear selection ở danh sách; bấm in khi empty cảnh báo giữ ít nhất một sản phẩm.

### BAR-08 — Xuất dữ liệu in

**Bước:** **Thao tác** → **Xuất dữ liệu**.  
**Mong đợi:** File `in-ma-vach-YYYY-MM-DD.xlsx` chứa đúng mã, tên, barcode, giá và số tem của mọi dòng.

### BAR-09 — Các chuẩn barcode

**Bước:** Lần lượt chọn **Tự động**, **EAN-13**, **Code 128**, **Code 128A**, **Code 39**, **QR Code** với mã hợp lệ.  
**Mong đợi:** Preview và **Chuẩn in thực tế** khớp; EAN-13 hợp lệ đúng checksum/format; QR và linear rõ; không render HTML từ dữ liệu.

### BAR-10 — Mã không hợp lệ cho chuẩn ép buộc

**Bước:** Chọn EAN-13 với mã không đủ 12/13 số; Code128A với ký tự không hỗ trợ; Code39 với ký tự không hỗ trợ.  
**Mong đợi:** Preview có lỗi; bấm in bị chặn bằng **Không thể in an toàn**, không mở bản in lỗi.

### BAR-11 — Toggle nội dung tem

**Bước:** Bật/tắt tên shop, mã SP, tên SP, 3 dòng tên, giá, giá cũ; sửa tên shop và hậu tố tiền.  
**Mong đợi:** Preview cập nhật ngay; **3 dòng tên** disabled khi tắt tên; giá cũ chỉ hiện khi sản phẩm có oldPrice; text dài không tràn tem.

### BAR-12 — Khổ giấy

**Bước:** Bấm **Hiển thị tất cả 14 khổ giấy** → chọn từng radio → **Ẩn bớt khổ giấy**.  
**Mong đợi:** Đủ 14 mẫu; radio và khổ đang chọn đồng bộ; danh sách rút gọn giữ mẫu đang chọn và mẫu gần đây.

### BAR-13 — Lề in

**Bước:** Nhập lề trái/trên: `0`, số hợp lệ, âm, thập phân, rất lớn.  
**Mong đợi:** Bản in clamp về vùng vừa trang; không đẩy nhãn ra ngoài; giá trị không hợp lệ không tạo CSS hỏng.

### BAR-14 — Xem và in từng khổ/nút chính

**Bước:** Bấm **Xem và in** trên một card; đóng print dialog; bấm **Xem và in khổ đang chọn**.  
**Mong đợi:** Mở đúng cửa sổ preview, đúng kích thước/columns/rows, số nhãn bằng tổng qty, ngắt trang đúng; dialog chỉ mở một lần.

### BAR-15 — Popup bị chặn

**Bước:** Chặn pop-up trình duyệt → bấm in → cho phép pop-up → bấm lại.  
**Mong đợi:** Cảnh báo rõ cho phép pop-up; lần sau mở được, không bị khóa bởi trạng thái printing cũ.

### BAR-16 — Mật độ/khổ quá nhỏ

**Bước:** Bật tất cả text, dùng tên dài + linear barcode dài, chọn khổ nhỏ → in.  
**Mong đợi:** Nếu không đủ module width/height/quiet zone phải chặn và hướng dẫn chọn khổ lớn/ẩn thông tin; không in barcode khó quét.

### BAR-17 — Quét tem thật

**Bước:** In ít nhất EAN-13, Code128 và QR ở khổ thực → dùng scanner/điện thoại quét 5 lần mỗi tem.  
**Mong đợi:** 5/5 lần trả đúng barcode/mã, không mất ký tự; kích thước đo thực tế khớp template khi Scale 100%, Margins None, không Fit to page.

### BAR-18 — Lưu cấu hình localStorage

**Bước:** Đổi loại mã/khổ/toggle/shop/hậu tố/lề → quay lại → mở workspace lại; reload browser.  
**Mong đợi:** Cấu hình được giữ; localStorage hỏng/disabled thì fallback mặc định, không crash; tên shop API chỉ tải khi chưa có setting.

### BAR-19 — Click outside dropdown và lỗi API search

**Bước:** Mở dropdown search → click ngoài; sau đó chặn cả ba request tìm q/code/barcode.  
**Mong đợi:** Dropdown đóng khi blur; nếu ít nhất một request thành công vẫn dùng kết quả; nếu tất cả fail báo **Không thể tìm sản phẩm...**.

## 16. Lịch sử sửa/xóa

### HIST-01 — Mặc định 7 ngày (Cả hai)

**Bước:** Bấm tab **Lịch sử sửa/xóa**.  
**Mong đợi:** Từ ngày = hôm nay - 6 ngày, đến ngày = hôm nay; KPI bản ghi/trang/khoảng ngày đúng; tối đa 15 dòng.

### HIST-02 — Log sau create/edit/delete/import/bulk (theo vai trò thực hiện)

**Bước:** Thực hiện riêng một create, edit, delete, import update, bulk status/category → quay lại history → **Làm mới** hoặc lọc mã fixture.  
**Mong đợi:** Có log tương ứng đúng mã/tên, loại log, kiểu log, người thao tác, thời gian; log xóa vẫn giữ snapshot mã/tên. Nếu nghiệp vụ yêu cầu audit mà không sinh log, ghi lỗi nghiêm trọng.

### HIST-03 — Tìm mã/tên/barcode scanner (Cả hai)

**Bước:** Nhập mã/tên → **Lọc**; sau đó quét barcode vào ô search.  
**Mong đợi:** Chỉ log đúng sản phẩm; scanner áp dụng ngay và trang về 1; không match hiển thị empty phù hợp.

### HIST-04 — Lọc từng loại log/kiểu log/người sửa (Cả hai)

**Bước:** Chọn lần lượt từng option trong ba dropdown → **Lọc**; sau đó kết hợp cả ba.  
**Mong đợi:** Options lấy từ meta; dòng là giao của điều kiện; badge tone đúng loại log.

### HIST-05 — Khoảng ngày (Cả hai)

**Bước:** Chọn cùng một ngày; khoảng nhiều ngày; bỏ trống một đầu; chọn `Từ ngày > Đến ngày` → **Lọc**.  
**Mong đợi:** Bao gồm trọn ngày biên theo timezone local; một đầu trống xử lý đúng; khoảng đảo phải báo validation hoặc empty rõ, không 500.

### HIST-06 — Làm mới lịch sử (Cả hai)

**Bước:** Áp dụng nhiều filter → bấm **Làm mới**.  
**Mong đợi:** Reset về mặc định 7 ngày, xóa search/dropdown, trang 1; KPI bộ lọc và dữ liệu cập nhật.

### HIST-07 — Phân trang/loading/empty/failure (Cả hai)

**Bước:** Dùng >15 log để chuyển trang; lọc empty; chặn GET edit-logs.  
**Mong đợi:** Paging đúng, không duplicate; loading/empty text đúng; lỗi không crash. Nếu lỗi bị thể hiện như “không có dữ liệu” mà không báo, ghi lỗi UX.

### HIST-08 — Xuất Excel current/all (Cả hai)

**Bước:** Áp dụng filter → **Xuất Excel** → export trang hiện tại và tất cả; tùy chỉnh cột/tên.  
**Mong đợi:** File chỉ có log đúng filter/khoảng ngày; current tối đa 15; all đủ tổng; cột thời gian định dạng `vi-VN`; các ca modal export ở mục 14 đều pass.

### HIST-09 — XSS và dữ liệu log thiếu (Cả hai)

**Bước:** Xem log fixture tên chứa HTML và log có createdBy/logAction/null date thiếu.  
**Mong đợi:** HTML là text; thiếu dữ liệu hiển thị `-`/`—`/`Hệ thống`; ngày sai không crash.

## 17. Phân quyền và bảo mật

### PERM-01 — ADMIN thấy đúng thao tác

**Bước:** ADMIN mở **Thao tác** và menu `...`.  
**Mong đợi:** Có sửa, xóa, đổi trạng thái, cập nhật danh mục, xóa nhiều; create/import/export/print/detail cũng có.

### PERM-02 — EMPLOYEE không thấy thao tác quản trị

**Bước:** EMPLOYEE mở cùng menu.  
**Mong đợi:** Không có **Sửa**, **Xóa**, **Đổi trạng thái**, **Cập nhật danh mục**, **Xóa các dòng đã chọn**; vẫn có Detail/Export/In barcode/Thêm mới/Import theo matrix.

### PERM-03 — Đổi vai trò/session khi trang đang mở

**Bước:** Mở trang EMPLOYEE; tại môi trường quản trị đổi role/session (không sửa production) → reload.  
**Mong đợi:** UI quyền cập nhật theo `/auth/me`, không giữ nút admin từ cache; khi auth/me fail phải fail-safe, không lộ nút quản trị.

### PERM-04 — EMPLOYEE không gọi nhầm API khi dùng UI

**Bước:** Mở Network → thực hiện mọi thao tác được phép; thử các menu không được phép.  
**Mong đợi:** Không có PATCH/DELETE sản phẩm từ thao tác bị ẩn; import employee luôn gửi mode thêm mới.

### PERM-05 — Route vẫn truy cập được cho EMPLOYEE

**Bước:** EMPLOYEE nhập trực tiếp `/products` và `/products?tab=history`.  
**Mong đợi:** Hai route được phép theo access frontend hiện tại; dữ liệu nhạy cảm (đặc biệt giá vốn/lịch sử) chỉ hiển thị nếu đúng chính sách doanh nghiệp. Nếu chính sách không cho phép, báo gap yêu cầu.

### PERM-06 — API sửa trực tiếp bằng EMPLOYEE (security)

**Bước:** Trong môi trường test, dùng session EMPLOYEE replay một PATCH update đã bắt từ ADMIN nhưng đổi fixture riêng.  
**Mong đợi:** HTTP 403 và dữ liệu không đổi. Nếu 200, FAIL nghiêm trọng: frontend-only authorization.

### PERM-07 — API xóa trực tiếp bằng EMPLOYEE (security)

**Bước:** Replay DELETE fixture zero-stock bằng session EMPLOYEE.  
**Mong đợi:** 403, fixture còn nguyên. Nếu xóa được, FAIL nghiêm trọng.

### PERM-08 — API import update trực tiếp bằng EMPLOYEE (security)

**Bước:** Gửi multipart import mode update bằng session EMPLOYEE với fixture trùng mã.  
**Mong đợi:** 403 hoặc backend cưỡng chế add-only; tuyệt đối không sửa/cộng tồn sản phẩm cũ.

### PERM-09 — Không đăng nhập

**Bước:** Mở cửa sổ ẩn danh `/products`; gọi các route list/create/update/delete bằng session rỗng trong môi trường test.  
**Mong đợi:** Chuyển login/401; không đọc/ghi dữ liệu. Nếu API public, FAIL critical.

## 18. Khả dụng, responsive và accessibility

### UI-01 — Desktop chuẩn

**Bước:** Test 1920×1080 và 1366×768; mở mọi menu/modal.  
**Mong đợi:** Toolbar sticky không che header; bảng đọc được; menu/modal trong viewport; không body horizontal overflow ngoài vùng table scroll.

### UI-02 — Tablet/mobile

**Bước:** Test 1024×768, 768×1024, 390×844, 360×800; lặp filter, menu dòng, create/edit/import/export, barcode workspace, history.  
**Mong đợi:** Controls không chồng/cắt; bảng scroll ngang trong card; modal scroll được và footer/nút reachable; không mất chức năng so với desktop.

### UI-03 — Zoom/text dài

**Bước:** Zoom 200%; dùng tên/danh mục dài; tăng font trình duyệt.  
**Mong đợi:** Text wrap/truncate có title hợp lý; icon không lệch; vùng click không nhỏ hơn phần hiển thị; không mất nút.

### UI-04 — Hover/focus/active/disabled/loading

**Bước:** Dùng chuột và Tab qua tab, input, select, checkbox, button, menu; quan sát hover/focus; thử khi loading.  
**Mong đợi:** Focus visible; active tab và selected row không chỉ dựa vào màu; disabled không click được; hover không đổi layout.

### UI-05 — Keyboard-only

**Bước:** Không dùng chuột: Tab/Shift+Tab, Space checkbox/button, Enter submit, Escape menu/export, arrow ở tab export/select.  
**Mong đợi:** Hoàn tất được các luồng đọc/lọc/export; focus không thất lạc phía sau modal; menu/dialog có semantics hợp lý.

### UI-06 — Screen reader labels

**Bước:** Dùng Accessibility tree kiểm tra tab, checkbox chọn tất cả/từng SP, nút `...`, bỏ kho, quantity tồn/tem, export dialog.  
**Mong đợi:** Tên accessible duy nhất, `aria-selected/expanded/controls/haspopup` cập nhật đúng; icon decorative không đọc thừa.

### UI-07 — Modal stacking/body scroll

**Bước:** Mở/đóng tuần tự các modal; click nhanh mở action khác; scroll nền khi modal mở.  
**Mong đợi:** Chỉ một modal/top layer tương tác; không click xuyên; sau đóng trang không kẹt scroll/focus.

### UI-08 — Trình duyệt

**Bước:** Chạy smoke + export + print trên Chrome và Edge bản hỗ trợ; nếu doanh nghiệp dùng Firefox/Safari thì chạy thêm.  
**Mong đợi:** Hành vi, file download, print popup và layout nhất quán.

## 19. Tính nhất quán dữ liệu và regression chéo

### DATA-01 — Tổng tồn invariant

**Bước:** Create/edit/import fixture nhiều kho → đối chiếu danh sách, Detail > tồn kho, trang tồn kho và API.  
**Mong đợi:** `Tổng tồn = tổng qty mọi kho`; filter kho chỉ đưa vào sản phẩm có qty >0 ở kho; không có số âm.

### DATA-02 — Unique invariant

**Bước:** Tạo/import đồng thời hai request cùng mã hoặc barcode.  
**Mong đợi:** Chỉ một thành công; request còn lại 409; không duplicate/stock orphan.

### DATA-03 — Atomic create/update stock

**Bước:** Mô phỏng lỗi server giữa lưu product và stock trong DB test.  
**Mong đợi:** Transaction rollback toàn bộ; không có product không stock hoặc tổng tồn sai.

### DATA-04 — Refresh/tab/relogin

**Bước:** Sau mỗi create/edit/delete/import/bulk, reload cứng, đổi tab, logout/login lại.  
**Mong đợi:** Dữ liệu vẫn đúng, không chỉ đúng do React state/cache.

### DATA-05 — Audit actor/time

**Bước:** ADMIN và EMPLOYEE lần lượt tạo/import fixture; ADMIN sửa/xóa.  
**Mong đợi:** Nếu audit được yêu cầu, actor đúng tài khoản thực, timestamp đúng timezone, không ghi chung “Hệ thống” sai.

### DATA-06 — Regression sang tuổi tồn/tồn kho

**Bước:** Từ mã/badge mở tuổi tồn sau khi thay tồn; mở trang tồn kho liên quan.  
**Mong đợi:** Sản phẩm, giá, tồn và trạng thái đồng bộ; không có link 404/query sai.

## 20. Checklist kết thúc mỗi vòng vai trò

### ADMIN

- [ ] NAV/LIST/SORT/SEL/MENU/DETAIL pass.
- [ ] Create tối thiểu + đầy đủ + lỗi biên pass.
- [ ] Edit thông tin và tồn từng kho pass.
- [ ] Delete success + blocked pass.
- [ ] Bulk status/category/delete success + partial failure pass.
- [ ] Import add/update/invalid/large pass.
- [ ] Export current/all/custom columns pass.
- [ ] Barcode search/config/14 khổ/print thật pass.
- [ ] History filter/export/audit cross-check pass.
- [ ] Desktop/mobile/keyboard/network failure pass.

### EMPLOYEE

- [ ] Toàn bộ luồng read/filter/detail/history pass.
- [ ] Create và import add-only đúng chính sách hiện tại.
- [ ] Export và barcode print pass.
- [ ] Không thấy edit/delete/bulk admin.
- [ ] API update/delete/import-update bị backend chặn hoặc cưỡng chế đúng.
- [ ] Không đăng nhập không đọc/ghi được API.

## 21. Mức độ ưu tiên khi báo lỗi

- **Critical:** EMPLOYEE/anonymous sửa hoặc xóa được qua API; mất dữ liệu; xóa sản phẩm đang có giao dịch; import làm sai tồn diện rộng; XSS; duplicate do race.
- **High:** Tổng tồn sai; update làm mất stock kho khác; import update cộng/set tồn sai; audit thiếu/sai actor; export/print sai sản phẩm hoặc giá; không chặn barcode không quét được.
- **Medium:** Filter/sort/paging sai; partial bulk không báo; modal lỗi không retry; trạng thái loading/empty/error gây hiểu nhầm.
- **Low:** Căn chỉnh, text, hover/focus, responsive nhỏ nhưng không chặn thao tác.
