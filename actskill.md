# ACT Skill - Execute Plan, Implement Code, Run E2E Tests

Mô tả:
Skill này dùng cho Agent ở chế độ ACT. Nhiệm vụ của Agent là đọc bản kế hoạch từ PLAN, thực thi đúng kế hoạch, viết hoặc sửa code, viết Playwright E2E test, chạy test, đọc lỗi và sửa đến khi pass. Agent ACT không được bỏ qua test case chí mạng.

---

## 1. Quy tắc tối thượng

Khi người dùng yêu cầu implement/test một tính năng, Agent ACT bắt buộc:

1. Đọc file `docs/PLAN_HANDOFF.md` nếu tồn tại.
2. Nếu người dùng dán trực tiếp nội dung kế hoạch trong chat, phải dùng nội dung đó làm nguồn chính.
3. Không tự làm lệch khỏi kế hoạch nếu không có lý do kỹ thuật rõ ràng.
4. Nếu kế hoạch thiếu chi tiết, tự khảo sát source code để bổ sung, nhưng phải ghi lại giả định.
5. Không dùng `browser_subagent`.
6. Bắt buộc dùng Playwright E2E nếu project có hoặc có thể cài được Playwright.
7. Bắt buộc chạy test sau khi viết/sửa code.
8. Nếu test failed, phải đọc lỗi, sửa code/test hợp lý, rồi chạy lại.
9. Không báo hoàn thành khi chưa có bằng chứng test pass hoặc chưa giải thích rõ vì sao không chạy được.

---

## 2. Thứ tự thực hiện bắt buộc

### Bước 1: Đọc kế hoạch

Đọc file:

```txt
docs/PLAN_HANDOFF.md
```

Sau đó xác định:

- Goal.
- Required Behavior.
- Files Likely To Change.
- Critical Test Cases P0.
- Extended Test Cases P1/P2.
- Acceptance Criteria.
- Suggested Commands.

Nếu file không tồn tại, Agent phải tạo lại kế hoạch ngắn dựa trên yêu cầu người dùng, nhưng vẫn phải ưu tiên khảo sát code trước khi sửa.

---

### Bước 2: Khảo sát code trước khi sửa

Agent phải đọc các file liên quan:

- Page/component frontend.
- API client/fetch wrapper.
- Backend route/controller/service.
- Model/schema.
- Middleware auth/permission.
- Existing test setup.
- Seed/mock data.
- Package scripts.

Không được sửa code khi chưa biết luồng hiện tại.

---

### Bước 3: Viết test trước hoặc song song

Agent phải tạo test trong thư mục:

```txt
e2e/tests/
```

Tên file nên rõ nghĩa, ví dụ:

```txt
e2e/tests/feature-name.spec.ts
```

Test phải ưu tiên các test case P0 trong `PLAN_HANDOFF.md`.

Nếu có `e2e/utils/db.ts`, phải dùng để seed dữ liệu trước test và cleanup sau test.

Nếu chưa có utility seed database, Agent được phép tạo helper phù hợp, nhưng không được hardcode dữ liệu rác vào database thật.

---

## 3. Quy tắc test UI

Khi test UI, Agent phải kiểm tra:

1. Trang có load thành công không.
2. Không có màn hình trắng.
3. Không có lỗi console nghiêm trọng.
4. Tất cả nút chính/phụ hoạt động.
5. Tất cả tab/sub-tab hoạt động.
6. Dropdown/date picker/search/filter hoạt động.
7. Form validate đúng.
8. Submit thành công khi dữ liệu hợp lệ.
9. Submit thất bại đúng khi dữ liệu không hợp lệ.
10. Dữ liệu sau thao tác phải thay đổi thật, không chỉ đổi text giả.
11. Refresh trang dữ liệu vẫn đúng.
12. Loading/empty/error state hiển thị đúng.

---

## 4. Quy tắc test API/database

Nếu tính năng có backend/database, Agent phải kiểm tra:

1. API nhận đúng payload.
2. API validate dữ liệu.
3. API trả đúng status code.
4. Database tạo/sửa/xóa đúng.
5. Không tạo dữ liệu rác sau test.
6. Lỗi 401/403/404/500 được xử lý đúng.
7. Frontend hiển thị thông báo lỗi phù hợp.

---

## 5. Quy tắc đăng nhập mặc định

Nếu cần đăng nhập và người dùng không cung cấp tài khoản khác, dùng:

```txt
Email: admin@gmail.com
Password: 123456
```

Nếu tài khoản này không hoạt động, Agent phải kiểm tra seed user hoặc auth setup, không được lặp login vô hạn.

---

## 6. Quy tắc chạy lệnh

Sau khi viết/sửa code, Agent phải chạy các lệnh phù hợp.

Ưu tiên:

```bash
npm install
npm run lint
npm run test
cd e2e && npx playwright test
```

Hoặc theo script thực tế trong `package.json`.

Nếu project dùng pnpm/yarn/bun thì dùng đúng package manager của project.

---

## 7. Quy tắc tự sửa khi test đỏ

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

## 8. Quy tắc không lặp vô hạn

Agent không được:

- Click một nút quá 3 lần nếu không có phản hồi.
- Login quá 3 lần nếu thất bại.
- Chạy cùng một lệnh lỗi quá 3 lần mà không thay đổi gì.
- Sửa random nhiều file khi chưa hiểu lỗi.
- Bỏ qua lỗi test để báo pass.

---

## 9. Báo cáo cuối cùng

Khi hoàn thành, Agent phải báo cáo theo format:

```md
# ACT REPORT

## 1. Summary

Đã làm gì.

## 2. Files Changed

Danh sách file đã sửa/tạo.

## 3. Tests Implemented

Danh sách test đã viết.

## 4. Test Result

Lệnh đã chạy và kết quả.

## 5. Passed Cases

Các test case đã pass.

## 6. Failed/Skipped Cases

Các test case chưa pass hoặc chưa chạy được, kèm lý do.

## 7. Evidence

Log test, ảnh screenshot, hoặc mô tả dữ liệu UI/API đã kiểm tra.

## 8. Notes

Lưu ý thêm cho người dùng.
```

---

## 10. Tiêu chuẩn hoàn thành

Chỉ được báo hoàn thành khi:

- Code đã sửa đúng yêu cầu.
- Test case P0 đã được chạy.
- Không còn lỗi chí mạng.
- Có log hoặc bằng chứng test.
- Nếu còn lỗi, phải nói rõ lỗi còn lại, không được nói chung chung là đã xong.
