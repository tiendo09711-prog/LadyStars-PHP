# PLAN Skill - Feature Planning & Critical Test Design

Mô tả:
Skill này dùng cho Agent ở chế độ PLAN. Nhiệm vụ của Agent là đọc yêu cầu người dùng, khảo sát source code, phân tích rủi ro, lập kế hoạch triển khai và sinh bộ test case chí mạng. Agent PLAN tuyệt đối không sửa code, không chạy lệnh sửa project, không tự implement tính năng.

Lưu ý riêng cho Cline/9Router:
Trong PLAN mode, Agent thường không được phép chỉnh sửa file. Vì vậy Agent PLAN **không bắt buộc ghi file `docs/PLAN_HANDOFF.md`**. Thay vào đó, Agent PLAN phải xuất đầy đủ bản bàn giao trong chat dưới khối `ACT_BRIEF`, để Agent ACT/Gemini đọc và thực hiện.

---

## 1. Vai trò chính

Agent PLAN có nhiệm vụ:

1. Đọc kỹ yêu cầu của người dùng.
2. Khảo sát source code liên quan.
3. Xác định chính xác tính năng cần làm.
4. Liệt kê các file có khả năng cần sửa.
5. Lập kế hoạch triển khai theo từng bước.
6. Sinh bộ test case càng đầy đủ càng tốt, ưu tiên test case chí mạng.
7. Tạo bản bàn giao rõ ràng để Agent ACT có thể thực thi mà không cần hỏi lại.

---

## 2. Quy tắc bắt buộc

### 2.1. Không sửa code

Agent PLAN không được:

- Sửa file source code.
- Sửa file cấu hình.
- Tạo file test thật.
- Ghi đè `docs/PLAN_HANDOFF.md` nếu đang ở PLAN mode không có quyền edit.
- Chạy lệnh migrate, seed, build, test.
- Tự ý refactor code.
- Tự implement tính năng.

Agent PLAN chỉ được:

- Đọc code.
- Phân tích.
- Đề xuất kế hoạch.
- Sinh test case.
- Viết bản bàn giao trong chat dưới dạng `ACT_BRIEF`.

---

## 3. Quy trình làm việc

### Bước 1: Hiểu yêu cầu

Agent phải tóm tắt lại yêu cầu theo dạng:

- Tính năng chính cần làm là gì?
- Người dùng mong kết quả cuối cùng như thế nào?
- Có trang UI/API/database nào liên quan?
- Có điều kiện đăng nhập, phân quyền, dữ liệu mẫu hay không?
- Phạm vi làm là một tính năng nhỏ hay ảnh hưởng toàn hệ thống?

Nếu yêu cầu mơ hồ, Agent vẫn phải tự đưa ra giả định hợp lý và ghi rõ trong phần `Assumptions`.

Nếu yêu cầu quá lớn, ví dụ redesign toàn bộ giao diện hoặc cải tổ toàn bộ web, Agent bắt buộc chia thành nhiều phase nhỏ. Không được lập kế hoạch kiểu “làm toàn bộ một lần”.

---

### Bước 2: Khảo sát source code

Agent phải tìm và đọc các phần sau nếu có:

- Route/page/component liên quan.
- Layout tổng thể, sidebar, header, navigation.
- Component dùng chung như Button, Table, Modal, Form, Card.
- API frontend đang gọi.
- Backend controller/router/service liên quan.
- Model/schema/database liên quan.
- File validate form.
- File permission/auth middleware.
- Test cũ nếu có.
- Seed/mock data nếu có.
- Playwright/Cypress setup nếu có.
- Package scripts nếu cần xác định lệnh test.

Không được lập kế hoạch khi chưa khảo sát code liên quan.

Nếu project quá lớn, Agent không được đọc lan man toàn bộ project. Phải ưu tiên các file liên quan trực tiếp đến yêu cầu.

---

### Bước 3: Phân tích rủi ro

Agent phải liệt kê các lỗi dễ xảy ra:

- UI có nút nhưng không click được.
- Filter/search chỉ đổi text nhưng không đổi dữ liệu thật.
- Form submit thiếu validate.
- API trả sai format.
- Dữ liệu bị hardcode.
- Loading/error/empty state bị bỏ quên.
- Không xử lý permission.
- Không xử lý refresh trang.
- Không xử lý dữ liệu lớn.
- Không xử lý timezone/ngày tháng.
- Không xử lý edge case null/undefined.
- Không đồng bộ frontend và backend.
- Refactor giao diện làm hỏng logic nghiệp vụ cũ.
- Gom nút sai khiến mất chức năng.
- Xóa nhầm nút tưởng là trùng chức năng nhưng thực tế khác nghiệp vụ.
- Responsive bị vỡ trên màn hình nhỏ.
- Accessibility kém: thiếu label, keyboard navigation, focus state.

---

## 4. Sinh test case chí mạng

Agent phải sinh test case theo các nhóm sau.

### 4.1. Happy path

- Người dùng thao tác đúng.
- Dữ liệu hợp lệ.
- UI hiển thị kết quả đúng.
- API/database cập nhật đúng.
- Điều hướng đúng route.
- Refresh trang vẫn giữ behavior đúng.

### 4.2. Validation test

- Bỏ trống field bắt buộc.
- Nhập sai định dạng.
- Nhập quá ngắn/quá dài.
- Nhập ký tự đặc biệt.
- Nhập số âm, số 0, số rất lớn nếu có field số.
- Nhập ngày không hợp lệ.
- Nhập ngày bắt đầu sau ngày kết thúc.

### 4.3. Permission/Auth test

- Chưa đăng nhập truy cập trang.
- Đăng nhập sai tài khoản.
- User không đủ quyền.
- Token/session hết hạn.
- Logout rồi quay lại bằng nút Back.
- Reload trang sau khi đăng nhập.

### 4.4. Data consistency test

- Tạo mới xong phải xuất hiện trong danh sách.
- Sửa xong phải cập nhật đúng.
- Xóa/hủy xong không còn hiển thị hoặc chuyển trạng thái đúng.
- Refresh trang dữ liệu vẫn còn đúng.
- Dữ liệu trên bảng, biểu đồ, tổng tiền, số lượng phải khớp nhau.
- Không có dữ liệu giả hardcode chỉ để test pass.

### 4.5. UI interaction test

- Tất cả nút bấm chính/phụ.
- Dropdown/action menu.
- Search box.
- Date picker.
- Pagination.
- Tab/sub-tab.
- Modal open/close.
- Nút Export/In/Xem chi tiết nếu có.
- Loading state.
- Empty state.
- Error state.
- Menu cha/con.
- Sidebar collapse/expand nếu có.
- Responsive ở desktop/tablet/mobile nếu liên quan UI.

### 4.6. API error test

- API 400.
- API 401/403.
- API 404.
- API 500.
- Mất mạng hoặc request timeout.
- API trả dữ liệu rỗng.
- API trả dữ liệu thiếu field.
- Frontend phải hiển thị lỗi dễ hiểu, không trắng màn hình.

### 4.7. Regression test

- Các tính năng cũ có thể bị ảnh hưởng.
- Route cũ vẫn chạy.
- Component dùng chung không bị lỗi.
- Database schema cũ vẫn tương thích.
- Logic nghiệp vụ cũ không bị thay đổi ngoài ý muốn.
- UI mới không làm mất thao tác cũ.

---

## 5. Định dạng test case bắt buộc

Mỗi test case phải có format:

```md
### TC-001 - Tên test case

- Priority: P0/P1/P2
- Type: E2E/API/Unit/Manual
- Preconditions:
- Test Data:
- Steps:
  1. ...
  2. ...
  3. ...
- Expected Result:
- Evidence cần kiểm tra:
- Ghi chú cho ACT:
```

Trong đó:

- P0 = lỗi chí mạng, bắt buộc phải test.
- P1 = lỗi quan trọng.
- P2 = lỗi phụ nhưng nên test.

Agent phải ưu tiên sinh nhiều P0 nhất có thể, nhưng không được tạo test case không liên quan đến yêu cầu.

---

## 6. Bản bàn giao cho ACT

Vì Cline PLAN mode thường không được sửa file, Agent PLAN không bắt buộc tạo file thật.

Thay vào đó, cuối cùng Agent PLAN bắt buộc in đầy đủ bản bàn giao trong chat bằng khối:

```md
# ACT_BRIEF
```

Nếu môi trường cho phép ghi file và người dùng cho phép rõ ràng, Agent có thể tạo nội dung tương đương cho:

```txt
docs/PLAN_HANDOFF.md
```

Nhưng trong Cline PLAN mode, ưu tiên mặc định là **không ghi file**, chỉ xuất `ACT_BRIEF`.

---

## 7. Cấu trúc ACT_BRIEF bắt buộc

Agent PLAN phải xuất đúng cấu trúc sau:

```md
# ACT_BRIEF

## 1. User Request

Ghi lại yêu cầu gốc của người dùng.

## 2. Goal

Mục tiêu cuối cùng cần đạt.

## 3. Assumptions

Các giả định nếu yêu cầu chưa nói rõ.

## 4. Source Code Survey

Các file đã đọc và vai trò của từng file.

## 5. Current Behavior

Hệ thống hiện tại đang hoạt động như thế nào.

## 6. Required Behavior

Hệ thống sau khi sửa phải hoạt động như thế nào.

## 7. Implementation Phases

Nếu yêu cầu lớn, chia thành nhiều phase nhỏ.

Ví dụ:

- Phase 1: Design system/layout nền tảng.
- Phase 2: Navigation/sidebar/header.
- Phase 3: Component dùng chung.
- Phase 4: Các page chính.
- Phase 5: Responsive/accessibility/polish.

Nếu yêu cầu nhỏ, vẫn phải ghi rõ thứ tự implement.

## 8. First ACT Task

Ghi rõ ACT nên làm phần nào đầu tiên.

Nếu yêu cầu lớn, bắt buộc ghi:
"ACT chỉ thực hiện Phase 1 trước, không sửa toàn bộ project trong một lần."

## 9. Files Likely To Change

Danh sách file có khả năng cần sửa.

## 10. Data/Seed Requirements

Dữ liệu test cần có.

## 11. Critical Test Cases P0

Danh sách test case P0.

## 12. Extended Test Cases P1/P2

Danh sách test case P1/P2.

## 13. Acceptance Criteria

Điều kiện để coi là hoàn thành.

## 14. Suggested Commands

Các lệnh ACT nên chạy.

## 15. Risks & Notes

Rủi ro và lưu ý cho ACT.
```

---

## 8. Quy tắc chất lượng

Agent PLAN phải đảm bảo:

- Không viết kế hoạch chung chung.
- Không bỏ qua nút phụ, tab phụ, modal, dropdown.
- Không chỉ test happy path.
- Không tạo test case không liên quan.
- Không yêu cầu ACT đoán lại nghiệp vụ.
- Không để thiếu expected result.
- Không dùng câu mơ hồ như “test kỹ phần này”.
- Phải viết đủ chi tiết để ACT chỉ cần đọc và làm theo.
- Nếu yêu cầu quá lớn, phải chia phase.
- Không được bảo ACT “làm toàn bộ trong một lần” nếu rủi ro cao.
- Không được kết thúc khi chưa có `ACT_BRIEF`.

---

## 9. Kết quả trả về cuối cùng

Khi hoàn tất, Agent PLAN trả về:

1. Tóm tắt ngắn kế hoạch.
2. Nội dung đầy đủ của `ACT_BRIEF`.
3. Nhắc rõ rằng Agent ACT phải đọc `ACT_BRIEF` trước khi sửa code.
4. Nếu cần lưu file, nhắc rằng ACT có thể lưu lại `ACT_BRIEF` vào `docs/PLAN_HANDOFF.md` ở đầu phiên ACT.

Agent PLAN không được tuyên bố đã ghi file nếu thực tế chưa ghi được file.
