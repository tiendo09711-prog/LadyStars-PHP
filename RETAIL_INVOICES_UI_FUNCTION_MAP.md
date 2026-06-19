# RETAIL INVOICES UI Function Map

## Route

- Path: `/sales-channels/:channel/retail`
- Main component: `client/src/modules/sales/RetailInvoicePage.tsx`
- Route resolver: `client/src/modules/sales/SalesChannelSubPage.tsx`
- Route declarations: `client/src/main.tsx`
- Layout/Auth/Permission: `AppLayout`; frontend sends JWT through `client/src/core/api/http.ts`; backend protects `/api/products` with `requireAuth`.

## Tổng quan trang

- Trang dùng để quản lý danh sách hóa đơn bán lẻ lưu trong collection `SalePayment`.
- Một dòng là một `SalePayment`; các sản phẩm nằm trong `items`.
- Flow tạo hóa đơn thật nằm tại `/sales-channels/:channel/retail/create`.
- Flow trả hàng thật nằm tại `/sales-channels/:channel/refund/create?saleId=:id`.
- Chi tiết hóa đơn lấy từ `GET /api/products/sales/:id`.
- Tab “Xác nhận thanh toán” chỉ là view/state frontend giả dùng status `payment_confirm_pending`; không có model, collection hay endpoint nghiệp vụ riêng.

## API đang dùng

| Chức năng | Method | Endpoint | File gọi API | Handler | State liên quan | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| Danh sách hóa đơn | GET | `/api/products/sales` | `RetailInvoicePage.tsx` | `loadInvoices` | invoices, total, page, loading, error | Phân trang/filter phía server |
| Chi tiết hóa đơn | GET | `/api/products/sales/:id` | `RetailInvoicePage.tsx` | `openDetail` | detail, detailLoading, detailError | Trả toàn bộ items |
| Danh sách cửa hàng/kho | GET | `/api/system/branches` | `RetailInvoicePage.tsx` | `openBranchPicker` | branches, selectedBranchId | Dữ liệu thật |
| Tạo hóa đơn | POST | `/api/products/sales` | `RetailInvoiceCreatePage.tsx` | `handleSave` | form, isSaving | Tạo draft |
| Hoàn tất hóa đơn | POST | `/api/products/sales/:id/complete` | `RetailInvoiceCreatePage.tsx` | `handleSave` | successMessage | Trừ tồn kho và cập nhật khách hàng |
| Hủy hóa đơn | POST | `/api/products/sales/:id/cancel` | `RetailInvoiceCreatePage.tsx` khi sửa | `handleSave` | editId | Hoàn tồn nếu hóa đơn cũ completed |
| Trả hàng | POST | `/api/products/refunds` và complete | `RefundInvoiceCreatePage.tsx` | flow hiện có | form trả hàng | Giữ nguyên |

## State quan trọng

| State | File | Mục đích | Update ở đâu |
| --- | --- | --- | --- |
| invoices / total | `RetailInvoicePage.tsx` | Dữ liệu bảng và tổng bản ghi | `loadInvoices` |
| draftFilters / appliedFilters | `RetailInvoicePage.tsx` | Form filter và filter đã gửi API | input handlers, submit/reset |
| page | `RetailInvoicePage.tsx` | Trang hiện tại | pagination/filter |
| selectedIds | `RetailInvoicePage.tsx` | Chọn dòng | checkbox |
| detail | `RetailInvoicePage.tsx` | Hóa đơn đang xem | `openDetail` |
| branches / selectedBranchId | `RetailInvoicePage.tsx` | Chọn kho trước khi tạo | branch modal |
| products | `RetailInvoiceCreatePage.tsx` | Nhiều dòng sản phẩm của hóa đơn | tìm/chọn/sửa số lượng/xóa dòng |
| paymentMethods / paymentLines | `RetailInvoiceCreatePage.tsx` | Nhiều phương thức thanh toán lấy từ DB | GET payment-methods và form thanh toán |

## Filter/Search

| UI filter | Field gửi API | State | Handler | Ghi chú |
| --- | --- | --- | --- | --- |
| ID hóa đơn | `invoiceCode` | `draftFilters.invoiceCode` | `applyFilters` | Regex không phân biệt hoa thường |
| Cửa hàng | `storeId` | `draftFilters.storeId` | `applyFilters` | ObjectId của Branch |
| Từ ngày | `dateFrom` | `draftFilters.dateFrom` | `applyFilters` | Bắt đầu ngày theo UTC+7 |
| Đến ngày | `dateTo` | `draftFilters.dateTo` | `applyFilters` | Cuối ngày theo UTC+7 |
| Khách hàng | `customerKeyword` | `draftFilters.customerKeyword` | `applyFilters` | Tên, mã hoặc số điện thoại |
| Sản phẩm | `productKeyword` | `draftFilters.productKeyword` | `applyFilters` | Mã hoặc tên sản phẩm trong items |

## Button/Action

| UI | Vị trí | Chức năng | Handler hiện tại | Có gọi API | Modal/Route |
| --- | --- | --- | --- | --- | --- |
| Thêm hóa đơn lẻ | Action bar | Chọn kho rồi tạo hóa đơn | `openBranchPicker` | GET branches | Modal → create route |
| Lọc | Filter bar | Áp filter và về trang 1 | `applyFilters` | GET sales | Không |
| Đặt lại | Filter bar | Xóa filter và về trang 1 | `resetFilters` | GET sales | Không |
| Mã hóa đơn | Table | Xem chi tiết | `openDetail` | GET sales/:id | Modal |
| Xem chi tiết | Row menu | Xem chi tiết | `openDetail` | GET sales/:id | Modal |
| Sửa thông tin | Row menu | Dùng flow cũ | navigate | API ở create page | Route create?editId |
| Trả/đổi hàng | Row menu | Dùng flow cũ | navigate | API ở refund page | Route refund/create |

## Table/List Columns

| Cột | Field dữ liệu | Sort | Click | Action | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Người tạo / Ngày tạo | `authorId/userId`, `createdAt` | Không | Không | Không | Dữ liệu populate thật |
| ID hóa đơn | `code` | Không | Có | Mở chi tiết | Một dòng/hóa đơn |
| Khách hàng | `customerId` | Không | Không | Không | Tên + điện thoại |
| Sản phẩm | `items` | Không | Không | Không | Item đầu + số item còn lại |
| Giá trị hàng hóa | Tổng `item.value * item.amount` | Không | Không | Không | Tính từ toàn bộ items |
| Tổng SL | Tổng `item.amount` | Không | Không | Không | Đặt tên rõ |
| Giảm giá | `discountValue` | Không | Không | Không | Giá trị backend |
| Tổng tiền | `value` | Không | Không | Không | Giá trị backend |
| Thanh toán | `valuePayment`, `typePayment` | Không | Không | Không | Breakdown nếu có |
| Trạng thái | `status` | Không | Không | Không | Dữ liệu backend |

## Modal/Drawer/Popup

| Tên | Mở từ đâu | State điều khiển | Chức năng | API |
| --- | --- | --- | --- | --- |
| Chọn cửa hàng/kho | Thêm hóa đơn lẻ | `showBranchModal` | Chọn branch thật trước khi tạo | GET branches |
| Chi tiết hóa đơn | Mã hóa đơn/row action | `detail` | Hiển thị items, tiền, khách, cửa hàng, thanh toán | GET sales/:id |
| Row action menu | Nút ba chấm | `rowActionOpen` | Chỉ action có flow thật | Không trực tiếp |

## Pagination

| State page | State page size | Handler | API |
| --- | --- | --- | --- |
| `page` | `PAGE_SIZE = 15` | `setPage` | GET `/products/sales?page=&limit=` |

## Chức năng trong mẫu nhưng code hiện tại chưa có

| Chức năng mẫu | Có logic/API cũ không | Cách xử lý |
| --- | --- | --- |
| Bulk action | Không có backend bán lẻ an toàn | Không hiển thị action placeholder |
| Tùy chỉnh cột | Không có persistence/logic cũ | Không hiển thị |
| Export toàn bộ theo filter | Không có endpoint export | Không hiển thị export giả chỉ xuất một trang |
| In hóa đơn | Không có flow in gắn SalePayment hiện tại | Không hiển thị |
| Nhiều phương thức thanh toán khi tạo | Có schema `typePayment` và API PaymentMethod | Đã kết nối dữ liệu thật; tổng các dòng phải bằng `valuePayment` |

## Flow tạo hóa đơn nhiều sản phẩm / nhiều thanh toán

- Sản phẩm lấy từ `GET /api/products/inventories?branchId=:branchId`, dùng `selectedStock` thật của kho.
- Mỗi sản phẩm chỉ có một dòng; chọn lại sản phẩm sẽ tăng số lượng trong giới hạn tồn kho.
- Payload `items[]` chứa toàn bộ dòng sản phẩm; backend tự tính `amountProducts`, giá vốn và tổng tiền.
- Phương thức thanh toán lấy từ `GET /api/products/payment-methods`, không hardcode tên hoặc ID.
- Payload `typePayment[]` chứa `methodId` và `amount`; backend xác nhận phương thức còn hoạt động và tổng dòng bằng `valuePayment`.
- Flow hoàn tất vẫn gọi `/products/sales/:id/complete`, vì vậy toàn bộ sản phẩm được trừ tồn theo service hiện có.

## Rủi ro khi refactor

| Rủi ro | Cách tránh |
| --- | --- |
| Biến item thành từng dòng | Render trực tiếp `SalePayment[]`; tóm tắt `items` trong một cell |
| Sai tổng tiền | Dùng `value`, `valuePayment`, `discountValue` từ backend; giá trị hàng hóa cộng toàn bộ items |
| Filter một trang ở frontend | Mọi filter gửi lên API và dùng `total` backend |
| Lệch ngày | Backend dựng mốc đầu/cuối ngày UTC+7 |
| Xóa nhầm payment history | Không sửa/xóa schema `SalePayment`, `typePayment`, `PaymentMethod` |
| Nút chết | Chỉ giữ detail, edit và refund đã có route/API thật |
