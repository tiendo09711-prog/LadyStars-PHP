# WAREHOUSE TRANSACTIONS UI Function Map

## Route

- Path: `/warehouse/transactions`
- Main component: `client/src/modules/warehouse/WarehouseTransactionPage.tsx`
- Related files:
  - `client/src/main.tsx`
  - `client/src/modules/warehouse/warehouseRecords.css`
  - `client/src/modules/warehouse/VoucherImportPage.tsx`
  - `client/src/modules/warehouse/VoucherExportPage.tsx`
  - `client/src/modules/warehouse/VoucherExcelImportPage.tsx`
  - `client/src/modules/warehouse/WarehouseTransferPage.tsx`
  - `client/src/modules/warehouse/WarehouseTransferCreatePage.tsx`
  - `server/src/modules/warehouse/warehouse.routes.ts`
  - `server/src/modules/warehouse/warehouse.models.ts`
  - `server/src/modules/product/product.routes.ts`
  - `server/src/modules/product/product.service.ts`
  - `server/src/modules/product/product.models.ts`
- Layout/Auth/Permission:
  - Route nằm trong `AppLayout`.
  - HTTP client tự gắn Bearer token từ `localStorage`.
  - Không có guard riêng ở component trang.

## Tổng quan trang

- Trang dùng để xem lịch sử tăng/giảm tồn kho theo hai cấp dữ liệu:
  - Phiếu/chứng từ: một dòng cho một nghiệp vụ.
  - Sản phẩm: một dòng cho một sản phẩm trong một nghiệp vụ.
- Khu vực/tab chính:
  - `Phiếu xuất nhập kho`
  - `Sản phẩm xuất nhập kho`
- Chức năng chính:
  - Lọc theo kho, mã phiếu, loại, kiểu và ngày.
  - Tab sản phẩm lọc thêm theo tên/mã/mã vạch.
  - Chọn dòng, chọn tất cả trên trang.
  - Tạo phiếu nhập, phiếu xuất, chuyển kho qua route thật.
  - Xuất dữ liệu đang hiển thị/đã chọn.
  - Xem và in chi tiết chứng từ.
  - Xóa phiếu thủ công khi backend xác nhận có thể rollback tồn kho an toàn.
  - Tùy chỉnh cột hiển thị ở frontend.

## Route/module liên quan đã khảo sát

| Route | Component | Nguồn/API chính | Quan hệ với lịch sử kho |
| --- | --- | --- | --- |
| `/products` | `ProductsPage` / `ProductMainPage` | `/products/products` và các API sản phẩm | Tạo sản phẩm có thể tạo tồn đầu kỳ và lịch sử nhập |
| `/products/inventory` | `InventoryPage` / `InventoryList` | `GET /products/inventories` | Đọc tồn thật từ `ProductBranchStock` |
| `/warehouse/transfers` | `WarehouseTransferPage` | `/warehouse/transfers` | Chuyển kho giảm kho nguồn, tăng kho đích |
| `/sales-channels/store/retail` | `RetailInvoicePage` | `/products/sales` | Bán lẻ hoàn tất làm giảm tồn |
| `/sales-channels/store/wholesale` | `WholesaleInvoicePage` | `/products/sales?code=BHS` | Bán sỉ hoàn tất làm giảm tồn |
| `/orders/manage` | `OrdersManagePage` | `/orders/manage` | Đơn hàng hiện không trực tiếp ghi stock movement |
| `/sales-channels/store/refund` | `RefundInvoicePage` | `/products/refunds` | Trả hàng hoàn tất làm tăng tồn |

## Model/nguồn dữ liệu hiện có

| Nguồn | Cấp phiếu | Cấp item | Tác động tồn | Ghi chú |
| --- | --- | --- | --- | --- |
| `InventoryVoucher` | Có | Ghép `InventoryProduct.voucherId` | Qua `moveProductQty` | Nhập/xuất thủ công, nhập từ Excel, nhập khi tạo sản phẩm |
| `InventoryProduct` | Qua `voucherId` | Có | Qua `moveProductQty` | Có nhập/xuất, giá, barcode, IMEI, lô |
| `WarehouseTransfer` | Có | `lines[]` trong document | Trừ nguồn, cộng đích | Có `fromWarehouse`, `toWarehouse` |
| `SalePayment` | Có | `items[]` | Hoàn tất trừ tồn | Mã `BHS-` dùng cho bán sỉ; các mã bán hàng còn lại là bán lẻ |
| `ProductRefund` | Có | `items[]` | Hoàn tất cộng tồn | Liên kết `paymentId` |
| `StockAdjustment` | Có | `items[]` | Hoàn tất cộng/trừ chênh lệch | Có `quantityDifference` |
| `ProductLog` | Nhật ký movement | Một movement/sản phẩm | Ghi sau mỗi `moveProductQty` | Dùng nhận diện rollback/hủy khi cần |
| `ProductBranchStock` | Không | Số dư theo sản phẩm/kho | Nguồn tồn hiện tại | Không dùng làm lịch sử chứng từ |

## API đang dùng

| Chức năng | Method | Endpoint | File gọi API | Handler | State liên quan | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| Danh sách phiếu hiện tại | GET | `/warehouse/vouchers` | `WarehouseTransactionPage.tsx` qua `DataModulePage` | `load` | `items`, `total`, `page` | Chỉ đọc `InventoryVoucher`, chưa gom nghiệp vụ khác |
| Danh sách item hiện tại | GET | `/warehouse/products` | `WarehouseTransactionPage.tsx` qua `DataModulePage` | `load` | `items`, `total`, `page` | Chỉ đọc `InventoryProduct` |
| Tạo nhập kho | POST | `/warehouse/vouchers/import` | `VoucherImportPage.tsx` | submit form | form/loading/success/error | Tăng `ProductBranchStock`, tạo voucher và item |
| Tạo xuất kho | POST | `/warehouse/vouchers/export` | `VoucherExportPage.tsx` | submit form | form/loading/success/error | Kiểm tra tồn, giảm tồn, tạo voucher và item |
| Import Excel XNK | POST | `/warehouse/vouchers/import-excel` | `VoucherExcelImportPage.tsx` | upload | file/loading/success/error | Tạo dữ liệu thật |
| Tạo chuyển kho | POST | `/warehouse/transfers` | `WarehouseTransferCreatePage.tsx` | `handleSubmit` | kho nguồn/đích, lines | Trừ nguồn và cộng đích |
| Danh sách tồn | GET | `/products/inventories` | `InventoryList.tsx`, các form kho | `load` | items/total/filter/page | Đọc `ProductBranchStock` |
| Tạo bán lẻ/bán sỉ | POST | `/products/sales` | trang tạo hóa đơn | submit | form/items | Tạo draft |
| Hoàn tất bán | POST | `/products/sales/:id/complete` | trang tạo hóa đơn | submit | success/error | `completeSalePayment` trừ tồn |
| Hủy bán | POST | `/products/sales/:id/cancel` | trang sửa hóa đơn | submit | success/error | Hoàn tồn và ghi `SalePaymentCancel` |
| Tạo trả hàng | POST | `/products/refunds` | `RefundInvoiceCreatePage.tsx` | submit | form/items | Tạo draft |
| Hoàn tất trả hàng | POST | `/products/refunds/:id/complete` | `RefundInvoiceCreatePage.tsx` | submit | success/error | `completeProductRefund` cộng tồn |
| Hoàn tất điều chỉnh | POST | `/products/stock-adjustments/:id/complete` | module sản phẩm | handler | adjustment | Cộng/trừ chênh lệch |

## API cần bổ sung trong namespace hiện có

| Chức năng | Method | Endpoint | Nguồn |
| --- | --- | --- | --- |
| Metadata filter | GET | `/warehouse/transactions/meta` | `Branch` + loại/kiểu nghiệp vụ backend hỗ trợ |
| Danh sách phiếu hợp nhất | GET | `/warehouse/transactions/bills` | Voucher + transfer + sale + refund + adjustment/rollback |
| Danh sách item hợp nhất | GET | `/warehouse/transactions/items` | Item của từng nguồn nghiệp vụ |
| Chi tiết phiếu | GET | `/warehouse/transactions/bills/:source/:id` | Nguồn gốc thật của dòng |
| Xóa phiếu thủ công an toàn | DELETE | `/warehouse/transactions/bills/:source/:id` | Chỉ cho nguồn được backend đánh dấu `canDelete` |
| Xóa hàng loạt an toàn | POST | `/warehouse/transactions/bills/bulk-delete` | Kiểm tra từng phiếu, rollback từng nghiệp vụ được phép |

## State quan trọng

| State | File | Mục đích | Update ở đâu |
| --- | --- | --- | --- |
| `activeTab` | `WarehouseTransactionPage.tsx` | Chọn dataset bills/items | Click tab |
| `draftFilters` | `WarehouseTransactionPage.tsx` | Giá trị người dùng đang nhập | Input/select |
| `appliedFilters` | `WarehouseTransactionPage.tsx` | Query đã bấm Lọc | Submit filter |
| `items` | `WarehouseTransactionPage.tsx` | Dữ liệu trang hiện tại | API bills/items |
| `meta` | `WarehouseTransactionPage.tsx` | Kho, loại, kiểu | API metadata |
| `page`, `total`, `limit` | `WarehouseTransactionPage.tsx` | Phân trang thật | API response/Pagination |
| `selectedIds` | `WarehouseTransactionPage.tsx` | Chọn dòng trên trang | Checkbox |
| `openMenu` | `WarehouseTransactionPage.tsx` | Dropdown đang mở | Click/click outside |
| `detail` | `WarehouseTransactionPage.tsx` | Dữ liệu modal chi tiết | Click ID/xem chi tiết |
| `visibleColumns` | `WarehouseTransactionPage.tsx` | Tùy chỉnh cột theo tab | Modal cột/localStorage |
| `confirmDelete` | `WarehouseTransactionPage.tsx` | Phiếu chờ xác nhận xóa | Menu dòng/bulk action |
| `loading`, `error`, `notice` | `WarehouseTransactionPage.tsx` | Trạng thái request | Mọi handler API |

## Filter/Search

| UI filter | Field gửi API | State | Handler | Ghi chú |
| --- | --- | --- | --- | --- |
| Kho hàng | `warehouseId` | `draftFilters.warehouseId` | `applyFilters` | Kho lấy từ `/system/branches` qua metadata |
| ID | `billId` | `draftFilters.billId` | `applyFilters` | Tìm mã chứng từ |
| Loại | `type` | `draftFilters.type` | `applyFilters` | IMPORT/EXPORT/TRANSFER/ADJUSTMENT |
| Kiểu | `kind` | `draftFilters.kind` | `applyFilters` | Nhập NCC, bán lẻ, bán sỉ, trả hàng, chuyển kho... |
| Từ ngày | `fromDate` | `draftFilters.fromDate` | `applyFilters` | Reset page về 1 |
| Đến ngày | `toDate` | `draftFilters.toDate` | `applyFilters` | Bao gồm hết ngày |
| Sản phẩm | `productKeyword` | `draftFilters.productKeyword` | `applyFilters` | Chỉ tab sản phẩm; tên/mã/barcode |

## Button/Action

| UI cũ | Vị trí | Chức năng | Handler hiện tại | Có gọi API không | Modal/Route | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| Tạo phiếu XNK | Header | Mở menu nhập/xuất/import | `TransactionActionDropdown` | Không | Route | Giữ route thật, đổi nhãn theo mẫu |
| Thao tác SP XNK | Header | Mở menu nhập/xuất | `TransactionActionDropdown` | Không | Route | Giữ route thật |
| Công cụ | Header chung | Làm mới/CSV/import giả | `DataModulePage` | Một phần | Dropdown | Thay bằng menu thao tác đúng trang |
| Search sidebar | Sidebar | Query `q` | debounce trong `DataModulePage` | Có | Không | Thay bằng filter ngang, bấm Lọc mới gọi |
| Sửa/Xóa CRUD | Menu dòng | Sửa/xóa document trực tiếp | `DataModulePage` | Có | Modal/confirm browser | Không an toàn cho tồn kho; thay bằng detail + delete có kiểm tra |

## Table/List Columns

### Tab Phiếu xuất nhập kho

| Cột | Field dữ liệu | Sort | Click | Action | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Checkbox | `rowKey` | Không | Có | Chọn dòng | Chọn tất cả trên trang |
| ID \| Ngày | `code`, `date` | Theo API | Có | Mở chi tiết | ID màu xanh |
| Kho hàng | `warehouseName`, `fromWarehouseName`, `toWarehouseName` | Không | Không | Không | Chuyển kho hiển thị mũi tên |
| SP | `totalProductLines` | Không | Không | Không | Số dòng item |
| SL | `totalQuantity` | Không | Không | Không | Tổng số lượng |
| Tổng tiền thanh toán | `totalAmount` | Không | Không | Không | Căn phải |
| Chiều/Trạng thái | `directionLabel`, `status` | Không | Không | Không | Màu theo nghiệp vụ |
| Người tạo | `createdByName` | Không | Không | Không | Dữ liệu thật nếu nguồn có |
| Ghi chú | `note` | Không | Không | Không | Không hard-code |
| Thao tác | `source`, `sourceId`, `canDelete` | Không | Có | Menu dòng | Detail/in/export/delete an toàn |

### Tab Sản phẩm xuất nhập kho

| Cột | Field dữ liệu | Sort | Click | Action | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Checkbox | `rowKey` | Không | Có | Chọn dòng | Chọn tất cả trên trang |
| ID \| Ngày | `billCode`, `date` | Theo API | Có | Mở chi tiết phiếu | Không clone dữ liệu tab phiếu |
| Kho hàng | warehouse fields | Không | Không | Không | Theo item/nghiệp vụ |
| Sản phẩm | `productName`, `productCode`, `barcode` | Không | Không | Không | Dữ liệu product thật |
| SL | `quantity` | Không | Không | Không | Số lượng item |
| Giá | `unitPrice` | Không | Không | Không | Căn phải |
| Chiều/Trạng thái | `directionLabel`, `kindLabel` | Không | Không | Không | Màu theo nghiệp vụ |
| Tổng tiền | `totalAmount` | Không | Không | Không | `quantity * unitPrice` hoặc giá trị nguồn |
| Ghi chú | `note` | Không | Không | Không | Ưu tiên note item, fallback note phiếu |
| Thao tác | source fields | Không | Có | Menu dòng | Detail/in/export; xóa item riêng bị ẩn nếu không an toàn |

## Modal/Drawer/Popup

| Tên | Mở từ đâu | State điều khiển | Chức năng | API |
| --- | --- | --- | --- | --- |
| Chi tiết phiếu | Click ID/menu dòng | `detail`, `detailLoading` | Thông tin phiếu + danh sách item + in | GET detail |
| Xác nhận xóa | Menu dòng/bulk action | `confirmDelete` | Xác nhận trước rollback/xóa | DELETE/bulk-delete |
| Tùy chỉnh hiển thị | Icon cột | `columnModalOpen` | Bật/tắt cột, về mặc định, lưu | Không |
| Dropdown Thêm mới | Hàng action | `openMenu` | Điều hướng nhập/xuất/chuyển kho/import Excel | Không |
| Dropdown Thao tác | Hàng action | `openMenu` | Export/xóa dòng được chọn | Có tùy action |
| Menu từng dòng | Cột cuối | `openMenu` | Chi tiết, in, export, xóa nếu được phép | Có tùy action |

## Pagination

| State page | State page size | Handler | API |
| --- | --- | --- | --- |
| `page` | `limit = 20` | `setPage` | `GET bills/items?page=&limit=` |

## Chức năng trong mẫu nhưng code hiện tại chưa có

| Chức năng mẫu | Có logic/API cũ không | Cách xử lý |
| --- | --- | --- |
| Gom bán lẻ/bán sỉ/trả hàng vào lịch sử kho | Có model và stock log nhưng chưa có API đọc hợp nhất | Bổ sung service mapping trong warehouse routes |
| Chi tiết phiếu theo từng nguồn | Có detail API rời rạc | Bổ sung endpoint detail hợp nhất, không tạo model mới |
| Tùy chỉnh cột | Chưa có cho trang này | Frontend state + localStorage, không sửa dữ liệu |
| In phiếu | Chưa có template riêng cho mọi nguồn | In modal chi tiết bằng `window.print` |
| Xuất dữ liệu | Có thư viện XLSX trong project | Xuất các dòng thật đang chọn/đang tải |
| In barcode theo phiếu | Có workspace barcode ở module sản phẩm nhưng chưa có API/route nhận danh sách phiếu | Ẩn, ghi nhận cần luồng truyền sản phẩm trước khi bật |
| In IMEI/Bartender | Có field IMEI nhưng chưa có service in/export chuẩn | Ẩn để tránh nút chết |
| Gắn/gỡ nhãn phiếu | Model hiện không có workflow nhãn thống nhất | Ẩn |
| Xóa item riêng | Có thể làm lệch tổng phiếu và tồn | Ẩn cho tới khi có transaction service atomic |
| Trả hàng nhà cung cấp | Chưa thấy model/route nghiệp vụ riêng | Không dựng giả; chỉ hiển thị nếu dữ liệu voucher thật có kind tương ứng |

## Rủi ro khi refactor

| Rủi ro | Cách tránh |
| --- | --- |
| Trùng dòng giữa voucher và product log | Dùng document nghiệp vụ làm nguồn chính; ProductLog chỉ bổ sung rollback chưa có document riêng |
| Sai phân loại bán lẻ/bán sỉ | Ưu tiên mã `BHS-` và metadata sale channel nếu có |
| Trả hàng mất thông tin kho | Map kho từ `SalePayment.branchId` của hóa đơn gốc |
| Xóa làm lệch tồn | Chỉ backend quyết định `canDelete`; validate tồn trước rollback; chặn nguồn bán/hoàn/chuyển/điều chỉnh |
| Transfer lưu ObjectId nhưng UI cần tên | Map qua danh sách `Branch` |
| Dữ liệu lịch sử cũ thiếu field | Fallback có kiểm soát từ field cũ, không migration phá dữ liệu |
| Dataset lớn | Phân trang response; giai đoạn mapping hiện tại cần theo dõi hiệu năng và có thể chuyển sang aggregation nếu dữ liệu tăng mạnh |
| Menu bị che bởi table scroll | Menu dùng lớp nổi và CSS overflow phù hợp |
| UI mới làm hỏng form nhập/xuất | Không sửa các route/form tạo phiếu hiện có |
