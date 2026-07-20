# AGENTS.md

## Chế độ mặc định: GUARDED THOROUGH MODE

Áp dụng cho mọi task trong repository này, trừ khi user ghi rõ muốn audit read-only hoặc muốn làm nhanh có giới hạn.

Mục tiêu:

- Làm đúng yêu cầu, hoàn chỉnh và có thể kiểm chứng.
- Khảo sát đủ source, state, API, route, dữ liệu và test liên quan trước khi sửa.
- Không hy sinh chất lượng để tiết kiệm token, số lệnh hoặc thời gian.
- Sau mỗi phần thay đổi có ý nghĩa phải tự rà soát diff và kiểm tra ảnh hưởng liên quan.
- Khi test lỗi, phải tự điều tra, sửa và chạy lại đến khi pass hoặc đến khi bị chặn bởi một hard gate an toàn.
- Không đụng vào logic, dữ liệu, quyền hạn hoặc phần code ngoài phạm vi nếu chưa có lý do kỹ thuật rõ ràng.

Agent không cần kể suy nghĩ nội bộ dài dòng. Tuy nhiên phải làm kỹ trong thực tế, ghi nhận đủ bằng chứng kiểm tra và báo cáo cuối rõ ràng.

---

# 1. Quy tắc ưu tiên

Thứ tự ưu tiên khi thực hiện task:

1. Yêu cầu trực tiếp mới nhất của user.
2. Tính an toàn của dữ liệu, phân quyền, tồn kho, hóa đơn và dữ liệu thật.
3. Hành vi hiện tại đã hoạt động đúng.
4. Tính nhất quán kiến trúc và UI của toàn dự án.
5. Tối thiểu hóa thay đổi không cần thiết.

Không được dùng việc “dọn code”, “refactor cho đẹp”, “tối ưu tiện tay” làm lý do để sửa phạm vi ngoài yêu cầu.

---

# 1A. Source of truth & deploy (bắt buộc)

## Chỉ được sửa code ở đây

| Thư mục | Vai trò | Agent có được sửa? |
|---------|---------|-------------------|
| `client/` | React UI (source) | **Có** — mọi task FE |
| `backend/` | Laravel API, config, routes, `public/` SPA sau build | **Có** — mọi task BE / build output |
| `artifacts/` | SQL, zip deploy (`ladystars-host-code.zip`), report | Tạo zip khi user cần deploy |
| Host `public_html` | Production | User upload zip; agent không SSH/ghi host trừ khi được yêu cầu |

**Không** dùng / không tái tạo folder `deploy-upload/` làm bản code song song.

Quy tắc:

1. Sửa xong task cần lên host: chạy `npm run deploy:prepare` → zip tại `artifacts/ladystars-host-code.zip` (build client → `backend/public` → zip từ `backend`, không vendor/không `.env`).
2. Báo cáo deploy: user upload **zip** vào `public_html`, **giữ** host `.env` + `vendor` + database.
3. Không upload `client/`, `node_modules/`, `.env` local lên host.
4. Chi tiết: `docs/DEPLOY.md`.

---

# 2. Bảo vệ worktree và thay đổi có sẵn

Trước mọi task có sửa code, bắt buộc chạy:

```bash
git status --short
git diff --check
git diff --stat
```

Nếu worktree đã có file modified, deleted hoặc untracked:

- Xác định rõ đó là thay đổi có sẵn trước task.
- Không được ghi đè, xóa, revert, format hàng loạt hoặc gộp lại các thay đổi đó.
- Không được giả định mọi diff đều do task hiện tại tạo ra.
- Chỉ sửa phần thật sự cần thiết trong phạm vi user yêu cầu.
- Khi cùng một file đã có thay đổi từ trước, phải đọc diff hiện tại trước khi chạm vào và tránh phá patch có sẵn.
- Báo cáo cuối phải phân biệt rõ:
  - thay đổi có sẵn trước task;
  - thay đổi do agent tạo trong task.

Tuyệt đối không chạy:

```bash
git reset --hard
git clean -fd
git checkout .
git restore .
git add
git commit
git push
```

Không được dùng các biến thể tương đương để xóa hoặc khôi phục hàng loạt file.

---

# 3. Phân loại rủi ro trước khi sửa

Mỗi task phải được phân loại nội bộ trước khi thực hiện.

## A. Low risk

Ví dụ:

- CSS, spacing, màu sắc, typography.
- Chỉnh UI cục bộ.
- Sửa text, icon, trạng thái hover/focus.
- Validation hiển thị ở frontend không ảnh hưởng dữ liệu.
- Sửa bug trình bày hoặc responsive cục bộ.

Yêu cầu tối thiểu:

- Khảo sát source liên quan.
- Review diff.
- `npm.cmd run verify:static`.
- Kiểm tra hành vi UI liên quan bằng browser/Playwright khi có thể.

## B. Medium risk

Ví dụ:

- Thay đổi state frontend.
- Sửa form submit.
- Sửa logic tìm kiếm, lọc, phân trang.
- Sửa API cục bộ.
- Sửa mapping frontend ↔ backend.
- Sửa in ấn, export, scanner, dropdown, modal.
- Sửa route nhưng không liên quan auth/role.

Yêu cầu tối thiểu:

- Truy vết đầy đủ UI → state → API → backend → dữ liệu liên quan.
- Kiểm tra các luồng thành công, thất bại và cancel/back.
- `npm.cmd run verify:static`.
- Chạy test/Playwright có mục tiêu nếu đã tồn tại hoặc tạo test nhỏ khi cần thiết.
- Rà soát regression các route hoặc màn hình dùng chung component đó.

## C. High risk

Ví dụ:

- Auth, role, permission, admin/root owner.
- Inventory, tồn kho, chuyển kho, nhập/xuất kho, kiểm kho.
- Hóa đơn, thanh toán, hoàn tiền, công nợ.
- MongoDB schema, migration, script import/export/cleanup.
- Store settings toàn cục.
- Logic có thể ghi, xóa, cập nhật dữ liệu thật.
- Thay đổi vượt quá phạm vi ban đầu hoặc ảnh hưởng nhiều module.

Yêu cầu:

- Khảo sát kỹ toàn bộ luồng dữ liệu và điểm gọi.
- Liệt kê rõ invariant cần giữ trước khi sửa.
- Chỉ dùng dữ liệu test/local/isolated nếu cần test ghi dữ liệu.
- Không chạy live database write nếu user chưa ghi rõ `cho phép live DB test`.
- Nếu phát hiện thay đổi sẽ làm đổi nghiệp vụ, quyền truy cập hoặc dữ liệu thật, phải dừng và báo user trước khi tiếp tục.

---

# 4. Quy trình bắt buộc cho task có chỉnh sửa

## Bước 1 — Đọc yêu cầu và baseline

1. Đọc yêu cầu của user.

2. Đọc file `AGENTS.md`.

3. Chạy baseline Git:

   ```bash
   git status --short
   git diff --check
   git diff --stat
   ```

4. Đọc `package.json` ở root và package liên quan để biết script thực tế.

5. Xác định:
   - loại task;
   - mức rủi ro;
   - UI/route/API/model/state liên quan;
   - test hiện có;
   - dữ liệu hoặc quyền có thể bị ảnh hưởng.

Không tự chạy lệnh không tồn tại trong package scripts. Không đoán tên test config, visual config hoặc script.

## Bước 2 — Khảo sát source trước khi sửa

Phải khảo sát đủ nhưng có trọng tâm.

Với UI/frontend, cần lần theo:

- Route trong `client/src/main.tsx`.
- Layout dùng chung, đặc biệt `client/src/core/layout/AppLayout.tsx`.
- Component trang.
- CSS/module CSS/global CSS có thể ghi đè.
- State, callback, API client và type liên quan.
- Component dùng chung có thể bị ảnh hưởng.
- Test Playwright hoặc visual test liên quan nếu tồn tại.

Với backend/API, cần lần theo:

- Route.
- Controller/handler.
- Service/business logic.
- Schema/model.
- Validation.
- Auth middleware/permission nếu có.
- Call site từ frontend.
- Test hiện hữu.

Với bug UI, không được chỉ sửa CSS theo phỏng đoán. Phải xác định selector nào thắng, breakpoint nào áp dụng, trạng thái hover/focus/open/active nào đang khác nhau và component nào render phần tử đó.

## Bước 3 — Lập kế hoạch thực thi ngắn nhưng rõ

Trước khi sửa, tự xác định:

- Acceptance criteria cụ thể.
- File dự kiến thay đổi.
- Hành vi không được thay đổi.
- Kiểm tra nào sẽ chạy.
- Rủi ro chính.
- Có cần test browser, Playwright, build, typecheck hoặc test API không.

Không cần hỏi user xác nhận cho task bình thường nếu phạm vi đã rõ.

Phải hỏi user hoặc dừng bằng `BLOCKED` khi gặp hard gate ở phần sau.

## Bước 4 — Sửa theo lát cắt hoàn chỉnh

Thực hiện theo từng lát cắt có thể kiểm tra:

1. Sửa phần cần thiết.

2. Đọc lại diff của phần vừa sửa.

3. Kiểm tra code có:
   - lỗi import;
   - type không khớp;
   - stale state;
   - handler bị mất;
   - route bị sai;
   - selector CSS quá rộng;
   - responsive regression;
   - accessibility regression;
   - thay đổi ngoài phạm vi;
   - hardcode dữ liệu nghiệp vụ;
   - lỗi loading/error/empty state.

4. Chỉ chuyển sang phần tiếp theo khi phần trước hợp lý.

Không rewrite một file lớn chỉ để sửa một chi tiết nhỏ nếu có thể patch chính xác.

Không tự tạo component abstraction mới khi chưa chứng minh nó giúp giảm trùng lặp hoặc đảm bảo tính nhất quán trong chính phạm vi task.

---

# 5. Quy tắc UI/UX bắt buộc

Với mọi task liên quan UI, phải kiểm tra tối thiểu:

- Desktop layout.
- Breakpoint/mobile hiện có của khu vực bị sửa.
- Default state.
- Hover state.
- Focus keyboard state.
- Active/current route state.
- Disabled/loading state nếu có.
- Empty/error state nếu có.
- Dropdown/modal/popover nếu có.
- Click outside và Escape nếu component hiện tại có hỗ trợ.
- Không tạo body horizontal overflow.
- Không làm text bị cắt, wrap xấu, lệch icon hoặc thay đổi layout khi hover.
- Không làm vùng click nhỏ hơn text/icon hiển thị.
- Không làm mất accessibility cơ bản: button/link semantic phù hợp, focus thấy được, không chỉ dựa vào màu để biểu thị trạng thái.

Với dropdown/menu:

- Trigger, label và icon phải căn chỉnh thống nhất.
- Trạng thái open phải rõ ràng.
- Không được làm hỏng click-outside.
- Không được làm hỏng route navigation.
- Không được để popup ra ngoài viewport hoặc bị cắt bởi overflow.
- Không được làm mobile navigation khác hành vi desktop nếu user không yêu cầu.

Với UI redesign hoặc áp dụng mã nguồn mở:

- Chỉ áp dụng pattern phù hợp kiến trúc hiện tại.
- Không thay đổi nghiệp vụ để ép UI chạy theo template.
- Không copy nguyên khối code khi chưa đọc dependency, API và license.
- Nếu dùng reference open source, báo cáo cuối phải nêu:
  - repository/reference;
  - commit hoặc version đã tham khảo nếu xác định được;
  - license;
  - pattern đã áp dụng;
  - file dự án đã thay đổi.

- Không tự cài dependency mới trừ khi user yêu cầu rõ hoặc đã được chấp thuận.

---

# 6. Quy tắc kiểm tra và test

## 6.1 Kiểm tra tĩnh bắt buộc

Sau khi hoàn tất thay đổi code, bắt buộc chạy:

```bash
npm.cmd run verify:static
```

Script này hiện bao gồm:

- Client TypeScript check.
- Client build.
- Server build.
- `git diff --check`.

Không được coi task hoàn tất khi `verify:static` fail.

## 6.2 Kiểm tra theo loại thay đổi

Ngoài `verify:static`, phải chọn kiểm tra phù hợp.

### UI thuần túy

- Kiểm tra trực tiếp bằng browser hoặc Playwright nếu môi trường sẵn sàng.
- Nếu có Playwright visual config trong worktree hiện tại, dùng test visual liên quan.
- Nếu chưa có visual config nhưng có test E2E phù hợp, chạy targeted test thay vì toàn bộ suite.
- Khi ảnh hưởng dropdown, modal, table, responsive hoặc navigation, phải kiểm tra tương tác thực tế.

### UI có logic

Ví dụ: filter, search, form, validation, selection, pagination, scanner, export, print.

Phải kiểm tra:

- Luồng thành công.
- Luồng dữ liệu rỗng hoặc không hợp lệ.
- Cancel/back/reset khi có.
- Trạng thái loading/error khi có.
- Không regression với các flow hiện có liên quan.

### API/backend

- Kiểm tra type/build.
- Kiểm tra route, validation, response shape và error handling.
- Chỉ chạy test có khả năng ghi DB nếu đã xác minh môi trường test cô lập.
- Không gọi API có thể ghi dữ liệu thật để “thử nhanh”.

### Shared component hoặc global style

- Tìm toàn bộ usages trước khi sửa.
- Kiểm tra ít nhất các màn hình đại diện sử dụng component/style đó.
- Không sửa global CSS theo kiểu selector quá rộng làm ảnh hưởng ngầm nhiều trang.

## 6.3 Vòng sửa lỗi và chạy lại test

Không còn giới hạn “chỉ một lần verify”.

Khi kiểm tra fail:

1. Đọc toàn bộ lỗi, không sửa mò.
2. Xác định nguyên nhân gốc.
3. Sửa đúng nguyên nhân.
4. Review diff.
5. Chạy lại kiểm tra đã fail.
6. Lặp lại đến khi pass hoặc gặp hard gate.

Không được báo `COMPLETE_WITH_LIMITATION` chỉ vì chưa muốn chạy lại test.

Nếu sau nhiều vòng mà lỗi không thể giải quyết an toàn:

- Dừng.
- Báo rõ lỗi, bằng chứng, phần đã thử, phạm vi bị chặn.
- Verdict là `BLOCKED` hoặc `COMPLETE_WITH_KNOWN_ISSUE` tùy trạng thái thực tế.

## 6.4 Không chạy test phá dữ liệu

Không được chạy mặc định:

- Test ghi vào MongoDB thật.
- Legacy test không cô lập dữ liệu.
- Script seed/import/load/cleanup.
- Script migration.
- Test dùng tài khoản admin thật hoặc Store Settings thật.
- Test xóa dữ liệu diện rộng.

Trước khi chạy E2E, phải xác định:

- config đang dùng;
- port;
- database target;
- fixture isolation;
- có thể ghi/xóa dữ liệu hay không.

---

# 7. Live Database Test Mode

Chỉ dùng khi user ghi rõ trong prompt:

```text
cho phép live DB test
```

Khi được cho phép, chỉ chạy qua workflow guard hiện có:

```bash
npm.cmd run live:preflight
npm.cmd run live:test -- --spec e2e/live/<spec>.spec.ts
npm.cmd run live:report
```

Điều kiện bắt buộc:

- Có `.env.live-test.local`.
- `LIVE_TEST_MODE=true`.
- `LIVE_TEST_ACK=I_ACCEPT_LIVE_DATABASE_WRITES`.
- Backup thành công trước test.
- Spec nằm trong `e2e/live/`.
- Có `E2E_RUN_ID` riêng.
- Test data gắn marker run ID.
- Cleanup chỉ xóa fixture của chính run ID đó.
- Không dùng `deleteMany({})`, `updateMany({})`, `dropDatabase()`.
- Không sửa global Store Settings.
- Không upsert/sửa admin hoặc root owner.
- Không dùng dữ liệu thật có sẵn làm fixture ghi đè.
- Không dùng các port dev thật `4000/5173`.

Không auto-restore database khi test fail.

Nếu task không thể test cô lập, verdict phải là:

```text
BLOCKED_LIVE_TEST_NOT_ISOLATABLE
```

Báo cáo live mode bắt buộc có:

- runId;
- backup path;
- spec;
- collection có thay đổi;
- fixture IDs tạo/dọn;
- kết quả test;
- limitation còn lại.

---

# 8. Hard gate: phải dừng và báo user

Phải dừng trước khi tự động tiếp tục nếu cần:

- Migration, restore, apply database thật.
- Ghi, xóa hoặc sửa MongoDB thật ngoài live mode đã được user cho phép.
- Xóa dữ liệu thật.
- Sửa auth, permission, role, root owner hoặc admin behavior mà user chưa yêu cầu rõ.
- Sửa tồn kho, hóa đơn, thanh toán, hoàn tiền hoặc dữ liệu nghiệp vụ nhạy cảm mà yêu cầu chưa đủ rõ.
- Sửa global Store Settings.
- Thêm hoặc nâng cấp dependency.
- Đổi database schema.
- Chạy seed, import, load, cleanup script.
- Deploy.
- Thay đổi scope lớn hơn yêu cầu ban đầu.
- Phát hiện task cần sửa trên 25 file nhưng user chỉ yêu cầu một chỉnh sửa nhỏ.
- Phát hiện source hiện tại có lỗi/baseline fail và không thể xác định thay đổi nào gây ra lỗi.
- Thiếu môi trường cần thiết để kiểm tra hành vi quan trọng.
- Yêu cầu mâu thuẫn với invariant hoặc nghiệp vụ đã tồn tại.

Khi blocked, phải nêu:

- lý do;
- file/luồng liên quan;
- rủi ro;
- thông tin hoặc quyết định cần user xác nhận;
- không tự đoán nghiệp vụ để tiếp tục.

---

# 9. Quy tắc bảo mật và dữ liệu

Không được:

- In secret, token, password, Mongo URI hoặc `.env` ra báo cáo.
- Commit `.env`.
- Hardcode credential.
- Bỏ auth middleware để test nhanh.
- Dùng tài khoản admin/root owner có sẵn làm fixture ghi.
- Thay đổi dữ liệu không có filter ID/marker rõ ràng.
- Dùng `deleteMany({})`, `updateMany({})`, `dropDatabase()` trong bất kỳ test/script mới nào.
- Tạo API debug hoặc bypass permission để phục vụ task.
- Tự ý expose endpoint nội bộ.

---

# 10. Tiêu chuẩn hoàn thành

Chỉ được dùng verdict `COMPLETE` khi:

- Hoàn thành đúng acceptance criteria.
- Không có lỗi TypeScript/build từ thay đổi.
- `npm.cmd run verify:static` pass.
- Đã chạy kiểm tra phù hợp với loại thay đổi.
- Review diff cuối sạch:

  ```bash
  git diff --check
  ```

- Không còn lỗi biết trước do task tạo ra.
- Không có thay đổi ngoài phạm vi không giải thích được.
- Không làm mất hành vi hiện có đã được yêu cầu giữ nguyên.

Không được gọi task là hoàn thành chỉ vì code “trông hợp lý”.

---

# 11. Báo cáo cuối

Báo cáo bằng tiếng Việt, rõ ràng, không cần cố giới hạn số dòng.

Dùng cấu trúc sau:

```text
KẾT QUẢ THỰC HIỆN

1. Phạm vi hoàn thành
- ...

2. Phân tích/giải pháp chính
- ...

3. File thay đổi bởi task
- ...

4. Hành vi đã kiểm tra
- ...

5. Lệnh kiểm tra đã chạy
- <command> — PASS/FAIL
- ...

6. Bảo toàn ngoài phạm vi
- ...

7. Worktree
- Thay đổi có sẵn trước task: ...
- Thay đổi do task tạo: ...
- Git status hiện tại: ...

8. Rủi ro hoặc limitation còn lại
- ...

9. Verdict
- COMPLETE / BLOCKED / COMPLETE_WITH_KNOWN_ISSUE / BLOCKED_LIVE_TEST_NOT_ISOLATABLE
```

Không liệt kê chain-of-thought hoặc suy luận nội bộ.

Nếu có lỗi chưa xử lý được, phải mô tả trung thực và không ghi `COMPLETE`.

---

# 12. Audit Read-Only Mode

Chỉ dùng khi user ghi rõ:

```text
AUDIT READ-ONLY
```

Trong mode này:

- Không tạo, sửa, xóa hoặc format file.
- Không chạy install, build, test, seed, migration hoặc script ghi dữ liệu.
- Chỉ được đọc source, config, Git status/diff và tài liệu.
- Nếu cần kiểm tra database, chỉ dùng truy vấn read-only khi user cho phép rõ.
- Báo cáo phải phân biệt fact, inference và điểm chưa thể xác minh.
- Không đưa ra kết luận “đã sửa” hoặc “đã pass test”.

---

# 13. Quy tắc cuối cùng

- Ưu tiên đúng và an toàn hơn nhanh.
- Không tiết kiệm token bằng cách bỏ khảo sát hoặc bỏ test cần thiết.
- Không chạy lệnh vô nghĩa chỉ để tạo cảm giác đã kiểm tra.
- Không báo cáo pass nếu không có bằng chứng.
- Không phá thay đổi có sẵn trong worktree.
- Không thay đổi nghiệp vụ nếu user chưa yêu cầu.
- Sửa code chỉ trong `client/` + `backend/`; gói host = `artifacts/ladystars-host-code.zip` sau `npm run deploy:prepare`.
- Khi task rõ và an toàn, tự chủ thực hiện từ khảo sát → sửa → kiểm tra → sửa lỗi → kiểm tra lại → báo cáo.
