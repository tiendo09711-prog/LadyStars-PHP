# Kế hoạch Hoàn thiện Dữ liệu Trang Tổng Quan (Dashboard)

Theo yêu cầu của bạn, tôi đã kiểm tra toàn bộ các phần trên trang Tổng quan và đối chiếu với database. Vấn đề hiện tại là một số bảng trên UI đang bị "cứng" (hardcode "Chưa có dữ liệu" hoặc "-100%") và chưa map đúng với dữ liệu mà API trả về.

## User Review Required
> [!IMPORTANT]
> - Các giá trị Ví (Zalo OA, Ví doanh thu, Ví Ads) hiện tại chưa có collection cụ thể trong database để lưu trữ số dư. Tạm thời tôi sẽ tính toán **Ví doanh thu** từ tổng các Phiếu Thu (`Receipt`) và **Ví Ads** từ tổng các Phiếu Chi (`ExpensePayment`) có liên quan, hoặc tạo một collection `Wallet` mới để bạn có thể cấu hình linh hoạt. Bạn muốn sử dụng phương án nào? (Trong kế hoạch này tôi đề xuất tạo collection `Wallet` để đúng yêu cầu "linh hoạt, được truy cập").
> - Script tạo dữ liệu test `create-mock-invoice.js` sẽ được tạo trong thư mục `scratch/` để bạn chạy thử và kiểm chứng biểu đồ vẽ đúng ngày hôm nay.

## Proposed Changes

### 1. Database & Backend (`server/src/modules/dashboard/dashboard.routes.ts` & `server/src/core/system/system.models.ts`)
- **[NEW] Collection Wallet**: Thêm model `Wallet` (Ví) để lưu trữ linh hoạt các ví như Zalo OA, Shopee, Ads.
- **[MODIFY] API `/dashboard`**:
  - Truy vấn trực tiếp từ bảng `Wallet` thay vì hardcode `zaloOA: 0`, v.v.
  - Sửa lại hàm `$dateFromString` của `RetailInvoice` và `WholesaleInvoice` trong MongoDB để tránh lỗi parse khi ngày không có số 0 ở đầu (VD: `1/6/2026` thay vì `01/06/2026`), giúp biểu đồ luôn nhận đúng doanh thu.

### 2. Giao diện (`client/src/modules/dashboard/DashboardPage.tsx`)
- **[MODIFY] Bảng Kênh bán**: Xóa logic hiển thị `-100%` khi doanh thu = 0 (gây hiểu nhầm là lỗi). Trả về hiển thị số 0 bình thường.
- **[MODIFY] Bảng Đơn hàng**: Xóa dòng hardcode `Chưa có dữ liệu`. Map trực tiếp biến `orderChannels` (Đã được backend trả về) vào các cột của bảng (Đơn mới, Đang đóng gói, Đang chuyển, Hoàn hủy).
- **[MODIFY] Bảng Số dư & Ví**: Xóa dòng hardcode `Chưa có dữ liệu`. Render danh sách các ví lấy từ API.

### 3. Script kiểm thử (`scratch/create-mock-invoice.js`)
- **[NEW] Script sinh dữ liệu thực tế**: Script này sẽ kết nối DB, tạo ra 1 `Product`, 1 `SalePayment` (để test Sản phẩm bán chạy và Đơn hàng) và 1 `RetailInvoice` (để test biểu đồ doanh thu) với **ngày hôm nay**. Sau khi chạy script, bạn có thể F5 Dashboard để thấy biểu đồ mọc lên.

## Verification Plan
1. Chạy script `node scratch/create-mock-invoice.js`.
2. Truy cập Dashboard, kiểm tra Biểu đồ "Doanh thu theo thời gian" xem có điểm nhô lên ở "Hôm nay" không.
3. Kiểm tra mục "Đơn hàng" xem có hiển thị các trạng thái đơn thay vì "Chưa có dữ liệu".
4. Thử thay đổi số dư trong DB (collection Wallet mới) và xem "Số dư" có cập nhật linh hoạt không.

- `[ ]` Thêm Wallet model và cập nhật backend router.
- `[ ]` Sửa UI `DashboardPage.tsx` để hiển thị mảng `orderChannels` và `wallets`.
- `[ ]` Tạo script sinh dữ liệu mock.
