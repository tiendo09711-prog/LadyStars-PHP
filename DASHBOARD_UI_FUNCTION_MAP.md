# DASHBOARD UI Function Map

## Route

- Path: `/`
- Main component: `client/src/modules/dashboard/DashboardPage.tsx`
- Related files: `client/src/main.tsx`, `client/src/core/layout/AppLayout.tsx`, `client/src/modules/dashboard/dashboard.css`
- Layout/Auth/Permission: route is rendered inside `AppLayout`; `AppLayout` calls `/auth/me` before rendering the nested outlet.

## Tong quan trang

- Trang nay dung de: xem nhanh doanh thu, don hang, bieu do, giao dich gan nhat, san pham ban chay va ton kho.
- Khu vuc/tab chinh: filter cua hang/ngay, chip tom tat filter, summary cards, bieu do, giao dich gan nhat, don hang, san pham ban chay, ton kho.
- Chuc nang chinh: load dashboard theo filter, tu dong cap nhat theo interval, luu trang thai filter thoi gian, reset filter, doi khoang thoi gian bieu do/don hang/top san pham, loc giao dich gan nhat client-side, mo modal chi tiet san pham theo ngay khi click bieu do.

## API dang dung

| Chuc nang | Method | Endpoint | File goi API | Handler | State lien quan | Ghi chu |
| --------- | ------ | -------- | ------------ | ------- | --------------- | ------- |
| Load dashboard | GET | `/dashboard?stores=&date=&chartRange=&orderRange=&topRange=&topLimit=` | `DashboardPage.tsx` | `useEffect` theo filter va `refreshKey` | `data`, `loading`, `error` | Giu nguyen endpoint, payload query va response mapping. |
| Auto refresh dashboard | GET | `/dashboard?...` | `DashboardPage.tsx` | `setInterval` tang `refreshKey` moi 15 giay | `refreshKey` | Khong hien thi block manual sync vi he thong da tu cap nhat realtime. |
| Chi tiet san pham theo ngay | GET | `/dashboard/daily-products?date=&stores=` | `DashboardPage.tsx` | `openDailyProducts` | `selectedDate`, `showDailyModal`, `dailyProducts`, `dailyLoading` | Mo khi click bieu do. |

## State quan trong

| State | File | Muc dich | Update o dau |
| ----- | ---- | -------- | ------------ |
| `data` | `DashboardPage.tsx` | Luu response dashboard | `useEffect` load `/dashboard` |
| `loading`, `error` | `DashboardPage.tsx` | Trang thai load/error | `useEffect` load `/dashboard` |
| `selectedStores`, `storeMenuOpen` | `DashboardPage.tsx` | Loc cua hang va dropdown cua hang | `toggleStore`, nut chon tat ca/bo chon, outside click |
| `dateRange`, `chartRange`, `chartType`, `orderRange`, `topRange`, `topLimit` | `DashboardPage.tsx` | Cac bo loc dashboard | Dropdown va `resetFilters` |
| `recentRange` | `DashboardPage.tsx` | Loc hien thi giao dich gan nhat tren du lieu API da co | Dropdown giao dich gan nhat |
| `refreshKey` | `DashboardPage.tsx` | Kich hoat reload dashboard | Auto interval 15 giay va thay doi filter |
| `showDailyModal`, `selectedDate`, `dailyProducts`, `dailyLoading` | `DashboardPage.tsx` | Modal chi tiet san pham ban ra theo ngay | `openDailyProducts`, nut dong modal |

## Filter/Search

| UI filter | Field gui API | State | Handler | Ghi chu |
| --------- | ------------- | ----- | ------- | ------- |
| Cua hang | `stores` | `selectedStores` | `toggleStore`, chon tat ca, bo chon | Gia tri join bang dau phay. |
| Ngay bao cao | `date` | `dateRange` | `Dropdown` | Luu localStorage de reload giu lua chon truoc. |
| Khoang bieu do | `chartRange` | `chartRange` | `Dropdown` | Anh huong bieu do doanh thu, luu localStorage. |
| Kieu bieu do | khong gui API | `chartType` | `Dropdown` | Chi doi cach render chart, luu localStorage. |
| Khoang don hang | `orderRange` | `orderRange` | `Dropdown` | Anh huong bang don hang. |
| Top san pham | `topRange`, `topLimit` | `topRange`, `topLimit` | `Dropdown` | Anh huong bang san pham ban chay. |
| Giao dich gan nhat | khong gui API | `recentRange` | `Dropdown` | Loc client-side theo `createdAt`; khong tao endpoint moi. |
| Dat lai | tat ca filter chinh | cac state filter | `resetFilters` | Giu logic cu. |

## Button/Action

| UI cu | Vi tri | Chuc nang | Handler hien tai | Co goi API khong | Modal/Route | Ghi chu |
| ----- | ------ | --------- | ---------------- | ---------------- | ----------- | ------- |
| Cua hang | Filter bar | Mo/loc cua hang | `setStoreMenuOpen`, `toggleStore` | Co, qua reload `/dashboard` | Dropdown | Giu nguyen. |
| Chon tat ca / Bo chon | Store panel | Cap nhat loc cua hang | `setSelectedStores` | Co, qua reload `/dashboard` | Dropdown | Giu nguyen. |
| Ngay bao cao | Filter bar | Doi `dateRange` | `setDateRange` | Co, qua reload `/dashboard` | Dropdown | Giu nguyen. |
| Dat lai | Filter bar | Reset filter | `resetFilters` | Co, qua reload `/dashboard` | Khong | Giu nguyen. |
| Khoang/kieu bieu do | Chart header | Doi chart | `setChartRange`, `setChartType` | `chartRange` co goi API | Dropdown | Giu nguyen. |
| Click bieu do | Chart | Xem san pham theo ngay | `openDailyProducts` | Co | Modal | Giu nguyen. |
| Link giao dich gan nhat | List giao dich | Mo trang tim giao dich | `href` | Khong truc tiep | Route `/sales-channels/store/find` | Giu nguyen. |
| Khoang giao dich gan nhat | Giao dich gan nhat | Loc danh sach hien thi | `setRecentRange` | Khong | Dropdown | Loc tren data `recentSales` hien co. |
| Khoang don hang | Don hang | Doi du lieu don hang | `setOrderRange` | Co | Dropdown | Giu nguyen. |
| Top san pham | San pham ban chay | Doi khoang/limit | `setTopRange`, `setTopLimit` | Co | Dropdown | Giu nguyen. |

## Table/List Columns

| Cot | Field du lieu | Sort | Click | Action | Ghi chu |
| --- | ------------- | ---- | ----- | ------ | ------- |
| Don hang: Gian hang | `orderChannels[].label` | Khong | Khong | Khong | Giu nguyen. |
| Don hang: Moi/cho xu ly | `newOrders` | Khong | Khong | Khong | Giu nguyen. |
| Don hang: Dong goi | `packing` | Khong | Khong | Khong | Giu nguyen. |
| Don hang: Dang chuyen | `shipping` | Khong | Khong | Khong | Giu nguyen. |
| Don hang: Hoan huy | `cancelled` | Khong | Khong | Khong | Giu nguyen. |
| Don hang: Tra hang | `returned` | Khong | Khong | Khong | Giu nguyen. |
| San pham: # | `rank` | Khong | Khong | Khong | Giu nguyen. |
| San pham: Ten san pham | `name`, `code` | Khong | Khong | Khong | Giu nguyen. |
| San pham: SL ban | `qtySold` | Khong | Khong | Khong | Giu nguyen. |
| San pham: SL tra | `qtyReturned` | Khong | Khong | Khong | Giu nguyen. |
| San pham: Doanh thu | `revenue` | Khong | Khong | Khong | Giu nguyen. |
| Giao dich gan nhat | `recentSales[]` | Khong | Link giao dich | Route | Chuyen len vi tri thay the So du vi va them filter Hom nay/3 ngay/7 ngay. |
| Modal ngay: Ten/Soluong/Gia/Doanh thu | `dailyProducts[]` | Khong | Khong | Khong | Giu nguyen. |

## Modal/Drawer/Popup

| Ten | Mo tu dau | State dieu khien | Chuc nang | API |
| --- | --------- | ---------------- | --------- | --- |
| Store filter panel | Nut cua hang | `storeMenuOpen` | Chon cua hang | Reload `/dashboard` qua state filter |
| Chart dropdowns | Nut dropdown | local `open` trong `Dropdown` | Doi filter/kieu chart | Tuy filter |
| Recent dropdown | Header giao dich gan nhat | local `open` trong `Dropdown` | Loc giao dich gan nhat | Khong goi API moi |
| Chi tiet san pham theo ngay | Click bieu do | `showDailyModal` | Hien danh sach san pham ban theo ngay | `/dashboard/daily-products` |

## Pagination

| State page | State page size | Handler | API |
| ---------- | --------------- | ------- | --- |
| Khong co | Khong co | Khong co | Khong co |

## Chuc nang trong mau nhu code hien tai chua co

| Chuc nang mau | Co logic/API cu khong | Cach xu ly |
| ------------- | --------------------- | ---------- |
| Bo block Tong quan van hanh/manual sync/display settings | Co UI cu, auto refresh da co | Xoa UI manual, giu auto refresh 15 giay va API cu. |
| Bo bang Kenh ban | Co data `salesChannels` tu API | Xoa UI bang theo yeu cau, khong doi API/response mapping backend. |
| Bo So du vi | Co data `wallets`, `walletItems` tu API | Xoa UI hien thi, khong doi backend/response mapping. |
| Luu trang thai filter thoi gian | Chua co localStorage | Them state initializer va effect luu localStorage cho `dateRange`, `chartRange`, `chartType`. |
| Giao dich gan nhat co dropdown Hom nay/3 ngay/7 ngay | Co data `recentSales`, chua co API rieng | Loc client-side tren `createdAt`, mac dinh Hom nay. |
| Sap xep lai layout | Co UI hien tai | Dua recent vao vi tri side thay So du vi; Don hang, San pham ban chay, Ton kho nam trong main column va cung chieu ngang chart. |

## Rui ro khi refactor

| Rui ro | Cach tranh |
| ------ | ---------- |
| Xoa nham logic auto refresh | Chi bo nut/status manual, giu `setInterval` va `refreshKey`. |
| Lam mat filter/API | Khong doi endpoint, query params, state filter. |
| Lam loi import/state unused | Chay build sau khi sua. |
| Anh huong modal chart | Khong sua `openDailyProducts` va modal chi tiet ngay. |
| LocalStorage co gia tri cu khong hop le | Validate voi options hop le, fallback mac dinh. |
| Loc recent client-side khac voi backend limit 10 | Chi loc tren data `/dashboard` tra ve, khong tu tao API moi. |
