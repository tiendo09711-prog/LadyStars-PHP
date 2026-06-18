# PRODUCTS UI Function Map - Phần liên quan tab Sản phẩm nhà cung cấp

File này chỉ ghi các chức năng mẫu của tab `Sản phẩm nhà cung cấp` mà hệ thống hiện tại chưa có logic/API phù hợp, theo yêu cầu của task `/vendors`.

| Chức năng mẫu | Hiện trạng code/API | Kết luận |
| --- | --- | --- |
| Model/API quan hệ riêng giữa nhà cung cấp và sản phẩm | Không có model hay route supplier-product | Không tự tạo backend/API |
| Field ID quan hệ | Product chỉ có `_id`; file Excel có ID quan hệ riêng | Không map `_id` Product thành ID quan hệ |
| Field Lô hàng | Chưa xác định field tương ứng trên Product | Không hardcode |
| Field Mã NCC | Vendor có `code`, Product chỉ có `supplierName` | Không suy diễn mã NCC từ tên |
| Field Mã sản phẩm NCC | Chưa có schema/logic xác định | Không hardcode |
| Import `Nhanh.vn_Import_Supplier_Product_v0.1.0.xlsm` | Endpoint `/products/products/import` không tương thích, nhưng Product có PATCH `supplierName` | Đã triển khai import client-side bằng GET dữ liệu đối chiếu và PATCH product khớp chính xác |
| Import `Nhanh.vn_Supplier_Product_Index_2026-06-18_143552.xlsx` | File có 288 dòng `ID`, `Nhà cung cấp`, `Mã SP`, `Tên SP` | Đã cập nhật 287 product khớp mã; bỏ qua 1 dòng thiếu mã và không tồn tại product trùng tên |
| Filter “Lặp” | Chưa có field/logic | Không triển khai giả |
| Export Google Sheets | Chưa có integration | Không triển khai giả |
| Xóa nhiều dòng bằng một request | Không có bulk-delete endpoint | Nếu cần UI, chỉ có thể gọi tuần tự DELETE endpoint cũ sau confirm |
