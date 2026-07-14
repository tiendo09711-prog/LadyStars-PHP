# LadyStars PHP

Dự án chuyển đổi từ MERN stack sang Laravel + MySQL, giữ React client.

## Cấu trúc

```
LadyStars-PHP/
├─ backend/          Laravel API + MySQL
│  └─ scripts/       Script migrate/audit Mongo -> MySQL (tạm thời)
├─ client/           React frontend (Vite)
├─ backups/          Backup dữ liệu
├─ reference/        Tài liệu đối chiếu nghiệp vụ
├─ artifacts/        Báo cáo/backfill tạm
├─ scripts/          Script kiểm tra static
├─ package.json      Script chạy local gọn
└─ README.md
```

## Yêu cầu môi trường

- PHP 8.3+
- Composer
- MySQL 8.x (Laragon)
- Node.js 20+

## Chạy local

Chạy cả Laravel backend và React client cùng lúc:

```powershell
npm.cmd run dev
```

- Laravel backend: http://127.0.0.1:8000 (bind `0.0.0.0`, LAN cũng gọi được)
- React client: http://localhost:5173
- Client dùng `VITE_API_URL=/api` + Vite proxy → Laravel → MySQL trên máy PC

### Truy cập từ điện thoại / máy khác cùng Wi‑Fi

1. Chạy `npm.cmd run dev` trên PC.
2. Xem dòng **Network** trong terminal Vite, ví dụ `http://192.168.x.x:5173/`.
3. Mở đúng URL đó trên thiết bị (cùng mạng Wi‑Fi, không dùng Guest Wi‑Fi isolation).
4. Nếu không mở được trang: cho phép **Windows Firewall** inbound TCP port **5173** (và **8000** nếu gọi API trực tiếp).
5. Không cần mở MySQL ra LAN — phone chỉ gọi frontend; backend trên PC kết nối MySQL local.

## Build frontend

```powershell
npm.cmd run build
```

## Test backend Laravel

```powershell
npm.cmd run test:backend
```

## Playwright E2E

Install the pinned Chromium browser after a fresh dependency install:

```powershell
npm.cmd run e2e:install
```

Run E2E tests headless or with a visible Chromium window:

```powershell
npm.cmd run e2e
npm.cmd run e2e:headed
```

Playwright starts isolated test servers on ports `18000` and `15173`. The backend
launcher overrides the local database settings with SQLite in-memory and uses
array-backed session/cache drivers, so the read-only smoke test never connects to
the development MySQL database. Open the latest HTML report with
`npm.cmd run e2e:report`.

## Legacy data import (from Excel exports)

See `docs/legacy_import_mapping.md` for full details + column mapping.

```powershell
cd backend
php artisan migrate:fresh          # WARNING: wipes DB
php artisan import:legacy-data --dry-run --limit=20
php artisan import:legacy-data --force   # after manual backup
php artisan import:legacy-data --verify
```

Only keeps `admin@gmail.com` / `123456`. Uses phpspreadsheet for reading.
```

## Kiểm tra static

```powershell
npm.cmd run verify:static
```

## Migrate / audit dữ liệu Mongo -> MySQL

```powershell
npm.cmd run migrate:mongo-mysql -- --apply
npm.cmd run audit:mongo-mysql
```

## Ghi chú

- Frontend vẫn dùng React + Vite, chưa chuyển sang Blade/Livewire.
- Script migrate/audit Mongo -> MySQL giữ tạm để đồng bộ dữ liệu.
