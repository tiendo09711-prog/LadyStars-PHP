# AGENTS.md

## Cách làm việc trong project này

Trước khi sửa code, luôn đọc kỹ yêu cầu của user và xác định phạm vi cần sửa.

Không được sửa lan man ngoài phạm vi task.

Không được hardcode dữ liệu mẫu.

Không được tự bịa API mới.

Không được đổi endpoint, request body, response mapping hoặc logic nghiệp vụ cũ nếu task không yêu cầu.

Không được thêm thư viện mới nếu chưa hỏi user.

Không được sửa backend, database, auth, permission, config build nếu task chỉ yêu cầu sửa giao diện.

Nếu cần sửa quá 5 file, phải dừng lại và hỏi user trước.

## Với task refactor UI

Nếu task là refactor UI, đổi giao diện, làm theo mẫu ảnh/html/link, hãy đọc và tuân thủ file:

`docs/codex/ACT_UI_REFACTOR.md`

Bắt buộc làm theo quy trình:

1. Khảo sát route/component/API/state/handler trước.
2. Tạo file map chức năng trước khi sửa UI.
3. Sau đó mới refactor UI.
4. Giữ nguyên chức năng cũ.
5. Test lại từng button, filter, tab, table, pagination, modal nếu có theo e2e
6. Báo cáo cuối theo ACT REPORT.

## Khi báo cáo

Báo cáo ngắn gọn, rõ:

- Đã đọc file nào
- Đã sửa file nào
- Đã giữ lại chức năng nào
- Đã chạy test/command gì
- Còn rủi ro gì
