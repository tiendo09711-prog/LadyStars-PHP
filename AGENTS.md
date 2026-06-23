# AGENTS.md

## Mục tiêu workflow

Với task thông thường, agent phải tự làm trọn chu trình:

1. Đọc yêu cầu và xác định phạm vi.
2. Chạy `git status --short` và `git diff --check`.
3. Khảo sát source, API, state và test liên quan trực tiếp.
4. Chỉ sửa các file cần thiết để hoàn thành đúng yêu cầu.
5. Chạy `npm.cmd run verify:static`.
6. Khi verify fail, tự điều tra và sửa tối đa 2 vòng.
7. Chỉ báo COMPLETE khi các kiểm tra bắt buộc đã pass.

## Giới hạn phạm vi

- Không sửa ngoài yêu cầu của user.
- Không tự thêm nghiệp vụ, UI, API, endpoint hoặc dependency mới.
- Không hardcode dữ liệu mẫu.
- Không đổi auth, role, permission, inventory, invoice hoặc database schema nếu task không yêu cầu rõ.
- Không thay đổi file không liên quan chỉ để “dọn đẹp” code.

## Được tự chạy

- đọc source;
- tạo, sửa, xóa file trong repository khi thuộc scope task;
- chạy git status, git diff, git diff --check;
- chạy npm.cmd, npx.cmd, node;
- chạy typecheck, build, static audit và test local an toàn;
- tự sửa tối đa 2 vòng khi test fail.

## Hard gate: phải dừng và báo user

Không tiếp tục tự động khi cần:

- migration, backup, restore hoặc apply database thật;
- đọc/ghi database thật;
- deploy;
- sửa auth, permission hoặc role;
- xóa dữ liệu thật;
- sửa quá 25 file;
- thay đổi nghiệp vụ chưa được user quyết định;
- verify vẫn fail sau 2 vòng sửa.

## Tuyệt đối không chạy

- git reset --hard
- git clean -fd
- git checkout .
- git restore .
- git add
- git commit
- git push
- migration/apply/restore MongoDB thật
- deploy

## Báo cáo cuối

Báo cáo bằng tiếng Việt:

1. Mục tiêu đã hoàn thành.
2. File đã sửa/tạo/xóa.
3. Các lệnh đã chạy và PASS/FAIL.
4. Rủi ro hoặc phần chưa xác minh.
5. `git status --short`.
6. Verdict: COMPLETE / COMPLETE_WITH_LIMITATION / BLOCKED.

## Live Database Test Mode

Ch? ?? test ghi tr?c ti?p v?o MongoDB ch?nh (live-guarded).

- Ch? ???c d?ng khi prompt c?a user ghi r? "cho ph?p live DB test".
- Ch? ???c ch?y qua: `npm.cmd run live:test -- --spec e2e/live/<spec>.spec.ts`.
- Kh?ng ???c ch?y legacy suite trong `e2e/tests/` tr?c ti?p tr?n Mongo th?t.
- Live mode ch? ch?y khi c? ??: `.env.live-test.local`, `LIVE_TEST_MODE=true`, `LIVE_TEST_ACK=I_ACCEPT_LIVE_DATABASE_WRITES`, backup th?nh c?ng, m?t spec thu?c `e2e/live/`, v? `E2E_RUN_ID` duy nh?t.
- Backup tr??c test l? b?t bu?c. Kh?ng backup th? kh?ng test.
- Backend test ch?y port 4100, frontend 5174; kh?ng d?ng 4000/5173 c?a dev server.
- T?i ?a 2 v?ng test/s?a.
- Kh?ng c? backup/report th? kh?ng ???c verdict COMPLETE.
- Runner kh?ng bao gi? t? restore database khi test fail.
- N?u m?t task kh?ng th? test theo c?c ?i?u ki?n c? l?p (ch? cleanup theo `_id` ?? t?o, kh?ng `deleteMany({})`, kh?ng `dropDatabase()`, kh?ng s?a Store Settings global, kh?ng upsert admin/root owner, kh?ng g?i API c?ng 4000), verdict ph?i l? `BLOCKED_LIVE_TEST_NOT_ISOLATABLE`.

B?o c?o cu?i c?a live mode b?t bu?c n?u: runId, backup path, collection thay ??i (count tr??c/sau), fixture IDs ?? t?o/d?n, test pass/fail v? limitation.
