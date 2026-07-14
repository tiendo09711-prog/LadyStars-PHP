# Kịch bản kiểm thử thủ công đầy đủ — Hàng tồn lâu (`/products/storage-duration`)

> URL: `http://localhost:5173/products/storage-duration`  
> Phạm vi: toàn bộ UI trang Hàng tồn lâu, bộ lọc, URL/deep-link, phân trang, menu thao tác từng dòng, giá xả hàng, xuất Excel và điều hướng/prefill sang Chuyển kho/Xuất trả NCC.  
> Cơ sở lập test: `StorageDurationPage`, `ExportExcelModal`, `Pagination`, layout/quyền, API sản phẩm và logic backend tại source hiện tại (14/07/2026).

## 1. Cách dùng và quy ước

- Chạy **P0/Smoke** trước, sau đó P1, P2 và ma trận tổ hợp cuối tài liệu.
- Điền cột **KQ** bằng `PASS`, `FAIL`, `BLOCKED` hoặc `N/A`. Khi FAIL phải lưu ảnh/video, thời điểm, tài khoản, URL đầy đủ, request/response (che token) và lỗi Console.
- Không coi “UI có hiện số” là PASS. Phải đối soát API/DB hoặc fixture biết trước, đặc biệt các ngày, tồn chi nhánh, giá trị tồn và file Excel.
- Mỗi case nên bắt đầu từ trang đã tải ổn định, trừ khi case nói rõ kế thừa trạng thái trước đó.
- “Không lỗi kỹ thuật” nghĩa là không trắng trang, không request lặp, không lỗi đỏ Console, không `NaN/undefined/Invalid Date`, không click xuyên modal và không URL sai.
- Các case ghi **Probe nghiệp vụ** là điểm source hiện tại có nguy cơ không khớp kỳ vọng người dùng. Nếu kết quả chưa được PO xác nhận, ghi thực tế và mở issue để chốt thay vì tự kết luận PASS.

### Mẫu ghi lỗi

| Trường             | Nội dung cần ghi                                                  |
| ------------------ | ----------------------------------------------------------------- |
| Test case          | Ví dụ `SD-FL-014`                                                 |
| Môi trường         | Browser/version, viewport, tài khoản, thời gian/múi giờ           |
| Dữ liệu            | Mã SP, danh mục, chi nhánh, tồn tổng/tồn chi nhánh, ngày nhập/bán |
| Bước tái hiện      | Từng click/phím, URL trước và sau                                 |
| Thực tế / Mong đợi | Nêu con số hoặc field chênh lệch cụ thể                           |
| Bằng chứng         | Screenshot/video, Console, request + status + response, file xuất |

## 2. Oracle nghiệp vụ cần biết trước khi test

### 2.1 Phạm vi dữ liệu và công thức hiện tại

1. Danh sách chỉ lấy sản phẩm có **tồn tổng `qty > 0`**. Khi chọn chi nhánh, sản phẩm còn phải có stock tại chi nhánh đó `qty > 0`.
2. Ngưỡng trang cố định là **30 ngày**. Ngày được so theo đầu ngày local của backend:
   - Chưa từng bán và `daysFromStart >= 30` → `Tồn lâu` (`unsold_long`).
   - Đã từng bán và `daysFromLastSold >= 30` → `Bán chậm` (`slow_selling`).
   - Các trường hợp còn lại → `Bình thường`.
3. `Ngày nhập đầu`: giao dịch kho đầu tiên; nếu không có thì fallback `product.created_at`.
4. `Ngày XNK cuối`: giao dịch kho cuối; nếu không có thì fallback `product.updated_at`, sau đó `created_at`.
5. `Ngày bán cuối`: đơn bán `completed` gần nhất; đơn đã hủy phải bị loại. Khi chọn chi nhánh, chỉ tính giao dịch kho và đơn bán thuộc chi nhánh đó.
6. Tìm kiếm backend theo tên, mã SP, barcode và tên danh mục; khớp chứa chuỗi.
7. Mỗi trang 15 dòng. Thứ tự source hiện tại là tồn **tổng** giảm dần, sau đó tên tăng dần.
8. KPI/tab count được tính sau `q + category + branch + minStock`, nhưng **trước** `tab + Nhập đầu ≥ + Chưa bán ≥`. Vì vậy KPI có thể khác tổng dòng sau lọc nâng cao.
9. `Tổng giá trị` = tổng `qty × giá vốn`; khi có chi nhánh phải dùng qty của chi nhánh.
10. Bộ lọc chi nhánh, danh mục, tab và ba ô nâng cao tải ngay; riêng text tìm kiếm chỉ áp dụng khi bấm **Lọc** hoặc Enter.

### 2.2 Điểm đối soát Network

- Danh sách: `GET /api/products/storage-duration?page=...&limit=15&tab=...&thresholdDays=30...`.
- Danh mục: `GET /api/products/categories?limit=100`.
- Chi nhánh: `GET /api/system/branches`.
- Lưu/bỏ giá xả: request cập nhật sản phẩm tương ứng.
- Xuất toàn bộ Excel: gọi lại storage-duration theo bộ lọc, page size 100 và các trang tiếp theo.

## 3. Tiền điều kiện và dữ liệu kiểm thử tối thiểu

Chuẩn bị dữ liệu local/test được phép. Mốc `N ngày` phải tạo theo đầu ngày để tránh lệch timezone.

| Mã  | Fixture cần có                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------- |
| U1  | ADMIN active, đăng nhập được                                                                                                |
| U2  | EMPLOYEE active, đăng nhập được                                                                                             |
| U3  | Không token, token sai và token hết hạn                                                                                     |
| B1  | Hai chi nhánh A/B active; tên/mã dễ phân biệt                                                                               |
| B2  | Chi nhánh tên rất dài/Unicode; một ID không tồn tại để test deep-link                                                       |
| C1  | Ít nhất 2 danh mục; một danh mục >100 nếu cần test giới hạn; tên Unicode/ký tự đặc biệt                                     |
| P00 | Sản phẩm tồn tổng 0                                                                                                         |
| P01 | Chưa từng bán, nhập đầu 29 ngày, còn tồn                                                                                    |
| P02 | Chưa từng bán, nhập đầu đúng 30 ngày, còn tồn                                                                               |
| P03 | Chưa từng bán, nhập đầu 89 ngày                                                                                             |
| P04 | Chưa từng bán, nhập đầu đúng 90 ngày                                                                                        |
| P05 | Đã bán lần cuối 29 ngày, còn tồn                                                                                            |
| P06 | Đã bán lần cuối đúng 30 ngày, còn tồn                                                                                       |
| P07 | Đã bán >30 ngày nhưng có đơn completed mới hơn đã bị hủy                                                                    |
| P08 | Có giao dịch kho đầu/cuối biết trước; created/updated khác ngày giao dịch                                                   |
| P09 | Không có giao dịch kho để kiểm fallback created/updated                                                                     |
| P10 | Tồn A=2, B=20, tổng=22; ngày bán A/B khác nhau                                                                              |
| P11 | Tồn A=50, B=1 nhưng tồn tổng nhỏ/lớn đối nghịch P10 để kiểm sort/filter scope                                               |
| P12 | Giá vốn 0; giá bán 0; số lượng/giá thập phân nếu nghiệp vụ cho phép                                                         |
| P13 | Đang có `clearanceActive=true`, giá xả >0 và ghi chú                                                                        |
| P14 | `clearanceActive=true`, giá xả =0 để kiểm biểu diễn biên                                                                    |
| P15 | Tên/mã/barcode rất dài, Unicode, dấu phẩy, dấu nháy, xuống dòng và ký tự bắt đầu `=`, `+`, `-`, `@` trên môi trường an toàn |
| P16 | Sản phẩm thiếu danh mục/NCC; ngày bán null                                                                                  |
| P17 | Hai sản phẩm cùng tồn tổng để kiểm tie-break theo tên                                                                       |
| P18 | Ít nhất 31 sản phẩm khớp cùng bộ lọc để có 3 trang; nếu test xuất >100 thì chuẩn bị 101+                                    |
| E1  | Cách an toàn mô phỏng slow/offline/401/403/422/500 bằng DevTools hoặc mock local                                            |

Trước khi chạy, lưu “bảng chuẩn” cho từng Pxx: `code, globalQty, qty A/B, cost, price, firstTxn, lastTxn, lastCompletedSale A/B, expected days/status`.

## 4. Smoke test bắt buộc

| ID        | P   | Tiền điều kiện  | Các bước thao tác/nút bấm                                                   | Kết quả mong đợi                                                                                          | KQ  |
| --------- | --- | --------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --- |
| SD-SM-001 | P0  | U1, server chạy | 1. Mở Chrome. 2. Nhập URL trang. 3. Enter. 4. Chờ tải xong.                 | Vào đúng trang, không trắng; toolbar, 3 tab, summary, filter, ghi chú, bảng xuất hiện; không lỗi Console. | ☐   |
| SD-SM-002 | P0  | SD-SM-001       | 1. Quan sát header/sidebar. 2. Quan sát tab browser.                        | Header là `Hàng tồn lâu`; title `Hàng tồn lâu • <tên shop>`; menu Sản phẩm/Hàng tồn lâu active.           | ☐   |
| SD-SM-003 | P0  | Có P01–P07      | 1. Bấm lần lượt **Tất cả**, **Tồn lâu**, **Bán chậm**. 2. Chờ mỗi lần.      | URL/tab/data đúng; P02 thuộc Tồn lâu, P06 thuộc Bán chậm, P01/P05 không thuộc hai tab cảnh báo.           | ☐   |
| SD-SM-004 | P0  | Có dữ liệu      | 1. Nhập mã P02 vào ô tìm. 2. Bấm **Lọc**.                                   | Chỉ kết quả khớp; URL có `q`; summary/bảng/KPI scoped theo tìm kiếm.                                      | ☐   |
| SD-SM-005 | P0  | B1,C1           | 1. Chọn chi nhánh A. 2. Chọn danh mục của P10.                              | Request có đúng `branchId/categoryId`; tồn/ngày bán của dòng là scope A; không lẫn sản phẩm hết tồn A.    | ☐   |
| SD-SM-006 | P0  | P18             | 1. Bấm mũi tên trang sau. 2. Bấm mũi tên trang trước.                       | Mỗi trang tối đa 15 dòng, range và `Trang x/y` đúng, không trùng/mất dòng.                                | ☐   |
| SD-SM-007 | P0  | Có một dòng     | 1. Bấm nút `…` của dòng. 2. Bấm ngoài menu. 3. Mở lại rồi nhấn Escape.      | Menu mở đúng dòng; click ngoài/Escape đóng; không kích hoạt nhầm action.                                  | ☐   |
| SD-SM-008 | P0  | P02             | 1. Mở `…`. 2. Bấm **Đặt giá xả hàng**. 3. Kiểm tra preview. 4. Bấm **Hủy**. | Modal đúng SP/giá; mặc định giảm 10%; Hủy đóng, không lưu.                                                | ☐   |
| SD-SM-009 | P0  | Có dữ liệu      | 1. Bấm **Xuất**. 2. Chọn **Trang hiện tại**. 3. Bấm **Xuất dữ liệu**.       | Tải file `.xlsx`, đúng tối đa 15 dòng/15 cột mặc định và bộ lọc hiện tại; modal đóng.                     | ☐   |
| SD-SM-010 | P0  | Đang có filter  | 1. Bấm **Làm mới**.                                                         | Xóa mọi filter/tab/query, về trang 1/Tất cả và gọi lại dữ liệu; không chỉ reload dữ liệu cũ.              | ☐   |

## 5. Truy cập, xác thực, quyền, menu và điều hướng vào trang

| ID        | P   | Các bước thao tác/nút bấm                                                            | Kết quả mong đợi                                                                                       | KQ  |
| --------- | --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | --- |
| SD-AU-001 | P0  | 1. Đăng xuất. 2. Dán URL trang. 3. Enter.                                            | Chuyển `/login`, không ló dữ liệu tồn/giá.                                                             | ☐   |
| SD-AU-002 | P0  | 1. Gán token sai/hết hạn. 2. Mở URL.                                                 | `/auth/me` thất bại → xóa token, về login; không loop.                                                 | ☐   |
| SD-AU-003 | P1  | 1. Đăng nhập ADMIN. 2. Mở nhóm **Sản phẩm**. 3. Bấm **Hàng tồn lâu**.                | Điều hướng đúng URL và menu active.                                                                    | ☐   |
| SD-AU-004 | P1  | 1. Với ADMIN, mở **Báo Cáo** → **Kho hàng** → **Hàng tồn lâu / bán chậm**.           | Tới cùng trang; title/header đúng, không render hai instance.                                          | ☐   |
| SD-AU-005 | P0  | 1. Đăng nhập EMPLOYEE. 2. Mở **Sản phẩm** → **Hàng tồn lâu**.                        | EMPLOYEE được vào theo access hiện tại; không thấy menu admin-only.                                    | ☐   |
| SD-AU-006 | P0  | 1. Với EMPLOYEE, dán URL trực tiếp.                                                  | Không bị redirect oan; dữ liệu đọc tải được theo quyền đã định.                                        | ☐   |
| SD-AU-007 | P0  | 1. Không gửi token, gọi API storage-duration bằng DevTools/curl.                     | **Security expectation:** API trả 401/403, không lộ tồn/giá vốn. Nếu trả 200, mở lỗi bảo mật.          | ☐   |
| SD-AU-008 | P1  | 1. Mock API danh sách 401 khi trang đang mở.                                         | Phiên được xử lý nhất quán (đăng nhập lại hoặc thông báo); không giữ giao diện như vừa lưu thành công. | ☐   |
| SD-AU-009 | P1  | 1. Với vai trò chỉ được xem (nếu có), mở menu `…`. 2. Thử giá xả/chuyển/xuất trả.    | Action bị ẩn/disabled hoặc backend 403 có thông báo; không sửa dữ liệu trái quyền.                     | ☐   |
| SD-AU-010 | P1  | 1. Bấm vùng user. 2. Bấm **Đăng xuất**. 3. Bấm Back.                                 | Về login; Back không xem lại data cache.                                                               | ☐   |
| SD-AU-011 | P1  | 1. Ở desktop hover/click nhóm **Sản phẩm**. 2. Click ngoài. 3. Mở lại và chọn trang. | Panel mở/đóng đúng, không nhấp nháy qua khoảng hở; route đúng.                                         | ☐   |
| SD-AU-012 | P1  | 1. Thu viewport ≤1200. 2. Bấm menu ba gạch. 3. Mở **Sản phẩm** → **Hàng tồn lâu**.   | Sidebar mở; chọn xong tự đóng; mục active.                                                             | ☐   |
| SD-AU-013 | P1  | 1. Mở sidebar mobile. 2. Bấm X. 3. Mở lại và bấm scrim.                              | Cả X và scrim đóng; không cuộn ngang body.                                                             | ☐   |
| SD-AU-014 | P1  | 1. Từ trang bấm nút **Sản phẩm**. 2. Bấm Back.                                       | Sang `/products`; Back về trang cùng filter URL trước đó.                                              | ☐   |
| SD-AU-015 | P1  | 1. Từ trang bấm nút **Tồn kho**. 2. Bấm Back.                                        | Sang `/products/inventory`; Back khôi phục filter/tab URL.                                             | ☐   |
| SD-AU-016 | P1  | 1. Từ Dashboard bấm **Xem tất cả** ở Cảnh báo tồn.                                   | Vào trang Tất cả; data tải đúng.                                                                       | ☐   |
| SD-AU-017 | P1  | 1. Từ Dashboard bấm KPI **Hàng chưa bán >30 ngày**.                                  | URL `tab=unsold_long`, tab Tồn lâu active và đúng data.                                                | ☐   |
| SD-AU-018 | P1  | 1. Từ Dashboard bấm KPI **Hàng bán chậm >30 ngày**.                                  | URL `tab=slow_selling`, tab Bán chậm active.                                                           | ☐   |
| SD-AU-019 | P1  | 1. Từ Dashboard bấm một item cảnh báo.                                               | URL có `q=<code>` encode đúng; tìm đúng SP.                                                            | ☐   |
| SD-AU-020 | P1  | 1. Từ danh sách Sản phẩm/Tồn kho/Chuyển kho dùng link **tuổi tồn kho**.              | `q`, `tab`, `branchId` (nếu nguồn có) được truyền và áp dụng đúng.                                     | ☐   |

## 6. Tải trang, API phụ, loading, lỗi và phục hồi

| ID        | P   | Tiền điều kiện        | Các bước thao tác/nút bấm                                              | Kết quả mong đợi                                                                                                                                     | KQ  |
| --------- | --- | --------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| SD-LD-001 | P1  | Slow 3G               | 1. Bật throttling. 2. Reload.                                          | Bảng hiện `Đang tải dữ liệu...`; filter/layout không vỡ; loading kết thúc đúng response.                                                             | ☐   |
| SD-LD-002 | P1  | E1                    | 1. Chặn storage-duration 500. 2. Reload.                               | Toast `Không thể tải dữ liệu thời gian lưu kho.`, tự hết khoảng 4 giây; loading kết thúc, trang không crash.                                         | ☐   |
| SD-LD-003 | P0  | Đã có data            | 1. Chặn API. 2. Đổi tab/filter.                                        | Có toast lỗi; không hiển thị response sai scope như dữ liệu mới. Nếu giữ data cũ phải thể hiện rõ là cũ; ghi lỗi nếu gây hiểu nhầm.                  | ☐   |
| SD-LD-004 | P0  | Sau SD-LD-003         | 1. Khôi phục API. 2. Bấm **Làm mới** hoặc đổi filter.                  | Request mới thành công, toast lỗi hết, data đúng scope mới.                                                                                          | ☐   |
| SD-LD-005 | P1  | Offline               | 1. Chuyển Offline. 2. Reload. 3. Online. 4. Bấm **Làm mới**.           | Offline không treo; online phục hồi nếu token còn hợp lệ.                                                                                            | ☐   |
| SD-LD-006 | P1  | Categories 500        | 1. Chặn API danh mục. 2. Reload. 3. Mở dropdown danh mục.              | Trang chính vẫn dùng được; dropdown chỉ fallback `Tất cả danh mục`; Console có lỗi có kiểm soát. UX nên có thông báo/tải lại; ghi issue nếu im lặng. | ☐   |
| SD-LD-007 | P1  | Branches chậm         | 1. Delay API chi nhánh. 2. Reload. 3. Thử bấm dropdown khi chờ.        | Dropdown bị disabled trong lúc tải, enable khi xong; không đổi branch giả.                                                                           | ☐   |
| SD-LD-008 | P1  | Branches 500          | 1. Chặn API. 2. Reload.                                                | Trang chính tải; dropdown hết disabled và chỉ có Tất cả; không spinner vô hạn. Nên báo lỗi rõ; ghi issue nếu im lặng.                                | ☐   |
| SD-LD-009 | P1  | API items rỗng        | 1. Chọn bộ lọc không khớp.                                             | Hiện đúng empty message một dòng/colspan 11; total 0; không còn data/loading cũ.                                                                     | ☐   |
| SD-LD-010 | P2  | API field null/0      | 1. Dùng P12/P16. 2. Reload.                                            | Fallback hợp lệ: tiền `0 đ`, danh mục `Chưa phân loại`, NCC `Mặc định`, ngày `—`; không NaN.                                                         | ☐   |
| SD-LD-011 | P2  | API số lớn            | 1. Dùng qty/price rất lớn.                                             | Format vi-VN, không scientific notation/tràn cột; phép nhân KPI chính xác trong giới hạn.                                                            | ☐   |
| SD-LD-012 | P1  | API chậm khác nhau    | 1. Chọn Tồn lâu → Bán chậm → Tất cả thật nhanh.                        | Chỉ response cuối được render; stale response không ghi đè; loading kết thúc đúng.                                                                   | ☐   |
| SD-LD-013 | P1  | API chậm khác nhau    | 1. Đổi A→B→A nhanh; đồng thời đổi category.                            | Bảng/KPI/summary cuối cùng cùng scope A + category cuối; không trộn response.                                                                        | ☐   |
| SD-LD-014 | P2  | Giữ trang qua nửa đêm | 1. Mở trước 00:00. 2. Chờ qua ngày (hoặc clock mock). 3. Không reload. | Ghi hành vi: số ngày hiện không tự tăng vì không có timer. Nếu nghiệp vụ cần realtime, phải refresh/ghi issue.                                       | ☐   |
| SD-LD-015 | P1  | Settings API lỗi      | 1. Mock `/settings/store` lỗi. 2. Reload trang.                        | Auth vẫn hợp lệ, trang tải; tên shop fallback `LadyStars`; không đăng xuất oan.                                                                      | ☐   |

## 7. Tab, phân loại biên, ngày nguồn và KPI

### 7.1 Tab và phân loại

| ID        | P   | Dữ liệu                         | Các bước thao tác/nút bấm                                        | Kết quả mong đợi                                                                                                                                     | KQ  |
| --------- | --- | ------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| SD-CL-001 | P0  | P01                             | 1. Tìm P01. 2. Bấm **Tất cả**. 3. Bấm **Tồn lâu**.               | 29 ngày chưa bán: có ở Tất cả, không ở Tồn lâu/Bán chậm.                                                                                             | ☐   |
| SD-CL-002 | P0  | P02                             | 1. Tìm P02. 2. Bấm từng tab.                                     | Đúng 30 ngày, chưa bán: thuộc Tồn lâu (inclusive), không thuộc Bán chậm.                                                                             | ☐   |
| SD-CL-003 | P1  | P03                             | 1. Mở Tồn lâu.                                                   | 89 ngày thuộc Tồn lâu; badge Lưu từ đầu tone warning, chưa danger.                                                                                   | ☐   |
| SD-CL-004 | P1  | P04                             | 1. Mở Tồn lâu.                                                   | 90 ngày thuộc Tồn lâu; badge Lưu từ đầu tone danger.                                                                                                 | ☐   |
| SD-CL-005 | P0  | P05                             | 1. Tìm P05. 2. Bấm **Bán chậm**.                                 | Bán cuối 29 ngày: không thuộc Bán chậm.                                                                                                              | ☐   |
| SD-CL-006 | P0  | P06                             | 1. Tìm P06. 2. Bấm **Bán chậm**.                                 | Bán cuối đúng 30 ngày: thuộc Bán chậm.                                                                                                               | ☐   |
| SD-CL-007 | P0  | P07                             | 1. Đối chiếu đơn completed cũ và đơn mới đã hủy. 2. Mở Bán chậm. | Đơn bị hủy không được coi là lần bán cuối; ngày/trạng thái dựa đơn hợp lệ cũ.                                                                        | ☐   |
| SD-CL-008 | P1  | Sale pending                    | 1. Chuẩn bị đơn pending mới hơn. 2. Reload.                      | Pending không thay `Ngày bán cuối`/phân loại.                                                                                                        | ☐   |
| SD-CL-009 | P1  | Sale completed nhiều lần        | 1. Đối chiếu tất cả ngày.                                        | Chọn completed hợp lệ gần nhất, không phải đơn đầu/tạo gần nhất.                                                                                     | ☐   |
| SD-CL-010 | P1  | P10                             | 1. Chọn A, ghi ngày/status. 2. Chọn B.                           | Mỗi branch dùng sale của chính branch; cùng SP có thể Tồn lâu/Bán chậm/Bình thường khác nhau.                                                        | ☐   |
| SD-CL-011 | P1  | P08                             | 1. So `XNK Đầu/Cuối` UI với giao dịch kho.                       | Dùng first/last business_date đúng, không dùng created/updated khi có transaction.                                                                   | ☐   |
| SD-CL-012 | P1  | P09                             | 1. Mở dòng không transaction.                                    | Ngày đầu fallback created_at; ngày cuối fallback updated_at; số ngày khớp đầu ngày.                                                                  | ☐   |
| SD-CL-013 | P1  | Giao dịch tương lai do data lỗi | 1. Mở dòng.                                                      | Số ngày không âm (clamp 0), không crash; dữ liệu tương lai nên được cảnh báo/audit.                                                                  | ☐   |
| SD-CL-014 | P1  | P00                             | 1. Tìm đúng mã P00.                                              | Không xuất hiện vì tồn tổng 0.                                                                                                                       | ☐   |
| SD-CL-015 | P1  | Global >0, A=0                  | 1. Tìm SP ở Tất cả branch. 2. Chọn A.                            | Có ở toàn hệ thống nếu global >0; biến mất ở A.                                                                                                      | ☐   |
| SD-CL-016 | P1  | P17                             | 1. Bỏ mọi filter. 2. Ghi thứ tự hai dòng cùng qty. 3. Reload.    | Tie-break tên tăng dần ổn định, không đổi ngẫu nhiên.                                                                                                | ☐   |
| SD-CL-017 | P1  | P10/P11                         | 1. Chọn A. 2. Quan sát thứ tự và qty hiển thị.                   | **Probe nghiệp vụ:** nếu bảng được hiểu là theo A, nên sort theo qty A. Source hiện sort global; ghi defect nếu thứ tự không theo cột đang hiển thị. | ☐   |

### 7.2 KPI, count và summary

| ID        | P   | Các bước thao tác/nút bấm                                                     | Kết quả mong đợi                                                                                                                                          | KQ  |
| --------- | --- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| SD-KP-001 | P0  | 1. Bỏ filter. 2. Đếm base products qty>0 từ oracle. 3. So tab **Tất cả (n)**. | `n = totalProducts` base scope; không tính P00.                                                                                                           | ☐   |
| SD-KP-002 | P0  | 1. Đếm unsold_long. 2. So **Tồn lâu (n)**.                                    | Count khớp toàn base scope.                                                                                                                               | ☐   |
| SD-KP-003 | P0  | 1. Đếm slow_selling. 2. So **Bán chậm (n)**.                                  | Count khớp.                                                                                                                                               | ☐   |
| SD-KP-004 | P0  | 1. Ở mỗi tab so số tab với summary `x dòng` và header bảng.                   | Tất cả: total thường bằng totalProducts; Tồn lâu/Bán chậm: total dòng bằng count tab khi chưa có min-day filter.                                          | ☐   |
| SD-KP-005 | P0  | 1. Tính tổng `global qty × cost`. 2. So tiền summary.                         | Khớp base scope, format vi-VN + `đ`.                                                                                                                      | ☐   |
| SD-KP-006 | P0  | 1. Chọn A. 2. Tính `qty A × cost`.                                            | KPI tiền dùng qty A, không global/B; danh sách chỉ SP qty A>0.                                                                                            | ☐   |
| SD-KP-007 | P1  | 1. Tìm một mã.                                                                | Cả ba tab count và tiền KPI thu hẹp theo tìm kiếm.                                                                                                        | ☐   |
| SD-KP-008 | P1  | 1. Chọn category.                                                             | KPI/count/tiền chỉ category đó.                                                                                                                           | ☐   |
| SD-KP-009 | P1  | 1. Đặt `Tồn ≥`.                                                               | KPI/count/tiền thu hẹp theo minStock hiện hành.                                                                                                           | ☐   |
| SD-KP-010 | P1  | 1. Đặt `Nhập đầu ≥ 60`. 2. Ghi KPI và total.                                  | Total dòng lọc theo 60; KPI/tab count theo source vẫn là base scope trước minStart. UI phải không khiến hiểu hai số cùng phạm vi; ghi UX issue nếu mơ hồ. | ☐   |
| SD-KP-011 | P1  | 1. Đặt `Chưa bán ≥ 60`.                                                       | Tương tự: total dòng thay đổi, KPI không đổi do semantic filter.                                                                                          | ☐   |
| SD-KP-012 | P1  | 1. Chọn Tồn lâu. 2. Ghi tiền summary. 3. Chọn Bán chậm.                       | Source hiện tiền KPI không đổi theo tab; nếu nhãn khiến hiểu là giá trị tab, ghi UX/logic defect.                                                         | ☐   |
| SD-KP-013 | P1  | 1. Bật bất kỳ filter. 2. Quan sát summary. 3. **Làm mới**.                    | Có nhãn `Đang lọc`; sau reset nhãn biến mất.                                                                                                              | ☐   |
| SD-KP-014 | P2  | 1. Chọn filter rỗng kết quả nhưng base KPI còn data qua min-day.              | Summary có 0 dòng nhưng tiền/KPI có thể >0 theo scope khác; cần diễn đạt rõ, không coi là số của 0 dòng.                                                  | ☐   |
| SD-KP-015 | P2  | 1. Dùng cost/qty thập phân. 2. Tự tính.                                       | Không sai do ép integer/round sớm; format tiền nhất quán.                                                                                                 | ☐   |

## 8. Tìm kiếm và máy quét mã

| ID        | P   | Các bước thao tác/nút bấm                                  | Kết quả mong đợi                                                                                        | KQ                                                                  |
| --------- | --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --- |
| SD-SE-001 | P0  | 1. Nhập full mã SP. 2. Bấm **Lọc**.                        | Khớp đúng mã, URL encode `q`.                                                                           | ☐                                                                   |
| SD-SE-002 | P1  | 1. Nhập một phần mã. 2. Bấm Lọc.                           | Khớp chứa chuỗi, không chỉ exact.                                                                       | ☐                                                                   |
| SD-SE-003 | P0  | 1. Nhập một phần tên. 2. Nhấn Enter.                       | Form submit như nút Lọc, về trang 1.                                                                    | ☐                                                                   |
| SD-SE-004 | P1  | 1. Tìm barcode P15.                                        | Tìm được dù placeholder chỉ nêu tên/mã SP.                                                              | ☐                                                                   |
| SD-SE-005 | P1  | 1. Tìm tên danh mục.                                       | Trả các SP có category_name khớp; không crash khi category null.                                        | ☐                                                                   |
| SD-SE-006 | P1  | 1. Gõ từ khóa nhưng chưa bấm Lọc.                          | Ô đổi nhưng data/query chưa đổi; tránh request mỗi phím.                                                | ☐                                                                   |
| SD-SE-007 | P1  | 1. Gõ từ khóa mới. 2. Chọn branch trước khi bấm Lọc.       | Branch áp dụng ngay với **search đã submit trước**, text nháp không được áp dụng lén.                   | ☐                                                                   |
| SD-SE-008 | P1  | 1. Nhập khoảng trắng đầu/cuối quanh mã. 2. Bấm Lọc.        | Backend trim để tìm; URL có thể giữ text nhưng kết quả đúng. Ghi UX issue nếu không normalize hiển thị. | ☐                                                                   |
| SD-SE-009 | P1  | 1. Tìm chữ hoa. 2. Tìm chữ thường.                         | Kết quả nhất quán theo collation hỗ trợ tiếng Việt; không mất mã do case.                               | ☐                                                                   |
| SD-SE-010 | P1  | 1. Tìm Unicode có dấu/không dấu.                           | Có dấu khớp đúng; hành vi không dấu theo collation phải nhất quán và được ghi nhận.                     | ☐                                                                   |
| SD-SE-011 | P1  | 1. Nhập ký tự `%`, `_`, `'`, `"`, `\`. 2. Bấm Lọc.         | Không SQL error/500, không bypass filter; kết quả có kiểm soát.                                         | ☐                                                                   |
| SD-SE-012 | P1  | 1. Nhập `<script>alert(1)</script>`. 2. Lọc và reload URL. | Không thực thi script/XSS; text được encode.                                                            | ☐                                                                   |
| SD-SE-013 | P2  | 1. Dán chuỗi 1.000–10.000 ký tự. 2. Bấm Lọc.               | Không treo/414/500 không kiểm soát; nên giới hạn hoặc thông báo rõ.                                     | ☐                                                                   |
| SD-SE-014 | P0  | 1. Tìm từ không tồn tại.                                   | Empty state + total 0; KPI scoped 0.                                                                    | ☐                                                                   |
| SD-SE-015 | P1  | 1. Xóa text bằng Backspace. 2. Bấm Lọc.                    | `q` bị xóa khỏi URL, danh sách phục hồi.                                                                | ☐                                                                   |
| SD-SE-016 | P1  | 1. Ở trang 3, nhập từ khóa. 2. Bấm Lọc.                    | Về trang 1 trước khi hiển thị; không empty do giữ page 3.                                               | ☐                                                                   |
| SD-SE-017 | P1  | Có scanner                                                 | 1. Focus ngoài ô. 2. Quét barcode hợp lệ.                                                               | Bridge đưa barcode vào ô/search, về trang 1 và tải đúng SP một lần. | ☐   |
| SD-SE-018 | P1  | Có scanner                                                 | 1. Quét liên tiếp barcode A rồi B khi A còn chờ.                                                        | Kết quả cuối là B; stale A không ghi đè.                            | ☐   |
| SD-SE-019 | P2  | Có scanner                                                 | 1. Quét chuỗi rỗng/lỗi ký tự kết thúc.                                                                  | Không gửi request rỗng, không xóa filter hiện tại ngoài ý muốn.     | ☐   |

## 9. Bộ lọc chi nhánh và danh mục

| ID        | P   | Các bước thao tác/nút bấm                                  | Kết quả mong đợi                                                                                                                           | KQ  |
| --------- | --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --- |
| SD-BR-001 | P0  | 1. Reload URL sạch. 2. Mở dropdown chi nhánh.              | Mặc định `Tất cả chi nhánh`; đủ B1 với `Tên (mã)`.                                                                                         | ☐   |
| SD-BR-002 | P0  | 1. Chọn A.                                                 | URL có đúng `branchId`; về page 1; bảng/KPI scoped A.                                                                                      | ☐   |
| SD-BR-003 | P0  | 1. Với P10 ghi tồn toàn hệ thống. 2. Chọn A rồi B.         | Cột Tồn lần lượt global/A/B đúng oracle.                                                                                                   | ☐   |
| SD-BR-004 | P0  | 1. Chọn A rồi đối soát first/last txn và sale. 2. Lặp B.   | Tất cả ngày và số ngày cùng scope branch, không trộn global.                                                                               | ☐   |
| SD-BR-005 | P1  | 1. Chọn branch không có dòng.                              | Empty state; label bảng đúng tên branch; không fallback ngầm toàn hệ thống.                                                                | ☐   |
| SD-BR-006 | P1  | 1. Chọn B2 tên dài.                                        | Select/header không vỡ, title đầy đủ; URL ID encode đúng.                                                                                  | ☐   |
| SD-BR-007 | P1  | 1. Từ A chọn `Tất cả chi nhánh`.                           | Xóa `branchId`; qty/ngày/KPI trở lại global.                                                                                               | ☐   |
| SD-BR-008 | P1  | 1. Mở deep-link `?branchId=<A>`.                           | Dropdown chọn A ngay lần tải đầu, không flash/kết quả global cuối cùng.                                                                    | ☐   |
| SD-BR-009 | P1  | 1. Mở `?branchId=khong-ton-tai`.                           | Không crash/lộ dữ liệu sai; nên báo/reset filter không hợp lệ. Ghi defect nếu label chỉ hiện raw ID và empty khó hiểu.                     | ☐   |
| SD-BR-010 | P0  | 1. Chọn A. 2. Mở `…` → **Đề xuất chuyển kho**.             | Trang đích nhận A làm kho nguồn (kiểm chi tiết ở mục 14).                                                                                  | ☐   |
| SD-BR-011 | P0  | 1. Chọn A. 2. Mở `…` → **Mở phiếu xuất trả NCC**.          | Trang đích nhận A làm chi nhánh.                                                                                                           | ☐   |
| SD-BR-012 | P1  | 1. Chọn A. 2. Đặt `Tồn ≥ 10` với P10/P11.                  | **Probe nghiệp vụ:** nên lọc theo tồn A vì cột đang hiển thị A. Source hiện minStock lọc global; ghi defect nếu SP qty A<10 vẫn còn.       | ☐   |
| SD-BR-013 | P1  | 1. Chọn A với các SP global qty đối nghịch qty A.          | **Probe:** thứ tự nên theo số đang hiển thị hoặc UI phải nói đang sort global; ghi issue nếu gây hiểu nhầm.                                | ☐   |
| SD-BR-014 | P2  | 1. Không chọn branch. 2. Xuất Excel. 3. Xem cột Chi nhánh. | **Probe:** “Tất cả” không được gán tùy tiện branch stock đầu tiên như thể toàn bộ qty thuộc branch đó; để trống/ghi Tất cả hoặc đặc tả rõ. | ☐   |
| SD-CA-001 | P0  | 1. Reload. 2. Mở dropdown danh mục.                        | Mặc định `Tất cả danh mục`; danh sách tải được.                                                                                            | ☐   |
| SD-CA-002 | P0  | 1. Chọn danh mục C1.                                       | URL có categoryId, page 1, chỉ SP thuộc category.                                                                                          | ☐   |
| SD-CA-003 | P1  | 1. Chọn category không có SP tồn.                          | Empty đúng; KPI 0.                                                                                                                         | ☐   |
| SD-CA-004 | P1  | 1. Từ C1 chọn Tất cả.                                      | Xóa categoryId, phục hồi data.                                                                                                             | ☐   |
| SD-CA-005 | P1  | 1. Deep-link `?categoryId=<C1>`.                           | Select và data đồng bộ từ lần đầu.                                                                                                         | ☐   |
| SD-CA-006 | P1  | 1. Deep-link ID category không tồn tại.                    | Không crash; nên reset/báo filter invalid, không hiện select trống bí ẩn.                                                                  | ☐   |
| SD-CA-007 | P1  | 1. Chọn category thứ >100 (nếu có).                        | **Probe giới hạn:** API UI chỉ tải 100; category hợp lệ phải có cách chọn. Ghi defect nếu bị mất.                                          | ☐   |
| SD-CA-008 | P1  | 1. Chọn A + C1 + tab Bán chậm.                             | Giao các điều kiện AND, không OR; KPI đúng base A+C1 và rows đúng tab.                                                                     | ☐   |

## 10. Bộ lọc nâng cao, nút Tuổi cao và reset

| ID        | P   | Các bước thao tác/nút bấm                            | Kết quả mong đợi                                                                                                                | KQ  |
| --------- | --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --- |
| SD-FL-001 | P0  | 1. Bấm **Bộ lọc nâng cao**. 2. Bấm **Ẩn nâng cao**.  | Panel mở/đóng; label nút đổi đúng; giá trị đã nhập không mất khi chỉ ẩn.                                                        | ☐   |
| SD-FL-002 | P0  | 1. Mở nâng cao. 2. Nhập `30` vào **Nhập đầu ≥**.     | Tải ngay, URL `minStartDays=30`, page 1; mọi dòng daysFromStart ≥30.                                                            | ☐   |
| SD-FL-003 | P0  | 1. Nhập `30` vào **Chưa bán ≥**.                     | Mọi dòng đã bán có daysFromLastSold ≥30; dòng chưa từng bán cũng được giữ theo logic hiện tại.                                  | ☐   |
| SD-FL-004 | P0  | 1. Nhập `10` vào **Tồn ≥**.                          | Mọi dòng thỏa scope minStock đã định; KPI cập nhật.                                                                             | ☐   |
| SD-FL-005 | P0  | 1. Bấm **Tuổi cao**.                                 | Tự điền Nhập đầu=30, mở panel, page 1, nút active, data lọc ngay.                                                               | ☐   |
| SD-FL-006 | P1  | 1. Đổi Nhập đầu 30→60. 2. Bấm Tuổi cao.              | Giá trị về 30 (threshold), không cộng dồn; request đúng.                                                                        | ☐   |
| SD-FL-007 | P1  | 1. Đặt Nhập đầu=31.                                  | Nút Tuổi cao vẫn active vì ≥threshold.                                                                                          | ☐   |
| SD-FL-008 | P1  | 1. Đặt Nhập đầu=29.                                  | Nút Tuổi cao không active.                                                                                                      | ☐   |
| SD-FL-009 | P1  | 1. Nhập `0` cho Nhập đầu.                            | Hợp lệ; URL giữ `0` vì state string truthy; backend lọc ≥0, không crash.                                                        | ☐   |
| SD-FL-010 | P1  | 1. Nhập `0` cho Chưa bán.                            | Giữ tất cả theo điều kiện ngày bán, kể cả chưa bán; URL đúng.                                                                   | ☐   |
| SD-FL-011 | P1  | 1. Thử nhập `0` cho Tồn.                             | Native min=1 phải ngăn submit/hoặc API xử lý nhất quán. Không được âm thầm biến thành “không lọc” khác UI.                      | ☐   |
| SD-FL-012 | P1  | 1. Dùng bàn phím nhập `-1` ở từng ô.                 | UI/native ngăn hoặc backend clamp có phản hồi; không 500/số âm. Ghi validation UX nếu giá trị hiển thị âm nhưng kết quả dùng 0. | ☐   |
| SD-FL-013 | P1  | 1. Nhập `30.9`.                                      | HTML number/backend integer phải có quy tắc rõ; không hiển thị 30.9 nhưng âm thầm lọc 30 mà không báo.                          | ☐   |
| SD-FL-014 | P1  | 1. Nhập số rất lớn `999999999`.                      | Empty có kiểm soát, không overflow/500.                                                                                         | ☐   |
| SD-FL-015 | P1  | 1. Nhập ký tự/e/NaN bằng paste nếu browser cho phép. | Không gửi `NaN`, không 500; input từ chối hoặc reset/validation.                                                                | ☐   |
| SD-FL-016 | P1  | 1. Đặt Nhập đầu=60 và tab Tồn lâu.                   | Kết quả là intersection `status=unsold_long AND daysFromStart≥60`.                                                              | ☐   |
| SD-FL-017 | P1  | 1. Đặt Chưa bán=60 và tab Bán chậm.                  | Chỉ Bán chậm thỏa ≥60; không lẫn Tồn lâu dù null thỏa minSold trước tab.                                                        | ☐   |
| SD-FL-018 | P1  | 1. Đặt cả ba min + branch + category + q + tab.      | Tất cả điều kiện AND; URL chứa đủ key một lần, không mất key.                                                                   | ☐   |
| SD-FL-019 | P1  | 1. Ở trang >1, thay từng min.                        | Mỗi thay đổi về page 1.                                                                                                         | ☐   |
| SD-FL-020 | P1  | 1. Xóa từng số bằng Backspace.                       | Key tương ứng biến mất khỏi URL; data phục hồi theo các filter còn lại.                                                         | ☐   |
| SD-FL-021 | P0  | 1. Tạo đủ mọi filter. 2. Bấm **Làm mới**.            | Xóa text nháp+đã áp dụng, category, branch, 3 min, tab; page 1; URL sạch. Panel có thể giữ mở nhưng input rỗng.                 | ☐   |
| SD-FL-022 | P1  | 1. Với filter không đổi, bấm **Lọc** nhiều lần.      | Mỗi submit chủ động reload tối đa một request; không nhân request do StrictMode ngoài hành vi dev dự kiến.                      | ☐   |
| SD-FL-023 | P1  | 1. Nhập min liên tục 1→10 nhanh.                     | Kết quả cuối đúng 10; stale response không ghi đè. Có thể nhiều request nhưng UI không sai/treo.                                | ☐   |
| SD-FL-024 | P2  | 1. Chỉ ẩn panel khi min đang active.                 | Summary vẫn báo Đang lọc; data/URL không đổi; không làm user tưởng filter đã tắt.                                               | ☐   |

## 11. Bảng dữ liệu, format, empty state và phân trang

| ID        | P   | Các bước thao tác/nút bấm             | Kết quả mong đợi                                                                                                                             | KQ                                                                                                                                  |
| --------- | --- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --- |
| SD-TB-001 | P0  | 1. Đếm header bảng.                   | Đúng 11 cột: Mã, Tên, Nhóm/NCC, Giá nhập/bán, Tồn, XNK đầu/cuối, Bán cuối, Lưu từ đầu, Lưu từ XNK cuối, Chưa bán ra, Thao tác.               | ☐                                                                                                                                   |
| SD-TB-002 | P1  | 1. So code/name từng dòng với API.    | Không tráo dòng/truncate mất khả năng nhận diện; tên đầy đủ có thể xem qua title.                                                            | ☐                                                                                                                                   |
| SD-TB-003 | P1  | 1. Mở P16.                            | Null category → `Chưa phân loại`; null NCC → `Mặc định`.                                                                                     | ☐                                                                                                                                   |
| SD-TB-004 | P0  | 1. So cost/price với oracle.          | Hiển thị `Giá nhập                                                                                                                           | Giá bán`, format vi-VN + đ, không đảo.                                                                                              | ☐   |
| SD-TB-005 | P0  | 1. Mở P13.                            | Có dòng `Xả: <giá>` dưới giá chính; giá chính giữ nguyên.                                                                                    | ☐                                                                                                                                   |
| SD-TB-006 | P1  | 1. Mở P14 active giá xả 0.            | **Probe:** trạng thái active cần được biểu diễn nhất quán; source ẩn nhãn vì giá 0 nhưng menu vẫn có Bỏ giá xả. Ghi UX defect nếu mâu thuẫn. | ☐                                                                                                                                   |
| SD-TB-007 | P0  | 1. So tồn global/A/B.                 | Số đúng scope, format vi-VN.                                                                                                                 | ☐                                                                                                                                   |
| SD-TB-008 | P1  | 1. So first/last transaction date.    | Format `dd/mm/yyyy`, không lệch ngày do UTC; `Cuối:` đúng.                                                                                   | ☐                                                                                                                                   |
| SD-TB-009 | P1  | 1. Mở SP chưa bán.                    | Cột Bán cuối là `—`; cột Chưa bán ra là `Chưa bán lần nào`.                                                                                  | ☐                                                                                                                                   |
| SD-TB-010 | P1  | 1. Mở SP đã bán hôm nay.              | Ngày bán hôm nay; Chưa bán ra `0 ngày`, không rỗng.                                                                                          | ☐                                                                                                                                   |
| SD-TB-011 | P1  | 1. Kiểm daysFromStart 29/30/90.       | Text số ngày đúng; badge success/warning/danger đúng ngưỡng.                                                                                 | ☐                                                                                                                                   |
| SD-TB-012 | P1  | 1. Kiểm daysFromLastSold 29/30.       | 29 tone thường; 30 tone danger; số/status backend không mâu thuẫn.                                                                           | ☐                                                                                                                                   |
| SD-TB-013 | P2  | 1. Dùng P15 tên/mã dài. 2. Hover tên. | Table không chồng cột/action; native title cho tên đầy đủ; horizontal scroll trong table nếu cần.                                            | ☐                                                                                                                                   |
| SD-TB-014 | P2  | 1. Dùng số/giá dài.                   | Số căn/format đọc được, không che `…`.                                                                                                       | ☐                                                                                                                                   |
| SD-TB-015 | P0  | 1. Chọn filter không có data.         | Một empty row đúng thông điệp; không render Pagination.                                                                                      | ☐                                                                                                                                   |
| SD-PG-001 | P0  | P18                                   | 1. Mở trang sạch.                                                                                                                            | 15 dòng trang 1; footer `Hiển thị 1 - 15 trong tổng số N`; `Trang 1 / ceil(N/15)`.                                                  | ☐   |
| SD-PG-002 | P0  | P18                                   | 1. Bấm mũi tên phải.                                                                                                                         | Trang 2, footer 16–30; request `page=2`; mũi trái enable.                                                                           | ☐   |
| SD-PG-003 | P0  | P18                                   | 1. Đi tới trang cuối.                                                                                                                        | Range cuối không vượt total; mũi phải disabled.                                                                                     | ☐   |
| SD-PG-004 | P1  | P18                                   | 1. Ở trang 1 thử mũi trái.                                                                                                                   | Disabled, không request page 0.                                                                                                     | ☐   |
| SD-PG-005 | P1  | N≤15                                  | 1. Áp filter còn ≤15.                                                                                                                        | Pagination ẩn hoàn toàn.                                                                                                            | ☐   |
| SD-PG-006 | P1  | P18                                   | 1. Sang trang 3. 2. Chọn tab/category/branch hoặc submit search.                                                                             | Về trang 1; không empty giả.                                                                                                        | ☐   |
| SD-PG-007 | P1  | P18                                   | 1. Sang trang 2. 2. Bấm Back browser.                                                                                                        | Page không nằm trong URL nên ghi hành vi hiện tại; không được tạo state bảng/URL mâu thuẫn. Nếu yêu cầu share page, mở enhancement. | ☐   |
| SD-PG-008 | P1  | Dữ liệu thay đổi ngoài phiên          | 1. Đang trang cuối. 2. Làm giảm total dưới offset. 3. Trigger reload.                                                                        | Không nên để `Trang 3/2` và range vô nghĩa; tự clamp về last page hoặc thông báo.                                                   | ☐   |
| SD-PG-009 | P2  | P18                                   | 1. Bấm nhanh mũi phải nhiều lần.                                                                                                             | Không vượt last page; kết quả cuối đúng page; stale request không ghi đè.                                                           | ☐   |

## 12. Menu thao tác từng dòng

| ID        | P   | Các bước thao tác/nút bấm                                    | Kết quả mong đợi                                                                                                                               | KQ  |
| --------- | --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| SD-MN-001 | P0  | 1. Bấm `…` của P02.                                          | Menu portal mở gần nút, aria-expanded true; đúng action của P02.                                                                               | ☐   |
| SD-MN-002 | P1  | 1. Bấm lại cùng nút `…`.                                     | Menu đóng, aria-expanded false.                                                                                                                | ☐   |
| SD-MN-003 | P1  | 1. Mở P02. 2. Bấm `…` P06.                                   | Chỉ một menu; action chuyển đúng P06.                                                                                                          | ☐   |
| SD-MN-004 | P0  | 1. Mở menu. 2. Click vùng trống/bảng.                        | Menu đóng, không chọn dòng/action.                                                                                                             | ☐   |
| SD-MN-005 | P0  | 1. Mở menu. 2. Nhấn Escape.                                  | Đóng.                                                                                                                                          | ☐   |
| SD-MN-006 | P1  | 1. Mở menu. 2. Cuộn table/page.                              | Menu đóng, không trôi khỏi dòng.                                                                                                               | ☐   |
| SD-MN-007 | P1  | 1. Mở menu. 2. Resize cửa sổ.                                | Menu đóng, không portal mồ côi.                                                                                                                | ☐   |
| SD-MN-008 | P1  | 1. Mở menu dòng gần đầu viewport.                            | Nếu thiếu chỗ trên, menu mở dưới; nằm trong viewport.                                                                                          | ☐   |
| SD-MN-009 | P1  | 1. Mở menu dòng gần đáy/phải.                                | Menu mở trên/đẩy trái hợp lý, không bị cắt; không che action dòng khác lâu dài.                                                                | ☐   |
| SD-MN-010 | P0  | 1. Mở P02 chưa clearance.                                    | Có Đặt giá xả, Đề xuất chuyển kho, Mở phiếu xuất trả; không có Bỏ giá xả.                                                                      | ☐   |
| SD-MN-011 | P0  | 1. Mở P13 active.                                            | Có thêm **Bỏ giá xả hàng**.                                                                                                                    | ☐   |
| SD-MN-012 | P1  | 1. Mở menu bằng Tab/Enter/Space. 2. Tab qua item.            | Trigger có accessible name theo mã; menu/item có thể thao tác bàn phím và focus thấy rõ. Ghi a11y defect nếu focus không chuyển/không quản lý. | ☐   |
| SD-MN-013 | P1  | 1. Mở menu. 2. Đổi filter khiến dòng biến mất trước khi bấm. | Menu đóng/không action vào item stale.                                                                                                         | ☐   |

## 13. Đặt và bỏ giá xả hàng

### 13.1 Mở/đóng và tính giá

| ID        | P   | Các bước thao tác/nút bấm          | Kết quả mong đợi                                                                                                 | KQ  |
| --------- | --- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --- |
| SD-DC-001 | P0  | 1. P02 `…` → **Đặt giá xả hàng**.  | Menu đóng; modal title đúng; SP/giá bán/giá vốn disabled và đúng P02.                                            | ☐   |
| SD-DC-002 | P0  | 1. Quan sát mặc định.              | Loại `%`, mức 10, ghi chú mặc định; preview = price×90%.                                                         | ☐   |
| SD-DC-003 | P0  | 1. Nhập 20%.                       | Preview = max(0, price×0,8), format vi-VN.                                                                       | ☐   |
| SD-DC-004 | P0  | 1. Chọn `VNĐ`. 2. Nhập 50.000.     | Preview = max(0, price−50.000).                                                                                  | ☐   |
| SD-DC-005 | P1  | 1. Nhập 100%.                      | Preview 0; nếu giá xả 0 không được hiển thị sau lưu, ghi mâu thuẫn UX.                                           | ☐   |
| SD-DC-006 | P1  | 1. Nhập >100%.                     | Preview clamp 0; nghiệp vụ nên validation không cho >100 nếu không hợp lệ. Ghi defect nếu cho lưu giảm vô nghĩa. | ☐   |
| SD-DC-007 | P1  | 1. Chọn VNĐ, nhập lớn hơn giá bán. | Preview clamp 0; cần validation nghiệp vụ rõ.                                                                    | ☐   |
| SD-DC-008 | P1  | 1. Xóa mức giảm. 2. Bấm Lưu.       | Native required chặn submit, không hiện confirm/API.                                                             | ☐   |
| SD-DC-009 | P1  | 1. Nhập 0 hoặc âm. 2. Bấm Lưu.     | Native min=1 chặn; không lưu.                                                                                    | ☐   |
| SD-DC-010 | P1  | 1. Nhập số thập phân.              | Quy tắc step/round phải rõ; không preview một số nhưng backend lưu số khác không báo.                            | ☐   |
| SD-DC-011 | P1  | 1. Sửa/xóa ghi chú.                | Text state đúng; cho phép rỗng nếu nghiệp vụ cho phép; không XSS khi hiển thị nơi khác.                          | ☐   |
| SD-DC-012 | P1  | 1. Bấm X. 2. Mở lại.               | Đóng không lưu; mở lại reset loại %, mức 10, note mặc định.                                                      | ☐   |
| SD-DC-013 | P1  | 1. Bấm **Hủy**.                    | Đóng không API.                                                                                                  | ☐   |
| SD-DC-014 | P1  | 1. Click backdrop.                 | Đóng không API.                                                                                                  | ☐   |
| SD-DC-015 | P1  | 1. Nhấn Escape.                    | **Accessibility expectation:** modal nên đóng. Source chưa xử lý Escape; nếu không đóng, ghi defect.             | ☐   |
| SD-DC-016 | P1  | 1. Tab/Shift+Tab qua modal.        | Focus phải nằm trong modal, không rơi vào trang sau; focus visible. Nếu không trap, ghi a11y defect.             | ☐   |

### 13.2 Lưu, confirm, lỗi và bỏ giá

| ID        | P   | Các bước thao tác/nút bấm                                     | Kết quả mong đợi                                                                                                | KQ  |
| --------- | --- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --- |
| SD-DS-001 | P0  | 1. Nhập mức hợp lệ. 2. Bấm **Lưu giá xả hàng**.               | Browser confirm nêu giá xả riêng/không đổi giá chính; chưa gọi API trước xác nhận.                              | ☐   |
| SD-DS-002 | P0  | 1. Ở confirm bấm Cancel.                                      | Modal vẫn mở, dữ liệu còn nguyên; không API/không toast success.                                                | ☐   |
| SD-DS-003 | P0  | 1. Bấm Lưu. 2. Confirm OK.                                    | Payload có clearancePrice preview, active=true, note, startedAt hợp lệ; success toast; modal đóng; reload dòng. | ☐   |
| SD-DS-004 | P0  | 1. Sau lưu so dòng/API/DB.                                    | Giá chính không đổi; nhãn Xả đúng; menu có Bỏ giá xả.                                                           | ☐   |
| SD-DS-005 | P1  | 1. Sau success chờ >4 giây.                                   | Toast tự biến mất, không che action lâu.                                                                        | ☐   |
| SD-DS-006 | P0  | 1. Mock update 422/500. 2. Confirm lưu.                       | Toast `Có lỗi...`; modal vẫn mở để sửa/thử lại; không hiển thị xả giả.                                          | ☐   |
| SD-DS-007 | P1  | 1. Mock request chậm. 2. Double-click Lưu/confirm nếu có thể. | Không tạo nhiều mutation/toast. Nếu nút không disabled và gửi trùng, ghi defect.                                | ☐   |
| SD-DS-008 | P1  | 1. EMPLOYEE thực hiện theo quyền quy định.                    | Backend kiểm quyền độc lập UI; 403 phải có toast phù hợp, không success giả.                                    | ☐   |
| SD-DS-009 | P0  | 1. P13 `…` → **Bỏ giá xả hàng**.                              | Confirm đúng nội dung; chưa thay đổi trước OK.                                                                  | ☐   |
| SD-DS-010 | P0  | 1. Ở confirm bỏ giá bấm Cancel.                               | Giữ active/giá/note, không API.                                                                                 | ☐   |
| SD-DS-011 | P0  | 1. Confirm OK.                                                | Gửi active=false, price=0, note rỗng; success toast; reload; nhãn Xả và menu Bỏ biến mất; giá chính không đổi.  | ☐   |
| SD-DS-012 | P0  | 1. Mock lỗi bỏ giá. 2. Confirm.                               | Toast lỗi; dòng vẫn active sau reload, không optimistic sai.                                                    | ☐   |
| SD-DS-013 | P1  | 1. Bỏ giá khi filter/search đang active.                      | Reload giữ nguyên filter/tab/page hợp lệ; không reset người dùng.                                               | ☐   |
| SD-DS-014 | P1  | 1. Sửa giá xả P13 bằng Đặt giá xả lần nữa.                    | Modal reset 10% theo giá chính như source; lưu thay thế đúng, không giảm chồng trên giá xả cũ.                  | ☐   |

## 14. Đề xuất chuyển kho và mở phiếu xuất trả NCC

| ID        | P   | Tiền điều kiện             | Các bước thao tác/nút bấm                                   | Kết quả mong đợi                                                                                                                      | KQ  |
| --------- | --- | -------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --- |
| SD-TR-001 | P0  | Chọn A, P10                | 1. P10 `…` → **Đề xuất chuyển kho**.                        | Tới `/warehouse/transfers/create`; query có sourceWarehouseId=A, productId, productCode, quantity=1, note encode đúng.                | ☐   |
| SD-TR-002 | P0  | Có ≥2 kho                  | 1. Chờ trang đích. 2. Chọn kho đích khác A nếu chưa chọn.   | Kho nguồn A prefill; sau source+destination hợp lệ, đúng P10 được thêm qty1/note đề xuất.                                             | ☐   |
| SD-TR-003 | P1  | Không chọn branch          | 1. Từ trang Tất cả mở Đề xuất chuyển kho.                   | Query không có source; trang đích yêu cầu chọn nguồn+đích. Sau chọn, prefill SP phải nhất quán hoặc thông báo nếu SP không tồn nguồn. | ☐   |
| SD-TR-004 | P1  | P10 không tồn ở nguồn chọn | 1. Không branch → chuyển kho. 2. Chọn nguồn không có P10.   | Không thêm SP vượt tồn/không tồn; có hướng dẫn rõ, không tạo dòng qty1 giả.                                                           | ☐   |
| SD-TR-005 | P1  | P10 tồn khả dụng 0 do khóa | 1. Mở chuyển kho.                                           | Không cho tạo qty vượt available stock; prefill phải tôn trọng tồn khóa.                                                              | ☐   |
| SD-TR-006 | P1  | Từ trang đích              | 1. Bấm Back.                                                | Trở về storage-duration với URL/filter/tab trước đó; không mất state đã URL hóa.                                                      | ☐   |
| SD-TR-007 | P1  | Mã có ký tự đặc biệt       | 1. Mở chuyển kho. 2. Xem URL/field.                         | productCode/note encode/decode đúng, không cắt ở `&/#/+`.                                                                             | ☐   |
| SD-TR-008 | P1  | Product bị xóa sau khi mở  | 1. Click action. 2. Trang đích tải không tìm thấy.          | Có empty/error rõ; không tự chọn SP khác.                                                                                             | ☐   |
| SD-RT-001 | P0  | Chọn A, P10                | 1. P10 `…` → **Mở phiếu xuất trả NCC**.                     | Tới `/warehouse/transactions/vouchers/export`; query branchId=A, productId/code, qty1, type `Xuất trả hàng`, note đúng.               | ☐   |
| SD-RT-002 | P0  | Trang đích tải xong        | 1. Kiểm form.                                               | Chi nhánh A, loại Xuất trả hàng, P10 qty1 và note đề xuất được prefill; tồn lấy đúng A.                                               | ☐   |
| SD-RT-003 | P1  | Không chọn branch          | 1. Mở phiếu xuất trả.                                       | Không branchId; user phải chọn chi nhánh; SP chỉ prefill khi hợp lệ, không dùng tùy tiện branch đầu.                                  | ☐   |
| SD-RT-004 | P1  | Qty branch =0/locked       | 1. Mở action.                                               | Không cho lập dòng xuất vượt tồn khả dụng; thông báo rõ.                                                                              | ☐   |
| SD-RT-005 | P1  | Mã đặc biệt                | 1. Mở phiếu.                                                | Query decode đúng; không chọn nhầm SP theo partial code.                                                                              | ☐   |
| SD-RT-006 | P1  | Trang đích                 | 1. Bấm Back.                                                | Trở đúng filter/tab trước đó.                                                                                                         | ☐   |
| SD-RT-007 | P0  | Không muốn tạo dữ liệu     | 1. Chỉ kiểm prefill. 2. Rời trang, không bấm tạo/lưu phiếu. | Không phát sinh chứng từ chỉ vì mở action.                                                                                            | ☐   |

## 15. Xuất Excel

### 15.1 Mở/đóng, range, tab và accessibility

| ID        | P   | Các bước thao tác/nút bấm                                  | Kết quả mong đợi                                                                                                                  | KQ  |
| --------- | --- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --- |
| SD-EX-001 | P0  | 1. Bấm **Xuất**.                                           | Modal `Xuất Excel - Báo cáo thời gian lưu kho`; mặc định Toàn bộ, tab Excel, tên file theo ngày, sheet `Trang tính 1`, 15/15 cột. | ☐   |
| SD-EX-002 | P1  | 1. Bấm X góc modal.                                        | Đóng không tải file; focus quay về control trước đó.                                                                              | ☐   |
| SD-EX-003 | P1  | 1. Mở lại. 2. Bấm **Đóng** footer.                         | Đóng, không tải.                                                                                                                  | ☐   |
| SD-EX-004 | P1  | 1. Mở lại. 2. Click backdrop.                              | Đóng khi không loading.                                                                                                           | ☐   |
| SD-EX-005 | P1  | 1. Mở. 2. Nhấn Escape.                                     | Đóng khi không loading; focus phục hồi.                                                                                           | ☐   |
| SD-EX-006 | P1  | 1. Dùng Tab/Shift+Tab hết controls.                        | Focus trap trong modal, focus visible; không click/tab vào trang sau.                                                             | ☐   |
| SD-EX-007 | P1  | 1. Focus tab Excel. 2. Nhấn ArrowRight/Left.               | Chuyển Excel ↔ Google Sheets và focus tab đúng; aria-selected đúng.                                                               | ☐   |
| SD-EX-008 | P1  | 1. Bấm **Google Sheets**.                                  | Hiện `Sắp ra mắt`; nút Xuất dữ liệu disabled; không gọi API/Google.                                                               | ☐   |
| SD-EX-009 | P1  | 1. Đóng rồi mở lại sau khi đã đổi nhiều field.             | Reset về mặc định mỗi lần mở mới.                                                                                                 | ☐   |
| SD-EX-010 | P1  | 1. Chọn Trang hiện tại. 2. Bắt đầu xuất với API/file chậm. | Nút/close disabled phù hợp, text `Đang xuất...`; Escape/backdrop không đóng giữa chừng.                                           | ☐   |

### 15.2 Chọn và đổi tên cột

| ID        | P   | Các bước thao tác/nút bấm                               | Kết quả mong đợi                                                                                                  | KQ  |
| --------- | --- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --- |
| SD-EC-001 | P0  | 1. Quan sát danh sách.                                  | Đúng 15 cột: mã, tên, danh mục, NCC, giá vốn/bán, tồn, chi nhánh, 3 ngày, 3 số ngày, trạng thái.                  | ☐   |
| SD-EC-002 | P0  | 1. Bỏ tick một cột.                                     | Count 14/15; file không có cột đó.                                                                                | ☐   |
| SD-EC-003 | P1  | 1. Bấm checkbox **Chọn cột xuất** khi tất cả đang chọn. | Bỏ chọn toàn bộ 15 cột.                                                                                           | ☐   |
| SD-EC-004 | P0  | 1. Khi 0 cột, bấm Xuất.                                 | Alert yêu cầu chọn ít nhất 1; không tải/API; modal còn mở.                                                        | ☐   |
| SD-EC-005 | P1  | 1. Bấm Chọn cột xuất lần nữa.                           | Chọn lại toàn bộ.                                                                                                 | ☐   |
| SD-EC-006 | P1  | 1. Tìm `Ngày`.                                          | Chỉ các cột tên có Ngày hiện; state các cột khác giữ nguyên.                                                      | ☐   |
| SD-EC-007 | P1  | 1. Trong kết quả tìm `Ngày`, bấm Chọn cột xuất.         | Toggle **chỉ** các cột đang lọc; count tổng cập nhật đúng.                                                        | ☐   |
| SD-EC-008 | P1  | 1. Tìm chuỗi không khớp.                                | Hiện `Không tìm thấy cột...`; checkbox tổng không gây crash.                                                      | ☐   |
| SD-EC-009 | P0  | 1. Đổi tiêu đề `Mã SP` thành `SKU`. 2. Xuất.            | Header file là SKU; dữ liệu vẫn là code.                                                                          | ☐   |
| SD-EC-010 | P1  | 1. Xóa trắng custom label. 2. Xuất.                     | Fallback về label gốc theo source, không header rỗng.                                                             | ☐   |
| SD-EC-011 | P1  | 1. Đặt hai cột cùng custom label. 2. Xuất.              | **Probe mất dữ liệu:** file phải giữ hai cột hoặc chặn tên trùng. Nếu một cột ghi đè do key trùng, ghi defect P1. | ☐   |
| SD-EC-012 | P2  | 1. Thử kéo icon grip đổi thứ tự.                        | Source chưa hỗ trợ reorder dù có icon. Ghi UX defect nếu affordance kéo gây hiểu nhầm; thứ tự file phải ổn định.  | ☐   |

### 15.3 Tên file/sheet và nội dung file

| ID        | P   | Các bước thao tác/nút bấm                            | Kết quả mong đợi                                                                                 | KQ                                                                                                                                 |
| --------- | --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --- |
| SD-EF-001 | P0  | 1. Chọn **Trang hiện tại** ở page 2. 2. Xuất.        | File đúng các dòng 16–30 đang hiển thị, không phải page 1/toàn bộ.                               | ☐                                                                                                                                  |
| SD-EF-002 | P0  | 1. Chọn **Toàn bộ danh sách** với >15 dòng. 2. Xuất. | File đủ `total` dòng sau filter, không chỉ 15.                                                   | ☐                                                                                                                                  |
| SD-EF-003 | P0  | 1. Áp q+branch+category+tab+3 min. 2. Xuất toàn bộ.  | Mọi request giữ đủ filter; file đúng toàn bộ kết quả, không lẫn scope.                           | ☐                                                                                                                                  |
| SD-EF-004 | P1  | 101+ dòng                                            | 1. Xuất toàn bộ. 2. Đếm dòng/mã unique.                                                          | Fetch đủ các page size100; không thiếu/trùng; thứ tự đúng danh sách.                                                               | ☐   |
| SD-EF-005 | P1  | API một page sau lỗi                                 | 1. Mock page 2/3 lỗi. 2. Xuất all.                                                               | Không tạo file thiếu mà báo thành công; toast `Xuất Excel thất bại`, modal còn dùng được.                                          | ☐   |
| SD-EF-006 | P0  | Filter 0 dòng                                        | 1. Bấm Xuất → Xuất dữ liệu.                                                                      | Toast `Không có dữ liệu để xuất.`, không file; loading kết thúc.                                                                   | ☐   |
| SD-EF-007 | P1  | 1–15 dòng                                            | 1. So current và all.                                                                            | Cả hai cùng số dòng/nội dung với cùng filter; không khác format.                                                                   | ☐   |
| SD-EF-008 | P0  | 1. Nhập tên file `bao-cao-test`. 2. Xuất.            | File `bao-cao-test.xlsx`, không thêm `.xlsx` hai lần ngoài quy tắc đã nhập.                      | ☐                                                                                                                                  |
| SD-EF-009 | P1  | 1. Xóa trống tên file. 2. Xuất.                      | Dùng default filename theo ngày.                                                                 | ☐                                                                                                                                  |
| SD-EF-010 | P1  | 1. Nhập filename chứa ký tự cấm `\/:\*?"<>           | `. 2. Xuất.                                                                                      | Sanitize/validation hoặc toast rõ; không crash/unhandled exception.                                                                | ☐   |
| SD-EF-011 | P0  | 1. Đổi sheet `Ton lau`. 2. Xuất và mở file.          | Sheet đúng tên.                                                                                  | ☐                                                                                                                                  |
| SD-EF-012 | P1  | 1. Xóa sheet name.                                   | Fallback `Trang tính 1`.                                                                         | ☐                                                                                                                                  |
| SD-EF-013 | P1  | 1. Nhập sheet >31 ký tự/ký tự cấm `[]:*?/\`.         | Validation hoặc toast failure rõ, không modal kẹt.                                               | ☐                                                                                                                                  |
| SD-EF-014 | P0  | 1. Mở file. 2. So 15 header và 3 dòng với API/UI.    | Giá trị code/tên/category/NCC/cost/price/qty chính xác; không chuyển mã dài thành số khoa học.   | ☐                                                                                                                                  |
| SD-EF-015 | P0  | 1. So ba cột ngày.                                   | Format vi-VN; null lastSold=`Chưa bán lần nào`; null date khác=`—`; không lệch 1 ngày.           | ☐                                                                                                                                  |
| SD-EF-016 | P0  | 1. So 3 cột số ngày + trạng thái.                    | Số đúng; null sold=`Chưa bán lần nào`; status là `Nhập lâu - chưa bán`/`Bán chậm`/`Bình thường`. | ☐                                                                                                                                  |
| SD-EF-017 | P0  | 1. Chọn A. 2. Xuất.                                  | Tồn và Chi nhánh đều A; không global/B.                                                          | ☐                                                                                                                                  |
| SD-EF-018 | P1  | P15                                                  | 1. Xuất tên có dấu phẩy/nháy/xuống dòng.                                                         | Workbook mở bình thường, cell giữ nội dung, không lệch cột.                                                                        | ☐   |
| SD-EF-019 | P0  | P15 formula-like                                     | 1. Xuất. 2. Mở file trong sandbox an toàn.                                                       | Dữ liệu user bắt đầu `=,+,-,@` không được thực thi như formula nguy hiểm; phải được escape/text. Ghi security defect nếu thực thi. | ☐   |
| SD-EF-020 | P1  | Dữ liệu thay đổi khi modal mở                        | 1. Mở modal ở filter A. 2. Đóng modal, đổi B, mở lại và xuất.                                    | File dùng filter B mới; không closure/state A cũ.                                                                                  | ☐   |

> Ghi chú coverage: source có hàm xuất CSV nhưng **không có nút UI gọi hàm** trên trang hiện tại. Không invent nút CSV khi manual test; nếu yêu cầu sản phẩm có CSV thì ghi feature-gap.

## 16. URL, deep-link, Back/Forward, refresh và race condition

| ID        | P   | Các bước thao tác/nút bấm                                     | Kết quả mong đợi                                                                                          | KQ  |
| --------- | --- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --- |
| SD-UR-001 | P0  | 1. Tạo q+category+branch+tab+3 min. 2. Copy URL sang tab mới. | Tab mới khôi phục đủ control/data; không cần thao tác lại.                                                | ☐   |
| SD-UR-002 | P0  | 1. Với URL đã lọc, bấm F5.                                    | Filter giữ nguyên; temp search và applied search đồng bộ.                                                 | ☐   |
| SD-UR-003 | P1  | 1. Đổi Tất cả→Tồn lâu→Bán chậm. 2. Back hai lần. 3. Forward.  | Back/Forward lần lượt khôi phục tab/data, không bị effect ghi đè hoặc history thrash.                     | ☐   |
| SD-UR-004 | P1  | 1. Submit q=A rồi q=B. 2. Back.                               | Ô text/applied search/data cùng trở A.                                                                    | ☐   |
| SD-UR-005 | P1  | 1. Chọn branch A→B. 2. Back/Forward.                          | Select, URL, table, KPI cùng branch.                                                                      | ☐   |
| SD-UR-006 | P1  | 1. Gõ min 1→12→123. 2. Bấm Back một lần.                      | Continuous min dùng replace, không tạo hàng chục history entry; Back rời/khôi phục discrete state hợp lý. | ☐   |
| SD-UR-007 | P1  | 1. Mở `?tab=abc`.                                             | Normalize về Tất cả; URL invalid được dọn hoặc UI xử lý rõ; không gửi trạng thái lạ.                      | ☐   |
| SD-UR-008 | P1  | 1. Mở URL có q Unicode, `&`, `#`, `+`, `%`.                   | Decode đúng một lần; không mất phần sau ký tự; không XSS.                                                 | ☐   |
| SD-UR-009 | P1  | 1. Mở URL `minStartDays=-1&minSoldDays=-1&minStock=-1`.       | Không 500; backend clamp/validation. UI không được hiển thị âm nhưng dùng kết quả khác mà không báo.      | ☐   |
| SD-UR-010 | P1  | 1. Mở URL min bằng chữ/NaN.                                   | Không 500; sanitize/reset/báo invalid.                                                                    | ☐   |
| SD-UR-011 | P2  | 1. Thêm query không biết `foo=bar`. 2. Reload. 3. Đổi filter. | Query lạ không ảnh hưởng data; ghi hành vi bị giữ/xóa, không loop.                                        | ☐   |
| SD-UR-012 | P1  | 1. Mở URL filter khi API chậm. 2. Ngay lập tức đổi tab.       | Response deep-link cũ không ghi đè tab mới.                                                               | ☐   |
| SD-UR-013 | P1  | 1. Bấm Làm mới. 2. Ngay khi request chờ, bấm tab/filter khác. | Kết quả cuối theo thao tác cuối, URL không quay về sạch ngoài ý muốn.                                     | ☐   |
| SD-UR-014 | P2  | 1. Mở cùng trang ở 2 tab browser, filter khác nhau.           | State độc lập theo URL; thao tác tab A không đổi tab B.                                                   | ☐   |

## 17. Responsive, tương thích, accessibility, bảo mật và hiệu năng

### 17.1 Responsive/visual

| ID        | P   | Các bước thao tác/nút bấm                            | Kết quả mong đợi                                                                                    | KQ  |
| --------- | --- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --- |
| SD-RS-001 | P1  | 1. Test 1920×1080.                                   | Toolbar/table cân đối; action luôn tiếp cận; sticky toolbar không che header/dòng.                  | ☐   |
| SD-RS-002 | P1  | 1. Test 1366×768 ở zoom 100%.                        | Không chồng controls; table scroll trong container thay vì body ngang bất thường.                   | ☐   |
| SD-RS-003 | P1  | 1. Test width 1024/768. 2. Mở filter nâng cao.       | Controls wrap/scroll hợp lý; không mất nút Lọc/Làm mới/Xuất.                                        | ☐   |
| SD-RS-004 | P1  | 1. Test 390×844 và 360×800.                          | Có thể dùng search/filter/tab/action; text không đè; table cuộn ngang có chủ đích; body không tràn. | ☐   |
| SD-RS-005 | P1  | 1. Mobile mở menu `…` dòng đầu/cuối.                 | Portal nằm trong viewport, item bấm được, không bị keyboard/address bar che.                        | ☐   |
| SD-RS-006 | P1  | 1. Mobile mở modal giá xả. 2. Cuộn.                  | Modal trong viewport, footer/nút đóng tiếp cận; background không click xuyên.                       | ☐   |
| SD-RS-007 | P1  | 1. Mobile mở modal Excel. 2. Cuộn danh sách cột.     | Modal max-height, body nội bộ cuộn; footer tiếp cận; input 1 cột.                                   | ☐   |
| SD-RS-008 | P1  | 1. Zoom browser 200%.                                | Nội dung reflow/scroll, không mất control/text; WCAG resize text cơ bản.                            | ☐   |
| SD-RS-009 | P2  | 1. Zoom 80/125/150%. 2. Mở action menu.              | Vị trí menu tính đúng theo viewport sau zoom.                                                       | ☐   |
| SD-RS-010 | P2  | 1. Xoay mobile portrait↔landscape khi menu/modal mở. | Menu đóng khi resize; modal thích ứng, state không mất ngoài ý muốn.                                | ☐   |

### 17.2 Bàn phím và screen reader

| ID        | P   | Các bước thao tác/nút bấm                            | Kết quả mong đợi                                                                                                    | KQ  |
| --------- | --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --- |
| SD-AX-001 | P1  | 1. Chỉ dùng Tab từ header qua trang.                 | Thứ tự focus logic; mọi button/select/input/action tới được; focus visible.                                         | ☐   |
| SD-AX-002 | P1  | 1. Focus 3 tab. 2. Dùng Enter/Space.                 | Chuyển tab; role tab/aria-selected/aria-controls đúng.                                                              | ☐   |
| SD-AX-003 | P1  | 1. Dùng screen reader đọc search và selects.         | Search có tên qua placeholder/semantic phù hợp; select có title/label đủ rõ. Ghi defect nếu chỉ title không đọc ổn. | ☐   |
| SD-AX-004 | P1  | 1. Đọc nút `…` từng dòng.                            | Tên `Mở thao tác cho <code>`, expanded/haspopup đúng.                                                               | ☐   |
| SD-AX-005 | P1  | 1. Mở action menu bằng keyboard.                     | Focus nên vào menu, arrow/Tab/Escape hợp lý, rồi trả trigger. Nếu không, ghi a11y defect.                           | ☐   |
| SD-AX-006 | P1  | 1. Mở/đóng modal giá xả bằng keyboard.               | Dialog có name, focus trap/return focus, Escape hoạt động; background inert.                                        | ☐   |
| SD-AX-007 | P1  | 1. Mở/đóng modal Excel.                              | Dialog labelled; X có accessible name; trap/restore focus hoạt động.                                                | ☐   |
| SD-AX-008 | P2  | 1. Bật Windows High Contrast/prefers-reduced-motion. | Active tab, badge, error/success không chỉ dựa màu; animation không gây cản trở.                                    | ☐   |
| SD-AX-009 | P2  | 1. Chạy axe/Lighthouse accessibility.                | Không lỗi nghiêm trọng: label, contrast, dialog, focus, duplicate id.                                               | ☐   |

### 17.3 Browser, bảo mật và hiệu năng

| ID        | P   | Các bước thao tác/nút bấm                                            | Kết quả mong đợi                                              | KQ                                                                                                           |
| --------- | --- | -------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --- |
| SD-CB-001 | P1  | 1. Chạy Smoke trên Chrome mới nhất.                                  | Pass.                                                         | ☐                                                                                                            |
| SD-CB-002 | P1  | 1. Chạy Smoke trên Edge mới nhất.                                    | Hành vi/file download/date/confirm nhất quán.                 | ☐                                                                                                            |
| SD-CB-003 | P2  | 1. Chạy Smoke Firefox.                                               | Không lỗi portal/XLSX/select/number khác browser.             | ☐                                                                                                            |
| SD-CB-004 | P2  | 1. Chạy Safari nếu môi trường hỗ trợ.                                | Không lệch date/download/modal.                               | ☐                                                                                                            |
| SD-SC-001 | P0  | 1. Dùng user không quyền gọi update giá xả trực tiếp.                | Backend 403, không dựa vào việc ẩn nút.                       | ☐                                                                                                            |
| SD-SC-002 | P0  | 1. Gọi storage API không token/token user khác tenant nếu có.        | 401/403 và tenant isolation; không lộ giá vốn/tồn.            | ☐                                                                                                            |
| SD-SC-003 | P1  | 1. Tamper branchId/categoryId/productId bằng ID không thuộc phạm vi. | Không IDOR/lộ dữ liệu hoặc sửa SP ngoài quyền.                | ☐                                                                                                            |
| SD-SC-004 | P1  | 1. Tìm payload SQLi phổ biến trong local an toàn.                    | Không SQL error/bypass/delay; query parameter hóa.            | ☐                                                                                                            |
| SD-SC-005 | P1  | 1. Dùng XSS payload ở tên/note/category từ fixture.                  | Render text, không thực thi ở table/modal/toast/file preview. | ☐                                                                                                            |
| SD-SC-006 | P1  | 1. Kiểm file Excel formula-like theo SD-EF-019.                      | Không formula injection.                                      | ☐                                                                                                            |
| SD-PF-001 | P1  | P18 lớn                                                              | 1. Reload. 2. Đo Network/Performance.                         | Một request chính + hai lookup; không N+1 phía client; UI tương tác được trong SLA dự án.                    | ☐   |
| SD-PF-002 | P1  | 5.000 base SP                                                        | 1. Lọc/tab/page.                                              | API không timeout/memory spike bất thường dù backend shape/filter in-memory; có pagination response ổn định. | ☐   |
| SD-PF-003 | P1  | 5.000 kết quả                                                        | 1. Xuất toàn bộ.                                              | Có progress; không freeze/tab crash; file đủ hoặc báo giới hạn rõ.                                           | ☐   |
| SD-PF-004 | P2  | 101+ kết quả                                                         | 1. Xuất all và xem Network.                                   | Các page sau gọi đúng một lần; không lặp vô hạn; failures không tạo partial success.                         | ☐   |
| SD-PF-005 | P2  | Trang mở lâu                                                         | 1. Đổi filter/menu/modal 50 lần. 2. Xem memory/listeners.     | Không tăng listener/portal/timer không giới hạn; toast/menu cleanup đúng.                                    | ☐   |

## 18. Ma trận tổ hợp bắt buộc

### 18.1 Filter × tab × branch

Chạy mỗi tổ hợp bằng: **chọn control → chờ request → kiểm URL → kiểm KPI → đếm rows → đối soát ít nhất 3 dòng → xuất current một mẫu**.

- Tab: `Tất cả ☐ | Tồn lâu ☐ | Bán chậm ☐`
- Branch: `Tất cả ☐ | A ☐ | B ☐`
- Category: `Tất cả ☐ | C1 ☐ | C2 ☐`
- Search: `rỗng ☐ | code exact ☐ | tên partial ☐ | barcode ☐ | không khớp ☐`
- MinStart: `rỗng ☐ | 0 ☐ | 29 ☐ | 30 ☐ | 31 ☐ | 90 ☐`
- MinSold: `rỗng ☐ | 0 ☐ | 29 ☐ | 30 ☐ | 31 ☐ | 90 ☐`
- MinStock: `rỗng ☐ | 1 ☐ | đúng biên qty ☐ | qty+1 ☐`

Không cần nhân Descartes toàn bộ nếu dữ liệu/chi phí không cho phép, nhưng tối thiểu phải chạy:

| Matrix ID | Tổ hợp                                                                   | KQ  |
| --------- | ------------------------------------------------------------------------ | --- |
| SD-MX-001 | 3 tab × 3 branch = 9 tổ hợp                                              | ☐   |
| SD-MX-002 | 3 tab × 3 category = 9 tổ hợp                                            | ☐   |
| SD-MX-003 | 3 tab × 5 loại search = 15 tổ hợp                                        | ☐   |
| SD-MX-004 | 3 tab × minStart {29,30,31} = 9 tổ hợp                                   | ☐   |
| SD-MX-005 | 3 tab × minSold {29,30,31} = 9 tổ hợp                                    | ☐   |
| SD-MX-006 | Branch {A,B} × minStock {biên, biên+1} = 4 tổ hợp                        | ☐   |
| SD-MX-007 | Một tổ hợp đủ 7 filter, sau đó Back/Forward/Reload/Copy URL              | ☐   |
| SD-MX-008 | Current/all Excel trên trang 1, trang cuối, empty, branch A và đủ filter | ☐   |

### 18.2 Biên phân loại bắt buộc

`Chưa bán 29 ☐ | Chưa bán 30 ☐ | Đã bán 29 ☐ | Đã bán 30 ☐ | Nhập 89 ☐ | Nhập 90 ☐ | Sale hôm nay ☐ | Sale bị hủy ☐ | Không transaction ☐ | Khác branch ☐`

### 18.3 Regression sau mutation giá xả

Sau mỗi lần đặt/bỏ giá, kiểm lại:  
`giá chính ☐ | giá xả ☐ | active/menu ☐ | ghi chú ☐ | filter/tab ☐ | KPI/count ☐ | reload F5 ☐ | trang Sản phẩm ☐ | file Excel ☐`

## 19. Checklist kết thúc phiên test

| ID         | Việc cần làm                                                                      | KQ  |
| ---------- | --------------------------------------------------------------------------------- | --- |
| SD-END-001 | Không để lại phiếu chuyển/xuất trả nháp hoặc dữ liệu test ngoài phạm vi cho phép. | ☐   |
| SD-END-002 | Hoàn nguyên giá xả các fixture nếu test đã sửa.                                   | ☐   |
| SD-END-003 | Đối chiếu tổng PASS/FAIL/BLOCKED/N/A; mọi P0 FAIL có ticket.                      | ☐   |
| SD-END-004 | Mỗi lỗi có screenshot/video + Network + Console + fixture + URL.                  | ☐   |
| SD-END-005 | Chạy lại Smoke P0 sau khi fix và regression các vùng liên quan.                   | ☐   |

## 20. Các probe rủi ro cao nên ưu tiên phát hiện lỗi

1. **API không token:** route dữ liệu/giá vốn phải bị bảo vệ (`SD-AU-007`, `SD-SC-002`).
2. **Tồn tối thiểu khi chọn branch:** source hiện lọc global qty nhưng hiển thị branch qty (`SD-BR-012`).
3. **Sort khi chọn branch:** source sort global qty, có thể trái với cột tồn branch (`SD-CL-017`, `SD-BR-013`).
4. **KPI/tiền khác phạm vi rows:** tab và min-day không tác động KPI (`SD-KP-010`–`014`).
5. **Branch trong file khi chọn Tất cả:** có nguy cơ gắn tên stock đầu tiên cho qty global (`SD-BR-014`).
6. **Giá xả bằng 0:** active nhưng nhãn Xả bị ẩn (`SD-TB-006`, `SD-DC-005`–`007`).
7. **Modal giá xả:** thiếu Escape/focus trap và nút chưa khóa lúc lưu (`SD-DC-015/016`, `SD-DS-007`).
8. **Tên cột Excel trùng:** object key có thể làm mất một cột (`SD-EC-011`).
9. **Excel formula injection:** dữ liệu bắt đầu `=,+,-,@` (`SD-EF-019`).
10. **Page vượt total sau dữ liệu đổi:** có thể hiện page/range vô nghĩa (`SD-PG-008`).
11. **Categories chỉ tải 100:** danh mục sau mốc không chọn được (`SD-CA-007`).
12. **Lỗi API lookup im lặng:** branch/category fail chỉ log Console (`SD-LD-006/008`).
