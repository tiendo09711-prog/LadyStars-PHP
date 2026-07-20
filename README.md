# LadyStars PHP

Ứng dụng quản lý bán hàng: **Laravel + MySQL** (API) và **React + Vite** (frontend).

## Cấu trúc

```
LadyStars-PHP/
├─ backend/          Laravel API + MySQL
├─ client/           React frontend (Vite)
├─ docs/             Tài liệu mapping import legacy (Excel)
├─ scripts/          Script kiểm tra static
├─ package.json      Script chạy local
└─ README.md
```

## Yêu cầu môi trường

- PHP 8.3+
- Composer
- MySQL 8.x
- Node.js 20+

## Chạy local

```powershell
npm.cmd run dev
```

- Laravel backend: http://127.0.0.1:8000
- React client: http://localhost:5173
- Client dùng `VITE_API_URL=/api` + Vite proxy → Laravel → MySQL

### Truy cập từ điện thoại / máy khác cùng Wi‑Fi

1. Chạy `npm.cmd run dev` trên PC.
2. Xem dòng **Network** trong terminal Vite, ví dụ `http://192.168.x.x:5173/`.
3. Mở đúng URL đó trên thiết bị (cùng mạng Wi‑Fi).
4. Cho phép Windows Firewall inbound TCP port **5173** (và **8000** nếu gọi API trực tiếp).

## Build frontend

```powershell
npm.cmd run build
```

## Test backend Laravel

```powershell
npm.cmd run test:backend
```

## Kiểm tra static

```powershell
npm.cmd run verify:static
```

## Import dữ liệu legacy (Excel)

Xem `docs/legacy_import_mapping.md`.

```powershell
cd backend
php artisan migrate:fresh          # WARNING: xóa DB
php artisan import:legacy-data --dry-run --limit=20
php artisan import:legacy-data --force   # sau khi backup thủ công
php artisan import:legacy-data --verify
```

## Ghi chú

- Frontend dùng React + Vite; production build ra `client/dist`.
- Production hosting: document root trỏ `backend/public`, database MySQL, PHP 8.3+.
