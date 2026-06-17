# Hardcode Audit Report: Orders

## 1. Route: `/orders/manage`

### Bản đồ nghiệp vụ (API Mapping)

| UI route | API expected | API actual | Domain verdict |
| --- | --- | --- | --- |
| `/orders/manage` | `GET/POST/PATCH/DELETE /api/orders/manage`, `POST /api/orders/manage/bulk-action` | `GET/POST/PATCH/DELETE /api/orders/manage`, `POST /api/orders/manage/bulk-action` | **Pass**. Đúng endpoint, đúng model (`Order/orders`). |
| Dropdown Kho hàng | `GET /api/system/branches` | `GET /api/system/branches` | **Pass**. |
| Dropdown Biên bản bàn giao | `GET /api/orders/handover` | `GET /api/orders/handover` | **Pass**. |
| Export Data | Không cần API riêng, parse data client | Parse từ items hiện tại trên UI | **Pass**. |

### Inventory và Testcases

| ID | UI item | Action | Expected API/domain | Actual API/domain | Expected UI/API/DB | Fail signal |
| --- | --- | --- | --- | --- | --- | --- |
| orders-manage-001 | Bảng đơn hàng | Load `/orders/manage` | `GET /api/orders/manage` -> `Order` | `GET /api/orders/manage` | Row chứa các đơn hàng online. Nếu rỗng không hiện số liệu giả. | UI có row ảo, API rỗng nhưng UI có dữ liệu |
| orders-manage-002 | Select Kho hàng | Click filter/create Kho | `GET /api/system/branches` -> `Branch` | `GET /api/system/branches` | Select box lấy list từ branches. | Có danh sách kho text cứng |
| orders-manage-003 | Gán BB bàn giao | Click "Thêm đơn vào biên bản bàn giao" | `GET /api/orders/handover` -> `OrderHandover` | `GET /api/orders/handover` | Select box lấy list các biên bản. | Danh sách biên bản rỗng mà vẫn hiện số liệu ảo |
| orders-manage-004 | Đổi trạng thái hàng loạt | Click "Đổi trạng thái" -> Lưu | `POST /api/orders/manage/bulk-action` | `POST /api/orders/manage/bulk-action` | Trạng thái update DB và reload table | Lưu localStorage hoặc chỉ thay đổi state component |

### Kết luận

- **Không phát hiện hardcode lỗi**. Các dropdown như Trạng thái, PT Thanh toán, Vận chuyển đều lưu trữ trực tiếp string enum trong DB (được cho phép theo rule "Danh sách trạng thái nghiệp vụ cố định thật sự là enum").
- Data bảng đơn hàng, filter kho, filter biên bản bàn giao đều fetch trực tiếp từ Backend.
- Hành động bulk action đều được gọi API `/bulk-action` backend hỗ trợ cập nhật chuẩn nghiệp vụ.
