# Kịch bản Xây dựng Giao diện Đa năng (Frontend Creation Skill)

Mô tả: File này là "Bộ quy trình chuẩn" (SOP) để hướng dẫn cho AI Agent cách thực hiện xây dựng một trang giao diện (Frontend) mới hoặc sửa đổi giao diện hiện có một cách toàn diện từ phân tích thiết kế, kết nối dữ liệu đến kiểm thử tự động.

### 1. Phân tích Yêu cầu (Requirements Analysis)
1. **Đọc kỹ file HTML/Template (Nếu có):** Phân tích chi tiết cấu trúc file người dùng gửi. Ghi chú (note) lại toàn bộ các chức năng, các nút bấm, ô nhập liệu, dropdown, hay tab con xuất hiện trên đó. Danh sách này đặc biệt quan trọng để làm cơ sở cho bước viết kịch bản test.
2. **Phân tích Hình ảnh thiết kế:** Quan sát kỹ hình ảnh thiết kế người dùng cung cấp để lên bố cục. Đảm bảo giao diện mới được xây dựng sẽ bám sát hình ảnh: từ vị trí bố trí các khối, các bảng, đến các nút chức năng.
3. **Lập danh sách Component:** Liệt kê các thành phần cần tạo. Tận dụng tối đa các Component dùng chung (nếu có) trong dự án.

### 2. Xây dựng Giao diện (UI Implementation)
1. Cấu trúc lại giao diện sang định dạng của dự án (ví dụ: React TSX).
2. Code giao diện bám sát nhất có thể với hình ảnh mẫu.
3. Chèn đầy đủ các thẻ, class, id phù hợp để dễ dàng cho việc viết Automation Test ở bước sau.

### 3. Kết nối Dữ liệu Logic (Database & API Integration)
1. Xác định luồng dữ liệu (Data Flow): Phân tích các thông tin trên UI cần lấy từ phần nào trong Database.
2. Logic kết nối: 
   - Có thể sử dụng các file export/import dữ liệu mẫu từ người dùng.
   - Tự suy luận từ kiến trúc Database hoặc API hiện có của dự án để gọi đúng endpoint và ánh xạ (map) dữ liệu chính xác lên UI.
3. Xử lý trạng thái đầy đủ: Đảm bảo giao diện xử lý tốt các trạng thái Loading (đang tải), Empty (chưa có dữ liệu) hoặc Error.

### 4. Kiểm thử Tự động (Testing Workflow - Tham chiếu skillTESTCASE.md)
Từ bước này, Agent **BẮT BUỘC** áp dụng quy trình kiểm thử từ file `skillTESTCASE.md`.
1. **Tuyệt đối không dùng Browser Subagent.**
2. **Viết Playwright Test:** Tạo một file script kiểm thử Playwright E2E nằm trong thư mục `e2e/tests/` (Ví dụ: `e2e/tests/new-feature.spec.ts`).
3. **Phủ kín kịch bản test:** 
   - Dựa vào danh sách các nút chức năng đã note lại ở Bước 1.
   - Viết lệnh để Playwright click thử **toàn bộ** các nút, từng tab con, nhập thử dữ liệu vào từng form. 
   - Kiểm tra kỹ các luồng logic (như tính toán tổng tiền, hiển thị bộ lọc). Không được bỏ qua bất kỳ thao tác nào.
4. **Tự động chạy và sửa lỗi:** 
   - Chạy lệnh `npx playwright test` thông qua Terminal.
   - Nếu test báo đỏ (Failed) ở nút nào, phải tự đọc log lỗi, mở lại file code giao diện hoặc code logic để fix, sau đó tiếp tục chạy lại. 
   - Lặp lại quy trình này cho đến khi toàn bộ kịch bản XANH (Passed 100%).

### 5. Đánh giá và Gửi Báo Cáo (Verification & Reporting)
1. Xác nhận giao diện đã hoàn thiện và đáp ứng đúng logic.
2. Gửi báo cáo lại cho người dùng, trong đó nêu rõ:
   - Những chức năng / giao diện đã tạo.
   - Kết quả chạy Test Automation (PASSED).
   - Tóm tắt những lỗi đã tự động fix (nếu có) trong quá trình test.
