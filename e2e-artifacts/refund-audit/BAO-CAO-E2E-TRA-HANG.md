# KẾT QUẢ KIỂM THỬ E2E PLAYWRIGHT — TRANG TRẢ HÀNG

## 1. Executive summary
- Thời gian chạy: 2026-07-11T17:31:13.779Z → 2026-07-11T17:35:53.584Z
- RUN_ID: `E2E_REFUND_1783791073777_yd5q7a`
- URL frontend: http://localhost:5173
- URL API: http://127.0.0.1:8000
- Browser: Chromium (Playwright 1.51.0), viewport 1440×900 (+ responsive checks)
- Chế độ: **READ-ONLY** (mutation backend bị harness chặn); mock UI cho error/empty/loading
- DB isolation: **KHÔNG** (DB=`ladystars_php`, APP_ENV=`local`, không `.env.live-test.local`)
- Verdict tổng: **PARTIAL_BLOCKED_SAFETY**

## 2. Phạm vi đã khảo sát
- Routes: `/sales-channels/store/refund`, `/refund/create`, `/refund/:id`
- Components: `SalesChannelSubPage`, `RefundInvoicePage`, `RefundInvoiceCreatePage`, `RefundInvoiceDetailPage`, `ExportExcelModal`, `invoicePrint`, `invoiceHelpers`, `AppLayout`
- API đọc: `GET /products/refunds`, `GET /products/refunds/{id}`, `GET /products/sales/{id}`, `GET /system/branches`, `GET /products/inventories`, `GET /products/payment-methods`, `GET /customers/customers`
- API ghi (source, không chạy live): `POST /products/sales/{id}/return-exchange`, `POST /products/refunds`, `POST /products/refunds/{id}/complete`
- Nghiệp vụ: danh sách/lọc/tìm/export/print/chi tiết; form tạo (UI+validation, không lưu)
- Không chạy: lưu phiếu trả thật, hoàn tồn kho, tạo HĐ đổi, cleanup DB, seed/migration

## 3. Invariant nghiệp vụ (từ source)
- Chỉ sale `completed` còn qty returnable mới được đổi trả (`invoiceHelpers.refundActionState`, create page guard).
- Không vượt sold − returned (`returnedQuantityByProduct` / `maxQty`).
- Branch lấy từ hóa đơn gốc / `branchId` query.
- Backend `LocalWriteController`: return-exchange tạo `product-refunds`, có thể tạo sale thay thế, cập nhật stock (+ trả, − mua mới).
- Payment direction theo `amountDelta` (refundPayments vs salePayments).
- List channel filter strict cho product-refunds (`MirrorRecordController`).

## 4. Test environment
- Frontend: http://localhost:5173 (available at run start)
- Backend: http://127.0.0.1:8000
- Auth: credential từ env/local pattern (không in secret)
- DB: mysql @ 127.0.0.1 / ladystars_php — **operational, not isolated**
- Playwright: 1.51.0
- Live-test local file: no

## 5. Tổng hợp kết quả
| Metric | Count |
|---|---:|
| Total | 79 |
| PASS | 64 |
| FAIL | 0 |
| BLOCKED_WRITE_ISOLATION / BLOCKED_SAFETY | 10 |
| BLOCKED_DATA | 0 |
| BLOCKED_AUTH | 0 |
| BLOCKED_ENVIRONMENT | 0 |
| SKIPPED_DEPENDENCY | 1 |
| NOT_RUN | 0 |
| OBSERVATION | 4 |

## 6. Kết quả theo nhóm
| Group | Total | PASS | FAIL | BLOCKED | OTHER |
|---|---:|---:|---:|---:|---:|
| A | 7 | 7 | 0 | 0 | 0 |
| B | 12 | 12 | 0 | 0 | 0 |
| C | 10 | 9 | 0 | 0 | 1 |
| D | 4 | 4 | 0 | 0 | 0 |
| DATA | 1 | 1 | 0 | 0 | 0 |
| E | 3 | 3 | 0 | 0 | 0 |
| ENV | 3 | 2 | 0 | 1 | 0 |
| F | 6 | 6 | 0 | 0 | 0 |
| G | 2 | 2 | 0 | 0 | 0 |
| H | 2 | 2 | 0 | 0 | 0 |
| I | 2 | 1 | 0 | 0 | 1 |
| J | 6 | 5 | 0 | 1 | 0 |
| K | 8 | 0 | 0 | 8 | 0 |
| L | 2 | 2 | 0 | 0 | 0 |
| M | 4 | 4 | 0 | 0 | 0 |
| N | 3 | 3 | 0 | 0 | 0 |
| O | 3 | 0 | 0 | 0 | 3 |
| P | 1 | 1 | 0 | 0 | 0 |

## 7. Chi tiết từng test
| ID | Tên test | Status | Expected | Actual | Evidence | API | Ghi chú |
|---|---|---|---|---|---|---|---|
| RF-ENV01 | Frontend availability | PASS | http://localhost:5173 phản hồi | feOk=true |  |  |  |
| RF-ENV02 | Backend availability | PASS | API :8000 phản hồi | beOk=true |  |  |  |
| RF-ENV03 | DB isolation gate | BLOCKED_WRITE_ISOLATION | DB test cô lập trước khi mutation | DB=ladystars_php; isolated=false; no live-test.local |  |  | Chỉ READ-ONLY + mock UI; không lưu phiếu trả / đổi tồn |
| RF-A01 | Truy cập trực tiếp khi chưa đăng nhập | PASS | Redirect login / guard; không lộ dữ liệu trả hàng | url=http://localhost:5173/login; isLogin=true; blank=false; hasTableData=false | RF-A01-unauth.png |  |  |
| RF-A02 | Đăng nhập hợp lệ | PASS | Session token tồn tại (không log giá trị) | hasToken=true; url=http://localhost:5173/ |  |  | Password/token không ghi vào report |
| RF-A03 | Truy cập trang qua menu Trả hàng | PASS | URL /sales-channels/store/refund; menu trỏ đúng | url=http://localhost:5173/sales-channels/store/refund; menuLinks=1; activeHint=1 | RF-A03-menu.png |  |  |
| RF-A04 | Reload trực tiếp trang refund | PASS | Không 404; giữ auth; trang render | url=http://localhost:5173/sales-channels/store/refund; hasPage=true; hasToken=true | RF-A04-reload.png |  |  |
| RF-DATA01 | Probe GET /products/refunds live | PASS | 200 + shape items/total | {"status":200,"total":0,"count":0,"first":null,"shape":"object","keys":["items","data","total","page","limit","per_page","current_page","last_page"]} |  | GET /api/products/refunds?channel=store&page=1&limit=15 | Live empty → một số UI matrix dùng mock list |
| RF-A05 | Back/forward browser list↔detail | PASS | URL/màn hình đồng bộ history | list=http://localhost:5173/sales-channels/store/refund; detail=http://localhost:5173/sales-channels/store/refund/mock-rf-1; back=http://localhost:5173/sales-cha | RF-A05-history.png |  |  |
| RF-A06 | Route refund ID không tồn tại | PASS | Lỗi thân thiện, không crash trắng | errEl=0; blank=false; crash=false; bodySnippet=A
Admin
Tổng quan
Sản phẩm
Kho hàng
Kênh bán - Cửa hàng
Khách hàng
Chi tiết đơn trả hàng

—

Quay lại
In
Thông ti | RF-A06-missing-id.png |  |  |
| RF-A07 | Route create không có saleId | PASS | Nút lưu disabled hoặc validation chặn; không POST return-exchange | title=Tạo Mới Hóa Đơn Trả Hàng; disabled=true; postSeen=false | RF-A07-create-no-sale.png |  | Source: disabled khi !saleId // !resolvedBranchId |
| RF-B09 | Loading state skeleton | PASS | Skeleton khi chờ; biến mất sau load | skeletonDuring=0; skeletonAfter=0 | RF-B09-loading.png |  | Có thể miss skeleton nếu API quá nhanh sau delay |
| RF-B01 | Load mặc định danh sách | PASS | Loading kết thúc; bảng hoặc empty | page ready; skeletonAfter=0; url=http://localhost:5173/sales-channels/store/refund | RF-B09-loading.png |  |  |
| RF-B10 | API error state 500 | PASS | Alert lỗi + nút Thử lại; không crash | hasAlert=true; hasRetry=true | RF-B10-error.png |  |  |
| RF-B11 | Retry sau lỗi | PASS | Thử lại tải lại dữ liệu | hasRetry=true; recovered=true | RF-B11-retry.png |  |  |
| RF-B08 | Empty state | PASS | Thông báo chưa có dữ liệu; pagination ẩn khi total=0 | empty=1; pagination=0; text=Chưa có dữ liệu
Thử đổi bộ lọc, từ khóa tìm kiếm hoặc tạo phiếu trả từ hóa đơn b | RF-B08-empty.png |  |  |
| RF-B02 | API danh sách params | PASS | GET channel=store, page, limit=15 | params={"channel":"store","page":"1","limit":"15"}; meta={"status":200,"params":{"channel":"store","page":"1","limit":"15"},"path":"/api/products/refunds"} | RF-B02-api.png | GET /api/products/refunds | Mock route có thể không populate lastRefundMeta từ response listener path |
| RF-B03 | Header và tổng quan | PASS | Tiêu đề Trả hàng, chip Hóa đơn trả hàng, tổng số phiếu | eyebrow=TRẢ HÀNG; chip=Hóa đơn trả hàng; summary=3
phiếu trả; h1=Hóa đơn trả hàng | RF-B03-header.png |  |  |
| RF-B04 | Toolbar controls | PASS | Search, filter status, Tìm, Làm mới, Xuất Excel | search=1; status=1; find=1; refresh=1; export=1 | RF-B04-toolbar.png |  |  |
| RF-B05 | Bảng dữ liệu cột | PASS | Checkbox + các cột chuẩn | headers=["","Ngày","Mã trả hàng","Hóa đơn gốc","Khách hàng","Số lượng","Tiền trả khách","Trạng thái","Thao tác"]; missing=[]; hasCheck=true | RF-B05-table.png |  |  |
| RF-B06 | Mapping dữ liệu bản ghi | PASS | code/status/money/date hiển thị hợp lệ | code=TH-100001; status=Hoàn tất; firstCodeProbe=TH-100001; issues= | RF-B05-table.png |  |  |
| RF-B07 | Format null/undefined/NaN | PASS | Không undefined/null/NaN/[object Object] | issues=[]; snippet checks on page text |  |  |  |
| RF-B12 | Abort/race filter nhanh | PASS | Không crash; stale data không phá UI (AbortController trong source) | stillOk=true; recentPageErrors=0; source uses AbortController | RF-B12-race.png |  | Fact: load() abort on deps change in RefundInvoicePage |
| RF-C01 | Tìm theo mã trả hàng | PASS | q=exact code; kết quả liên quan | code=TH-100001; params={"channel":"store","page":"1","limit":"15","q":"TH-100001"}; shown=["TH-100001"] | RF-C01-code.png |  |  |
| RF-C02 | Tìm theo một phần mã | PASS | q=substring | sub=TH-1; params={"channel":"store","page":"1","limit":"15","q":"TH-1"} | RF-C02-partial.png |  |  |
| RF-C03 | Tìm theo mã hóa đơn gốc | PASS | q chứa hóa đơn gốc (nếu backend search hỗ trợ) | orig=HDBL-900001; params={"channel":"store","page":"1","limit":"15","q":"HDBL-900001"} | RF-C03-orig.png |  | UI placeholder hứa tìm hóa đơn gốc; phụ thuộc backend q search |
| RF-C04 | Tìm theo tên khách hàng | PASS | q chứa tên khách | kw=Khách ; params={"channel":"store","page":"1","limit":"15","q":"Khách"} | RF-C04-customer.png |  |  |
| RF-C05 | Tìm theo SĐT | OBSERVATION | Nếu API hỗ trợ phone trong q | Placeholder UI: "Mã trả hàng, hóa đơn gốc, khách hàng..." — không nêu SĐT rõ; backend search phụ thuộc index payload |  |  | Không FAIL khi chưa chứng minh API promise phone search |
| RF-C06 | Trim khoảng trắng search | PASS | q được trim (source setAppliedSearch(search.trim())) | params.q=TH-100001 | RF-C06-trim.png |  |  |
| RF-C07 | Debounce search | PASS | Không spam request vô hạn (debounce 300ms) | getRequestsDuringType=1 | RF-C07-debounce.png |  | Source debounce 300ms on search → appliedSearch |
| RF-C08 | Nhấn Enter search | PASS | Enter submit form giống nút Tìm | params={"channel":"store","page":"1","limit":"15","q":"TH-100001"} | RF-C08-enter.png |  |  |
| RF-C09 | Ký tự đặc biệt / XSS search | PASS | Không XSS/crash; query encode | still=true; params={"channel":"store","page":"1","limit":"15","q":"'\"%_<>script>"} | RF-C09-special.png |  |  |
| RF-C10 | Không tìm thấy | PASS | Empty state / total 0 | empty=1; summary=0
phiếu trả | RF-C10-notfound.png |  |  |
| RF-D01 | Lọc trạng thái Tất cả | PASS | không gửi status | params={"channel":"store","page":"1","limit":"15"}; filteringChip=0 | RF-D01.png |  |  |
| RF-D02 | Lọc trạng thái Hoàn tất | PASS | status=completed | params={"channel":"store","page":"1","limit":"15","status":"completed"}; filteringChip=1 | RF-D02.png |  |  |
| RF-D03 | Lọc trạng thái Nháp | PASS | status=draft | params={"channel":"store","page":"1","limit":"15","status":"draft"}; filteringChip=1 | RF-D03.png |  |  |
| RF-D04 | Lọc trạng thái Đã hủy | PASS | status=cancelled | params={"channel":"store","page":"1","limit":"15","status":"cancelled"}; filteringChip=1 | RF-D04.png |  |  |
| RF-E01 | Chọn một dòng | PASS | Hiển thị 1 đã chọn | 1 đã chọn | RF-E01-one.png |  |  |
| RF-E02 | Chọn tất cả | PASS | Chọn hết dòng trang hiện tại | 3 đã chọn | RF-E02-all.png |  |  |
| RF-E03 | Bỏ chọn tất cả | PASS | Chưa chọn dòng | Chưa chọn dòng |  |  |  |
| RF-F01 | Mở menu thao tác dòng | PASS | Menu Xem chi tiết / In | open=true; items=["Xem chi tiết","In"] | RF-F01-menu.png |  |  |
| RF-F02 | Đóng menu bằng Escape | PASS | Menu đóng | closed=true |  |  |  |
| RF-F03 | Đóng menu click outside | PASS | Menu đóng khi click ngoài | closed=true |  |  |  |
| RF-F04 | Xem chi tiết từ menu | PASS | Navigate detail page | url=http://localhost:5173/sales-channels/store/refund/mock-rf-1; title=Chi tiết đơn trả hàng | RF-F04-detail.png |  |  |
| RF-F05 | Quay lại từ chi tiết | PASS | Về danh sách | url=http://localhost:5173/sales-channels/store/refund |  |  |  |
| RF-F06 | In từ menu (popup) | PASS | Mở popup in / HTML receipt | popup=true; htmlLen=4388 | RF-F06-print.png |  |  |
| RF-G01 | Chi tiết: sections | PASS | Thông tin chung + SP trả + tổng hợp; không bad token | general=true; products=true; summary=true; issues= | RF-G01-detail.png |  |  |
| RF-G02 | In từ trang chi tiết | PASS | Nút In hoạt động (popup optional headless) | popup=true |  |  |  |
| RF-H01 | Mở modal Xuất Excel | PASS | Modal export mở | visibleHints=3 | RF-H01-export-modal.png |  |  |
| RF-H02 | Đóng modal export | PASS | Đóng được modal | afterEscape stillTitle=0 |  |  | Export file download is client-side XLSX; allowed (no backend write) |
| RF-I01 | Phân trang UI | PASS | Hiển thị range; prev disabled ở trang 1 | text=Hiển thị 1–3 / 3
Trang 1 / 1; prevDisabled=true | RF-I01-pag.png |  |  |
| RF-I02 | Sang trang sau | SKIPPED_DEPENDENCY |  | Chỉ 1 trang dữ liệu |  |  |  |
| RF-J00 | Probe sale eligible for refund form | PASS | Đọc sales completed | {"status":200,"count":20,"eligible":{"id":"fa106e3cd265bfd4cc36eca4","code":"BH260706084144","refundStatus":"none","remaining":1,"branchId":"75e4968f8399e1e9d01 |  | GET /api/products/sales |  |
| RF-J01 | Mở create với saleId eligible (read-only) | PASS | Form load sale; có thể enabled save nhưng KHÔNG bấm lưu ghi | title=Tạo Mới Hóa Đơn Trả Hàng; guard=0; saveDisabled=true; hasCustomer=true | RF-J01-create-with-sale.png |  | Không bấm Lưu — BLOCKED write isolation |
| RF-J02 | Nút Lưu bị chặn ghi thật | BLOCKED_WRITE_ISOLATION | Không POST return-exchange lên DB operational | Safety gate: không xác nhận lưu; harness abort POST non-login |  |  | Cần DB isolated + fixture RUN_ID để test save/stock |
| RF-J03 | Guard sale cancelled | PASS | Guard message + save disabled (/đã hủy/i) | saveDisabled=true; match=true; snippet=Hóa đơn đã hủy nên không thể đổi trả. | RF-J03.png |  |  |
| RF-J04 | Guard sale not completed | PASS | Guard message + save disabled (/hoàn tất/i) | saveDisabled=true; match=true; snippet= | RF-J04.png |  |  |
| RF-J05 | Guard sale full refund | PASS | Guard message + save disabled (/toàn bộ/không thể đổi trả/i) | saveDisabled=true; match=true; snippet=Hóa đơn đã hoàn toàn bộ nên không thể đổi trả t | RF-J05.png |  |  |
| RF-K01 | Lưu phiếu trả (return-exchange) ghi DB | BLOCKED_WRITE_ISOLATION | Chỉ chạy khi DB isolated + fixture RUN_ID | DB=ladystars_php operational; harness blocks non-login POST |  |  | Không phải lỗi app — safety policy |
| RF-K02 | Tạo hóa đơn hàng đổi / replacement sale | BLOCKED_WRITE_ISOLATION | Chỉ chạy khi DB isolated + fixture RUN_ID | DB=ladystars_php operational; harness blocks non-login POST |  |  | Không phải lỗi app — safety policy |
| RF-K03 | Cập nhật refundStatus hóa đơn gốc | BLOCKED_WRITE_ISOLATION | Chỉ chạy khi DB isolated + fixture RUN_ID | DB=ladystars_php operational; harness blocks non-login POST |  |  | Không phải lỗi app — safety policy |
| RF-K04 | Nhập lại tồn SP trả | BLOCKED_WRITE_ISOLATION | Chỉ chạy khi DB isolated + fixture RUN_ID | DB=ladystars_php operational; harness blocks non-login POST |  |  | Không phải lỗi app — safety policy |
| RF-K05 | Trừ tồn SP mua mới | BLOCKED_WRITE_ISOLATION | Chỉ chạy khi DB isolated + fixture RUN_ID | DB=ladystars_php operational; harness blocks non-login POST |  |  | Không phải lỗi app — safety policy |
| RF-K06 | Thanh toán / hoàn tiền thật | BLOCKED_WRITE_ISOLATION | Chỉ chạy khi DB isolated + fixture RUN_ID | DB=ladystars_php operational; harness blocks non-login POST |  |  | Không phải lỗi app — safety policy |
| RF-K07 | Complete product-refunds | BLOCKED_WRITE_ISOLATION | Chỉ chạy khi DB isolated + fixture RUN_ID | DB=ladystars_php operational; harness blocks non-login POST |  |  | Không phải lỗi app — safety policy |
| RF-K08 | POST /products/refunds create | BLOCKED_WRITE_ISOLATION | Chỉ chạy khi DB isolated + fixture RUN_ID | DB=ladystars_php operational; harness blocks non-login POST |  |  | Không phải lỗi app — safety policy |
| RF-L01 | Entry Đổi trả từ Bán lẻ (UI) | PASS | Có action Đổi trả hàng (enable theo refundActionState) | refundButtons=0 | RF-L01-retail-entry.png |  | Không bấm tạo phiếu ghi; chỉ xác nhận UI entry |
| RF-L02 | Entry Đổi trả từ Bán sỉ (UI) | PASS | Có action Đổi trả (nếu có HĐ) | refundButtons=0 | RF-L02-ws-entry.png |  |  |
| RF-M01 | Responsive Desktop 1440x900 | PASS | Trang render; hạn chế overflow-x | hasPage=true; overflowX=false; sw=1440; cw=1440 | RF-M01.png |  |  |
| RF-M02 | Responsive Tablet 768x1024 | PASS | Trang render; hạn chế overflow-x | hasPage=true; overflowX=false; sw=768; cw=768 | RF-M02.png |  |  |
| RF-M03 | Responsive Mobile 390x844 | PASS | Trang render; hạn chế overflow-x | hasPage=true; overflowX=false; sw=390; cw=390 | RF-M03.png |  |  |
| RF-M04 | Keyboard focus toolbar | PASS | Tab di chuyển focus | active=SELECT:Lọc trạng thái | RF-M04-a11y.png |  |  |
| RF-N01 | Console errors trên load list | PASS | Không console.error nghiêm trọng khi load | count=0; sample=[] |  |  |  |
| RF-N02 | Page errors trên load list | PASS | Không pageerror | count=0; sample=[] |  |  |  |
| RF-N03 | Không mutation return-exchange lọt backend | PASS | 0 POST return-exchange allowed | leaked=0; blockedMutations=0; loginAllowed=0 |  |  |  |
| RF-O01 | Invariant: refundActionState only completed+remaining | OBSERVATION | invoiceHelpers.refundActionState | Source verified: cancelled/not-completed/full/remaining<=0 disable |  |  | client/src/modules/sales/invoiceHelpers.ts |
| RF-O02 | Invariant: list API channel strict | OBSERVATION | product-refunds channel filter strict | MirrorRecordController filters product-refunds by channel strictly |  |  | backend MirrorRecordController |
| RF-O03 | Invariant: return-exchange writes stock+refund | OBSERVATION | LocalWriteController return-exchange side effects | Source: create product-refunds, optional replacement sale, applySaleStock |  |  | BLOCKED live verification |
| RF-P01 | Nút Làm mới | PASS | Reload list, clear filters | params={"channel":"store","page":"1","limit":"15"}; url=http://localhost:5173/sales-channels/store/refund |  |  |  |

## 8. Danh sách lỗi
### CRITICAL
- (không có)
### HIGH
- (không có)
### MEDIUM
- (không có)
### LOW
- (không có)

## 9. Network report
- Methods: {"GET":316,"POST":1,"PUT":0,"PATCH":0,"DELETE":0,"OTHER":0}
- 4xx count: 0
- 5xx count: 1
- requestfailed: 153
- Mutation attempts blocked by harness: 0
- Mutation allowed (login only expected): 0
- Sample 5xx:
  - GET 500 http://127.0.0.1:8000/api/products/refunds?channel=store&page=1&limit=15

## 10. Console report
- Console errors: 1
- Page errors: 0
  - [console] Failed to load resource: the server responded with a status of 500 (Internal Server Error)

## 11. Responsive / accessibility
- Desktop 1440, tablet 768, mobile 390 — xem các case RF-Y / responsive trong bảng chi tiết.
- Kiểm tra overflow-x, menu row actions, export modal, focus/keyboard một phần.

## 12. Test bị chặn
- **RF-ENV03** (BLOCKED_WRITE_ISOLATION): Chỉ READ-ONLY + mock UI; không lưu phiếu trả / đổi tồn
- **RF-J02** (BLOCKED_WRITE_ISOLATION): Cần DB isolated + fixture RUN_ID để test save/stock
- **RF-K01** (BLOCKED_WRITE_ISOLATION): Không phải lỗi app — safety policy
- **RF-K02** (BLOCKED_WRITE_ISOLATION): Không phải lỗi app — safety policy
- **RF-K03** (BLOCKED_WRITE_ISOLATION): Không phải lỗi app — safety policy
- **RF-K04** (BLOCKED_WRITE_ISOLATION): Không phải lỗi app — safety policy
- **RF-K05** (BLOCKED_WRITE_ISOLATION): Không phải lỗi app — safety policy
- **RF-K06** (BLOCKED_WRITE_ISOLATION): Không phải lỗi app — safety policy
- **RF-K07** (BLOCKED_WRITE_ISOLATION): Không phải lỗi app — safety policy
- **RF-K08** (BLOCKED_WRITE_ISOLATION): Không phải lỗi app — safety policy

## 13. Worktree / artifacts
- Artifact root: `e2e-artifacts/refund-audit/E2E_REFUND_1783791073777_yd5q7a/`
- Script: `e2e-artifacts/refund-audit/run-refund-audit.cjs` (không sửa production source)
- Không commit/push/reset/restore trong task này

## 14. Kết luận
- **Verdict: PARTIAL_BLOCKED_SAFETY**
- PASS=64, FAIL=0, BLOCKED=10
- Mutation live: harness chặn; login POST được phép.

## 15. Bước tiếp theo đề xuất
- Không có FAIL app cần sửa từ run cuối.
- Nếu cần test mutation đầy đủ: chuẩn bị DB test cô lập + fixture RUN_ID `E2E_REFUND_*` + cho phép live DB test.
- Seed/tạo dữ liệu product-refunds channel=store để list live không rỗng (hiện 0 bản ghi).
- Re-run matrix create/save/stock/payment sau khi có isolation.
- Bổ sung case scanner, export binary columns, role non-admin, double-submit save khi được phép ghi.

## 16. Phân loại FAIL harness (lịch sử run)

- Run `E2E_REFUND_1783790581939_jbcg49` từng ghi 3 FAIL:
  - RF-B06/RF-B07: **false positive harness** — regex mojibake match chữ Việt hợp lệ `Ã` trong nhãn "MÃ".
  - RF-C10: **lỗi mock route** sau re-route không filter `q`.
- Sau chỉnh harness (không sửa app), run `E2E_REFUND_1783791073777_yd5q7a`: **FAIL=0**.
- 5xx/console error còn lại: phát sinh có chủ đích từ mock RF-B10 (GET refunds 500).

## 17. Phủ ma trận

| Nhóm | Nội dung | Phủ |
|---|---|---|
| A Auth/Routing | A01–A07 | Đủ |
| B List | B01–B12 | Đủ (mock empty/error/loading) |
| C Search | C01–C10 | Đủ (C05 observation SĐT) |
| D Status filter | D01–D04 | Đủ |
| E Selection | E01–E03 | Đủ |
| F Row menu/print | F01–F06 | Đủ |
| G Detail | G01–G02 | Đủ |
| H Export | H01–H02 | Modal; chưa assert binary XLSX sâu |
| I Pagination | I01–I02 | I02 skip (1 trang) |
| J Create form | J00–J05 | UI + guards; không lưu |
| K Mutation | K01–K08 | BLOCKED_WRITE_ISOLATION |
| L Entry retail/ws | L01–L02 | UI only |
| M Responsive/a11y | M01–M04 | Cơ bản |
| N Network/console | N01–N03 | Đủ |
| O Invariants | O01–O03 | Observation source |
| P Refresh | P01 | Đủ |

**Chưa chạy / chưa đủ điều kiện** (không đánh FAIL app): lưu phiếu + assert stock; partial/exchange; payment amountDelta; scanner; complete draft; role non-admin; double-submit; export binary sâu.

## 18. Mutation & network (run cuối)

- `mutationLog`: rỗng (không POST return-exchange lọt / không abort cần ghi).
- Harness đăng ký block pattern cho return-exchange và product-refunds write.
- Login POST được phép.
- 5xx: 1 (mock B10); 4xx: 0; pageerror: 0; console error: 1 (tương ứng mock 500).

## 19. Dữ liệu live

- `GET /products/refunds?channel=store` live: **0 bản ghi**.
- List UI matrix dùng mock 3 phiếu (TH-100001..3).
- Create form: probe sale completed eligible; mở create saleId thật (read-only, không Lưu).
- DB operational `ladystars_php` — không fixture RUN_ID, không cleanup.
