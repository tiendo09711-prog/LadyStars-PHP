# KẾT QUẢ KIỂM THỬ E2E PLAYWRIGHT — TRANG TRẢ HÀNG

## 1. Executive summary
- Thời gian chạy: 2026-07-11T17:31:01.570Z → 2026-07-11T17:31:01.626Z
- RUN_ID: `E2E_REFUND_1783791061568_7wcqzb`
- URL frontend: http://localhost:5173
- URL API: http://127.0.0.1:8000
- Browser: Chromium (Playwright 1.51.0), viewport 1440×900 (+ responsive checks)
- Chế độ: **READ-ONLY** (mutation backend bị harness chặn); mock UI cho error/empty/loading
- DB isolation: **KHÔNG** (DB=`ladystars_php`, APP_ENV=`local`, không `.env.live-test.local`)
- Verdict tổng: **BLOCKED_ENVIRONMENT**

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
| Total | 3 |
| PASS | 0 |
| FAIL | 0 |
| BLOCKED_WRITE_ISOLATION / BLOCKED_SAFETY | 1 |
| BLOCKED_DATA | 0 |
| BLOCKED_AUTH | 0 |
| BLOCKED_ENVIRONMENT | 2 |
| SKIPPED_DEPENDENCY | 0 |
| NOT_RUN | 0 |
| OBSERVATION | 0 |

## 6. Kết quả theo nhóm
| Group | Total | PASS | FAIL | BLOCKED | OTHER |
|---|---:|---:|---:|---:|---:|
| ENV | 3 | 0 | 0 | 3 | 0 |

## 7. Chi tiết từng test
| ID | Tên test | Status | Expected | Actual | Evidence | API | Ghi chú |
|---|---|---|---|---|---|---|---|
| RF-ENV01 | Frontend availability | BLOCKED_ENVIRONMENT | http://localhost:5173 phản hồi | feOk=false |  |  |  |
| RF-ENV02 | Backend availability | BLOCKED_ENVIRONMENT | API :8000 phản hồi | beOk=false |  |  |  |
| RF-ENV03 | DB isolation gate | BLOCKED_WRITE_ISOLATION | DB test cô lập trước khi mutation | DB=ladystars_php; isolated=false; no live-test.local |  |  | Chỉ READ-ONLY + mock UI; không lưu phiếu trả / đổi tồn |

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
- Methods: {"GET":0,"POST":0,"PUT":0,"PATCH":0,"DELETE":0,"OTHER":0}
- 4xx count: 0
- 5xx count: 0
- requestfailed: 0
- Mutation attempts blocked by harness: 0
- Mutation allowed (login only expected): 0

## 10. Console report
- Console errors: 0
- Page errors: 0

## 11. Responsive / accessibility
- Desktop 1440, tablet 768, mobile 390 — xem các case RF-Y / responsive trong bảng chi tiết.
- Kiểm tra overflow-x, menu row actions, export modal, focus/keyboard một phần.

## 12. Test bị chặn
- **RF-ENV01** (BLOCKED_ENVIRONMENT): feOk=false
- **RF-ENV02** (BLOCKED_ENVIRONMENT): beOk=false
- **RF-ENV03** (BLOCKED_WRITE_ISOLATION): Chỉ READ-ONLY + mock UI; không lưu phiếu trả / đổi tồn

## 13. Worktree / artifacts
- Artifact root: `e2e-artifacts/refund-audit/E2E_REFUND_1783791061568_7wcqzb/`
- Script: `e2e-artifacts/refund-audit/run-refund-audit.cjs` (không sửa production source)
- Không commit/push/reset/restore trong task này

## 14. Kết luận
- **Verdict: BLOCKED_ENVIRONMENT**
- PASS=0, FAIL=0, BLOCKED=3
- Mutation live: harness chặn; login POST được phép.

## 15. Bước tiếp theo đề xuất
- Điều tra các FAIL theo severity (không auto-fix trong task audit).
- Nếu cần test mutation đầy đủ: chuẩn bị DB test cô lập + fixture run ID + cho phép live DB test.
- Re-run matrix create/save/stock sau khi có isolation.
