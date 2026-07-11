# Browser self-check — Bán lẻ

- Bắt đầu: 2026-07-11T17:47:52.576Z
- Kết thúc: 2026-07-11T17:49:14.073Z
- Tổng: 26 | PASS: 25 | FAIL: 0 | INFO: 1 | SKIPPED: 0

## Kết quả từng check

- **M01_LOGIN**: PASS — token set
- **M02_LIST_LOAD**: PASS — url=http://localhost:5173/sales-channels/store/retail; rows=15 *(01-list-desktop.png)*
- **M03_KPI**: PASS — {"kpi":[{"label":"Tổng hóa đơn","value":"2.108"},{"label":"Đang hiển thị","value":"1–15"},{"label":"Tổng tiền trang","value":"70.208.200 ₫"},{"label":"Đã thu trang","value":"70.208.200 ₫"}],"firstRowTotal":"2.000.000 ₫"} *(02-kpi.png)*
- **M04_ENCODING**: PASS — mojibake=false; hasVi=true
- **M05_FILTER_EMPTY**: PASS *(03-filter-empty.png)*
- **M06_FILTER_RESET**: PASS — rows=15
- **M07_ADMIN_MENU**: PASS — [" Xem chi tiết"," In hóa đơn"," In hóa đơn quà tặng"," Đổi trả hàng"," Sửa đơn hàng"," Xóa hóa đơn"] *(04-admin-menu.png)*
- **M08_GIFT_PRINT_STATE**: PASS — giftDisabled=true (state-only, no gift print submit)
- **M09_PRINT_MENU**: PASS — {"ready":true,"stuck":false,"hasMoney":true,"hasCode":true,"len":4459,"detailStatus":200,"head":"<!DOCTYPE html><html lang=\"vi\"><head> <meta charset=\"utf-8\"> <title>HÓA ĐƠN BÁN HÀNG</title> <style> @page { margin: 2mm; } * { box-sizing: border-box; } html, body { width: 76mm; "} *(05-print-popup.png)*
- **M10_DETAIL_MODAL**: PASS — code=BH260706084144; snippet=Khách hàng
Tên khách hàng
CHỊ NINH
Số điện thoại
0904605966
Mã khách hàng
—
Trạng thái
Hoàn tất
Sản phẩm (1)
#	SẢN PHẨM	 *(06-detail-modal.png)*
- **M11_PRINT_DETAIL**: PASS — popup handled *(07-print-from-detail.png)*
- **M12_EXPORT_MODAL**: PASS *(08-export-modal.png)*
- **M13_BRANCH_MODAL**: PASS — branches=3 *(09-branch-modal.png)*
- **M14_CREATE_FORM_NO_404**: PASS — {"routeError":false,"pmStatus":200,"probe":{"a":200,"b":200,"items":0},"hasSave":true,"hasFormTitle":true,"paymentMethodsInDb":0,"url":"http://localhost:5173/sales-channels/store/retail/create?branchId=1","snippet":"A Admin Tổng quan Sản phẩm Kho hàng Kênh bán - Cửa hàng Khách hàng Báo Cáo Quản lý nhân viên Cài đặt Thêm hóa đơn bán lẻ Kho Hà Nội (HN) Lưu hóa đơn Thông tin chung Kho thực hiện * — Chọn kho thực hiện — Kho Hà Nội (HN) Kho HCM (HCM) Kho LUXY (KHOLUXY) Mã hóa đơn Nhân viên bán hà"} *(10-create-form.png)*
- **M15_PAYMENT_METHODS_DATA**: INFO — Bảng payment_methods rỗng — form không 404 nhưng không có method để chọn. Cần import data nếu muốn bán thật.
- **M16_BACK_WITHOUT_SAVE**: PASS — http://localhost:5173/sales-channels/store/retail
- **M17_REFUND_NAV**: PASS — http://localhost:5173/sales-channels/store/refund/create?saleId=fa106e3cd265bfd4cc36eca4 (KHÔNG bấm xác nhận) *(11-refund-form.png)*
- **M18_LEGACY_REDIRECT**: PASS — http://localhost:5173/sales-channels/store/retail
- **M19_12_MOBILE_360**: PASS — {"sw":360,"cw":360,"ok":true} *(12-mobile-360.png)*
- **M19_13_MOBILE_390**: PASS — {"sw":390,"cw":390,"ok":true} *(13-mobile-390.png)*
- **M19_14_MOBILE_412**: PASS — {"sw":412,"cw":412,"ok":true} *(14-mobile-412.png)*
- **M19_15_DESKTOP_1024**: PASS — {"sw":1024,"cw":1024,"ok":true} *(15-desktop-1024.png)*
- **M19_16_DESKTOP_1440**: PASS — {"sw":1440,"cw":1440,"ok":true} *(16-desktop-1440.png)*
- **M20_KEYBOARD_FOCUS**: PASS — active=ID hóa đơn
- **M21_NO_PAYMENT_404**: PASS — []
- **M22_NO_WRITE_REQUESTS**: PASS — []

## An toàn
- Write API (trừ login): 0
- Payment methods 404: 0
- Console errors: 0
- Page errors: 0

## Screenshots
Thư mục: `c:\Users\tiend\Desktop\LadyStars-PHP\e2e-artifacts\retail-manual-browser-check\screenshots`
