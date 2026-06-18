# PRODUCTS UI Function Map

## Route

- Path: `/products`
- Main component: `client/src/modules/product/ProductMainPage.tsx`
- Related files: `ProductsPage.tsx`, `components/ProductList.tsx`, `components/ProductHistory.tsx`, `products-page.css`, `core/api/product.api.ts`
- Layout/Auth/Permission: route is rendered inside `AppLayout`; no product-specific guard found in the client route.

## Tong quan trang

- Trang nay dung de quan ly danh sach san pham, them/sua/xoa, import, export, loc, sap xep va xem lich su.
- Khu vuc/tab chinh: tab `products` va tab `history` trong `ProductMainPage`.
- Chuc nang chinh: danh sach san pham, filter theo `q/status`, sort cot, pagination, modal detail/form/delete/import/export.

## API dang dung

| Chuc nang | Method | Endpoint | File goi API | Handler | State lien quan | Ghi chu |
| --------- | ------ | -------- | ------------ | ------- | --------------- | ------- |
| Load danh sach | GET | `/products/products` | `product.api.ts` | `load` | `items`, `total`, `page`, `appliedSearch`, `appliedStatus`, `sortField`, `sortOrder` | Giu nguyen params cu |
| Tao san pham | POST | `/products/products` | `product.api.ts` | `handleSave` | `editItem`, `saving`, `saveError` | Khong gui ton kho tai form |
| Sua san pham | PATCH | `/products/products/:id` | `product.api.ts` | `handleSave` | `editItem`, `saving`, `saveError` | Dung endpoint cu |
| Xoa san pham | DELETE | `/products/products/:id` | `product.api.ts` | `handleDelete` | `deleteItem` | Co confirm |
| Import | POST | `/products/products/import` | `ProductList.tsx` qua `http` | `ImportModal.handleImport` | `showImport`, `importResult` | Giu logic import cu |
| Export Excel | Client XLSX | Khong goi API khi export trang hien tai; GET `/products/products` khi export tat ca | `ProductList.tsx` | `handleExcelExport` | `showExportModal`, `exportLoading` | Giu logic export cu |
| Danh muc | GET | `/products/categories` | `product.api.ts` | bulk category modal | `categories`, `bulkCategoryId` | Dung API cu de lay option |
| Bulk status/category/delete | PATCH/DELETE tung dong | `/products/products/:id` | `product.api.ts` | bulk handlers | `selectedIds`, modal bulk | Khong tao API moi |

## State quan trong

| State | File | Muc dich | Update o dau |
| ----- | ---- | -------- | ------------ |
| `items`, `total` | `ProductList.tsx` | Du lieu bang va tong so | `load` |
| `draftSearch`, `draftStatus`, `appliedSearch`, `appliedStatus` | `ProductList.tsx` | Filter danh sach | form filter va `handleSearch` |
| `sortField`, `sortOrder` | `ProductList.tsx` | Sap xep bang | `handleSort` |
| `selectedIds` | `ProductList.tsx` | Cac dong duoc tich chon de thao tac | checkbox tung dong/chon tat ca |
| `showImport`, `showExportModal`, `showBarcodePrint` | `ProductList.tsx` | Dieu khien import/export/in ma vach | toolbar/dropdown thao tac |
| `showBulkStatusModal`, `showBulkCategoryModal` | `ProductList.tsx` | Modal doi trang thai/cap nhat danh muc | dropdown `Thao tac` |

## Filter/Search

| UI filter | Field gui API | State | Handler | Ghi chu |
| --------- | ------------- | ----- | ------- | ------- |
| Ten, ma san pham, barcode | `q` | `draftSearch` -> `appliedSearch` | `handleSearch` | Giu API cu |
| Trang thai | `status` | `draftStatus` -> `appliedStatus` | `handleSearch` | Giu API cu |

## Button/Action

| UI cu | Vi tri | Chuc nang | Handler hien tai | Co goi API khong | Modal/Route | Ghi chu |
| ----- | ------ | --------- | ---------------- | ---------------- | ----------- | ------- |
| Lam moi | Header | Reload data | `load` | GET products | Khong | Giu nguyen |
| Lich su | Header | Chuyen tab history | `onShowHistory` | Khong | Tab history | Giu nguyen |
| Import | Header | Mo import file | `setShowImport(true)` | POST khi submit | Import modal | Doi hien thi thanh dropdown `Nhap tu file` |
| Xuat Excel | Header | Mo export modal | `setShowExportModal(true)` | GET neu export tat ca | Export modal | Dua vao dropdown `Thao tac` |
| Them san pham | Header | Mo form tao | `setEditItem(null)` | POST khi submit | Product form | Doi text thanh `Them moi` |
| In ma vach | Dropdown thao tac | Mo man hinh in tem cho selected rows | `setShowBarcodePrint(true)` | Khong | Barcode print view | Chuc nang moi client-side |
| Doi trang thai san pham | Dropdown thao tac | PATCH tung san pham da chon | Bulk status handler | PATCH products | Modal | Can co selected rows |
| Xoa cac dong da chon | Dropdown thao tac | DELETE tung san pham da chon | Bulk delete handler | DELETE products | Confirm browser | Can co selected rows |
| Cap nhat danh muc | Dropdown thao tac | PATCH `categoryId/categoryName` tung san pham da chon | Bulk category handler | PATCH products | Modal | Can co selected rows |

## Table/List Columns

| Cot | Field du lieu | Sort | Click | Action | Ghi chu |
| --- | ------------- | ---- | ----- | ------ | ------- |
| Checkbox | `_id` | Khong | Chon dong | Bulk action | Can dung cho thao tac |
| Ma SP | `code` | Co | Header sort | Khong | Giu nguyen |
| Ten san pham | `name`, `categoryName` | Co | Header sort | Khong | Giu nguyen |
| Ma vach | `barcode` | Co | Header sort | Khong | Giu nguyen |
| Gia von | `cost` | Co | Header sort | Khong | Giu nguyen |
| Gia ban | `price` | Co | Header sort | Khong | Giu nguyen |
| Tong ton | `qty` | Co | Header sort | Khong | Giu nguyen |
| Trang thai | `status` | Co | Header sort | Khong | Badge |
| Thao tac dong | `_id` | Khong | Detail/edit/delete | Detail modal/form/delete confirm | Giu nguyen |

## Modal/Drawer/Popup

| Ten | Mo tu dau | State dieu khien | Chuc nang | API |
| --- | --------- | ---------------- | --------- | --- |
| Detail modal | Icon xem | `detailItem` | Xem chi tiet | Khong |
| Product form | Them/sua | `editItem` | Tao/sua san pham | POST/PATCH products |
| Delete confirm | Icon xoa | `deleteItem` | Xoa 1 san pham | DELETE products |
| Import modal | Dropdown Them moi | `showImport` | Nhap file | POST `/products/products/import` |
| Export modal | Dropdown Thao tac | `showExportModal` | Xuat Excel | Client XLSX/GET products |
| Bulk status modal | Dropdown Thao tac | `showBulkStatusModal` | Doi trang thai selected rows | PATCH products |
| Bulk category modal | Dropdown Thao tac | `showBulkCategoryModal` | Cap nhat danh muc selected rows | PATCH products |
| Barcode print view | Dropdown Thao tac | `showBarcodePrint` | In tem selected rows | Client-side |

## Pagination

| State page | State page size | Handler | API |
| ---------- | --------------- | ------- | --- |
| `page` | `limit = 15` | `setPage` tu `Pagination` | GET `/products/products` |

## Chuc nang trong mau nhung code hien tai chua co

| Chuc nang mau | Co logic/API cu khong | Cach xu ly |
| ------------- | --------------------- | ---------- |
| Bulk delete 1 request | Khong | Goi tuan tu DELETE endpoint cu sau confirm |
| Bulk status 1 request | Khong | Goi tuan tu PATCH endpoint cu |
| Bulk category 1 request | Khong | Goi tuan tu PATCH endpoint cu |
| In ma vach | Khong co backend/API | Dung selected rows hien co, render barcode va mo cua so in client-side |
| QR code that su | Khong co thu vien/API | Hien tuy chon UI, render ma dang luoi client-side; khong them thu vien moi |

## Rui ro khi refactor

| Rui ro | Cach tranh |
| ------ | ---------- |
| Bulk action chay khi chua chon dong | Chan bang `selectedIds.size === 0` va thong bao |
| Tao endpoint moi sai yeu cau | Chi dung `productApi.updateProduct/deleteProduct/getCategories` co san |
| Mat logic import/export cu | Chi doi vi tri hien thi nut, giu modal/handler cu |
| In tem khong dung kho giay | Cho chon mau giay va dung kich thuoc mm khi tao trang in |
