# PRODUCTS UI Function Map

## Route

- Path: `/products`
- Main component: `client/src/modules/product/ProductMainPage.tsx`
- Related files: `ProductsPage.tsx`, `ProductMainPage.tsx`, `components/ProductList.tsx`, `components/ProductHistory.tsx`, `products-page.css`, `core/api/product.api.ts`
- Layout/Auth/Permission: route is rendered inside `AppLayout`; no product-specific guard found in the client route.

## Tong quan trang

- Trang nay dung de quan ly danh sach san pham, them/sua/xoa, import, export, loc, sap xep va xem lich su.
- Khu vuc/tab chinh: tab `products` va tab `history` trong `ProductMainPage`.
- Chuc nang chinh: danh sach san pham, filter theo `q/status`, sort cot, pagination, modal detail/form/delete/import/export.
- Workspace in ma vach duoc render noi bo trong `ProductList`; khong co route rieng. Khi workspace nay mo, hero va tab cap trang phai an.

## API dang dung

| Chuc nang | Method | Endpoint | File goi API | Handler | State lien quan | Ghi chu |
| --------- | ------ | -------- | ------------ | ------- | --------------- | ------- |
| Load danh sach | GET | `/products/products` | `product.api.ts` | `load` | `items`, `total`, `page`, `appliedSearch`, `appliedStatus`, `sortField`, `sortOrder` | Giu nguyen params cu |
| Tao san pham | POST | `/products/products` | `product.api.ts` | `handleSave` | `editItem`, `saving`, `saveError`, `initialStocks` | Tao Product va ton kho ban dau theo kho trong cung transaction |
| Sua san pham | PATCH | `/products/products/:id` | `product.api.ts` | `handleSave` | `editItem`, `saving`, `saveError`, `stockAdjustment` | Cap nhat Product va toi da mot kho; khong nhan `qty` tong |
| Chi tiet ton kho theo kho | GET | `/products/products/:id/stocks` | `product.api.ts` | `ProductForm` effect | `productStocks`, `selectedStockWarehouseId` | Chi tra cac kho san pham da co ban ghi ton |
| Danh sach kho | GET | `/system/branches` | `ProductList.tsx` qua `http` | `ProductForm` effect | `branches`, `loadingBranches` | UI loc kho `isActive !== false` |
| Xoa san pham | DELETE | `/products/products/:id` | `product.api.ts` | `handleDelete` | `deleteItem` | Co confirm |
| Import | POST | `/products/products/import` | `ProductList.tsx` qua `http` | `ImportModal.handleImport` | `showImport`, `importResult` | Giu logic import cu |
| Export Excel | Client XLSX | Khong goi API khi export trang hien tai; GET `/products/products` khi export tat ca | `ProductList.tsx` | `handleExcelExport` | `showExportModal`, `exportLoading` | Giu logic export cu |
| Danh muc | GET | `/products/categories` | `product.api.ts` | bulk category modal | `categories`, `bulkCategoryId` | Dung API cu de lay option |
| Bulk status/category/delete | PATCH/DELETE tung dong | `/products/products/:id` | `product.api.ts` | bulk handlers | `selectedIds`, modal bulk | Khong tao API moi |
| Cau hinh ten cua hang khi in | GET | `/settings/store` | `ProductList.tsx` qua `http` | `BarcodePrintWorkspace` effect | `storeName`, `loadingStoreName` | Lay ten shop that, khong hardcode |

## State quan trong

| State | File | Muc dich | Update o dau |
| ----- | ---- | -------- | ------------ |
| `items`, `total` | `ProductList.tsx` | Du lieu bang va tong so | `load` |
| `draftSearch`, `draftStatus`, `appliedSearch`, `appliedStatus` | `ProductList.tsx` | Filter danh sach | form filter va `handleSearch` |
| `sortField`, `sortOrder` | `ProductList.tsx` | Sap xep bang | `handleSort` |
| `selectedIds` | `ProductList.tsx` | Cac dong duoc tich chon de thao tac | checkbox tung dong/chon tat ca |
| `showImport`, `showExportModal`, `showBarcodePrint` | `ProductList.tsx` | Dieu khien import/export/in ma vach | toolbar/dropdown thao tac |
| `showBulkStatusModal`, `showBulkCategoryModal` | `ProductList.tsx` | Modal doi trang thai/cap nhat danh muc | dropdown `Thao tac` |
| `branches`, `initialStocks`, `createOnMultipleWarehouses` | `ProductList.tsx` | Kho va ton kho ban dau khi tao san pham | `ProductForm` |
| `productStocks`, `selectedStockWarehouseId`, `stockQuantity` | `ProductList.tsx` | Tong ton va dieu chinh dung mot kho khi sua | `ProductForm` |
| `barcodeSearch` | `ProductList.tsx` | Loc cac san pham da chon ngay trong workspace in | input tim san pham |
| `barcodeType`, `paperId`, `showStore`, `showCode`, `showName`, `showThreeLineName`, `showPrice`, `showOldPrice`, `currencySuffix`, `marginLeft`, `marginTop` | `ProductList.tsx` | Cau hinh preview va tai lieu in | cac control trong workspace in |

## Filter/Search

| UI filter | Field gui API | State | Handler | Ghi chu |
| --------- | ------------- | ----- | ------- | ------- |
| Ten, ma san pham, barcode | `q` | `draftSearch` -> `appliedSearch` | `handleSearch` | Giu API cu |
| Trang thai | `status` | `draftStatus` -> `appliedStatus` | `handleSearch` | Giu API cu |
| Tim san pham de them vao danh sach in | `q`, `code`, `barcode` | `barcodeSearch`, `barcodeSearchResults` | debounce goi `productApi.getProducts`, gop ket qua va loai trung | Tim toan bo san pham; `q` cho ten/ma, `code` va `barcode` cho doi chieu chinh xac |

## Button/Action

| UI cu | Vi tri | Chuc nang | Handler hien tai | Co goi API khong | Modal/Route | Ghi chu |
| ----- | ------ | --------- | ---------------- | ---------------- | ----------- | ------- |
| Lam moi | Header | Reload data | `load` | GET products | Khong | Giu nguyen |
| Lich su | Header | Chuyen tab history | `onShowHistory` | Khong | Tab history | Giu nguyen |
| Import | Header | Mo import file | `setShowImport(true)` | POST khi submit | Import modal | Doi hien thi thanh dropdown `Nhap tu file` |
| Xuat Excel | Header | Mo export modal | `setShowExportModal(true)` | GET neu export tat ca | Export modal | Dua vao dropdown `Thao tac` |
| Them san pham | Header | Mo form tao | `setEditItem(null)` | POST khi submit | Product form | Doi text thanh `Them moi` |
| In ma vach | Dropdown thao tac | Mo man hinh in tem cho selected rows | `setShowBarcodePrint(true)` | Khong | Barcode print view | Chuc nang moi client-side |
| Quay lai danh sach | Header workspace in | Dong workspace in | `setShowBarcodePrint(false)` va callback parent | Khong | Quay lai list | Hien lai hero/tab |
| Xuat du lieu in | Dropdown workspace in | Xuat cac dong dang in | `exportRows` | Khong | File XLSX | Giu client-side |
| Xoa danh sach da chon | Dropdown workspace in | Xoa toan bo dong khoi workspace | `setRows([])` | Khong | Workspace in | Khong xoa san pham tren server |
| Tim/them san pham | Toolbar workspace in | Tim toan bo danh sach san pham va them vao bang in | `searchBarcodeProducts`, `addProductToPrint` | GET products | Dropdown ket qua | Click ket qua hoac Enter; san pham da co thi tang so luong tem |
| Quet barcode | Input tim kiem workspace in | May quet nhap barcode nhu ban phim va gui Enter | `handleBarcodeSearchKeyDown` | GET products | Dropdown ket qua | Khong can SDK neu may quet o che do keyboard wedge |
| So luong tem | Cot SL | Doi so nhan in tung san pham | `updateQty` | Khong | Khong | Toi thieu 1 |
| Xoa mot dong in | Cot Xoa | Bo san pham khoi danh sach in | `removeRow` | Khong | Khong | Khong xoa san pham tren server |
| Cau hinh tem | Sidebar workspace in | Doi barcode/noi dung hien thi | cac setter state | Khong | Preview truc tiep | Preview va tai lieu in phai dong bo |
| Chon kho giay | Sidebar workspace in | Chon mau giay | `setPaperId` | Khong | Khong | Dung template co san |
| Xem va in | Sidebar workspace in | Mo cua so in theo kho giay | `openPrintPreview` | Khong | Browser print window | Can cho phep popup |
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
| Print browser window | Nut `Xem va in` | Browser window | Render HTML theo state hien tai va goi `window.print()` | Client-side |

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
| Barcode/QR chuan | Co thu vien `@bwip-js/generic` | Render SVG chuan cho EAN-13, Code 128, Code 39 va QR; dung chung cho preview va tai lieu in |
| Gia rieng theo tung chi nhanh | Chua co mapping gia theo branch trong luong nay | Khong hien control gia theo chi nhanh gia; giu gia san pham hien tai |
| Dieu chinh ton kho trong form san pham | Co `ProductBranchStock` va `ProductLog` | Dung stock theo `productId + branchId`, ghi log `PRODUCT_EDIT_ADJUSTMENT`, khong tao module kho moi |

## Rui ro khi refactor

| Rui ro | Cach tranh |
| ------ | ---------- |
| Bulk action chay khi chua chon dong | Chan bang `selectedIds.size === 0` va thong bao |
| Tao endpoint moi sai yeu cau | Chi dung `productApi.updateProduct/deleteProduct/getCategories` co san |
| Mat logic import/export cu | Chi doi vi tri hien thi nut, giu modal/handler cu |
| In tem khong dung kho giay | Cho chon mau giay va dung kich thuoc mm khi tao trang in |
| Input/checkbox chi doi preview nhung khong doi ban in | Truyen day du state vao `buildPrintDocument` va test popup HTML |
| `window.open` tra ve `null` khi dung feature `noopener` | Mo cua so truoc, sau do tach `opener` va ghi tai lieu in |
| Hero/tab van hien trong workspace in | Bao state workspace len `ProductMainPage` va render hero co dieu kien |
| Barcode/QR client-side cu khong dam bao may quet doc duoc | Thay bang encoder chuan `@bwip-js/generic`; EAN-13 tu tinh lai check digit, du lieu khong du 12 so fallback Code 128 chuan |
| `Product.qty` lech voi tong cac kho | API danh sach/chi tiet tinh lai `qty` tu `ProductBranchStock`; moi thao tac tao/sua dong bo field tong trong transaction de giu tuong thich cac module cu |
| Sua mot kho lam reset kho khac | Payload chi cho phep mot `stockAdjustment.warehouseId`; backend chi update dung cap `productId + branchId` |
