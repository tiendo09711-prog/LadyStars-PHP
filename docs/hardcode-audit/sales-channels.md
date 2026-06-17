# Báo cáo Audit Hardcode: Kênh bán hàng (Sales Channels) - Bán sỉ & Trả hàng

## 1. Bản đồ nghiệp vụ & Kiểm tra API/Domain

### Kênh Bán Sỉ (`/sales-channels/store/wholesale`)

| Câu hỏi | Kết quả kiểm tra | Trạng thái |
| --- | --- | --- |
| Trang này đang hiển thị thực thể nghiệp vụ gì? | Hóa đơn bán sỉ | Pass |
| API thực tế được gọi là gì? | `GET /api/products/sales?code=BHS` | Pass |
| API đó thuộc module nào? | Bán hàng (`products/sales`) | Pass |
| Backend đọc/ghi model nào? | `SalePayment/salepayments` | Pass |
| Collection có dữ liệu seed/DB đúng không? | Có, UI hiển thị đúng dữ liệu từ API, không dùng array mẫu. | Pass |
| Field mapping có đúng không? | Đúng, `value`, `amountProducts`, `status` được map chuẩn. | Pass |
| Filter gửi đúng params không? | Tham số `code=BHS` được gửi mặc định từ config của trang. | Pass |
| Mutation đổi đúng collection không? | `POST /api/products/sales` và `POST /api/products/sales/:id/complete` tạo hóa đơn sỉ thành công. | Pass |

### Kênh Bán Lẻ (`/sales-channels/store/retail`)

| Câu hỏi | Kết quả kiểm tra | Trạng thái |
| --- | --- | --- |
| Trang này đang hiển thị thực thể nghiệp vụ gì? | Hóa đơn bán lẻ | Pass |
| API thực tế được gọi là gì? | `GET /api/products/sales?channel=store` | Pass |
| API đó thuộc module nào? | Bán hàng (`products/sales`) | Pass |
| Backend đọc/ghi model nào? | `SalePayment/salepayments` | Pass |
| Collection có dữ liệu seed/DB đúng không? | Có, UI hiển thị đúng dữ liệu từ API. | Pass |
| Field mapping có đúng không? | Đúng, `value`, `amountProducts`, `status` được map chuẩn. | Pass |
| Mutation đổi đúng collection không? | Sử dụng endpoint `/api/products/sales` để sửa/xóa/tạo. | Pass |
| Nút "Trả hàng - đổi hàng" có gọi API hoặc navigate đúng không? | Navigate tới `/sales-channels/store/refund/create?saleId=...` chính xác, và pass param chuẩn. | Pass |
| Nút "Sửa thông tin" có gọi API hoặc navigate đúng không? | Navigate tới `/sales-channels/store/retail/create?editId=...` chính xác, và pass param chuẩn. | Pass |

### Kênh Trả Hàng (`/sales-channels/store/refund`)

| Câu hỏi | Kết quả kiểm tra | Trạng thái |
| --- | --- | --- |
| Trang này đang hiển thị thực thể nghiệp vụ gì? | Hóa đơn trả hàng | Pass |
| API thực tế được gọi là gì? | `GET /api/products/refunds` | Pass |
| API đó thuộc module nào? | Bán hàng (`products/refunds`) | Pass |
| Backend đọc/ghi model nào? | `ProductRefund/productrefunds` | Pass |
| Collection có dữ liệu seed/DB đúng không? | Có, UI hiển thị đúng dữ liệu từ API, không dùng array mẫu. | Pass |
| Field mapping có đúng không? | Đúng, `code`, `paymentId.code` (hóa đơn gốc), `amountProducts`, `value`, `status` được map chuẩn. | Pass |
| Filter gửi đúng params không? | Tham số query và filter chuẩn được gửi lên. | Pass |
| Mutation đổi đúng collection không? | Sử dụng endpoint `/api/products/refunds` để sửa/xóa/tạo. Nút "Thêm mới" mở modal chọn Branch từ API. | Pass |

## 2. Testcases 

| ID | UI item | Action | Expected API/domain | Actual API/domain | Expected UI/API/DB | Fail signal |
| --- | --- | --- | --- | --- | --- | --- |
| wholesale-list-001 | Bảng hóa đơn sỉ (Tab Hóa đơn bán sỉ) | Load `/sales-channels/store/wholesale` | `GET /api/products/sales?code=BHS` -> `SalePayment` | `GET /api/products/sales?code=BHS` -> `SalePayment` | Row chứa seed data, nếu rỗng hiện "Chưa có dữ liệu phù hợp" | UI gọi `/api/orders/manage`, dùng `Order` collection, hoặc API empty mà UI vẫn có data |
| wholesale-list-002 | Bảng hóa đơn sỉ (Tab Có chiết khấu) | Click tab "Có chiết khấu" | `GET /api/products/sales?code=BHS` -> `SalePayment` | `GET /api/products/sales?code=BHS` -> `SalePayment` | Bảng cập nhật hiển thị cột chiết khấu | Không gọi API khi chuyển tab, chỉ filter local giả |
| wholesale-list-003 | Bảng hóa đơn sỉ (Tab Có công nợ) | Click tab "Có công nợ" | `GET /api/products/sales?code=BHS` -> `SalePayment` | `GET /api/products/sales?code=BHS` -> `SalePayment` | Bảng cập nhật hiển thị cột nợ/đã trả | Dùng API kế toán công nợ thay vì sales |
| wholesale-create-001 | Nút Tạo hóa đơn sỉ | Click "Tạo hóa đơn sỉ" | `GET /api/system/branches` -> `Branch` | `GET /api/system/branches` -> `Branch` | Hiện Modal chọn chi nhánh | Hardcode danh sách chi nhánh trong code frontend |
| wholesale-create-002 | Lưu hóa đơn sỉ | Điền form và click "Lưu" ở `/sales-channels/store/wholesale/create` | `POST /api/products/sales` -> `SalePayment` | `POST /api/products/sales` -> `SalePayment` | Redirect về list và Toast báo thành công | Lưu local storage, hoặc gọi sai sang warehouse export |
| refund-list-001 | Bảng hóa đơn trả hàng | Load `/sales-channels/store/refund` | `GET /api/products/refunds` -> `ProductRefund` | `GET /api/products/refunds` -> `ProductRefund` | Row chứa seed data, nếu rỗng hiện "Chưa có dữ liệu phù hợp" | Dùng vendor refund (`/api/vendors/refunds`), array tĩnh |
| refund-create-001 | Nút Thêm mới | Click "Thêm mới" | `GET /api/system/branches` -> `Branch` | `GET /api/system/branches` -> `Branch` | Hiện Modal chọn chi nhánh nhận trả hàng | Hardcode danh sách chi nhánh, không gọi `/api/system/branches` |
| retail-list-row-action-001 | Row Action: Sửa thông tin | Click vào menu row action (dấu ...) và chọn Sửa thông tin | Navigate tới UI `/sales-channels/store/retail/create?editId=` | N/A (chuyển trang) | Chuyển trang đúng URL | Không chuyển trang, form tạo hóa đơn không nhận data |
| retail-list-row-action-002 | Row Action: Trả hàng | Click vào menu row action (dấu ...) và chọn Trả hàng - đổi hàng | Navigate tới UI `/sales-channels/store/refund/create?saleId=` | N/A (chuyển trang) | Chuyển trang đúng URL | Không chuyển trang, form trả hàng không nhận data |
| refund-list-row-action-001 | Row Action: Sửa | Click vào dấu `...` và chọn "Sửa", sửa form và click "Lưu" | `PATCH /api/products/refunds/:id` -> `ProductRefund` | `PATCH /api/products/refunds/:id` -> `ProductRefund` | Cập nhật DB và UI table reload thành công | 404 Not Found (lỗi trước đó), hoặc status completed nhưng không chạy logic nhập tồn kho |

## 3. Các thay đổi đã thực hiện (Hardcode/Bug Fix)

### Xóa nút "Nhập dữ liệu"

- Theo yêu cầu: Phần "Nhập dữ liệu" không cần thiết vì người dùng sẽ nhập thủ công trên giao diện.
- File đã sửa: 
  - `client/src/modules/sales/WholesaleInvoicePage.tsx`
  - `client/src/modules/sales/RefundInvoicePage.tsx`
### Fix lỗi nút "Sửa" hóa đơn trả hàng (Missing PATCH Endpoint & Business Logic)

- Nút "Sửa" trên trang `/sales-channels/store/refund` bị lỗi 404 khi lưu vì backend thiếu endpoint `PATCH /api/products/refunds/:id`.
- Đã bổ sung endpoint này vào `server/src/modules/product/product.routes.ts`.
- **Nghiệp vụ quan trọng**: Bổ sung xử lý khi người dùng đổi trạng thái từ "draft" sang "completed" qua form "Sửa" này, hệ thống sẽ tự động gọi logic `completeProductRefund()` để nhập lại tồn kho và cập nhật doanh thu chính xác, thay vì chỉ đổi text status một cách nguy hiểm như trước.

## 4. Tình trạng chạy Test E2E

- File: `e2e/tests/sales-channel-refund-audit.spec.ts`, `e2e/tests/sales-channel-retail-audit.spec.ts` và các spec trước đó.
- Nội dung: Đã verify list hóa đơn (sỉ và trả hàng), flow API trả hàng sử dụng `/api/products/refunds`, kiểm tra 2 row actions (Sửa thông tin và Trả hàng) trên trang hóa đơn lẻ, và kiểm tra nút "Sửa" hóa đơn trả hàng chạy đúng 200 OK.
- Trạng thái: Passed.
