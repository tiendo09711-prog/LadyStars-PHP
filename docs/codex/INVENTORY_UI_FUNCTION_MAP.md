# INVENTORY UI Function Map

## Route

- Path: `/products/inventory`
- Main component: `client/src/modules/product/InventoryPage.tsx`
- Related files:
  - `client/src/main.tsx`
  - `client/src/modules/product/components/InventoryList.tsx`
  - `client/src/core/api/product.api.ts`
  - `client/src/core/components/Pagination.tsx`
  - `client/src/modules/product/components/ExportExcelModal.tsx`
- Layout/Auth/Permission: dùng `AppLayout`, không thấy auth guard hoặc permission guard riêng cho route này

## Tổng quan trang

- Trang này dùng để xem tồn kho chi tiết theo sản phẩm và theo kho.
- Khu vực chính:
  - form tìm kiếm
  - lọc nhanh theo kho
  - bảng tồn kho
  - modal xuất Excel
  - pagination
- Chức năng chính:
  - tải danh sách tồn kho
  - tìm kiếm theo từ khóa
  - lọc theo kho
  - sắp xếp theo cột
  - phân trang
  - xuất Excel trang hiện tại hoặc toàn bộ danh sách theo bộ lọc hiện tại

## API đang dùng

| Chức năng | Method | Endpoint | File gọi API | Handler | State liên quan | Ghi chú |
| --------- | ------ | -------- | ------------ | ------- | --------------- | ------- |
| Load danh sách tồn kho | `GET` | `/products/inventories` | `client/src/core/api/product.api.ts` | `load` | `items`, `total`, `loading` | dùng cho load ban đầu, search, filter, sort, pagination |
| Search/filter/sort/pagination | `GET` | `/products/inventories` | `client/src/core/api/product.api.ts` | `load`, `handleSearch`, `handleSort`, `Pagination.onPageChange` | `search`, `filterWarehouse`, `sortField`, `sortOrder`, `page` | params: `page`, `limit`, `q`, `branchId`, `sort`, `order` |
| Export Excel | `GET` nhiều lần | `/products/inventories` | `client/src/core/api/product.api.ts` | `handleExcelExport` | `exportLoading` | lấy dữ liệu theo trang hiện tại hoặc toàn bộ rồi export bằng client |

## State quan trọng

| State | File | Mục đích | Update ở đâu |
| ----- | ---- | -------- | ------------ |
| `items` | `InventoryList.tsx` | dữ liệu bảng tồn kho | `load` |
| `loading` | `InventoryList.tsx` | trạng thái tải danh sách | `load` |
| `search` | `InventoryList.tsx` | từ khóa tìm kiếm | `input onChange` |
| `filterWarehouse` | `InventoryList.tsx` | lọc nhanh theo kho | nút `Tất cả`, `Kho Hà Nội`, `Kho HCM` |
| `sortField` | `InventoryList.tsx` | cột sắp xếp | `handleSort` |
| `sortOrder` | `InventoryList.tsx` | chiều sắp xếp | `handleSort` |
| `page` | `InventoryList.tsx` | trang hiện tại | `handleSearch`, filter button, `handleSort`, `Pagination` |
| `total` | `InventoryList.tsx` | tổng số bản ghi | `load` |
| `showExportModal` | `InventoryList.tsx` | mở/đóng modal export | nút `Xuất Excel`, `onClose` |
| `exportLoading` | `InventoryList.tsx` | trạng thái export | `handleExcelExport` |
## Filter/Search

| UI filter | Field gửi API | State | Handler | Ghi chú |
| --------- | ------------- | ----- | ------- | ------- |
| Ô tìm kiếm `Tên SP, mã SP...` | `q` | `search` | `handleSearch` | submit form hoặc Enter |
| Nút `Tất cả` | bỏ `branchId` | `filterWarehouse` | `setFilterWarehouse('')` | reset page về 1 |
| Nút `Kho Hà Nội` | `branchId` | `filterWarehouse` | `setFilterWarehouse('hanoi')` | logic cũ đang dùng chuỗi `hanoi` |
| Nút `Kho HCM` | `branchId` | `filterWarehouse` | `setFilterWarehouse('hcm')` | logic cũ đang dùng chuỗi `hcm` |

## Button/Action

| UI cũ | Vị trí | Chức năng | Handler hiện tại | Có gọi API không | Modal/Route | Ghi chú |
| ----- | ------ | --------- | ---------------- | ---------------- | ----------- | ------- |
| `Tất cả` | filter panel | lọc tất cả kho | inline `setFilterWarehouse('')` | Có, qua `load` effect | không | reset page 1 |
| `Kho Hà Nội` | filter panel | lọc tồn kho Hà Nội | inline `setFilterWarehouse('hanoi')` | Có, qua `load` effect | không | reset page 1 |
| `Kho HCM` | filter panel | lọc tồn kho HCM | inline `setFilterWarehouse('hcm')` | Có, qua `load` effect | không | reset page 1 |
| submit search | form filter | tìm kiếm | `handleSearch` | Có | không | gọi `load` trực tiếp |
| `Làm mới` | header card | tải lại danh sách | `load` | Có | không | giữ state hiện tại |
| `Xuất Excel` | header card | mở modal export | `setShowExportModal(true)` | Không trực tiếp | mở modal | export thực hiện trong modal |
| sort header | table header | đổi cột/chiều sort | `handleSort` | Có, qua `load` effect | không | reset page 1 |
| nút phân trang | footer | đổi trang | `setPage` | Có, qua `load` effect | không | chỉ có previous/next |

## Table/List Columns

| Cột | Field dữ liệu | Sort | Click | Action | Ghi chú |
| --- | ------------- | ---- | ----- | ------ | ------- |
| Mã SP | `code` | Có | Không | Không | hiển thị đậm |
| Tên sản phẩm | `name` | Có | Không | Không | truncate bằng CSS inline |
| Giá nhập (Vốn) | `cost` | Có | Không | Không | format tiền |
| Giá bán | `price` | Có | Không | Không | format tiền |
| Kho Hà Nội | `stockHanoi` | Có | Không | Không | chỉ hiển thị read-only |
| Kho HCM | `stockHCM` | Có | Không | Không | chỉ hiển thị read-only |
| Tổng tồn | `totalStock` | Có | Không | Không | chỉ hiển thị read-only |

## Modal/Drawer/Popup

| Tên | Mở từ đâu | State điều khiển | Chức năng | API |
| --- | --------- | ---------------- | --------- | --- |
| Export Excel Modal | nút `Xuất Excel` | `showExportModal` | chọn phạm vi export, tên file, tên sheet, cột export | dùng lại `GET /products/inventories` khi export all |

## Pagination

| State page | State page size | Handler | API |
| ---------- | --------------- | ------- | --- |
| `page` | `limit = 20` | `setPage` qua `Pagination` | `GET /products/inventories` |

## Chức năng trong mẫu nhưng code hiện tại chưa có

| Chức năng mẫu | Có logic/API cũ không | Cách xử lý |
| ------------- | --------------------- | ---------- |
| filter theo ID riêng | Không thấy logic/API riêng | không tự thêm API; chỉ giữ search hiện có |
| filter theo cửa hàng bằng select | Chỉ có lọc nhanh kho `hanoi/hcm` | dùng logic lọc kho cũ, đổi cách trình bày UI |
| filter theo thương hiệu | Không thấy state/API trực tiếp trong trang này | không tự thêm |
| filter theo nhà cung cấp | Không thấy state/API trực tiếp trong trang này | không tự thêm |
| dropdown thao tác hàng loạt | Không thấy selected rows/bulk handler | không tự thêm logic bulk |
| checkbox chọn dòng/chọn tất cả | Không thấy state chọn dòng | không tự thêm nếu không có logic cũ |
| first/last pagination | Không có handler riêng | giữ pagination cũ nếu không cần thay đổi logic |

## Rủi ro khi refactor

| Rủi ro | Cách tránh |
| ------ | ---------- |
| đổi UI làm mất handler search/filter/sort | giữ nguyên handler/state hiện tại, chỉ đổi layout |
| thay đổi text/accessibility làm gãy e2e hiện có | giữ placeholder, tên nút chính và modal title quan trọng |
| sửa markup làm lệch loading/empty state | giữ nguyên các nhánh render loading và empty |
| thêm filter mới theo mẫu nhưng không có API | không tự thêm logic/API, chỉ dùng chức năng sẵn có |
| thay đổi bố cục làm gãy kiểm tra filter/export/pagination | giữ nguyên text nút chính, handler hiện tại và modal export |
