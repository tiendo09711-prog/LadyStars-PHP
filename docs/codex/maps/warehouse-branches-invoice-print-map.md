# Warehouse Branches Invoice Print Map

Route: /warehouse/branches

## Component/API/state
- Component chính: client/src/modules/warehouse/WarehouseBranchesPage.tsx
- Style: client/src/modules/warehouse/warehouseBranchesPage.css
- API đọc/ghi kho: client/src/core/api/branch.api.ts
- Cấu hình in hiện có: branch.invoiceProfile
- Helper dùng lại cấu hình in: buildInvoiceProfile(branch, storeSetting)

## Handler hiện có được giữ nguyên
- listBranches/getBranch/getStoreSetting để tải danh sách, chi tiết kho và thông tin cửa hàng.
- createBranch/updateBranch/setDefaultBranch/activateBranch/deactivateBranch/deleteBranch giữ nguyên endpoint và payload.
- getBranchUsage giữ nguyên cho kiểm tra liên kết trước khi xóa.
- printPreview chỉ mở popup preview mẫu hóa đơn, không gọi API.

## Điểm in hóa đơn khảo sát
- client/src/modules/warehouse/WarehouseBranchesPage.tsx: render preview và popup in thử cấu hình.
- client/src/modules/sales/RetailInvoicePage.tsx: sở hữu buildPrintDocument và window.open để in hóa đơn bán lẻ; dùng cho tiêu đề bán lẻ/tặng quà/đổi trả khi dữ liệu trả về đi qua trang này.
- client/src/modules/sales/WholesaleInvoicePage.tsx: không tìm thấy renderer in bằng window.open/window.print trong phạm vi khảo sát.
- client/src/modules/sales/RefundInvoicePage.tsx: không tìm thấy renderer in bằng window.open/window.print trong phạm vi khảo sát.
- client/src/modules/sales/*CreatePage.tsx: không sở hữu mẫu render in hóa đơn trong phạm vi tìm kiếm, chỉ có comment mock print ở WholesaleInvoiceCreatePage.tsx.

## Quy tắc giữ nguyên
- Không thêm endpoint/API mới.
- Không sửa backend/schema/database/permission.
- Không đổi mapping request/response hoặc logic tính tiền.
- Chỉ thay đổi giao diện phần cấu hình in và HTML/CSS mẫu in.
