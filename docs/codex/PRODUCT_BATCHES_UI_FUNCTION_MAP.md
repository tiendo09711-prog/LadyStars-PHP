# PRODUCT_BATCHES UI Function Map

## Route

- Path: `/products/batches`
- Main component: `client/src/modules/product/BatchPage.tsx`
- Related files:
  - `client/src/main.tsx`
  - `client/src/core/api/product.api.ts`
  - `client/src/core/components/Pagination.tsx`
  - `e2e/tests/product-batches.spec.ts`
- Layout/Auth/Permission: render inside `AppLayout`, khong thay guard/permission rieng cho route nay

## Tong quan trang

- Trang nay dung de quan ly danh sach lo san pham, han dung, so luong ton va thong tin chi tiet tung lo
- Khu vuc chinh:
  - Page heading
  - Filter/search
  - Toolbar action
  - Data table
  - Pagination
  - Detail/Create-Edit/Delete/Import modal
- Chuc nang chinh:
  - Tai danh sach lo
  - Tim kiem theo `q`
  - Loc theo `status`
  - Sort theo cot
  - Phan trang
  - Tao/Sua/Xoa lo
  - Xem chi tiet lo
  - Import file lo
  - Export CSV

## API dang dung

| Chuc nang | Method | Endpoint | File goi API | Handler | State lien quan | Ghi chu |
| --------- | ------ | -------- | ------------ | ------- | --------------- | ------- |
| Load danh sach lo | GET | `/products/batches` | `client/src/core/api/product.api.ts` | `load`, `handleExport` | `items`, `total`, `loading` | Dung `page`, `limit`, `q`, `status`, `sort`, `order` |
| Xem chi tiet 1 lo | GET | `/products/batches/:id` | `client/src/core/api/product.api.ts` | Khong goi truc tiep trong page hien tai | `detailItem` | Modal dang dung du lieu tu list |
| Tao lo | POST | `/products/batches` | `client/src/core/api/product.api.ts` | `handleSave` | `saving`, `saveError`, `editItem` | Giữ payload form cu |
| Sua lo | PATCH | `/products/batches/:id` | `client/src/core/api/product.api.ts` | `handleSave` | `saving`, `saveError`, `editItem` | Giữ logic cu |
| Xoa lo | DELETE | `/products/batches/:id` | `client/src/core/api/product.api.ts` | `handleDelete` | `deleteItem` | Confirm truoc khi xoa |
| Import lo | POST | `/products/batches/import` | `client/src/core/api/product.api.ts` | `handleImport` trong `ImportModal` | `showImport`, `importing`, `msg`, `errors` | Upload `FormData` |
| Load dropdown san pham | GET | `/products/products` | `client/src/core/api/product.api.ts` | `useEffect` trong `BatchForm` | `products`, `loadingProducts` | Dung khi tao/sua lo |

## State quan trong

| State | File | Muc dich | Update o dau |
| ----- | ---- | -------- | ------------ |
| `items` | `BatchPage.tsx` | Du lieu bang lo san pham | `load` |
| `loading` | `BatchPage.tsx` | Trang thai tai danh sach | `load` |
| `search` | `BatchPage.tsx` | Gia tri tim kiem gui `q` | input search, `handleSearch` |
| `filterStatus` | `BatchPage.tsx` | Loc trang thai gui `status` | quick filter/button, `load` |
| `sortField` | `BatchPage.tsx` | Cot sort hien tai | `handleSort` |
| `sortOrder` | `BatchPage.tsx` | Chieu sort hien tai | `handleSort` |
| `page` | `BatchPage.tsx` | Trang hien tai | `Pagination`, `handleSearch`, filter |
| `total` | `BatchPage.tsx` | Tong ban ghi | `load` |
| `detailItem` | `BatchPage.tsx` | Mo dong modal chi tiet | nut `Chi tiet` |
| `editItem` | `BatchPage.tsx` | Mo modal tao/sua | nut `Them lo hang`, `Sua` |
| `deleteItem` | `BatchPage.tsx` | Mo modal xoa | nut `Xoa` |
| `showImport` | `BatchPage.tsx` | Mo modal import | nut `Import` |
| `saving` | `BatchPage.tsx` | Trang thai submit form | `handleSave` |
| `saveError` | `BatchPage.tsx` | Loi form tao/sua | `handleSave` |
| `form` | `BatchPage.tsx` | Du lieu form batch | `BatchForm` |
| `products` | `BatchPage.tsx` | Option san pham trong form | `BatchForm useEffect` |

## Filter/Search

| UI filter | Field gui API | State | Handler | Ghi chu |
| --------- | ------------- | ----- | ------- | ------- |
| O tim kiem so lo | `q` | `search` | `handleSearch` | Submit form moi goi load |
| Loc trang thai | `status` | `filterStatus` | click quick filter + `load` | reset page ve 1 |

## Button/Action

| UI cu | Vi tri | Chuc nang | Handler hien tai | Co goi API khong | Modal/Route | Ghi chu |
| ----- | ------ | --------- | ---------------- | ---------------- | ----------- | ------- |
| `Lam moi` | Toolbar | Tai lai danh sach | `load` | Co | Khong | Giữ logic cu |
| `Import` | Toolbar | Mo import modal | `setShowImport(true)` | Sau submit co | `ImportModal` | |
| `Xuat Excel` | Toolbar | Export CSV tu data batches | `handleExport` | Co | Download file | Khong dung API export rieng |
| `Them lo hang` | Toolbar | Mo modal tao moi | `setEditItem(null)` | Khi submit co | `BatchForm` | |
| `Tim kiem` | Khu filter | Tim kiem theo `q` | `handleSearch` | Co | Khong | |
| Quick filter trang thai | Khu filter | Loc theo `status` | `setFilterStatus`, `setPage(1)` | Co | Khong | |
| `Chi tiet` | Tung dong bang | Mo chi tiet lo | `setDetailItem(item)` | Khong | `DetailModal` | |
| `Sua` | Tung dong bang | Mo form sua | `setEditItem(item)` | Khi submit co | `BatchForm` | |
| `Xoa` | Tung dong bang | Confirm xoa | `setDeleteItem(item)` | Khi confirm co | `DeleteConfirm` | |
| `Dong`/`Huy`/`Cap nhat`/`Tao lo san pham` | Trong modal | Dong va submit modal | `onClose`, `onSave`, `onConfirm` | Co tuy action | Modal | |

## Table/List Columns

| Cot | Field du lieu | Sort | Click | Action | Ghi chu |
| --- | ------------- | ---- | ----- | ------ | ------- |
| Checkbox | khong gan state | Khong | Khong | UI only | Hien tai chua co selected rows logic |
| So lo | `batchNumber` | Co | Khong | Khong | |
| Ten san pham | `productId.name`, `productId.code` | Khong | Khong | Khong | |
| Gia nhap | `cost` | Co | Khong | Khong | |
| So ton | `qty` | Co | Khong | Khong | |
| Ngay SX | `manufactureDate` | Co | Khong | Khong | |
| Ngay het han | `expiryDate` | Co | Khong | Khong | |
| So ngay con han | tinh tu `expiryDate` | Khong | Khong | Khong | |
| Trang thai | `status` | Co | Khong | Khong | Badge mau |
| Thao tac | N/A | Khong | Co qua button | `Chi tiet/Sua/Xoa` | |

## Modal/Drawer/Popup

| Ten | Mo tu dau | State dieu khien | Chuc nang | API |
| --- | --------- | ---------------- | --------- | --- |
| `DetailModal` | Nut `Chi tiet` | `detailItem` | Xem thong tin chi tiet lo | Khong |
| `BatchForm` | Nut `Them lo hang` / `Sua` | `editItem` | Tao/Sua lo | `createBatch`, `updateBatch`, `getProducts` |
| `DeleteConfirm` | Nut `Xoa` | `deleteItem` | Confirm xoa lo | `deleteBatch` |
| `ImportModal` | Nut `Import` | `showImport` | Import file lo | `importBatches` |

## Pagination

| State page | State page size | Handler | API |
| ---------- | --------------- | ------- | --- |
| `page` | `limit = 20` | `setPage` qua `Pagination` | `getBatches` |

## Chuc nang trong mau nhung code hien tai chua co

| Chuc nang mau | Co logic/API cu khong | Cach xu ly |
| ------------- | --------------------- | ---------- |
| Filter rieng theo ID | Khong thay state/API rieng | Khong tu them API; chi tham khao layout |
| Filter rieng theo ten lo | Dang gom trong `q` | Co the doi nhan UI nhung giu handler cu |
| Filter rieng theo san pham | Khong thay state/API rieng trong page list | Neu can hien thi thi phai disabled/placeholder, khong duoc goi API moi |
| Bulk delete dong da chon | Khong co selected rows state/handler | Khong tu them logic moi |

## Rui ro khi refactor

| Rui ro | Cach tranh |
| ------ | ---------- |
| Vo locator e2e hien tai do doi text/button | Giu nguyen label/role quan trong cho button va modal |
| Mat logic search/filter/sort khi doi layout | Tai su dung state + handler cu, khong doi payload API |
| Mat modal actions khi doi markup | Giu nguyen condition render va callback cu |
| Them filter mau nhung khong co logic backend | Khong tao API/state moi, chi layout theo nhung gi dang co |
