# BÁO CÁO KIỂM THỬ E2E — Trang Bán lẻ

**Run ID:** `E2E_RETAIL_1783781632484_6s3gkn`  
**Verdict:** `BLOCKED_WRITE_FLOWS_NOT_ISOLATED`  
**Công cụ:** Playwright Chromium 1.51.0 (headless)  
**URL:** `http://localhost:5173/sales-channels/store/retail`  
**Thời gian:** 2026-07-11T14:53:52Z → 2026-07-11T14:58:44Z  

---

## 1. Metadata lần chạy

| Hạng mục | Giá trị |
|---|---|
| Thời gian bắt đầu | 2026-07-11T14:53:52.484Z |
| Thời gian kết thúc | 2026-07-11T14:58:44.695Z |
| Run ID | E2E_RETAIL_1783781632484_6s3gkn |
| URL | http://localhost:5173/sales-channels/store/retail |
| Frontend | Vite dev :5173 (HTTP 200) |
| Backend | Laravel :8000 (HTTP 200) |
| Trình duyệt | Chromium (Playwright 1.51.0) |
| Viewport chính | 1440×900 |
| Viewport mobile | 390×844 |
| Role đã kiểm tra | ADMIN (DB chỉ có 1 user ACTIVE role=ADMIN) |
| Môi trường dữ liệu | MySQL `ladystars_php` @ 127.0.0.1, APP_ENV=local |
| Mức độ cô lập | **KHÔNG cô lập** — DB operational-scale |
| Có chạy luồng ghi? | **Không** |

### Bằng chứng không cô lập (không in secret)

| Chỉ số | Giá trị |
|---|---|
| DB_DATABASE | ladystars_php (không phải tên test/e2e/sandbox) |
| sale_payments | ~2108 (completed 2106, draft 2) |
| customers | ~1610 |
| products | ~2087 |
| product_branch_stocks | ~4155 |
| .env.live-test.local | Không có |
| live:* scripts trong package.json | Không có |

---

## 2. Baseline và worktree

- `git status --short`: có **nhiều file modified/untracked có sẵn trước task** (warehouse/customer/product backend tests, v.v.)
- File do agent tạo (chỉ artifact kiểm thử, **không sửa source app**):
  - `e2e-artifacts/retail-audit/run-retail-audit.cjs`
  - `e2e-artifacts/retail-audit/diag.cjs`
  - `e2e-artifacts/retail-audit/results.json`
  - `e2e-artifacts/retail-audit/screenshots/*`
  - `e2e-artifacts/retail-audit/downloads/hoa-don-ban-le-2026-07-11.xlsx`
  - `e2e-artifacts/retail-audit/BAO-CAO-E2E-BAN-LE.md`
- Xác nhận **không sửa source** nghiệp vụ
- Xác nhận **không cài dependency**
- Xác nhận **không git add/commit/push/reset**

---

## 3. Phạm vi đã rà soát (source inventory)

### Route
- `/sales-channels/store/retail` → `SalesChannelSubPage` → `RetailInvoicePage`
- `/sales-channels/store/retail/create` → `RetailInvoiceCreatePage`
- Legacy redirect: `.../confirm`, `.../payment-confirmation`, `.../payment-confirm` → parent
- Menu: AppLayout group **Kênh bán - Cửa hàng** → **Bán lẻ**

### Component chính
- `RetailInvoicePage.tsx`, `RetailInvoiceCreatePage.tsx`
- `invoiceHelpers.ts`, `invoicePrint.ts`, `retail-invoice-page.css`
- `ExportExcelModal.tsx`

### API liên quan
| API | Method | Mục đích |
|---|---|---|
| `/auth/me` | GET | Role / canManageSales |
| `/products/sales` | GET | List + filter + export |
| `/products/sales/{id}` | GET | Detail / print |
| `/products/sales` | POST | Tạo HĐ (**blocked**) |
| `/products/sales/{id}` | PATCH/DELETE | Sửa/xóa (**blocked**) |
| `/products/sales/{id}/cancel` | POST | Hủy + hoàn tồn (**blocked**) |
| `/products/sales/{id}/return-exchange` | POST | Đổi trả (**blocked**) |
| `/system/branches` | GET | Filter + chọn kho |
| `/products/inventories` | GET | SP theo kho |
| `/products/payment-methods/standard` | GET | **404 — thiếu route** |
| `/customers/customers` | GET/POST/PATCH | Khách |
| `/staff` | GET | NV bán |

### Control UI (list)
- Filter: mã HĐ, cửa hàng, từ/đến ngày, khách, SP, Lọc, Làm mới
- Actions: Thêm hóa đơn, Xuất dữ liệu
- KPI: Tổng HĐ, Đang hiển thị, Tổng tiền trang, Đã thu trang, Đã chọn, Đang lọc
- Table 12 cột + checkbox + row menu portal
- Menu: Xem / In / In quà tặng / Đổi trả / (admin) Sửa / Xóa
- Modal: chi tiết, chọn kho, export Excel
- Pagination 15/page

### Invariant nghiệp vụ (từ source)
- Admin mới được xóa/hủy/sửa
- Completed + cancel → hoàn tồn
- Edit chỉ khi completed, chưa refund
- Refund chỉ completed còn SL trả
- Payment methods allowed: cash, bank_transfer, installment
- Save path: upsert customer → post/patch sale → complete

---

## 4. Tổng hợp kết quả

| Metric | Giá trị |
|---|---|
| Tổng test case ghi nhận | 70 |
| PASS | 49 |
| FAIL | 8 |
| BLOCKED | 11 |
| SKIPPED | 0 |
| NOT_RUN | 2 |
| Tỷ lệ PASS / (PASS+FAIL) đã chạy | 49/57 ≈ **86%** |
| Tỷ lệ PASS / tổng | 49/70 ≈ **70%** |

> Một số FAIL là false-positive harness hoặc flaky; phần “Danh sách lỗi” đã phân loại lại theo bằng chứng.

---

## 5. Kết quả theo nhóm

| Nhóm | Kết quả |
|---|---|
| A — Smoke | 6 PASS, 1 FAIL (false-positive 404 text) |
| B — Giao diện | 1 PASS, 2 FAIL (chủ yếu harness label uppercase / mojibake giả) |
| C — Filter | **10/10 PASS** |
| D — Bảng | **2/2 PASS** |
| E — Selection/pagination | **4/4 PASS** |
| F — Menu | 2 PASS; Escape không xác nhận được (timeout reopen) |
| G — Chi tiết | **2/2 PASS** |
| H — In | 1 PASS (gift state); 1 FAIL (popup stuck preparing) |
| I — Excel | **2/2 PASS** (file 24KB) |
| J — Chọn cửa hàng | **3/3 PASS** |
| K — Form tạo | Load PASS; hiện lỗi payment-methods 404; validation/save BLOCKED |
| L — Khách hàng | Search GET PASS; create/update BLOCKED |
| M — SP/tồn | Search UI PASS; trừ tồn BLOCKED |
| N — Chiết khấu | BLOCKED (write isolation) |
| O — Thanh toán | BLOCKED (+ API method 404) |
| P — Lưu | BLOCKED |
| Q — Sửa | BLOCKED |
| R — Hủy/xóa | UI state thấy được; execute BLOCKED |
| S — Đổi trả | Navigate form PASS; confirm BLOCKED |
| T — Phân quyền | Admin actions flaky; non-admin BLOCKED (không có user) |
| U — Error/network | **2/2 PASS** |
| V — Responsive/a11y | Desktop OK; **mobile overflow FAIL** |
| W — Regression | Sanity total PASS; post-write invariant BLOCKED |

---

## 6. Danh sách lỗi (đã triage)

### CRITICAL
*(không có crash chặn đăng nhập / chặn tải list)*

### HIGH

1. **API payment methods 404 chặn form bán lẻ**  
   - **ID:** TC-K01/K02 / network  
   - **Hiện tượng:** `GET /api/products/payment-methods/standard` → **404**  
   - **Message UI:** `The route api/products/payment-methods/standard could not be found.`  
   - **Ảnh hưởng:** Form tạo HĐ không load được PTTT → không thể thanh toán/lưu đúng nghiệp vụ  
   - **Evidence:** console 404; `results.json` network.status4xx; screenshot `K01-create-form.png`  
   - **Source:** frontend gọi endpoint; `backend/routes/api.php` **không có route** tương ứng (chỉ mirror map `payment-methods` trong model)

2. **In hóa đơn — popup kẹt trạng thái chuẩn bị**  
   - **ID:** TC-H01  
   - **Hiện tượng:** Popup `about:blank` chỉ còn HTML “Dang chuan bi in/hoa don…”, không render nội dung HĐ  
   - **Evidence:** `screenshots/H01-print-popup.png`, diag print head len=131  
   - **Ghi chú:** Có thể trầm trọng hơn trên headless; cần reproduce có head + network detail API. Vẫn ghi nhận FAIL vì luồng in không hoàn tất trong automation.

### MEDIUM

3. **Mobile 390×844 horizontal overflow**  
   - **ID:** TC-V03  
   - **Hiện tượng:** `scrollWidth=457 > clientWidth=390`  
   - **Offenders:** `.retail-filter-actions` (width~405), table rộng (scroll ngang table có thể chấp nhận; overflow toolbar là vấn đề)  
   - **Evidence:** `V03-mobile.png`, diag-mobile

4. **Admin menu Sửa/Xóa không ổn định (flaky)**  
   - **ID:** TC-T01 (FAIL) vs TC-F01 (PASS cùng run)  
   - **Hiện tượng:** Cùng role ADMIN, lúc có đủ 6 item (gồm Sửa/Xóa), lúc chỉ 4 item  
   - **Giả thuyết:** race `currentUser` từ `/auth/me` (`canManageSales`)  
   - **Evidence:** results actual F01 vs T01

5. **KPI “Tổng tiền trang” = 0₫ trong khi “Đã thu trang” > 0**  
   - **ID:** quan sát TC-B01  
   - **Actual:** money=`0 ₫`, paid=`70.208.200 ₫`, total=2108  
   - **Giả thuyết:** list payload thiếu `items` → `grossValue`/`value` page sum lệch; hoặc mapping field  
   - **Cần xác minh thêm** mapping list API

### LOW / INFO (false positive harness)

6. **TC-A03 FAIL** — `getByText(/404/)` dính text không phải trang 404; URL và page OK → **không coi bug app**  
7. **TC-B01/B03 FAIL** — label KPI render uppercase CSS (`TỔNG HÓA ĐƠN`) khiến assert `includes('Tổng hóa đơn')` fail; mojibake strict check sau đó **âm tính** → **không phải lỗi encoding thật**  
8. **TC-F03 NOT_RUN / F01 duplicate FAIL** — harness: reopen menu sau Escape timeout  
9. **TC-R00 FAIL lần 2** — harness selector sau khi đã PASS state

---

## 7. Luồng nghiệp vụ đã xác minh

| Luồng | Trạng thái |
|---|---|
| Truy cập / smoke / redirect legacy | Đã xác minh (PASS) |
| Filter / search / reset | Đã xác minh (PASS) |
| Bảng / chọn dòng / phân trang | Đã xác minh (PASS) |
| Modal chi tiết | Đã xác minh (PASS) |
| Xuất Excel (client-side) | Đã xác minh (PASS, file tải được) |
| Chọn kho → form tạo | Đã xác minh navigate (PASS) |
| Form tạo load | Load được nhưng **lỗi PTTT 404** |
| In HĐ | **FAIL** (popup không hoàn tất) |
| Tạo HĐ / thanh toán / chiết khấu / tồn | **BLOCKED** (isolation) |
| Sửa HĐ | **BLOCKED** |
| Hủy/xóa + hoàn tồn | Chỉ audit UI; **không execute** |
| Đổi trả confirm | Navigate form OK; **không confirm** |
| Non-admin permission | **BLOCKED** (không có user) |

---

## 8. Network và console

| Loại | Kết quả |
|---|---|
| 5xx | Không ghi nhận |
| 4xx | **404** ×2 `GET /api/products/payment-methods/standard` |
| Timeout | Không (trừ selector harness) |
| Console error | 404 payment-methods; ERR_FAILED khi test abort network (cố ý TC-U01) |
| Page error (uncaught) | Không |
| Lỗi app | payment-methods 404; print incomplete; mobile overflow |
| Lỗi môi trường | DB không cô lập → chặn write |

---

## 9. Responsive và accessibility

| Hạng mục | Kết quả |
|---|---|
| Desktop 1440 | PASS — không overflow |
| Desktop hẹp 1024 | PASS |
| Mobile 390 | **FAIL** overflow ~67px |
| Keyboard focus input | PASS |
| Tab move focus | PASS |
| Modal/dropdown | Branch modal, detail modal, export modal, row menu click-outside OK |
| Escape row menu | Chưa xác nhận ổn định |

---

## 10. Dữ liệu test

| Hạng mục | Giá trị |
|---|---|
| Run ID | E2E_RETAIL_1783781632484_6s3gkn |
| Fixture tạo | **Không** (write blocked) |
| Invoice/Customer/Product IDs ghi | Không |
| Tồn kho baseline/cuối | Không đổi bởi agent |
| Cleanup | N/A |

---

## 11. Luồng bị chặn

| Luồng | Lý do | Hard gate | Cần bổ sung | Rủi ro nếu tự chạy |
|---|---|---|---|---|
| P Lưu HĐ | DB operational | Isolation | DB test + fixture + cleanup theo runId | Tạo HĐ/khách/thay tồn thật |
| Q Sửa | Ghi đè HĐ thật | Isolation | HĐ fixture owned by runId | Sai lệch hóa đơn/tồn |
| R Hủy/xóa | Hoàn tồn completed | Isolation | Fixture + admin test | Mất HĐ + hoàn tồn sai |
| S Confirm đổi trả | Ghi refund | Isolation | Fixture | Refund/tồn sai |
| L Upsert khách | patch/post customers | Isolation | Customer test marker | Sửa 1610 khách thật |
| N/O tính tiền submit | Đi kèm save | Isolation | — | — |
| T Non-admin | Không có user EMPLOYEE | Data | Tạo user employee test | — |

---

## 12. Bằng chứng

- Screenshots: `e2e-artifacts/retail-audit/screenshots/` (40 files)
- Results JSON: `e2e-artifacts/retail-audit/results.json`
- Excel download: `e2e-artifacts/retail-audit/downloads/hoa-don-ban-le-2026-07-11.xlsx`
- Runner: `e2e-artifacts/retail-audit/run-retail-audit.cjs`
- Không video/trace Playwright full (không bật tracing mặc định)

---

## 13. Bảo toàn ngoài phạm vi

- Không sửa source  
- Không sửa dependency  
- Không migration/seed/cleanup  
- Không đổi Store Settings  
- Không đổi role  
- Không ghi dữ liệu ngoài fixture (không tạo fixture)  
- Không tự sửa lỗi phát hiện  

---

## 14. Kết luận

**Verdict: `BLOCKED_WRITE_FLOWS_NOT_ISOLATED`**

Đã hoàn thành inventory source + kiểm thử read-only E2E Playwright trên trang Bán lẻ.  
Các luồng ghi (tạo/sửa/hủy/đổi trả/upsert khách/trừ tồn) **không chạy** vì MySQL `ladystars_php` chứa dữ liệu operational-scale, không có fixture isolation/cleanup an toàn.

Trong phần read-only đã phát hiện lỗi **HIGH** thật:
1. Thiếu API `payment-methods/standard` (404) trên form tạo HĐ  
2. Luồng in HĐ không hoàn tất nội dung popup trong automation  
3. Overflow mobile toolbar  

---

## 15. Việc cần quyết định tiếp

1. **Ưu tiên sửa (khi bạn cho phép dev):** route `/products/payment-methods/standard` (hoặc đổi client sang endpoint đúng).  
2. **Reproduce in HĐ** có headful browser + bắt response `/products/sales/{id}`.  
3. **Mobile CSS** cho `.retail-filter-actions`.  
4. **Cung cấp môi trường test cô lập** (DB test riêng / live-test workflow / user employee) nếu muốn mở write flows.  
5. **Không tự sửa code** trong nhiệm vụ này — chờ chỉ đạo.
