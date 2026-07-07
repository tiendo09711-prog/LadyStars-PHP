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
npm.cmd run dev:php
```

- Laravel backend: http://127.0.0.1:8000
- React client: http://localhost:5173

## Build frontend

```powershell
npm.cmd run build
```

## Test backend Laravel

```powershell
npm.cmd run test:backend
```

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
