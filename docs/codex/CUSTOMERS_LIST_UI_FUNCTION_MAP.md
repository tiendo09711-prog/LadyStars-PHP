# CUSTOMERS_LIST UI Function Map

## Route

- Path: `/customers/list`
- Main component: `client/src/modules/customer/CustomerListPage.tsx`
- Related files:
  - `client/src/core/components/TabbedModulePage.tsx`
  - `client/src/core/components/DataModulePage.tsx`
  - `client/src/main.tsx`
  - `client/src/core/layout/AppLayout.tsx`
  - `client/src/modules/sales/RetailInvoiceCreatePage.tsx`
  - `client/src/modules/sales/WholesaleInvoiceCreatePage.tsx`
  - `client/src/modules/sales/RefundInvoiceCreatePage.tsx`
  - `server/src/modules/customer/customer.routes.ts`
  - `server/src/modules/customer/customer.models.ts`
  - `server/src/core/utils/crud.ts`
  - `server/src/modules/product/product.service.ts`
  - `server/src/modules/product/product.routes.ts`
  - `server/src/modules/orders/orders.models.ts`
  - `server/src/modules/orders/orders.routes.ts`
  - `server/src/core/middleware/auth.ts`
  - `server/src/app.ts`
  - `e2e/tests/customer-module.spec.ts`

## Tong quan trang hien tai

- `/customers/list` hien tai la mot `TabbedModulePage` gom 5 tab UI:
  - `all`
  - `high_value`
  - `birthday_high_value`
  - `frequent`
  - `inactive`
- Moi tab chi doi `endpoint=/customers/customers?tags=...`.
- Tab hien tai khong co filter nghiep vu that cho:
  - mua nhieu
  - mua nhieu + sinh nhat trong ky
  - mua thuong xuyen
  - lau chua mua
- Page hien tai co them nut `Dong bo chi so mua hang` goi `POST /customers/sync-metrics` roi `window.location.reload()`.
- UI dang dung CRUD generic nen:
  - search chi co `q`
  - filter nhanh chi co `status`
  - export chi la CSV local tren du lieu dang load
  - khong co preset/filter chips/advanced filter/persisted URL state

## API dang dung

| Chuc nang | Method | Endpoint | Noi goi | Ghi chu |
| --------- | ------ | -------- | ------- | ------- |
| Load list tab cu | GET | `/customers/customers?tags=...&page&limit&q` | `CustomerListPage -> DataModulePage` | `tags` chi la shortcut filter denormalized |
| Tao customer | POST | `/customers/customers` | `DataModulePage`, retail, wholesale, refund | Dung chung entity Customer |
| Sua customer | PATCH | `/customers/customers/:id` | `DataModulePage` | CRUD generic |
| Xoa customer | DELETE | `/customers/customers/:id` | `DataModulePage` | Hard delete, chua chan KH co lich su |
| Dong bo metrics | POST | `/customers/sync-metrics` | `CustomerListPage` | Recompute denormalized fields |
| Load nhom customer | GET | `/customers/groups` | route khac | Co model `CustomerGroup` |

## Model / schema dang co

### Customer (`server/src/modules/customer/customer.models.ts`)

- Truong co san:
  - `type`
  - `name`
  - `code`
  - `phone`
  - `phone2`
  - `email`
  - `birthday`
  - `sex`
  - `address`
  - `provinceId`
  - `districtId`
  - `wardId`
  - `company`
  - `vat`
  - `facebook`
  - `note`
  - `totalSpent`
  - `purchaseCount`
  - `points`
  - `lastPurchaseDate`
  - `daysSinceLastPurchase`
  - `tags`
  - `status`
  - `branchId`
  - `groups`
  - `userId`
- Chua co truong schema cho:
  - `cardId`
  - `customerLevel`
  - `purchaseProductQuantity`
  - `firstPurchaseDate`
  - `purchaseCycleDays`
  - `purchaseDayCount`

### Order (`server/src/modules/orders/orders.models.ts`)

- Co `customerName`, `customerPhone`
- Khong co `customerId`
- Vi vay don order hien tai khong lien ket cung source-of-truth Customer bang ID

### SalePayment / ProductRefund (`server/src/modules/product/product.models.ts`)

- `SalePayment` co `customerId`, `branchId`, `value`, `status`, `completedAt`, `items`
- `ProductRefund` co `paymentId`, `status`, `items`

## Rule thong ke khach hang da xac nhan tu code hien tai

- `POST /customers/sync-metrics` hien tai aggregate tu 2 nguon:
  - `Order`
    - match theo `customerPhone == customer.phone`, neu khong co thi fallback `customerName == customer.name`
    - chi tinh cac status: `Hoan thanh`, `In va dong goi`, `Dang chuyen`, `Da chuyen`
  - `SalePayment`
    - match theo `customerId`
    - chi tinh `status = completed`
- `completeSalePayment` hien tai tang truc tiep:
  - `totalSpent += payment.value`
  - `purchaseCount += 1`
  - `lastPurchaseDate = now`
  - `daysSinceLastPurchase = 0`
- `sales/:id/cancel` hien tai giam truc tiep:
  - `totalSpent -= payment.value`
  - `purchaseCount -= 1`
- `completeProductRefund` hien tai:
  - nhap lai ton kho
  - doi `SalePayment.status = refunded`
  - khong recompute lai customer metrics ngay tai cho
- Hien chua co rule hien huu cho:
  - `so luong san pham da mua`
  - `ngay mua dau`
  - `chu ky mua`
  - `ngay sinh trong khoang thang-ngay qua nam`

## Scope / permission hien tai

- Route `/api/customers` di qua `requireAuth`.
- `customer.routes.ts` co `scopedCustomerAccess`:
  - `ADMIN` xem/sua toan bo
  - `EMPLOYEE`
    - GET list/detail chi thay customer co `branchId` nam trong `assignedWarehouseIds/defaultWarehouseId/branchId`
    - POST/PATCH bi ep `branchId` vao scope nay
- Nhom khach (`/customers/groups`) va `sync-metrics` dang yeu cau `requireOwner`.
- Frontend khong co guard route rieng cho customer list, scope that nam o backend.

## State / handler hien tai

| State / handler | File | Muc dich |
| --------------- | ---- | -------- |
| `activeKey` | `TabbedModulePage.tsx` | Tab dang chon |
| `items/page/total/loading/error` | `DataModulePage.tsx` | Tai du lieu CRUD generic |
| `search/appliedSearch` | `DataModulePage.tsx` | Debounced text search generic |
| `quickFilter` | `DataModulePage.tsx` | Filter generic theo `status` |
| `showModal/editingId/form` | `DataModulePage.tsx` | Tao/sua customer trong modal generic |
| `handleSyncMetrics` | `CustomerListPage.tsx` | Goi sync-metrics va reload toan trang |
| `dbCustomers` | retail/wholesale/refund pages | Local cache customer de client-side search |

## Action hien tai tren trang cu

- Co that:
  - Them khach hang
  - Sua
  - Xoa
  - Search text generic
  - Dong bo chi so mua hang
  - Export CSV local
- Khong co hoac chua dung that cho `/customers/list`:
  - import Excel that
  - export Excel qua API that
  - bulk action nghiep vu
  - luu bo loc
  - cau hinh cot
  - detail customer route rieng

## Lien ket retail / wholesale / refund hien tai

### Retail

- Load customer bang `GET /customers/customers?limit=5000`
- Search khach bang filter client-side tren `dbCustomers`
- Luu don:
  - tim existing customer theo phone/name trong local array
  - neu khong co thi `POST /customers/customers`
  - sau do tao `POST /products/sales` va `POST /products/sales/:id/complete`
- Dang gui thua cac field chua co trong schema:
  - `dob`
  - `cardId`
  - `customerLevel`
  - `addressLocation`

### Wholesale

- Load customer bang `GET /customers/customers`
- Search chu yeu client-side
- Lookup phone bang `GET /customers/customers?phone=...`
- Neu khong co thi auto `POST /customers/customers`
- Sau do tao `POST /products/sales` va `POST /products/sales/:id/complete`
- Dang gui thua `cardId`, `dob`, `addressLocation`

### Refund

- Lookup customer bang `GET /customers/customers?phone=...`
- Co luong auto tao customer khi doi/tra hang kem mua moi
- Metrics sau refund hien chua duoc recompute day du ngay khi complete refund

## Cac van de data/UI cu da xac dinh

| Van de | Nguyen nhan |
| ------ | ---------- |
| 5 tab customer chi la UI, khong phai bo loc nghiep vu that | `tags` chi map vao field denormalized `Customer.tags` |
| Search/sort/filter hien tai khong dap ung preset va advanced filters | `crud.ts` chi support `q` text search va exact field filter don gian |
| Frontend retail/wholesale/refund gui field khong duoc schema luu | `Customer` schema chua co `cardId`, `customerLevel`, ... |
| Metrics customer co nguy co lech | mot phan update incrementally, mot phan recompute bang `sync-metrics`, refund chua update day du ngay |
| Order khong dung `customerId` | `Order` model chi luu `customerName`, `customerPhone` |
| `/customers/list` dang reload ca trang sau sync | `window.location.reload()` trong `handleSyncMetrics` |
| Khong co detail route customer | frontend chi co list/care/level/group placeholder |
| E2E customer hien tai dang test theo 5 tab cu | `e2e/tests/customer-module.spec.ts` |

## Mapping tab cu -> filter moi can giu tuong thich

- `?tab=all`
  - bo het dieu kien hanh vi mua hang
- `?tab=buyalot`
  - preset `Mua nhieu`
  - map `purchaseCountMin` tu query cu nhu `fromBills`
- `?tab=birthday`
  - preset `Mua nhieu, sinh nhat trong ky`
  - map `purchaseCountMin` + khoang `birthdayDayMonth`
- `?tab=buyregularly`
  - preset `Mua thuong xuyen`
  - map `purchaseCountMin` + `purchaseCycleDaysMax`
- `?tab=longtimereturn`
  - preset `Lau chua mua`
  - map `purchaseCountMin` + `purchaseCycleDaysMax` + `daysSinceLastPurchaseMin`

## Dinh huong refactor

- Bo hoan toan `TabbedModulePage` cho `/customers/list`
- Thay bang page rieng co:
  - header + result count
  - basic filters
  - advanced filters
  - preset nhanh thay cho 5 tab
  - filter chips
  - server-side sort/paging
  - bang mot trang duy nhat
- Giu entity Customer dung chung cho:
  - list
  - retail create
  - wholesale create
  - refund/exchange create
- Uu tien mo rong endpoint `GET /customers/customers` thay vi tao them endpoint moi khong can thiet
- Neu can bo sung metric fields/schema, chi them nhe vao `Customer` va recompute theo kien truc hien co
