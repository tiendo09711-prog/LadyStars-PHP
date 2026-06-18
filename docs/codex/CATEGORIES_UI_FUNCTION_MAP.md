# CATEGORIES UI Function Map

## Route

- Path: `/products/categories`
- Main component: `client/src/modules/product/CategoriesPage.tsx`
- Related files:
  - `client/src/modules/product/CategoriesPage.tsx`
  - `client/src/modules/product/components/CategoryList.tsx`
  - `client/src/modules/product/categories-page.css`
  - `client/src/core/api/product.api.ts`
  - `client/src/core/components/Pagination.tsx`
  - `client/src/modules/product/components/ExportExcelModal.tsx`
- Layout/Auth/Permission: dùng `AppLayout`, không thấy guard riêng cho route này

## Tổng quan trang

- Trang hiện có 2 trạng thái UI:
  - danh sách danh mục
  - form thêm mới / chỉnh sửa danh mục
- Khu vực chính ở màn danh sách:
  - top toolbar gọn
  - nút split `Thêm mới`
  - nút bulk `Thao tác`
  - khu tìm kiếm theo `q`
  - bảng danh mục + chọn nhiều dòng
  - dropdown thao tác từng dòng
  - export modal
  - import modal Excel
  - modal xem sản phẩm thuộc danh mục
- Chức năng chính:
  - tải danh sách danh mục
  - tìm kiếm danh mục
  - phân trang danh mục
  - thêm mới danh mục bằng API có sẵn
  - chỉnh sửa danh mục bằng API có sẵn
  - xóa 1 danh mục hoặc nhiều danh mục
  - đổi trạng thái nhiều danh mục
  - import Excel theo file mẫu
  - xuất Excel
  - mở modal xem sản phẩm theo danh mục

## API đang dùng

| Chức năng | Method | Endpoint | File gọi API | Handler | State liên quan | Ghi chú |
| --------- | ------ | -------- | ------------ | ------- | --------------- | ------- |
| Load danh mục | `GET` | `/products/categories` | `client/src/core/api/product.api.ts` | `load` | `items`, `total`, `loading` | dùng cho load ban đầu, search, pagination |
| Search/pagination danh mục | `GET` | `/products/categories` | `client/src/core/api/product.api.ts` | `load`, `handleSearch`, `Pagination.onPageChange` | `search`, `page` | params: `page`, `limit`, `q` |
| Tạo danh mục | `POST` | `/products/categories` | `client/src/core/api/product.api.ts` | `CategoryEditorPanel.handleSave`, `handleImportSubmit` | `editorMode`, `editingCategory`, `importMode` | giữ endpoint CRUD sẵn có |
| Cập nhật danh mục | `PATCH` | `/products/categories/:id` | `client/src/core/api/product.api.ts` | `CategoryEditorPanel.handleSave`, `handleBulkStatus`, `handleImportSubmit` | `selectedIds`, `editorMode`, `editingCategory`, `importMode` | chỉ cập nhật field backend đang có |
| Xóa danh mục | `DELETE` | `/products/categories/:id` | `client/src/core/api/product.api.ts` | `handleDeleteCategory`, `handleDeleteSelected` | `selectedIds` | xóa 1 dòng hoặc xóa nhiều |
| Export Excel danh mục | `GET` nhiều lần | `/products/categories` | `client/src/core/api/product.api.ts` | `handleExcelExport` | `exportLoading` | lấy trang hiện tại hoặc toàn bộ danh sách rồi export client-side |
| Load sản phẩm trong modal | `GET` | `/products/inventories` | `client/src/core/api/product.api.ts` | `CategoryProductsModal.load` | `items`, `total`, `loading` trong modal | params: `page`, `limit`, `q`, `categoryId` |
| Search/pagination sản phẩm trong modal | `GET` | `/products/inventories` | `client/src/core/api/product.api.ts` | `CategoryProductsModal.handleSearch`, `Pagination.onPageChange` | `search`, `page` trong modal | chỉ dùng trong modal xem sản phẩm |

## State quan trọng

| State | File | Mục đích | Update ở đâu |
| ----- | ---- | -------- | ------------ |
| `items` | `CategoryList.tsx` | dữ liệu bảng danh mục | `load` |
| `loading` | `CategoryList.tsx` | trạng thái tải bảng danh mục | `load` |
| `search` | `CategoryList.tsx` | từ khóa tìm kiếm danh mục | input search ngoài trang |
| `page` | `CategoryList.tsx` | trang hiện tại danh mục | `handleSearch`, `Pagination` |
| `total` | `CategoryList.tsx` | tổng số bản ghi danh mục | `load` |
| `selectedIds` | `CategoryList.tsx` | các dòng đang tích chọn | checkbox header, checkbox dòng, sau khi reload trang |
| `showExportModal` | `CategoryList.tsx` | mở/đóng modal export | bulk action `Xuất dữ liệu`, `onClose` |
| `exportLoading` | `CategoryList.tsx` | trạng thái export | `handleExcelExport` |
| `openAddMenu` | `CategoryList.tsx` | mở dropdown của nút thêm mới | click split button |
| `openBulkMenu` | `CategoryList.tsx` | mở dropdown thao tác bulk | click nút `Thao tác` |
| `openBulkStatusMenu` | `CategoryList.tsx` | mở submenu đổi trạng thái | click item `Đổi trạng thái` |
| `openActionMenuId` | `CategoryList.tsx` | dropdown thao tác của dòng nào đang mở | click nút `Thao tác` từng dòng |
| `editorMode` | `CategoryList.tsx` | chuyển giữa list / create / edit | `openCreateEditor`, `openEditEditor`, `onCancel`, `onSaved` |
| `editingCategory` | `CategoryList.tsx` | bản ghi đang sửa | `openEditEditor`, `onCancel`, `onSaved` |
| `categoryOptions` | `CategoryList.tsx` | danh sách danh mục cha trong form | `loadCategoryOptions` |
| `loadingCategoryOptions` | `CategoryList.tsx` | trạng thái tải danh mục cha | `loadCategoryOptions` |
| `showImportModal` | `CategoryList.tsx` | mở/đóng modal import Excel | dropdown `Nhập từ excel`, `onClose` |
| `importMode` | `CategoryList.tsx` | chế độ import thêm mới/cập nhật | radio trong modal import |
| `importFile` | `CategoryList.tsx` | file Excel đang chọn | input file trong modal import |
| `importing` | `CategoryList.tsx` | trạng thái import | `handleImportSubmit` |
| `actionLoading` | `CategoryList.tsx` | trạng thái thao tác bulk | `handleBulkStatus`, `handleDeleteSelected` |
| `viewProductsCategory` | `CategoryList.tsx` | danh mục đang mở modal sản phẩm | click tên danh mục, số sản phẩm, `Xem sản phẩm` |
| `items` | `CategoryProductsModal` | dữ liệu bảng sản phẩm theo danh mục | `load` trong modal |
| `loading` | `CategoryProductsModal` | trạng thái tải modal | `load` trong modal |
| `search` | `CategoryProductsModal` | tìm kiếm sản phẩm trong modal | input search modal |
| `page` | `CategoryProductsModal` | trang hiện tại trong modal | `handleSearch`, `Pagination` |
| `total` | `CategoryProductsModal` | tổng sản phẩm trong modal | `load` trong modal |

## Filter/Search

| UI filter | Field gửi API | State | Handler | Ghi chú |
| --------- | ------------- | ----- | ------- | ------- |
| Ô `Tên danh mục, mã...` | `q` | `search` | `handleSearch` | submit form hoặc Enter |
| Ô `Tìm sản phẩm trong danh mục...` trong modal | `q` | `search` trong modal | `CategoryProductsModal.handleSearch` | gõ và Enter trong modal |

## Button/Action

| UI | Vị trí | Chức năng | Handler hiện tại | Có gọi API không | Modal/Route | Ghi chú |
| --- | ------ | --------- | ---------------- | ---------------- | ----------- | ------- |
| `Thêm mới` | top toolbar | mở form tạo mới danh mục | `openCreateEditor` | Có gián tiếp | chuyển sang editor | form lưu bằng `POST /products/categories` |
| caret của `Thêm mới` | top toolbar | mở dropdown thêm | `setOpenAddMenu` | Không | dropdown | hiện có item `Nhập từ excel` |
| `Nhập từ excel` | dropdown thêm | mở modal import | `setShowImportModal(true)` | Không trực tiếp | mở modal | giữ trong cùng route |
| `Thao tác` | top toolbar | mở dropdown thao tác bulk | `setOpenBulkMenu` | Không trực tiếp | dropdown | thao tác dựa trên `selectedIds` |
| `Xuất dữ liệu` | dropdown bulk | mở export modal | `setShowExportModal(true)` | Không trực tiếp | mở modal | nút export ngoài header đã bỏ |
| `Đổi trạng thái > Hoạt động/Ngừng` | dropdown bulk | đổi trạng thái các dòng đã chọn | `handleBulkStatus` | Có | không | dùng `PATCH /products/categories/:id` |
| `Xóa cache` | dropdown bulk | placeholder theo yêu cầu | `alert` | Không | không | hiện chưa làm logic |
| `Xóa các dòng đã chọn` | dropdown bulk | xóa nhiều danh mục | `handleDeleteSelected` | Có | confirm browser | dùng `DELETE /products/categories/:id` |
| submit search | khu filter phải | tìm kiếm danh mục | `handleSearch` | Có | không | giữ logic search cũ |
| `Làm mới` | top action phụ | tải lại danh sách | `load` | Có | không | giữ state tìm kiếm hiện tại |
| checkbox header | bảng | chọn toàn bộ dòng trong trang hiện tại | `handleToggleSelectPage` | Không | không | đồng bộ `selectedIds` |
| checkbox dòng | bảng | chọn từng dòng | `handleToggleSelected` | Không | không | phục vụ bulk action |
| tên danh mục | cột tên | mở modal sản phẩm của danh mục | `setViewProductsCategory(item)` | Có sau khi modal mở | mở modal | giữ logic cũ |
| số sản phẩm | cột số SP | mở modal sản phẩm của danh mục | `setViewProductsCategory(item)` | Có sau khi modal mở | mở modal | giữ logic cũ |
| nút `Thao tác` từng dòng | cột thao tác | mở dropdown thao tác dòng | `setOpenActionMenuId` | Không trực tiếp | dropdown | UI gọn hơn, logic cũ được nối đầy đủ |
| `Xem sản phẩm` | dropdown dòng | mở modal sản phẩm | `setViewProductsCategory(item)` | Có sau khi modal mở | mở modal | hoạt động bình thường |
| `Sửa` | dropdown dòng | mở form chỉnh sửa | `openEditEditor(item)` | Có gián tiếp | chuyển sang editor | lưu bằng `PATCH /products/categories/:id` |
| `Xóa` | dropdown dòng | xóa danh mục | `handleDeleteCategory(item)` | Có | confirm browser | xóa 1 dòng |
| nút `Lưu` trong editor | form thêm/sửa | lưu danh mục | `CategoryEditorPanel.handleSave` | Có | giữ trong route | create/edit đều chạy API thật |
| nút `Hủy` trong editor | form thêm/sửa | quay lại danh sách | `onCancel` | Không | giữ trong route | không đổi logic dữ liệu |
| `Tải file mẫu...` | modal import | tạo template Excel để user tải | `handleDownloadImportTemplate` | Không | không | template bám theo file mẫu đã cung cấp |
| `Lưu` trong import modal | modal import | import tạo mới/cập nhật từ Excel | `handleImportSubmit` | Có | không | dùng API CRUD sẵn có |
| nút đóng `X` | các modal | đóng modal | `onClose` | Không | đóng modal | click backdrop cũng đóng |
| `Đóng` | footer modal sản phẩm | đóng modal | `onClose` | Không | đóng modal | |
| phân trang ngoài bảng | footer | đổi trang danh mục | `setPage` | Có | không | qua `Pagination` |
| phân trang trong modal | footer modal | đổi trang sản phẩm | `setPage` trong modal | Có | không | qua `Pagination` |

## Table/List Columns

| Cột | Field dữ liệu | Sort | Click | Action | Ghi chú |
| --- | ------------- | ---- | ----- | ------ | ------- |
| checkbox | N/A | Không | Có | chọn | dùng cho bulk action |
| Mã danh mục | `code` | Không | Không | Không | hiển thị `-` nếu thiếu |
| Tên danh mục | `name` | Không | Có | mở modal | text clickable |
| Hoạt động | `isActive` | Không | Không | Không | badge trạng thái |
| Hiển thị | `isVisible` | Không | Không | Không | text Có/Không |
| Số sản phẩm | `productCount` | Không | Có | mở modal | số clickable |
| Ngày tạo | `createdAt` | Không | Không | Không | format `vi-VN` |
| Thao tác | N/A | Không | Có | dropdown | gồm `Xem sản phẩm`, `Sửa`, `Xóa` |

## Modal/Panel/Popup

| Tên | Mở từ đâu | State điều khiển | Chức năng | API |
| --- | --------- | ---------------- | --------- | --- |
| Export Excel Modal | bulk action `Xuất dữ liệu` | `showExportModal` | chọn phạm vi export, tên file, tên sheet, cột export | `GET /products/categories` khi export all |
| Import Excel Modal | dropdown `Nhập từ excel` | `showImportModal` | chọn file, chọn mode create/update, tải file mẫu, submit import | `GET/POST/PATCH /products/categories` |
| Category Products Modal | click tên danh mục, số sản phẩm, `Xem sản phẩm` | `viewProductsCategory` | xem sản phẩm thuộc danh mục, search trong modal, pagination trong modal | `GET /products/inventories` |
| Category Editor Panel | nút `Thêm mới` hoặc `Sửa` | `editorMode`, `editingCategory` | form create/edit danh mục | `POST/PATCH /products/categories` |
| Row action dropdown | nút `Thao tác` từng dòng | `openActionMenuId` | gom thao tác xem/sửa/xóa | Không trực tiếp |
| Bulk action dropdown | nút `Thao tác` top | `openBulkMenu`, `openBulkStatusMenu` | export, đổi trạng thái, xóa nhiều | Có tùy action |

## Pagination

| State page | State page size | Handler | API |
| ---------- | --------------- | ------- | --- |
| `page` ngoài bảng | `limit = 20` | `setPage` | `GET /products/categories` |
| `page` trong modal | `limit = 10` | `setPage` trong modal | `GET /products/inventories` |

## Logic import Excel

| Phần | Cách làm hiện tại |
| ---- | ----------------- |
| File mẫu tham chiếu | bám theo workbook mẫu user cung cấp |
| Sheet đọc dữ liệu | ưu tiên sheet thứ 2 hoặc tên `Danh mục sản phẩm` |
| Header đang dùng | `Mã danh mục`, `Danh mục cấp 1..4`, `Hoạt động`, `Hiển thị` |
| Chế độ tạo mới | bỏ qua dòng nếu tìm thấy danh mục trùng `code` hoặc `name` |
| Chế độ cập nhật | cập nhật theo `code`, fallback theo `name` |
| Quan hệ cha-con | suy ra từ cấp gần nhất phía trước trong cùng dòng |
| Field thực sự lưu | `name`, `code`, `parentId`, `isActive`, `isVisible` |

## Giữ nguyên chức năng cũ

| Chức năng cũ | Trạng thái sau refactor |
| ------------ | ----------------------- |
| tìm kiếm danh mục qua `q` | giữ nguyên |
| phân trang danh mục | giữ nguyên |
| export Excel dùng dữ liệu API hiện có | giữ nguyên |
| modal xem sản phẩm theo danh mục | giữ nguyên |
| tìm kiếm và phân trang trong modal sản phẩm | giữ nguyên |
| không thêm backend/API mới | giữ nguyên |

## Rủi ro khi refactor

| Rủi ro | Cách tránh |
| ------ | ---------- |
| backend category không có đầy đủ field như mock giao diện mẫu | chỉ lưu các field backend thật sự có hỗ trợ |
| import file Excel có thể sai sheet hoặc sai header | có validate sheet dữ liệu và bỏ qua dòng không hợp lệ |
| bulk action phụ thuộc checkbox của trang hiện tại | đã giới hạn rõ theo `selectedIds` đang tick trên bảng |
| sửa UI dropdown có thể làm hỏng thao tác cũ | đã giữ lại modal sản phẩm, export, search, pagination và test lại trên browser |
