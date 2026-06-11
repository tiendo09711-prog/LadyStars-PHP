# Kịch bản kiểm thử Đa năng (Generic UI Test Skill)

Mô tả: File này là "Bộ quy trình chuẩn" (SOP) để hướng dẫn cho Browser Subagent hoặc AI Agent cách thực hiện kiểm thử giao diện tự động một cách linh hoạt nhất. Bất kể trang web là gì hay chức năng cần test ra sao, Agent sẽ luôn đọc file này để biết cách đăng nhập, đọc hiểu yêu cầu và trả về kết quả chuẩn xác.

### 1. Chuẩn bị (Pre-conditions)
- Đảm bảo ứng dụng đang được chạy ở môi trường nội bộ (VD: `http://localhost:5173`).
- Sử dụng tài khoản đăng nhập mặc định: `admin@gmail.com` | `123456` (trừ khi người dùng cung cấp tài khoản khác).
- Agent cần thu thập đủ 2 thông tin từ người dùng:
  1. **Target URL:** Link của trang web cần test (VD: `/reports/...`, `/orders/...`).
  2. **Test Cases:** Danh sách các tính năng/bộ lọc/chức năng mà người dùng muốn xác minh.

### 2. Trình tự thực thi (Execution Steps)

#### Bước 1: Đăng nhập (Authentication)
1. Điều hướng trình duyệt tới trang đăng nhập (thường là `http://localhost:5173/login`).
2. Điền thông tin `Email` và `Password` vào form.
3. Click nút `Đăng nhập` (Submit) và chờ hệ thống chuyển hướng (redirect) vào trong hệ thống.

#### Bước 2: Truy cập trang mục tiêu (Navigation)
1. Dựa trên yêu cầu của người dùng, lấy `Target URL`.
2. Điều hướng thẳng tới `Target URL` đó.
3. Luôn chờ trang tải hoàn tất (khoảng 2-3 giây) để các API ngầm (như danh sách tùy chọn, biểu đồ, bảng) lấy xong dữ liệu thật.

#### Bước 3: Đọc và Thực thi Test Case động (Dynamic Interaction)
1. Phân tích `Test Cases` người dùng cung cấp.
2. Tìm kiếm chính xác các phần tử UI trên màn hình thông qua Label, Text, hoặc Placeholder (Dropdown, Nút bấm, Ô nhập ngày tháng...).
3. Thực hiện thao tác tương tác (Click, Chọn, Nhập liệu) theo đúng mô tả.
4. Mỗi khi tương tác, phải chụp ảnh màn hình hoặc đọc lại DOM để xem dữ liệu có thực sự thay đổi hay không (nhằm loại bỏ trường hợp dữ liệu bị code cứng).

#### Bước 4: Đánh giá và Gửi Báo Cáo (Verification & Reporting)
1. Đọc kết quả hiển thị trên UI (Ví dụ: dữ liệu hiển thị ở Bảng, Biểu đồ, Form nhập, hay thông báo lỗi).
2. Đối chiếu với yêu cầu của người dùng xem nó có đang hiển thị chuẩn xác và linh hoạt chưa.
3. Gửi báo cáo chi tiết về cho người dùng với định dạng:
   - **[PASSED] / [FAILED]:** Kèm theo tên Test Case.
   - **Lý do (Nếu Failed):** Do lỗi màn hình trắng, dữ liệu trống, hay nút bấm không tương tác được.
   - **Bằng chứng:** Đính kèm video/hình ảnh hoặc mô tả lại chính xác những giá trị số/chữ mà AI đã đọc được.

#### Bước 5: Phòng ngừa Lặp Vô Hạn (Infinite Loop Prevention)
1. Trong quá trình thực hiện một bước nhỏ (ví dụ: gõ tìm kiếm, click chọn dropdown), nếu AI thao tác thất bại và phải lặp lại hành động đó từ 3 lần trở lên mà vẫn không thành công.
2. BẮT BUỘC DỪNG NGAY quá trình kiểm thử của Subagent đó.
3. Trả về kết quả báo cáo thất bại và chỉ rõ "Lỗi bị kẹt/lặp vô hạn ở bước [Tên bước]". Nêu rõ nguyên nhân để lập trình viên có thể sửa đổi logic ở bước đó thay vì để AI tiếp tục lặp mù quáng.

---
**💡 Dành cho AI Agent (TỪ CHỐI SỬ DỤNG BROWSER SUBAGENT):** 
1. **QUY TẮC TỐI THƯỢNG:** Kể từ bây giờ, khi người dùng yêu cầu "Test tính năng X", "Dùng skill để test", hoặc "Viết chức năng rồi kiểm tra lại", bạn **TUYỆT ĐỐI KHÔNG ĐƯỢC PHÉP dùng công cụ `browser_subagent`**. Subagent là một công cụ dễ bị ảo giác, chậm chạp và thường xuyên lặp vô hạn.
2. **BẮT BUỘC KHẢO SÁT TOÀN BỘ TRANG TRƯỚC KHI TEST:** 
   - Trước khi viết kịch bản test cho một trang, bạn **PHẢI** đọc toàn bộ source code của trang đó (hoặc DOM) để liệt kê ra **tất cả** các nút bấm, ô nhập liệu, dropdown (bao gồm cả các nút nhỏ như "Xuất dữ liệu", "In báo cáo", v.v.).
   - Phải test **từng cái một**, không được bỏ sót bất kỳ nút nào. Tránh tình trạng test qua loa phần chính mà bỏ quên các nút phụ khiến chúng bị "cứng đờ".
3. **BẮT BUỘC DÙNG PLAYWRIGHT E2E:** 
   - Thay vì dùng Subagent, bạn **BẮT BUỘC** phải tạo một file test Code Automation (Playwright) nằm trong thư mục `e2e/tests/` (Ví dụ: `e2e/tests/feature-x.spec.ts`).
   - Sử dụng thư viện hàm trong `e2e/utils/db.ts` để tự động bơm (seed) dữ liệu test trước khi chạy và xóa sạch sau khi chạy. Không bao giờ hardcode dữ liệu làm rác Database.
4. **TỰ ĐỘNG CHẠY VÀ TỰ ĐỘNG SỬA:**
   - Khi viết xong file test, bạn phải tự mở Terminal và gọi lệnh `cd e2e && npx playwright test`.
   - Nếu test báo đỏ (Failed) hoặc thiếu tính năng, bạn phải đọc mã lỗi, tự quay lại sửa Code Source của Frontend hoặc Backend, rồi chạy lại lệnh test cho đến khi nào xanh (Passed) và phủ kín toàn bộ nút bấm thì mới báo cáo lại cho người dùng.
