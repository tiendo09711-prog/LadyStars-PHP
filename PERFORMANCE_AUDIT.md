# LadyStars Performance Audit

## Mục tiêu

- Danh sách lớn mặc định 15 dòng/trang.
- Không tải 1.000-5.000 dòng chỉ để hiển thị một bảng.
- Request cũ phải được hủy khi filter thay đổi.
- Dashboard tự cập nhật nhưng không tạo “bão request”.
- Cache Redis là tùy chọn, có fallback bộ nhớ để deploy không phụ thuộc Redis.

## Baseline đã đo

| Hạng mục | Kết quả |
| --- | --- |
| Dashboard API tuần tự, đã warm | median khoảng 292 ms |
| 10 dashboard request đồng thời | 2,2-2,47 giây/request |
| Request chồng/cold start quan sát được | 4,5-17,2 giây |
| MongoDB ping | 57-62 ms |
| Aggregate chính trực tiếp trên MongoDB | 59-182 ms |
| Payload dashboard | khoảng 4-8 KB |

## Hotspot chính

- `DashboardPage` phát hai request giống nhau trong development do React StrictMode; cleanup cũ không hủy HTTP request.
- Mỗi filter dashboard tải lại toàn bộ dashboard, dù chỉ một vùng thay đổi.
- Không có auto refresh; người dùng có cảm giác dữ liệu “không đổi”.
- CRUD dùng chung mặc định có thể trả tới 1.000 dòng.
- Nhiều trang custom gọi `limit=5000`.
- Một số export tải mọi page song song, tạo burst request.
- Nhiều truy vấn theo `createdAt`, `status`, `branchId` chưa có compound index.

## Chiến lược triển khai

1. Cache:
   - Redis qua `REDIS_URL`.
   - Fallback memory cache TTL ngắn nếu Redis không cấu hình hoặc mất kết nối.
   - Cache list CRUD nhỏ và dashboard.
   - Tự xóa cache CRUD theo model sau mutation.
2. Dashboard:
   - Abort request cũ.
   - Debounce thay đổi filter.
   - Auto refresh có kiểm soát.
   - Cache TTL ngắn và cho phép manual refresh bỏ qua cache.
3. Pagination:
   - Shared CRUD table: 15 dòng/trang server-side.
   - Các trang custom lớn: chuyển limit hiển thị về 15.
   - Lookup/import/export được xem xét riêng vì có thể cần tập dữ liệu đầy đủ.
4. Database:
   - Thêm index cho các trường lọc/sort dashboard và danh sách lớn.

## Nguyên tắc deploy

- Không có `REDIS_URL`: server vẫn chạy bằng memory cache.
- Redis lỗi: request tự fallback, không làm API crash.
- Cache TTL ngắn để dữ liệu vận hành không bị cũ lâu.
- Không chạy `npm audit fix --force` vì có nguy cơ breaking change.
