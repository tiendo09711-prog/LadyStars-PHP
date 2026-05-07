# My ERP MERN Starter

Bản starter này chuyển hóa kiến trúc Polirium ERP Laravel/Livewire sang MERN stack theo hướng module hóa, không copy nguyên code PHP. Mục tiêu là giữ cấu trúc nghiệp vụ: product, sale/payment, stock, customer, vendor, accounting, task, print-forms.

## Stack

- MongoDB + Mongoose
- Express + Node.js + TypeScript
- React + Vite + React Router
- JWT auth
- Modular API routes theo từng domain

## Chạy local

```bash
cp .env.example .env
npm install
npm run seed
npm run dev
```

Admin mẫu sau khi seed:

```text
admin@myerp.local / 123456789
```

## Cấu trúc

```text
server/src/
├── core/                 # auth, middleware, crud factory
├── config/               # env, database
└── modules/
    ├── product/          # sản phẩm, tồn kho, bán hàng, kênh bán, giao hàng
    ├── customer/         # khách hàng, nhóm khách
    ├── vendor/           # nhà cung cấp, nhập hàng, trả hàng, chuyển kho
    ├── accounting/       # thu/chi, loại phiếu, người nhận/chi
    ├── task/             # project/task/kanban
    └── printForms/       # mẫu in

client/src/
├── core/                 # http client, layout
└── modules/              # màn hình React theo module
```

## Mapping từ Polirium Laravel sang MERN

| Polirium Laravel | MERN starter |
| --- | --- |
| `platform/modules/product` | `server/src/modules/product`, `client/src/modules/product` |
| `Product`, `ProductUnit`, `ProductElement` | `Product` schema có `units[]`, `elements[]` |
| `product_payments`, `product_payment_products` | `SalePayment` schema có `items[]` |
| `product_payment_deliveries` | `SalePayment.delivery` embedded document |
| `product_logs` morph table | `ProductLog` với `sourceType` + `sourceId` |
| `customers`, `customer_groups`, pivot | `Customer` + `CustomerGroup`, groups array |
| `vendors`, `vendor_purchases`, `vendor_transfers` | `Vendor`, `VendorPurchase`, `VendorTransfer` |
| Livewire datatable/modal | React pages/components + API CRUD |
| Laravel Sanctum | JWT middleware |
| migrations SQL | Mongoose schemas |

## Luồng bán hàng/tồn kho đã giữ lại

1. Tạo `SalePayment` trạng thái `draft`.
2. Thêm `items[]` gồm `productId`, `amount`, `value`, `discount`, `total`.
3. Gọi `POST /api/products/sales/:id/complete`.
4. Service `completeSalePayment()` trừ `Product.qty` và ghi `ProductLog`.

## Những phần cần phát triển tiếp để thành sản phẩm hoàn chỉnh

- RBAC/permission chi tiết giống hệ thống menu + permission của Polirium.
- Multi-branch inventory chuẩn: hiện starter giữ `branchId`, nhưng chưa tách tồn theo chi nhánh bằng collection riêng.
- Import/export Excel cho product, stock, purchase, customer.
- UI bán hàng POS hoàn chỉnh.
- Báo cáo doanh thu, công nợ, tồn kho thấp.
- Upload/media manager.
- Migration dữ liệu thật từ MySQL sang MongoDB.

## Rebrand thành sản phẩm của bạn

- Đổi `name` trong root `package.json`, `server/package.json`, `client/package.json`.
- Đổi tên hiển thị `My ERP` trong `client/src/core/layout/AppLayout.tsx`.
- Đổi biến database `MONGO_URI` trong `.env`.
- Thiết kế logo, màu thương hiệu, domain, tên module theo thị trường bạn muốn bán.

Lưu ý: Polirium dùng MIT License, bạn có thể sửa, dùng thương mại và rebrand, nhưng nên giữ phần thông báo license/copyright gốc nếu bạn phân phối lại phần có nguồn gốc từ dự án gốc.
