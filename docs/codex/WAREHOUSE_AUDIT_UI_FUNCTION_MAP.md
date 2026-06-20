# WAREHOUSE_AUDIT UI Function Map

## Route

- Path: `/warehouse/audit`
- Main component: `client/src/modules/warehouse/WarehouseAuditPage.tsx`
- Related files:
  - `client/src/modules/warehouse/WarehouseAuditCreatePage.tsx`
  - `client/src/core/components/TabbedModulePage.tsx`
  - `client/src/core/components/DataModulePage.tsx`
  - `client/src/core/components/Pagination.tsx`
  - `client/src/core/api/http.ts`
  - `client/src/main.tsx`
  - `server/src/modules/warehouse/warehouse.routes.ts`
  - `server/src/modules/warehouse/warehouse.models.ts`
  - `server/src/modules/product/product.routes.ts`
  - `server/src/modules/product/product.service.ts`
  - `server/src/core/middleware/auth.ts`
  - `server/src/app.ts`
  - `e2e/tests/warehouse-audit.spec.ts`
  - `e2e/tests/warehouse-audit-hardcode.spec.ts`
- Layout/Auth/Permission:
  - Frontend route được mount trong `AppLayout`, không có guard riêng cho audit.
  - Auth dùng JWT qua `http` interceptor.
  - Backend route đi qua `requireAuth` và `warehouseAccessGuard`.
  - Với non-admin, `warehouseAccessGuard` đang chặn mutation trực tiếp trên `/warehouse/checks`.
  - `system/branches` và `products/inventories` đã có warehouse scope cho EMPLOYEE.

## Tổng quan trang

- Trang này dùng để:
  - Xem danh sách phiếu kiểm kho.
  - Xem danh sách sản phẩm kiểm kho.
  - Tạo phiếu kiểm kho.
- Khu vực/tab chính:
  - Tab `Kiểm kho`
  - Tab `Sản phẩm kiểm kho`
  - Route riêng `/warehouse/audit/create`
- Chức năng chính hiện tại:
  - List CRUD generic cho `InventoryCheck`
  - List CRUD generic cho `InventoryCheckProduct`
  - Tạo phiếu kiểm kho theo form custom
- Chức năng thực tế còn thiếu so với yêu cầu:
  - Không có detail page/modal đúng nghiệp vụ.
  - Không có trạng thái `DRAFT | COUNTING | SUBMITTED | RECONCILED | CANCELLED`.
  - Không có snapshot tồn hệ thống/đang chuyển.
  - Không có submit, reconcile, cancel, merge, export, print/report thật.
  - Không có audit log riêng cho kiểm kho.
  - Không có phân quyền audit riêng theo action.

## API đang dùng

| Chức năng | Method | Endpoint | File gọi API | Handler | State liên quan | Ghi chú |
| --------- | ------ | -------- | ------------ | ------- | --------------- | ------- |
| Load tab Kiểm kho | GET | `/warehouse/checks?page&limit&q&status...` | `DataModulePage.tsx` | `load` | `items`, `page`, `total`, `loading`, `error` | Generic CRUD list |
| Load tab Sản phẩm kiểm kho | GET | `/warehouse/check-products?page&limit&q&status...` | `DataModulePage.tsx` | `load` | `items`, `page`, `total`, `loading`, `error` | Generic CRUD list |
| Tạo phiếu generic | POST | `/warehouse/checks` | `DataModulePage.tsx` | `submit` | `form`, `showModal`, `error` | Không dùng trong create page hiện tại |
| Sửa phiếu generic | PATCH | `/warehouse/checks/:id` | `DataModulePage.tsx` | `submit` | `form`, `editingId`, `error` | Không có rule trạng thái |
| Xóa phiếu generic | DELETE | `/warehouse/checks/:id` | `DataModulePage.tsx` | `remove` | `error` | Hard delete |
| Tạo phiếu custom | POST | `/warehouse/checks` | `WarehouseAuditCreatePage.tsx` | `handleSave` | `form`, `lines`, `saving`, `error` | Đang vừa tạo phiếu vừa bù trừ tồn kho ở backend |
| Load kho cho create | GET | `/system/branches` | `WarehouseAuditCreatePage.tsx` | `fetchBranchesAndProducts` | `sysBranches`, `form.warehouse` | Có scope theo kho được gán |
| Load tồn/sản phẩm cho create | GET | `/products/inventories?limit=100` | `WarehouseAuditCreatePage.tsx` | `fetchBranchesAndProducts` | `dbProducts` | Có scope theo kho |

## State quan trọng

| State | File | Mục đích | Update ở đâu |
| ----- | ---- | -------- | ------------ |
| `activeKey` | `TabbedModulePage.tsx` | Tab hiện tại | `setActiveKey` |
| `items` | `DataModulePage.tsx` | Dữ liệu bảng generic | `load` |
| `page`, `total` | `DataModulePage.tsx` | Pagination | `load`, `Pagination` |
| `search`, `appliedSearch` | `DataModulePage.tsx` | Search generic | `input`, debounce effect |
| `quickFilter` | `DataModulePage.tsx` | Filter nhanh generic | `setQuickFilter` |
| `selectedIds` | `DataModulePage.tsx` | Bulk select generic | checkbox handlers |
| `showModal`, `editingId`, `form` | `DataModulePage.tsx` | CRUD modal generic | `openCreate`, `openEdit`, `submit` |
| `rowActionOpen` | `DataModulePage.tsx` | Dropdown action mỗi dòng | row action button |
| `dbProducts` | `WarehouseAuditCreatePage.tsx` | Product inventory từ API | `fetchBranchesAndProducts` |
| `sysBranches` | `WarehouseAuditCreatePage.tsx` | Kho từ API | `fetchBranchesAndProducts` |
| `form` | `WarehouseAuditCreatePage.tsx` | Thông tin phiếu tạo mới | `setForm`, init effect |
| `lines` | `WarehouseAuditCreatePage.tsx` | Dòng sản phẩm kiểm kho | add/update/remove line |
| `searchQuery`, `showDropdown` | `WarehouseAuditCreatePage.tsx` | Tìm sản phẩm | search input handlers |
| `saving`, `error` | `WarehouseAuditCreatePage.tsx` | Submit state | `handleSave` |

## Filter/Search

| UI filter | Field gửi API | State | Handler | Ghi chú |
| --------- | ------------- | ----- | ------- | ------- |
| Search generic list | `q` | `search`, `appliedSearch` | debounce effect trong `DataModulePage` | Không map đúng filter nghiệp vụ audit |
| Quick filter generic | `status` | `quickFilter` | `setQuickFilter` | `WarehouseAuditPage` hiện không cấu hình |
| Search sản phẩm create | Không gọi API, chỉ filter local | `searchQuery` | `filteredSearchProducts` | Dùng dữ liệu đã tải sẵn |

## Button/Action

| UI cũ | Vị trí | Chức năng | Handler hiện tại | Có gọi API không | Modal/Route | Ghi chú |
| ----- | ------ | --------- | ---------------- | ---------------- | ----------- | ------- |
| `Tạo phiếu kiểm kho` | Header tab Kiểm kho | Sang trang create | `navigate('/warehouse/audit/create')` | Không | Route | Có thật |
| `Thêm sản phẩm` | Header tab Sản phẩm kiểm kho | Không cấu hình handler riêng | generic create | Có | Modal | Không đúng nghiệp vụ |
| `Công cụ > Làm mới` | Header generic | Reload list | `load` | Có | Không | Generic |
| `Công cụ > Xuất CSV` | Header generic | Export CSV local | `exportCsv` | Không | Không | Chỉ export row hiện có trên frontend |
| `Công cụ > Nhập dữ liệu` | Header generic | Alert hướng dẫn | inline alert | Không | Không | Placeholder |
| `Sửa` | Row action generic | Mở modal edit | `openEdit` | Có sau submit | Modal | Không có rule trạng thái |
| `Xóa` | Row action generic | Xóa record | `remove` | Có | confirm browser | Hard delete |
| `In mẫu kiểm kho` | Header create | `window.print()` | inline | Không | Browser print | Chỉ placeholder |
| `Nhập Excel` | Header create | `alert(...)` | inline | Không | Không | Placeholder |
| `Lưu phiếu` | Header create + sidebar create | Tạo phiếu | `handleSave` | Có | Navigate | Đang gọi API cũ |
| `Đóng` dropdown search | Create page | Đóng search | inline | Không | Không | UI local |
| `Xóa dòng` | Bảng create | Xóa product line | `removeLine` | Không | Không | UI local |

## Table/List Columns

### Tab Kiểm kho hiện tại

| Cột | Field dữ liệu | Sort | Click | Action | Ghi chú |
| --- | ------------- | ---- | ----- | ------ | ------- |
| ID | `id` | Không | Không | Không | Dùng generic render |
| Ngày | `date` | Không | Không | Không | Date string |
| Loại kiểm kho | `type` | Không | Không | Không | Text tự do |
| Kho | `warehouse` | Không | Không | Không | Hiện chỉ là string |
| Người tạo | `creator` | Không | Không | Không | Đang có thể hardcode |
| SP | `spCount` | Không | Không | Không | Number |
| SL | `qty` | Không | Không | Không | Number |
| Ghi chú | `note` | Không | Không | Không | Text |
| SP thiếu | `missingSp` | Không | Không | Không | String |
| Bù trừ kiểm kho | `balance` | Không | Không | Không | String, không phản ánh bill thật |

### Tab Sản phẩm kiểm kho hiện tại

| Cột | Field dữ liệu | Sort | Click | Action | Ghi chú |
| --- | ------------- | ---- | ----- | ------ | ------- |
| Ngày | `date` | Không | Không | Không | Generic |
| Kho | `warehouse` | Không | Không | Không | String |
| Tên sản phẩm | `productName` | Không | Không | Không | Snapshot chưa đầy đủ |
| Giá vốn | `cost` | Không | Không | Không | Money |
| Giá bán | `price` | Không | Không | Không | Money |
| Tồn | `stock` | Không | Không | Không | Tồn snapshot cũ, field name mơ hồ |
| Đang chuyển | `transferring` | Không | Không | Không | Hiện luôn 0 từ frontend create |
| Tồn thực tế | `actualStock` | Không | Không | Không | Được nhập lúc tạo phiếu |
| Chênh lệch | `difference` | Không | Không | Không | Được tính ở frontend create |
| Mô tả | `description` | Không | Không | Không | Text |

## Modal/Drawer/Popup

| Tên | Mở từ đâu | State điều khiển | Chức năng | API |
| --- | --------- | ---------------- | --------- | --- |
| Generic CRUD modal | `DataModulePage` create/edit | `showModal` | CRUD item trực tiếp | POST/PATCH generic |
| Dropdown search sản phẩm | Create page search input | `showDropdown` | Chọn product line | Không |

## Pagination

| State page | State page size | Handler | API |
| ---------- | --------------- | ------- | --- |
| `page` | `DEFAULT_PAGE_SIZE = 15` | `setPage` trong `Pagination` | `GET /warehouse/checks`, `GET /warehouse/check-products` |

## Database/Schema/Model hiện tại liên quan

- `InventoryCheck`
  - Trường hiện có: `id`, `date`, `type`, `warehouse`, `creator`, `spCount`, `qty`, `note`, `missingSp`, `balance`
  - Thiếu: `warehouseId`, `auditType`, `status`, `createdById`, `submittedById`, `reconciledById`, `cancelReason`, `linkedInventoryBillId`, `version`
- `InventoryCheckProduct`
  - Trường hiện có: `date`, `warehouse`, `productName`, `cost`, `price`, `stock`, `transferring`, `actualStock`, `difference`, `description`
  - Thiếu: `inventoryAuditId`, `productId`, `productCodeSnapshot`, `barcodeSnapshot`, `unitSnapshot`, `systemQuantitySnapshot`, `inTransitQuantitySnapshot`, `physicalQuantity`, `varianceQuantity`, `countedById`, `countedAt`
- `ProductBranchStock`
  - Là nguồn tồn kho theo kho hiện tại
- `ProductLog`
  - Có `createdAt`, `sourceType`, `amountBefore`, `amountAfter`, có thể dùng để phát hiện biến động sau snapshot
- `WarehouseTransfer`
  - Có `status`, `sourceWarehouseId`, `destinationWarehouseId`, `lines`, bill liên kết
  - Có thể dùng để tính `inTransitQuantitySnapshot`
- `InventoryVoucher`, `InventoryProduct`
  - Có thể tái sử dụng để tạo chứng từ điều chỉnh khi reconcile

## Logic nghiệp vụ hiện tại liên quan

- `POST /warehouse/checks` đang:
  - Tạo `InventoryCheck`
  - Tạo từng `InventoryCheckProduct`
  - Nếu `difference !== 0` thì gọi `moveProductQty` ngay lập tức
- Hệ quả:
  - Tạo phiếu làm thay đổi tồn kho ngay.
  - Không có bước submit/reconcile tách biệt.
  - Không chống reconcile hai lần.
  - Không kiểm soát biến động tồn trong thời gian kiểm.
  - Không tạo chứng từ XNK riêng theo import/export audit.

## Chức năng trong mẫu nhưng code hiện tại chưa có

| Chức năng mẫu | Có logic/API cũ không | Cách xử lý |
| ------------- | --------------------- | ---------- |
| Filter theo kho, ngày tạo, ID, loại, trạng thái, note, ngày bù trừ | Chưa | Cần API list mới cho audit |
| Tab sản phẩm kiểm kho lọc theo sản phẩm, variance type | Chưa | Cần API item list mới |
| Xem chi tiết phiếu kiểm kho | Chưa | Cần detail route/modal mới |
| Submit phiếu | Chưa | Cần backend action mới |
| Reconcile/bù trừ | Chưa đúng | Viết action mới dùng transaction |
| Cancel phiếu | Chưa | Viết action mới, soft cancel |
| Merge phiếu | Chưa | Viết action mới |
| Export dữ liệu theo filter | Chưa | Viết endpoint export thật hoặc ẩn nếu chưa có |
| Preview reconcile | Chưa | Cần modal confirm mới |
| Link phiếu XNK sinh ra từ reconcile | Chưa | Cần mapping với `InventoryVoucher` |
| Audit log kiểm kho | Chưa | Cần model/log mới |
| Phân quyền action theo kho và vai trò | Chưa đủ | Cần backend check riêng cho audit |

## Lỗi/điểm sai hiện tại phát hiện được

| Vấn đề | Nguyên nhân |
| ------ | ---------- |
| Tạo phiếu kiểm kho làm đổi tồn kho ngay | `warehouse.routes.ts` đang gọi `moveProductQty` ngay trong `POST /checks` |
| `creator` bị hardcode ở frontend | `WarehouseAuditCreatePage.tsx` gửi `creator: 'LÊ SỸ BÁCH'` |
| Dòng item dùng `transferring = 0` | Frontend tự set cứng, không lấy từ transfer thật |
| Tên kho/sản phẩm trong audit không ổn định lịch sử | Model hiện không snapshot đủ trường |
| Tab list dùng CRUD generic nên có action placeholder/hard delete | `DataModulePage` không phù hợp nghiệp vụ kiểm kho |
| Export chỉ là CSV local của dữ liệu đang có | Không qua API, không đúng filter backend thực |
| Search/filter chưa theo nghiệp vụ audit | Chỉ có `q` generic |
| Không có empty/error/loading chuyên biệt cho từng action nghiệp vụ | Chỉ có generic list state |
| E2E cũ đang validate sai nghiệp vụ | `warehouse-audit.spec.ts` đang expect tồn kho đổi ngay sau khi tạo |

## Rủi ro khi refactor

| Rủi ro | Cách tránh |
| ------ | ---------- |
| Làm hỏng luồng xuất/nhập/chuyển kho đang có | Tách route/model audit riêng, chỉ tái sử dụng service tạo voucher và stock log cần thiết |
| Làm mất scope kho của EMPLOYEE | Giữ `getAssignedWarehouseIds` và check warehouse ở backend trước mọi action |
| Dùng CRUD generic tiếp tục gây sai nghiệp vụ | Thay page audit sang UI riêng, không tái dùng generic row actions cho audit |
| Reconcile tạo trùng bill khi double click | Dùng transaction + kiểm tra `linkedInventoryBillId(s)` + status trước commit |
| Snapshot cũ bị reconcile khi tồn đã biến động | Dùng `ProductLog` sau `createdAt/submittedAt` để chặn reconcile nếu có biến động |
| Phải sửa quá nhiều chỗ cùng lúc | Chia phase: map -> backend API/model -> frontend UI -> test |
