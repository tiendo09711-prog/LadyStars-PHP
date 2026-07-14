# Kịch bản kiểm thử thủ công — Trang Tổng quan (`/`)

> URL: `http://localhost:5173/`  
> Phạm vi: Dashboard/Tổng quan và các tương tác trực tiếp từ trang này.  
> Cơ sở lập test: UI `DashboardPage`, layout dùng chung, API dashboard và API cảnh báo tồn kho tại source hiện tại.

## 1. Cách sử dụng tài liệu

- Thực hiện Smoke/P0 trước, sau đó P1, P2 và ma trận tổ hợp.
- Với mỗi case, ghi `PASS`, `FAIL`, `BLOCKED` hoặc `N/A` vào cột **KQ**; khi FAIL ghi ảnh/video, thời điểm, tài khoản, cửa hàng, request/response và lỗi Console.
- Giá trị tiền/số phải đối soát với DB/API hoặc báo cáo nguồn; chỉ nhìn UI “có số” chưa được tính là PASS.
- Không tạo/sửa/xóa dữ liệu thật chỉ để chuẩn bị test. Dùng dữ liệu test/local đã được phép.
- “Không lỗi kỹ thuật” nghĩa là không có màn hình trắng, component vỡ, request lặp vô hạn, lỗi đỏ Console, lỗi mạng bất ngờ hoặc URL sai.

### Mẫu ghi nhận lỗi

| Trường             | Nội dung cần ghi                                                   |
| ------------------ | ------------------------------------------------------------------ |
| Test case          | Ví dụ `DB-CH-012`                                                  |
| Môi trường         | Browser/version, viewport, tài khoản, thời gian                    |
| Dữ liệu            | Cửa hàng, khoảng ngày, mã đơn/mã sản phẩm                          |
| Bước tái hiện      | Đánh số chính xác từng click/phím                                  |
| Thực tế / Mong đợi | Nêu rõ chênh lệch                                                  |
| Bằng chứng         | Screenshot/video, Console, request + status + response (che token) |

## 2. Tiền điều kiện và bộ dữ liệu kiểm thử

Chuẩn bị tối thiểu các fixture **đọc-only khi test dashboard**:

| Mã  | Dữ liệu cần có                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------- |
| U1  | Tài khoản ADMIN đang hoạt động, đăng nhập được                                                       |
| U2  | Tài khoản EMPLOYEE đang hoạt động, đăng nhập được                                                    |
| U3  | Phiên không có token; token sai/hết hạn                                                              |
| S1  | Ít nhất 2 cửa hàng active: A, B; tên dễ phân biệt                                                    |
| S2  | Một cửa hàng tên rất dài và/hoặc có dấu, ký tự `&`, dấu phẩy nếu nghiệp vụ cho phép                  |
| D1  | Hôm nay có giao dịch completed ở A và B, tổng tiền biết trước                                        |
| D2  | Có giao dịch completed ở hôm qua, 3, 7, 14, 30 ngày trước và biên 00:00/23:59                        |
| D3  | Có giao dịch pending/cancelled để xác nhận không cộng vào doanh thu completed                        |
| D4  | Có ngày không phát sinh doanh thu; có khoảng hoàn toàn rỗng                                          |
| D5  | Có đơn chứa nhiều sản phẩm, sản phẩm dùng local ID và legacy/mongo ID nếu dữ liệu hỗ trợ             |
| P1  | Sản phẩm có SL bán, SL trả và doanh thu biết trước; có đồng hạng doanh thu                           |
| P2  | Sản phẩm tên/mã rất dài, Unicode; sản phẩm thiếu metadata/đã không còn trong danh mục nếu có         |
| I1  | Tồn kho A và B khác nhau, có qty/cost/price bằng 0 và số thập phân                                   |
| L1  | Hàng chưa bán lâu, bán chậm, hàng không thuộc cảnh báo và danh sách cảnh báo rỗng ở môi trường riêng |
| E1  | Có cách an toàn mô phỏng GET chậm, 401/403, 422, 500 và mất mạng bằng DevTools hoặc mock local       |

### Điểm đối soát dữ liệu

1. Dashboard chính: `GET /api/dashboard`.
2. Chi tiết ngày: `GET /api/dashboard/daily-products?date=YYYY-MM-DD&stores=...`.
3. Cảnh báo tồn: `GET /api/products/storage-duration?page=1&limit=5`.
4. Doanh thu chỉ tính giao dịch trạng thái `completed/COMPLETED`; giao dịch gần nhất có thể chứa trạng thái khác theo response hiện tại.
5. “Kỳ trước” phải là khoảng liền trước có cùng số ngày với kỳ đang xem.
6. Với lọc “Đến ngày” đơn lẻ, API hiện lấy cửa sổ 30 ngày kết thúc tại ngày đã chọn.

## 3. Smoke test bắt buộc

| ID        | P   | Tiền điều kiện  | Các bước thao tác/nút bấm                                                                                            | Kết quả mong đợi                                                                                              | KQ  |
| --------- | --- | --------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --- |
| DB-SM-001 | P0  | U1, server chạy | 1. Mở Chrome. 2. Nhập `http://localhost:5173/`. 3. Enter. 4. Chờ hết đồng bộ.                                        | Vào Dashboard, không trắng trang; header, sidebar, lời chào, 5 khối nội dung xuất hiện; không lỗi Console.    | ☐   |
| DB-SM-002 | P0  | DB-SM-001       | 1. Quan sát header. 2. Quan sát tab browser. 3. Mở nhóm **Tổng quan** ở sidebar.                                     | Header hiện tên shop + `Dashboard`; title tab là `Dashboard • <tên shop>`; mục Dashboard active.              | ☐   |
| DB-SM-003 | P0  | D1              | 1. Chờ trạng thái **Đã cập nhật**. 2. Quan sát biểu đồ, Top sản phẩm, Tồn kho, Cảnh báo tồn kho, Giao dịch gần nhất. | Tất cả khối render đúng, không `NaN`, `undefined`, số âm bất hợp lý hay text đè nhau.                         | ☐   |
| DB-SM-004 | P0  | S1              | 1. Bấm **Tất cả cửa hàng**. 2. Tick A. 3. Click ngoài popup. 4. Chờ đồng bộ.                                         | Nhãn thành A; popup đóng; dữ liệu phụ thuộc cửa hàng cập nhật đúng A.                                         | ☐   |
| DB-SM-005 | P0  | D1              | 1. Bấm dropdown `7 ngày` ở biểu đồ. 2. Chọn `30 ngày`. 3. Bấm dropdown loại biểu đồ. 4. Chọn `Đường doanh thu`.      | Request mới thành công; nhãn khoảng/kiểu đúng; biểu đồ đường render và dữ liệu đúng 30 ngày.                  | ☐   |
| DB-SM-006 | P0  | D1,D5           | 1. Trỏ chuột vào điểm/cột có doanh thu. 2. Click đúng điểm/cột. 3. Chờ modal. 4. Bấm nút **X**.                      | Tooltip đúng; modal đúng ngày, bảng đúng sản phẩm; X đóng modal và trang dùng tiếp được.                      | ☐   |
| DB-SM-007 | P0  | P1              | 1. Ở **Sản phẩm bán chạy**, bấm `7 ngày` → `14 ngày`. 2. Bấm `Top 10` → `Top 20`.                                    | Bảng reload, tối đa 20 dòng, hạng và số liệu đúng 14 ngày.                                                    | ☐   |
| DB-SM-008 | P0  | Trang đã tải    | 1. Bấm **Làm mới**. 2. Quan sát thanh tiến trình và trạng thái.                                                      | Hiện `Đang đồng bộ...`, không nhân đôi UI; hoàn tất về `Đã cập nhật`; dashboard và cảnh báo tồn được gọi lại. | ☐   |

## 4. Truy cập, xác thực, quyền và layout dùng chung

| ID        | P   | Tiền điều kiện                     | Các bước thao tác/nút bấm                                                                           | Kết quả mong đợi                                                                                  | KQ  |
| --------- | --- | ---------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --- |
| DB-AU-001 | P0  | U3 không token                     | 1. Xóa token hợp lệ bằng luồng đăng xuất. 2. Nhập URL `/`.                                          | Chuyển tới `/login`; không ló dữ liệu dashboard nhạy cảm.                                         | ☐   |
| DB-AU-002 | P0  | U3 token sai/hết hạn               | 1. Mở `/`. 2. Chờ `/auth/me`.                                                                       | Token bị loại bỏ, chuyển `/login`; không lặp redirect/request.                                    | ☐   |
| DB-AU-003 | P1  | U1                                 | 1. Đăng nhập ADMIN. 2. Mở `/`. 3. Quan sát avatar, email, vai trò và menu.                          | Đúng thông tin ADMIN; có Báo Cáo, Quản lý nhân viên, Cài đặt và cấu hình kho theo quyền hiện tại. | ☐   |
| DB-AU-004 | P1  | U2                                 | 1. Đăng nhập EMPLOYEE. 2. Mở `/`. 3. Quan sát menu.                                                 | Vào Dashboard được; không hiện Báo Cáo, Quản lý nhân viên, Cài đặt/cấu hình kho dành ADMIN.       | ☐   |
| DB-AU-005 | P1  | U1/U2                              | 1. Click vùng tên/email góc sidebar. 2. Quan sát summary. 3. Click lại.                             | Menu user mở/đóng ổn định; đúng tên và nhãn vai trò, không làm mở/đóng sidebar ngoài ý muốn.      | ☐   |
| DB-AU-006 | P0  | User menu mở                       | 1. Bấm **Đăng xuất**. 2. Bấm Back browser.                                                          | Về `/login`, token mất; Back không truy cập lại dashboard.                                        | ☐   |
| DB-AU-007 | P2  | Desktop                            | 1. Hover nhóm **Tổng quan**. 2. Click tiêu đề nhóm. 3. Click **Dashboard**. 4. Click ngoài sidebar. | Nhóm mở/đóng đúng; Dashboard active; click ngoài đóng panel, không đổi route sai.                 | ☐   |
| DB-AU-008 | P1  | Viewport ≤1200                     | 1. Bấm nút menu ba gạch. 2. Mở **Tổng quan**. 3. Bấm **Dashboard**.                                 | Sidebar mobile mở, active group hiện; điều hướng xong sidebar đóng.                               | ☐   |
| DB-AU-009 | P1  | Sidebar mobile mở                  | 1. Bấm nút **X** trên sidebar. 2. Mở lại. 3. Bấm vùng mờ ngoài sidebar.                             | Cả X và scrim đều đóng sidebar, không cuộn ngang hay mất scroll trang.                            | ☐   |
| DB-AU-010 | P1  | U1                                 | 1. Từ Dashboard click một trang khác. 2. Bấm Back. 3. Bấm Forward.                                  | Back về Dashboard đúng state được hỗ trợ; Forward đúng route; title/header cập nhật tương ứng.    | ☐   |
| DB-AU-011 | P2  | API settings lỗi nhưng auth hợp lệ | 1. Mô phỏng `/settings/store` lỗi. 2. Reload `/`.                                                   | Dashboard vẫn tải; fallback tên shop `LadyStars`; không đăng xuất oan.                            | ☐   |
| DB-AU-012 | P1  | API auth lỗi                       | 1. Mô phỏng `/auth/me` lỗi. 2. Reload.                                                              | Bị đăng xuất an toàn, không hiển thị user giả/fallback như người đã xác thực.                     | ☐   |

## 5. Tải trang, hero, trạng thái đồng bộ và lỗi chung

| ID        | P   | Tiền điều kiện                        | Các bước thao tác/nút bấm                                                             | Kết quả mong đợi                                                                                                | KQ  |
| --------- | --- | ------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --- |
| DB-LD-001 | P1  | Network Slow 3G                       | 1. Bật throttling. 2. Reload `/`.                                                     | Có thanh progress, skeleton biểu đồ/5 dòng Top/4 giao dịch; trạng thái `Đang đồng bộ...`; layout không nhảy vỡ. | ☐   |
| DB-LD-002 | P1  | User API nhanh/chậm tùy mock          | 1. Reload. 2. Quan sát lời chào trước/sau `/auth/me`.                                 | Ban đầu `Xin chào`; sau đó thêm đúng tên; không hiện `undefined` hoặc tên fallback sai.                         | ☐   |
| DB-LD-003 | P1  | Đồng hồ hệ thống đúng                 | 1. Quan sát dòng dưới lời chào. 2. Đối chiếu ngày/thứ địa phương vi-VN.               | Hiện đúng thứ, `dd/mm/yyyy` và nhãn cửa hàng.                                                                   | ☐   |
| DB-LD-004 | P2  | Giữ trang qua phút mới                | 1. Mở trước thời điểm đổi phút/ngày (nếu có thể dùng clock mock). 2. Chờ timer.       | Nhãn ngày cập nhật mỗi phút, không cần reload và không tạo timer trùng.                                         | ☐   |
| DB-LD-005 | P0  | E1 dashboard 500, chưa có data        | 1. Chặn `/dashboard` trả 500 có message. 2. Reload.                                   | Hiện alert message server hoặc `Không thể tải dữ liệu tổng quan.`; loading kết thúc; không crash.               | ☐   |
| DB-LD-006 | P1  | Đã tải data, sau đó dashboard 500     | 1. Tải thành công. 2. Chặn API. 3. Bấm **Làm mới**.                                   | Alert lỗi xuất hiện; dữ liệu cũ không biến mất thành số 0; nút vẫn cho thử lại.                                 | ☐   |
| DB-LD-007 | P0  | Sau DB-LD-006                         | 1. Khôi phục mạng/API. 2. Bấm **Làm mới**.                                            | Alert cũ bị xóa khi request mới bắt đầu; data mới tải thành công.                                               | ☐   |
| DB-LD-008 | P1  | E1 offline                            | 1. Chuyển Offline. 2. Reload hoặc bấm **Làm mới**. 3. Online lại. 4. Bấm **Làm mới**. | Offline có thông báo, không treo loading; online phục hồi không cần đăng nhập lại nếu token còn hợp lệ.         | ☐   |
| DB-LD-009 | P2  | API trả số 0/null thiếu field an toàn | 1. Mock response totals/inventory 0, mảng rỗng. 2. Reload.                            | UI dùng 0/empty state; không `NaN`, không crash do field thiếu được phép.                                       | ☐   |
| DB-LD-010 | P2  | API trả số rất lớn/thập phân          | 1. Mock/chuẩn bị số lớn. 2. Reload.                                                   | Format `vi-VN`, không notation lạ, không tràn card; trục dùng K/M hợp lý.                                       | ☐   |

## 6. Bộ lọc cửa hàng

| ID        | P   | Tiền điều kiện                                    | Các bước thao tác/nút bấm                                                 | Kết quả mong đợi                                                                                                                                                                              | KQ  |
| --------- | --- | ------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| DB-ST-001 | P0  | S1                                                | 1. Reload. 2. Quan sát trigger. 3. Bấm trigger.                           | Mặc định `Tất cả cửa hàng`; popup liệt kê mọi cửa hàng active và checkbox chưa tick; `aria-expanded=true`.                                                                                    | ☐   |
| DB-ST-002 | P1  | Popup mở                                          | 1. Bấm lại trigger. 2. Mở lại. 3. Click vùng trống ngoài popup.           | Mỗi thao tác đóng popup; trigger về `aria-expanded=false`.                                                                                                                                    | ☐   |
| DB-ST-003 | P1  | Popup mở                                          | 1. Nhấn `Escape`.                                                         | Popup đóng, trang không thoát route/không thay filter.                                                                                                                                        | ☐   |
| DB-ST-004 | P0  | A chưa chọn                                       | 1. Tick checkbox A. 2. Quan sát trigger khi popup vẫn mở. 3. Chờ request. | Checkbox A checked; nhãn thành A; request có `stores=A` URL-encoded; dữ liệu cập nhật.                                                                                                        | ☐   |
| DB-ST-005 | P0  | A đang chọn                                       | 1. Bỏ tick A.                                                             | Nhãn về `Tất cả cửa hàng`; request không có `stores`; dữ liệu toàn hệ thống.                                                                                                                  | ☐   |
| DB-ST-006 | P0  | A,B                                               | 1. Tick A. 2. Tick B.                                                     | Nhãn `2 cửa hàng`; request có đúng A,B một lần; tổng doanh thu bằng hợp A+B, không nhân đôi.                                                                                                  | ☐   |
| DB-ST-007 | P0  | ≥2 stores                                         | 1. Bấm **Chọn tất cả**.                                                   | Tất cả checkbox checked; nhãn `<n> cửa hàng` (nếu n>1); request gồm mọi store đúng thứ tự hiển thị.                                                                                           | ☐   |
| DB-ST-008 | P0  | Có stores selected                                | 1. Bấm **Bỏ chọn**.                                                       | Mọi checkbox bỏ tick; nhãn `Tất cả cửa hàng`; không hiểu nhầm thành “không cửa hàng”.                                                                                                         | ☐   |
| DB-ST-009 | P1  | Đã chọn A                                         | 1. Đóng popup. 2. Mở lại.                                                 | A vẫn checked trong phiên; nhãn và data không đổi.                                                                                                                                            | ☐   |
| DB-ST-010 | P1  | Đã chọn A                                         | 1. Reload browser.                                                        | Ghi nhận hành vi hiện tại: lựa chọn reset về tất cả (không có persistence); không để nhãn A nhưng data tất cả hoặc ngược lại.                                                                 | ☐   |
| DB-ST-011 | P1  | S2                                                | 1. Mở popup. 2. Tick store tên dài/có ký tự đặc biệt. 3. Xem Network.     | Tên hiển thị không phá layout; query encode đúng; backend lọc đúng. Nếu tên chứa dấu phẩy được phép, phải phát hiện lỗi tách sai.                                                             | ☐   |
| DB-ST-012 | P1  | Nhiều stores > chiều cao popup                    | 1. Mở popup. 2. Cuộn danh sách tới cuối. 3. Tick store cuối.              | Chỉ list cuộn; action còn dùng được; popup không vượt viewport; chọn đúng item.                                                                                                               | ☐   |
| DB-ST-013 | P2  | Trigger gần đáy viewport                          | 1. Cuộn để trigger gần đáy (hoặc giảm chiều cao). 2. Mở.                  | Popup tự mở lên trên khi đủ chỗ, không bị cắt.                                                                                                                                                | ☐   |
| DB-ST-014 | P2  | Popup mở                                          | 1. Cuộn trang/container.                                                  | Popup bám lại trigger hoặc giữ trong viewport, không trôi sai vị trí.                                                                                                                         | ☐   |
| DB-ST-015 | P2  | Popup mở                                          | 1. Resize cửa sổ.                                                         | Popup đóng; không còn portal “mồ côi”.                                                                                                                                                        | ☐   |
| DB-ST-016 | P1  | API trả `availableStores=[]`                      | 1. Mở filter.                                                             | Hiện `Chưa có cửa hàng khả dụng.`; Chọn tất cả/Bỏ chọn không crash; dashboard vẫn xem toàn hệ thống.                                                                                          | ☐   |
| DB-ST-017 | P1  | Store đang chọn sau đó bị inactive ở response mới | 1. Chọn A. 2. Mock response sau refresh không còn A. 3. Bấm **Làm mới**.  | Không có state “A được chọn nhưng không tồn tại” âm thầm; hệ thống phải reset/cảnh báo hoặc vẫn lọc nhất quán. Ghi lỗi nếu nhãn/data mâu thuẫn.                                               | ☐   |
| DB-ST-018 | P0  | I1                                                | 1. Ghi KPI tồn kho toàn hệ thống. 2. Chọn A. 3. Ghi KPI. 4. Chọn B.       | `Số lượng tồn`, `Giá vốn`, `Giá bán quy đổi` đổi theo đúng từng store như mô tả UI. Đây là probe regression trọng yếu.                                                                        | ☐   |
| DB-ST-019 | P0  | P1 có trả hàng khác store                         | 1. Chọn A. 2. Đối soát Top sản phẩm gồm SL trả. 3. Chọn B.                | Cả SL bán, SL trả, doanh thu đều scoped cùng store; không lấy trả hàng toàn hệ thống.                                                                                                         | ☐   |
| DB-ST-020 | P0  | D5                                                | 1. Chọn A. 2. Click ngày trên chart. 3. Đối soát modal.                   | Chi tiết ngày chỉ chứa sản phẩm của A; tiêu đề đúng ngày; tổng dòng khớp chart A.                                                                                                             | ☐   |
| DB-ST-021 | P1  | L1                                                | 1. Chọn A rồi B. 2. Quan sát Cảnh báo tồn kho.                            | Xác minh yêu cầu nghiệp vụ: card hiện không ghi “theo cửa hàng”. Nếu phải theo filter chung, số/list phải đổi; nếu toàn hệ thống, phải giữ nguyên và UI cần diễn đạt rõ. Ghi nhận quyết định. | ☐   |

## 7. Khoảng thời gian biểu đồ và bộ lọc ngày

### 7.1 Preset

Thực hiện từng dòng bằng: **bấm dropdown khoảng thời gian → bấm đúng option → chờ đồng bộ → xem Network và đối soát trục/ngày/tổng**.

| ID        | P   | Option        | Kết quả mong đợi                                                                                                          | KQ  |
| --------- | --- | ------------- | ------------------------------------------------------------------------------------------------------------------------- | --- |
| DB-RG-001 | P0  | `7 ngày`      | Request `chartRange=7 ngày`; đúng 7 ngày gồm hôm nay; label `7 ngày gần nhất`.                                            | ☐   |
| DB-RG-002 | P1  | `14 ngày`     | Đúng 14 ngày liên tục; không thiếu/trùng ngày qua ranh giới tháng.                                                        | ☐   |
| DB-RG-003 | P1  | `30 ngày`     | Đúng 30 ngày liên tục; tooltip/trục vẫn dùng được.                                                                        | ☐   |
| DB-RG-004 | P1  | `Tháng này`   | Từ ngày 01 đến hôm nay; số điểm bằng ngày hiện tại; kỳ trước cùng độ dài.                                                 | ☐   |
| DB-RG-005 | P1  | `Tháng trước` | Toàn bộ tháng lịch trước, đúng 28/29/30/31 ngày; không lẫn tháng hiện tại.                                                | ☐   |
| DB-RG-006 | P0  | `Tuần này`    | Request dùng `startDate` thứ Hai và `endDate` Chủ nhật tuần hiện tại; label `Tuần này`; đủ 7 ngày kể cả tương lai bằng 0. | ☐   |
| DB-RG-007 | P0  | `Tuần trước`  | Thứ Hai–Chủ nhật liền trước, đủ 7 ngày; không dùng rolling 7 ngày.                                                        | ☐   |

### 7.2 Ngày tùy chỉnh và validation

| ID        | P   | Tiền điều kiện                           | Các bước thao tác/nút bấm                                    | Kết quả mong đợi                                                                                                                       | KQ  |
| --------- | --- | ---------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --- |
| DB-DT-001 | P0  | Không có ngày                            | 1. Click ô **TỪ**. 2. Chọn một ngày quá khứ.                 | Dropdown preset bị disabled; label `Từ dd/mm/yyyy`; request chỉ có `startDate`, không có `chartRange`; dữ liệu từ ngày đó đến hôm nay. | ☐   |
| DB-DT-002 | P0  | Không có ngày                            | 1. Click ô **ĐẾN**. 2. Chọn một ngày quá khứ.                | Preset disabled; request chỉ `endDate`; dữ liệu không vượt endDate và cửa sổ là 30 ngày kết thúc tại đó.                               | ☐   |
| DB-DT-003 | P0  | Không có ngày                            | 1. Chọn TỪ. 2. Chọn ĐẾN lớn hơn TỪ.                          | Label đúng hai đầu; request có cả hai; số ngày inclusive; không dùng preset.                                                           | ☐   |
| DB-DT-004 | P1  | Không có ngày                            | 1. Chọn TỪ và ĐẾN cùng một ngày.                             | Một điểm ngày; tổng/đỉnh/tooltip/modal đúng ngày đó.                                                                                   | ☐   |
| DB-DT-005 | P0  | Không có ngày                            | 1. Chọn TỪ sau ĐẾN.                                          | Hai ô có trạng thái invalid, label có `(không hợp lệ)`; không gửi khoảng ngược. UI không crash và cần thông báo đủ rõ cho user.        | ☐   |
| DB-DT-006 | P0  | DB-DT-005                                | 1. Sửa ĐẾN thành ngày ≥ TỪ.                                  | Invalid biến mất ngay; request custom hợp lệ được gửi; chart cập nhật.                                                                 | ☐   |
| DB-DT-007 | P1  | Đã chọn cả hai                           | 1. Xóa giá trị TỪ bằng nút clear/native keyboard.            | Còn chế độ `Đến ...`; preset vẫn disabled; request chỉ endDate.                                                                        | ☐   |
| DB-DT-008 | P1  | Đã chọn cả hai                           | 1. Xóa ĐẾN.                                                  | Còn chế độ `Từ ...`; request chỉ startDate.                                                                                            | ☐   |
| DB-DT-009 | P0  | Có một/hai ngày                          | 1. Xóa hết cả TỪ và ĐẾN.                                     | Preset enable lại; request dùng preset đang giữ; label đúng preset.                                                                    | ☐   |
| DB-DT-010 | P1  | Có custom date                           | 1. Cố click dropdown preset disabled. 2. Dùng Tab/Enter thử. | Không mở, không đổi preset, có style disabled rõ; focus không gây lỗi.                                                                 | ☐   |
| DB-DT-011 | P1  | Chọn preset `Tuần trước` rồi custom date | 1. Chọn custom range. 2. Xóa cả hai ngày.                    | Trở lại đúng `Tuần trước` đã chọn trước đó; không tự nhảy `7 ngày`.                                                                    | ☐   |
| DB-DT-012 | P1  | Dữ liệu qua cuối tháng                   | 1. Chọn 28/01 → 03/02.                                       | Đủ từng ngày inclusive, đúng thứ tự, không lỗi timezone/lệch 1 ngày.                                                                   | ☐   |
| DB-DT-013 | P1  | Năm nhuận                                | 1. Chọn 28/02 → 01/03 ở năm nhuận. 2. Lặp năm không nhuận.   | Có/không có 29/02 đúng lịch; tổng không lệch.                                                                                          | ☐   |
| DB-DT-014 | P1  | Dữ liệu qua năm                          | 1. Chọn 30/12 năm trước → 02/01 năm sau.                     | Đủ 4 ngày, đúng fullDate khi mở modal, label đúng năm.                                                                                 | ☐   |
| DB-DT-015 | P1  | Hôm nay                                  | 1. Chọn TỪ là hôm nay.                                       | Dữ liệu đúng hôm nay, không cộng ngày mai và không rỗng do timezone.                                                                   | ☐   |
| DB-DT-016 | P2  | Cho phép chọn tương lai                  | 1. Chọn TỪ/ĐẾN hoàn toàn tương lai.                          | Không crash; chart empty/0; không phát sinh doanh thu giả.                                                                             | ☐   |
| DB-DT-017 | P2  | Start trước hôm nay, end tương lai       | 1. Chọn khoảng cắt qua hôm nay.                              | Ngày tương lai 0, ngày thực đúng; không nhân bản dữ liệu hôm nay.                                                                      | ☐   |
| DB-DT-018 | P1  | Khoảng rất dài                           | 1. Chọn khoảng 1 năm. 2. Chờ response.                       | Trang không treo; trục/tooltip vẫn dùng được; nếu hệ thống giới hạn phải báo validation rõ thay vì 500.                                | ☐   |
| DB-DT-019 | P2  | Browser cho phép nhập bàn phím           | 1. Focus TỪ. 2. Nhập/xóa bằng bàn phím. 3. Tab sang ĐẾN.     | Chỉ ngày hợp lệ được áp dụng; focus rõ; không gửi chuỗi ngày malformed.                                                                | ☐   |

## 8. Kiểu biểu đồ, số tổng hợp, tooltip và modal theo ngày

### 8.1 Biểu đồ

| ID        | P   | Các bước thao tác/nút bấm                                                      | Kết quả mong đợi                                                                                              | KQ  |
| --------- | --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | --- |
| DB-CH-001 | P0  | 1. Bấm dropdown loại biểu đồ. 2. Chọn **Cột so sánh**.                         | Có cột `Kỳ này` + `Kỳ trước`, legend đúng; meta hai kỳ khớp tổng cột.                                         | ☐   |
| DB-CH-002 | P0  | 1. Chọn **Cột doanh thu**.                                                     | Chỉ cột kỳ này; không còn series kỳ trước trên chart; meta vẫn không sai.                                     | ☐   |
| DB-CH-003 | P0  | 1. Chọn **Đường doanh thu**.                                                   | Một đường tên `Doanh thu`, điểm đúng từng ngày; không hiện series kỳ trước.                                   | ☐   |
| DB-CH-004 | P0  | 1. Chọn **Miền doanh thu**.                                                    | Miền kỳ này + đường kỳ trước, legend/màu đúng, không che tooltip.                                             | ☐   |
| DB-CH-005 | P1  | 1. Với mỗi kiểu, hover lần lượt điểm có 0 và >0.                               | Tooltip đúng ngày, tên series, màu và format số; không nhấp nháy/kẹt ngoài viewport.                          | ☐   |
| DB-CH-006 | P0  | 1. Cộng revenue trong response. 2. So với meta **Kỳ này**. 3. Lặp prevRevenue. | Tổng tuyệt đối khớp, kể cả số 0/thập phân.                                                                    | ☐   |
| DB-CH-007 | P0  | 1. Tìm revenue lớn nhất response. 2. So **Đỉnh doanh thu**.                    | Đúng số và `YYYY-MM-DD`; nếu tất cả 0 hiện `Chưa có dữ liệu`.                                                 | ☐   |
| DB-CH-008 | P1  | 1. Dùng dữ liệu có hai ngày cùng đỉnh.                                         | Hành vi nhất quán (source chọn ngày xuất hiện đầu tiên); không đổi ngẫu nhiên khi refresh.                    | ☐   |
| DB-CH-009 | P1  | 1. Chọn khoảng không có doanh thu cả hai kỳ.                                   | Empty `Khoảng này chưa có doanh thu...`; chart không gây lỗi; meta 0, đỉnh chưa có.                           | ☐   |
| DB-CH-010 | P1  | 1. Chọn kỳ này 0 nhưng kỳ trước >0 ở Cột so sánh/Miền.                         | Không hiện empty sai; vẫn thấy dữ liệu kỳ trước.                                                              | ☐   |
| DB-CH-011 | P1  | 1. Resize từ desktop xuống mobile và ngược lại với chart có dữ liệu.           | ResponsiveContainer redraw đúng; không cắt trục/legend hoặc tạo scrollbar ngang body.                         | ☐   |
| DB-CH-012 | P1  | 1. Đổi 4 loại liên tiếp thật nhanh.                                            | Cuối cùng đúng lựa chọn cuối; không chồng SVG/legend, không gửi request dashboard thừa vì đổi loại chỉ là UI. | ☐   |

### 8.2 Modal chi tiết sản phẩm bán ra

| ID        | P   | Tiền điều kiện        | Các bước thao tác/nút bấm                                              | Kết quả mong đợi                                                                                                                              | KQ  |
| --------- | --- | --------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| DB-MD-001 | P0  | Ngày có data          | 1. Ở Cột so sánh, click cột **Kỳ này**.                                | Modal mở; request đúng `fullDate` của điểm và stores; tiêu đề đúng ngày; hiện loading rồi bảng.                                               | ☐   |
| DB-MD-002 | P1  | Ngày có data kỳ trước | 1. Click cột **Kỳ trước** tại nhãn ngày hiện tại.                      | Xác minh ngày request: modal phải phản ánh ngày user kỳ vọng. Ghi lỗi nếu click series kỳ trước nhưng API mở `fullDate` kỳ này gây hiểu nhầm. | ☐   |
| DB-MD-003 | P0  | 4 loại chart          | 1. Lần lượt chọn từng loại. 2. Click điểm/cột có payload.              | Modal mở được từ cả 4 loại, không chỉ từ cột.                                                                                                 | ☐   |
| DB-MD-004 | P1  | D5                    | 1. Mở modal ngày có nhiều sản phẩm.                                    | Cột #, tên+mã, SL, giá bán TB, doanh thu đúng; xếp theo doanh thu giảm dần; format vi-VN.                                                     | ☐   |
| DB-MD-005 | P0  | D5                    | 1. Cộng doanh thu từng dòng modal. 2. So revenue ngày trên chart.      | Khớp tuyệt đối cho cùng store/ngày; không bỏ item dùng local ID hay legacy ID.                                                                | ☐   |
| DB-MD-006 | P1  | Ngày không có item    | 1. Click điểm ngày 0/không có item nếu chart nhận click.               | Modal không crash; hiện `Không có sản phẩm bán ra trong ngày này`.                                                                            | ☐   |
| DB-MD-007 | P1  | API daily chậm        | 1. Throttle request. 2. Click điểm.                                    | Modal mở ngay, hiện `Đang tải dữ liệu chi tiết...`; không hiện dữ liệu ngày trước.                                                            | ☐   |
| DB-MD-008 | P0  | E1 daily 500/offline  | 1. Chặn daily API. 2. Click điểm.                                      | Loading phải kết thúc và có lỗi + cách đóng/thử lại; không unhandled rejection và không treo vô hạn. Đây là probe lỗi trọng yếu.              | ☐   |
| DB-MD-009 | P0  | Modal mở              | 1. Bấm nút icon **X** góc phải.                                        | Modal đóng; focus/scroll trang phục hồi; mở lần sau đúng dữ liệu mới.                                                                         | ☐   |
| DB-MD-010 | P1  | Modal mở              | 1. Nhấn `Escape`.                                                      | Theo chuẩn modal, modal đóng. Nếu không đóng, ghi accessibility/UX defect.                                                                    | ☐   |
| DB-MD-011 | P1  | Modal mở              | 1. Click vùng backdrop ngoài hộp.                                      | Theo quy ước modal của sản phẩm, nên đóng hoặc có hành vi được đặc tả; không click xuyên vào dashboard. Ghi thực tế.                          | ☐   |
| DB-MD-012 | P1  | Modal mở, nhiều dòng  | 1. Cuộn body modal tới cuối. 2. Quan sát header.                       | Nội dung cuộn trong modal, không vượt viewport; header/nút X tiếp cận được; body phía sau không cuộn ngoài ý muốn.                            | ☐   |
| DB-MD-013 | P1  | Modal mở              | 1. Dùng Tab/Shift+Tab qua control.                                     | Focus thấy rõ, không rơi vào control dashboard phía sau; nút X có accessible name phù hợp.                                                    | ☐   |
| DB-MD-014 | P1  | Request daily chậm    | 1. Click ngày A. 2. Đóng modal ngay. 3. Click ngày B trước khi A xong. | Không để response A ghi đè modal B; tiêu đề và bảng luôn cùng ngày.                                                                           | ☐   |
| DB-MD-015 | P2  | P2 tên dài            | 1. Mở modal có tên/mã dài ở mobile.                                    | Table cuộn ngang trong vùng hợp lý; text không đè số/nút X; không tràn body.                                                                  | ☐   |

## 9. Sản phẩm bán chạy

| ID        | P   | Tiền điều kiện                     | Các bước thao tác/nút bấm                                     | Kết quả mong đợi                                                                                                                                  | KQ  |
| --------- | --- | ---------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| DB-TP-001 | P0  | P1                                 | 1. Mặc định tải trang.                                        | Filter `7 ngày`, `Top 10`; tối đa 10 dòng; hạng bắt đầu 1, liên tục, doanh thu giảm dần.                                                          | ☐   |
| DB-TP-002 | P1  | P1                                 | 1. Bấm range → `14 ngày`. 2. Đối soát.                        | Request `topRange=14 ngày`; bảng đúng 14 ngày inclusive.                                                                                          | ☐   |
| DB-TP-003 | P1  | P1                                 | 1. Chọn `30 ngày`.                                            | Request đúng; số liệu đúng 30 ngày.                                                                                                               | ☐   |
| DB-TP-004 | P1  | >10 sản phẩm                       | 1. Bấm limit → `Top 20`.                                      | Tối đa 20 dòng, không phân trang giả; thứ hạng đúng.                                                                                              | ☐   |
| DB-TP-005 | P1  | >20 sản phẩm                       | 1. Chọn `Top 50`.                                             | Tối đa 50; table có thể cuộn, không kéo vỡ chiều cao trang.                                                                                       | ☐   |
| DB-TP-006 | P1  | Ít hơn limit                       | 1. Chọn Top 50.                                               | Chỉ hiện số sản phẩm thực, không dòng rỗng/nhân bản.                                                                                              | ☐   |
| DB-TP-007 | P0  | P1                                 | 1. Đối chiếu từng dòng với đơn completed và refund completed. | `SL bán`, `SL trả`, `Doanh thu` đúng; pending/cancelled không cộng; doanh thu không tự trừ refund nếu nghiệp vụ/source không làm vậy.             | ☐   |
| DB-TP-008 | P1  | Sản phẩm SL trả=0 và >0            | 1. Quan sát cột SL trả.                                       | 0 hiển thị trống theo UI; >0 có số và tone cảnh báo; không nhầm trống là missing data.                                                            | ☐   |
| DB-TP-009 | P1  | P2                                 | 1. Hover tên bị ellipsis.                                     | Cell không phá layout; thuộc tính title cho xem đầy đủ bằng tooltip native; mã vẫn đọc được.                                                      | ☐   |
| DB-TP-010 | P1  | Không có bán completed trong range | 1. Chọn range rỗng.                                           | Một empty row `Chưa có dữ liệu...`, colSpan đúng, không còn skeleton.                                                                             | ☐   |
| DB-TP-011 | P1  | API chậm                           | 1. Reload chậm.                                               | Đúng 5 skeleton row lúc initial load; khi đổi filter có trạng thái loading hợp lý, dữ liệu cũ không nhảy thành empty giả.                         | ☐   |
| DB-TP-012 | P1  | Đồng hạng revenue                  | 1. Reload nhiều lần.                                          | Thứ tự ổn định hoặc theo quy tắc backend; rank không trùng/mất.                                                                                   | ☐   |
| DB-TP-013 | P1  | Đổi filter nhanh                   | 1. Chọn 14→30→7 ngày nhanh. 2. Chọn Top 50→10.                | Debounce/abort request cũ; kết quả cuối đúng 7 ngày/Top 10; không flash response cũ.                                                              | ☐   |
| DB-TP-014 | P0  | Đang có custom chart range         | 1. Chọn chart custom. 2. Quan sát Top. 3. Đổi Top range.      | Top chỉ theo filter Top riêng (`7/14/30 ngày`) như control; mô tả không được khiến user hiểu nhầm là custom chart range. Ghi UX defect nếu mơ hồ. | ☐   |

### Ma trận Top sản phẩm bắt buộc

Chạy đủ 9 tổ hợp: `7,14,30 ngày × Top 10,20,50`. Với mỗi tổ hợp kiểm tra query, số dòng tối đa, thứ hạng, sort, số liệu và store scope. Đánh dấu:  
`7/10 ☐  7/20 ☐  7/50 ☐  14/10 ☐  14/20 ☐  14/50 ☐  30/10 ☐  30/20 ☐  30/50 ☐`

## 10. Tồn kho

| ID        | P   | Tiền điều kiện                          | Các bước thao tác/nút bấm                                | Kết quả mong đợi                                                                           | KQ  |
| --------- | --- | --------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --- |
| DB-IV-001 | P0  | I1                                      | 1. Đối soát **Số lượng tồn**.                            | Bằng tổng qty đúng scope cửa hàng, format vi-VN.                                           | ☐   |
| DB-IV-002 | P0  | I1                                      | 1. Đối soát **Giá vốn tồn kho**.                         | Bằng tổng qty scoped × cost theo quy tắc dữ liệu; không dùng qty global khi chọn store.    | ☐   |
| DB-IV-003 | P0  | I1                                      | 1. Đối soát **Giá bán quy đổi**.                         | Bằng tổng qty scoped × price theo quy tắc; không nhầm doanh thu thực.                      | ☐   |
| DB-IV-004 | P1  | Qty/cost/price 0/null                   | 1. Chọn store fixture.                                   | Hiện 0 đúng, không `NaN`; null được xử lý theo quy tắc backend.                            | ☐   |
| DB-IV-005 | P1  | Qty âm/thập phân nếu nghiệp vụ cho phép | 1. Chọn store fixture.                                   | Hiển thị chính xác, không tự làm tròn gây sai đối soát; giá trị bất thường không phá card. | ☐   |
| DB-IV-006 | P1  | Chọn nhiều stores                       | 1. Chọn A+B. 2. Cộng KPI riêng A và B.                   | KPI hợp bằng A+B, không trùng stock record/sản phẩm.                                       | ☐   |
| DB-IV-007 | P1  | Store không có stock                    | 1. Chọn store rỗng.                                      | Cả 3 KPI là 0, tag đúng tên store, không fallback toàn hệ thống.                           | ☐   |
| DB-IV-008 | P1  | Refresh/auto-refresh                    | 1. Ghi số. 2. Bấm Làm mới/chờ 15s khi dữ liệu không đổi. | Số giữ nguyên, không nhấp 0; tag store không reset.                                        | ☐   |

## 11. Cảnh báo tồn kho và điều hướng

| ID        | P   | Tiền điều kiện    | Các bước thao tác/nút bấm                       | Kết quả mong đợi                                                                                | KQ  |
| --------- | --- | ----------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------- | --- |
| DB-SD-001 | P1  | API chậm          | 1. Reload.                                      | Card hiện `Đang tải cảnh báo tồn kho...`; không ảnh hưởng loading dashboard chính.              | ☐   |
| DB-SD-002 | P0  | L1                | 1. Đối soát threshold.                          | Tiêu đề/mô tả và KPI cùng số ngày threshold (fallback 30 nếu 0/missing theo UI).                | ☐   |
| DB-SD-003 | P0  | L1                | 1. Đối soát `Hàng chưa bán`.                    | Số lượng đúng tập sản phẩm chưa từng bán quá threshold.                                         | ☐   |
| DB-SD-004 | P0  | L1                | 1. Đối soát `Hàng bán chậm`.                    | Đúng sản phẩm quá threshold kể từ lần bán cuối, không trùng sai với chưa bán.                   | ☐   |
| DB-SD-005 | P0  | L1                | 1. Đối soát `Giá vốn hàng tồn lâu`.             | Tổng giá vốn đúng tập cảnh báo và quy tắc qty × cost.                                           | ☐   |
| DB-SD-006 | P1  | Có top lists      | 1. Quan sát tối đa 5 link.                      | Gộp chưa bán rồi bán chậm và cắt tối đa 5 theo response hiện tại; code·name, số ngày/nhãn đúng. | ☐   |
| DB-SD-007 | P1  | Không có cảnh báo | 1. Reload.                                      | KPI 0 và empty `Chưa có dữ liệu tồn lâu đáng chú ý.`; card không biến mất.                      | ☐   |
| DB-SD-008 | P0  | E1 storage 500    | 1. Chặn storage API. 2. Reload.                 | Hiện `Không tải được cảnh báo tồn kho.`; dashboard chính vẫn dùng được.                         | ☐   |
| DB-SD-009 | P1  | Sau lỗi storage   | 1. Khôi phục API. 2. Bấm **Làm mới**.           | Error storage mất; KPI/list tải lại đúng.                                                       | ☐   |
| DB-SD-010 | P0  | Card có data      | 1. Ctrl+click hoặc click **Xem tất cả**.        | Đi tới `/products/storage-duration`; trang đích mở đúng, không 404.                             | ☐   |
| DB-SD-011 | P0  | Card có data      | 1. Click KPI `Hàng chưa bán > N ngày`.          | URL `/products/storage-duration?tab=unsold_long`; tab đúng được active.                         | ☐   |
| DB-SD-012 | P0  | Card có data      | 1. Back. 2. Click KPI `Hàng bán chậm > N ngày`. | URL có `tab=slow_selling`; dữ liệu trang đích đúng tab.                                         | ☐   |
| DB-SD-013 | P1  | Card có data      | 1. Back. 2. Click `Giá vốn hàng tồn lâu`.       | Đi trang hàng tồn lâu mặc định; không mất route.                                                | ☐   |
| DB-SD-014 | P0  | Có item           | 1. Click từng item top.                         | URL có `q=<code>` encode đúng; trang đích tìm đúng mã, kể cả ký tự đặc biệt.                    | ☐   |
| DB-SD-015 | P2  | Keyboard          | 1. Tab tới Xem tất cả/KPI/item. 2. Enter.       | Focus rõ, Enter điều hướng đúng, vùng click không nhỏ hơn nội dung.                             | ☐   |

## 12. Giao dịch gần nhất

| ID        | P   | Tiền điều kiện                      | Các bước thao tác/nút bấm                                             | Kết quả mong đợi                                                                                                                                                | KQ  |
| --------- | --- | ----------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| DB-RS-001 | P0  | D1,D2                               | 1. Mặc định quan sát `Hôm nay`.                                       | Chỉ giao dịch createdAt từ 00:00 hôm nay theo timezone browser; mới nhất trước theo response; tối đa nguồn 20.                                                  | ☐   |
| DB-RS-002 | P0  | D2                                  | 1. Bấm range → `3 ngày`.                                              | Gồm hôm nay và 2 ngày trước từ 00:00; không gồm item ngay trước biên.                                                                                           | ☐   |
| DB-RS-003 | P0  | D2                                  | 1. Chọn `7 ngày`.                                                     | Gồm hôm nay + 6 ngày trước; biên chính xác.                                                                                                                     | ☐   |
| DB-RS-004 | P0  | S1,D1                               | 1. Chọn A. 2. Đổi cả 3 recent range.                                  | Danh sách chỉ giao dịch A; subtitle có `(A)`; không lọt B.                                                                                                      | ☐   |
| DB-RS-005 | P1  | D3                                  | 1. Đối chiếu response/status.                                         | Ghi nhận rõ: danh sách có thể gồm giao dịch chưa completed do API nguồn; nếu nhãn UI hàm ý “hoàn tất” hoặc empty nói hoàn tất thì đây là inconsistency cần báo. | ☐   |
| DB-RS-006 | P1  | Data đầy đủ                         | 1. Đối chiếu từng item.                                               | Tên khách, loại, branch, tiền, thời gian `dd/mm HH:mm` đúng; không hiện `Invalid Date`.                                                                         | ☐   |
| DB-RS-007 | P1  | Thiếu customer/branch/type/date     | 1. Mở fixture.                                                        | Không `undefined/null`; fallback hợp lý; createdAt invalid không làm item lọt range.                                                                            | ☐   |
| DB-RS-008 | P1  | >20 giao dịch, một số cũ/mới xen kẽ | 1. Chọn 7 ngày.                                                       | Hiểu giới hạn: server lấy 20 gần nhất rồi frontend lọc; không kỳ vọng đủ mọi giao dịch 7 ngày. Nếu yêu cầu nghiệp vụ cần đủ, ghi defect thiếu dữ liệu.          | ☐   |
| DB-RS-009 | P1  | Range không có data                 | 1. Chọn range rỗng.                                                   | Hiện `Chưa có giao dịch hoàn tất nào để hiển thị.`; không skeleton sau load.                                                                                    | ☐   |
| DB-RS-010 | P1  | API chậm initial                    | 1. Reload.                                                            | Có 4 skeleton; sau load skeleton biến mất hoàn toàn.                                                                                                            | ☐   |
| DB-RS-011 | P2  | Nhiều item/tên dài                  | 1. Resize card/mobile. 2. Cuộn list.                                  | List cuộn đúng trong card ở desktop; text/tiền không đè; không tràn ngang.                                                                                      | ☐   |
| DB-RS-012 | P1  | Trang mở qua nửa đêm/biên range     | 1. Dùng clock mock hoặc chờ mốc. 2. Không reload, quan sát sau timer. | Filter recent cần cập nhật theo ngày mới; item hôm qua rời `Hôm nay` đúng lúc. Ghi defect nếu list không re-evaluate đúng.                                      | ☐   |

## 13. Làm mới, auto-refresh, đồng thời và persistence

| ID        | P   | Tiền điều kiện                         | Các bước thao tác/nút bấm                                                       | Kết quả mong đợi                                                                                                                     | KQ  |
| --------- | --- | -------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --- |
| DB-RF-001 | P0  | Trang ổn định                          | 1. Mở Network. 2. Bấm **Làm mới** một lần.                                      | Gọi lại `/dashboard` và `/products/storage-duration`; giữ nguyên store/range/top/type/date; không reload toàn trang.                 | ☐   |
| DB-RF-002 | P1  | Network chậm                           | 1. Bấm Làm mới 3 lần nhanh.                                                     | Không để response cũ ghi đè mới; loading kết thúc; số request không tăng vô hạn.                                                     | ☐   |
| DB-RF-003 | P0  | Network mở                             | 1. Không thao tác 16 giây. 2. Theo dõi request.                                 | Khoảng 15 giây gọi lại dashboard + storage đúng một chu kỳ.                                                                          | ☐   |
| DB-RF-004 | P1  | Chọn A/custom/top                      | 1. Chờ auto-refresh.                                                            | Giữ nguyên toàn bộ filter; request refresh mang đúng params.                                                                         | ☐   |
| DB-RF-005 | P1  | Đổi filter sát mốc 15s                 | 1. Khoảng giây 14 đổi store/range. 2. Theo dõi.                                 | Request cũ bị abort/ignore; kết quả cuối đúng filter mới; không flash dữ liệu filter cũ.                                             | ☐   |
| DB-RF-006 | P1  | Chuyển route khác                      | 1. Mở Dashboard. 2. Điều hướng trang khác. 3. Chờ >15s.                         | Timer dashboard cleanup; không tiếp tục gọi dashboard ngầm.                                                                          | ☐   |
| DB-RF-007 | P1  | Chart preset/type đã đổi               | 1. Chọn `30 ngày` + `Miền doanh thu`. 2. Reload.                                | Hai lựa chọn được lưu localStorage và phục hồi đúng.                                                                                 | ☐   |
| DB-RF-008 | P1  | localStorage chứa giá trị không hợp lệ | 1. DevTools đặt `dashboard.chartRange=x`, `dashboard.chartType=y`. 2. Reload.   | Fallback `7 ngày` + `Cột so sánh`, sau đó storage được sửa về giá trị hợp lệ.                                                        | ☐   |
| DB-RF-009 | P2  | Hai tab cùng origin                    | 1. Mở 2 tab Dashboard. 2. Đổi type/range tab A. 3. Quan sát tab B rồi reload B. | Tab B không bắt buộc đổi realtime; sau reload nhận giá trị storage mới; không corrupt state.                                         | ☐   |
| DB-RF-010 | P1  | Có custom date/store/top/recent        | 1. Reload.                                                                      | Chỉ chartRange/chartType persist theo source; store, ngày custom, topRange, topLimit, recentRange reset mặc định một cách nhất quán. | ☐   |

## 14. Dropdown/popover dùng chung trên Dashboard

Áp dụng cho 5 dropdown: khoảng chart, loại chart, khoảng Top, giới hạn Top, khoảng giao dịch.

| ID        | P   | Các bước thao tác/nút bấm                                          | Kết quả mong đợi                                                                                                                                            | KQ  |
| --------- | --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| DB-DD-001 | P1  | 1. Bấm từng trigger. 2. Bấm lại trigger.                           | Mở/đóng đúng; icon/trạng thái open rõ; option active đúng giá trị.                                                                                          | ☐   |
| DB-DD-002 | P1  | 1. Mở dropdown A. 2. Click trigger/dropdown B.                     | A đóng, B mở; không chồng hai portal.                                                                                                                       | ☐   |
| DB-DD-003 | P1  | 1. Mở. 2. Click option đang active.                                | Đóng menu, không đổi sai state, không gây request thừa nghiêm trọng.                                                                                        | ☐   |
| DB-DD-004 | P1  | 1. Mở. 2. Click ngoài. 3. Mở lại và nhấn Escape.                   | Cả hai đóng; không đổi lựa chọn.                                                                                                                            | ☐   |
| DB-DD-005 | P2  | 1. Mở gần đáy/phải viewport.                                       | Tự flip lên và căn trái trong giới hạn 8px; không bị cắt/tràn.                                                                                              | ☐   |
| DB-DD-006 | P2  | 1. Mở rồi cuộn ancestor/page.                                      | Portal tính lại vị trí, vẫn gắn trigger và trong viewport.                                                                                                  | ☐   |
| DB-DD-007 | P2  | 1. Mở rồi resize.                                                  | Menu đóng sạch.                                                                                                                                             | ☐   |
| DB-DD-008 | P1  | 1. Tab tới trigger. 2. Space/Enter mở. 3. Tab tới option và Enter. | Thao tác keyboard khả dụng, focus visible. Nếu option không quản lý focus/listbox đúng, ghi accessibility defect.                                           | ☐   |
| DB-DD-009 | P1  | 1. Dùng screen reader/Accessibility tree.                          | Trigger có `aria-expanded`, `aria-haspopup`; popup/option có semantic phù hợp. Ghi lỗi nếu khai báo listbox nhưng container/option không có role tương ứng. | ☐   |

## 15. Responsive, hiển thị và accessibility

Chạy tối thiểu tại `1440×900`, `1280×720`, `1024×768`, `768×1024`, `390×844`, `360×800`.

| ID        | P   | Các bước thao tác/nút bấm                                      | Kết quả mong đợi                                                                                                  | KQ  |
| --------- | --- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --- |
| DB-UI-001 | P1  | 1. Mở từng viewport chuẩn. 2. Cuộn từ đầu tới cuối.            | Không horizontal overflow body, card không chồng, mọi control tiếp cận được.                                      | ☐   |
| DB-UI-002 | P1  | 1. Ở mobile mở store filter và mọi dropdown.                   | Popup nằm trong viewport, không bị sidebar/card overflow cắt; touch target đủ lớn.                                | ☐   |
| DB-UI-003 | P1  | 1. Ở mobile dùng date picker, đổi chart, mở modal, cuộn table. | Date/control wrap đẹp; chart đọc được; modal/table không vượt màn hình.                                           | ☐   |
| DB-UI-004 | P2  | 1. Zoom browser 80%, 125%, 200%.                               | Nội dung reflow, không mất nút/text; ở 200% dùng được theo WCAG reflow hợp lý.                                    | ☐   |
| DB-UI-005 | P2  | 1. Test tên user/store/product dài.                            | Ellipsis/wrap có chủ đích, không đè icon/số; nội dung quan trọng vẫn xem được.                                    | ☐   |
| DB-UI-006 | P1  | 1. Dùng Tab từ header qua toàn trang.                          | Thứ tự focus logic, focus ring rõ; không mắc kẹt ngoài modal; link/button semantic đúng.                          | ☐   |
| DB-UI-007 | P1  | 1. Hover/focus/active từng button, link, KPI link, dropdown.   | Có phản hồi nhất quán, không đổi kích thước làm layout nhảy; active không chỉ dựa màu nếu cần.                    | ☐   |
| DB-UI-008 | P2  | 1. Bật `prefers-reduced-motion`. 2. Mở popup/loading/modal.    | Animation bị giảm/tắt; chức năng không đổi.                                                                       | ☐   |
| DB-UI-009 | P2  | 1. Dùng screen reader kiểm tra heading/region/table.           | Một H1 hợp lý; H2 theo card; table có header/scope, region Top có accessible name; icon trang trí không đọc thừa. | ☐   |
| DB-UI-010 | P1  | 1. Kiểm tra contrast bằng DevTools.                            | Text, focus, error, disabled và chart legend đạt contrast phù hợp; không truyền tải lỗi chỉ bằng màu viền.        | ☐   |
| DB-UI-011 | P1  | 1. Mở dropdown/modal/sidebar. 2. Thử scroll body và click nền. | Layer/z-index đúng: popup trên card, modal trên tất cả, không click xuyên; sidebar không che modal sai.           | ☐   |
| DB-UI-012 | P2  | 1. In trang hoặc Print Preview nếu nghiệp vụ cần.              | Không crash; nếu không hỗ trợ phải không ảnh hưởng UI thường.                                                     | ☐   |

## 16. Tương thích trình duyệt và môi trường

| ID        | P   | Các bước                                                          | Kết quả mong đợi                                                                              | KQ  |
| --------- | --- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --- |
| DB-CB-001 | P1  | Chạy Smoke trên Chrome stable.                                    | PASS toàn bộ Smoke.                                                                           | ☐   |
| DB-CB-002 | P1  | Chạy Smoke + date/dropdown/chart trên Edge stable.                | Hành vi tương đương Chrome.                                                                   | ☐   |
| DB-CB-003 | P2  | Chạy Smoke + date/chart trên Firefox stable nếu hỗ trợ.           | Date input và SVG không vỡ; chức năng tương đương.                                            | ☐   |
| DB-CB-004 | P2  | Mở từ máy LAN bằng `http://<IP-PC>:5173/`.                        | API đi qua `/api` proxy đúng; không cố gọi localhost của thiết bị; dashboard tải được.        | ☐   |
| DB-CB-005 | P1  | Đổi timezone browser/máy sang UTC rồi UTC+7 trên môi trường test. | Xác định rõ timezone nghiệp vụ; ngày chart/recent/modal không lệch 1 ngày ngoài quy tắc.      | ☐   |
| DB-CB-006 | P2  | Đổi locale browser khác vi-VN.                                    | UI vẫn format ngày/số theo vi-VN như thiết kế, không phụ thuộc locale browser ngoài timezone. | ☐   |

## 17. Đối soát API, bảo mật và độ bền dữ liệu

| ID        | P   | Các bước                                                                    | Kết quả mong đợi                                                                                           | KQ  |
| --------- | --- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --- |
| DB-AP-001 | P0  | 1. Mở Network. 2. Tải/đổi từng filter.                                      | Chỉ GET read-only; không POST/PATCH/DELETE; query đúng và URL-encoded.                                     | ☐   |
| DB-AP-002 | P0  | 1. Kiểm tra request headers.                                                | Token gửi qua Authorization khi có; UI/log không in token/secret.                                          | ☐   |
| DB-AP-003 | P1  | 1. Chọn store có ký tự đặc biệt. 2. Xem URL và response.                    | Không injection, không request hỏng; UI escape tên/code, không thực thi HTML/script.                       | ☐   |
| DB-AP-004 | P1  | 1. Mock response có chuỗi `<script>` trong tên user/store/product/customer. | Chuỗi hiển thị như text, không chạy script.                                                                | ☐   |
| DB-AP-005 | P1  | 1. So `periodRevenue`/chart/day/modal bằng cùng fixture.                    | Không trộn `created_at` với `business_date`; quy tắc ngày nhất quán hoặc khác biệt được mô tả rõ.          | ☐   |
| DB-AP-006 | P0  | 1. So tổng chart kỳ này với tổng từng ngày từ nguồn.                        | Mỗi ngày chỉ cộng completed, đúng store, không double-count sale/payment.                                  | ☐   |
| DB-AP-007 | P0  | 1. So Top và modal cho cùng ngày/range.                                     | Product ID local/mongo đều resolve đúng; thiếu ID bị bỏ theo quy tắc và không tạo tổng sai im lặng.        | ☐   |
| DB-AP-008 | P1  | 1. Mock API trả 401 trong lần auto-refresh.                                 | Ứng dụng xử lý phiên an toàn/nhất quán; không tiếp tục hiển thị dữ liệu nhạy cảm vô hạn mà không cảnh báo. | ☐   |
| DB-AP-009 | P1  | 1. Mock response chậm hơn chu kỳ 15s.                                       | Không tạo hàng loạt request song song; request cũ được abort/ignore; cuối cùng loading đúng.               | ☐   |
| DB-AP-010 | P1  | 1. Theo dõi 2 phút không thao tác.                                          | Không tăng listener/timer/request theo cấp số; memory/CPU ổn định.                                         | ☐   |

## 18. Ma trận tổ hợp chống bỏ sót

Không cần lặp mọi test UI cho mọi tổ hợp; nhưng các cell dưới đây phải chạy ít nhất một phép đối soát **chart + Top + tồn kho + recent + modal**.

### 18.1 Store × dữ liệu

| Store scope            | Có dữ liệu | Không dữ liệu | Có pending/cancelled | Có refund | KQ  |
| ---------------------- | ---------: | ------------: | -------------------: | --------: | --- |
| Tất cả                 |          ☐ |             ☐ |                    ☐ |         ☐ |     |
| Chỉ A                  |          ☐ |             ☐ |                    ☐ |         ☐ |     |
| Chỉ B                  |          ☐ |             ☐ |                    ☐ |         ☐ |     |
| A+B                    |          ☐ |             ☐ |                    ☐ |         ☐ |     |
| Store không stock/sale |          ☐ |             ☐ |                  N/A |       N/A |     |

### 18.2 Range × chart type

| Range           | Cột so sánh | Cột doanh thu | Đường | Miền |
| --------------- | ----------: | ------------: | ----: | ---: |
| Tuần này        |           ☐ |             ☐ |     ☐ |    ☐ |
| Tuần trước      |           ☐ |             ☐ |     ☐ |    ☐ |
| 7 ngày          |           ☐ |             ☐ |     ☐ |    ☐ |
| 14 ngày         |           ☐ |             ☐ |     ☐ |    ☐ |
| 30 ngày         |           ☐ |             ☐ |     ☐ |    ☐ |
| Tháng này       |           ☐ |             ☐ |     ☐ |    ☐ |
| Tháng trước     |           ☐ |             ☐ |     ☐ |    ☐ |
| Chỉ TỪ          |           ☐ |             ☐ |     ☐ |    ☐ |
| Chỉ ĐẾN         |           ☐ |             ☐ |     ☐ |    ☐ |
| Hai ngày hợp lệ |           ☐ |             ☐ |     ☐ |    ☐ |
| Cùng một ngày   |           ☐ |             ☐ |     ☐ |    ☐ |
| Khoảng ngược    |           ☐ |             ☐ |     ☐ |    ☐ |

### 18.3 Trạng thái API

| API                          | Loading chậm | 200 có data | 200 empty | 401/403 | 422 | 500 | Offline | Phục hồi |
| ---------------------------- | -----------: | ----------: | --------: | ------: | --: | --: | ------: | -------: |
| `/dashboard`                 |            ☐ |           ☐ |         ☐ |       ☐ |   ☐ |   ☐ |       ☐ |        ☐ |
| `/dashboard/daily-products`  |            ☐ |           ☐ |         ☐ |       ☐ |   ☐ |   ☐ |       ☐ |        ☐ |
| `/products/storage-duration` |            ☐ |           ☐ |         ☐ |       ☐ |   ☐ |   ☐ |       ☐ |        ☐ |
| `/auth/me`                   |            ☐ |           ☐ |       N/A |       ☐ | N/A |   ☐ |       ☐ |        ☐ |

## 19. Regression probes có nguy cơ cao từ source hiện tại

Các case này không khẳng định sẵn là lỗi; chúng bắt buộc được chạy vì source/UI có khả năng không đồng nhất:

1. **DB-ST-018:** UI nói Tồn kho thay đổi theo cửa hàng, cần chứng minh API thực sự scope cả 3 KPI.
2. **DB-ST-019:** refund trong Top sản phẩm phải dùng cùng store filter với sales.
3. **DB-MD-008:** daily-products lỗi mạng phải kết thúc loading và hiển thị lỗi, không unhandled promise.
4. **DB-MD-002:** click series `Kỳ trước` phải làm rõ ngày nào được mở; không được gắn sai kỳ.
5. **DB-MD-010/011/013:** modal cần Escape, click nền/focus trap và accessible label theo chuẩn.
6. **DB-RS-005:** API recent lấy mọi status trong khi empty text nói “giao dịch hoàn tất”.
7. **DB-RS-008:** server chỉ trả 20 giao dịch rồi frontend mới lọc 3/7 ngày; có thể thiếu dữ liệu kỳ vọng.
8. **DB-TP-014:** mô tả “khoảng đang xem” nhưng Top có range riêng, không theo custom chart date.
9. **DB-ST-017:** selected store không được tự loại khi danh sách available store thay đổi.
10. **DB-DT-005:** khoảng ngày ngược hiện fallback preset ở request nhưng UI vẫn giữ ngày invalid; cần xác nhận UX mong muốn.
11. **DB-ST-011:** backend truyền stores dạng CSV; tên cửa hàng chứa dấu phẩy có nguy cơ bị tách sai.
12. **DB-SD-006:** top cảnh báo đang nối 2 list rồi cắt 5, có thể ưu tiên toàn bộ “chưa bán” trước “bán chậm” thay vì top chung.

## 20. Traceability — control/state/API → test case

| Thành phần/nhánh source                                     | Test case bao phủ                |
| ----------------------------------------------------------- | -------------------------------- |
| Route `/`, auth, role, title, sidebar/user menu             | DB-AU-001…012, DB-SM-001…002     |
| Initial loading/progress/skeleton/error/retry               | DB-LD-001…010                    |
| `selectedStores`, store popup, portal, scroll/resize/Escape | DB-ST-001…021                    |
| `chartRange` 7 options, week conversion                     | DB-RG-001…007                    |
| start/end date: none/start/end/both/equal/reverse           | DB-DT-001…019                    |
| 4 chart types, totals, peak, empty, tooltip                 | DB-CH-001…012                    |
| chart click + daily-products modal                          | DB-MD-001…015                    |
| `topRange` 3 × `topLimit` 3, empty/loading                  | DB-TP-001…014 + ma trận 9 tổ hợp |
| inventory 3 metrics/store scope                             | DB-IV-001…008, DB-ST-018         |
| storage loading/error/empty/data + 5 loại link              | DB-SD-001…015                    |
| recent range 3 options, boundary/empty/missing data         | DB-RS-001…012                    |
| manual refresh, 15s refresh, abort/debounce                 | DB-RF-001…006, DB-AP-009…010     |
| localStorage valid/invalid/multi-tab                        | DB-RF-007…010                    |
| dropdown open/active/outside/Escape/position/keyboard       | DB-DD-001…009                    |
| responsive/hover/focus/a11y/reduced motion                  | DB-UI-001…012                    |
| API/security/data integrity                                 | DB-AP-001…010                    |

## 21. Điều kiện kết thúc đợt test

Chỉ kết luận Dashboard đạt khi:

- 100% P0 PASS; không có lỗi mất dữ liệu, sai cửa hàng, sai doanh thu/tồn kho hoặc lộ quyền.
- P1 không còn lỗi chức năng mở; P2 đã được ghi nhận/ưu tiên rõ.
- Hoàn tất ma trận Store × Data, Range × Chart type, Top 9 tổ hợp và trạng thái API.
- Không có lỗi Console chưa giải thích, request 4xx/5xx ngoài case mô phỏng, loading treo hoặc request loop.
- Đã đối soát ít nhất một fixture từ UI → request → response → số nguồn cho từng card.
- Đã chạy desktop, tablet, mobile; keyboard; Chrome và Edge.
- Mỗi FAIL có bằng chứng và bước tái hiện độc lập.
