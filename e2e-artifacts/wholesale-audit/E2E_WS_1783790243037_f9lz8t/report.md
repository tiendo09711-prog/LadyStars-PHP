# BÁO CÁO AUDIT E2E — Trang Bán Sỉ

**Run ID:** `E2E_WS_1783790243037_f9lz8t`
**Thời gian:** 2026-07-11T17:17:23.039Z → 2026-07-11T17:26:51.190Z
**URL:** http://localhost:5173/sales-channels/store/wholesale
**Playwright:** 1.51.0
**DB:** ladystars_php @ 127.0.0.1 (mysql), APP_ENV=local
**Isolated:** false
**Safety gate mutating:** YES — BLOCKED

## Counts
- PASS: 63
- FAIL: 12
- BLOCKED_SAFETY_GATE: 5
- BLOCKED: 1
- SKIPPED: 0
- TOTAL: 81

## Bugs
### BUG-WS-001 [LOW] Đóng modal bằng Escape
- TC: TC-E03c
- Expected: Escape đóng nếu hỗ trợ
- Actual: closed=false
- Notes: OBSERVATION: Escape may not close branch modal (source only closes on X/backdrop)

### BUG-WS-002 [HIGH] Branch modal
- TC: TC-E01
- Expected: undefined
- Actual: locator.click: Timeout 30000ms exceeded.
Call log:
[2m  - waiting for locator('.ws-modal button').nth(2)[22m
[2m    - locator resolved to <button disabled type="button" class="ws-btn success">Tiếp tục</button>[22m
[2m  - attempting click action[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is not enabled[22m
[2m    - retrying click action[22m
[2m    - waiting 20ms[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is not enabled[22m
[2m    - retrying click action[22m
[2m      - waiting 100ms[22m
[2m    26 × waiting for element to be visible, enabled and stable[22m
[2m       - element is not enabled[22m
[2m     - retrying click action[22m
[2m       - waiting 500ms[22m

- Notes: 

### BUG-WS-003 [MEDIUM] List responsive mobile 390x844
- TC: TC-S01d
- Expected: Không body overflow-x, UI dùng được
- Actual: overflow={"scrollWidth":433,"clientWidth":390,"overflowX":true}; issues=
- Notes: 

### BUG-WS-004 [MEDIUM] Create responsive mobile
- TC: TC-S02
- Expected: Form dùng được mobile, không overflow nghiêm trọng
- Actual: overflow={"scrollWidth":1007,"clientWidth":390,"overflowX":true}
- Notes: 

### BUG-WS-005 [HIGH] Network unexpected 5xx (happy path noise)
- TC: TC-NET01
- Expected: Không 5xx ngoài mock
- Actual: count5xx=2; unexpected=[{"status":500,"url":"http://127.0.0.1:8000/api/products/sales?type=wholesale&page=1&limit=500&channel=store","t":1783790377095}]
- Notes: 

## Matrix
| ID | Name | Group | Status | Mode | Severity |
|---|---|---|---|---|---|
| TC-A01 | Truy cập chưa đăng nhập | A | PASS | live-readonly |  |
| TC-A00 | Đăng nhập tài khoản test local | A | PASS | live-readonly |  |
| TC-A02 | Truy cập trực tiếp sau đăng nhập | A | PASS | live-readonly |  |
| TC-A03 | Điều hướng từ menu + refresh + back/forward | A | PASS | live-readonly |  |
| TC-A04a | Route tab (default) → all | A | PASS | live-readonly |  |
| TC-A04b | Route tab ?tab=discount → discount | A | PASS | live-readonly |  |
| TC-A04c | Route tab ?tab=debt → debt | A | PASS | live-readonly |  |
| TC-A04d | Route tab ?tab=invalid → all | A | PASS | live-readonly |  |
| TC-B01 | Loading state | B | FAIL | mocked-ui |  |
| TC-B02 | Error state + Thử lại | B | PASS | mocked-ui |  |
| TC-B03 | Empty state | B | PASS | mocked-ui |  |
| TC-B04 | Bảng dữ liệu / format / overflow | B | PASS | mocked-ui |  |
| TC-B05 | Tab Hóa đơn bán sỉ | B | PASS | live-readonly |  |
| TC-B06 | Tab Có chiết khấu | B | PASS | live-readonly |  |
| TC-B07 | Tab Có công nợ + reload giữ tab | B | PASS | live-readonly |  |
| TC-C01 | Lọc mã hóa đơn (apply + case-insensitive client) | C | PASS | live-readonly |  |
| TC-C01b | Lọc một phần mã hóa đơn | C | PASS | live-readonly |  |
| TC-C01c | Mã hóa đơn không tồn tại | C | PASS | live-readonly |  |
| TC-C02 | Lọc cửa hàng/kho | C | PASS | mocked-ui |  |
| TC-C03 | Lọc ngày (from/to/same/reverse min) | C | PASS | live-readonly |  |
| TC-C04 | Lọc khách hàng keyword | C | PASS | live-readonly |  |
| TC-C05 | Lọc sản phẩm keyword | C | PASS | live-readonly |  |
| TC-C06 | Kết hợp tab + filter | C | PASS | live-readonly |  |
| TC-C08 | Draft filter chưa apply | C | PASS | live-readonly |  |
| TC-C07 | Reset/Làm mới filter | C | PASS | live-readonly |  |
| TC-D01 | Phân trang (15/page, prev/next) | D | PASS | live-readonly |  |
| TC-D02 | Checkbox chọn một/nhiều dòng | D | PASS | live-readonly |  |
| TC-D03 | Chọn tất cả trang hiện tại | D | PASS | live-readonly |  |
| TC-E01 | Mở modal chọn cửa hàng/kho | E | PASS | live-readonly |  |
| TC-E03a | Đóng modal bằng X | E | PASS | live-readonly |  |
| TC-E03b | Đóng modal bằng backdrop | E | PASS | live-readonly |  |
| TC-E03c | Đóng modal bằng Escape | E | FAIL | live-readonly | LOW |
| TC-E01 | Branch modal | E | FAIL | live-readonly | HIGH |
| TC-E04 | Branch modal error state | E | FAIL | mocked-ui |  |
| TC-F01 | Dropdown Công cụ | F | PASS | live-readonly |  |
| TC-F02 | Mở Export Excel modal | F | PASS | live-readonly |  |
| TC-F03 | Cột export đại diện | F | PASS | live-readonly |  |
| TC-F04 | Export Excel download (current/all UI) | F | PASS | live-readonly |  |
| TC-G01 | Mở row action menu | G | PASS | live-readonly |  |
| TC-G02 | Actions theo quyền (admin session) | G | FAIL | live-readonly |  |
| TC-G02b | Non-admin action visibility | G | BLOCKED | blocked |  |
| TC-G01 | Row menu/detail | G | FAIL | live-readonly |  |
| TC-G04 | Lỗi tải chi tiết (mock 500) | G | PASS | mocked-ui |  |
| TC-H01 | In hóa đơn (popup + stub print) | H | PASS | live-readonly |  |
| TC-H02 | In phiếu quà tặng (state enable/disable) | H | PASS | live-readonly |  |
| TC-H03 | Popup in bị chặn | H | PASS | mocked-ui |  |
| TC-I01 | Điều kiện action edit/delete/refund (UI state) | I | PASS | live-readonly |  |
| TC-I01 | Edit/refund/delete conditions | I | FAIL | live-readonly |  |
| TC-I05 | Hủy/xóa hóa đơn thật | BLOCK | BLOCKED_SAFETY_GATE | blocked |  |
| TC-Q03-live | F9 lưu hóa đơn thật | BLOCK | BLOCKED_SAFETY_GATE | blocked |  |
| TC-Q10-live | Save complete integration backend | BLOCK | BLOCKED_SAFETY_GATE | blocked |  |
| TC-R03-live | Edit save sequence backend | BLOCK | BLOCKED_SAFETY_GATE | blocked |  |
| TC-N07-live | Tạo khách hàng thật | BLOCK | BLOCKED_SAFETY_GATE | blocked |  |
| TC-J01 | Load trang tạo hóa đơn | J | PASS | live-readonly |  |
| TC-J02 | Create thiếu branchId | J | PASS | live-readonly |  |
| TC-J03 | BranchId không hợp lệ | J | PASS | live-readonly |  |
| TC-K02 | Phím F3 focus product search | K | PASS | live-readonly |  |
| TC-N01 | Phím F4 focus customer phone | N | PASS | live-readonly |  |
| TC-Q01 | F10 toggle auto print (không submit) | Q | PASS | live-readonly |  |
| TC-K01 | Search sản phẩm UI | K | PASS | live-readonly |  |
| TC-K03 | Thêm sản phẩm vào form (state only) | K | PASS | live-readonly |  |
| TC-L01 | Phép tính dòng qty/price/discount | L | PASS | live-readonly |  |
| TC-L04 | Chiết khấu % dòng | L | PASS | live-readonly |  |
| TC-P01 | Thanh toán / công nợ UI cập nhật | P | PASS | live-readonly |  |
| TC-L05 | Xóa dòng sản phẩm | L | PASS | live-readonly |  |
| TC-N02 | Search khách bằng SĐT (debounce UI) | N | PASS | live-readonly |  |
| TC-Q04 | Validation lưu không có SP / thiếu field | Q | PASS | mocked-ui |  |
| TC-O02 | Toggle VAT UI | O | PASS | live-readonly |  |
| TC-O01 | Thông tin doanh nghiệp input (state only) | O | PASS | live-readonly |  |
| TC-K/J create interactions | Create form interactions | K | FAIL | live-readonly |  |
| TC-R04 | Rời create không lưu | R | FAIL | live-readonly |  |
| TC-S01a | List responsive desktop 1440x900 | S | PASS | live-readonly |  |
| TC-S01b | List responsive desktop-sm 1280x720 | S | PASS | live-readonly |  |
| TC-S01c | List responsive tablet 768x1024 | S | PASS | live-readonly |  |
| TC-S01d | List responsive mobile 390x844 | S | FAIL | live-readonly | MEDIUM |
| TC-S02 | Create responsive mobile | S | FAIL | live-readonly | MEDIUM |
| TC-S04 | Accessible names (icon buttons/tabs) | S | PASS | live-readonly |  |
| TC-S03 | Keyboard Tab navigation smoke | S | PASS | live-readonly |  |
| TC-NET01 | Network unexpected 5xx (happy path noise) | NET | FAIL | live-readonly | HIGH |
| TC-CON01 | Console pageerror | NET | PASS | live-readonly |  |
| TC-CON02 | Console error volume | NET | PASS | live-readonly |  |