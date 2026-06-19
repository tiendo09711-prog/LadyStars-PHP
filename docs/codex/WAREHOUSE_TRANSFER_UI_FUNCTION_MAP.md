# Warehouse Transfer UI Function Map

## Route

- Path: `/warehouse/transfers`, `/warehouse/transfers/create`, `/warehouse/transfers/:id`
- Main component: `client/src/modules/warehouse/WarehouseTransferPage.tsx`
- Create component: `client/src/modules/warehouse/WarehouseTransferCreatePage.tsx`
- Detail component: `client/src/modules/warehouse/WarehouseTransferDetailPage.tsx`
- Layout/Auth/Permission: routes live under `AppLayout`; API uses `requireAuth`; backend maps `owner` to `ADMIN_CHAIN`, `staff + branchId` to `WAREHOUSE_MANAGER`.

## Tổng quan trang

- Trang dùng để quản lý phiếu chuyển kho gốc và chứng từ kho phát sinh từ luồng chuyển kho.
- Khu vực chính: 4 tab `Tất cả`, `Phiếu nháp`, `Đang chuyển đi`, `Sắp chuyển đến`.
- Chức năng chính: tạo/lưu nháp/gửi duyệt, action theo trạng thái, xem chi tiết/audit, import Excel có preview, tải template import.

## API đang dùng

| Chức năng | Method | Endpoint | File gọi API | Handler | State liên quan | Ghi chú |
| --------- | ------ | -------- | ------------ | ------- | --------------- | ------- |
| Meta kho/status | GET | `/warehouse/transfers/meta` | `WarehouseTransferPage.tsx`, `WarehouseTransferCreatePage.tsx` | `loadMeta` | `meta` | Trả role, warehouse active, warehouse gán user |
| List tab | GET | `/warehouse/transfers` | `WarehouseTransferPage.tsx` | `load` | `rows`, `total`, `page`, `filters`, `activeTab` | `tab=all/draft/outgoing/incoming` |
| Tạo phiếu | POST | `/warehouse/transfers` | `WarehouseTransferCreatePage.tsx` | `handleSubmit` | `form`, `lines`, `saving` | Không đổi tồn kho |
| Chi tiết | GET | `/warehouse/transfers/:id` | `WarehouseTransferDetailPage.tsx` | `load` | `data`, `loading` | Có audit log |
| Action state | POST | `/warehouse/transfers/:id/actions/:action` | `WarehouseTransferPage.tsx`, `WarehouseTransferDetailPage.tsx` | `runAction` | `actionTarget`, `reason` | Backend kiểm role/status/kho |
| Template import | GET | `/warehouse/transfers/import-template` | `WarehouseTransferPage.tsx` | `downloadTemplate` | n/a | File `.xlsx` an toàn |
| Validate import | POST | `/warehouse/transfers/import/validate` | `WarehouseTransferPage.tsx` | `validateImport` | `importPreview` | Chưa tạo DB |
| Commit import | POST | `/warehouse/transfers/import/commit` | `WarehouseTransferPage.tsx` | `commitImport` | `importPreview`, `submitForApproval` | Tạo phiếu thật, không đổi tồn |

## State quan trọng

| State | File | Mục đích | Update ở đâu |
| ----- | ---- | -------- | ------------ |
| `activeTab` | `WarehouseTransferPage.tsx` | Chọn tab | Click tab |
| `filters` | `WarehouseTransferPage.tsx` | Lọc kho nguồn/kho đích/status/id/ngày | Form filter |
| `rows/page/total` | `WarehouseTransferPage.tsx` | Dữ liệu bảng | `load` |
| `actionTarget/actionName/reason` | `WarehouseTransferPage.tsx` | Modal xác nhận action | Dropdown action |
| `importFile/importPreview` | `WarehouseTransferPage.tsx` | Modal import Excel | Upload/validate/commit |
| `form/lines` | `WarehouseTransferCreatePage.tsx` | Form tạo phiếu | Input và add/remove line |
| `data/audits` | `WarehouseTransferDetailPage.tsx` | Chi tiết phiếu | `load` |

## Filter/Search

| UI filter | Field gửi API | State | Handler | Ghi chú |
| --------- | ------------- | ----- | ------- | ------- |
| ID/mã phiếu | `id` | `filters.id` | `applyFilters` | Tìm transfer code/voucher code |
| Kho nguồn | `sourceWarehouseId` | `filters.sourceWarehouseId` | `applyFilters` | Backend vẫn kiểm quyền |
| Kho đích | `destinationWarehouseId` | `filters.destinationWarehouseId` | `applyFilters` | Backend vẫn kiểm quyền |
| Status | `status` | `filters.status` | `applyFilters` | Chỉ tab phiếu |
| Từ ngày/đến ngày | `fromDate/toDate` | `filters` | `applyFilters` | Theo createdAt |

## Button/Action

| UI | Vị trí | Chức năng | Handler | API | Modal/Route | Ghi chú |
| -- | ------ | --------- | ------- | --- | ----------- | ------- |
| Thêm mới | Toolbar | Mở menu tạo/import | `setOpenMenu` | n/a | Dropdown | Không hardcode data |
| Tạo phiếu chuyển kho | Dropdown | Vào form tạo | `navigate` | n/a | `/warehouse/transfers/create` | |
| Import phiếu chuyển kho | Dropdown | Mở modal import | `openImport` | n/a | Modal | Validate trước commit |
| Xem chi tiết | Row action | Xem phiếu/audit | `navigate` | n/a | `/warehouse/transfers/:id` | |
| Gửi duyệt / duyệt / xác nhận / hủy | Row/detail action | Chuyển trạng thái | `runAction` | POST action | Confirm reason modal | Backend quyết định quyền cuối cùng |

## Table/List Columns

| Tab | Cột chính |
| --- | -------- |
| Tất cả | ID/Ngày, Kho hàng/hướng chuyển, Kiểu, SP, SL, Tổng tiền, Người tạo, Ghi chú, Thao tác |
| Phiếu nháp | ID/Ngày, Kho nguồn → kho đích, SP, SL yêu cầu, Người tạo, Người duyệt yêu cầu, Xác nhận xuất, Duyệt xuất, Xác nhận nhận, Duyệt nhận, Trạng thái, Thao tác |
| Đang chuyển đi | ID/Ngày, Kho nguồn → kho đích, SP, SL yêu cầu, Trạng thái, Action theo kho nguồn |
| Sắp chuyển đến | ID/Ngày, Kho nguồn → kho đích, SP, SL yêu cầu, Trạng thái, Action theo kho đích |

## Modal/Drawer/Popup

| Tên | Mở từ đâu | State | Chức năng | API |
| --- | --------- | ----- | --------- | --- |
| Confirm action | Row/detail action | `actionTarget`, `reason` | Nhập lý do nếu cần và gọi action | `/warehouse/transfers/:id/actions/:action` |
| Import Excel | Dropdown Thêm mới | `importFile`, `importPreview` | Upload, validate, preview lỗi, commit | import endpoints |

## Pagination

| State page | State page size | Handler | API |
| ---------- | --------------- | ------- | --- |
| `page` | `LIMIT=20` | `setPage` | `/warehouse/transfers?page&limit` |

## Chức năng trong mẫu nhưng phase này không triển khai

| Chức năng mẫu | Có logic/API cũ không | Cách xử lý |
| ------------- | --------------------- | ---------- |
| In mã vạch từ phiếu chuyển | Chưa có backend thật | Không dựng button chết |
| Nhận thiếu/nhận thừa | Không có nghiệp vụ phase này | Không triển khai |
| Tách nhiều đợt nhận | Không có nghiệp vụ phase này | Không triển khai |

## Rủi ro khi refactor

| Rủi ro | Cách tránh |
| ------ | ---------- |
| Trừ/cộng tồn hai lần | Backend check status + billId trong DB transaction |
| Staff xem phiếu ngoài kho | Backend filter và detail/action 403 |
| Import tạo phiếu dở dang | Commit từng phiếu trong transaction riêng |
| `/warehouse/transactions` mất chứng từ chuyển kho | Chứng từ transfer vẫn tạo bằng `InventoryVoucher`/`InventoryProduct` |
