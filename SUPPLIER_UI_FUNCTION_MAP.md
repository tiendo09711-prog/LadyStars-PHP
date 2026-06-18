# SUPPLIER UI Function Map

## Route

- Path: `/vendors`
- Route declaration: `client/src/main.tsx`
- Main component: `client/src/modules/vendor/VendorPage.tsx`
- Current shared components: `client/src/core/components/TabbedModulePage.tsx`, `client/src/core/components/DataModulePage.tsx`
- Layout/Auth/Permission: route nằm trong `AppLayout`; API `/api/vendors/*` và `/api/products/*` đều đi qua `requireAuth` ở `server/src/app.ts`. Không có permission riêng trong `VendorPage`.

## Tổng quan trang hiện tại

- Trang hiện tại dùng `TabbedModulePage` và dựng 5 tab: nhà cung cấp, nhóm NCC, nhập hàng, trả hàng nhập, chuyển kho.
- Yêu cầu mới chỉ giữ 2 tab:
  - `Nhà cung cấp`
  - `Sản phẩm nhà cung cấp`
- UI hiện tại là layout CRUD dùng chung gồm heading, filter bên trái, table, modal form và menu công cụ.
- Refactor phải làm riêng trong module vendor để không ảnh hưởng các route khác đang dùng `TabbedModulePage`/`DataModulePage`.

## API đang dùng và API liên quan sẵn có

| Chức năng | Method | Endpoint | File gọi/khai báo | Handler hiện tại | State liên quan | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| Danh sách nhà cung cấp | GET | `/vendors/vendors` | `DataModulePage.tsx`; `vendor.routes.ts` | `load` | `items`, `loading`, `error` | Response `{ items, total, page, limit }` |
| Thêm nhà cung cấp | POST | `/vendors/vendors` | `DataModulePage.tsx`; CRUD route factory | `submit` | `form`, `showModal`, `error` | Giữ nguyên payload theo form hiện tại |
| Sửa nhà cung cấp | PATCH | `/vendors/vendors/:id` | `DataModulePage.tsx`; CRUD route factory | `submit` | `editingId`, `form`, `showModal` | Giữ nguyên |
| Xóa nhà cung cấp | DELETE | `/vendors/vendors/:id` | `DataModulePage.tsx`; CRUD route factory | `remove` | `items`, `error` | Có confirm |
| Danh sách sản phẩm | GET | `/products/products` | API sản phẩm hiện hữu; `product.routes.ts` | Chưa được `VendorPage` gọi | Chưa có trong trang vendor | Có các field `supplierName`, `code`, `name`, `barcode`; có thể dùng cho tab sản phẩm NCC |
| Thêm sản phẩm | POST | `/products/products` | API sản phẩm hiện hữu | Chưa được `VendorPage` gọi | Chưa có trong trang vendor | Endpoint hiện hữu, không phải API “supplier product” riêng |
| Sửa sản phẩm | PATCH | `/products/products/:id` | API sản phẩm hiện hữu | Chưa được `VendorPage` gọi | Chưa có trong trang vendor | Có thể cập nhật `supplierName` cùng các field sản phẩm hiện hữu |
| Xóa sản phẩm | DELETE | `/products/products/:id` | API sản phẩm hiện hữu | Chưa được `VendorPage` gọi | Chưa có trong trang vendor | Xóa product thật; cần giữ confirm rõ ràng |
| Import sản phẩm chuẩn hệ thống | POST | `/products/products/import` | `product.routes.ts` | Không có trong `VendorPage` | N/A | Yêu cầu file sản phẩm + kho; không tương thích file mapping supplier-product được cung cấp |

## State quan trọng hiện tại

| State | File | Mục đích | Update ở đâu |
| --- | --- | --- | --- |
| `activeKey` | `TabbedModulePage.tsx` | Tab hiện tại | Click tab |
| `items` | `DataModulePage.tsx` | Dữ liệu bảng | `load` |
| `loading` | `DataModulePage.tsx` | Loading state | `load` |
| `error` | `DataModulePage.tsx` | Lỗi load/save/delete/action | Các handler API |
| `search` | `DataModulePage.tsx` | Search client-side | Input tìm kiếm |
| `quickFilter` | `DataModulePage.tsx` | Lọc nhanh client-side | Button filter |
| `selectedIds` | `DataModulePage.tsx` | Checkbox chọn dòng | Checkbox dòng/chọn tất cả |
| `showModal` | `DataModulePage.tsx` | Modal thêm/sửa | `openCreate`, `openEdit`, submit/close |
| `editingId` | `DataModulePage.tsx` | Phân biệt thêm/sửa | `openCreate`, `openEdit` |
| `form` | `DataModulePage.tsx` | Dữ liệu form | Input/select/textarea |
| `showToolsDropdown` | `DataModulePage.tsx` | Menu công cụ | Click button/close ngoài |
| `showPrimaryDropdown` | `DataModulePage.tsx` | Menu cạnh nút thêm mới | Click split button |
| `rowActionOpen` | `DataModulePage.tsx` | Menu thao tác từng dòng | Click action dòng |

## Filter/Search/Sort/Pagination hiện tại

| UI filter | Field/API | State | Handler | Ghi chú |
| --- | --- | --- | --- | --- |
| Search chung | Dò tất cả `fields` ở client | `search` | `setSearch` | Không gọi API khi gõ |
| Trạng thái NCC | So sánh mọi value trong item | `quickFilter` | `setQuickFilter` | `active` / `inactive` |
| Sort | Chưa có UI | N/A | N/A | CRUD API hỗ trợ `sort`, `order` nhưng trang chưa dùng |
| Pagination | Chưa có UI/state | N/A | N/A | API hỗ trợ `page`, `limit`; hiện tại GET mặc định tối đa 1000 |

## Button/Action hiện tại

| UI cũ | Vị trí | Chức năng | Handler hiện tại | API/Route | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Thêm nhà cung cấp | Header | Mở modal tạo | `runPrimaryCreate` -> `openCreate` | POST khi submit | Label hiện tại “Thêm nhà cung cấp” |
| Công cụ | Header | Mở dropdown | inline state toggle | Không | Chứa làm mới/xuất CSV/nhập placeholder |
| Làm mới | Dropdown công cụ | Reload | `load` | GET endpoint tab | Giữ |
| Xuất CSV | Dropdown công cụ | Xuất dữ liệu đang lọc | `exportCsv` | Không | Xuất client-side |
| Nhập dữ liệu | Dropdown công cụ | Alert hướng dẫn | inline alert | Không | Chưa import thật |
| Checkbox tất cả | Header table | Chọn tất cả dòng đã lọc | `handleSelectAll` | Không | Giữ |
| Checkbox dòng | Mỗi dòng | Chọn dòng | `handleSelectRow` | Không | Giữ |
| Sửa | Menu dòng | Mở modal edit | `openEdit` | PATCH khi submit | Giữ |
| Xóa | Menu dòng | Confirm rồi xóa | `remove` | DELETE | Giữ |
| Lưu | Modal | Tạo/cập nhật | `submit` | POST/PATCH | Giữ validation required |

## Table/List Columns hiện tại - Nhà cung cấp

| Cột | Field dữ liệu | Sort | Click | Action | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Checkbox | `_id` | Không | Có | Chọn dòng | Giữ |
| Mã | `code` | Chưa có | Không | Không | Giữ |
| Tên | `name` | Chưa có | Không | Không | Giữ |
| Loại | `type` | Chưa có | Không | Không | `person`/`company` |
| Điện thoại | `phone` | Chưa có | Không | Không | Giữ |
| Người tạo | `userCreatedId.name` | Chưa có | Không | Không | API populate |
| Ghi chú | `note` | Chưa có | Không | Không | Giữ |
| Thao tác | `_id` | Không | Có | Sửa/Xóa | Giữ |

## Table/List Columns theo mẫu - Sản phẩm nhà cung cấp

| Cột mẫu | Field hiện hữu có thể dùng | Sort | Click | Action | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Checkbox | `_id` | Không | Có | Chọn dòng | Có thể giữ bằng state client |
| Nhà cung cấp | `supplierName` | API hỗ trợ nếu truyền query | Không | Không | Field có sẵn trong Product |
| Mã SP | `code` | API hỗ trợ `sort=code` | Không | Không | Field có sẵn |
| Mã vạch | `barcode` | API hỗ trợ `sort=barcode` | Không | Không | Field có sẵn |
| Tên SP | `name` | API hỗ trợ `sort=name` | Không | Không | Field có sẵn |
| Lô hàng | Chưa có field xác định trên Product | Không | Không | Không | Không hardcode |
| Mã NCC | Chưa có field xác định trên Product | Không | Không | Không | Không hardcode |
| Mã sản phẩm NCC | Chưa có field xác định trên Product | Không | Không | Không | Không hardcode |
| Thao tác | `_id` | Không | Có | Sửa/Xóa | Dùng PATCH/DELETE product hiện hữu |

## Modal/Drawer/Popup hiện tại

| Tên | Mở từ đâu | State điều khiển | Chức năng | API |
| --- | --- | --- | --- | --- |
| Thêm/Sửa NCC | Primary button/menu dòng | `showModal`, `editingId`, `form` | CRUD NCC | POST/PATCH `/vendors/vendors` |
| Import supplier product | Chưa có | Chưa có | Mẫu yêu cầu chọn file và tải file mẫu | Chưa có API tương thích |
| Export | Hiện chỉ tải CSV trực tiếp | N/A | Mẫu yêu cầu popup chọn cột/tên file | Không cần API nếu xuất client-side |

## Pagination

| State page | State page size | Handler | API |
| --- | --- | --- | --- |
| Chưa có | Chưa có | Chưa có | CRUD list hỗ trợ `page`, `limit` |

## Chức năng trong mẫu nhưng code hiện tại chưa có

| Chức năng mẫu | Có logic/API cũ không | Cách xử lý an toàn |
| --- | --- | --- |
| Chỉ còn 2 tab | Có state tab dùng chung | Dựng UI riêng cho route `/vendors`, bỏ 3 tab sai khỏi trang nhưng không xóa API/backend |
| Tab sản phẩm nhà cung cấp | Không có model/API supplier-product riêng; có Product với `supplierName` | Hiển thị dữ liệu thật từ `/products/products`; ghi rõ đây là projection từ Product |
| Import file mapping supplier-product | Không có endpoint import riêng; Product có PATCH hiện hữu | Đã triển khai đọc Excel ở client và PATCH `supplierName` cho product khớp chính xác theo mã/mã vạch/tên và NCC khớp tên/SĐT |
| Tải file Excel mẫu | Có file tĩnh do user cung cấp nhưng chưa nằm trong public app | Chưa nối tải file trong UI nếu chưa có asset public phù hợp |
| Export popup chọn cột/tên file | Có export CSV client-side nhưng chưa có popup | Có thể triển khai client-side bằng logic hiện hữu, không cần backend |
| Pagination đúng mẫu | API hỗ trợ, UI chưa có | Có thể thêm state `page/pageSize` và gọi GET với params |
| Filter tách ID/NCC/ngày/SĐT/người tạo/loại/trạng thái | API CRUD chỉ exact filter; search text có `q` | Chỉ nối field có thật; không giả lập field/API |
| Filter sản phẩm: ID/NCC/Lặp/SP cha/Sản phẩm | Product có một phần field; chưa có logic “Lặp” | Chỉ dùng field hiện hữu; đánh dấu phần chưa có |
| Bulk “Xóa các dòng đã chọn” | Có selection state, chưa có bulk-delete endpoint | Có thể gọi tuần tự DELETE endpoint cũ sau confirm; không tạo API mới |
| Row dropdown đúng mẫu | Có logic menu dòng | Đổi presentation, giữ handler |
| Form “Thêm mới 1 sản phẩm” theo HTML mẫu | Form hiện tại là NCC; Product có API CRUD | Cần map chính xác field Product hiện hữu, không thêm field backend |
| Import 288 dòng Excel vào DB | Không có import API riêng | Đã đối soát và cập nhật 287 dòng có mã sản phẩm khớp; 1 dòng thiếu mã và không tìm thấy sản phẩm theo tên nên không tạo mới |

## Rủi ro khi refactor

| Rủi ro | Cách tránh |
| --- | --- |
| Sửa component dùng chung làm vỡ route khác | Tạo UI riêng trong module vendor |
| Mất CRUD NCC hiện tại | Giữ nguyên endpoint, payload, confirm, loading/error/empty |
| Product tab hiển thị sai bản chất dữ liệu | Chỉ dùng field thật từ Product và ghi rõ field chưa có |
| Import nhầm 288 dòng thành product mới | Không dùng endpoint import product hiện tại vì file không đúng schema |
| Xóa bulk gây mất dữ liệu hàng loạt | Confirm rõ số dòng; gọi endpoint cũ tuần tự và báo lỗi |
| Pagination client/server lệch tổng | Dùng `total`, `page`, `limit` từ response API |

## Kết quả triển khai

- UI `/vendors` dùng riêng 2 tab, không sửa component dùng chung.
- CRUD nhà cung cấp tiếp tục dùng `/vendors/vendors`.
- Tab sản phẩm nhà cung cấp dùng `/products/products` và field `supplierName` hiện hữu.
- Import Excel trong UI dùng các API GET/PATCH hiện hữu, không thêm endpoint.
- Export Excel hỗ trợ chọn cột và chọn xuất tất cả trang theo bộ lọc hiện tại.
- Dữ liệu file `Nhanh.vn_Supplier_Product_Index_2026-06-18_143552.xlsx`: 287/288 dòng được cập nhật; dòng `Lược gỡ rối LADYSTARS` thiếu mã SP và không có product trùng tên trong DB nên được bỏ qua an toàn.
