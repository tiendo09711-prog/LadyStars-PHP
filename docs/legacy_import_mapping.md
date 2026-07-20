# Legacy Data Import Mapping - LadyStars-PHP

## Mục tiêu
- Wipe toàn bộ dữ liệu (bảng users cũng bị xóa; admin bootstrap chỉ khi có `LEGACY_IMPORT_ADMIN_EMAIL` + `LEGACY_IMPORT_ADMIN_PASSWORD` trong `.env`)
- Import đầy đủ từ 10 file Excel legacy (không bỏ sót business rows)
- Duy trì quan hệ: Customer <-> Sale/Return/Care , Product <-> Stock/Inventory/Category , Invoice <-> Return <-> Care (point)
- Sử dụng cấu trúc DB hiện tại: normalized cho master (branches, customers, products, categories, product_branch_stocks) + mirror tables cho transactional (sale_payments, product_refunds, customer_cares, inventory_* , product_edit_logs ...)

## Framework & DB
- Laravel  (backend/)
- MySQL (config), hỗ trợ sqlite fallback trong script
- Password hash: Eloquent 'hashed' cast (Laravel Hash, bcrypt)
- Không soft delete trên các bảng chính (theo models)
- Branches dùng cho cả cửa hàng / kho (tên "Kho Hà Nội", "Kho HCM" từ Excel)

## Thư viện bổ sung
- phpoffice/phpspreadsheet (dev) cho đọc xlsx an toàn, UTF8, chunkable.

## Tham số script (artisan import:legacy-data)
- `--dry-run` : không ghi DB, chỉ parse + log + báo cáo
- `--truncate-only` : chỉ xóa dữ liệu (giữ admin), không import
- `--verify` : chỉ chạy kiểm tra sau import (không import)
- `--batch-size=500`
- `--limit=N` : chỉ import N dòng đầu mỗi file (test)
- `--force` : bỏ xác nhận khi chạy thực (ngoài dry-run)
- `--log-file=...`

## Thứ tự Phase (bắt buộc)
1. Backup safety (nếu không dry)
2. Reset (truncate reverse order + disable FK) + optional admin bootstrap via LEGACY_IMPORT_ADMIN_* env
3. Master: branches (từ data Kho) + categories + products + product_branch_stocks
4. Customers (dedup SĐT + code)
5. Transactional:
   - sale_payments (group Bán lẻ theo Mã hóa đơn)
   - product_refunds (link Hóa đơn gốc)
   - customer_cares (parse điểm + mã trả hàng)
   - inventory_vouchers + inventory_products (từ 2 file xuất nhập)
6. product_edit_logs
7. Post: update denorm (customer points/total nếu cần, stock cross check), verify

## Mapping chi tiết từng file

### 1. Danh mục.xlsx → categories
- Tên danh mục → name (unique, binary collation)
- Mã danh mục → code hoặc external_id
- Trạng thái ('Đang hoạt động' → is_active=true)
- Số sản phẩm → product_count (denorm, có thể recalculate)
- Ngày tạo → created_at (nếu parse được)
- Rule: name trim, dedup theo name hoặc code. Nếu trùng skip warning.

### 2. Sản phẩm - Sản phẩm.xlsx + Tồn kho.xlsx → products + product_branch_stocks
**Sản phẩm:**
- Mã SP → code (unique, ưu tiên key)
- Tên sản phẩm → name (có thể chứa note dài, giữ nguyên)
- Mã vạch → barcode
- Danh mục → category_id (match categories.name hoặc code, fallback category_name denorm)
- Nhà cung cấp → supplier_name
- Đơn vị → unit
- Giá vốn → cost
- Giá bán → price
- Giá sỉ → wholesale_price
- Trạng thái → status (giữ 'Mới' v.v.)
- Ngày tạo → created_at
- type: 'product' (mặc định), allows_sale=true

**Tồn kho (cross với Sản phẩm bằng Mã SP):**
- Kho HCM → product_branch_stocks (branch="Kho HCM", qty = Kho HCM)
- Kho Hà Nội → product_branch_stocks (branch="Kho Hà Nội", qty)
- Tổng tồn → có thể sync vào products.qty
- Giá nhập, Giá bán dùng để verify.

**Xử lý Mã SP hỗn loạn:** MHNU..., HÀ-..., SP., TNU..., MÁI HÓI ĐỔI (custom note như). Dùng exact match code + barcode làm natural key. Nếu 0 cost giữ nguyên (custom/service).

### 3. Danh sách khách hàng.xlsx → customers
- Mã khách → code (giữ cả KH551487 và KH.100... )
- Tên khách hàng → name
- Loại (Cá nhân → 'person', Công ty → 'company')
- SĐT → phone (chuẩn hóa: chỉ digit, trim 0 đầu nếu cần cho match)
- Email, Mã thẻ(card_id), Cấp độ(customer_level)
- Nhóm → customer_groups + pivot (nếu có data, hiện tại Excel có cột nhưng sample trống → optional)
- Sinh nhật → birthday (parse d/m/Y)
- Tổng chi → total_spent
- Điểm → points
- Số lần mua → purchase_count
- SL sản phẩm đã mua → purchase_product_quantity
- Ngày mua đầu / gần nhất → first/last_purchase_date
- Chu kỳ, Số ngày chưa mua → ...
- Trạng thái ('active'/'inactive')
- Địa chỉ, Ghi chú → text
- Ngày tạo → timestamps

Deduplicate: ưu tiên phone exact (sau normalize) , fallback code.

### 4. Bán lẻ.xlsx → sale_payments (mirror) + items trong payload
Mỗi dòng ~ 1 item của 1 hóa đơn (flat export).

**Group theo Mã hóa đơn:**
- Mã hóa đơn → code , payload.code
- Ngày tạo (15:41 06/07/2026) → business_date , completed_at , payload.createdAt
- Khách hàng + SĐT khách → customerName, customerPhone , customer_id (FK resolved)
- Sản phẩm, Số SP, Giá trị hàng hóa → items[] : {productCode or productId (legacy code), name, amount, price: (Giá trị / SL), value }
- Tổng tiền, Giảm giá, % chiết khấu, Đã thanh toán → totalAmount, discount, valuePayment, tendered_value...
- Phương thức thanh toán → paymentMethod trong payload
- Trạng thái 'Hoàn tất' → status: 'completed'
- Người tạo → creator / user
- Ghi chú nếu có trong cột Sản phẩm (ví dụ "khách đổi... đã thanh toán trước")

**Extract columns:**
- customer_id, branch_id (từ Kho? nhưng bán lẻ không có cột Kho trực tiếp, infer từ inventory tương ứng hoặc mặc định 1 branch)
- amount_products = Số SP
- value_payment = Tổng tiền
- status, completed_at

**Lưu ý:** Một số row là "Hóa đơn trả hàng XXX : điều chỉnh" → xử lý hoặc skip nếu đã có return.

### 5. Hóa đơn trả hàng.xlsx → product_refunds (mirror)
- Ngày → business_date, completed_at
- Mã trả hàng → code
- Hóa đơn gốc → payment_mongo_id hoặc link tìm sale_payments.code , set payment_mongo_id
- Khách hàng → customer info
- Số lượng, Tiền trả khách (parse "9.333.000 đ" → 9333000) → amount, value, original_total_amount, settlement_value
- Trạng thái 'completed' → status
- payload: { items: [...], customerName, ... }

Sau import return → tạo care slip nếu chưa (nhưng Excel phiếu chăm sóc là nguồn chính).

### 6. Danh sách phiếu chăm sóc.xlsx → customer_cares (mirror)
- ID Phiếu → code
- SĐT / Tên KH → customerPhone, customerName, customer_code , customer_id (resolved)
- Chi tiết "Trừ điểm: - 65" → parse điểm âm, details
- Lý do "Thu hồi điểm tích lũy - Đơn trả hàng"
- Mô tả "Thu hồi từ đơn trả hàng 14792959" → parse return code, link product_refunds hoặc sale
- Người tạo, Ngày tạo, Ngày lưu → creator, record_date, business_date
- branch_id (nếu có)
- reason, description

Đây là nguồn khôi phục điểm cho customer khi trả hàng.

### 7 & 8. Xuất nhập kho (2 files) → inventory_vouchers + inventory_products
**Phiếu (header):**
- ID phiếu → code , voucher_code
- Ngày → business_date
- Kho hàng ("Kho Hà Nội") → warehouse_name, branch_id (resolve), warehouse_mongo_id (legacy)
- Số sản phẩm, Số lượng, Tổng tiền → sp_count, qty, total_amount
- Loại giao dịch ("Xuất bán lẻ", "Khách trả hàng bán lẻ", "Chuyển kho", "Nhập khi tạo sản phẩm"...) → type, import_export_type
  Map:
  - "Xuất bán lẻ" → 'EXPORT', 'Xuất bán lẻ'
  - "Khách trả hàng bán lẻ" → 'IMPORT', 'Khách trả hàng bán lẻ'
  - "Chuyển kho" → 'TRANSFER'
- Người tạo → creator
- Ghi chú → note

**Sản phẩm xuất nhập kho (line items, nếu đầy đủ):**
- ID phiếu → link inventory_voucher_mongo_id / refer_code
- Mã sản phẩm, Sản phẩm → product_code, product_name, product_id (resolve)
- Số lượng (có thể âm cho xuất?), Giá, Tổng tiền
- Loại giao dịch
- Ghi chú
- import_qty / export_qty (tính theo loại)
- branch_id

**Chuyển kho:** Tạo warehouse_transfers hoặc 2 inventory (in/out) + link. Ưu tiên inventory_vouchers type TRANSFER.

### 9. Sản phẩm - Lịch sử sửa xóa (1).xlsx → product_edit_logs (và product_logs nếu phù hợp)
- Mã SP → product_code, product_id
- Tên sản phẩm
- Loại log "Sửa sản phẩm" → log_type
- Kiểu log "Cập nhật thông tin sản phẩm", "Sửa giá bán" → log_action , field_name (nếu parse được)
- Người thao tác → created_by
- Thời gian → business_date

Lưu vào product_edit_logs (có các cột meta từ migration 2026_07_04).

### Null / Special handling
- "—", "", rỗng → null
- Date invalid → null
- Số 0.000 giữ
- Text dài → text column

### Natural keys & Linking
- Product: Mã SP exact first, then barcode, then name+warning orphan
- Customer: SĐT (normalize) first, then Mã khách
- Sale/Return: Mã hóa đơn / Mã trả hàng exact
- Inventory: ID phiếu exact
- Branch: name exact "Kho Hà Nội" / "Kho HCM" (tạo nếu thiếu)
- Care → Return: parse số từ "Thu hồi từ đơn trả hàng XXXXX"

### Orphan & Warning
- Ghi chú/ note = "LEGACY_ORPHAN: [lý do]"
- Xuất file CSV: storage/logs/import_orphans_YYYYMMDD.csv
- Log warning vào storage/logs/legacy_import_*.log + console

### Post-processing
- Recalculate customer: total_spent, points, purchase_* từ transactions (nếu snapshot Excel khác thì ưu tiên snapshot + log diff)
- Sync products.qty = sum stocks
- Verify stock: sum in/out inventory ~ tồn
- Verify point: care deducts ~ customer.points (chú ý sign)

### Verification queries (script --verify)
- Row counts gần đúng Excel (sau dedup)
- 5 returns gần nhất: có invoice gốc? customer khớp? care tương ứng?
- customer "cô DUNG" (0986846668): điểm care + current
- product sample: stock per kho == Tồn kho
- No orphan FK nulls (nếu strict)
- Users: chỉ có admin bootstrap nếu đã set LEGACY_IMPORT_ADMIN_* trong .env (không hardcode mật khẩu)
- No negative stock invalid

### Báo cáo
- import_report_YYYYMMDD.md (counts, duration, warnings)
- import_orphans_....csv
- Console stats + progress

## Rủi ro / Limitation đã biết
- File "Sản phẩm xuất nhập kho" chỉ ~27 rows → có thể thiếu full line items cho 3507 vouchers. Import header đầy, item khi có.
- Phiếu chăm sóc chỉ 6 rows → có thể legacy data không đầy (hoặc filter). Import những gì có.
- Một số link (return → sale) dùng string code, không phải mongo_id 24 (vì legacy).
- Không có data cho: users khác, promotions, full payments history chi tiết, vendors đầy, settings, trademarks/shelves (tạo dummy nếu cần).
- Không tự bịa data.
- Nếu DB mysql thật, backup trước khi chạy (script nhắc).
- Chạy lần đầu trên migrate:fresh khuyến khích.

## Lệnh chạy
```bash
cd backend
php artisan migrate:fresh   # CẢNH BÁO: xóa schema+data
php artisan import:legacy-data --dry-run --limit=20
php artisan import:legacy-data --force   # thực thi (sau backup)
php artisan import:legacy-data --verify
```

## Idempotent
Script luôn truncate trước khi seed (trừ admin).

## Nguồn Excel (2026 data snapshot)
- Tổng ~ 1600 KH, 2000+ SP, 2100+ bán lẻ, 3500+ inventory vouchers, etc.

Báo cáo cuối phải so sánh count và sample links.

## Cải tiến phiên bản hiện tại
- Luôn load/parse data ngay cả dry-run để báo cáo orphan + stats đầy đủ.
- Phone: strip non-digit + +84→0.
- Product matching: code exact > barcode > fuzzy name (warning).
- Sale↔Return: exact + fuzzy fallback (log + LEGACY_ORPHAN).
- Care↔Return: parse Mô tả + attempt link.
- Sale branch inference: từ inventory vouchers (ID phiếu) hoặc default "Kho Hà Nội" + note.
- Snapshot Excel ưu tiên (customers points/stock từ file, không overwrite bằng calc).
- Orphan CSV chi tiết + type breakdown.
- Verify mở rộng theo checklist (DUNG, 5 returns, stock samples, orphan counts...).
- Post-process sync stocks → products.qty.

Giới hạn dữ liệu gốc: cares chỉ 6 rows, returns 15, inv-items 27 — import hết những gì có + báo cáo.

## Web UI (tái sử dụng)
- Trang: `/admin/legacy-import` (yêu cầu đăng nhập + role ADMIN hoặc is_root_owner)
- Upload nhiều file .xlsx cùng lúc
- Sử dụng `LegacyImportService` (tái sử dụng 100% logic từ CLI)
- Xác nhận qua modal trước khi xóa + import
- Hiển thị kết quả + link tải report/CSV sau khi xong
- Command CLI vẫn hoạt động bình thường (gọi service)

