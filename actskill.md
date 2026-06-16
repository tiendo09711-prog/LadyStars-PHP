# ACT Skill - Execute Plan, Implement Code, Run E2E Tests

Mô tả:
Skill này dùng cho Agent ở chế độ ACT. Nhiệm vụ của Agent là đọc bản kế hoạch từ PLAN, thực thi đúng kế hoạch, viết hoặc sửa code, viết Playwright E2E test, chạy test, đọc lỗi và sửa đến khi pass. Agent ACT không được bỏ qua test case chí mạng.

Lưu ý riêng cho Cline/9Router:
Trong workflow PLAN/Codex → ACT/Gemini, bản kế hoạch có thể nằm trong chat dưới dạng `ACT_BRIEF`, không nhất thiết nằm trong file `docs/PLAN_HANDOFF.md`. Agent ACT phải ưu tiên đọc `ACT_BRIEF` nếu có.

---

## 1. Quy tắc tối thượng

Khi người dùng yêu cầu implement/test một tính năng, Agent ACT bắt buộc:

1. Đọc `ACT_BRIEF` trong chat nếu PLAN/Codex vừa tạo.
2. Đọc file `docs/PLAN_HANDOFF.md` nếu tồn tại và có nội dung.
3. Đọc file skill hiện tại trước khi làm.
4. Nếu người dùng dán trực tiếp nội dung kế hoạch trong chat, phải dùng nội dung đó làm nguồn chính.
5. Không tự làm lệch khỏi kế hoạch nếu không có lý do kỹ thuật rõ ràng.
6. Nếu kế hoạch thiếu chi tiết, tự khảo sát source code để bổ sung, nhưng phải ghi lại giả định.
7. Không dùng `browser_subagent`.
8. Bắt buộc dùng Playwright E2E nếu project có hoặc có thể cài được Playwright.
9. Bắt buộc chạy test sau khi viết/sửa code.
10. Nếu test failed, phải đọc lỗi, sửa code/test hợp lý, rồi chạy lại.
11. Không báo hoàn thành khi chưa có bằng chứng test pass hoặc chưa giải thích rõ vì sao không chạy được.

---

## 2. Nguồn kế hoạch

Agent ACT phải lấy kế hoạch theo thứ tự ưu tiên:

1. `ACT_BRIEF` trong cuộc trò chuyện hiện tại.
2. `docs/PLAN_HANDOFF.md` nếu file tồn tại và có nội dung.
3. Nội dung kế hoạch người dùng dán trực tiếp trong prompt ACT.
4. Nếu không có bất kỳ kế hoạch nào, Agent ACT phải tự khảo sát source code và lập kế hoạch ngắn trước khi sửa.

Không được dừng chỉ vì `docs/PLAN_HANDOFF.md` không tồn tại hoặc đang trống.

Nếu có `ACT_BRIEF`, Agent ACT có thể tạo hoặc cập nhật file:

```txt
docs/PLAN_HANDOFF.md
```

để lưu lại kế hoạch trước khi implement, nhưng không được làm việc này nếu người dùng yêu cầu không ghi file kế hoạch.

---

## 3. Thứ tự thực hiện bắt buộc

### Bước 1: Đọc kế hoạch

Agent phải đọc kế hoạch từ `ACT_BRIEF` hoặc `docs/PLAN_HANDOFF.md`.

Sau đó xác định:

- Goal.
- Required Behavior.
- Implementation Phases.
- First ACT Task.
- Files Likely To Change.
- Critical Test Cases P0.
- Extended Test Cases P1/P2.
- Acceptance Criteria.
- Suggested Commands.
- Risks & Notes.

Nếu kế hoạch có nhiều phase, Agent chỉ được làm phase mà người dùng yêu cầu. Nếu người dùng không nói rõ, mặc định làm `First ACT Task` hoặc `Phase 1`.

Không được tự ý sửa toàn bộ project trong một lần nếu PLAN đã chia phase.

---

### Bước 2: Khảo sát code trước khi sửa

Agent phải đọc các file liên quan:

- Page/component frontend.
- Layout/sidebar/header/navigation nếu liên quan UI.
- Component dùng chung như Button, Table, Modal, Form, Card.
- API client/fetch wrapper.
- Backend route/controller/service.
- Model/schema.
- Middleware auth/permission.
- Existing test setup.
- Seed/mock data.
- Package scripts.

Không được sửa code khi chưa biết luồng hiện tại.

---

### Bước 3: Thực hiện đúng phạm vi

Agent phải thực hiện đúng phạm vi được giao:

- Nếu được giao Phase 1, chỉ làm Phase 1.
- Nếu được giao một tính năng nhỏ, chỉ sửa tính năng đó.
- Không sửa lan man các file không liên quan.
- Không xóa nút/chức năng nếu chưa hiểu nghiệp vụ.
- Không hardcode dữ liệu giả chỉ để giao diện đẹp hoặc để test pass.
- Không làm mất logic nghiệp vụ hiện có.

Nếu trong quá trình làm phát hiện kế hoạch PLAN sai hoặc thiếu, Agent được phép điều chỉnh nhưng phải ghi rõ lý do trong báo cáo cuối.

---

### Bước 4: Viết test trước hoặc song song

Agent phải tạo test trong thư mục:

```txt
e2e/tests/
```

Tên file nên rõ nghĩa, ví dụ:

```txt
e2e/tests/feature-name.spec.ts
```

Test phải ưu tiên các test case P0 trong kế hoạch.

Nếu có `e2e/utils/db.ts`, phải dùng để seed dữ liệu trước test và cleanup sau test.

Nếu chưa có utility seed database, Agent được phép tạo helper phù hợp, nhưng không được hardcode dữ liệu rác vào database thật.

Nếu project chưa có Playwright, Agent phải kiểm tra package manager và setup hiện có trước khi cài hoặc tạo cấu hình mới.

---

## 4. Quy tắc test UI

Khi test UI, Agent phải kiểm tra:

1. Trang có load thành công không.
2. Không có màn hình trắng.
3. Không có lỗi console nghiêm trọng.
4. Tất cả nút chính/phụ trong phạm vi phase hoạt động.
5. Tất cả tab/sub-tab trong phạm vi phase hoạt động.
6. Dropdown/date picker/search/filter hoạt động.
7. Form validate đúng.
8. Submit thành công khi dữ liệu hợp lệ.
9. Submit thất bại đúng khi dữ liệu không hợp lệ.
10. Dữ liệu sau thao tác phải thay đổi thật, không chỉ đổi text giả.
11. Refresh trang dữ liệu vẫn đúng.
12. Loading/empty/error state hiển thị đúng.
13. Responsive không bị vỡ nếu phase liên quan UI.
14. Menu/action menu mở đóng đúng nếu có gom nút.

---

## 5. Quy tắc test API/database

Nếu tính năng có backend/database, Agent phải kiểm tra:

1. API nhận đúng payload.
2. API validate dữ liệu.
3. API trả đúng status code.
4. Database tạo/sửa/xóa đúng.
5. Không tạo dữ liệu rác sau test.
6. Lỗi 401/403/404/500 được xử lý đúng.
7. Frontend hiển thị thông báo lỗi phù hợp.
8. Không thay đổi schema hoặc dữ liệu ngoài phạm vi nếu không cần thiết.

---

## 6. Quy tắc đăng nhập mặc định

Nếu cần đăng nhập và người dùng không cung cấp tài khoản khác, dùng:

```txt
Email: admin@gmail.com
Password: 123456
```

Nếu tài khoản này không hoạt động, Agent phải kiểm tra seed user hoặc auth setup, không được lặp login vô hạn.

---

## 7. Quy tắc chạy lệnh

Sau khi viết/sửa code, Agent phải chạy các lệnh phù hợp.

Ưu tiên kiểm tra `package.json` trước, sau đó dùng đúng package manager của project.

Các lệnh tham khảo:

```bash
npm install
npm run lint
npm run test
cd e2e && npx playwright test
```

Hoặc theo script thực tế trong `package.json`.

Nếu project dùng pnpm/yarn/bun thì dùng đúng package manager của project.

Không được chạy cùng một lệnh lỗi quá 3 lần nếu không có thay đổi gì giữa các lần chạy.

---

## 8. Quy tắc tự sửa khi test đỏ

Nếu test failed:

1. Đọc error message.
2. Xác định lỗi do test sai hay code sai.
3. Sửa đúng nơi.
4. Chạy lại test.
5. Lặp tối đa 3 vòng cho cùng một lỗi.

Nếu cùng một lỗi lặp lại quá 3 lần, dừng lại và báo:

```txt
FAILED: Bị kẹt tại bước ...
Nguyên nhân nghi ngờ: ...
File liên quan: ...
Log lỗi chính: ...
Cách sửa đề xuất tiếp theo: ...
```

---

## 9. Quy tắc không lặp vô hạn

Agent không được:

- Click một nút quá 3 lần nếu không có phản hồi.
- Login quá 3 lần nếu thất bại.
- Chạy cùng một lệnh lỗi quá 3 lần mà không thay đổi gì.
- Sửa random nhiều file khi chưa hiểu lỗi.
- Bỏ qua lỗi test để báo pass.
- Tự mở rộng phạm vi từ Phase 1 sang toàn bộ project nếu chưa được yêu cầu.
- Xóa chức năng cũ chỉ vì thấy UI rườm rà mà chưa có bằng chứng chức năng đó bị trùng.

---

## 10. Báo cáo cuối cùng

Khi hoàn thành, Agent phải báo cáo theo format:

```md
# ACT REPORT

## 1. Summary

Đã làm gì.

## 2. Plan Source

Đã dùng ACT_BRIEF, PLAN_HANDOFF.md hay kế hoạch người dùng dán trực tiếp.

## 3. Scope

Đã làm phase nào hoặc tính năng nào.

## 4. Files Changed

Danh sách file đã sửa/tạo.

## 5. Tests Implemented

Danh sách test đã viết.

## 6. Test Result

Lệnh đã chạy và kết quả.

## 7. Passed Cases

Các test case đã pass.

## 8. Failed/Skipped Cases

Các test case chưa pass hoặc chưa chạy được, kèm lý do.

## 9. Evidence

Log test, ảnh screenshot, hoặc mô tả dữ liệu UI/API đã kiểm tra.

## 10. Notes

Lưu ý thêm cho người dùng.
```

---

## 11. Tiêu chuẩn hoàn thành

Chỉ được báo hoàn thành khi:

- Code đã sửa đúng yêu cầu.
- Đúng phạm vi phase/tính năng được giao.
- Test case P0 liên quan đã được chạy.
- Không còn lỗi chí mạng.
- Có log hoặc bằng chứng test.
- Nếu còn lỗi, phải nói rõ lỗi còn lại, không được nói chung chung là đã xong.

Nếu không chạy được test do thiếu môi trường, thiếu dependency, lỗi server, lỗi database hoặc thiếu tài khoản, Agent phải báo rõ nguyên nhân và các bước cần làm tiếp.
