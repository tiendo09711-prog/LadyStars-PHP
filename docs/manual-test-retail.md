# Kịch bản manual test đầy đủ — Bán lẻ (`/sales-channels/store/retail`)

> Tài liệu này được đối chiếu theo route, UI React, API Laravel, state/action hiện tại và các màn hình đọc chung dữ liệu bán hàng. Phạm vi gồm danh sách hóa đơn, tạo/sửa/hủy/xóa, in, xuất Excel, đổi trả/đổi hàng và kiểm tra chéo tồn kho, khách hàng, dashboard, nhân viên, trang trả hàng và các báo cáo doanh thu.

## 1. Nguyên tắc an toàn và cách ghi nhận

- Đây là luồng ghi **hóa đơn, tồn kho, khách hàng và doanh thu**. Chỉ test trên database local/test cô lập; không dùng hóa đơn, tồn kho hoặc khách hàng thật.
- Tạo fixture có tiền tố `QA-RTL-<ngày>-...`. Trước mỗi ca ghi lại tồn đầu, sau ca ghi tồn cuối. Không dùng một fixture cho hai ca chạy song song.
- Mỗi ca ghi: `PASS/FAIL`, tài khoản/vai trò, thời gian, trình duyệt, độ phân giải, mã hóa đơn, mã trả hàng, tồn trước/sau, ảnh/video và request/response lỗi trong DevTools > Network.
- Với thao tác ghi, không chỉ tin toast. Luôn quay về Bán lẻ → bấm **Làm mới** → tìm mã → mở **Chi tiết**, sau đó kiểm tra các trang liên quan trong mục 16.
- Khi giả lập lỗi 401/403/409/422/500 hoặc mất mạng, dùng DevTools chặn request hay môi trường test. Không sửa trực tiếp dữ liệu thật.
- Không reload/Back trong lúc nút đang hiện **Đang lưu.../Đang xử lý...**, trừ đúng các ca kiểm tra gián đoạn.
- Kỳ vọng tồn kho chuẩn:
  - Bán hoàn tất `Q`: tồn kho thực hiện giảm đúng `Q` một lần.
  - Hủy hóa đơn hoàn tất: tồn tăng lại đúng `Q` một lần.
  - Sửa từ `Q cũ` sang `Q mới`: tồn phải thay đổi theo `Q cũ - Q mới`, đúng một lần.
  - Trả `R`: tồn hàng trả tăng `R`; hàng mua mới/đổi `E` giảm `E`, tất cả tại kho hóa đơn gốc.
- Kỳ vọng doanh thu chuẩn: chỉ hóa đơn **Hoàn tất** được tính; hóa đơn nháp/hủy không tính; hoàn tiền được trừ ở doanh thu thuần theo đúng ngày, kênh, cửa hàng, nhân viên, sản phẩm.

## 2. Ma trận vai trò và kiểm tra bảo mật

| Chức năng                                      | ADMIN/OWNER/ROOT |       EMPLOYEE |
| ---------------------------------------------- | ---------------: | -------------: |
| Xem, lọc, phân trang, chi tiết, in, xuất Excel |               Có |             Có |
| Tạo hóa đơn                                    |       Có theo UI |     Có theo UI |
| Đổi trả hóa đơn hợp lệ                         |       Có theo UI |     Có theo UI |
| Sửa hóa đơn hoàn tất chưa đổi trả              |               Có | Không hiển thị |
| Hủy/xóa hóa đơn                                |               Có | Không hiển thị |

> **Ca bảo mật bắt buộc:** route backend bán hàng hiện không thể hiện middleware quyền ngay tại khai báo route. Việc ẩn nút không đủ. EMPLOYEE phải bị từ chối nếu tự gọi PATCH/DELETE/cancel theo chính sách admin-only của UI; nếu API vẫn ghi dữ liệu, báo lỗi **Critical — broken access control**.

## 3. Dữ liệu chuẩn bị

Chuẩn bị trên database test:

1. Hai kho hoạt động: `QA-RTL-KHO-A`, `QA-RTL-KHO-B`; một kho ngừng hoạt động.
2. `QA-RTL-SP-A`: mã/barcode duy nhất, giá 100.000, tồn A=20, B=7.
3. `QA-RTL-SP-B`: giá 250.000, tồn A=10, B=0.
4. `QA-RTL-SP-C`: giá 0 hoặc giá rất nhỏ để test biên, tồn A=5.
5. Một sản phẩm hết hàng tại A; một sản phẩm tên dài và có ký tự `& < > " '`.
6. Một sản phẩm quà tặng/fixture hóa đơn có dòng `isGift`, nếu hệ thống chưa có UI tạo quà thì dùng dữ liệu test hợp lệ có sẵn.
7. Khách cũ `QA-RTL-KH-CU`, SĐT duy nhất, có đầy đủ email/ngày sinh/địa chỉ; ghi lại chỉ số hiện tại.
8. Một ADMIN và một EMPLOYEE hoạt động; ít nhất hai nhân viên bán hàng.
9. Ba phương thức hoạt động: **Tiền mặt**, **Chuyển khoản**, **Trả góp**; nếu có phương thức khác/inactive để xác minh không xuất hiện.
10. Ít nhất 16 hóa đơn retail channel `store` để có hai trang; thêm một hóa đơn wholesale và một hóa đơn channel khác để kiểm tra không lẫn.
11. Fixture theo trạng thái: `draft`, `completed` chưa trả, `completed + partial`, `completed + full`, `cancelled`, hóa đơn có nhiều sản phẩm/nhiều thanh toán/giảm %/giảm tiền.
12. Chốt mốc thời gian test và chụp số liệu trước test tại các trang đối soát ở mục 16.

## 4. Checklist đối soát nhanh cho mọi thao tác ghi

Sau **mỗi** ca CREATE/EDIT/CANCEL/DELETE/RETURN/EXCHANGE, thực hiện đúng chuỗi:

1. Vào `/sales-channels/store/retail` → **Làm mới** → lọc mã hóa đơn.
2. Bấm mã hóa đơn → đối chiếu trạng thái, khách, dòng hàng, SL, giá, giảm giá, tổng, thanh toán, kho, người tạo.
3. Vào `/products/inventory` → chọn kho → tìm từng mã SP → đối chiếu tồn.
4. Vào `/customers/list` → tìm khách → mở chi tiết → đối chiếu lịch sử/tổng hợp nếu màn hình hỗ trợ.
5. Với trả/đổi: vào `/sales-channels/store/refund` → tìm phiếu → mở chi tiết.
6. Vào Dashboard và bốn báo cáo `/reports/revenue/time`, `/store`, `/staff`, `/products`; chọn đúng ngày/channel/status/store/staff/product rồi **Áp dụng/Lọc**.
7. Hard reload từng trang đọc để loại trừ số liệu cache; không được chỉ dựa vào state vừa cập nhật.

## 5. Route, tải trang và trạng thái chung

### NAV-01 — Mở trực tiếp và từ menu (Cả hai)

**Bước:** Đăng nhập → nhập `/sales-channels/store/retail` → Enter; sau đó đi trang khác → menu **Kênh bán/Cửa hàng** → **Bán lẻ**.  
**Mong đợi:** Đúng URL; layout/menu active; tiêu đề **Hóa đơn bán lẻ**, KPI, bộ lọc và bảng xuất hiện; không trắng trang/lỗi console.

### NAV-02 — Route cũ và query tab cũ (Cả hai)

**Bước:** Mở lần lượt `/retail/confirm`, `/retail/payment-confirmation`, `/retail/payment-confirm`, `/retail?tab=confirm`, `?tab=payment-confirmation`, `?tab=payment_confirm_pending`.  
**Mong đợi:** Được đưa về danh sách retail sạch, query retired bị loại; không loop navigation hay trang 404.

### NAV-03 — Back/Forward và deep link create/edit (Cả hai/ADMIN)

**Bước:** Danh sách → **Thêm hóa đơn** → chọn kho → **Chọn** → Back → Forward. ADMIN mở URL create có `editId` hợp lệ.  
**Mong đợi:** Mỗi trang khớp URL, không nhân request/lưu; edit tải đúng hóa đơn.

### NAV-04 — Loading (Cả hai)

**Bước:** DevTools Network Slow 3G → reload.  
**Mong đợi:** Bảng có skeleton; create có **Đang tải dữ liệu bán lẻ...**; không nháy quyền sửa/xóa trước khi `/auth/me` hoàn tất.

### NAV-05 — Empty và không có kết quả (Cả hai)

**Bước:** Lọc mã không tồn tại.  
**Mong đợi:** **Không có hóa đơn phù hợp**; KPI tổng/đang hiển thị/tổng tiền trang/đã thu trang bằng 0 hợp lý; phân trang `0 - 0`.

### NAV-06 — Lỗi tải danh sách và Thử lại (Cả hai)

**Bước:** Chặn `GET /api/products/sales` → reload → bỏ chặn → bấm **Thử lại**.  
**Mong đợi:** Alert **Không tải được dữ liệu**, không hiện dữ liệu cũ như mới; **Thử lại** tải được.

### NAV-07 — Lỗi tải kho (Cả hai)

**Bước:** Chặn `GET /api/system/branches` → bấm **Thêm hóa đơn** → bỏ chặn → **Thử lại**.  
**Mong đợi:** Modal báo lỗi rõ; retry ra danh sách; nếu không có kho báo **Chưa có cửa hàng/kho hàng...**; không thể tiếp tục khi chưa chọn.

### NAV-08 — Session hết hạn (Cả hai)

**Bước:** Làm token hết hạn → reload, lọc, mở chi tiết và thử lưu trong môi trường test.  
**Mong đợi:** Chuyển login/hiện lỗi xác thực nhất quán; không lộ action admin; không ghi dở dữ liệu.

## 6. KPI, bảng, bộ lọc và phân trang

### LIST-01 — Cột và phép tính một dòng (Cả hai)

**Bước:** **Làm mới** → tìm fixture nhiều dòng/multi-payment → đối chiếu 12 cột.  
**Mong đợi:** Người/ngày, ID, khách/SĐT, SP đầu + số SP khác, giá trị hàng hóa, tổng SL, giảm giá, tổng tiền, từng khoản thanh toán, trạng thái đúng; định dạng vi-VN; null là `—`.

### LIST-02 — KPI và footer chỉ tính trang hiện tại (Cả hai)

**Bước:** Ghi tổng bằng tay trang 1 → đối chiếu **Tổng tiền trang**, **Đã thu trang**, footer → sang trang 2.  
**Mong đợi:** `Tổng hóa đơn` là toàn bộ kết quả; `Đang hiển thị` đúng dải; tiền KPI/footer đổi theo đúng 15 dòng trang hiện tại, không phải toàn bộ.

### FILTER-01 — Mã hóa đơn (Cả hai)

**Bước:** Nhập mã đầy đủ, một phần, hoa/thường, khoảng trắng → bấm **Lọc** và thử Enter.  
**Mong đợi:** Kết quả đúng backend; Enter tương đương **Lọc**; trang về 1; draft input chưa submit chưa đổi bảng.

### FILTER-02 — Cửa hàng (Cả hai)

**Bước:** Chọn lần lượt Kho A, Kho B → **Lọc**.  
**Mong đợi:** Mọi dòng thuộc đúng kho; wholesale/channel khác không lẫn; tổng/KPI đúng.

### FILTER-03 — Khoảng ngày và biên ngày (Cả hai)

**Bước:** Chọn cùng ngày; khoảng nhiều ngày; ngày có hóa đơn lúc 00:00 và 23:59; chọn **Từ** rồi kiểm tra min của **Đến**.  
**Mong đợi:** Hai biên được bao gồm theo timezone ứng dụng; không cho chọn `Đến < Từ`; không lệch ngày UTC.

### FILTER-04 — Khách hàng (Cả hai)

**Bước:** Tìm bằng tên đầy đủ/một phần, SĐT, mã khách; thử dấu/hoa thường.  
**Mong đợi:** Chỉ hóa đơn của khách khớp; không match ngẫu nhiên khách khác.

### FILTER-05 — Sản phẩm (Cả hai)

**Bước:** Tìm bằng tên, mã, barcode của sản phẩm nằm ở dòng đầu và dòng thứ hai.  
**Mong đợi:** Đều tìm được hóa đơn chứa sản phẩm; không phụ thuộc dòng đầu.

### FILTER-06 — Kết hợp tất cả điều kiện (Cả hai)

**Bước:** Nhập mã + kho + ngày + khách + SP → **Lọc**; lần lượt bỏ một điều kiện.  
**Mong đợi:** Điều kiện AND; badge **Đang lọc** đúng; tổng và dải đúng.

### FILTER-07 — Làm mới (Cả hai)

**Bước:** Đang trang 2 và có nhiều filter → **Làm mới**.  
**Mong đợi:** Xóa toàn bộ 6 filter, về trang 1, bỏ badge; dữ liệu tải lại.

### FILTER-08 — Ký tự đặc biệt/XSS/chuỗi dài (Cả hai)

**Bước:** Nhập `% _ ' " <script> 😀` và chuỗi 500 ký tự ở mã/khách/SP → **Lọc**.  
**Mong đợi:** Không XSS/SQL error/500/crash; text được escape; UI không vỡ.

### PAGE-01 — Trước/sau và biên (Cả hai)

**Bước:** Với >15 dòng, bấm **Trang sau**, **Trang trước** đến hai đầu.  
**Mong đợi:** Không lặp/mất dòng; nút đầu/cuối disabled; selected bị xóa khi page data reload; page/range đúng.

### PAGE-02 — Dữ liệu giảm làm page hiện tại vượt tổng (ADMIN)

**Bước:** Ở trang cuối chỉ có một fixture → hủy/xóa fixture → quay danh sách.  
**Mong đợi:** Không kẹt ở trang rỗng `page > totalPages`; tự về trang hợp lệ. Nếu không, ghi lỗi phân trang.

### SELECT-01 — Checkbox một/tất cả (Cả hai)

**Bước:** Tick một dòng → tick thêm → bỏ; tick header → bỏ header.  
**Mong đợi:** KPI/nhãn **Đã chọn N** đúng; header chỉ chọn trang hiện tại; chọn dòng không mở detail.

## 7. Menu dòng, modal chi tiết và accessibility

### MENU-01 — Mở/đóng đúng dòng (Cả hai)

**Bước:** Bấm `...` hai dòng khác nhau; bấm lại trigger; click ngoài; Escape; scroll; resize.  
**Mong đợi:** Chỉ một menu mở; đóng đúng mọi cách; menu không bị bảng cắt/ra viewport; không kích nhầm dòng.

### MENU-02 — Ma trận trạng thái action (ADMIN và EMPLOYEE)

**Bước:** Mở `...` cho draft/completed/partial/full/cancelled.  
**Mong đợi:**

- **Đổi trả**: chỉ completed còn số lượng trả.
- **Sửa**: chỉ ADMIN và completed chưa đổi trả.
- **Xóa**: chỉ ADMIN; draft/cancelled xóa vĩnh viễn, completed chưa trả là hủy + hoàn tồn.
- partial/full có action bị khóa với tooltip đúng.
- EMPLOYEE không thấy **Sửa/Xóa**.

### DETAIL-01 — Mở bằng mã và menu (Cả hai)

**Bước:** Bấm mã hóa đơn; đóng `X`; mở từ `...` → **Xem chi tiết** → **Đóng**.  
**Mong đợi:** Cùng dữ liệu; customer, status, tất cả dòng SP, note, tổng/giảm/thanh toán, kho/người/ngày đúng.

### DETAIL-02 — Lỗi chi tiết (Cả hai)

**Bước:** Chặn `GET /api/products/sales/{id}` → mở detail.  
**Mong đợi:** Modal báo **Không tải được chi tiết hóa đơn**, không crash/không dùng dữ liệu list để giả là đầy đủ; vẫn đóng được.

### A11Y-01 — Keyboard/focus (Cả hai)

**Bước:** Chỉ dùng Tab/Shift+Tab/Enter/Space/Escape để lọc, mở menu, detail, modal kho.  
**Mong đợi:** Focus nhìn thấy; thứ tự hợp lý; button/checkbox/select dùng được; Escape đóng menu. Nếu modal không giữ focus/không Escape thì ghi lỗi accessibility.

### UI-01 — Responsive (Cả hai)

**Bước:** Test 1440×900, 1024×768, 768×1024, 390×844; scroll dọc/ngang; hover/focus/action/modal.  
**Mong đợi:** Không body horizontal overflow; bảng có scroll riêng; toolbar/KPI không đè; menu/modal trong viewport; vùng bấm đủ lớn; không mất action.

## 8. Chọn kho và tạo hóa đơn

### CREATE-01 — Modal chọn kho (Cả hai)

**Bước:** **Thêm hóa đơn** → không chọn và quan sát **Chọn** → chọn Kho A → đổi Kho B → **Hủy**; mở lại → chọn A → **Chọn**.  
**Mong đợi:** Nút disabled khi chưa chọn; chỉ một kho active; Hủy không điều hướng; Chọn đi `/retail/create?branchId=<A>`; kho inactive không xuất hiện.

### CREATE-02 — Nút đóng modal (Cả hai)

**Bước:** Mở modal → bấm `X`; thử click backdrop và Escape.  
**Mong đợi:** `X` đóng. Ghi nhận hành vi backdrop/Escape theo UI; không được click xuyên tạo đơn.

### CREATE-03 — Màn hình tạo và khóa kho (Cả hai)

**Bước:** Chọn Kho A → kiểm tra header/form.  
**Mong đợi:** Đúng tên/mã kho; select **Kho thực hiện** disabled do URL branch; mã là **Tự động khi lưu**; người bán mặc định user; nút lưu enabled khi đã có kho.

### CREATE-04 — URL thiếu/sai kho (Cả hai)

**Bước:** Mở `/retail/create` không branch; mở với `branchId` không tồn tại/inactive.  
**Mong đợi:** Thiếu kho cho chọn kho hợp lệ nhưng lưu bị chặn; ID sai báo lỗi tải, không cho tạo vào kho giả.

### CREATE-05 — Quay lại và dữ liệu chưa lưu (Cả hai)

**Bước:** Nhập dữ liệu → bấm mũi tên **Quay lại**, Back trình duyệt.  
**Mong đợi:** Không tạo hóa đơn/tồn/khách. Nếu không có cảnh báo mất dữ liệu, ghi lỗi UX.

## 9. Khách hàng trên form tạo

### CUST-01 — Chọn khách cũ bằng tên (Cả hai)

**Bước:** Focus **Tên khách hàng** → gõ tên → đợi dropdown → bấm đúng khách.  
**Mong đợi:** Điền đúng SĐT/email/Facebook/ngày sinh/khu vực/địa chỉ/mã thẻ/cấp độ; dropdown đóng.

### CUST-02 — Tìm bằng SĐT và debounce (Cả hai)

**Bước:** Gõ nhanh nhiều ký tự vào tên hoặc phone; chờ >250ms.  
**Mong đợi:** Kết quả cuối khớp keyword mới nhất; response cũ không ghi đè; click đúng khách.

### CUST-03 — Tạo khách mới có SĐT (Cả hai)

**Bước:** Nhập tên/SĐT chưa tồn tại + trường phụ → tạo đơn.  
**Mong đợi:** Chỉ tạo một khách; dữ liệu đúng; hóa đơn liên kết khách; danh sách/chi tiết khách tìm được.

### CUST-04 — Trùng SĐT khách cũ (Cả hai)

**Bước:** Không chọn dropdown, nhập tên khác nhưng SĐT đã tồn tại → lưu.  
**Mong đợi:** Không tạo khách trùng; hệ thống dùng và cập nhật đúng khách theo SĐT. Đặc biệt kiểm tra việc tên/địa chỉ cũ có bị ghi đè ngoài ý muốn.

### CUST-05 — Không SĐT, trùng tên (Cả hai)

**Bước:** Nhập đúng tên khách cũ nhưng bỏ SĐT → lưu; lặp lại tên khác hoa/thường/khoảng trắng.  
**Mong đợi:** Match chính xác theo tên chuẩn hóa hoặc tạo mới theo quy tắc; không chọn nhầm người đồng tên. Nếu hệ thống hợp nhất người đồng tên, báo rủi ro dữ liệu.

### CUST-06 — Sửa input sau khi chọn suggestion (Cả hai)

**Bước:** Chọn khách A → sửa tên; sau đó sửa riêng SĐT → lưu.  
**Mong đợi:** selected ID được bỏ khi sửa tên; không vô tình cập nhật khách A nếu người dùng đang tạo khách mới. Ghi rõ nếu sửa SĐT vẫn giữ selected ID và làm đổi khách A.

### CUST-07 — Validation/format trường khách (Cả hai)

**Bước:** Bỏ tên → lưu; email sai; ngày tương lai; SĐT chữ/rất dài; XSS ở tên/địa chỉ/note.  
**Mong đợi:** Tên bắt buộc; email dùng validation browser; dữ liệu sai phải bị chặn/validate theo nghiệp vụ; không XSS/vỡ layout.

## 10. Sản phẩm, scanner, giá, số lượng và giảm giá

### PROD-01 — Tìm theo tên/mã/barcode (Cả hai)

**Bước:** Trong ô **Tìm theo mã, barcode hoặc tên...**, thử từng loại → bấm kết quả.  
**Mong đợi:** Chỉ SP có tồn >0 tại kho đã chọn; thêm dòng qty=1, giá hiện tại; ô tìm xóa và dropdown đóng.

### PROD-02 — Quét barcode/mã duy nhất (Cả hai)

**Bước:** Focus ô scan → quét barcode hợp lệ nhiều lần.  
**Mong đợi:** Lần đầu thêm; lần sau tăng qty đến tối đa tồn; focus quay lại; không thêm hai dòng cùng SP.

### PROD-03 — Scan không tồn tại/trùng exact (Cả hai)

**Bước:** Quét mã lạ và mã có nhiều match dữ liệu lỗi.  
**Mong đợi:** Mở kết quả tìm kiếm/không tự chọn sai; không thêm hàng không xác định.

### PROD-04 — Hết hàng và khác kho (Cả hai)

**Bước:** Tìm SP hết tại A nhưng còn tại B.  
**Mong đợi:** Không cho thêm ở A; nếu cố scan hiện thông báo hết hàng phù hợp vai trò; không dùng tổng tồn toàn hệ thống.

### PROD-05 — Số lượng biên (Cả hai)

**Bước:** Nhập 0, âm, rỗng, 1, đúng tồn, vượt tồn, số thập phân và số rất lớn.  
**Mong đợi:** UI clamp 1..tồn; backend cũng phải từ chối vượt tồn/SL không hợp lệ; không bán âm/thập phân nếu SP đếm theo chiếc.

### PROD-06 — Đơn giá biên (Cả hai)

**Bước:** Nhập 0, âm, rỗng, giá mới, thập phân, cực lớn.  
**Mong đợi:** Không âm/NaN/overflow; tổng cập nhật đúng. Nếu EMPLOYEE được tùy ý sửa giá, xác minh đây là nghiệp vụ cho phép; nếu không báo lỗi quyền.

### PROD-07 — Xóa dòng (Cả hai)

**Bước:** Thêm hai SP → bấm icon thùng rác từng dòng.  
**Mong đợi:** Đúng dòng bị xóa; tổng SL/tiền/giảm/thanh toán tự cập nhật; empty state khi hết dòng.

### PROD-08 — Đổi kho khi form không khóa (Cả hai)

**Bước:** Mở create không branch → chọn A, thêm hàng → đổi B.  
**Mong đợi:** Xóa toàn bộ dòng cũ; tải tồn B; không giữ qty/stock từ A.

### DISC-01 — Giảm tiền (Cả hai)

**Bước:** Tổng 450.000 → nhập giảm 50.000.  
**Mong đợi:** Tổng 400.000; giảm không vượt subtotal; payment một dòng tự đồng bộ.

### DISC-02 — Giảm phần trăm (Cả hai)

**Bước:** Bấm nút `đ` đổi `%`; thử 0, 10, 100, >100, âm, thập phân.  
**Mong đợi:** Tối đa 100%; tổng chính xác/làm tròn nhất quán; hiển thị list/detail/export đúng tiền và %.

### DISC-03 — Giảm lớn hơn tiền hàng và tổng 0 (Cả hai)

**Bước:** Giảm cố định > subtotal hoặc 100%.  
**Mong đợi:** Tổng không âm. Xác minh khả năng lưu đơn 0 đồng và yêu cầu dòng thanh toán >0; nếu không thể lưu, thông báo phải rõ thay vì dead-end.

### DISC-04 — Coupon/nguồn đơn (Cả hai)

**Bước:** Nhập coupon và đổi nguồn đơn → lưu → mở detail/export.  
**Mong đợi:** Nếu UI cung cấp trường thì dữ liệu phải được lưu/hiển thị hoặc báo rõ chưa áp dụng; không được tạo cảm giác coupon đã giảm khi payload không dùng. Ghi bug nếu mất dữ liệu sau lưu.

## 11. Thanh toán và lưu mới

### PAY-01 — Một phương thức mặc định (Cả hai)

**Bước:** Thêm hàng → kiểm tra **Tiền mặt** và số tiền; đổi tổng/qty/discount.  
**Mong đợi:** Một dòng payment tự bằng tổng; tiền khách trả ít nhất bằng tổng; còn phải thanh toán 0.

### PAY-02 — Chia nhiều phương thức (Cả hai)

**Bước:** Bấm **Thêm phương thức** → chọn Chuyển khoản/Trả góp → chia sao cho tổng đúng.  
**Mong đợi:** Không trùng method; remaining 0; lưu và list/detail/export hiện từng khoản đúng.

### PAY-03 — Dùng hết phương thức (Cả hai)

**Bước:** Thêm đến đủ 3 method → thử thêm nữa.  
**Mong đợi:** Nút disabled hoặc báo đã dùng tất cả; inactive/ngoài whitelist không xuất hiện.

### PAY-04 — Xóa payment (Cả hai)

**Bước:** Có 2 dòng → xóa một; còn 1 dòng thử xóa.  
**Mong đợi:** Xóa đúng; dòng cuối không xóa được; remaining cập nhật.

### PAY-05 — Thiếu/thừa/0/âm/trùng (Cả hai)

**Bước:** Cho tổng payment thiếu 1.000, thừa 1.000, amount 0/âm, method rỗng; thử chọn method trùng bằng UI và request chỉnh sửa.  
**Mong đợi:** Nút lưu báo đúng thiếu/thừa; không ghi sale; backend cũng từ chối payload bất hợp lệ, không chỉ frontend.

### PAY-06 — Tiền khách trả và tiền thừa (Cả hai)

**Bước:** Tổng 400.000; nhập khách trả 500.000; sau đó 399.999 và nhỏ hơn paid.  
**Mong đợi:** Trả lại 100.000; trường hợp nhỏ hơn payment bị chặn; in hóa đơn hiển thị tiền khách trả/trả lại đúng.

### SAVE-01 — Happy path tối thiểu (Cả hai)

**Bước:** Kho A → khách mới → SP-A qty2 → Tiền mặt đủ → **Xác nhận & Lưu**.  
**Mong đợi:** Nút **Đang lưu...** chống double-click; sale draft được tạo rồi complete; thông báo mã; sau ~1,2 giây về list; status **Hoàn tất**; tồn A 20→18, B giữ 7; chỉ một hóa đơn/khách.

### SAVE-02 — Happy path đầy đủ (Cả hai)

**Bước:** Khách cũ đủ thông tin → 2 SP → sửa giá/qty → giảm % → 3 payment → tiền khách trả dư → note → lưu.  
**Mong đợi:** Mọi phép tính và dữ liệu list/detail/in/export/trang liên quan đúng; tồn từng dòng giảm đúng.

### SAVE-03 — Validation bắt buộc (Cả hai)

**Bước:** Lần lượt thiếu kho, tên khách, sản phẩm, payment → bấm **Lưu hóa đơn** và **Xác nhận & Lưu**.  
**Mong đợi:** Thông báo cụ thể; không request ghi hoặc không tạo dữ liệu; focus/scroll tới lỗi hợp lý.

### SAVE-04 — Double submit/F9/Enter (Cả hai)

**Bước:** Bấm nhanh cả nút trên và dưới; double click; Enter; nếu trang hỗ trợ F9 thì thử.  
**Mong đợi:** Chỉ một sale, một lần trừ tồn, một lần tạo/update khách.

### SAVE-05 — Lỗi tạo/cập nhật khách (Cả hai)

**Bước:** Chặn POST/PATCH customer → lưu.  
**Mong đợi:** Báo lỗi; không tạo sale/trừ tồn; nút trở lại dùng được.

### SAVE-06 — POST sale thành công nhưng complete thất bại (Cả hai)

**Bước:** Cho `POST /products/sales` thành công nhưng chặn `POST /products/sales/{id}/complete`.  
**Mong đợi nghiệp vụ:** Không được báo thành công; không trừ tồn; phải rollback/xóa draft hoặc hiển thị draft để xử lý an toàn, không tạo đơn mồ côi/khách cập nhật nửa chừng. Tìm mã sau **Làm mới** và ghi lỗi nếu còn draft ngoài ý muốn.

### SAVE-07 — Mất mạng/refresh giữa lưu (Cả hai)

**Bước:** Slow network → bấm lưu → ngắt mạng hoặc reload sau POST trước complete → bật lại.  
**Mong đợi:** Không nhân hóa đơn khi retry; có cách nhận biết/khôi phục trạng thái; tồn và sale nhất quán.

### SAVE-08 — Hai người bán cùng sản phẩm cuối (2 session)

**Bước:** Tồn A=1; hai trình duyệt cùng thêm qty1 → lưu gần đồng thời.  
**Mong đợi:** Chỉ một đơn complete; đơn kia 409/422 hết tồn; tồn không âm; không cả hai báo thành công.

### SAVE-09 — Backend validation/bypass frontend

**Bước:** Trong môi trường test gửi payload thiếu kho/khách/items, qty âm/vượt tồn, price âm, payment sai, product/kho không tồn tại.  
**Mong đợi:** 4xx và không ghi gì. Nếu API chấp nhận, báo lỗi integrity/bảo mật dù UI đã chặn.

## 12. In hóa đơn, quà tặng và Excel

### PRINT-01 — In từ menu và detail (Cả hai)

**Bước:** `...` → **In hóa đơn**; sau đó mã → **In hóa đơn**.  
**Mong đợi:** Mỗi lần một popup; title/profile cửa hàng, mã/ngày/khách, tất cả dòng, mã SP theo setting, tổng/giảm/đã trả/tiền khách/trả lại đúng; gọi print khi document sẵn sàng.

### PRINT-02 — Popup blocker/đóng sớm/API lỗi (Cả hai)

**Bước:** Chặn popup; cho phép rồi đóng popup lúc **Đang chuẩn bị...**; chặn detail/branch/store-setting.  
**Mong đợi:** Cảnh báo rõ; không popup trắng treo; không crash/list vẫn dùng được; fallback profile hợp lý.

### PRINT-03 — Hóa đơn quà tặng (Cả hai)

**Bước:** Với invoice không quà kiểm tra action disabled/tooltip; với invoice có quà bấm **In hóa đơn quà tặng**.  
**Mong đợi:** Chỉ dòng quà; ẩn giá/tổng; không quà không mở print và báo đúng nếu bị gọi cưỡng bức.

### PRINT-04 — Ký tự đặc biệt/dòng dài (Cả hai)

**Bước:** In fixture tên/địa chỉ/note dài và ký tự HTML.  
**Mong đợi:** Escape HTML, không chạy script; giấy không cắt chữ quan trọng/tràn ngang.

### EXPORT-01 — Mở/đóng và validation modal (Cả hai)

**Bước:** **Xuất dữ liệu** → đóng `X/Hủy`; mở lại → bỏ tất cả cột; tên file/sheet trống, ký tự cấm, rất dài.  
**Mong đợi:** Modal xử lý validation; đóng không tải file; không crash.

### EXPORT-02 — Trang hiện tại (Cả hai)

**Bước:** Có filter → **Xuất dữ liệu** → chọn **Trang hiện tại**, đổi nhãn/cột → xuất.  
**Mong đợi:** File `.xlsx`, tối đa 15 dòng đúng trang/filter; đúng thứ tự/nhãn; ngày/mã/khách/SP/SL/gross/giảm/%/tổng/payment/status đúng.

### EXPORT-03 — Tất cả kết quả (Cả hai)

**Bước:** Filter có >100 dòng nếu có → chọn **Tất cả** → xuất.  
**Mong đợi:** Đủ mọi trang, không trùng/mất; giữ filter channel=store/type=retail; không lẫn wholesale; tên sheet hợp lệ.

### EXPORT-04 — Empty và lỗi mạng (Cả hai)

**Bước:** Lọc empty → export; chặn một request page khi export all.  
**Mong đợi:** Báo **Không có dữ liệu để xuất** hoặc **Xuất Excel thất bại**; modal/nút hết loading; không tạo file sai một phần.

## 13. Sửa hóa đơn

### EDIT-01 — Quyền và điều kiện mở (ADMIN)

**Bước:** Completed chưa refund → `...` → **Sửa đơn hàng**.  
**Mong đợi:** URL có `editId`; kho, salesperson, nguồn, coupon bị khóa theo UI; dữ liệu khách/hàng/payment/discount/note được nạp đúng; tồn hiển thị cho phép tối đa `tồn hiện tại + qty gốc`.

### EDIT-02 — Không cho sửa trạng thái không hợp lệ (ADMIN)

**Bước:** Mở menu/URL edit của draft, cancelled, partial, full.  
**Mong đợi:** Action disabled hoặc trang báo lý do; nút lưu disabled; gọi PATCH trực tiếp cũng phải bị backend từ chối.

### EDIT-03 — Chỉ sửa metadata không đổi hàng (ADMIN)

**Bước:** Đổi note/thông tin khách/giảm giá/payment → **Lưu hóa đơn**.  
**Mong đợi:** Vẫn cùng ID/code/createdAt/status completed; không tạo đơn mới; tồn không đổi; doanh thu/payment/customer cập nhật đúng theo nghiệp vụ.

### EDIT-04 — Tăng số lượng (ADMIN)

**Bước:** Sale gốc qty2, tồn sau bán 18 → sửa qty3 → lưu.  
**Mong đợi:** Tồn A 18→17 (chỉ giảm chênh 1), không giảm lại 3; list/detail/report đổi qty/tiền đúng.

### EDIT-05 — Giảm số lượng (ADMIN)

**Bước:** Sale qty3 → sửa qty1 → lưu.  
**Mong đợi:** Tồn tăng 2; không hoàn cả 3; báo cáo/customer đúng giá trị mới.

### EDIT-06 — Thay/xóa/thêm sản phẩm (ADMIN)

**Bước:** Bỏ SP-A qty2, thêm SP-B qty1 → lưu.  
**Mong đợi:** SP-A được hoàn 2; SP-B giảm 1; không tác động kho B/sản phẩm khác.

### EDIT-07 — Thay giá/discount/payment (ADMIN)

**Bước:** Không đổi qty, thay giá và giảm; cân payment → lưu.  
**Mong đợi:** Tồn không đổi; tổng/doanh thu/đã thu/in/export cập nhật; không giữ aggregate cũ.

### EDIT-08 — Lỗi PATCH và concurrency (ADMIN)

**Bước:** Chặn PATCH; hai admin mở cùng invoice, A lưu trước, B lưu sau.  
**Mong đợi:** Lỗi không làm đổi tồn/khách; concurrency phải có version/conflict hoặc quy tắc rõ, không silent overwrite gây sai tồn.

### EDIT-09 — Refund phát sinh trong lúc đang edit (ADMIN + session 2)

**Bước:** A mở edit; B tạo trả một phần; A bấm lưu.  
**Mong đợi:** Backend chặn edit vì đã có refund; không phá liên kết/returned quantity/tồn.

### EDIT-10 — EMPLOYEE bypass

**Bước:** EMPLOYEE xác nhận không thấy nút; trong test gọi PATCH invoice.  
**Mong đợi:** 403, dữ liệu/tồn không đổi. Nếu 200, Critical.

## 14. Hủy và xóa

### CANCEL-01 — Hủy dialog (ADMIN)

**Bước:** Completed chưa refund → `...` → **Xóa hóa đơn** → đọc dialog → bấm Cancel.  
**Mong đợi:** Hiện mã/tổng/số dòng/ảnh hưởng tồn/cảnh báo; Cancel không request, trạng thái/tồn giữ nguyên.

### CANCEL-02 — Hủy hóa đơn completed (ADMIN)

**Bước:** Ghi tồn → xác nhận dialog.  
**Mong đợi:** Nút **Đang xử lý...**; status **Đã hủy**; tồn từng dòng hoàn đúng một lần; invoice vẫn còn để audit; không tính doanh thu/đơn bán; không tạo phiếu trả hàng.

### CANCEL-03 — Xóa draft (ADMIN)

**Bước:** Draft fixture → **Xóa hóa đơn** → OK.  
**Mong đợi:** Record biến mất; tồn không đổi vì draft chưa trừ; tổng giảm 1.

### CANCEL-04 — Xóa cancelled (ADMIN)

**Bước:** Hóa đơn đã hủy và chưa refund → xóa → OK.  
**Mong đợi:** Record biến mất; tồn không tăng lần hai; report vẫn không tính.

### CANCEL-05 — Partial/full refund (ADMIN)

**Bước:** Mở menu hóa đơn partial và full.  
**Mong đợi:** Xóa/hủy disabled đúng tooltip; API direct cũng từ chối để không orphan refund.

### CANCEL-06 — Double click/retry và lỗi mạng (ADMIN)

**Bước:** Xác nhận nhanh hai lần; timeout sau server success rồi retry; chặn cancel.  
**Mong đợi:** Chỉ hoàn tồn một lần; retry idempotent hoặc báo trạng thái hiện tại; lỗi không đóng detail sai/không báo thành công giả.

### CANCEL-07 — Hủy sau khi đã sửa qty (ADMIN)

**Bước:** Tạo qty2 → sửa qty3 thành công → hủy.  
**Mong đợi:** Tồn cuối bằng tồn đầu; không thiếu/thừa do edit/cancel dùng payload khác nhau.

### CANCEL-08 — EMPLOYEE bypass

**Bước:** EMPLOYEE gọi DELETE và POST cancel trong môi trường test.  
**Mong đợi:** 403; record/tồn/report không đổi. Nếu ghi thành công, Critical.

## 15. Đổi trả và đổi hàng

### RETURN-01 — Điều hướng và prefill (Cả hai)

**Bước:** Completed còn hàng → `...` hoặc Detail → **Đổi trả hàng**.  
**Mong đợi:** URL `/refund/create?saleId=...`; kho hóa đơn gốc, khách, invoice/order gốc và các dòng có `maxQty` đúng số còn trả được; không chọn kho khác.

### RETURN-02 — Guard trạng thái (Cả hai)

**Bước:** Thử draft/cancelled/full; mở URL trực tiếp.  
**Mong đợi:** Hiện lý do; nút **Lưu hóa đơn/F9** disabled; backend 422 nếu bypass.

### RETURN-03 — Trả một phần một sản phẩm (Cả hai)

**Bước:** Chọn tab SP thường/quà phù hợp → tìm/scan SP từ đơn → qty1 → không mua mới → nhập lý do/payment hoàn → bấm **Lưu hóa đơn** hoặc F9.  
**Mong đợi:** Phiếu TH completed; sale gốc vẫn completed nhưng badge **Đã hoàn một phần**; remaining giảm 1; tồn hàng trả +1; refund list/detail và báo cáo hoàn tiền đúng.

### RETURN-04 — Trả toàn bộ (Cả hai)

**Bước:** Trả toàn bộ số còn lại của mọi dòng → lưu.  
**Mong đợi:** Sale badge **Đã hoàn**; remaining=0; action đổi trả/sửa/xóa disabled; tồn được hoàn đủ; không được trả thêm.

### RETURN-05 — Nhiều lần trả một phần (Cả hai)

**Bước:** Sale qty3 → trả 1 → quay retail → trả 1 → trả 1.  
**Mong đợi:** Mỗi lần max/remaining đúng; tổng returned không >3; badge partial rồi full; ba phiếu liên kết đúng; tồn tăng tổng 3 đúng một lần mỗi phiếu.

### RETURN-06 — Không có sản phẩm trả/qty 0/vượt max (Cả hai)

**Bước:** Bỏ hết dòng; nhập qty0/âm/vượt số còn trả; scan lặp.  
**Mong đợi:** Bị chặn; thông báo cụ thể; backend cũng validate cumulative quantity, không tạo phiếu/tăng tồn.

### RETURN-07 — Hoàn tiền thuần (Cả hai)

**Bước:** Hàng trả giá trị 200.000, không hàng mua mới; chọn các payment hoàn tổng đúng → lưu.  
**Mong đợi:** `amountDelta > 0`, tiền trả khách 200.000; refundPayments đúng; doanh thu thuần giảm 200.000; replacement sale không được tạo.

### RETURN-08 — Đổi ngang giá (Cả hai)

**Bước:** Trả SP-A 100.000 → thêm hàng mua mới 100.000 → tổng chênh 0 → lưu.  
**Mong đợi:** SP trả +1, SP mới -1; có refund và replacement sale liên kết; không thu/hoàn tiền; revenue/net không bị tính đúp.

### RETURN-09 — Đổi sang hàng đắt hơn (Cả hai)

**Bước:** Trả 100.000 → mua mới 250.000 → thanh toán thêm 150.000 bằng một/nhiều method → lưu.  
**Mong đợi:** `amountDelta < 0`; salePayments/settlement 150.000; replacement sale completed xuất hiện đúng kênh/type; tồn +1/-1; doanh thu và hoàn tiền phản ánh đúng, không cộng cả 250.000 sai quy ước.

### RETURN-10 — Đổi sang hàng rẻ hơn (Cả hai)

**Bước:** Trả 250.000 → mua mới 100.000 → hoàn 150.000 → lưu.  
**Mong đợi:** refundPayments 150.000; tồn đúng; replacement sale có hàng mới; báo cáo net đúng chênh lệch.

### RETURN-11 — Giảm giá gốc được phân bổ (Cả hai)

**Bước:** Sale nhiều dòng có giảm tiền và sale có giảm %; lần lượt trả một phần/toàn phần.  
**Mong đợi:** Giá trị hoàn phân bổ theo discount gốc, không hoàn theo gross; tổng nhiều lần trả không vượt số khách đã trả; không sai làm tròn.

### RETURN-12 — Giảm giá hàng mua mới độc lập (Cả hai)

**Bước:** Thêm hàng đổi → nhập giảm cố định/% phía mua mới, coupon, auto-discount/point nếu có.  
**Mong đợi:** Chỉ ảnh hưởng hàng mua mới; không làm thay đổi phân bổ discount sale gốc; tổng/payment đúng.

### RETURN-13 — Kho và tồn hàng đổi (Cả hai)

**Bước:** Tìm SP chỉ còn ở Kho B trong phiếu của Kho A; thử qty bằng tồn, vượt tồn, concurrency hai phiếu.  
**Mong đợi:** Chỉ dùng tồn Kho A; không âm; transaction toàn bộ rollback nếu hàng đổi thiếu.

### RETURN-14 — Customer read-only và tìm F4 (Cả hai)

**Bước:** Nhấn F4 → tìm SĐT; thử sửa các trường read-only; bấm **Tìm**.  
**Mong đợi:** Khách sale gốc được giữ/liên kết; không đổi khách tùy tiện; dropdown đúng, không ghi đè khách khác.

### RETURN-15 — Scanner/F3/dropdown/Escape (Cả hai)

**Bước:** F3 → scan hàng trả; scan hàng mua mới; click ngoài/Escape; barcode lạ/trùng.  
**Mong đợi:** Focus đúng; chỉ thêm đúng nhóm; dropdown đóng; không vượt max/tồn.

### RETURN-16 — In tự động (Cả hai)

**Bước:** Tick **Tự động in** → lưu với popup cho phép; lặp khi popup bị chặn.  
**Mong đợi:** Thành công in phiếu đúng chênh lệch. Popup bị chặn phải báo trước/rõ; không tạo lặp phiếu khi người dùng thử lại.

### RETURN-17 — Atomicity khi lỗi (Cả hai)

**Bước:** Gây lỗi lúc tạo refund hoặc replacement sale/stock trong môi trường test.  
**Mong đợi:** Toàn transaction rollback: không tăng hàng trả nếu không giảm hàng đổi, không phiếu mồ côi, sale gốc không tăng activeRefundCount, không report nửa chừng.

### RETURN-18 — Double submit và hai phiên trả cùng lượng cuối (Cả hai)

**Bước:** Double click/F9; hai browser cùng trả qty cuối.  
**Mong đợi:** Chỉ một phiếu cho lượng đó; tồn tăng một lần; request còn lại 409/422; remaining không âm.

### RETURN-19 — Danh sách trả hàng (Cả hai)

**Bước:** Sau lưu vào `/sales-channels/store/refund` → tìm mã trả/hóa đơn gốc/tên/SĐT → lọc status → mở mã → `...` → **Xem chi tiết**, **In** → export current/all → phân trang.  
**Mong đợi:** Đúng mã gốc, khách, SL, tiền trả, status completed, channel store; menu đóng click ngoài/Escape/scroll; in/export đúng.

## 16. Kiểm tra chéo các trang liên quan

### X-INV-01 — Tồn sau bán

**Bước:** Trước bán ghi tồn ở `/products/inventory` và `/products`; bán qty Q tại A → hard reload hai trang → tìm SP.  
**Mong đợi:** Tồn A giảm Q, B không đổi; tổng tồn sản phẩm giảm Q; khả dụng không âm.

### X-INV-02 — Tồn sau sửa/hủy/trả/đổi

**Bước:** Thực hiện lần lượt EDIT-04/05/06, CANCEL-02, RETURN-03/08/09 rồi đối soát từng kho/SP.  
**Mong đợi:** Đúng invariant mục 1; không tạo movement ở kho khác. Nếu trang giao dịch kho không ghi sale movement theo thiết kế hiện tại, không được tự xuất hiện phiếu nhập/xuất giả; nếu nghiệp vụ yêu cầu audit movement thì ghi gap.

### X-CUST-01 — Danh sách và chi tiết khách

**Bước:** `/customers/list` → tìm khách vừa mua → mở `/customers/list/{id}`.  
**Mong đợi:** Thông tin được tạo/cập nhật đúng; lịch sử/đơn mua/return count liên kết đúng; không có khách trùng.

### X-CUST-02 — Chỉ số khách hàng sau bán/trả/hủy

**Bước:** Ghi `Tổng tiền`, `Lần mua`, `SL sản phẩm`, `Ngày mua gần nhất`, điểm trước/sau; thử nút đồng bộ nếu có.  
**Mong đợi nghiệp vụ:** Completed làm tăng; edit điều chỉnh; cancel loại; refund điều chỉnh return/net theo quy tắc. **Lưu ý cần ghi nhận:** source UI hiện chú thích endpoint sync metrics là stub; nếu chỉ số không đổi, báo limitation/bug tích hợp, không coi toast là đã đồng bộ.

### X-REF-01 — Trang Trả hàng và sale gốc

**Bước:** Sau partial/full, tìm phiếu ở `/sales-channels/store/refund`; quay retail tìm sale gốc.  
**Mong đợi:** Liên kết hai chiều đúng; tổng returned/remaining/status đúng; replacement sale (nếu có) không bị lẫn thành sale gốc nhưng xuất hiện hợp lệ.

### X-DASH-01 — Dashboard sau bán

**Bước:** Ghi KPI trước → bán completed → reload `/` và chọn đúng ngày/kho nếu có filter.  
**Mong đợi:** Số đơn/doanh thu/sản phẩm/top SP/biểu đồ tăng đúng; draft/cancel không được tính.

### X-DASH-02 — Dashboard sau edit/cancel/refund

**Bước:** Edit giá/qty → reload; cancel → reload; refund → reload.  
**Mong đợi:** Edit thay aggregate; cancel loại sale; refund làm giảm net/hiện hoàn theo định nghĩa; không cache số cũ.

### X-RPT-TIME-01 — Doanh thu theo thời gian

**Bước:** `/reports/revenue/time` → chọn khoảng chứa test, ngày, channel retail/store, status completed, compare none → áp dụng; mở detail bucket.  
**Mong đợi:** invoiceCount, gross, discount, revenue, paid/itemQuantity đúng; refundAmount đúng ngày phiếu trả; net=`revenue-refund`; cancel/draft loại.

### X-RPT-STORE-01 — Doanh thu theo cửa hàng

**Bước:** `/reports/revenue/store` → chọn Kho A rồi B, đúng ngày/status/channel.  
**Mong đợi:** Sale/refund chỉ thuộc A; B không đổi; invoiceCount/revenue/refund/net/AOV đúng; exchange không double count.

### X-RPT-STAFF-01 — Doanh thu theo nhân viên và thống kê nhân viên

**Bước:** `/reports/revenue/staff` → chọn nhân viên/date; sau đó `/staff` → mở stats/activity của người bán nếu UI có.  
**Mong đợi:** Sale gắn đúng salesperson/author; số đơn/revenue/paid/refund count/activity đúng; edit không chuyển sai người; cancel loại.

### X-RPT-PROD-01 — Doanh thu theo sản phẩm

**Bước:** `/reports/revenue/products` → lọc mã SP/ngày/kho/channel.  
**Mong đợi:** SL bán, số HĐ, revenue/discount/refund/net đúng theo dòng; hàng trả trừ đúng SP; hàng đổi mới cộng đúng SP; SP không liên quan không đổi.

### X-RPT-PLACEHOLDER-01 — Trang báo cáo chưa triển khai

**Bước:** Mở `/reports/revenue/customers`, `/reports/sales/overview`, `/reports/sales/shift-closing`, `/reports/products/performance`.  
**Mong đợi:** Nếu chỉ là placeholder theo source hiện tại, ghi rõ **chưa thể đối soát nghiệp vụ**, không đánh PASS cho đồng bộ doanh thu chỉ vì route mở.

### X-STORAGE-01 — Tuổi tồn/bán chậm

**Bước:** Mở `/products/storage-duration` tìm SP trước/sau bán, hủy.  
**Mong đợi:** Completed có thể cập nhật lần bán gần nhất; cancelled không được dùng làm lần bán cuối; hủy phải khôi phục cách tính theo giao dịch completed còn hiệu lực.

### X-CHANNEL-01 — Cách ly retail/wholesale/channel

**Bước:** Tạo retail store → kiểm tra retail list; mở wholesale/refund/report filter/channel khác.  
**Mong đợi:** Sale gốc chỉ nằm retail store; không lẫn wholesale/channel khác; refund nằm refund và được link vào report retail; replacement giữ `type=retail`, `channel=store`.

## 17. Permission, API, resilience và toàn vẹn dữ liệu

### SEC-01 — IDOR đọc hóa đơn

**Bước:** EMPLOYEE ở kho A thử mở detail ID hóa đơn kho B bằng URL/API trong môi trường test.  
**Mong đợi:** Theo phạm vi được phân công phải 403/404; không lộ khách/payment nếu không có quyền. Nếu hệ thống chủ đích cho toàn công ty xem, cần xác nhận nghiệp vụ.

### SEC-02 — IDOR ghi và giả branch/customer/product

**Bước:** Thay ID trong PATCH/cancel/return, branchId khác kho phụ trách, customerId/productId khác.  
**Mong đợi:** Backend xác thực quyền và quan hệ; không chỉ tin payload frontend.

### SEC-03 — Auth request trực tiếp

**Bước:** Không token/token sai gọi GET/POST/PATCH/DELETE/action.  
**Mong đợi:** 401; không dữ liệu/không ghi. Nếu API local cho phép không auth, báo Critical trước triển khai production.

### DATA-01 — Idempotency action complete/cancel/return

**Bước:** Trong test gọi complete hai lần, cancel hai lần, resend cùng return.  
**Mong đợi:** Tồn chỉ đổi một lần; action terminal sau bị từ chối/idempotent; không duplicate refund/replacement.

### DATA-02 — Không tồn âm và không clamp che lỗi

**Bước:** Payload bán/đổi vượt tồn.  
**Mong đợi:** Transaction 4xx và rollback; không được âm, đồng thời cũng không được `max(0, ...)` rồi vẫn complete sale với số lượng lớn hơn thực có.

### DATA-03 — Referential integrity

**Bước:** Xóa/ngừng hoạt động fixture product/customer/branch sau khi tạo sale → mở list/detail/in/report/refund.  
**Mong đợi:** Lịch sử vẫn đọc được snapshot/fallback, không crash; không cho thao tác mới vào entity inactive; mã/tổng không mất.

### DATA-04 — Refresh/cache/race response

**Bước:** Lọc A rồi rất nhanh B trên mạng chậm; đổi page liên tục; mở detail nhiều dòng.  
**Mong đợi:** Response cũ không ghi đè state mới; đúng invoice/page/filter cuối; request hủy không hiện lỗi giả.

### DATA-05 — Giá trị lớn, làm tròn, timezone

**Bước:** Dùng qty/price/discount/payment lớn nhưng hợp lệ, số lẻ, sale gần nửa đêm.  
**Mong đợi:** Không overflow/sai dấu; list/detail/print/export/report dùng cùng phép tính; ngày không lệch.

## 18. UI states cần chạy lại cho mọi nhóm chính

Cho danh sách, create, detail, branch modal, action menu, export modal và refund form, kiểm tra:

1. Default, hover, focus keyboard, active/open.
2. Disabled đúng lý do; loading chống bấm lặp.
3. Empty/error/retry.
4. Click outside và Escape nơi component hỗ trợ.
5. Text dài, tiền lớn, ký tự đặc biệt, zoom 80/100/125/200%.
6. Desktop/tablet/mobile; không body overflow, popup không bị cắt.
7. Refresh/Back/Forward; không mất route hoặc tự ghi dữ liệu.
8. Console không có error; Network không request lặp vô hạn/5xx âm thầm.

## 19. Thứ tự regression khuyến nghị

1. NAV + LIST/FILTER/PAGE/MENU/DETAIL.
2. CREATE tối thiểu → đối soát tồn/khách/dashboard/4 reports.
3. CREATE đầy đủ multi-product/discount/multi-payment → PRINT/EXPORT.
4. EDIT tăng/giảm/thay SP → đối soát tồn và reports.
5. CANCEL completed → đối soát tồn/customer/dashboard/reports.
6. RETURN partial → RETURN lần hai → full → refund list/reports.
7. EXCHANGE ngang/rẻ hơn/đắt hơn → đối soát cả returned và replacement.
8. Permission EMPLOYEE + direct API.
9. Failure/atomicity/concurrency/idempotency.
10. Responsive/accessibility và final hard reload toàn bộ trang liên quan.

## 20. Tiêu chí kết luận

- **PASS một ca ghi** chỉ khi UI chính, record chi tiết, tồn kho và mọi trang liên quan đều khớp; toast thành công đơn lẻ không đủ.
- Báo **Critical** nếu: bán vượt tồn/tồn âm; trừ/hoàn tồn hai lần; edit không điều chỉnh tồn; cancel/refund sai tồn; duplicate do double-submit; EMPLOYEE gọi API admin thành công; trả vượt số đã mua; transaction đổi trả ghi nửa chừng; báo cáo/customer nhầm khách/kho/kênh.
- Báo **High** nếu: tổng/discount/payment/report sai; sale/refund lẫn channel; orphan draft sau lỗi complete; in sai tiền; export thiếu/trùng dữ liệu.
- Báo **Medium/Low** cho lỗi filter/pagination/loading/responsive/accessibility không làm sai dữ liệu, tùy mức ảnh hưởng.
- Kết thúc vòng test phải liệt kê toàn bộ fixture đã tạo và dọn **chỉ fixture của vòng test** theo quy trình an toàn của môi trường; không xóa hàng loạt dữ liệu không có marker.
