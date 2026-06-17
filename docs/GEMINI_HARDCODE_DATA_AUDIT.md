# Gemini Task: Quét sâu UI, lập testcase, gọi API và fix dữ liệu hardcode

## 0. Vai trò và mục tiêu

Bạn là agent full-stack phụ trách kiểm tra toàn bộ dự án LadyStars ERP để phát hiện và sửa các phần dữ liệu đang bị hardcode, dữ liệu hiển thị sai so với API, hoặc nút chức năng có giao diện nhưng không hoạt động đúng.

Mục tiêu không phải là "nhìn sơ rồi sửa vài chỗ". Mục tiêu là đi từng trang, quét toàn bộ thành phần UI, lập testcase rõ ràng cho từng nút và từng vùng dữ liệu, dùng Playwright e2e để gọi/quan sát API, sau đó chỉ sửa code khi có bằng chứng cụ thể.

Repo hiện tại:

- Frontend: `client/src`
- Backend API: `server/src`, chạy mặc định tại `http://localhost:4000/api`
- Frontend local: `http://localhost:5173`
- E2E: `e2e`, dùng Playwright
- Auth e2e có sẵn: `e2e/tests/auth.setup.ts`
- API client frontend: `client/src/core/api/http.ts`
- Routes frontend chính: `client/src/main.tsx`
- Layout/menu chính: `client/src/core/layout/AppLayout.tsx`

Tài khoản e2e hiện có trong repo:

```text
admin@gmail.com / 123456
```

## 1. Luật bắt buộc trước khi sửa code

1. Không được sửa code chỉ dựa trên cảm giác hoặc nhìn UI bằng mắt.
2. Không được kết luận "ổn" nếu chưa có bằng chứng từ ít nhất một trong các nguồn sau:
   - Network request/response trong Playwright.
   - API được gọi trực tiếp bằng request từ test.
   - DB seed/query trong `e2e/utils/db.ts`.
   - Source code chứng minh UI lấy dữ liệu từ API và có state loading/error/empty hợp lý.
3. Không được bỏ qua nút chỉ vì nút là icon, dropdown, menu con, pagination, tab, filter, date picker, export, print, refresh, search, sort, modal, drawer, hoặc action trong từng row.
4. Không được chỉ test happy path. Với mỗi trang phải có ít nhất:
   - Test tải dữ liệu ban đầu.
   - Test trạng thái empty/loading/error nếu trang có xử lý.
   - Test filter/search/pagination/sort nếu có.
   - Test từng nút action hiển thị trên trang.
   - Test dữ liệu UI có khớp API hoặc DB seed không.
5. Không được xóa hardcode nếu hardcode đó là label, placeholder, tên cột, text hướng dẫn, trạng thái UI tĩnh hợp lệ. Chỉ xử lý hardcode thuộc nhóm dữ liệu nghiệp vụ đáng lẽ phải đến từ API/DB.
6. Sau mỗi nhóm sửa phải chạy e2e liên quan. Nếu fail thì tự đọc log, sửa và chạy lại.
7. Nếu một trang chưa có API tương ứng, không tự chế dữ liệu giả trong frontend. Phải thêm hoặc nối API backend phù hợp, hoặc ghi rõ lý do chưa thể làm nếu thiếu model/domain.
8. Khi sửa, giữ style và cấu trúc code hiện có. Không refactor lớn ngoài phạm vi phát hiện.
9. Không được chỉ kiểm tra "có gọi API" là xong. Phải kiểm tra API đó có đúng nghiệp vụ, đúng module, đúng model/collection và đúng field mapping hay không. Nếu trang hiển thị tồn kho nhưng gọi nhầm API danh sách sản phẩm thường, hoặc báo cáo doanh thu nhưng lấy nhầm đơn hàng chưa hoàn tất, vẫn tính là lỗi.

## 2. Định nghĩa hardcode cần tìm

Một đoạn bị xem là hardcode cần xử lý nếu thuộc một trong các loại sau:

- Bảng hiển thị danh sách nghiệp vụ bằng array cố định trong component.
- KPI/tổng tiền/số lượng/doanh thu/tồn kho/công nợ đang ghi số cố định.
- Dropdown/filter lấy danh sách cửa hàng, nhân viên, khách hàng, nhà cung cấp, danh mục, trạng thái bằng dữ liệu mẫu thay vì API.
- Modal/detail hiển thị dữ liệu giả không phụ thuộc record được chọn.
- Nút "Lọc", "Tìm kiếm", "Xuất dữ liệu", "In", "Tạo", "Sửa", "Xóa", "Xác nhận", "Lưu", "Hủy", "Refresh", "Import", "Export" không gọi API hoặc không thay đổi dữ liệu như UI thể hiện.
- Pagination/sort/search chỉ thay đổi UI local trên dataset giả.
- Biểu đồ/thống kê/report dùng số mẫu thay vì response.
- Empty state hiển thị "không có dữ liệu" trong khi API có dữ liệu, hoặc ngược lại.

Không xem là hardcode lỗi nếu là:

- Label menu, tiêu đề trang, tên cột, placeholder.
- Danh sách trạng thái nghiệp vụ cố định thật sự là enum.
- Text mô tả, toast message, validation message.
- Dữ liệu test chỉ nằm trong e2e seed/test.

## 3. Lệnh chạy dự án và e2e

Chạy dev server từ root:

```bash
npm run dev
```

Chạy Playwright từ thư mục `e2e`:

```bash
cd e2e
npx playwright test
```

Chạy một spec cụ thể:

```bash
cd e2e
npx playwright test tests/<ten-file>.spec.ts --project=chromium
```

Xem report:

```bash
cd e2e
npx playwright show-report
```

Nếu cần kiểm tra build:

```bash
npm run build
```

Nếu cần kiểm tra TypeScript:

```bash
npx tsc --noEmit
```

Lưu ý: config e2e đang dùng `baseURL: http://localhost:5173`, storage auth tại `e2e/playwright/.auth/user.json`, và setup login trong `e2e/tests/auth.setup.ts`.

## 4. Phạm vi quét trang

Bắt đầu từ `client/src/main.tsx` để lấy danh sách route thật sự render được. Sau đó đối chiếu với menu trong `client/src/core/layout/AppLayout.tsx`.

Ưu tiên làm theo từng module, không nhảy lung tung:

1. Dashboard: `/`
2. Sản phẩm:
   - `/products`
   - `/products/batches`
   - `/products/storage-duration`
   - `/products/inventory`
   - `/products/categories`
   - `/vendors`
3. Kho hàng:
   - `/warehouse/transactions`
   - `/warehouse/transactions/vouchers/import`
   - `/warehouse/transactions/vouchers/export`
   - `/warehouse/transactions/vouchers/excel`
   - `/warehouse/transfers`
   - `/warehouse/transfers/create`
   - `/warehouse/audit`
   - `/warehouse/audit/create`
   - `/warehouse/drafts`
   - `/warehouse/history`
4. Kênh bán:
   - `/sales-channels/store/find`
   - `/sales-channels/store/retail`
   - `/sales-channels/store/wholesale`
   - `/sales-channels/store/refund`
   - `/sales-channels/store/retail/create`
   - `/sales-channels/store/wholesale/create`
   - `/sales-channels/store/refund/create`
5. Đơn hàng:
   - `/orders/manage`
   - `/orders/packing`
   - `/orders/handover`
   - `/orders/shipping-pending`
   - `/orders/disputes`
   - `/orders/cod-control`
   - `/orders/sources`
   - `/orders/history`
6. Khách hàng:
   - `/customers/list`
   - `/customers/care`
7. Kế toán:
   - `/accounting/cash`
   - `/accounting/cash/create`
   - `/accounting/bank`
   - `/accounting/bank/create`
   - `/accounting/summary`
   - `/accounting/debt/customers`
   - `/accounting/debt/staff`
   - `/accounting/debt/vendors`
   - `/accounting/debt/initial`
   - `/accounting/entries`
   - `/accounting/journal`
   - `/accounting/installment-collection`
   - `/accounting/history`
   - `/accounting/accounts`
   - `/accounting/installment`
8. Vận hành:
   - `/tasks`
   - `/print-forms`
9. Nhân viên/cài đặt:
   - `/staff`
   - `/staff/create`
   - `/staff/accounts`
   - `/staff/stats`
   - `/settings`
10. Báo cáo:
   - Tất cả route `/reports/...` có trong `client/src/main.tsx`.

Nếu menu có link nhưng `main.tsx` chưa khai báo route, ghi nhận là lỗi route/menu mismatch. Nếu `main.tsx` có route nhưng menu không có link, ghi nhận là route orphan, chỉ sửa nếu user yêu cầu hoặc rõ ràng thiếu navigation.

## 4.1. Bản đồ nghiệp vụ bắt buộc: UI route -> API -> model/collection

Mục này là bản đồ đồng bộ nghiệp vụ. Khi kiểm tra một trang, Gemini phải dùng bảng này trước khi viết testcase hoặc sửa code. Mục tiêu là tránh lỗi "đã gọi API thật nhưng gọi sai API, sai collection, sai nghiệp vụ".

Luật dùng map:

1. Với route đang kiểm tra, tìm dòng tương ứng trong bảng.
2. Mở component frontend tương ứng để xem nó đang gọi API nào.
3. Mở backend route tương ứng để xác nhận API đó đọc/ghi model nào.
4. Nếu UI gọi API khác map, phải chứng minh vì sao hợp lệ. Nếu không chứng minh được thì xem là lỗi mapping.
5. Nếu API đúng endpoint nhưng backend đọc sai model/collection, phải sửa backend hoặc đổi endpoint.
6. Nếu bảng dưới thiếu route hoặc route mới, phải tự bổ sung vào báo cáo `docs/hardcode-audit/<module>.md` trước khi sửa.
7. Với mọi testcase, báo cáo phải có cột `Expected API/domain` và `Actual API/domain`.

Các collection dưới đây là collection MongoDB mặc định do Mongoose tạo từ model. Nếu nghi ngờ tên collection khác, kiểm tra bằng model hoặc query DB trước khi kết luận.

### Map hệ thống dùng chung

| Nghiệp vụ UI | API đúng | Model/collection đúng | Không được nhầm với | Ghi chú kiểm tra |
| --- | --- | --- | --- | --- |
| Thông tin người đăng nhập | `GET /api/auth/me` | `User` / `users` | `staff` list | Dùng để xác định owner/staff, menu quyền, user dropdown. |
| Cấu hình cửa hàng/logo/tên shop | `GET/PATCH /api/settings/store` | `StoreSetting` / `storesettings` | hardcode `LadyStars` trong UI | `LadyStars` chỉ được là fallback khi chưa có setting. |
| Chi nhánh/cửa hàng/kho | `GET /api/system/branches` hoặc `/api/system/branches/:id` | `Branch` / `branches` | text warehouse hardcode | Filter theo cửa hàng phải map sang branch `_id` hoặc code đúng. |
| Nhân viên/tài khoản staff | `GET/POST/PATCH /api/staff` | `User` / `users` với `role: staff` | `Customer`, text người tạo | Trang staff không được lấy từ customer/vendor. |
| Nhật ký audit hệ thống | `GET /api/audit-logs` | `AuditLog` / `auditlogs` | history riêng của order/product | Audit hệ thống khác lịch sử sửa xóa module. |

### Dashboard

| UI route | Component | API đúng | Model/collection nguồn | Dữ liệu phải đối chiếu | Dấu hiệu sai mapping |
| --- | --- | --- | --- | --- | --- |
| `/` | `client/src/modules/dashboard/DashboardPage.tsx` | `GET /api/dashboard` | `Product/products`, `ProductBranchStock/productbranchstocks`, `Customer/customers`, `Vendor/vendors`, `VendorPurchase/vendorpurchases`, `Receipt/receipts`, `ExpensePayment/expensepayments`, `Project/projects`, `Task/tasks`, `AccountingType/accountingtypes`, `SalePayment/salepayments`, `Wallet/wallets`, `Branch/branches` | KPI tổng quan, doanh thu, chi phí, tồn kho, kênh bán, sản phẩm bán chạy, chart, ví, danh sách cửa hàng | Dashboard có số cố định; doanh thu lấy từ `orders` thay vì `SalePayment` completed; tồn kho lấy từ `Product.qty` mà bỏ `ProductBranchStock` khi filter cửa hàng. |
| `/` daily product drilldown | `DashboardPage.tsx` | `GET /api/dashboard/daily-products?date=dd/mm/yyyy&stores=...` | `SalePayment/salepayments` joined `Product/products` | Sản phẩm bán trong ngày theo hóa đơn completed | Nếu click chart/modal hiển thị sản phẩm mẫu hoặc không phụ thuộc ngày đã chọn. |

### Sản phẩm và tồn kho

| UI route | Component | API đúng | Model/collection đúng | Nghiệp vụ phải khớp | Dấu hiệu sai mapping |
| --- | --- | --- | --- | --- | --- |
| `/products` | `ProductMainPage.tsx` hoặc page con trong `ProductsPage.tsx` | `GET/POST/PATCH/DELETE /api/products/products` | `Product/products` | Danh sách master sản phẩm: code, name, price, cost, status, category, trademark, unit | Gọi `/api/products/inventories` cho trang master; bảng có stock theo kho nhưng không phải trang tồn kho; dùng array mẫu. |
| `/products` import Excel | `ProductMainPage.tsx` | `POST /api/products/products/import` | `Product/products`, `InventoryProduct/inventoryproducts`, `InventoryVoucher/inventoryvouchers`, `ProductBranchStock/productbranchstocks`, `Branch/branches` | Import tạo/cập nhật sản phẩm và nếu có tồn thì tạo giao dịch nhập kho | Import chỉ tạo product nhưng không cập nhật stock khi file có tồn; branch map sai. |
| `/products/categories` | `CategoriesPage.tsx` | `GET/POST/PATCH/DELETE /api/products/categories` | `Category/categories` | Danh mục sản phẩm | Không dùng `CustomerGroup`, `VendorGroup` hoặc array enum. |
| `/products/batches` | `BatchPage.tsx` | `GET/POST/PATCH/DELETE /api/products/batches`, `POST /api/products/batches/import` | `Batch/batches`, joined `Product/products`, optional `Branch/branches` | Lô hàng, ngày SX/HSD, qty, productId, branchId | Gọi inventory voucher thay vì batch; batch hiển thị product mẫu không join product. |
| `/products/storage-duration` | `StorageDurationPage.tsx` | `GET /api/products/storage-duration` | `Product/products`, `ProductBranchStock/productbranchstocks`, `Batch/batches`, `SalePayment/salepayments`, `Order/orders`, `StockAdjustment/stockadjustments`, `Branch/branches`, `Category/categories`, `Trademark/trademarks` | Tuổi hàng tồn, hàng lâu chưa bán, chậm bán, KPI thời gian lưu kho | Nếu chỉ tính từ `Product.createdAt` mà bỏ batch/sales/orders/stock adjustment; filter kho không dùng branch stock. |
| `/products/inventory` | `InventoryPage.tsx` | `GET /api/products/inventories` | `Product/products`, `ProductBranchStock/productbranchstocks`, `Branch/branches`, optional `Category/categories` | Tồn kho theo chi nhánh, tổng tồn, stockCN/stockHanoi/stockHCM/selectedStock | Trang tồn kho gọi `/api/products/products` và lấy `qty` tổng thay vì branch stock; sort/filter chỉ local trên dữ liệu giả. |
| Product edit history/log | `ProductHistory.tsx` hoặc route liên quan | `GET /api/products/edit-logs` hoặc `GET /api/products/logs` tùy UI | `ProductEditLog/producteditlogs` hoặc `ProductLog/productlogs` | Lịch sử sửa/xóa sản phẩm khác log biến động tồn | Nhầm `ProductLog` biến động kho với `ProductEditLog` sửa thông tin. |
| Product branch stock helper | component chọn kho/tồn | `GET /api/products/branch-stocks` | `ProductBranchStock/productbranchstocks` | Tồn từng sản phẩm theo từng branch | Không lấy từ `Product.qty` nếu UI nói rõ theo kho/cửa hàng. |
| Danh mục phụ sản phẩm | select/filter | `/api/products/trademarks`, `/api/products/shelves`, `/api/products/sale-channels`, `/api/products/delivery-partners`, `/api/products/payment-methods` | `Trademark`, `Shelf`, `SaleChannel`, `DeliveryPartner`, `PaymentMethod` | Dropdown động | Nếu select thương hiệu/kệ/kênh bán là array mẫu trong component. |

### Nhà cung cấp

| UI route | Component | API đúng | Model/collection đúng | Nghiệp vụ phải khớp | Dấu hiệu sai mapping |
| --- | --- | --- | --- | --- | --- |
| `/vendors` | `VendorPage.tsx` | `GET/POST/PATCH/DELETE /api/vendors/vendors` | `Vendor/vendors` | Nhà cung cấp: code, name, phone, debt, totalPurchase, groups | Không dùng customer API; không hiển thị nhà cung cấp mẫu. |
| Vendor groups nếu có UI | vendor group component | `GET/POST/PATCH/DELETE /api/vendors/groups` | `VendorGroup/vendorgroups` | Nhóm nhà cung cấp | Nhầm với `CustomerGroup`. |
| Nhập hàng nhà cung cấp nếu có UI | vendor purchase flow | `/api/vendors/purchases`, `/api/vendors/purchases/:id/complete` | `VendorPurchase/vendorpurchases`, affects product stock through service | Phiếu nhập mua từ NCC | Không nhầm với warehouse import voucher nếu UI là mua từ nhà cung cấp. |
| Trả hàng/chuyển kho NCC nếu có UI | vendor refund/transfer flow | `/api/vendors/refunds`, `/api/vendors/transfers` | `VendorRefund/vendorrefunds`, `VendorTransfer/vendortransfers` | Trả NCC/chuyển NCC | Không nhầm với `ProductRefund` bán hàng trả. |

### Kho hàng

| UI route | Component | API đúng | Model/collection đúng | Nghiệp vụ phải khớp | Dấu hiệu sai mapping |
| --- | --- | --- | --- | --- | --- |
| `/warehouse/transactions` | `WarehouseTransactionPage.tsx` | `GET /api/warehouse/vouchers`, `GET /api/warehouse/products` | `InventoryVoucher/inventoryvouchers`, `InventoryProduct/inventoryproducts` | Danh sách phiếu XNK và dòng sản phẩm XNK | Gọi `Product/products` rồi tự tạo giao dịch giả; tổng phiếu không khớp voucher. |
| `/warehouse/transactions/vouchers/import` | `VoucherImportPage.tsx` | `POST /api/warehouse/vouchers/import`, helper `GET /api/products/products`, `GET /api/system/branches` | `InventoryVoucher`, `InventoryProduct`, `Product`, `ProductBranchStock`, `Batch`, `Branch`, `ProductLog` | Nhập kho phải tạo voucher, dòng inventory product, tăng branch stock/product qty, ghi product log | Chỉ tạo voucher nhưng không tăng kho; dùng tên kho text mà không resolve branch đúng. |
| `/warehouse/transactions/vouchers/export` | `VoucherExportPage.tsx` | `POST /api/warehouse/vouchers/export`, helper product/branch | `InventoryVoucher`, `InventoryProduct`, `Product`, `ProductBranchStock`, `ProductLog` | Xuất kho phải validate đủ tồn, tạo voucher, giảm stock | Cho xuất âm kho; xuất bán lẻ/bán sỉ trong kho thay vì yêu cầu tạo ở bán hàng. |
| `/warehouse/transactions/vouchers/excel` | `VoucherExcelImportPage.tsx` | `POST /api/warehouse/vouchers/import-excel` | `Product`, `InventoryVoucher`, `InventoryProduct`, `ProductBranchStock`, `Batch`, `Branch` | Import XNK từ file Excel | Parse file xong chỉ hiển thị preview mà không tạo dữ liệu thật khi submit. |
| `/warehouse/transfers` | `WarehouseTransferPage.tsx` | `GET /api/warehouse/transfers` | `WarehouseTransfer/warehousetransfers` | Danh sách chuyển kho | Không dùng vendor transfers. |
| `/warehouse/transfers/create` | `WarehouseTransferCreatePage.tsx` | `POST /api/warehouse/transfers`, helper product/branch | `WarehouseTransfer`, `ProductBranchStock`, `ProductLog`, `Product`, `Branch` | Trừ kho nguồn, cộng kho đích, lưu phiếu chuyển | Chỉ lưu phiếu mà không cập nhật tồn hai kho. |
| `/warehouse/transfers/:id` | `WarehouseTransferDetailPage.tsx` | `GET/PATCH /api/warehouse/transfers/:id` | `WarehouseTransfer/warehousetransfers` | Detail phiếu chuyển theo đúng ID | Modal/detail không được hiển thị phiếu mẫu. |
| `/warehouse/audit` | `WarehouseAuditPage.tsx` | `GET /api/warehouse/checks`, `GET /api/warehouse/check-products` | `InventoryCheck/inventorychecks`, `InventoryCheckProduct/inventorycheckproducts` | Phiếu kiểm kho và dòng kiểm kho | Không nhầm với stock adjustment nếu UI đang dùng module warehouse audit. |
| `/warehouse/audit/create` | `WarehouseAuditCreatePage.tsx` | `POST /api/warehouse/checks` | `InventoryCheck`, `InventoryCheckProduct`, `ProductBranchStock`, `ProductLog` | Lưu kiểm kho và bù trừ tồn theo chênh lệch | Chỉ lưu checklist UI không cập nhật tồn. |
| `/warehouse/drafts` | `WarehouseDraftPage.tsx` | `GET /api/warehouse/vouchers?status=draft` hoặc filter tương đương nếu có | `InventoryVoucher/inventoryvouchers` | Phiếu nháp XNK | Không lấy tất cả vouchers rồi hardcode tab. Nếu backend chưa hỗ trợ status, ghi rõ và sửa. |
| `/warehouse/history` | `WarehouseHistoryPage.tsx` | `GET /api/products/edit-logs`, `/api/products/logs`, hoặc `/api/audit-logs` tùy UI label | `ProductEditLog`, `ProductLog`, hoặc `AuditLog` | Lịch sử sửa/xóa kho/sản phẩm phải khớp label UI | Phải xác định rõ history là sửa xóa hay biến động tồn, không dùng nhầm. |

### Bán hàng và kênh bán

| UI route | Component | API đúng | Model/collection đúng | Nghiệp vụ phải khớp | Dấu hiệu sai mapping |
| --- | --- | --- | --- | --- | --- |
| `/sales` | `SalesPage.tsx` | Nếu là tổng quan bán hàng: `/api/products/sales`, `/api/products/refunds`, `/api/products/sale-channels` tùy UI | `SalePayment/salepayments`, `ProductRefund/productrefunds`, `SaleChannel/salechannels` | Không được để dữ liệu bán hàng mẫu | Nếu page hiển thị invoice/order nhưng không gọi sales/refunds/order API. |
| `/sales-channels/:channel/find` | `SalesChannelSubPage.tsx` hoặc find page | `GET /api/products/sales` | `SalePayment/salepayments` joined customer/product/channel | Tìm hóa đơn bán hàng | Không dùng `Order/orders` nếu label là hóa đơn bán tại cửa hàng. |
| `/sales-channels/:channel/retail` | `SalesChannelPage.tsx`/subpage | `GET /api/products/sales` với filter channel/type nếu có | `SalePayment/salepayments` | Danh sách bán lẻ | Nếu bán lẻ lấy từ warehouse export hoặc orders online. |
| `/sales-channels/:channel/wholesale` | `SalesChannelPage.tsx`/subpage | `GET /api/products/sales` với filter channel/type nếu có | `SalePayment/salepayments` | Danh sách bán sỉ | Không tính vào `Order` trừ khi UI nói đơn online. |
| `/sales-channels/:channel/refund` | `SalesChannelPage.tsx`/subpage | `GET /api/products/refunds` | `ProductRefund/productrefunds` joined `SalePayment` | Trả hàng bán | Không dùng vendor refund. |
| `/sales-channels/:channel/retail/create` | `RetailInvoiceCreatePage.tsx` | `POST /api/products/sales`, `POST /api/products/sales/:id/complete`, helper products/customers/payment methods/branches | `SalePayment`, `Product`, `Customer`, `PaymentMethod`, `ProductBranchStock`, `ProductLog`, `Branch` | Tạo hóa đơn bán lẻ phải trừ tồn khi complete, cập nhật customer metrics nếu có | Chỉ lưu localStorage; trừ `Product.qty` nhưng bỏ branch stock; không complete sale. |
| `/sales-channels/:channel/wholesale/create` | `WholesaleInvoiceCreatePage.tsx` | `POST /api/products/sales`, `POST /api/products/sales/:id/complete` | `SalePayment`, `Product`, `Customer`, `ProductBranchStock`, `ProductLog` | Tạo hóa đơn bán sỉ | Không dùng warehouse export để tạo doanh thu. |
| `/sales-channels/:channel/refund/create` | `RefundInvoiceCreatePage.tsx` | `POST /api/products/refunds`, `POST /api/products/refunds/:id/complete`, helper sales detail | `ProductRefund`, `SalePayment`, `ProductBranchStock`, `ProductLog` | Trả hàng phải gắn hóa đơn gốc và nhập lại tồn khi complete | Không tạo negative sale payment. |

### Đơn hàng online/vận hành đơn

| UI route | Component | API đúng | Model/collection đúng | Nghiệp vụ phải khớp | Dấu hiệu sai mapping |
| --- | --- | --- | --- | --- | --- |
| `/orders/manage` | `OrdersManagePage.tsx` | `GET/POST/PATCH/DELETE /api/orders/manage`, `POST /api/orders/manage/bulk-action` | `Order/orders`, optional `Product/products`, `OrderHandover/orderhandovers` | Quản lý đơn online: orderCode, customer, status, warehouse, products, delivery | Không nhầm với hóa đơn bán lẻ `SalePayment`. Bulk action phải mutate Order. |
| `/orders/packing` | `OrdersPackagingPage.tsx` | `GET /api/orders/manage`, `GET /api/orders/packaging/scan`, `POST /api/orders/packaging/:id/pack` | `Order/orders` | Scan/đóng gói đơn, cập nhật scannedQuantity/status/packer | Nếu scan chỉ tìm trong dữ liệu mẫu hoặc không cập nhật order. |
| `/orders/handover` | `OrdersHandoverPage.tsx` | `GET/POST/PATCH/DELETE /api/orders/handover` và bulk `add-handover` nếu gán đơn | `OrderHandover/orderhandovers`, `Order/orders` | Biên bản bàn giao | Không dùng cod-control hoặc shipping pending. |
| `/orders/shipping-pending` | `OrdersShippingPendingPage.tsx` | `GET/POST/PATCH/DELETE /api/orders/shipping-pending` | `Order/orders` với default `deliveryStatus` chờ lấy hàng/lỗi API | Chờ gửi vận chuyển | Nếu lấy tất cả orders không filter hoặc hardcode status count. |
| `/orders/disputes` | `OrdersDisputesPage.tsx` | `GET/POST/PATCH/DELETE /api/orders/disputes` | `OrderDispute/orderdisputes`, sync `Order/orders` by orderCode | Khiếu nại đơn hàng | Không dùng customer care. |
| `/orders/cod-control` | `OrdersCodControlPage.tsx` | `GET/POST/PATCH/DELETE /api/orders/cod-control` | `OrderCodControl/ordercodcontrols` | Đối soát COD | Không dùng accounting bank/cash transactions nếu UI là COD carrier reconciliation. |
| `/orders/sources` | `OrdersSourcesPage.tsx` | `GET/POST/PATCH/DELETE /api/orders/sources` | `OrderSource/ordersources` | Nguồn đơn hàng | Không dùng SaleChannel nếu UI là nguồn đơn online, trừ khi có yêu cầu đồng bộ rõ. |
| `/orders/history` | `OrdersHistoryPage.tsx` | `GET/POST/PATCH/DELETE /api/orders/history` | `OrderHistory/orderhistories` | Lịch sử sửa/xóa đơn | Không dùng audit logs chung nếu UI là lịch sử đơn. |

### Khách hàng

| UI route | Component | API đúng | Model/collection đúng | Nghiệp vụ phải khớp | Dấu hiệu sai mapping |
| --- | --- | --- | --- | --- | --- |
| `/customers/list` | `CustomerListPage.tsx` | `GET/POST/PATCH/DELETE /api/customers/customers`, optional `POST /api/customers/sync-metrics` | `Customer/customers`, sync from `Order/orders` and `SalePayment/salepayments` | Danh sách khách hàng, nhóm, điểm, tổng mua, lần mua | Không lấy từ orders trực tiếp để làm danh sách khách; không dùng vendor. |
| `/customers/care` | `CustomerCarePage.tsx` | `GET/POST/PATCH/DELETE /api/customers/care` | `CustomerCare/customercares`, auto-fill từ `Customer/customers` by code | Chăm sóc khách hàng | Không nhầm với order disputes. |
| `/customers` | `CustomerPage.tsx` | Trang shell/redirect/tổng quan nếu có: phải gọi customer APIs đúng theo tab | `Customer`, `CustomerGroup`, `CustomerCare` | Không hiển thị dashboard mẫu | Nếu chỉ là wrapper không cần API riêng. |
| Customer groups/levels/reasons/types nếu route được bật | `CustomerGroupPage.tsx`, `CustomerLevelPage.tsx`, `CustomerCareTypePage.tsx`, `CustomerCareReasonPage.tsx` | `/api/customers/groups` hoặc cần thêm endpoint nếu UI thật sự cần level/type/reason | `CustomerGroup/customergroups` hoặc model mới cần tạo | Phải ghi rõ endpoint thiếu nếu UI yêu cầu dữ liệu động | Không nhét level/type/reason bằng array nghiệp vụ nếu cần quản trị. |

### Kế toán và công nợ

| UI route | Component | API đúng | Model/collection đúng | Nghiệp vụ phải khớp | Dấu hiệu sai mapping |
| --- | --- | --- | --- | --- | --- |
| `/accounting/cash` | `CashReceiptsPage.tsx` | `GET/POST/PATCH/DELETE /api/accounting/cash-transactions`, bulk `/api/accounting/cash-transactions/bulk` | `CashTransaction/cashtransactions` | Thu chi tiền mặt | Không dùng Receipt/ExpensePayment nếu UI là sổ tiền mặt import chi tiết. |
| `/accounting/cash/create` | `CashReceiptCreatePage.tsx` | Tùy UI: `POST /api/accounting/receipts` cho phiếu thu hoặc `POST /api/accounting/payments` cho phiếu chi; nếu tạo dòng sổ quỹ thì `cash-transactions` | `Receipt/receipts`, `ExpensePayment/expensepayments`, hoặc `CashTransaction` | Phải xác định rõ phiếu thu/chi hay giao dịch tiền mặt | Nếu form phiếu thu lại ghi vào bank transaction. |
| `/accounting/bank` | `BankReceiptsPage.tsx` | `GET/POST/PATCH/DELETE /api/accounting/bank-transactions` | `BankTransaction/banktransactions` | Thu chi ngân hàng | Không dùng cash transactions. |
| `/accounting/bank/create` | `BankReceiptCreatePage.tsx` | `POST /api/accounting/bank-transactions` hoặc receipt/payment nếu UI phiếu | `BankTransaction` hoặc `Receipt/ExpensePayment` | Xác định theo label UI | Sai nếu tạo tiền mặt từ trang ngân hàng. |
| `/accounting/summary` | `ReceiptsSummaryPage.tsx` | `GET /api/accounting/summary-transactions` | `SummaryTransaction/summarytransactions` | Tổng hợp thu chi | Không tự cộng hardcode từ cash/bank nếu backend có summary collection. |
| `/accounting/debt/customers` | `CustomerDebtPage.tsx` | `GET /api/accounting/debt/customers/stats`, `/summary`, `/records` | `CustomerDebtSummary/customerdebtsummaries`, `CustomerDebtRecord/customerdebtrecords` | Công nợ khách hàng, tab quá hạn/hôm nay/7 ngày | Không lấy từ `Customer.totalSpent` hoặc `SalePayment` trực tiếp cho bảng công nợ nếu đã có debt summaries/records. |
| `/accounting/debt/staff` | `StaffDebtPage.tsx` | `GET /api/accounting/debt/staff/summary` | `StaffDebtSummary/staffdebtsummaries` | Công nợ nhân viên | Không dùng `User` list làm debt table. |
| `/accounting/debt/vendors` | `VendorDebtPage.tsx` | `GET /api/accounting/debt/vendors/stats`, `/summary` | `VendorDebtSummary/vendordebtsummaries`, `VendorDebtRecord/vendordebtrecords` | Công nợ nhà cung cấp | Không lấy trực tiếp từ `Vendor.debt` nếu UI là chi tiết công nợ summary/records. |
| `/accounting/debt/initial` | `InitialDebtPage.tsx` | `POST /api/accounting/debt/opening`, `/debt/opening/bulk` | `CustomerDebtSummary`, `VendorDebtSummary`, `StaffDebtSummary` | Nhập công nợ đầu kỳ cho customer/vendor/staff | Phải update đúng summary theo `targetType`; không tạo collection mới. |
| `/accounting/entries` | `JournalEntriesPage.tsx` | `GET/POST/PATCH/DELETE /api/accounting/transaction-logs`, bulk `/transaction-logs/bulk` | `AccountingTransactionLog/accountingtransactionlogs` | Bút toán/thao tác giao dịch | Không nhầm với `LogBookEntry`. |
| `/accounting/journal` | `JournalPage.tsx` | `GET/POST/PATCH/DELETE /api/accounting/logbooks`, bulk `/logbooks/bulk` | `LogBookEntry/logbookentries` | Nhật ký chung Nợ/Có | Không dùng transaction logs nếu UI là sổ nhật ký. |
| `/accounting/installment-collection` | `InstallmentCollectionPage.tsx` | `GET/POST/PATCH/DELETE /api/accounting/installment-collections`, bulk endpoint | `InstallmentCollection/installmentcollections` | Thu hộ trả góp | Không dùng installment services. |
| `/accounting/history` | `AccountingHistoryPage.tsx` | `GET /api/accounting/transaction-logs` hoặc `/api/audit-logs` tùy label | `AccountingTransactionLog` hoặc `AuditLog` | Lịch sử kế toán phải rõ nguồn | Không dùng order/product history. |
| `/accounting/accounts` | `AccountingAccountsPage.tsx` | `GET /api/accounting/accounts-list`, CRUD `/api/accounting/accounts` | `AccountingAccount/accountingaccounts` | Tài khoản kế toán | Không hardcode hệ thống tài khoản nếu UI quản trị được. |
| `/accounting/installment` | `InstallmentServicesPage.tsx` | `GET/POST/PATCH/DELETE /api/accounting/installment-services`, settings `/installment-settings` nếu có | `InstallmentService/installmentservices`, `InstallmentSetting/installmentsettings` | Dịch vụ trả góp | Không nhầm với thu hộ trả góp. |
| Accounting invoice/report helper | page báo cáo hoặc công nợ | `GET /api/accounting/invoices`, `/api/accounting/reports/sales` | `SalePayment/salepayments` completed/refunded | Hóa đơn đã hoàn tất/refunded | Không tính draft/cancelled là doanh thu. |

### Vận hành, mẫu in, nhân viên, cài đặt

| UI route | Component | API đúng | Model/collection đúng | Nghiệp vụ phải khớp | Dấu hiệu sai mapping |
| --- | --- | --- | --- | --- | --- |
| `/tasks` | `TaskPage.tsx` | `GET/POST/PATCH/DELETE /api/tasks/projects`, `/api/tasks/tasks` | `Project/projects`, `Task/tasks` | Dự án và công việc | Không dùng hardcoded kanban/card nếu có API tasks. |
| `/print-forms` | `PrintFormsPage.tsx` | `GET/POST/PATCH/DELETE /api/print-forms` | `PrintForm/printforms` | Mẫu in, templateHtml/templateData | Không để template mẫu thành dữ liệu chính nếu UI quản trị. |
| `/staff`, `/staff/create`, `/staff/accounts`, `/staff/stats` | `StaffPage.tsx` | `GET/POST/PATCH/DELETE /api/staff`, `/api/staff/:id/stats`, `/api/staff/:id/activity`, lock/open/reset-password/logout sessions nếu có nút | `User/users`, `AuditLog/auditlogs`, `SalePayment`, `ProductRefund`, `Receipt`, `ExpensePayment` | Tài khoản nhân viên, trạng thái khóa/mở, thống kê theo user | Không dùng customer/staff debt summary cho tài khoản nhân viên. |
| `/settings` | `SettingsPage.tsx` | `/api/settings/store`, `/api/settings/security/change-password`, `/api/settings/security/change-owner-account`, `/api/settings/security/logout-user-sessions` | `StoreSetting/storesettings`, `User/users`, `AuditLog/auditlogs` | Cài đặt shop, bảo mật tài khoản | Không sửa localStorage-only nếu setting phải lưu DB. |

### Báo cáo

Hiện backend `server/src/modules/reports/reports.routes.ts` mới có endpoint chính:

- `GET /api/reports/revenue-time`
- `GET /api/reports/revenue-store`

Các route báo cáo trong `client/src/main.tsx` nhiều hơn backend hiện có. Khi kiểm tra báo cáo, Gemini phải xác định rõ trang nào đã có endpoint thật và trang nào đang thiếu API. Không được lấy dữ liệu mẫu để lấp trang thiếu API.

| UI route | Component | API đúng hiện có/kỳ vọng | Model/collection đúng | Nghiệp vụ phải khớp | Dấu hiệu sai mapping |
| --- | --- | --- | --- | --- | --- |
| `/reports/revenue/time` | `RevenueByTimePage.tsx` | `GET /api/reports/revenue-time` | `SalePayment/salepayments` status `completed`, `Order/orders`, optional `Product/products` by category | Doanh thu theo thời gian, cost, discount, order count, profit | Tính doanh thu từ orders tạo mới; tính cả draft/cancelled; số KPI mẫu. |
| `/reports/revenue/store` | `RevenueByStorePage.tsx` | `GET /api/reports/revenue-store` | `SalePayment/salepayments`, `Branch/branches`, optional `Product/products` by category | Doanh thu theo cửa hàng/chi nhánh | Không lookup branch; branchName hardcode; chia retail/wholesale tùy tiện phải được ghi nhận nếu chưa có dữ liệu thật. |
| `/reports/revenue/brand` | `RevenueByBrandPage.tsx` | Kỳ vọng cần endpoint `/api/reports/revenue-brand` nếu chưa có | `SalePayment` joined `Product.trademarkId/trademarkName`, `Trademark` | Doanh thu theo thương hiệu | Nếu page có dữ liệu nhưng backend thiếu endpoint, khả năng hardcode. |
| `/reports/revenue/staff` | `RevenueByStaffPage.tsx` | Kỳ vọng `/api/reports/revenue-staff` | `SalePayment.userId/authorId`, `User/users` | Doanh thu theo nhân viên | Không dùng staff debt summary. |
| `/reports/revenue/department` | `RevenueByDepartmentPage.tsx` | Kỳ vọng `/api/reports/revenue-department` hoặc phải chứng minh domain có department | Có thể cần `User`, `Branch`, hoặc model department nếu có | Doanh thu theo phòng ban | Nếu không có model department thì phải báo thiếu domain, không chế dữ liệu. |
| `/reports/revenue/category` | `RevenueByCategoryPage.tsx` | Kỳ vọng `/api/reports/revenue-category` | `SalePayment` joined `Product.categoryId/categoryName`, `Category` | Doanh thu theo danh mục sản phẩm | Không dùng product master count làm revenue. |
| `/reports/revenue/internal-category` | `RevenueByInternalCategoryPage.tsx` | Kỳ vọng `/api/reports/revenue-internal-category` hoặc báo thiếu field/model | `Product` field internal category nếu có | Doanh thu theo danh mục nội bộ | Nếu model không có internal category, phải báo thiếu field. |
| `/reports/revenue/product` | `RevenueByProductPage.tsx` | Kỳ vọng `/api/reports/revenue-product` | `SalePayment.items` joined `Product` | Doanh thu theo sản phẩm | Không dùng inventory qty thay cho sold qty. |
| `/reports/revenue/vendor` | `RevenueByVendorPage.tsx` | Kỳ vọng `/api/reports/revenue-vendor` | `SalePayment.items.productId -> Product.supplierName/vendorId`, `Vendor` nếu có link | Doanh thu theo nhà cung cấp | Không dùng `VendorPurchase` làm doanh thu bán ra. |
| `/reports/revenue/customer` | `RevenueByCustomerPage.tsx` | Kỳ vọng `/api/reports/revenue-customer` | `SalePayment.customerId`, `Customer` | Doanh thu theo khách hàng | Không dùng Customer.totalSpent nếu cần theo date/filter mà không sync. |
| `/reports/revenue/inventory-ratio` | `RevenueInventoryRatioPage.tsx` | Kỳ vọng `/api/reports/revenue-inventory-ratio` | `SalePayment`, `ProductBranchStock`, `Product` | Tỷ suất doanh thu / tồn kho | Không tính từ product price * qty mà bỏ doanh thu thực tế. |
| `/reports/orders/*` | các `Orders...Page.tsx` | Kỳ vọng endpoint `/api/reports/orders-*` hoặc dùng `/api/orders/manage` nếu chỉ là list/filter | `Order/orders`, `OrderSource`, `OrderCodControl`, `OrderHandover` tùy trang | Báo cáo đơn hàng online | Không dùng `SalePayment` trừ khi UI nói hóa đơn bán hàng. |
| `/reports/retail/*` | các `Retail...Page.tsx` | Kỳ vọng endpoint `/api/reports/retail-*` | `SalePayment/salepayments` status completed, `Customer`, `Branch`, `User` | Báo cáo bán lẻ | Không dùng `Order` online cho bán lẻ cửa hàng. |
| `/reports/wholesale/*` | các `Wholesale...Page.tsx` | Kỳ vọng endpoint `/api/reports/wholesale-*` | `SalePayment/salepayments` có phân loại bán sỉ/channel | Báo cáo bán sỉ | Nếu chưa có field phân loại retail/wholesale, phải báo thiếu dữ liệu domain. |
| `/reports/inventory/*` | các `Inventory...Page.tsx` | Kỳ vọng endpoint `/api/reports/inventory-*` hoặc dùng `/api/products/inventories`, `/api/warehouse/products`, `/api/warehouse/vouchers` tùy report | `Product`, `ProductBranchStock`, `InventoryProduct`, `InventoryVoucher`, `WarehouseTransfer`, `Batch`, `Branch`, `Vendor` | Báo cáo tồn/XNK/chuyển kho/lô/NCC | Không dùng product list đơn thuần cho báo cáo XNK. |
| `/reports/accounting/*` | các `Accounting...Page.tsx` | Kỳ vọng endpoint `/api/reports/accounting-*` hoặc `/api/accounting/*` nếu phù hợp | `CashTransaction`, `BankTransaction`, `SummaryTransaction`, `Receipt`, `ExpensePayment`, `LogBookEntry`, `AccountingAccount` | Báo cáo kế toán | Không lấy doanh thu bán hàng làm thu chi nếu UI là báo cáo kế toán. |
| `/reports/ledger/*` | các `Ledger...Page.tsx` | Kỳ vọng endpoint `/api/reports/ledger-*` hoặc `/api/accounting/logbooks` | `LogBookEntry`, `AccountingAccount` | Sổ kế toán theo mẫu S1/S2 | Không hardcode biểu mẫu có số liệu. |
| `/reports/customers/*` | các `Customers...Page.tsx` | Kỳ vọng endpoint `/api/reports/customers-*` hoặc `/api/customers/customers` + sales/order aggregation nếu đủ | `Customer`, `CustomerGroup`, `SalePayment`, `Order`, `Product` | Báo cáo khách hàng | Không dùng danh sách customer đơn thuần cho mọi report nếu cần purchase cycle/return rate. |
| Menu reports có link nhưng `main.tsx` chưa khai báo route | `AppLayout.tsx` links | Phải thêm route hoặc báo route/menu mismatch | Tùy report | Link menu phải render đúng trang | Nếu click menu báo 404/blank mà Gemini bỏ qua là quét nông. |

### Quy tắc kiểm tra sai collection/domain

Với mỗi route, Gemini phải trả lời các câu hỏi này trong báo cáo:

| Câu hỏi | Cách kiểm tra | Khi nào fail |
| --- | --- | --- |
| Trang này đang hiển thị thực thể nghiệp vụ gì? | Đọc tiêu đề, cột bảng, form field, action button | Không xác định được nhưng vẫn sửa code. |
| API thực tế được gọi là gì? | Playwright `page.on('request')`, `waitForResponse`, source frontend | Chỉ nhìn source mà không bắt network. |
| API đó thuộc module nào? | Đối chiếu `server/src/app.ts` và route file | Route UI sản phẩm gọi API customer/vendor/order không có lý do. |
| Backend đọc/ghi model nào? | Đọc route + model import | Endpoint đúng tên nhưng query sai model. |
| Collection có dữ liệu seed/DB đúng không? | Query qua `e2e/utils/db.ts` hoặc API response | UI hiển thị dữ liệu không có trong collection đúng. |
| Field mapping có đúng không? | So field response với cột UI | UI dùng `totalAmount` thay cho `value`, `qty` tổng thay cho branch stock, `createdAt` thay cho completedAt khi nghiệp vụ yêu cầu. |
| Filter gửi đúng params không? | Kiểm tra URL/body request | Click lọc nhưng params rỗng hoặc filter local trên data mẫu. |
| Mutation đổi đúng collection không? | POST/PATCH/DELETE response + DB query | Nút lưu thành công nhưng collection đúng không đổi. |

Ví dụ lỗi phải bắt:

- Trang tồn kho gọi `GET /api/products/products` rồi hiển thị `qty` tổng cho mọi kho. Đúng phải kiểm tra `GET /api/products/inventories` và `ProductBranchStock`.
- Báo cáo doanh thu gọi `GET /api/orders/manage` và cộng `totalAmount` của mọi order. Đúng phải dùng `SalePayment` completed cho doanh thu cửa hàng, hoặc `Order` chỉ khi report là đơn hàng online.
- Công nợ khách hàng lấy `Customer.totalSpent`. Đúng phải lấy `CustomerDebtSummary` và `CustomerDebtRecord` cho trang công nợ.
- Trả hàng bán dùng `/api/vendors/refunds`. Đúng phải dùng `/api/products/refunds`.
- Chuyển kho dùng `/api/vendors/transfers`. Đúng phải dùng `/api/warehouse/transfers`.
- Đối soát COD dùng `/api/accounting/bank-transactions`. Đúng với trang order COD phải là `/api/orders/cod-control`.
- Dashboard tồn kho lấy `Product.qty` khi đã chọn cửa hàng. Đúng phải qua `ProductBranchStock` theo branch.

## 5. Quy trình bắt buộc cho từng trang

Mỗi trang phải đi qua đủ 5 phase sau.

### Phase A: Inventory toàn bộ UI

Mở trang bằng Playwright, chờ network idle, rồi lập inventory. Không được chỉ nhìn DOM một lần. Phải kiểm tra desktop và nếu trang có responsive đáng kể thì thêm mobile.

Ghi lại tất cả:

- URL, component file nghi ngờ, module.
- Tiêu đề trang, subtitle, breadcrumbs nếu có.
- KPI/card/tổng số/biểu đồ.
- Bảng: tên cột, số dòng, row action, trạng thái empty.
- Form input: text, number, select, date range, checkbox, radio, textarea, file input.
- Filter/search/sort/pagination/tab.
- Button thường và icon button.
- Dropdown/menu popover.
- Modal/drawer/detail page.
- Toast/dialog/confirm.
- API request phát sinh khi page load.
- Console error.

Output inventory bắt buộc:

```md
## Inventory: <route>

- Component nghi ngờ: `client/src/...`
- API page load:
  - `GET /api/...` -> status 200, response shape: ...
- Vùng dữ liệu:
  - KPI: ...
  - Table: ...
  - Form: ...
- Nút/chức năng:
  - Button `<text/aria/class>`: expected behavior, API expected
  - Icon button thứ N trong `<container>`: expected behavior, API expected
- Dữ liệu nghi hardcode:
  - Text/value: ...
  - Lý do nghi ngờ: ...
  - File/line cần kiểm tra: ...
```

### Phase B: Lập testcase từ inventory

Từ Phase A, lập testcase cho từng vùng dữ liệu và từng nút.

Mỗi testcase phải có:

- ID duy nhất: `<module>-<route>-<number>`
- Mục tiêu.
- Precondition/seed data nếu cần.
- Action trên UI.
- API cần bắt hoặc gọi trực tiếp.
- Expected UI.
- Expected API/DB.
- Tiêu chí phát hiện hardcode.

Format bắt buộc:

```md
| ID | UI item | Action | API/DB evidence | Expected | Hardcode signal |
| --- | --- | --- | --- | --- | --- |
| products-list-001 | Table sản phẩm | Load `/products` | `GET /api/products` | Row chứa seed product | UI có row không nằm trong API hoặc API empty nhưng UI vẫn có dữ liệu nghiệp vụ |
```

Khi lập testcase thật, phải dùng format mở rộng sau để chống lỗi gọi sai API hoặc sai collection:

```md
| ID | UI item | Action | Expected API/domain | Actual API/domain | Expected UI/API/DB | Fail signal |
| --- | --- | --- | --- | --- | --- | --- |
| inventory-001 | Bảng tồn kho | Load `/products/inventory` | `GET /api/products/inventories` -> `Product` + `ProductBranchStock` | Điền sau khi bắt network | Row chứa seed product và stock theo branch | UI gọi `/api/products/products`, chỉ dùng `Product.qty`, hoặc API empty mà UI vẫn có tồn mẫu |
```

### Phase C: Viết hoặc cập nhật e2e spec

Tạo spec ở `e2e/tests/<module>-hardcode-audit.spec.ts` hoặc thêm vào spec hiện có nếu hợp lý.

Spec phải:

- Bắt console error.
- Bắt request/response API liên quan.
- Seed data bằng DB helper nếu cần dữ liệu ổn định.
- Không phụ thuộc dữ liệu production ngẫu nhiên.
- Kiểm tra UI khớp response hoặc DB seed.
- Test từng nút chức năng có trong inventory.
- Có cleanup test data trong `afterAll`.

Không viết test chỉ kiểm tra element visible. Visible chỉ là bước đầu, chưa đủ chứng minh không hardcode.

### Phase D: Gọi API và so sánh

Trước khi so dữ liệu, bắt buộc đối chiếu với mục `4.1. Bản đồ nghiệp vụ bắt buộc`.

Với mỗi testcase phải ghi rõ:

- `Expected API/domain`: endpoint, model, collection đúng theo map.
- `Actual API/domain`: endpoint thật UI gọi, model/collection backend thật sự đọc/ghi.
- `Domain verdict`: đúng domain, sai endpoint, sai collection, sai field mapping, thiếu API, hoặc cần bổ sung map.

Nếu `Actual API/domain` khác `Expected API/domain`, không được kết luận pass dù API trả 200.

Với từng testcase dữ liệu:

1. Bắt response thật khi UI load hoặc khi click nút.
2. Parse JSON response.
3. So sánh ít nhất một giá trị đặc trưng với UI:
   - Code sản phẩm/đơn/phiếu.
   - Tên khách hàng/nhà cung cấp/nhân viên.
   - Tổng tiền/số lượng.
   - Trạng thái.
   - Ngày.
4. Nếu API trả empty thì UI không được hiển thị dữ liệu nghiệp vụ giả.
5. Nếu API trả lỗi thì UI phải có error/empty state hợp lý, không âm thầm hiển thị dữ liệu mẫu.

Với từng nút:

- Nếu nút lọc/search/sort: request phải chứa params đúng hoặc dữ liệu UI phải thay đổi đúng theo response.
- Nếu nút tạo/sửa/xóa/lưu/xác nhận: phải có request mutation đúng method/body, UI/DB đổi đúng.
- Nếu nút export: phải có download hoặc response file đúng.
- Nếu nút print: mock `window.print` và xác nhận được gọi.
- Nếu nút mở modal/dropdown: modal/dropdown phải mở, hiển thị dữ liệu theo context record.
- Nếu nút "đang phát triển" là chủ ý hiện tại, phải ghi rõ là intentional placeholder, không tính là dữ liệu hardcode.

### Phase E: Sửa và nghiệm thu

Chỉ sửa khi đã có một trong các kết luận:

- UI hiển thị dữ liệu không có trong API/DB.
- UI không cập nhật khi API response thay đổi.
- Button không gọi API/không đổi state/không đúng route như kỳ vọng.
- API thiếu endpoint cần thiết để thay hardcode.
- Mapping response sai field.
- Loading/error/empty state khiến người dùng thấy dữ liệu sai.

Sau khi sửa:

1. Chạy lại spec vừa viết.
2. Chạy spec liên quan có sẵn.
3. Chạy build hoặc typecheck nếu sửa TypeScript/API.
4. Cập nhật báo cáo với file đã sửa, test đã chạy, pass/fail.

## 6. Template Playwright bắt network và so UI/API

Dùng template này làm nền, chỉnh selector theo từng trang.

```ts
import { test, expect } from '@playwright/test';

test.describe('<Module> hardcode audit', () => {
  test.beforeEach(async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.addInitScript(() => {
      window.print = () => console.log('Mocked window.print()');
    });
  });

  test('<route> loads data from API, not hardcoded fallback', async ({ page }) => {
    const apiResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/<endpoint>') &&
      response.request().method() === 'GET'
    );

    await page.goto('/<route>');
    await page.waitForLoadState('networkidle');

    const apiResponse = await apiResponsePromise;
    expect(apiResponse.ok()).toBeTruthy();
    const payload = await apiResponse.json();

    const items = Array.isArray(payload) ? payload : payload.data ?? payload.items ?? [];

    if (items.length === 0) {
      await expect(page.locator('table tbody tr')).toHaveCount(0);
      await expect(page.getByText(/không có|chưa có|no data/i)).toBeVisible();
      return;
    }

    const first = items[0];
    const expectedText = first.code ?? first.name ?? first.title;
    expect(expectedText).toBeTruthy();
    await expect(page.getByText(String(expectedText)).first()).toBeVisible();
  });

  test('<button/filter> sends correct API request', async ({ page }) => {
    await page.goto('/<route>');
    await page.waitForLoadState('networkidle');

    const responsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/<endpoint>') &&
      response.request().method() === 'GET'
    );

    await page.getByRole('button', { name: /lọc|tìm kiếm|search/i }).click();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();

    const url = new URL(response.url());
    expect(url.searchParams.toString()).not.toBe('');
  });
});
```

## 7. Template seed DB cho dữ liệu ổn định

Nếu trang cần dữ liệu ổn định để chứng minh UI lấy từ API, dùng `e2e/utils/db.ts`. Không seed bừa dữ liệu thật không cleanup.

```ts
import { test, expect } from '@playwright/test';
import { connectDB, closeDB } from '../utils/db';

const TEST_CODE = 'E2E_HARDCODE_AUDIT_001';

test.describe('Module hardcode audit with DB seed', () => {
  let db: any;

  test.beforeAll(async () => {
    db = await connectDB();
    await db.collection('<collection>').deleteMany({ code: TEST_CODE });
    await db.collection('<collection>').insertOne({
      code: TEST_CODE,
      name: 'Dữ liệu audit hardcode',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  test.afterAll(async () => {
    await db.collection('<collection>').deleteMany({ code: TEST_CODE });
    await closeDB();
  });

  test('UI renders seeded DB data through API', async ({ page }) => {
    const responsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/<endpoint>') &&
      response.request().method() === 'GET'
    );

    await page.goto('/<route>');
    await page.waitForLoadState('networkidle');
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();

    await expect(page.getByText(TEST_CODE)).toBeVisible();
    await expect(page.getByText('Dữ liệu audit hardcode')).toBeVisible();
  });
});
```

## 8. Cách quét DOM sâu để không bỏ sót nút

Trong Playwright, trước khi lập testcase, chạy đoạn evaluate để lấy inventory thô. Sau đó đọc lại bằng mắt và bổ sung selector tốt hơn.

```ts
const inventory = await page.evaluate(() => {
  const visible = (el: Element) => {
    const style = window.getComputedStyle(el);
    const rect = (el as HTMLElement).getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };

  const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);

  return {
    buttons: Array.from(document.querySelectorAll('button,[role="button"],a,input[type="button"],input[type="submit"]'))
      .filter(visible)
      .map((el, index) => ({
        index,
        tag: el.tagName.toLowerCase(),
        text: text(el),
        aria: el.getAttribute('aria-label'),
        title: el.getAttribute('title'),
        href: el.getAttribute('href'),
        className: (el as HTMLElement).className,
      })),
    inputs: Array.from(document.querySelectorAll('input,select,textarea'))
      .filter(visible)
      .map((el, index) => ({
        index,
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type'),
        name: el.getAttribute('name'),
        placeholder: el.getAttribute('placeholder'),
        aria: el.getAttribute('aria-label'),
        value: (el as HTMLInputElement).value,
      })),
    tables: Array.from(document.querySelectorAll('table'))
      .filter(visible)
      .map((table, index) => ({
        index,
        headers: Array.from(table.querySelectorAll('th')).map(text),
        rowCount: table.querySelectorAll('tbody tr').length,
      })),
    links: Array.from(document.querySelectorAll('a[href]'))
      .filter(visible)
      .map((el, index) => ({
        index,
        text: text(el),
        href: el.getAttribute('href'),
      })),
  };
});

console.log(JSON.stringify(inventory, null, 2));
```

Sau khi có inventory thô:

- Click từng dropdown/menu để lộ các nút ẩn rồi chạy lại inventory.
- Mở từng tab rồi chạy lại inventory.
- Mở từng modal/drawer/detail rồi chạy lại inventory.
- Nếu bảng có row actions chỉ hiện khi hover, hover từng row rồi inventory lại.
- Nếu mobile có drawer/header khác desktop, set viewport mobile rồi inventory lại.

## 9. Cách đọc source để xác nhận hardcode

Khi nghi hardcode, tìm trong component và API liên quan:

```bash
rg "mock|sample|demo|fake|placeholder|TODO|hardcode|static|dummy" client/src server/src
rg "const .*=\s*\[" client/src/modules
rg "useState\(\[" client/src/modules
rg "Array.from|new Array|Math.random" client/src/modules
```

Nhưng không được kết luận chỉ vì thấy array. Có thể đó là config cột hoặc enum hợp lệ. Phải đối chiếu:

- Array đó có phải dữ liệu nghiệp vụ hiển thị trên table/card/report không?
- Có API nào tương ứng không?
- Khi API response thay đổi, UI có đổi không?
- Nếu API lỗi, UI có hiển thị dữ liệu mẫu không?

## 10. Quy tắc sửa frontend

Khi thay hardcode bằng API:

1. Dùng `http` từ `client/src/core/api/http.ts`.
2. Tạo hoặc dùng file API helper trong `client/src/core/api` nếu module đã có pattern.
3. State tối thiểu phải có:
   - `data`
   - `loading`
   - `error`
   - filter/search/pagination state nếu có
4. Không để fallback dữ liệu mẫu sau khi API fail.
5. Empty state phải phản ánh dữ liệu thật.
6. Số tiền/số lượng/ngày phải format ở UI, nhưng giá trị gốc lấy từ API.
7. Filter phải gửi params hoặc lọc trên dataset API thật, tùy cách backend hiện có.
8. Mutation phải cập nhật UI bằng refetch hoặc cập nhật state nhất quán.

Ví dụ pattern:

```ts
const [items, setItems] = useState<Item[]>([]);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  let cancelled = false;
  setLoading(true);
  setError(null);

  http.get('/products', { params: filters })
    .then((response) => {
      if (!cancelled) setItems(response.data.data ?? response.data.items ?? response.data ?? []);
    })
    .catch((err) => {
      if (!cancelled) {
        setItems([]);
        setError(err?.response?.data?.message ?? 'Không tải được dữ liệu');
      }
    })
    .finally(() => {
      if (!cancelled) setLoading(false);
    });

  return () => {
    cancelled = true;
  };
}, [filters]);
```

## 11. Quy tắc sửa backend

Chỉ thêm/sửa API khi frontend cần dữ liệu thật mà backend chưa có endpoint hoặc endpoint trả thiếu field.

Khi sửa backend:

- Tìm route trong `server/src/modules/<module>/*.routes.ts`.
- Tìm model trong `server/src/modules/<module>/*.models.ts`.
- Giữ middleware auth hiện có.
- Không phá response shape đang được spec cũ dùng.
- Với report, kiểm tra `server/src/modules/reports/reports.routes.ts`.
- Với CRUD chuẩn, kiểm tra `server/src/core/utils/routeFactory.ts` và `server/src/core/utils/crud.ts`.
- Nếu thêm endpoint mới, thêm e2e/API evidence tương ứng.

## 12. Tiêu chí cho từng loại UI

### Bảng dữ liệu

Phải test:

- Header đúng.
- Số row khớp API hoặc ít nhất row chứa seed.
- Không hiển thị row giả khi API empty.
- Pagination đổi page và gọi API/đổi data đúng.
- Sort nếu có.
- Search/filter nếu có.
- Row action mở đúng record, không mở dữ liệu mẫu.

### KPI/card/report

Phải test:

- Giá trị số khớp API/DB seed.
- Date range/filter làm thay đổi request.
- Khi API empty, KPI về 0 hoặc empty hợp lý, không giữ số mẫu.
- Export/print nếu có.

### Form tạo/sửa

Phải test:

- Select option lấy từ API nếu là dữ liệu động.
- Submit gửi body đúng.
- Validation hiển thị khi thiếu field.
- Sau lưu, DB/API có record.
- Edit load đúng record, không load default giả.

### Modal/detail/drawer

Phải test:

- Mở từ đúng row.
- Nội dung modal chứa ID/code/name của record được chọn.
- Nếu modal cần API detail, phải bắt request detail.
- Đóng modal hoạt động.

### Dropdown/filter/tab

Phải test:

- Dropdown mở đầy đủ option.
- Option động khớp API.
- Chọn option làm request hoặc data thay đổi.
- Tab nào cũng được inventory riêng, không chỉ tab đầu tiên.

## 13. Báo cáo bắt buộc sau mỗi module

Sau khi hoàn thành một module, tạo hoặc cập nhật file báo cáo:

```text
docs/hardcode-audit/<module>.md
```

Format:

~~~md
# Hardcode Audit: <module>

## Routes đã quét

| Route | Component | Inventory done | Testcase done | E2E done | Fix done | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `/products` | `client/src/...` | yes | yes | yes | yes/no | pass/fail |

## Phát hiện

| ID | Route | Loại lỗi | Bằng chứng | File sửa | Trạng thái |
| --- | --- | --- | --- | --- | --- |

## Đối chiếu API/domain

| Route | Expected API/domain theo map | Actual API/domain bắt được | Verdict | Ghi chú sửa |
| --- | --- | --- | --- | --- |

## Test đã chạy

```bash
cd e2e
npx playwright test tests/<module>-hardcode-audit.spec.ts --project=chromium
```

Kết quả: pass/fail.

## Còn lại

- ...
~~~

Không được báo "đã quét toàn bộ" nếu bảng trên chưa có đủ route của module.

## 14. Checklist nghiệm thu cuối cùng

Một module chỉ được coi là xong khi tất cả đều đạt:

- Có inventory từng route.
- Có testcase từng vùng dữ liệu và từng nút.
- Có e2e chạy được.
- Mỗi dữ liệu nghiệp vụ quan trọng có bằng chứng API/DB.
- Không còn UI hiển thị dữ liệu mẫu khi API empty/error.
- Nút chức năng không còn "click không làm gì" trừ khi được ghi rõ intentional placeholder.
- Spec liên quan pass.
- Không phát sinh console error nghiêm trọng.
- Báo cáo module đã cập nhật.

Toàn dự án chỉ được coi là xong khi:

- Tất cả route trong `client/src/main.tsx` đã được phân loại: done, intentionally skipped, route missing, hoặc blocked.
- Tất cả hardcode nghiệp vụ đã được fix hoặc có lý do kỹ thuật rõ ràng.
- E2E audit mới và e2e liên quan đều pass.
- Có báo cáo tổng hợp `docs/hardcode-audit/README.md`.

## 15. Quy trình làm việc đề xuất cho Gemini

Làm theo vòng lặp này, từng module một:

1. Đọc `client/src/main.tsx`, `client/src/core/layout/AppLayout.tsx`, component route và route backend liên quan.
2. Đối chiếu route với mục `4.1. Bản đồ nghiệp vụ bắt buộc` để xác định API/model/collection đúng trước.
3. Mở trang bằng Playwright.
4. Bắt toàn bộ request/response để ghi `Actual API/domain`.
5. So `Expected API/domain` với `Actual API/domain`; nếu sai domain, ưu tiên sửa mapping trước khi sửa UI.
6. Chạy DOM inventory desktop.
7. Mở tất cả dropdown/tab/modal/drawer/menu row action rồi inventory lại.
8. Nếu cần, chạy mobile inventory.
9. Ghi inventory vào báo cáo module.
10. Lập testcase table cho từng UI item, có cột Expected/Actual API domain.
11. Viết e2e spec.
12. Chạy spec để xác nhận lỗi.
13. Sửa frontend/backend đúng phạm vi.
14. Chạy lại spec.
15. Chạy spec liên quan sẵn có.
16. Cập nhật báo cáo.
17. Sang route tiếp theo.

## 16. Câu lệnh bắt đầu cho Gemini

Khi bắt đầu, hãy phản hồi bằng kế hoạch ngắn, sau đó làm ngay module đầu tiên. Không hỏi lại nếu không bị thiếu thông tin nghiêm trọng.

Prompt gợi ý:

```text
Hãy làm theo file `docs/GEMINI_HARDCODE_DATA_AUDIT.md`.

Trang hoặc route cần kiểm tra: `<dán route/link ở đây>`

Yêu cầu bắt buộc:
1. Trước tiên đọc mục `4.1. Bản đồ nghiệp vụ bắt buộc` trong file MD.
2. Xác định `Expected API/domain` của route: endpoint đúng, model đúng, collection đúng, field nghiệp vụ đúng.
3. Mở trang bằng Playwright/e2e, bắt toàn bộ network request/response để lấy `Actual API/domain`.
4. So sánh `Expected API/domain` với `Actual API/domain`. Nếu UI có gọi API thật nhưng gọi sai endpoint, sai collection, sai model, sai field mapping hoặc sai nghiệp vụ thì vẫn phải coi là lỗi.
5. Inventory toàn bộ UI: nút, icon button, dropdown, filter, search, date picker, tab, pagination, table, KPI/card, modal/drawer, row action, toast/dialog/confirm, empty/loading/error state.
6. Lập testcase cho từng UI item bằng format có cột `Expected API/domain` và `Actual API/domain`.
7. Gọi/bắt API cho từng testcase và so UI với API/DB seed.
8. Nếu có hardcode, sai dữ liệu, thiếu API, sai collection hoặc button không đúng nghiệp vụ thì sửa frontend/backend đúng phạm vi.
9. Viết hoặc cập nhật e2e Playwright trong `e2e/tests`.
10. Chạy test liên quan, nếu fail thì tự đọc log và sửa lại.
11. Cập nhật báo cáo trong `docs/hardcode-audit/<module>.md`, bắt buộc có bảng đối chiếu Expected API/domain vs Actual API/domain.

Không được kết luận bằng quan sát nông. Không được kết luận pass chỉ vì API trả 200. Mỗi kết luận phải có bằng chứng network/API/DB/source code.
```
