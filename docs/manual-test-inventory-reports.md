# Kịch bản kiểm thử thủ công đầy đủ — Báo cáo Kho hàng

## 1. Phạm vi

Tài liệu này áp dụng cho ba tab/trang:

1. `http://localhost:5173/reports/inventory/in-out-stock` — **Xuất nhập tồn**.
2. `http://localhost:5173/products/inventory` — **Tồn kho**.
3. `http://localhost:5173/products/storage-duration` — **Tuổi tồn**.

Mục tiêu kiểm thử:

- Kiểm tra toàn bộ nút, field, tab, link, biểu đồ, tooltip, bảng, sort, phân trang và modal.
- Kiểm tra KPI, biểu đồ, breakdown, bảng và file xuất đồng bộ với bộ lọc.
- Kiểm tra loading, empty, error, retry, dữ liệu biên và thao tác nhanh liên tiếp.
- Kiểm tra desktop, tablet, mobile, keyboard và vị trí giao diện.
- Không thực hiện thao tác ghi dữ liệu thật nếu chưa có môi trường test cô lập.

Nguyên tắc verdict: kết quả mong đợi trong tài liệu là hợp đồng cần đạt theo yêu cầu báo cáo. Nếu UI hiện tại khác kết quả mong đợi (kể cả khác biệt đã tồn tại trong source), đánh dấu `FAIL`, không đổi thành `PASS` chỉ vì đó là hành vi hiện tại.

## 2. Quy ước ghi kết quả

Mỗi test case đánh dấu một trong các giá trị:

- `PASS`: đúng toàn bộ kết quả mong đợi.
- `FAIL`: sai ít nhất một kết quả; ghi actual, URL, thời gian và chụp ảnh.
- `BLOCKED`: không có fixture/quyền/môi trường để thực hiện.
- `N/A`: chức năng không xuất hiện theo capability hoặc dữ liệu hiện tại.

Mẫu ghi lỗi tối thiểu:

```text
Test ID:
URL + query:
Tài khoản/quyền:
Fixture hoặc mã chứng từ/sản phẩm/kho:
Các bước đã làm:
Expected:
Actual:
Console error:
Network request/response:
Screenshot/video:
```

## 3. Chuẩn bị dữ liệu kiểm thử

Không thể xác minh số liệu chỉ bằng cảm quan. Trước phiên test, chuẩn bị hoặc xác định các fixture đọc được sau đây. Không tạo/sửa dữ liệu thật chỉ để test nếu chưa được cho phép.

| Fixture | Dữ liệu cần có |
| --- | --- |
| `F-WH-A` | Kho A có tồn và có giao dịch nhập/xuất trong khoảng test. |
| `F-WH-B` | Kho B có số liệu khác Kho A. |
| `F-WH-EMPTY` | Kho không có giao dịch hoặc không có tồn trong khoảng test. |
| `F-P-IMPORT` | Sản phẩm chỉ có nhập trong kỳ. |
| `F-P-EXPORT` | Sản phẩm chỉ có xuất trong kỳ. |
| `F-P-BOTH` | Sản phẩm có cả nhập và xuất trong kỳ. |
| `F-P-ZERO` | Sản phẩm hết tồn hoặc không thuộc kết quả “Còn tồn”. |
| `F-P-LOCKED` | Có tồn nhưng toàn bộ/một phần bị khóa để phân biệt “Còn tồn” và “Còn tồn có thể bán”. |
| `F-P-UNSOLD-29/30/31` | Chưa bán lần nào, tuổi từ nhập lần lượt 29/30/31 ngày. |
| `F-P-SLOW-29/30/31` | Đã bán, số ngày từ bán cuối lần lượt 29/30/31 ngày. |
| `F-P-AGE-60/61/90/91` | Sản phẩm ở biên bucket tuổi tồn 60/61/90/91 ngày. |
| `F-CAT-A/B` | Hai danh mục có tập sản phẩm khác nhau. |
| `F-NAME-LONG` | Sản phẩm/kho có tên rất dài và có Unicode tiếng Việt. |
| `F-MANY-WH` | Ít nhất 10–14 kho để kiểm tra biểu đồ và bảng cuộn ngang. |
| `F-MANY-ROWS` | Kết quả nhiều hơn 20 dòng cho Xuất nhập tồn và hơn 15 dòng cho hai trang còn lại. |
| `F-DETAIL/MISSING` | Có giao dịch có `detailPath` hợp lệ và giao dịch không có đường dẫn chi tiết. |
| `F-PENDING` | Có phiếu chuyển kho chờ xử lý và một trạng thái không có phiếu chờ. |
| `F-VALUE-0/LARGE/DECIMAL` | Dòng có số lượng/giá trị bằng 0, số rất lớn và số thập phân nếu nghiệp vụ cho phép. |
| `F-EXPORT-101` | Ít nhất 101 dòng để kiểm tra xuất toàn bộ qua nhiều request; nếu cần kiểm tra giới hạn API thì thêm tập trên 5.000 dòng ở môi trường cô lập. |

Ghi lại số chuẩn của một khoảng ngày nhỏ, ví dụ một ngày hoặc ba ngày:

```text
Tổng nhập chuẩn = Σ qtyIn của toàn bộ dòng khớp filter
Tổng xuất chuẩn = Σ qtyOut của toàn bộ dòng khớp filter
Biến động ròng = Tổng nhập - Tổng xuất
Số chứng từ = số mã chứng từ khác rỗng, không trùng
Giá trị nhập = Σ valueIn
Giá trị xuất = Σ valueOut
```

## 4. Quy tắc đồng bộ cần nhớ

### 4.1 Xuất nhập tồn

- KPI, biểu đồ thời gian, bảng “Theo loại giao dịch”, bảng chi tiết và CSV phải theo **toàn bộ** filter đã bấm `Áp dụng`: ngày, kho, loại, từ khóa.
- Draft filter chưa bấm `Áp dụng` không được làm đổi KPI, chart, breakdown, bảng, modal kỳ hoặc CSV.
- `Số dòng/trang` chỉ thay đổi số dòng mỗi trang; không được làm đổi KPI/biểu đồ/breakdown tổng.
- Sort/phân trang chỉ đổi thứ tự hoặc lát dữ liệu bảng; không được làm đổi KPI/biểu đồ/breakdown.
- Thẻ **Đối soát tồn kho** hiện theo ngày và kho. Thay `Loại` hoặc `Từ khóa` không phải làm đổi thẻ đối soát; đây là phạm vi thiết kế hiện tại.
- `Làm mới` dùng filter đã áp dụng gần nhất, không dùng giá trị draft chưa bấm `Áp dụng`.

### 4.2 Tồn kho

- `Số bản ghi`, `Tổng tồn`, `Giá trị tồn`, biểu đồ phân bổ kho và bảng phải cùng phản ánh search + kho + trạng thái tồn đang áp dụng.
- KPI/biểu đồ là aggregate toàn bộ kết quả, không phải tổng của riêng 15 dòng trang hiện tại.
- Khi chọn một kho, `Tổng tồn`/`Giá trị tồn` KPI theo phạm vi kho đã chọn; cột `Tổng tồn` của từng sản phẩm trong bảng vẫn là tổng toàn hệ thống theo hợp đồng API hiện tại.
- Sort/phân trang không được thay đổi KPI hoặc tổng biểu đồ.
- Tên kho dài trên trục X được rút gọn; hover phải hiện tên đầy đủ. Khi có nhiều kho, chart phải cuộn ngang nội bộ, không làm body tràn ngang.

### 4.3 Tuổi tồn

- Search, chi nhánh, danh mục, `Nhập đầu ≥`, `Chưa bán ≥`, `Tồn ≥` phải đồng bộ tab counts, KPI, biểu đồ bucket, bảng, CSV và Excel.
- Tab `Tất cả/Tồn lâu/Bán chậm` lọc danh sách và `Giá trị tồn`. Badge counts vẫn biểu thị ba nhóm của bộ lọc chung trước tab, nên không tự co về riêng tab đang chọn.
- Biểu đồ bucket phải dùng đúng tập kết quả của **active tab + toàn bộ filter chung**. Đổi tab phải làm chart đổi tương ứng; nếu chart vẫn giữ tập trước active tab thì ghi `FAIL`.
- Badge đếm ba tab được phép giữ vai trò điều hướng toàn cục sau filter chung, nhưng `dòng`, `Giá trị tồn`, chart, bảng và export phải theo active tab.
- Tuổi dùng cho biểu đồ bucket: `daysFromLastSold` nếu đã bán; nếu chưa bán thì dùng `daysFromStart`.
- Bucket: `0–30`, `31–60`, `61–90`, `Trên 90`; kiểm tra kỹ biên 30/31/60/61/90/91.
- `Chưa bán ≥ N` vẫn giữ sản phẩm “Chưa bán lần nào” theo logic hiện tại.
- Khi chọn chi nhánh, tồn tối thiểu, số lượng hiển thị và giá trị tồn phải dùng tồn tại chi nhánh đó.

## 5. Test chung: route, tab, navigation và shell

| ID | Các bước thao tác | Kết quả mong đợi | KQ |
| --- | --- | --- | --- |
| `NAV-001` | Đăng nhập; dán `/reports/inventory` vào thanh địa chỉ; Enter. | Redirect đến `/reports/inventory/in-out-stock`; chỉ tab `Xuất nhập tồn` active. | ☐ |
| `NAV-002` | Mở trực tiếp từng URL trong mục 1 bằng tab trình duyệt mới. | Mỗi URL mở đúng trang; có đúng một H1 `Báo cáo kho hàng`; tab tương ứng active. | ☐ |
| `NAV-003` | Ở `Xuất nhập tồn`, bấm tab `Tồn kho`, rồi `Tuổi tồn`, rồi `Xuất nhập tồn`. | URL và nội dung đổi đúng; không full-page lỗi/trắng; tab active rõ ràng. | ☐ |
| `NAV-004` | Dùng nút Back hai lần, Forward hai lần. | Trở lại đúng route/tab; query của Tồn kho/Tuổi tồn được khôi phục; không lặp request vô hạn. | ☐ |
| `NAV-005` | F5 ở cả ba URL, gồm URL có query. | Trang giữ route/filter từ query khi chức năng có hỗ trợ; không về trang khác. | ☐ |
| `NAV-006` | Mở menu trái `Báo Cáo`; quan sát `Kho hàng`; đi qua cả ba tab. | Nhóm `Báo Cáo/Kho hàng` active nhất quán; không lặp submenu sai. | ☐ |
| `NAV-007` | Dùng `Tab` đến ba tab báo cáo; bấm `Enter`/`Space`. | Focus nhìn thấy; link mở đúng; vùng click không nhỏ hơn nhãn/icon. | ☐ |
| `NAV-008` | Mở `/reports/inventory/pending-transfers`. | Redirect đúng sang `/warehouse/transfers`. | ☐ |
| `NAV-009` | Mở `/reports/products/performance`. | Redirect sang báo cáo doanh thu sản phẩm; không tạo tab kho trùng. | ☐ |
| `NAV-010` | Thu nhỏ/mở rộng sidebar desktop; mở/đóng sidebar mobile. | Nội dung co giãn đúng, không che tab/header/filter; sidebar đóng không để lớp phủ chặn click. | ☐ |
| `NAV-011` | Đăng xuất hoặc xóa session; mở cả ba URL. | Chuyển về login/unauthorized theo cơ chế hệ thống; không lộ số tồn/giá vốn. | ☐ |
| `NAV-012` | Mở bằng tài khoản EMPLOYEE hợp lệ. | Đọc được theo quyền hiện tại; không xuất hiện hành vi admin ngoài quyền. | ☐ |
| `NAV-013` | Thêm dấu `/` cuối mỗi URL và mở lại. | Resolve đúng tab, không tạo vòng redirect hoặc active sai. | ☐ |
| `NAV-014` | Mở hai tab trình duyệt với hai bộ filter khác nhau ở Tồn kho/Tuổi tồn. | Mỗi tab giữ query và dữ liệu riêng; thao tác tab này không đổi tab kia. | ☐ |

## 6. Trang Xuất nhập tồn

### 6.1 Khởi tạo, bộ lọc và nút bấm

| ID | Các bước thao tác | Kết quả mong đợi | KQ |
| --- | --- | --- | --- |
| `IO-FLT-001` | Mở trang lần đầu. | Mặc định từ 29 ngày trước đến hôm nay (30 ngày gồm hai đầu); kho/loại/từ khóa rỗng; 20 dòng/trang; sort thời gian giảm dần. | ☐ |
| `IO-FLT-002` | Bấm icon/nút thu gọn ở tiêu đề `Bộ lọc`; bấm lại. | Nội dung filter ẩn/hiện; icon đổi trạng thái; KPI/chart/table không reset. | ☐ |
| `IO-FLT-003` | Chọn `Từ ngày`, `Đến ngày`; chưa bấm `Áp dụng`. | Field đổi nhưng dữ liệu dưới chưa đổi; đây là draft filter. | ☐ |
| `IO-FLT-004` | Sau `IO-FLT-003`, bấm `Áp dụng`. | Request mới chạy; trang về 1; dòng mô tả filter, KPI, chart, breakdown, table đồng bộ khoảng ngày. | ☐ |
| `IO-FLT-005` | Chọn từng kho trong dropdown; bấm `Áp dụng`. | Chỉ còn giao dịch kho đó; tên kho trong mọi dòng đúng; KPI/chart/breakdown đổi tương ứng; đối soát cũng theo kho. | ☐ |
| `IO-FLT-006` | Chọn từng loại giao dịch có trong dropdown; bấm `Áp dụng`. | Chỉ còn loại đã chọn; KPI/chart/breakdown/table/CSV theo loại; thẻ đối soát không bắt buộc đổi. | ☐ |
| `IO-FLT-007` | Nhập chính xác mã chứng từ; bấm `Áp dụng`. | Trả đúng chứng từ và các dòng khớp. | ☐ |
| `IO-FLT-008` | Tìm bằng mã SP, tên đầy đủ, tên một phần, barcode, chữ có dấu/không dấu nếu backend hỗ trợ. | Kết quả đúng hợp đồng search; không lỗi encode; text thừa đầu/cuối được trim khi gửi. | ☐ |
| `IO-FLT-009` | Nhập từ khóa không tồn tại; bấm `Áp dụng`. | KPI về 0; chart empty; breakdown rỗng; table empty; không còn dữ liệu cũ. | ☐ |
| `IO-FLT-010` | Chọn lần lượt từng giá trị `Số dòng/trang`; bấm `Áp dụng`. | Số dòng tối đa đúng lựa chọn; tổng/KPI/chart không đổi; số trang tính lại đúng. | ☐ |
| `IO-FLT-011` | Đổi tất cả filter; bấm `Đặt lại`. | Quay về default 30 ngày, tất cả kho/loại, q rỗng, 20 dòng, sort thời gian giảm dần; chỉ reload hợp lý một lần. | ☐ |
| `IO-FLT-012` | Đổi draft nhưng không áp dụng; bấm `Làm mới`. | Reload theo filter đã áp dụng trước đó; draft chưa áp dụng không được lọt vào request. | ☐ |
| `IO-FLT-013` | Bấm `Làm mới` liên tục khi đang loading. | Nút disabled/không tạo request chồng vô hạn; dữ liệu cũ không nhấp nháy mất; kết quả cuối đúng. | ☐ |
| `IO-FLT-014` | Bấm `Xuất CSV` khi có dữ liệu. | Tải file tên chứa đúng từ ngày–đến ngày của filter đã áp dụng; không dùng draft chưa áp dụng. | ☐ |
| `IO-FLT-015` | Bấm `Xuất CSV` ở empty state. | Không tải file rỗng; hiển thị `Không có dữ liệu để xuất`. | ☐ |
| `IO-FLT-016` | Khi báo lỗi API xuất hiện, bấm `Thử lại`. | Retry theo filter đã áp dụng; khi thành công lỗi biến mất và toàn bộ vùng dữ liệu phục hồi. | ☐ |
| `IO-FLT-017` | Đổi draft ngày/kho/loại/q/perPage nhưng chưa áp dụng; sort, đổi trang hoặc click chart của dữ liệu cũ. | Các thao tác dùng trọn bộ filter đã áp dụng, không trộn một phần draft vào request. | ☐ |
| `IO-FLT-018` | Mô phỏng API options lỗi nhưng API report thành công. | Báo lỗi options rõ; report không crash; không hiển thị option giả; retry/reload có thể phục hồi danh sách kho/loại. | ☐ |
| `IO-FLT-019` | Bấm `Áp dụng`, `Đặt lại`, `Áp dụng` rất nhanh với ba bộ khác nhau. | Request cũ bị hủy/bỏ qua; kết quả cuối khớp thao tác cuối; không kẹt progress hoặc lỗi cancel. | ☐ |

### 6.2 Validation ngày

| ID | Các bước thao tác | Kết quả mong đợi | KQ |
| --- | --- | --- | --- |
| `IO-DATE-001` | Đặt `Từ ngày` sau `Đến ngày`; bấm `Áp dụng`. | Báo `Từ ngày không được sau Đến ngày`; không gửi request report mới; dữ liệu cũ không bị thay bằng dữ liệu sai. | ☐ |
| `IO-DATE-002` | Đặt hai ngày bằng nhau; áp dụng. | Lấy đúng một ngày; click cột ngày mở đúng chi tiết ngày đó. | ☐ |
| `IO-DATE-003` | Chọn khoảng đúng giới hạn tối đa từ options. | Request thành công. | ☐ |
| `IO-DATE-004` | Chọn vượt giới hạn một ngày. | Báo khoảng ngày tối đa; không gửi request report. | ☐ |
| `IO-DATE-005` | Xóa một field ngày nếu browser cho phép; áp dụng. | Báo định dạng ngày không hợp lệ/native required; không crash. | ☐ |
| `IO-DATE-006` | Kiểm tra ngày cuối tháng, cuối năm, 29/02 năm nhuận. | Không lệch một ngày do timezone; bảng/CSV ghi đúng ngày. | ☐ |

### 6.3 KPI, đối soát và công thức

| ID | Các bước thao tác | Kết quả mong đợi | KQ |
| --- | --- | --- | --- |
| `IO-KPI-001` | Chọn khoảng nhỏ; xuất CSV; cộng cột `Nhập`. | Bằng KPI `Tổng nhập`. | ☐ |
| `IO-KPI-002` | Cộng cột `Xuất` trong CSV. | Bằng KPI `Tổng xuất`. | ☐ |
| `IO-KPI-003` | Tính `Tổng nhập - Tổng xuất`. | Bằng `Biến động ròng`; màu dương/âm đúng, không chỉ dựa màu để đọc nhãn. | ☐ |
| `IO-KPI-004` | Đếm mã chứng từ không rỗng, loại trùng. | Bằng KPI `Số chứng từ`. | ☐ |
| `IO-KPI-005` | Nếu capability giá trị bật, cộng `Giá trị nhập/xuất`. | Bằng KPI `Giá trị nhập / xuất`, format VNĐ đúng. Nếu capability tắt, KPI này không xuất hiện. | ☐ |
| `IO-KPI-006` | Đổi mỗi filter ngày/kho/loại/q riêng lẻ. | Các KPI đổi đúng dữ liệu filter; không giữ số cũ. | ☐ |
| `IO-KPI-007` | Chuyển trang và đổi sort. | KPI không đổi. | ☐ |
| `IO-REC-001` | Chọn ngày/kho; quan sát thẻ đối soát. | Tổng dòng = đã xác minh + chưa đủ lịch sử + chênh lệch; badge đúng ưu tiên `Có chênh lệch` > `Chưa đủ lịch sử` > `Đã xác minh`. | ☐ |
| `IO-REC-002` | Giữ ngày/kho, chỉ đổi loại hoặc q. | Report đổi; đối soát vẫn giữ phạm vi ngày/kho theo thiết kế. | ☐ |
| `IO-REC-003` | Mô phỏng/lặp lại khi API đối soát lỗi nhưng report thành công. | Hiện thông báo đối soát chưa tải; KPI/chart/table vẫn hoạt động. | ☐ |

### 6.4 Biểu đồ, breakdown và modal chi tiết kỳ

| ID | Các bước thao tác | Kết quả mong đợi | KQ |
| --- | --- | --- | --- |
| `IO-CH-001` | Hover từng cột xanh `Nhập` và đỏ `Xuất`. | Tooltip hiện đúng kỳ, series và số lượng; không bị cắt khỏi card/viewport. | ☐ |
| `IO-CH-002` | So sánh tổng các cột nhập/xuất trên timeline với KPI. | Tổng theo mọi kỳ bằng KPI tương ứng. | ☐ |
| `IO-CH-003` | Đổi ngày/kho/loại/q; áp dụng. | Số kỳ và độ cao cột đổi đúng; không còn cột của filter cũ. | ☐ |
| `IO-CH-004` | Click vào một cột có dữ liệu. | Mở modal `Chi tiết xuất nhập ngày ...`; summary modal đúng lineCount/nhập/xuất của cột. | ☐ |
| `IO-CH-005` | Trong modal, đối chiếu từng dòng và tổng nhập/xuất. | Chỉ có giao dịch đúng ngày và vẫn giữ kho/loại/q đã áp dụng; tổng bằng summary modal. | ☐ |
| `IO-CH-006` | Mở modal rồi bấm `X`, click backdrop, nhấn `Escape`. | Cả ba cách đóng được; body scroll khóa khi mở và phục hồi khi đóng; focus về vị trí trước đó. | ☐ |
| `IO-CH-007` | Click bên trong modal/table. | Modal không đóng ngoài ý muốn. | ☐ |
| `IO-CH-008` | Click icon mắt trong modal nếu có `detailPath`. | Mở đúng màn hình chi tiết chứng từ; với dòng không có path hiển thị `—`, không có link giả. | ☐ |
| `IO-CH-009` | Với filter không dữ liệu. | Hiện chart empty; không có trục/tooltip ma; không hiện `NaN/undefined`. | ☐ |
| `IO-CH-010` | Trong khoảng có dữ liệu tổng nhưng có một ngày không phát sinh, click vùng/cột 0 của ngày đó. | Nếu click nhận điểm, modal mở đúng ngày và hiện empty; nếu không nhận click thì không mở nhầm ngày khác. | ☐ |
| `IO-CH-011` | Hover/click legend `Nhập`, `Xuất`. | Nhãn/màu đúng; không làm ẩn series nếu trang không cung cấp chức năng toggle; không đổi filter hoặc số liệu. | ☐ |
| `IO-CH-012` | Mở chi tiết kỳ A rồi nhanh chóng đóng/mở kỳ B khi request A còn chạy. | Modal cuối chỉ chứa kỳ B; response A không chèn vào B; loading kết thúc đúng. | ☐ |
| `IO-CH-013` | Mô phỏng API chi tiết kỳ lỗi, sau đó đóng modal. | Lỗi chỉ nằm trong modal; report nền giữ nguyên; đóng được bằng X/backdrop/Escape và body scroll phục hồi. | ☐ |
| `IO-BD-001` | Cộng `Nhập`, `Xuất`, `Số dòng` của bảng `Theo loại giao dịch`. | Tổng nhập/xuất bằng KPI; tổng số dòng bằng tổng report. | ☐ |
| `IO-BD-002` | Filter một loại. | Breakdown chỉ có nhóm phù hợp hoặc các nhóm khác bằng 0 theo response; không lẫn loại khác. | ☐ |

### 6.5 Bảng, sort, xem chi tiết và phân trang

Lặp test sort sau cho từng cột có nút: `Thời gian`, `Mã chứng từ`, `Loại`, `Kho`, `Sản phẩm`, `Nhập`, `Xuất`.

| ID | Các bước thao tác | Kết quả mong đợi | KQ |
| --- | --- | --- | --- |
| `IO-TBL-001` | Bấm một header sort lần 1. | Bảng về trang 1; dữ liệu tăng/giảm theo chỉ báo `aria-sort`; filter giữ nguyên. | ☐ |
| `IO-TBL-002` | Bấm cùng header lần 2. | Đảo chiều; không đổi KPI/chart/breakdown. | ☐ |
| `IO-TBL-003` | Kiểm tra format từng cột. | Ngày giờ đúng timezone; null là `—`; số format vi-VN; sản phẩm ghép mã · tên đúng. | ☐ |
| `IO-TBL-004` | Bấm icon mắt một dòng có path. | Điều hướng đúng chứng từ; Back quay lại report không mất filter đã có trong state phiên. | ☐ |
| `IO-TBL-005` | Bấm `Sau`, rồi `Trước`. | Trang tăng/giảm đúng; nút đầu/cuối disabled đúng; sort/filter giữ nguyên. | ☐ |
| `IO-TBL-006` | Đang ở trang >1, đổi filter và áp dụng. | Về trang 1; không hiển thị trang vượt tổng trang. | ☐ |
| `IO-TBL-007` | So sánh table page với CSV all. | Mọi dòng trang hiện tại tồn tại trong CSV; CSV chứa đủ mọi trang, không trùng/mất. | ☐ |
| `IO-TBL-008` | Lặp sort đủ 7 cột: thời gian, mã chứng từ, loại, kho, sản phẩm, nhập, xuất. | Mỗi cột đảo asc/desc đúng kiểu dữ liệu; các dòng bằng nhau có thứ tự ổn định, không mất/trùng giữa trang. | ☐ |
| `IO-TBL-009` | Kiểm tra dòng có và không có `detailPath`. | Có path hiển thị đúng một icon mắt có accessible name; không path hiển thị `—`, không click được. | ☐ |

## 7. Trang Tồn kho

### 7.1 Filter, nút nhanh và cảnh báo

| ID | Các bước thao tác | Kết quả mong đợi | KQ |
| --- | --- | --- | --- |
| `ST-FLT-001` | Mở trang. | Default tất cả kho, tất cả trạng thái; search rỗng; sort mặc định; page 1; loading hợp lý. | ☐ |
| `ST-FLT-002` | Nhập tên/mã/barcode chính xác và một phần; bấm `Lọc` hoặc Enter. | Request q đúng, về trang 1; KPI/chart/table theo search; URL có q encode đúng. | ☐ |
| `ST-FLT-003` | Chọn kho từ dropdown. | Tự reload, về trang 1; URL có branchId; pill kho tương ứng active. | ☐ |
| `ST-FLT-004` | Bấm pill `Tất cả`, rồi từng pill kho. | Đồng bộ với dropdown; chỉ một pill `aria-pressed=true`; dữ liệu đổi đúng. | ☐ |
| `ST-FLT-005` | Chọn `Còn tồn`. | Chỉ có sản phẩm tổng tồn theo phạm vi >0. | ☐ |
| `ST-FLT-006` | Chọn `Còn tồn có thể bán`. | Chỉ có sản phẩm `tồn - khóa > 0`; fixture khóa toàn bộ bị loại. | ☐ |
| `ST-FLT-007` | Kết hợp search + kho + trạng thái. | URL có đủ q/branchId/stockStatus; KPI/chart/table/file xuất cùng filter. | ☐ |
| `ST-FLT-008` | Bấm `Làm mới`. | Giữ filter/sort hiện tại; hiện `Đang làm mới...`; giữ dữ liệu cũ đến khi response mới về. | ☐ |
| `ST-FLT-009` | Gây lỗi refresh rồi thử lại. | Có error bar; dữ liệu cũ được giữ khi refresh lỗi; `Thử lại` phục hồi. | ☐ |
| `ST-FLT-010` | Khi có phiếu chuyển treo, bấm `Mở chuyển kho`. | Cảnh báo hiện đúng số phiếu, số lượng, ngày lâu nhất; điều hướng `/warehouse/transfers`. | ☐ |
| `ST-FLT-011` | Khi API cảnh báo chuyển kho lỗi, bấm `Thử lại`. | Tồn kho vẫn hiển thị; retry chỉ cảnh báo; không xóa table/chart. | ☐ |
| `ST-FLT-012` | Dùng barcode scanner khi cursor ở search. | Mã được đưa vào search và lọc đúng một lần; không nhập vào field khác. | ☐ |
| `ST-FLT-013` | Gõ search nhưng chưa bấm `Lọc`. | Bảng/KPI/chart chưa đổi. URL không được khiến reload ngầm; nếu UI đưa q lên URL sớm thì F5/Back vẫn phải cho trạng thái nhất quán. | ☐ |
| `ST-FLT-014` | Đang có draft search chưa áp dụng, đổi dropdown kho hoặc trạng thái. | Không được trộn draft search vào request tự động; hoặc phải thể hiện rõ search đã được áp dụng đồng thời. Mọi vùng và URL phải cùng một filter, không trạng thái nửa cũ nửa mới. | ☐ |
| `ST-FLT-015` | Dùng nhiều kho; cuộn dải pill sang cuối và bấm kho cuối. | Pill không mất/cắt vùng click; dropdown đổi cùng kho; dữ liệu đúng và body không tràn ngang. | ☐ |

### 7.2 KPI và biểu đồ phân bổ kho

| ID | Các bước thao tác | Kết quả mong đợi | KQ |
| --- | --- | --- | --- |
| `ST-KPI-001` | Ghi KPI default; cộng riêng 15 dòng trang 1. | KPI là aggregate server toàn bộ kết quả, không bị bằng nhầm tổng trang 1. | ☐ |
| `ST-KPI-002` | Với tất cả kho, cộng qty/value của breakdown chart. | Bằng `Tổng tồn` và `Giá trị tồn` KPI. | ☐ |
| `ST-KPI-003` | Chọn Kho A rồi Kho B. | KPI và breakdown đổi theo kho; số liệu khác nhau đúng fixture. | ☐ |
| `ST-KPI-004` | Đổi search/trạng thái. | Cả ba KPI và chart đổi đồng bộ; nhãn `Đang lọc` xuất hiện. | ☐ |
| `ST-KPI-005` | Chuyển trang, đổi sort. | KPI và chart tổng không đổi. | ☐ |
| `ST-CH-001` | Hover từng cặp cột `Giá trị tồn`/`Số lượng tồn`. | Tooltip hiện tên kho đầy đủ, đúng qty/value và không bị cắt. | ☐ |
| `ST-CH-002` | Kiểm tra legend và hai trục Y. | Màu/nhãn đúng; trục trái giá trị, trục phải số lượng; format compact không thành NaN. | ☐ |
| `ST-CH-003` | Dùng fixture nhiều kho/tên dài; kéo thanh cuộn ngang chart từ đầu đến cuối. | Tick rút gọn không đè nhau; đủ mọi kho; tooltip tên đầy đủ; body không overflow. | ☐ |
| `ST-CH-004` | Kiểm tra desktop/tablet/mobile. | Chart cuộn nội bộ khi thiếu chỗ; summary cards không che title/chart. | ☐ |
| `ST-CH-005` | Filter ra empty. | Empty chart và empty table đúng; KPI 0; không còn cột cũ. | ☐ |
| `ST-CH-006` | Chọn một kho cụ thể. | Chart chỉ còn breakdown kho được chọn; tổng tooltip/cột bằng KPI scoped; title ghi rõ `kho đã chọn`. | ☐ |
| `ST-CH-007` | Hover/click hai mục legend. | Hover không nhảy layout; click không làm mất series nếu không có chức năng toggle; màu legend/cột/tooltip thống nhất. | ☐ |

### 7.3 Bảng, sort, link và phân trang

Lặp sort cho `Mã SP`, `Sản phẩm`, `Giá nhập`, `Giá bán`, từng cột kho động và `Tổng tồn`.

| ID | Các bước thao tác | Kết quả mong đợi | KQ |
| --- | --- | --- | --- |
| `ST-TBL-001` | Bấm header sort lần 1/lần 2. | Thứ tự đổi đúng asc/desc; `aria-sort` đúng; về trang 1; filter giữ nguyên. | ☐ |
| `ST-TBL-002` | Chọn một kho rồi sort cột kho đó. | Sort theo số tồn của đúng kho, không theo tổng toàn hệ thống. | ☐ |
| `ST-TBL-003` | Kiểm tra từng dòng. | Mã/tên/giá đúng; mỗi cột kho đúng tồn kho; `Tổng tồn` bằng tổng các kho của sản phẩm. | ☐ |
| `ST-TBL-004` | Bấm mã SP. | Mở `/products/storage-duration?q=<mã>` và giữ branchId nếu đang chọn kho. | ☐ |
| `ST-TBL-005` | Bấm `Xem hàng tồn lâu`. | Mở Tuổi tồn; giữ branchId nếu đang chọn kho. | ☐ |
| `ST-TBL-006` | Bấm phân trang trước/sau. | Range `Hiển thị x-y/tổng` và `Trang x/y` đúng; nút biên disabled; filter/sort giữ nguyên. | ☐ |
| `ST-TBL-007` | Dùng fixture nhiều kho, kéo ngang bảng. | Header/cell thẳng cột; không cắt cột cuối; không làm body tràn; tên dài wrap/ellipsis hợp lý. | ☐ |
| `ST-TBL-008` | API danh sách kho lỗi nhưng inventory thành công. | Hiện cảnh báo; không crash; bảng giải thích các cột kho có thể thiếu; `Thử lại` tải lại được. | ☐ |
| `ST-TBL-009` | Chọn một kho rồi đối chiếu KPI, cột kho đã chọn và `Tổng tồn`. | KPI/cột kho theo kho đã chọn; `Tổng tồn` vẫn là tổng toàn hệ thống theo nhãn hiện tại, không bị hiểu nhầm là tổng của kho chọn. | ☐ |
| `ST-TBL-010` | Back từ trang Tuổi tồn sau khi bấm mã SP/Xem hàng tồn lâu. | Trở lại đúng q/branch/status/sort/page hoặc ghi `FAIL` nếu state báo cáo bị mất ngoài hành vi đã công bố. | ☐ |

### 7.4 Modal Xuất dữ liệu

Áp dụng các test này cho nút `Xuất dữ liệu` ở Tồn kho và nút `Xuất` ở Tuổi tồn.

| ID | Các bước thao tác | Kết quả mong đợi | KQ |
| --- | --- | --- | --- |
| `EX-001` | Bấm nút xuất. | Modal đúng title; focus vào nút đóng; background không thao tác được. | ☐ |
| `EX-002` | Chọn `Trang hiện tại`, xuất. | File chỉ có dòng trang hiện tại theo filter/sort hiện có. | ☐ |
| `EX-003` | Chọn `Tất cả dữ liệu`, xuất. | File đủ mọi trang theo filter, không lẫn dữ liệu ngoài filter, không trùng/mất. | ☐ |
| `EX-004` | Sửa tên workbook và sheet; bấm `Xuất dữ liệu`. | Tên file `.xlsx` và sheet đúng; ký tự tiếng Việt đọc được. | ☐ |
| `EX-005` | Bỏ chọn một cột, xuất. | File không có cột đó; thứ tự cột còn lại đúng UI. | ☐ |
| `EX-006` | Bấm `Chọn cột xuất` để bỏ/chọn tất cả. | Counter đã chọn đúng; không cho xuất file vô nghĩa nếu không cột theo validation hiện tại. | ☐ |
| `EX-007` | Tìm tên cột bằng ô search. | Chỉ lọc danh sách cấu hình cột, không làm mất trạng thái các cột đang ẩn. | ☐ |
| `EX-008` | Đổi tên một tiêu đề cột; xuất. | File dùng custom label, dữ liệu không đổi. | ☐ |
| `EX-009` | Chuyển tab `Google Sheets`. | Hiện `Sắp ra mắt`; nút xuất disabled; không gọi API ngoài ý muốn. | ☐ |
| `EX-010` | Dùng phím trái/phải trên tab Excel/Google Sheets. | Chuyển tab và focus đúng. | ☐ |
| `EX-011` | Dùng Tab/Shift+Tab nhiều vòng. | Focus trap trong modal; focus-visible rõ. | ☐ |
| `EX-012` | Đóng bằng `X`, nút `Đóng`, click backdrop, Escape. | Modal đóng khi không loading; focus trả về nút mở modal. | ☐ |
| `EX-013` | Trong lúc đang xuất, thử đóng/bấm xuất lần nữa. | Nút/loading đúng; không tạo nhiều file/request; không đóng giữa chừng nếu modal khóa loading. | ☐ |
| `EX-014` | Filter empty rồi xuất. | Báo không có dữ liệu; không tải file rỗng. | ☐ |
| `EX-015` | Mở lại modal sau khi đã sửa cấu hình rồi đóng. | State reset về all data, tên mặc định, sheet mặc định, mọi cột được chọn. | ☐ |
| `EX-016` | Để trống tên file và tên sheet rồi xuất. | Dùng tên mặc định an toàn; file mở được, không lỗi workbook. | ☐ |
| `EX-017` | Nhập tên file/sheet có ký tự cấm `\\ / ? * [ ] :` và tên rất dài. | Có validation/thông báo rõ hoặc chuẩn hóa an toàn; không crash, không đóng modal mà không tạo file. | ☐ |
| `EX-018` | Khi đang tìm cột, bấm `Chọn cột xuất`. | Chỉ đổi các cột đang được lọc theo hành vi hiện tại; counter toàn bộ chính xác; xóa search vẫn giữ state. | ☐ |
| `EX-019` | Dùng tập 101+ dòng, xuất `Tất cả dữ liệu`; quan sát Network. | Fetch đủ các page 100 dòng, file đủ và đúng thứ tự sort; không lặp/mất dòng. | ☐ |
| `EX-020` | Mô phỏng một request page giữa quá trình export lỗi. | Không tải file thiếu; hiện lỗi; modal không kẹt loading và có thể thử lại. | ☐ |

## 8. Trang Tuổi tồn

### 8.1 Tab, KPI và biểu đồ tuổi tồn

| ID | Các bước thao tác | Kết quả mong đợi | KQ |
| --- | --- | --- | --- |
| `AGE-TAB-001` | Bấm `Tất cả`, `Tồn lâu`, `Bán chậm`. | Chỉ một tab selected; URL tab đúng; page về 1; bảng/giá trị tồn đổi đúng nhóm. | ☐ |
| `AGE-TAB-002` | Mở deep-link `?tab=unsold_long`, rồi `?tab=slow_selling`. | Hydrate đúng tab; không request loop. | ☐ |
| `AGE-KPI-001` | Ở Tất cả, đối chiếu counts ba tab/KPI với toàn bộ dữ liệu xuất. | `Tất cả = số SP sau filter chung`; `Tồn lâu/Bán chậm` bằng số status tương ứng. | ☐ |
| `AGE-KPI-002` | Bấm từng tab. | Badge counts không co theo active tab; `Giá trị tồn` bằng Σ qty × cost của riêng danh sách active tab. | ☐ |
| `AGE-KPI-003` | Đổi từng filter chung. | Badge counts, KPI value, chart và table đổi cùng filter. | ☐ |
| `AGE-CH-001` | Hover cột `Số SP` và `Giá trị vốn` từng bucket. | Tooltip đúng label, count, value; không bị cắt. | ☐ |
| `AGE-CH-002` | Dùng fixture 30/31/60/61/90/91 ngày. | Mỗi fixture vào đúng bucket; không đếm hai bucket. | ☐ |
| `AGE-CH-003` | Cộng count bốn bucket ở từng active tab. | Bằng tổng dòng của active tab sau filter chung; chuyển `Tất cả/Tồn lâu/Bán chậm` phải đổi bucket theo đúng tập bảng. Nếu giữ chart toàn cục thì `FAIL`. | ☐ |
| `AGE-CH-004` | Empty filter. | Hiện `Không có dữ liệu tuổi tồn...`; KPI/table empty; không NaN/Invalid Date. | ☐ |
| `AGE-CH-005` | Click từng cột chart. | Không điều hướng/mở chi tiết giả vì chart không công bố click drill-down; hover sau click vẫn đúng. | ☐ |
| `AGE-CH-006` | Đối chiếu giá trị vốn bốn bucket với export active tab. | Tổng value bucket bằng KPI `Giá trị tồn` và Σ `qty × cost` của đúng active tab/filter. | ☐ |

### 8.2 Bộ lọc và các nút điều hướng/xuất

| ID | Các bước thao tác | Kết quả mong đợi | KQ |
| --- | --- | --- | --- |
| `AGE-FLT-001` | Nhập tên/mã/barcode; bấm `Lọc` hoặc Enter. | q trim/encode đúng; về trang 1; URL, KPI, chart, table đồng bộ. | ☐ |
| `AGE-FLT-002` | Chọn từng chi nhánh. | Tự reload; URL branchId; qty/value/minStock theo chi nhánh; không lấy nhầm tồn global. | ☐ |
| `AGE-FLT-003` | Chọn từng danh mục. | Tự reload; chỉ đúng danh mục; KPI/chart/table/export đồng bộ. | ☐ |
| `AGE-FLT-004` | Bấm `Bộ lọc nâng cao`, rồi `Ẩn nâng cao`. | Ba field hiện/ẩn; giá trị đang nhập không mất khi chỉ ẩn. | ☐ |
| `AGE-FLT-005` | Bấm `Tuổi cao`. | Mở nâng cao, đặt `Nhập đầu ≥` bằng threshold hiện tại (mặc định 30), về trang 1, nút active. | ☐ |
| `AGE-FLT-006` | Nhập lần lượt 0, 29, 30, 31 vào `Nhập đầu ≥`. | Biên lọc đúng `>=`; mọi vùng số liệu đổi cùng field. | ☐ |
| `AGE-FLT-007` | Nhập 0, 29, 30, 31 vào `Chưa bán ≥`. | Đã bán được lọc theo số ngày; “Chưa bán lần nào” vẫn được giữ theo logic hiện tại. | ☐ |
| `AGE-FLT-008` | Nhập 0, 1, đúng qty, qty+1 vào `Tồn ≥`. | Biên `>=` đúng; khi có branch dùng qty branch, không dùng global qty. | ☐ |
| `AGE-FLT-009` | Nhập số âm bằng gõ/paste vào ba field. | Browser/logic không crash; request chuẩn hóa an toàn về min 0 hoặc chặn; không NaN. | ☐ |
| `AGE-FLT-010` | Kết hợp đủ tab + q + branch + category + ba min. | URL có đủ query; sau F5/Back/Forward state và dữ liệu khôi phục đúng, không loop. | ☐ |
| `AGE-FLT-011` | Bấm `Làm mới`. | Đây là reset toàn bộ filter/tab về default và reload; URL sạch; page 1. | ☐ |
| `AGE-FLT-012` | Bấm `CSV`. | Tải CSV theo toàn bộ filter và active tab hiện tại; đủ mọi trang; tiếng Việt/cột đúng. | ☐ |
| `AGE-FLT-013` | Bấm `Xuất`; thực hiện bộ `EX-*`. | Excel đúng filter/tab/chi nhánh và current/all. | ☐ |
| `AGE-FLT-014` | Bấm `Sản phẩm`. | Điều hướng `/products`. | ☐ |
| `AGE-FLT-015` | Bấm `Tồn kho`. | Điều hướng `/products/inventory`. | ☐ |
| `AGE-FLT-016` | Dùng barcode scanner ở search. | Lọc đúng mã một lần; không thay field khác. | ☐ |
| `AGE-FLT-017` | Gõ search nhưng chưa Enter/bấm `Lọc`, sau đó đổi category/branch/tab. | Draft search chưa áp dụng không được lọt vào request; hoặc UI phải thể hiện rõ nó đã áp dụng. URL/KPI/chart/table/export không được lệch nhau. | ☐ |
| `AGE-FLT-018` | Gõ nhanh các số `3` → `30` → `300` ở filter nâng cao. | Mỗi trạng thái cuối nhất quán; response cũ bị bỏ; không nháy dữ liệu sai hoặc để URL ở giá trị khác dữ liệu. | ☐ |
| `AGE-FLT-019` | Mở query có tab/categoryId/branchId không hợp lệ và min là chữ/số âm. | Chuẩn hóa an toàn hoặc empty có giải thích; không 500/NaN/loop; URL và control phản ánh giá trị thực được dùng. | ☐ |
| `AGE-FLT-020` | API category hoặc branch lỗi riêng lẻ. | Trang chính vẫn hoạt động; control loading kết thúc; có cảnh báo/khả năng retry, không âm thầm giả là danh sách rỗng. | ☐ |

### 8.3 Bảng, phân trang và menu thao tác

| ID | Các bước thao tác | Kết quả mong đợi | KQ |
| --- | --- | --- | --- |
| `AGE-TBL-001` | Kiểm tra 11 cột của một fixture. | Mã, tên, nhóm/NCC, giá, tồn, XNK đầu/cuối, bán cuối, ba số ngày và action đúng source data. | ☐ |
| `AGE-TBL-002` | Kiểm tra sản phẩm chưa bán. | `Bán cuối/Chưa bán ra` hiển thị `Chưa bán lần nào`; không Invalid Date. | ☐ |
| `AGE-TBL-003` | Kiểm tra clearance active. | Hiện `Xả: <giá>` chỉ khi active và có giá; giá bán chính không bị thay. | ☐ |
| `AGE-TBL-004` | Bấm trang sau/trước. | Range/trang đúng; filter/tab/query giữ nguyên; nút biên disabled. | ☐ |
| `AGE-TBL-005` | Ở trang >1, đổi filter/tab. | Về trang 1; không range âm hoặc page vượt total. | ☐ |
| `AGE-ACT-001` | Bấm nút `...` của một dòng. | Menu portal mở sát trigger nhưng trong viewport; trigger `aria-expanded=true`; không bị table cắt. | ☐ |
| `AGE-ACT-002` | Mở menu rồi click ngoài, Escape, scroll, resize. | Menu đóng; trigger state về false. | ☐ |
| `AGE-ACT-003` | Mở menu của dòng khác. | Menu cũ đóng, menu mới mở đúng sản phẩm; không dùng stale item. | ☐ |
| `AGE-ACT-004` | Bấm `Đề xuất chuyển kho`. | Điều hướng form tạo chuyển kho với productId/code, quantity=1, note và sourceWarehouseId nếu có; chưa ghi dữ liệu cho đến khi submit form đích. | ☐ |
| `AGE-ACT-005` | Back; bấm `Mở phiếu xuất trả NCC`. | Điều hướng form xuất với productId/code, quantity=1, type/note và branchId nếu có; chưa ghi dữ liệu cho đến submit form đích. | ☐ |
| `AGE-ACT-006` | Bấm lại nút `...` đang mở. | Menu đóng, `aria-expanded=false`; không mở modal hay điều hướng. | ☐ |
| `AGE-ACT-007` | Dùng Tab/Enter/Escape với trigger và từng menuitem. | Focus thấy được; Enter kích hoạt đúng một action; Escape đóng; không kích hoạt nhầm dòng. | ☐ |

### 8.4 Thao tác giá xả — `WRITE-RISK`

Các test `AGE-WR-*` có thể ghi sản phẩm. Trên dữ liệu thật chỉ thực hiện luồng đóng/hủy/cancel. Chỉ bấm `Lưu giá xả hàng` hoặc xác nhận `Bỏ giá xả hàng` khi có fixture local/test cô lập và được phép.

| ID | Các bước thao tác | Kết quả mong đợi | KQ |
| --- | --- | --- | --- |
| `AGE-WR-001` | `...` → `Đặt giá xả hàng`. | Modal đúng sản phẩm; giá bán/giá vốn readonly; mặc định giảm 10%; giá xả tính đúng; không đổi giá chính. | ☐ |
| `AGE-WR-002` | Đổi `%` và nhập 1, 10, 100, >100, rỗng. | Giá tính đúng; invalid bị chặn/báo; không âm/NaN. Không submit trên live. | ☐ |
| `AGE-WR-003` | Đổi sang `VNĐ`, nhập 1, bằng giá bán, lớn hơn giá bán. | Giá xả tính/validation hợp lý; không cho giá âm. Không submit trên live. | ☐ |
| `AGE-WR-004` | Nhập ghi chú Unicode/dài; bấm `Hủy`, `X`, backdrop, Escape lần lượt. | Modal đóng không ghi dữ liệu; table/KPI/filter giữ nguyên. | ☐ |
| `AGE-WR-005` | Với fixture cô lập, bấm lưu một giá hợp lệ. | Chỉ clearance fields đổi; toast success; reload giữ filter; table hiện đúng giá xả; giá chính không đổi; lỗi API hiển thị toast error. | ☐/BLOCKED |
| `AGE-WR-006` | Với sản phẩm clearance active, bấm `Bỏ giá xả hàng`, chọn Cancel. | Không request ghi; giá xả giữ nguyên. | ☐ |
| `AGE-WR-007` | Với fixture cô lập, xác nhận bỏ giá xả. | clearanceActive false, giá/note xả reset; giá chính giữ nguyên; toast/reload đúng. | ☐/BLOCKED |
| `AGE-WR-008` | Với fixture cô lập, mô phỏng API bỏ giá xả lỗi. | Toast lỗi; row vẫn hiển thị clearance cũ; không thay giá chính hoặc filter. | ☐/BLOCKED |

## 9. Ma trận đồng bộ filter bắt buộc

Không cần nhân Descartes vô hạn, nhưng phải chạy tối thiểu các ma trận sau và đối chiếu mọi vùng được ghi trong cột “Đối chiếu”.

| ID | Tổ hợp | Đối chiếu | KQ |
| --- | --- | --- | --- |
| `MX-IO-001` | 3 khoảng ngày × 3 kho | KPI + đối soát + timeline + breakdown + table + CSV | ☐ |
| `MX-IO-002` | 3 loại × 5 search (rỗng/mã CT/mã SP/tên partial/không khớp) | KPI + timeline + breakdown + table + CSV | ☐ |
| `MX-IO-003` | Một tổ hợp đủ ngày+kho+loại+q × sort 7 cột × page | Filter không mất; tổng không đổi khi sort/page | ☐ |
| `MX-ST-001` | 3 kho × 3 trạng thái | KPI + chart + table + Excel | ☐ |
| `MX-ST-002` | 3 kho × 5 search | KPI + chart + table + URL + Excel | ☐ |
| `MX-ST-003` | Nhiều kho/tên dài × desktop/tablet/mobile | Tick + tooltip + scroll nội bộ + table alignment | ☐ |
| `MX-AGE-001` | 3 tab × 3 branch | Badge + value KPI + bucket + table + CSV/Excel | ☐ |
| `MX-AGE-002` | 3 tab × 3 category | Badge + value KPI + bucket + table + export | ☐ |
| `MX-AGE-003` | 3 tab × 5 search | URL + badge + value + chart + rows | ☐ |
| `MX-AGE-004` | 3 tab × minStart {29,30,31} | Kiểm tra biên >= và tất cả vùng dữ liệu | ☐ |
| `MX-AGE-005` | 3 tab × minSold {29,30,31} | Kiểm tra đã bán/chưa từng bán | ☐ |
| `MX-AGE-006` | Branch {A,B} × minStock {qty,qty+1} | Qty/value theo branch, không global | ☐ |
| `MX-AGE-007` | Đủ 7 filter → Back/Forward/F5/copy URL tab mới | State/query/data khôi phục, không request loop | ☐ |

## 10. Loading, error, race condition và dữ liệu bất thường

Các case cần DevTools throttling hoặc mock/staging an toàn; không làm gián đoạn backend thật nếu đang có người dùng.

| ID | Các bước thao tác | Kết quả mong đợi | KQ |
| --- | --- | --- | --- |
| `ERR-001` | Slow 3G; mở mỗi trang. | Skeleton/loading rõ; layout không nhảy vỡ; control busy hợp lý. | ☐ |
| `ERR-002` | Đổi filter A rồi rất nhanh filter B, cho response A về sau B. | UI cuối cùng là B; stale response A bị bỏ. | ☐ |
| `ERR-003` | API chính trả 500 lần đầu, success lần retry. | Error rõ, không trắng trang; retry phục hồi; không dữ liệu giả. | ☐ |
| `ERR-004` | API trả items thiếu/null, total thiếu hoặc number bất thường trên môi trường mock. | UI fallback an toàn; không crash/NaN/undefined. | ☐ |
| `ERR-005` | Mất mạng lúc refresh khi đã có dữ liệu. | Dữ liệu cũ giữ nếu thiết kế trang hỗ trợ; báo lỗi; không đổi sang zero giả. | ☐ |
| `ERR-006` | Session hết hạn giữa phiên; bấm refresh/filter/export. | Chuyển login/401 đúng; không loop request/toast. | ☐ |
| `ERR-007` | Empty do database thật sự rỗng và empty do filter không khớp. | Empty message đúng ngữ cảnh; reset/làm mới thoát empty. | ☐ |
| `ERR-008` | Dữ liệu có null ngày, kho, người tạo, giá hoặc product mapping thiếu. | Hiển thị `—`/fallback hợp lý; không Invalid Date/NaN. | ☐ |
| `ERR-009` | Tên/mã chứa `' " ; , = + - @`, xuống dòng hoặc Unicode. | UI không vỡ/XSS; CSV/Excel không lệch cột. Nếu formula chạy trong Excel, ghi lỗi bảo mật. | ☐ |
| `ERR-010` | Bấm nhanh filter/reset/refresh/export nhiều lần. | Không duplicate download/request vô hạn; control disabled đúng; state cuối xác định. | ☐ |

## 11. Giao diện, responsive và accessibility

Chạy mỗi test ở tối thiểu `1440×900`, `1024×768`, `768×1024`, `390×844`, zoom `80%`, `100%`, `125%`, `200%`.

| ID | Các bước thao tác | Kết quả mong đợi | KQ |
| --- | --- | --- | --- |
| `UI-001` | Quan sát header, tab, filter, KPI, chart, table ở các viewport. | Không chồng/che; khoảng cách đồng đều; title không cắt; card thẳng hàng. | ☐ |
| `UI-002` | Kiểm tra `document.body.scrollWidth` hoặc kéo ngang toàn trang. | Không có horizontal overflow body; chỉ table/chart/tab bar rộng được cuộn nội bộ. | ☐ |
| `UI-003` | Kéo ngang mọi bảng ở mobile. | Header và cell cùng cột; cột action/cuối truy cập được; không kéo lệch trang. | ☐ |
| `UI-004` | Hover mọi button/link/header sort/chart bar/menu item. | Màu/biên/cursor rõ; không đổi kích thước làm layout nhảy; tooltip không che dữ liệu cần đọc. | ☐ |
| `UI-005` | Dùng keyboard Tab qua toàn trang. | Thứ tự focus logic; focus-visible; không kẹt ngoài modal; nút/link semantic đúng. | ☐ |
| `UI-006` | Nhấn Enter/Space trên button/tab/link đang focus. | Hành vi tương đương click; không submit nhầm form. | ☐ |
| `UI-007` | Mở menu/modal gần cạnh phải/dưới viewport. | Popup tự nằm trong viewport, không bị overflow/card cắt. | ☐ |
| `UI-008` | Kiểm tra text cực dài. | Wrap/ellipsis hợp lý; hover/title/tooltip cho biết đầy đủ khi cần; icon không lệch. | ☐ |
| `UI-009` | Kiểm tra loading/error/empty làm chiều cao card thay đổi. | Không đè card sau; footer/pagination đúng vị trí. | ☐ |
| `UI-010` | Bật `prefers-reduced-motion` nếu có thể. | Animation không gây nhấp nháy; thao tác vẫn dùng được. | ☐ |
| `UI-011` | In/print preview. | Navigation report được ẩn theo CSS; nội dung chính không mất/đè nếu chức năng in được dùng. | ☐ |
| `UI-012` | Mở DevTools Console trong toàn bộ phiên. | Không pageerror, React key warning, ResizeObserver loop hoặc lỗi request ngoài case chủ động gây lỗi. | ☐ |

## 12. Checklist kết thúc phiên

| ID | Việc cần làm | KQ |
| --- | --- | --- |
| `END-001` | Không để lại thay đổi giá xả/phiếu nháp/dữ liệu test ngoài fixture được phép. | ☐ |
| `END-002` | Mọi FAIL có URL, fixture, screenshot, Console và Network. | ☐ |
| `END-003` | Đối chiếu tổng PASS/FAIL/BLOCKED/N/A; ưu tiên lỗi sai số liệu hơn lỗi thẩm mỹ. | ☐ |
| `END-004` | Sau khi fix, chạy lại case lỗi + toàn bộ ma trận liên quan + smoke ba tab. | ☐ |
| `END-005` | Xác nhận CSV/Excel test đã xóa khỏi thư mục tải xuống nếu chứa dữ liệu nhạy cảm. | ☐ |
