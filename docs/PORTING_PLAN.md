# Kế hoạch port đầy đủ từ Polirium sang MERN

## Phase 1 - Foundation

- Hoàn thiện auth: login, refresh token, forgot password.
- Tạo Role, Permission, Menu giống Polirium core.
- Tạo Branch và cấu trúc multi-branch.
- Chuẩn hóa response API, pagination, search, audit log.

## Phase 2 - Product + Inventory

- Product CRUD: category, trademark, shelf, unit, combo element.
- ProductBranchStock collection: `{ productId, branchId, qty, minQuantity, maxQuantity }`.
- StockAdjustment, StockImport, StockAudit.
- ProductLog bắt buộc ghi mọi biến động nhập/bán/trả/chuyển.

## Phase 3 - Sales

- POS/cart UI.
- SalePayment draft/completed/cancelled/refunded.
- Split payment bằng nhiều payment method.
- COD + delivery partner + delivery status.
- Refund sale và hoàn tồn.

## Phase 4 - Vendor/Purchase

- Vendor CRUD + groups.
- Purchase order, purchase import, purchase return.
- Transfer giữa chi nhánh.
- Khi purchase completed: cộng tồn và ghi ProductLog.

## Phase 5 - Accounting + Reports

- Receipt/payment voucher.
- Sale invoice report.
- Cashflow report.
- Revenue, gross profit, inventory valuation.

## Phase 6 - UI parity

- React datatable reusable.
- Modal/form generator.
- Filter sidebar.
- Print-form editor.
- Mobile responsive admin layout.
