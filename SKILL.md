# SKILL.md — LadyStars ERP · Antigravity Agent

> **Tech Stack:** React + TypeScript (client/src) · Node.js API :4000 (server/src) · MongoDB Atlas
> **Áp dụng cho:** Mọi tác vụ vibe code, sửa lỗi, tính năng mới.

---

## ★ QUY TẮC VÀNG (ĐỌC TRƯỚC KHI LÀM GÌ)

**1. Suy nghĩ trước, code sau** — Đọc và phân tích kỹ ngữ cảnh trước khi implement. Nếu mơ hồ → hỏi, không tự suy đoán.
**2. Tối thiểu code** — Viết đúng thứ được yêu cầu. Không thêm tính năng "phòng xa".
**3. Chỉ chạm vào đúng chỗ cần** — Không "cải tiện" code xung quanh, không refactor ngoài phạm vi.
**4. Thực thi có tiêu chí xác minh** — Mỗi bước phải có cách kiểm tra cụ thể.
**5. Tự động thực thi** — Suy nghĩ kỹ nội bộ rồi thực hiện ngay. **Không tạo file kế hoạch** (`implementation_plan.md`) hoặc yêu cầu user approve trước khi code. Nếu yêu cầu quá phức tạp/mơ hồ → hỏi ngắn gọn, không tạo plan dài.

---

## QUY TRÌNH THỰC THI (TỰ ĐỘNG)

### Bước 1 · Thu thập ngữ cảnh (thầm trong đầu)
- Đọc các file liên quan trực tiếp đến yêu cầu.
- Kiểm tra file phụ thuộc: routes, models, imports, CSS.
- File `.html` đính kèm → phân tích cấu trúc bảng/cột.
- File `.csv` đính kèm → xác định header, kiểu dữ liệu, mapping schema.
- **Nếu thiếu thông tin → hỏi user ngắn gọn, không tự giả định.**

### Bước 2 · Triển khai ngay
- Viết chuẩn TypeScript, tự import đúng dependency.
- **Giữ nguyên 100% cấu trúc code cũ** — chỉ thay phần được chỉ định.
- Không tự "tối ưu hóa" hay viết lại ngoài phạm vi yêu cầu.

### Bước 3 · Tự kiểm tra & Sửa lỗi
- Theo dõi Terminal `npm run dev` — nếu crash → đọc log → tự sửa.
- **Không hỏi user khi chưa thử tự sửa ít nhất 2 lần.**
- Chạy `npx tsc --noEmit` (client + server) trước khi bàn giao.

### Bước 4 · Báo cáo ngắn gọn
- Tóm tắt cô đọng những gì đã làm (không liệt kê dài dòng).
- Nêu rõ cách user kiểm tra kết quả (F5, click vào đâu, v.v.).

---

## 4 NGUYÊN TẮC KARPATHY (Nhúng vào mọi quyết định)

### K1 · Suy nghĩ trước khi code
- Nêu giả định tường minh trước khi implement.
- Nhiều cách giải thích → trình bày, không tự chọn im lặng.
- Cách đơn giản hơn tồn tại → nói ra, đề xuất.
- Không rõ → DỪNG. Đặt tên điều chưa rõ. Hỏi.

### K2 · Tối giản trước tiên
- Không có tính năng nào ngoài yêu cầu.
- Không abstract hóa code chỉ dùng 1 lần.
- Không "linh hoạt" / "có thể cấu hình" nếu không được yêu cầu.
- 200 dòng mà có thể viết 50 → viết lại thành 50.
- **Tự hỏi:** *"Senior engineer sẽ nói đây là overcomplicated không?"* Nếu có → đơn giản hóa.

### K3 · Thay đổi phẫu thuật
- Không "cải tiện" code kề bên, comment, hay format.
- Không refactor những thứ không hỏng.
- Khớp style hiện có, dù bạn làm khác đi.
- Phát hiện dead code không liên quan → mention, không xóa.
- Xóa import/variable do THAY ĐỔI CỦA BẠN tạo ra và không còn dùng.
- **Kiểm tra:** Mỗi dòng thay đổi phải trace trực tiếp về yêu cầu của user.

### K4 · Thực thi theo mục tiêu
- Biến task thành tiêu chí xác minh được:
  - "Sửa lỗi" → "Xác nhận lỗi tái hiện được → sửa → xác nhận không còn lỗi"
  - "Thêm tính năng" → "Định nghĩa input/output mong đợi → implement → verify"

---

## UI · DESIGN PRINCIPLES (Vibe Coding UI)

Khi tạo/sửa giao diện, agent PHẢI tuân theo design system hiện có của LadyStars:
- **Không tự ý đổi màu sắc, font, spacing** so với các component đang có.
- Tham chiếu component hiện có trong `client/src/core/components/` trước khi tạo mới.
- UI mới phải visual-consistent với toàn bộ app (kiểm tra các page tương tự).
- Ưu tiên reuse component có sẵn; tạo mới chỉ khi không có gì phù hợp.
- Mọi table, form, modal → dùng pattern đang dùng trong codebase.

---

## BẢNG THAM CHIẾU NHANH

| Tình huống | Hành động |
|---|---|
| Yêu cầu mơ hồ | Hỏi ngắn gọn trước, không tự giả định |
| Muốn thêm tính năng "hay" không được yêu cầu | KHÔNG làm |
| Thấy code lỗi không liên quan | Mention, không sửa |
| Crash sau thay đổi | Tự sửa 2 lần trước khi hỏi |
| Không biết dùng component nào | Tìm trong `core/components/` trước |
| Tạo UI mới | Xem page tương tự, khớp style |
| Mọi yêu cầu bình thường | Suy nghĩ → thực thi ngay → báo cáo ngắn |