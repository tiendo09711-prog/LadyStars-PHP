# ACT_UI_REFACTOR.md

# Quy trình chuẩn khi refactor UI theo mẫu

Áp dụng cho mọi task đổi giao diện, làm lại layout, làm UI theo ảnh/html/link mẫu.

Mục tiêu:
Refactor giao diện đẹp hơn, hiện đại hơn, giống tinh thần mẫu user cung cấp, nhưng không làm hỏng chức năng cũ, API cũ, state cũ, handler cũ và luồng nghiệp vụ cũ.

---

# 1. Nguyên tắc bắt buộc

Không được sửa UI ngay lập tức.

Trước khi sửa phải khảo sát code hiện tại.

Chỉ đọc và sửa các file liên quan trực tiếp đến route/task user giao.

Không đọc toàn project nếu không cần.

Không sửa lan man sang trang khác.

Không xóa chức năng cũ.

Không hardcode dữ liệu mẫu.

Không tự bịa API mới.

Không đổi endpoint API cũ nếu task không yêu cầu.

Không đổi cấu trúc request/response nếu task không yêu cầu.

Không thêm UI library mới nếu chưa hỏi user.

Không sửa backend/database/auth/permission/config build nếu task chỉ yêu cầu UI.

Nếu cần sửa quá 5 file, dừng lại hỏi user trước.

---

# 2. Phase 1 - Khảo sát code hiện tại

Trước khi sửa, cần tìm các file liên quan đến route được giao.

Cần xác định:

## Route

- Route được khai báo ở đâu?
- Component chính là file nào?
- Có layout cha không?
- Có auth guard hoặc permission guard không?

## Component

- Component chính của trang
- Component con liên quan
- Tab nếu có
- Modal/drawer/dropdown nếu có
- Table/list/card nếu có
- Filter/search form nếu có
- Pagination nếu có

## State

Ghi nhớ state liên quan đến:

- dữ liệu danh sách
- dữ liệu chi tiết
- filter
- search
- sort
- pagination
- selected rows
- current tab
- modal open/close
- loading
- error
- form data
- permission/role nếu có

## API

Ghi lại toàn bộ API đang dùng:

- load danh sách
- search/filter
- pagination
- sort
- xem chi tiết
- thêm mới
- sửa
- xóa
- export/import/in ấn nếu có
- đổi trạng thái nếu có

Với mỗi API cần biết:

- method
- endpoint
- file gọi API
- payload
- response mapping
- handler gọi API
- state nhận dữ liệu

## Button/action

Kiểm tra từng nút, icon, dropdown, menu action:

- text/icon hiện tại
- vị trí
- handler khi click
- có gọi API không
- có mở modal không
- có chuyển route không
- có cần selected rows không
- có confirm không
- có toast/notification không

## Table/list

Nếu có table/list, cần xác định:

- các cột hiện tại
- field dữ liệu từng cột
- cột nào sort được
- cột nào click được
- cột nào có action
- cột nào có checkbox
- có chọn tất cả không
- có bulk action không

---

# 3. Phase 2 - Tạo file map chức năng

Sau khi khảo sát xong, tạo file map theo tên trang.

Quy tắc đặt tên:

`[PAGE_NAME]_UI_FUNCTION_MAP.md`

Ví dụ:

- `PRODUCTS_UI_FUNCTION_MAP.md`
- `ORDERS_UI_FUNCTION_MAP.md`
- `CUSTOMERS_UI_FUNCTION_MAP.md`

Nội dung file map phải có:

```md
# [PAGE_NAME] UI Function Map

## Route

- Path:
- Main component:
- Related files:
- Layout/Auth/Permission:

## Tổng quan trang

- Trang này dùng để:
- Khu vực/tab chính:
- Chức năng chính:

## API đang dùng

| Chức năng | Method | Endpoint | File gọi API | Handler | State liên quan | Ghi chú |
| --------- | ------ | -------- | ------------ | ------- | --------------- | ------- |

## State quan trọng

| State | File | Mục đích | Update ở đâu |
| ----- | ---- | -------- | ------------ |

## Filter/Search

| UI filter | Field gửi API | State | Handler | Ghi chú |
| --------- | ------------- | ----- | ------- | ------- |

## Button/Action

| UI cũ | Vị trí | Chức năng | Handler hiện tại | Có gọi API không | Modal/Route | Ghi chú |
| ----- | ------ | --------- | ---------------- | ---------------- | ----------- | ------- |

## Table/List Columns

| Cột | Field dữ liệu | Sort | Click | Action | Ghi chú |
| --- | ------------- | ---- | ----- | ------ | ------- |

## Modal/Drawer/Popup

| Tên | Mở từ đâu | State điều khiển | Chức năng | API |
| --- | --------- | ---------------- | --------- | --- |

## Pagination

| State page | State page size | Handler | API |
| ---------- | --------------- | ------- | --- |

## Chức năng trong mẫu nhưng code hiện tại chưa có

| Chức năng mẫu | Có logic/API cũ không | Cách xử lý |
| ------------- | --------------------- | ---------- |

## Rủi ro khi refactor

| Rủi ro | Cách tránh |
| ------ | ---------- |
```

Chỉ sau khi tạo xong file map mới được sửa UI.

---

# 4. Phase 3 - Phân tích mẫu giao diện

Dựa trên ảnh/html/link mẫu user cung cấp, rút ra:

- layout chính
- khu vực header/title
- tab
- filter/search
- action buttons
- table/list/card
- pagination
- modal/dropdown
- màu sắc
- spacing
- border
- font size
- hover state
- empty state
- loading state

Chỉ dùng mẫu để tham khảo bố cục và trải nghiệm.

Không copy nguyên HTML/CSS nếu không phù hợp với project.

Chức năng cũ quan trọng hơn giao diện mẫu.

---

# 5. Phase 4 - Refactor UI

Khi sửa UI:

- Giữ nguyên logic cũ.
- Giữ nguyên API cũ.
- Giữ nguyên handler cũ nếu đang hoạt động.
- Chỉ thay đổi markup/style/layout.
- Không hardcode dữ liệu.
- Không xóa loading/error/empty state.
- Không xóa permission check.
- Không làm mất validate form.
- Không làm mất confirm khi xóa/thao tác nguy hiểm.
- Không làm mất toast/notification.
- Không làm mất query params nếu trang đang dùng.
- Không làm mất selected rows nếu trước đó có.
- Không làm mất pagination/sort/filter.

Nếu project dùng Tailwind thì ưu tiên Tailwind.

Nếu project dùng CSS module/SCSS thì đi theo style hiện tại.

Nếu project dùng Ant Design/MUI/PrimeReact/shadcn thì dùng đúng hệ component hiện tại.

Không thêm thư viện mới nếu chưa hỏi user.

---

# 6. Phase 5 - Chức năng mẫu có nhưng code chưa có

Nếu mẫu có chức năng mới, ví dụ:

- Export
- Import
- In
- Xem chi tiết
- Dropdown thao tác
- Bulk action
- Bộ lọc nâng cao
- Sort mới
- Tab mới
- Cột dữ liệu mới

Thì xử lý như sau:

1. Kiểm tra code hiện tại có API/handler không.
2. Nếu có, nối lại đúng logic cũ.
3. Nếu chưa có, không tự bịa API.
4. Ghi vào file map.
5. Nếu cần backend/API mới, dừng lại hỏi user.
6. Có thể dựng UI disabled/placeholder nếu phù hợp.

---

# 7. Phase 6 - Kiểm tra sau khi sửa

Sau khi sửa, phải kiểm tra:

## Chung

- Route mở được.
- Không crash UI.
- Không lỗi console nghiêm trọng.
- Không gọi sai API.
- Không hardcode data.
- Loading state ổn.
- Empty state ổn.
- Error state ổn.
- Responsive không vỡ layout laptop.

## Filter/Search

- Nhập search hoạt động.
- Chọn filter hoạt động.
- Bấm lọc gọi đúng handler/API.
- Reset filter nếu có vẫn hoạt động.
- Payload gửi API đúng logic cũ.

## Table/List

- Dữ liệu render đúng.
- Field hiển thị đúng.
- Dữ liệu dài không vỡ layout.
- Link trong bảng vẫn click được.
- Checkbox dòng hoạt động nếu có.
- Checkbox chọn tất cả hoạt động nếu có.
- Sort hoạt động nếu trước đó có.
- Action từng dòng hoạt động.

## Pagination

- Next page hoạt động.
- Previous page hoạt động.
- Page size hoạt động nếu có.
- Tổng số bản ghi đúng nếu trước đó có.
- Không hardcode số trang.

## Button/Action

Với từng nút phải kiểm tra:

- Click có phản hồi đúng.
- Gọi đúng handler.
- Gọi đúng API nếu có.
- Mở đúng modal/dropdown nếu có.
- Chuyển đúng route nếu có.
- Hiện đúng toast/notification nếu có.
- Giữ đúng quyền truy cập.

## Modal/Form

Nếu có modal/form:

- Mở được.
- Đóng được.
- Submit hoạt động.
- Validate hoạt động.
- Edit đổ dữ liệu cũ đúng.
- Submit xong reload/update list đúng.
- Confirm vẫn hoạt động nếu có.

---

# 8. Phase 7 - Test/command

Nếu project đã có test framework, cập nhật hoặc viết test phù hợp.

Ưu tiên test:

1. Vào route.
2. Trang render đúng.
3. Filter/search chính tồn tại.
4. Bấm lọc.
5. Table/list render.
6. Pagination render.
7. Tab hoạt động nếu có.
8. Modal chính hoạt động nếu có.
9. Không có console error nghiêm trọng.

Nếu project chưa có test framework thì không tự cài mới.

Có thể chạy các command nếu project có:

- npm run lint
- npm run typecheck
- npm run test
- npm run build

Không chạy lệnh nguy hiểm.

Không xóa database.

Không reset migration.

Không seed data nếu user chưa yêu cầu.

---

# 9. ACT REPORT cuối

Báo cáo cuối theo format:

```md
# ACT REPORT - [PAGE_NAME] UI Refactor

## 1. Đã khảo sát

- Route:
- Component chính:
- File liên quan:
- API liên quan:
- File map chức năng đã tạo:

## 2. Đã sửa

| File | Nội dung sửa |
| ---- | ------------ |

## 3. Chức năng cũ đã giữ nguyên

- ...

## 4. Chức năng trong mẫu nhưng hệ thống hiện tại chưa có

- ...

## 5. Test/command đã chạy

| Command/Test | Kết quả |
| ------------ | ------- |

## 6. Manual checklist

- [ ] Route mở được
- [ ] Không crash UI
- [ ] Không console error nghiêm trọng
- [ ] API cũ vẫn gọi đúng
- [ ] Filter/search hoạt động
- [ ] Table/list render đúng
- [ ] Pagination hoạt động
- [ ] Button/action hoạt động
- [ ] Modal/dropdown hoạt động nếu có
- [ ] Không hardcode dữ liệu
- [ ] Không làm mất chức năng cũ

## 7. Lưu ý / rủi ro

- ...
```
