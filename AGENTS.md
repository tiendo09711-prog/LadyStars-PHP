# AGENTS.md

## Chế độ mặc định: FAST MODE

Áp dụng cho các task chỉnh sửa nhỏ về giao diện, trải nghiệm người dùng, validation cục bộ hoặc logic nhỏ.

Mục tiêu: hoàn thành đúng phạm vi, ít tốn token, ít lệnh không cần thiết, báo cáo ngắn.

Agent không cần trình bày plan dài hoặc cập nhật tiến độ. Chỉ trả lời khi cần hard gate hoặc khi hoàn thành.

## Workflow bắt buộc

1. Đọc yêu cầu, xác định đúng phạm vi và các file liên quan trực tiếp.
2. Chạy:

   ```bash
   git status --short
   git diff --check
   ```

3. Khảo sát gọn source, API, state và luồng liên quan trực tiếp. Không đọc lan man các module không thuộc task.
4. Chỉ sửa các file thực sự cần thiết.
5. Chạy đúng **một lần duy nhất** một lệnh kiểm tra tối thiểu phù hợp:
   - Mặc định:

     ```bash
     npm.cmd run verify:static
     ```

   - Chỉ dùng build, typecheck hoặc test cụ thể khi task yêu cầu rõ hoặc thay đổi có rủi ro kỹ thuật cao.
   - Không tự chạy toàn bộ E2E, toàn bộ test suite, build nhiều lần, hoặc kiểm tra lặp lại nếu user không yêu cầu.

6. Nếu lần kiểm tra duy nhất bị lỗi:
   - Đọc lỗi, sửa trực tiếp tối đa một vòng.
   - Không chạy lại automated test/verify lần thứ hai, trừ khi user yêu cầu rõ.
   - Báo cáo rõ phần đã sửa nhưng chưa được kiểm tra lại.

7. Báo cáo kết quả ngay sau đó, ngắn gọn.

## Giới hạn phạm vi

- Không sửa ngoài yêu cầu của user.
- Không tự thêm nghiệp vụ, UI, API, endpoint, dependency hoặc dữ liệu mẫu ngoài phạm vi được yêu cầu.
- Không hardcode dữ liệu mẫu hoặc dữ liệu nghiệp vụ.
- Không đổi auth, role, permission, inventory, invoice hoặc database schema nếu task không yêu cầu rõ.
- Không thay đổi file không liên quan chỉ để “dọn đẹp” code.
- Ưu tiên sửa ít file nhất có thể.

## Được tự chạy

- Đọc source trong repository.
- Tạo, sửa, xóa file khi thuộc phạm vi task.
- Chạy `git status`, `git diff`, `git diff --check`.
- Chạy `npm.cmd`, `npx.cmd`, `node`.
- Chạy đúng một lệnh verify/test tối thiểu theo workflow trên.
- Tự sửa một vòng sau khi verify/test duy nhất báo lỗi.

## Hard gate: phải dừng và báo user

Không tiếp tục tự động khi cần:

- Migration, backup, restore hoặc apply database thật.
- Đọc/ghi database thật.
- Deploy.
- Sửa auth, permission hoặc role.
- Xóa dữ liệu thật.
- Sửa quá 25 file.
- Thay đổi nghiệp vụ chưa được user quyết định.
- Cần chạy lại test/verify sau khi đã dùng lần kiểm tra duy nhất.
- Phát hiện rủi ro có thể ảnh hưởng tồn kho, hóa đơn, phân quyền hoặc dữ liệu thật.

## Tuyệt đối không chạy

```bash
git reset --hard
git clean -fd
git checkout .
git restore .
git add
git commit
git push
```

Ngoài ra, tuyệt đối không:

- migration/apply/restore MongoDB thật;
- deploy;
- `deleteMany({})`;
- `dropDatabase()`;
- xóa dữ liệu không giới hạn theo ID/fixture thuộc task;
- tự ý sửa Store Settings global;
- tự ý upsert hoặc sửa admin/root owner.

## Quy tắc test

- Mỗi task chỉ có **01 lần chạy kiểm tra tự động**.
- Không chạy E2E mặc định.
- Không chạy live DB test mặc định.
- Không chạy nhiều lệnh kiểm tra liên tiếp chỉ để “cho chắc”.
- Với chỉnh UI thuần túy, ưu tiên `npm.cmd run verify:static`.
- Với logic/API nhỏ, vẫn ưu tiên `npm.cmd run verify:static`, trừ khi user yêu cầu test cụ thể.
- Sau khi test lỗi và đã sửa một vòng, không test lại. Verdict phải là `COMPLETE_WITH_LIMITATION`.

## Báo cáo cuối

Báo cáo bằng tiếng Việt, tối đa khoảng 10 dòng, theo mẫu:

```text
KẾT QUẢ
- Hoàn thành: ...
- File sửa: ...
- Kiểm tra đã chạy: <lệnh> — PASS/FAIL
- Nếu FAIL: đã sửa lỗi ..., chưa chạy lại theo FAST MODE.
- Rủi ro/chưa xác minh: ...
- Git status: ...
- Verdict: COMPLETE / COMPLETE_WITH_LIMITATION / BLOCKED
```

Không liệt kê dài dòng quá trình suy nghĩ, source đã đọc hoặc các phương án không chọn.

## Live Database Test Mode

Chỉ dùng khi prompt của user ghi rõ: `cho phép live DB test`.

- Chỉ được chạy qua:

  ```bash
  npm.cmd run live:test -- --spec e2e/live/<spec>.spec.ts
  ```

- Không chạy legacy suite trong `e2e/tests/` trực tiếp trên MongoDB thật.
- Chỉ chạy khi có đủ:
  - `.env.live-test.local`
  - `LIVE_TEST_MODE=true`
  - `LIVE_TEST_ACK=I_ACCEPT_LIVE_DATABASE_WRITES`
  - backup thành công
  - một spec thuộc `e2e/live/`
  - `E2E_RUN_ID` duy nhất

- Backup trước test là bắt buộc. Không backup thì không test.
- Backend test chạy port `4100`, frontend `5174`; không dùng `4000/5173` của dev server.
- Live test cũng chỉ được chạy một lần theo FAST MODE.
- Runner không bao giờ tự restore database khi test fail.
- Nếu task không thể test cô lập bằng dữ liệu có ID/fixture riêng, verdict phải là:

  ```text
  BLOCKED_LIVE_TEST_NOT_ISOLATABLE
  ```

Báo cáo live mode bắt buộc có: `runId`, backup path, collection thay đổi, fixture IDs tạo/dọn, test PASS/FAIL và limitation.
