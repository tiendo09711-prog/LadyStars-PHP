# BÁO CÁO AUDIT E2E — Trang Bán Sỉ

**Run ID chính:** `E2E_WS_1783790243037_f9lz8t`  
**Verdict:** `AUDIT_PARTIAL_BLOCKED_SAFETY_GATE`  
**Công cụ:** Playwright Chromium 1.51.0 (headless)  
**URL:** `http://localhost:5173/sales-channels/store/wholesale`  
**Thời gian (main suite):** 2026-07-11T17:17:23Z → 2026-07-11T17:26:51Z  
**Bổ sung (create mocked):** sau restart backend, file `supplement-results.json`

---

## 1. Executive Summary

Trang Bán sỉ (list + create) **render và vận hành ổn phần read-only UI** trên desktop: auth guard, tab, filter apply/draft, pagination, selection, tools/export Excel, print popup (stub), validation frontend, hotkey F3/F4/F10, form create và phép tính dòng.

**Điểm chặn cứng:** database MySQL `ladystars_php` operational-scale, **không cô lập**, không fixture run-ID → **toàn bộ luồng ghi thật** (tạo/sửa/hủy/xóa HĐ, F9 live, complete trừ tồn, tạo khách) = **BLOCKED_SAFETY_GATE**.

**Số liệu (main + supplement merged trong report.json):**

| Status | Count |
|---|---|
| PASS | 69 |
| FAIL | 15 |
| BLOCKED_SAFETY_GATE | 5 |
| BLOCKED (test account) | 1 |
| TOTAL | 90 |

**CRITICAL:** không ghi nhận CRITICAL runtime false-success trên complete fail (mock Q09 PASS).  
**HIGH (có bằng chứng / source):**  
- `methodId: null` trong `typePayment` (source + gap payload)  
- VAT UI không vào payload save  
- Mobile overflow create form  
- Network 5xx noise trong suite (một phần do mock/unroute)

**Luồng đã kiểm tra đầy đủ (read-only / mocked):** auth, route/tab, list UI, filter, pagination, selection, export UI+download, print stub, create form state, calc, validation, mocked save orchestration.  
**Luồng safety gate:** create/complete/cancel/delete/edit-save thật, F9 live, customer create live, stock delta.

---

## 2. Môi trường kiểm thử

| Hạng mục | Giá trị |
|---|---|
| Repository | `C:\Users\tiend\Desktop\LadyStars-PHP` |
| Branch | `finalgd1` |
| Commit | `8e62654` |
| Frontend | `http://localhost:5173` (Vite laravel-local) |
| Backend | `http://127.0.0.1:8000` (Laravel) |
| Browser | Chromium (Playwright 1.51.0) |
| Config | Script artifact `e2e-artifacts/wholesale-audit/run-wholesale-audit.cjs` (không dùng playwright.config.ts — package không khai báo Playwright trong package.json; module có sẵn ở root `node_modules/playwright@1.51.0`) |
| Viewports | 1440×900, 1280×720, 768×1024, 390×844 |
| Locale/TZ | vi-VN / Asia/Bangkok |
| APP_ENV | local |
| DB | mysql @ 127.0.0.1 / `ladystars_php` |
| Classification | **operational / not isolated** |
| `.env.live-test.local` | Không có |
| Role test | ADMIN (1 user local) |
| Mutating tests | **Không chạy** |

**Không in secret/password/token trong báo cáo.**

---

## 3. Baseline worktree

### Modified có sẵn (trước audit — không phải do audit)

Nhiều file backend/client/tests (Branch/Inventory/LocalWrite/Mirror/Product/Warehouse, retail pages, ExportExcelModal, verify-static, …) — xem `git status` đầu task.

### Untracked có sẵn / do audit

- `e2e-artifacts/` (retail-audit có sẵn + wholesale-audit do audit tạo)
- `backend/tests/Feature/InventoryAuditStateMachineTest.php`
- `backend/tests/Feature/WarehouseTransferFlowTest.php`

### git diff --check

Có warning whitespace/CRLF trên một số file pre-existing; file `$null` blank line at EOF (pre-existing).

**Audit không sửa source ứng dụng.**

---

## 4. Phạm vi source đã khảo sát

### Route

- `/sales-channels/:channel/wholesale` → `SalesChannelSubPage` → `WholesaleInvoicePage`
- `/sales-channels/:channel/wholesale/create` → `WholesaleInvoiceCreatePage` (`branchId`, `editId`)
- Menu: **Kênh bán - Cửa hàng → Bán sỉ**

### File chính

- `client/src/modules/sales/WholesaleInvoicePage.tsx`
- `client/src/modules/sales/WholesaleInvoiceCreatePage.tsx`
- `client/src/modules/sales/wholesale-invoice-page.css`
- `client/src/modules/sales/invoiceHelpers.ts`
- `client/src/modules/sales/invoicePrint.ts`
- `client/src/modules/sales/SalesChannelSubPage.tsx`
- `client/src/main.tsx`
- `client/src/core/layout/AppLayout.tsx`
- `client/src/core/api/http.ts`, `branch.api.ts`
- `client/src/core/auth/access.ts`
- `client/src/core/hooks/productScanner.ts`
- `client/src/modules/product/components/ExportExcelModal.tsx`
- `backend/routes/api.php` (+ controllers mirror/local write — tham chiếu quyền ghi)

### API liên quan

| API | Method | Mục đích | Audit |
|---|---|---|---|
| `/auth/me` | GET | Role / canManageSales | read |
| `/products/sales?type=wholesale` | GET | List + filter | read / mock |
| `/products/sales/{id}` | GET | Detail / print / edit | read / mock |
| `/products/sales` | POST | Tạo HĐ | **mock only** |
| `/products/sales/{id}/complete` | POST | Hoàn tất + trừ tồn | **mock only** |
| `/products/sales/{id}/cancel` | POST | Hủy + hoàn tồn | **blocked live** |
| `/products/sales/{id}` | DELETE | Xóa draft | **blocked live** |
| `/customers/customers` | GET/POST | Khách | GET live; POST mock only |
| `/system/branches` | GET | Filter + picker | live |
| `/products/inventories` | GET | SP theo kho | live/mock |
| `/staff` | GET | NV bán | live |

### Role

- `isAdminRole` → ADMIN mới thấy Sửa/Xóa trên list
- Employee vẫn vào `/sales-channels`

### Save orchestration (source)

1. Validate branch / customer name / products  
2. Lookup/create customer  
3. Nếu `editId`: `POST .../cancel` cũ  
4. `POST /products/sales` draft wholesale  
5. `POST .../complete`  
6. Optional auto-print  
7. Navigate list sau ~1.2s  

---

## 5. Test Coverage Matrix (tóm tắt)

Chi tiết đầy đủ: `report.json` + `report.md` + `supplement-results.json`.

| Nhóm | Kết quả chính |
|---|---|
| A Auth/Route | A01–A04 PASS |
| B List states | B02–B07 PASS; B01 FAIL harness (skeleton timing); list empty live → mock data |
| C Filters | C01–C08 PASS (invoiceCode client-side) |
| D Pagination/select | PASS |
| E Branch modal | E01 open PASS; Escape FAIL(LOW); E05 continue PASS (supplement); E04 mock error flaky |
| F Tools/export | PASS + file xlsx download |
| G Row/detail | Menu/print PASS; admin action visibility flaky với mock; non-admin BLOCKED |
| H Print | PASS (popup + stub, blocked popup) |
| I Edit/refund/delete UI | Conditions observed; delete confirm cancel path partial; **I05 BLOCKED_SAFETY_GATE** |
| J Create load | PASS |
| K Product/F3 | PASS |
| L Calculations | PASS (180.000 với (100000-10000)×2) |
| N Customer/F4 | PASS (UI); N07 live BLOCKED |
| O VAT/enterprise | UI PASS; **O04 FAIL** payload thiếu VAT |
| P Payments | UI PASS; **P07** methodId null (source + payload gap) |
| Q Save/hotkeys | F10/validation PASS; **Q03/Q08/Q09/Q10 mocked PASS**; live F9 BLOCKED |
| R Edit flow | R04 PASS no unsaved guard; R01 mock load FAIL (route); **R03 live BLOCKED** |
| S Responsive/a11y | Desktop PASS; **mobile overflow FAIL** list+create |
| NET/CON | pageerror=0; 5xx noise FAIL classification |

---

## 6. Kết quả theo chức năng

### Auth/route

- Unauth → login, không lộ bảng HĐ sỉ: **PASS**
- Login ADMIN: **PASS** (có lần fallback API token do UI flaky)
- Menu + refresh + history: **PASS**
- Tab query `discount`/`debt`/`invalid` fallback: **PASS**

### Tabs

- Client filter `matchesTab`: discount = `discountValue > 0`; debt = value-valuePayment > 0 và không cancelled: **PASS** (mock data)

### Filters

- Apply button + draftFilters/appliedFilters: **PASS**
- `invoiceCode` **chỉ client-side** (không gửi query invoiceCode)
- storeId/date/customer/product gửi API: **PASS**
- dateTo `min=dateFrom`: **PASS**

### Live data note

- `GET /products/sales?type=wholesale` live: **total=0**  
- Audit dùng **mock invoices** cho bảng/tab/menu/print sau khi phát hiện empty

### Export

- Công cụ → Xuất dữ liệu → modal → download  
- File: `downloads/hoa-don-ban-si-2026-07-11.xlsx`

### Print

- Popup mở, `window.print` stub, không máy in vật lý  
- Popup blocked → alert, không crash

### Create form

- F3/F4 focus đúng  
- Thêm custom product, qty/price/discount calc đúng  
- Validation thiếu SP/khách chặn save  
- F10 toggle autoPrint không submit  

### Mocked save

- Order: `POST customers` → `POST sales` → `POST complete`  
- `type=wholesale`, `channel=store`, `branchId` set  
- Complete 500: **không** hiện success “đã trừ tồn” (Q09 PASS)  
- Create 500: hiện lỗi, không success giả (Q08 PASS)

### Payload gaps (mocked + source)

1. **typePayment.methodId luôn null** khi amount > 0 (source hardcode)  
2. **VAT fields** có UI nhưng **không** có trong `salePayload`  
3. Nhãn HĐ sỉ / một số field DN có thể không map payload  

### Permission

- Chỉ ADMIN session; non-admin **BLOCKED_TEST_ACCOUNT**

---

## 7. Danh sách lỗi / observations

### BUG-WS-001 — LOW — Escape không đóng branch modal

- **TC:** TC-E03c  
- **Expected:** Escape đóng dialog  
- **Actual:** Modal vẫn mở; source chỉ đóng bằng X/backdrop  
- **Evidence:** screenshot suite  
- **Không sửa trong audit**

### BUG-WS-003 — MEDIUM — List mobile overflow-x

- **TC:** TC-S01d 390×844  
- **Actual:** scrollWidth 433 > clientWidth 390  
- **Evidence:** `screenshots/TC-S01d-list.png`

### BUG-WS-004 — MEDIUM — Create mobile overflow-x nghiêm trọng

- **TC:** TC-S02  
- **Actual:** scrollWidth ~1007 trên width 390 (grid 2 cột cố định)  
- **Evidence:** `screenshots/S02-create-mobile.png`

### BUG-WS-P07 / source — HIGH — typePayment.methodId = null

- **Evidence source:** `WholesaleInvoiceCreatePage.tsx` payload  
  `typePayment: [..., { methodId: null, amount }]`  
- **Impact:** sau lưu không phân biệt được TM/CK/thẻ trong breakdown  
- **Supplement:** khi payment > 0 sẽ gửi null methodId (test run có typePayment=[] do UI fill payment flaky, nhưng source invariant rõ)

### BUG-WS-O04 — MEDIUM — VAT UI không vào payload

- **Actual keys payload:** không có hasVat/vatPercent/vatInvoiceNumber/vatInvoiceDate  
- **Evidence:** supplement TC-O04  
- **Impact:** bật VAT trên form không được persist qua API create

### BUG-WS-R04 — LOW/UX — Không có unsaved changes guard

- Hủy bỏ / back mất dữ liệu form không cảnh báo

### Harness / flaky (không kết luận bug app chắc chắn)

- TC-B01 skeleton timing  
- TC-E01 Tiếp tục disabled khi branch load/mock kẹt (E05 supplement PASS khi healthy)  
- TC-G02 admin actions với mock list / auth/me timing  
- TC-R01 edit load mock route FAIL  
- TC-NET01 5xx: 1 request live sales 500 trong lúc suite + mock-inv detail sau unroute  

### BUG-WS-005 — phân loại lại

- 500 mock intentional (B02) không phải bug  
- 500 `mock-inv-1` detail: route mock bị gỡ → hit backend thật → expected noise  
- 500 live `/products/sales?type=wholesale` một lần: **cần điều tra backend** nếu tái hiện ngoài suite (HIGH conditional)

---

## 8. Invariant nghiệp vụ

| Invariant | Status | Evidence |
|---|---|---|
| Unauth không xem HĐ sỉ | PASS | TC-A01 |
| List type=wholesale | PASS | request params |
| Tab discount/debt client filter | PASS | TC-B06/B07 + source matchesTab |
| invoiceCode client filter | PASS | TC-C01 + source |
| PAGE_SIZE 15 | PASS | TC-D01 |
| Admin-only delete/edit menu | PARTIAL | source + ADMIN only account |
| Edit = cancel + create + complete | BLOCKED live | source read; mock sequence only on create |
| Complete trừ tồn | BLOCKED live | safety gate |
| Cancel completed hoàn tồn | BLOCKED live | safety gate |
| type=wholesale on save | PASS mocked | TC-Q10 |
| No false success when complete fails | PASS mocked | TC-Q09 |
| methodId payment mapping | FAIL | source null |
| VAT persisted | FAIL | payload keys |

---

## 9. Network và Console

- **pageerror:** 0  
- **console.error:** chủ yếu resource 500 từ mock  
- **5xx recorded:** mock intentional + residual after unroute  
- **Duplicate request:** loadInvoices + branches normal on mount  

---

## 10. Kiểm tra dữ liệu

| Hạng mục | Kết quả |
|---|---|
| Test có ghi DB? | **Không** |
| Isolated mutating? | **Không** |
| run ID fixture cleanup | N/A |
| Stock delta | N/A |
| **Verdict data** | **BLOCKED_SAFETY_GATE** |

**Lý do:** DB `ladystars_php` operational, ~không test DB name, không E2E_RUN_ID fixture, không live-test workflow, complete có thể trừ tồn.

---

## 11. Artifacts

```
e2e-artifacts/wholesale-audit/
  run-wholesale-audit.cjs
  run-create-supplement.cjs
  diag-login.cjs
  last-run.log
  E2E_WS_1783790243037_f9lz8t/
    report.json
    report.md
    BAO-CAO-E2E-BAN-SI.md
    console-errors.json
    network-failures.json
    supplement-results.json
    screenshots/   (54+ files)
    downloads/hoa-don-ban-si-2026-07-11.xlsx
    traces/
```

---

## 12. Worktree sau audit

- **Có sẵn trước:** modified backend/client/tests như baseline  
- **Do audit tạo:** chỉ dưới `e2e-artifacts/wholesale-audit/**`  
- **Không** sửa source app, **không** commit/push/reset/restore  

---

## 13. Điểm cần xác nhận nghiệp vụ

1. Live wholesale invoices = 0: có đúng môi trường local empty, hay filter type/channel backend lệch?  
2. VAT trên form bán sỉ: có bắt buộc persist không?  
3. typePayment.methodId null: intentional placeholder hay bug mapping payment methods?  
4. Edit flow cancel+recreate: chấp nhận partial-write risk khi complete fail sau cancel?  
5. Mobile: có yêu cầu responsive full cho create form không?

---

## 14. Khuyến nghị bước tiếp theo (không sửa trong task này)

1. **P0** — Cô lập DB test + fixture run-ID rồi chạy integration: create/complete/cancel/stock (liên quan safety gate)  
2. **P0** — Map `methodId` payment methods thật (BUG methodId null)  
3. **P1** — Đưa VAT (và field DN cần thiết) vào payload hoặc ẩn UI nếu out-of-scope  
4. **P1** — Responsive create form mobile (BUG-WS-004)  
5. **P2** — Escape đóng branch modal (BUG-WS-001)  
6. **P2** — Unsaved changes guard (R04)  
7. **P2** — Điều tra 500 `/products/sales?type=wholesale` nếu tái hiện ngoài mock suite  

---

## 15. Verdict

```text
AUDIT_PARTIAL_BLOCKED_SAFETY_GATE
```

**Lý do chọn verdict:**  
- Suite browser + source audit + mocked write orchestration **đã hoàn tất phần được phép**.  
- **Không** thể xác minh end-to-end backend thật cho tạo/sửa/hủy/complete/tồn kho vì hard safety gate.  
- Có issues MEDIUM/HIGH về payload mapping và responsive; không CRITICAL false-success trên mock complete-fail.
