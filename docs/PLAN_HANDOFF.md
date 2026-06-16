Đã khảo sát đủ phần liên quan. PLAN mode không được ghi file, nên dưới đây là nội dung đầy đủ `docs/PLAN_HANDOFF.md` để bạn copy hoặc chuyển sang ACT để ghi file.

````md
# PLAN_HANDOFF

## 1. User Request

Timestamp tạo kế hoạch: 2026-06-16 10:14:31 Asia/Bangkok (UTC+7)

Xác nhận reset: Đây là kế hoạch mới, thay thế hoàn toàn mọi nội dung `docs/PLAN_HANDOFF.md` cũ. File hiện tại được kiểm tra là rỗng, không tái sử dụng nội dung từ phiên trước.

Yêu cầu gốc:

- Người dùng thấy giao diện hiện tại rất xấu, khó nhìn, nút rườm rà, thiết kế thiếu chuyên nghiệp, font chưa tốt.
- Cho phép cải tổ hoàn toàn dự án, nhưng trong nhiệm vụ PLAN hiện tại: không sửa source code, không implement, không chạy lệnh sửa project.
- Được phép tham khảo thiết kế hiện đại, nhưng phiên PLAN này chỉ lập kế hoạch dựa trên source hiện có.
- Cụm nút chiếm nhiều chỗ, liên quan nhau, gần nhau phải gộp thành một nút lớn; khi bấm hiển thị các nút con.
- Nút trùng chức năng phải loại bỏ một nút.
- Tác động toàn bộ web nên cần kế hoạch kỹ và test sâu, ưu tiên P0.
- Target URL: `http://localhost:5173/reports/customer` theo ví dụ người dùng đưa, nhưng source hiện có không có route chính xác này; các route khách hàng báo cáo là `/reports/customers/...`. Trang đã khảo sát sâu là `/reports/revenue/store` vì đây là route báo cáo có UI phức tạp, nhiều nút và test sẵn.
- Tài khoản test mặc định: `admin@gmail.com` / `123456`.

## 2. Goal

Mục tiêu cuối cùng:

- Cải tổ UI/UX toàn web theo hướng hiện đại, chuyên nghiệp, dễ đọc, nhất quán, ít rườm rà.
- Chuẩn hóa design system: màu sắc, typography, spacing, border radius, shadow, button variants, form controls, dropdown, modal, table, tabs, cards, loading/error/empty states.
- Giảm số lượng nút hiển thị cùng lúc bằng cách gom các hành động liên quan vào action menu/dropdown/split button.
- Loại bỏ hoặc hợp nhất nút trùng chức năng.
- Giữ nguyên nghiệp vụ, route, API contract, dữ liệu, permission, auth flow.
- Không làm mất khả năng thao tác bằng keyboard, responsive, mobile/tablet.
- Trang báo cáo, đặc biệt `/reports/revenue/store` và nhóm `/reports/customers/...`, phải có UX tốt hơn nhưng vẫn giữ đúng dữ liệu, bộ lọc, tab, bảng, biểu đồ, export/print/column settings.

## 3. Assumptions

- “Toàn bộ web” bao gồm `AppLayout`, global CSS, shared components, module CRUD pages dùng `DataModulePage`, báo cáo custom trong `client/src/modules/reports`, auth/login, dashboard, product, customer, accounting, warehouse, orders, settings, staff.
- Không thay đổi backend nếu chỉ cải tổ giao diện. Backend/API chỉ cần khảo sát để đảm bảo UI không phá data flow.
- Không thay đổi database schema.
- Không đổi URL public hiện tại trừ khi phát hiện route trong menu chưa có route tương ứng.
- Các trang báo cáo có thể dùng custom CSS riêng; ACT cần quy hoạch để tránh class `.btn-outline`, `.modal-content` trong page CSS override global style ngoài ý muốn.
- Target URL người dùng ghi `reports/customer` có thể là ví dụ hoặc nhầm route. Source có nhóm route `/reports/customers/overview`, `/reports/customers/product`, `/reports/customers/return-rate`, `/reports/customers/level`, `/reports/customers/group`, `/reports/customers/new-store`, `/reports/customers/purchase-cycle`, `/reports/customers/birthday` trong menu nhưng `main.tsx` đoạn đã đọc chưa thấy route mapping phần customers ở cuối vì file cắt đến line 240/249. ACT phải kiểm tra phần còn lại của `main.tsx` trước khi sửa.
- Tài khoản `admin@gmail.com/123456` dùng cho E2E login nếu auth setup yêu cầu.
- PLAN không ghi file được trong chế độ hiện tại. Nếu cần ghi thật, chuyển sang ACT.

## 4. Source Code Survey

### Files đã đọc

- `planskill.md`
  - Quy định bắt buộc cho PLAN: không sửa source, không implement, không chạy migrate/build/test; phải khảo sát code, lập kế hoạch, sinh test case theo format.

- `docs/PLAN_HANDOFF.md`
  - File hiện tại rỗng. Không có nội dung cũ để tái sử dụng.

- `client/src/main.tsx`
  - Định nghĩa router frontend bằng `createBrowserRouter`.
  - `AppLayout` là layout chung.
  - Có nhiều route module: products, warehouse, sales, customers, accounting, orders, staff, settings, reports.
  - Route báo cáo doanh thu cửa hàng: `/reports/revenue/store` -> `RevenueByStorePage`.
  - Có nhiều import trang report nhưng cần kiểm tra đoạn cuối file để xác nhận toàn bộ route products/accounting/ledger/customers.

- `client/src/styles/app.css`
  - Global CSS hiện tại.
  - Root font dùng Inter/system nhưng chưa có font import.
  - Layout dùng top horizontal sidebar cố định, dropdown hover/click, màu slate/blue cơ bản.
  - Có style button/table/form/modal/shared components. Nhiều phần sau line 260 chưa đọc hết, ACT cần đọc toàn bộ trước khi sửa.
  - Rủi ro: class global `.btn-outline`, `.btn-success`, `.modal-content` bị page CSS ghi đè.

- `client/src/core/layout/AppLayout.tsx`
  - Layout/menu chính toàn web.
  - `baseMenuGroups` chứa menu top-level và nhiều submenu, đặc biệt nhóm “Báo Cáo” rất lớn.
  - Auth check: đọc token từ `localStorage`, gọi `/auth/me` và `/settings/store`, lỗi thì xóa token và redirect `/login`.
  - Owner-only settings và staff menu dựa trên `user.role === 'owner'`.
  - Menu hiện dùng nhiều dropdown cấp 1/cấp 2. Nút cài đặt nằm riêng. User menu có inline style.
  - Vấn đề UX: menu báo cáo quá nhiều item, dễ rườm rà; nhiều style inline; menu phụ mở bằng hover/focus CSS và state click, có thể bất nhất trên mobile/keyboard.

- `client/src/core/components/DataModulePage.tsx`
  - Shared CRUD page component.
  - Header có nhiều action: Làm mới, Xuất CSV, Nhập, Thao tác bulk, Tạo mới, Hành động nhanh.
  - Bên filter panel lại có “Thao tác nhanh” và “Tạo mới”, trùng với header.
  - Có search client-side, quick filters client-side, create/edit modal, delete, row actions, custom actions, export CSV client-side.
  - Rủi ro: action duplication, nút chiếm nhiều chỗ, dropdown close effect dependency thiếu `showBulkDropdown`, validation chỉ dựa HTML `required`, error handling chưa đầy đủ cho delete/action.

- `client/src/modules/reports/RevenueByStorePage.tsx`
  - Trang báo cáo doanh thu theo cửa hàng/kho hàng.
  - State filter: `displayType`, `dateRange`, `warehouseId`, `invoiceType`, `startHour`, `startMinute`, `endHour`, `endMinute`, tab.
  - Gọi options từ `/system/branches`, `/products/categories`; `categories` được set nhưng không dùng trong UI/API.
  - Gọi data từ `/reports/revenue-store` với params `displayType`, `fromDate`, `toDate`, `branchId`, `invoiceType`; backend hiện không xử lý `invoiceType`, start/end hour/minute không gửi lên API.
  - Có tab `Kho hàng`, `Doanh thu`, `Lợi nhuận`.
  - Có pie charts, table tổng/trung bình, pivot tables, target modal, settings modal.
  - Actions hiện tách riêng: `Nhập chỉ tiêu`, `Xuất dữ liệu`, `In báo cáo`, icon layout-grid.
  - `handleExportData` chỉ xuất blob `Data`, chưa xuất dữ liệu thật.
  - `handleSaveTargets` chỉ alert, không persist.
  - Column settings có search `colSearch` nhưng không dùng để filter danh sách cột.
  - Nút `Quay về mặc định` không có handler.
  - Loading chỉ text; error không hiển thị; empty state không rõ.

- `client/src/modules/reports/RevenueByStorePage.css`
  - CSS riêng cho trang report.
  - Style cũ, box-shadow nhẹ, radius 4/8, màu chưa đồng bộ global token.
  - Định nghĩa `.btn-outline`, `.btn-success`, `.modal-content`, `.modal-overlay` có thể đụng global CSS.
  - Layout filter nhiều control ngang, dễ chật.

- `client/src/core/components/ui/CustomSelect.tsx`
  - Custom select searchable.
  - Có popover, click outside.
  - Thiếu ARIA roles/keyboard navigation.
  - Option clear hiển thị `--` không rõ nghĩa.

- `client/src/core/components/ui/DateRangePicker.tsx`
  - Date range picker custom.
  - Quick selects đặt số ngày theo cách rolling range, nhưng label “Tuần này”, “Tháng này” không đúng calendar week/month.
  - Không validate start > end.
  - Month/year label có chevron nhưng không mở dropdown chọn tháng/năm.
  - Thiếu ARIA/keyboard.

- `client/src/core/api/http.ts`
  - Axios instance dùng `VITE_API_URL` hoặc `http://host:4000/api`.
  - Request interceptor thêm Bearer token từ `localStorage`.
  - Không có response interceptor xử lý 401 global.

- `server/src/app.ts`
  - Express app, CORS, JSON, morgan.
  - `/api/reports` được bảo vệ bởi `requireAuth`.
  - `/api/system/branches` cần auth; `/api/system` cần owner.
  - Error handler trả `{ message, issues }`.

- `server/src/modules/reports/reports.routes.ts`
  - API `/revenue-time` và `/revenue-store`.
  - `/revenue-store` query đọc `fromDate`, `toDate`, `displayType`, `branchId`, `categoryId`.
  - Không đọc `invoiceType`, start/end hour/minute.
  - Revenue lấy từ `SalePayment` status `completed`, group theo branch/time, lookup branches.
  - Retail/wholesale hiện chia 70/30 bằng `Math.floor`, có thể là tạm/hardcode.
  - Timezone dùng `Asia/Ho_Chi_Minh` trong `$dateToString`, nhưng date filter tạo Date server local.

- `server/src/core/auth`
  - Chỉ list files: `auth.routes.ts`, `user.model.ts`. ACT cần đọc chi tiết nếu thay đổi auth UI/login/accessibility hoặc test login.

- `e2e/tests/reports-revenue-store.spec.ts`
  - Test E2E hiện có cho `/reports/revenue/store`.
  - Test seed revenue data, chờ API `/reports/revenue-store` 200.
  - Kiểm tra filter display type, tabs, export, print, target modal, column settings.
  - Test còn yếu: chưa verify API params đúng, empty/error/loading, responsive, keyboard, permission, date validation, dropdown grouping, duplicated actions.

- `e2e/utils/db.ts`
  - Có `seedRevenueData`, `cleanupRevenueData` seed `salepayments` và `orders`.
  - Seed revenue thiếu `branchId`, nên backend sẽ trả branch “Khác” hoặc grouping theo null; test chưa phủ branch thật.

### Files/directories đã list

- `client/src/modules/reports`
  - Nhiều report pages: revenue, orders, retail, wholesale, inventory, products, accounting, ledger, customers.
  - Cần audit diện rộng vì yêu cầu cải tổ toàn web.

- `client/src/core`
  - `api/http.ts`, `components/DataModulePage.tsx`, `components/Pagination.tsx`, `components/TabbedModulePage.tsx`, `components/ui`, `layout/AppLayout.tsx`.

- `server/src/modules/reports`
  - `reports.routes.ts`, `revenueTime.model.ts`.

- `e2e/tests`
  - Có nhiều suite module: accounting, auth, customer, dashboard, menu, orders, product, reports, revenue-buttons, warehouse.
  - Có thể mở rộng test regression sau redesign.

## 5. Current Behavior

### Toàn web

- Layout chính là top navigation cố định, không phải sidebar truyền thống.
- Menu có nhiều nhóm, nhiều dropdown cấp 2. Nhóm “Báo Cáo” chứa rất nhiều submenu nên khó tìm và dễ chật màn hình.
- Nhiều component dùng style inline, khó đồng bộ theme.
- Global styles và page-specific styles có class trùng tên, gây khó kiểm soát.
- Chưa có design system rõ ràng cho button, input, select, modal, card, table, empty/loading/error.
- Font khai báo Inter nhưng chưa import từ local/package/CDN; fallback system có thể khác nhau giữa máy.
- Auth redirect dựa token localStorage; không có response interceptor 401 global.

### `DataModulePage`

- Header hiển thị nhiều nút cùng lúc: Làm mới, Xuất CSV, Nhập, bulk actions, Tạo mới, Hành động nhanh.
- Panel trái lại có “Thao tác nhanh/Tạo mới”, gây lặp chức năng với header.
- Quick filter là list button, nếu nhiều filter sẽ chiếm chỗ.
- Table có checkbox bulk, actions row, edit/delete.
- Empty state chỉ text trong table.
- Loading chỉ text trong row.
- Delete/action errors chưa set error.

### `/reports/revenue/store`

- Filter bar có nhiều control ngang: Hiển thị, date range, Kho hàng, Kiểu, giờ/phút bắt đầu/kết thúc, Lọc.
- Start/end hour/minute không tác động API.
- `invoiceType` gửi API nhưng backend không xử lý.
- `categories` được fetch nhưng không dùng.
- Actions tách nhiều nút: Nhập chỉ tiêu, Xuất dữ liệu, In báo cáo, Tùy chỉnh cột.
- Export chỉ tạo file CSV chứa text `Data`, không phải dữ liệu báo cáo thật.
- Target modal chỉ lưu bằng alert, không persist.
- Column settings search không lọc; reset default không hoạt động.
- Charts/table dùng màu và spacing cũ, thiếu card hierarchy hiện đại.
- Loading/empty/error state chưa chuyên nghiệp.

### Backend/API

- `/api/reports/revenue-store` yêu cầu auth.
- API trả array data, không wrapper `{items}`.
- Query support thực tế: `fromDate`, `toDate`, `displayType`, `branchId`, `categoryId`.
- Query từ frontend có `invoiceType`, nhưng backend bỏ qua.
- Retail/wholesale split đang hardcode 70/30, có thể sai nghiệp vụ.

## 6. Required Behavior

### Toàn web

- UI phải đồng bộ, sạch, dễ nhìn, có hierarchy rõ.
- Thiết lập design tokens trong CSS: color palette, surface, text, border, shadow, radius, spacing, typography scale, focus ring.
- Font phải thống nhất. Đề xuất: dùng Inter nếu đã có package/CDN policy cho phép; nếu không dùng system stack hiện đại `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` và đảm bảo weight/line-height chuẩn.
- Navigation phải giảm rối:
  - Gom nhóm báo cáo thành mega menu/command-style dropdown có search và group rõ.
  - Nhóm liên quan thành một nút lớn với menu con.
  - Tránh hiện đồng thời quá nhiều route item cấp sâu.
  - Menu phải dùng click/focus ổn định, không phụ thuộc hover cho mobile.
- Các nút gần nhau và cùng loại phải gom:
  - Primary action riêng.
  - Secondary actions vào menu “Thao tác”.
  - Export/Print/Import/Refresh/Column settings vào “Công cụ” hoặc “Tùy chọn”.
- Loại bỏ nút trùng:
  - Trong `DataModulePage`, không hiển thị cùng lúc “Tạo mới” ở header và “Tạo mới” trong filter panel nếu cùng chức năng.
  - Chỉ giữ một nơi ưu tiên cho primary action.
- Shared components phải có consistent states: default, hover, active, disabled, focus-visible, loading, error.
- Empty/loading/error states phải rõ và nhất quán.
- Responsive phải ổn ở desktop/tablet/mobile.
- Accessibility tối thiểu: aria-label cho icon-only buttons, keyboard mở/đóng menu/modal/select, Escape đóng popover/modal, focus trap modal nếu implement được.

### `/reports/revenue/store`

- Filter bar phải gọn:
  - Các filter chính hiển thị: thời gian, chi nhánh/kho, kiểu báo cáo hoặc loại hóa đơn nếu API hỗ trợ.
  - Bộ lọc nâng cao gom vào nút “Bộ lọc nâng cao”.
  - Giờ/phút bắt đầu/kết thúc chỉ giữ nếu backend xử lý; nếu chưa xử lý thì ẩn/loại bỏ hoặc ghi rõ cần backend support.
- Action bar phải gọn:
  - Nút chính: “Cập nhật/Lọc báo cáo”.
  - Menu “Công cụ” chứa Xuất dữ liệu, In báo cáo, Tùy chỉnh cột.
  - “Nhập chỉ tiêu” nên nằm trong menu “Kế hoạch/Chỉ tiêu” hoặc chỉ hiện nếu có nghiệp vụ persist.
- Tùy chỉnh cột phải hoạt động đầy đủ: search lọc cột, reset default, lưu/cancel rõ ràng, không gây bảng sai colSpan khi ẩn hết cột con.
- Export phải xuất dữ liệu thật hoặc đổi label thành disabled/coming soon. Không được export file rỗng/dummy `Data`.
- Nếu giữ target modal, lưu phải persist hoặc ghi rõ chỉ local state. Không alert giả thành công nếu dữ liệu không được lưu.
- API mismatch phải xử lý: không gửi `invoiceType`/time nếu backend không support, hoặc ACT phải cập nhật backend + test API.
- Loading/empty/error phải có component/card rõ.

## 7. Implementation Plan

### Phase 0 - Guardrails

1. ACT đọc `docs/PLAN_HANDOFF.md` trước khi sửa code.
2. Tạo branch riêng hoặc commit checkpoint trước khi sửa.
3. Không sửa nghiệp vụ/API nếu mục tiêu chỉ là redesign; nếu sửa API mismatch thì tách commit rõ.
4. Chụp screenshot hoặc chạy visual baseline trước nếu có khả năng.
5. Kiểm tra toàn bộ `client/src/main.tsx`, `client/src/styles/app.css`, `RevenueByStorePage.tsx`, report customer pages còn chưa đọc chi tiết.

### Phase 1 - Design system nền

1. Refactor `client/src/styles/app.css` theo token:
   - `--color-bg`, `--color-surface`, `--color-surface-muted`, `--color-text`, `--color-text-muted`, `--color-primary`, `--color-primary-hover`, `--color-success`, `--color-warning`, `--color-danger`, `--color-border`, `--shadow-sm/md/lg`, `--radius-sm/md/lg/xl`, `--space-*`.
2. Chuẩn hóa typography:
   - Body 14/15px, line-height 1.5/1.6.
   - H1/H2/H3 scale rõ.
   - Number/table font có tabular nums nếu phù hợp.
3. Chuẩn hóa button classes:
   - `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-icon`, `.btn-menu`.
   - Disabled/focus/loading states.
4. Chuẩn hóa form controls:
   - Input/select/textarea/date picker height, border, focus, error.
5. Chuẩn hóa card/table/modal/dropdown/tabs.
6. Tránh class name collision bằng prefix page-specific CSS, ví dụ `.revenue-store-page .rs-btn-*` hoặc chuyển RevenueByStore dùng global button classes.

### Phase 2 - Layout/navigation redesign

1. Refactor `AppLayout.tsx` menu data:
   - Tách menu config ra file riêng nếu cần: `client/src/core/layout/menuConfig.ts`.
   - Nhóm báo cáo lớn thành report groups có search/filter trong dropdown/mega panel.
2. Thay hover-only dropdown bằng controlled click menu:
   - Click mở/đóng.
   - Click outside đóng.
   - Escape đóng.
   - Focus-visible rõ.
3. Với nhóm “Báo Cáo”, tạo mega menu/command panel:
   - Cột nhóm: Doanh thu, Đơn hàng, Bán lẻ, Bán sỉ, Kho hàng, Sản phẩm, Kế toán, Sổ kế toán, Khách hàng.
   - Search route theo label.
   - Active route highlight.
4. User menu bỏ inline style, chuyển class CSS.
5. Owner settings/staff giữ đúng permission.
6. Mobile/tablet:
   - Menu chuyển thành drawer/overlay rõ.
   - Submenu accordion.

### Phase 3 - Shared `DataModulePage` cleanup

1. Action consolidation:
   - Header: giữ title + primary action + một menu “Công cụ”.
   - “Công cụ” chứa Làm mới, Xuất CSV, Nhập dữ liệu.
   - Bulk action chỉ hiển thị khi selected > 0, hoặc thành contextual bar trên table.
   - `primaryActions` gom dưới split button nếu nhiều create action.
2. Loại bỏ duplicate create:
   - Không hiện “Tạo mới” ở filter panel nếu header đã có primary action.
   - Filter panel chỉ chứa search/filter.
3. Quick filter nếu nhiều item chuyển thành segmented control/dropdown chips có scroll đẹp.
4. Table improvements:
   - Sticky header nếu cần.
   - Empty state component với icon/message/action.
   - Loading skeleton rows.
   - Error banner có retry.
5. Row action consolidation:
   - Nếu có nhiều row actions/customActions/edit/delete, gom vào kebab menu `...`; giữ tối đa 1-2 action chính.
6. Fix dropdown close effect dependency gồm `showBulkDropdown`.
7. Delete/runAction catch error và hiển thị error.

### Phase 4 - `/reports/revenue/store` redesign

1. Tạo structure mới:
   - Header card: title “Báo cáo doanh thu theo cửa hàng”, subtitle, updated time, primary button “Cập nhật báo cáo”.
   - Filter card compact: DateRangePicker, DisplayType, Branch. Advanced filter collapsible chứa invoiceType/time nếu backend support.
   - KPI summary cards: Tổng doanh thu, Tổng lợi nhuận, Sử dụng điểm, Số chi nhánh.
   - Chart grid card.
   - Tab card/table card.
2. Consolidate action buttons:
   - Button primary: `Cập nhật báo cáo` gọi `fetchData`.
   - Dropdown `Công cụ`: Export CSV, Print, Tùy chỉnh cột, Nhập chỉ tiêu nếu giữ.
3. Fix or remove non-functional controls:
   - `categories` fetch bỏ nếu không dùng, hoặc thêm Category filter và gửi `categoryId` đúng.
   - `invoiceType` chỉ giữ nếu backend hỗ trợ; nếu giữ thì update backend query + data model logic thật.
   - start/end hour/minute chỉ giữ nếu backend lọc theo time-of-day; nếu không, bỏ khỏi UI.
4. Export thật:
   - Generate CSV từ `branchDataList` hoặc `pivotData` theo tab hiện tại, BOM UTF-8, headers đúng, filename rõ.
5. Target modal:
   - Nếu không có API persist, đổi thành local-only và không alert “lưu thành công” giả; hoặc tạo backend endpoint riêng nếu nghiệp vụ yêu cầu.
   - Nếu chỉ redesign, nên đưa vào menu và ghi “Chưa lưu lên server” hoặc disable.
6. Column settings:
   - Dùng `colSearch` để filter cột.
   - Reset default cập nhật `cols` về default.
   - Validate không tạo `colSpan=0` hoặc header group rỗng.
   - Nút icon layout-grid có aria-label/title.
7. State handling:
   - `error` state khi fetch fail.
   - Empty state khi data empty.
   - Loading skeleton/card.
8. CSS:
   - Rename classes prefix `rs-` để tránh override global.
   - Dùng tokens từ app.css.
   - Responsive: filter stacks, chart grid 1 column mobile, table horizontal scroll.

### Phase 5 - Customer reports/target route

1. Xác minh route `http://localhost:5173/reports/customer` có tồn tại không.
2. Nếu không tồn tại, xác định route đúng trong `main.tsx`:
   - `/reports/customers/overview` và các route khách hàng khác.
3. Redesign các trang customer report theo cùng pattern nếu chúng là target chính.
4. Nếu người dùng muốn route `/reports/customer`, thêm redirect hoặc alias chỉ khi được xác nhận ở ACT.

### Phase 6 - Backend/API alignment nếu quyết định sửa mismatch

1. Nếu giữ `invoiceType` filter:
   - Tìm schema `SalePayment` trong `server/src/modules/product/product.models.ts`.
   - Xác định field phân biệt retail/wholesale/online.
   - Cập nhật `/api/reports/revenue-store` match pipeline đúng.
2. Nếu giữ time-of-day filter:
   - Parse start/end hour/minute ở backend.
   - Áp dụng vào date range hoặc `$expr` hour/minute theo timezone `Asia/Ho_Chi_Minh`.
3. Nếu giữ category filter:
   - UI thêm select category và gửi `categoryId`.
4. Nếu target persist:
   - Thiết kế model/API cho revenue targets theo branch/date range, owner-only hoặc auth role phù hợp.

### Phase 7 - Testing

1. Unit/component tests nếu có setup; nếu không, ưu tiên Playwright E2E.
2. Update existing `reports-revenue-store.spec.ts` theo UI mới.
3. Thêm tests cho design-critical flows: action grouping, no duplicate actions, keyboard menu, responsive, API mismatch, error/empty/loading.
4. Run regression suites: auth, menu navigation, reports revenue, customer module, orders/product/warehouse/accounting smoke.

## 8. Files Likely To Change

### Frontend core

- `client/src/styles/app.css`
  - Design system tokens, shared UI styles, layout, button/table/modal/dropdown/form states.

- `client/src/core/layout/AppLayout.tsx`
  - Navigation grouping, user menu CSS classes, menu interaction/accessibility, report mega menu.

- Possible new file: `client/src/core/layout/menuConfig.ts`
  - Extract menu config for maintainability.

- Possible new file: `client/src/core/components/ActionMenu.tsx`
  - Shared action menu/dropdown for grouping related buttons.

- Possible new file: `client/src/core/components/EmptyState.tsx`
  - Shared empty/error/loading state components.

- Possible new file: `client/src/core/components/LoadingSkeleton.tsx`
  - Skeleton for tables/cards.

- `client/src/core/components/DataModulePage.tsx`
  - Consolidate buttons, remove duplicate create, improve states, row action menu.

- `client/src/core/components/TabbedModulePage.tsx`
  - Likely needs style consistency if used in modules.

- `client/src/core/components/Pagination.tsx`
  - Style consistency and accessibility if used.

- `client/src/core/components/ui/CustomSelect.tsx`
  - Styling, aria, keyboard, empty option label.

- `client/src/core/components/ui/CustomSelect.css`
  - Tokenized styling.

- `client/src/core/components/ui/DateRangePicker.tsx`
  - Styling, validation, quick range correctness, accessibility.

- `client/src/core/components/ui/DateRangePicker.css`
  - Tokenized styling/responsive.

- `client/src/core/api/http.ts`
  - Optional: response interceptor for 401 redirect, if ACT decides.

### Reports

- `client/src/modules/reports/RevenueByStorePage.tsx`
  - Major redesign and action grouping.

- `client/src/modules/reports/RevenueByStorePage.css`
  - Major rewrite/prefix classes/token usage.

- `client/src/modules/reports/RevenueByTimePage.tsx`
- `client/src/modules/reports/RevenueByTimePage.css`
  - Likely similar report UI pattern.

- `client/src/modules/reports/CustomersOverviewPage.tsx`
- `client/src/modules/reports/CustomersByProductPage.tsx`
- `client/src/modules/reports/CustomersReturnRatePage.tsx`
- `client/src/modules/reports/CustomersByLevelPage.tsx`
- `client/src/modules/reports/CustomersByGroupPage.tsx`
- `client/src/modules/reports/CustomersNewByStorePage.tsx`
- `client/src/modules/reports/CustomersPurchaseCyclePage.tsx`
- `client/src/modules/reports/CustomersBirthdayPage.tsx`
  - Target customer report group if `reports/customer` refers to customer reports.

- Other `client/src/modules/reports/*.tsx`
  - Style consistency and shared report layout adoption.

### Backend optional, only if fixing API mismatch

- `server/src/modules/reports/reports.routes.ts`
  - Support `invoiceType`, time-of-day, category filtering if UI keeps those controls.

- `server/src/modules/product/product.models.ts`
  - Read only likely; change only if missing field mapping requires it.

- Possible new model/routes for targets if implementing persistent “Nhập chỉ tiêu”.

### Tests

- `e2e/tests/reports-revenue-store.spec.ts`
  - Update selectors and add P0 cases.

- `e2e/tests/menu-navigation.spec.ts`
  - Update for redesigned nav/mega menu.

- `e2e/tests/auth.setup.ts`
  - Verify login state still works.

- Possible new `e2e/tests/ui-redesign.spec.ts`
  - Shared UI smoke: buttons, modals, dropdowns, responsive.

- `e2e/utils/db.ts`
  - Improve `seedRevenueData` with branchId and multiple branch/time data.

## 9. Data/Seed Requirements

- User login:
  - `admin@gmail.com` / `123456`.

- Branch data:
  - At least 3 branches with stable IDs/names.
  - One branch with long Vietnamese name to test layout.

- Revenue data:
  - Completed `salepayments` across multiple branches.
  - At least 2 dates in current month.
  - At least 1 record in previous month.
  - Values include 0, large value, discount/point usage, cost for profit calculation.
  - Include one record without branchId to verify “Khác” handling, if backend supports.

- Orders data:
  - Successful and cancelled/non-success statuses for revenue-time/report regression.

- Empty data scenario:
  - Date range with no sale payments.

- Error scenario:
  - Mock/intercept API 500 for `/api/reports/revenue-store`.
  - Mock/intercept 401/403 for auth behavior.

- UI data:
  - Many branches > 10 to test chart/table overflow and select search.
  - Many report menu items already exist; use for menu search/scroll test.

## 10. Critical Test Cases

### TC-001 - Auth required for reports page

- Priority: P0
- Type: E2E
- Preconditions:
  - Browser context has no `token` in localStorage.
- Test Data:
  - URL `/reports/revenue/store`.
- Steps:
  1. Clear localStorage.
  2. Navigate to `/reports/revenue/store`.
  3. Wait for navigation.
- Expected Result:
  - User is redirected to `/login`.
  - No report API data is visible.
- Evidence cần kiểm tra:
  - URL contains `/login`.
  - Login form visible.
- Ghi chú cho ACT:
  - Also run same test for target customer report route after route is confirmed.

### TC-002 - Logged-in user can open redesigned `/reports/revenue/store`

- Priority: P0
- Type: E2E
- Preconditions:
  - Logged in as `admin@gmail.com` / `123456`.
  - Seed revenue data exists.
- Test Data:
  - At least 2 branches and completed sales.
- Steps:
  1. Navigate to `/reports/revenue/store`.
  2. Wait for `/api/reports/revenue-store` 200.
  3. Inspect page header, filters, KPI/cards, charts/table.
- Expected Result:
  - Page loads without console error.
  - Header/title visible.
  - Main filters visible and not overflowing.
  - Revenue/profit data visible.
- Evidence cần kiểm tra:
  - Network response status 200.
  - Screenshot desktop.
  - No red error banner.
- Ghi chú cho ACT:
  - Current test waits for `/reports/revenue-store`; keep network wait but update selectors after redesign.

### TC-003 - Action buttons are consolidated and no duplicate create/action buttons appear

- Priority: P0
- Type: E2E/Manual
- Preconditions:
  - Logged in.
  - Open a CRUD page using `DataModulePage`, e.g. customers/products.
- Test Data:
  - Any existing records.
- Steps:
  1. Navigate to a module page using `DataModulePage`.
  2. Count visible primary create buttons.
  3. Open action/tool menu.
  4. Verify refresh/export/import are grouped.
- Expected Result:
  - Only one visible primary create action for the same function.
  - Secondary actions are inside one menu or contextual area.
  - No duplicate “Tạo mới” in header and filter panel at the same time.
- Evidence cần kiểm tra:
  - Screenshot of header/filter panel.
  - DOM count for button accessible names.
- Ghi chú cho ACT:
  - This directly validates user request “nút lặp chức năng thì loại bỏ”.

### TC-004 - Related report actions are grouped under one menu

- Priority: P0
- Type: E2E
- Preconditions:
  - Logged in.
  - Open `/reports/revenue/store`.
- Test Data:
  - Revenue data exists.
- Steps:
  1. Locate action area.
  2. Verify only primary action and one tools/action menu are visible.
  3. Open tools/action menu.
  4. Verify Export, Print, Column settings, Target action are menu items or grouped logically.
- Expected Result:
  - Page does not show many small action buttons consuming horizontal space.
  - All previous actions remain discoverable.
- Evidence cần kiểm tra:
  - Screenshot before/after menu open.
  - Accessible names of menu items.
- Ghi chú cho ACT:
  - If target action is removed/disabled due non-persistence, expected result must reflect product decision.

### TC-005 - Filter values send only supported API params or backend handles all UI params

- Priority: P0
- Type: E2E/API
- Preconditions:
  - Logged in.
  - Network request interception enabled.
- Test Data:
  - Select display type, date range, branch, optional invoice type/time if present.
- Steps:
  1. Open `/reports/revenue/store`.
  2. Set filters.
  3. Click `Cập nhật báo cáo`/`Lọc`.
  4. Capture `/api/reports/revenue-store` request URL.
- Expected Result:
  - Request includes correct params for visible filters.
  - No visible filter is ignored by backend.
  - If backend does not support invoice/time, those controls are not visible or marked disabled with explanation.
- Evidence cần kiểm tra:
  - Request URL/query params.
  - API response data changes according to filter.
- Ghi chú cho ACT:
  - Current UI sends `invoiceType` but backend ignores it; fix or remove.

### TC-006 - Date range validation prevents invalid start > end

- Priority: P0
- Type: E2E
- Preconditions:
  - Logged in.
  - DateRangePicker redesigned.
- Test Data:
  - Start date after end date.
- Steps:
  1. Open date picker.
  2. Select end date earlier than start date or start later than end.
  3. Apply.
  4. Try updating report.
- Expected Result:
  - UI prevents invalid range or normalizes it clearly.
  - No API request with invalid date range is sent.
  - Error/helper text is shown if invalid.
- Evidence cần kiểm tra:
  - Date picker state.
  - No invalid network request.
- Ghi chú cho ACT:
  - Current picker allows independent tempStart/tempEnd without validation.

### TC-007 - Export data exports real report content

- Priority: P0
- Type: E2E
- Preconditions:
  - Logged in.
  - Revenue data exists.
- Test Data:
  - Known branch name and revenue value.
- Steps:
  1. Open `/reports/revenue/store`.
  2. Open tools menu.
  3. Click Export.
  4. Read downloaded CSV/XLSX content if Playwright can access file.
- Expected Result:
  - File name is meaningful.
  - File content contains real headers and values from current tab/filter.
  - File is not dummy text `Data`.
- Evidence cần kiểm tra:
  - Download filename.
  - File content includes branch name and revenue.
- Ghi chú cho ACT:
  - Current implementation exports dummy `Data`, must fail before fix.

### TC-008 - Print action calls `window.print` from grouped action menu

- Priority: P0
- Type: E2E
- Preconditions:
  - Logged in.
  - `window.print` mocked.
- Test Data:
  - None.
- Steps:
  1. Open tools menu.
  2. Click Print.
  3. Read mock flag.
- Expected Result:
  - `window.print` is called once.
  - Menu closes after action.
- Evidence cần kiểm tra:
  - JS flag `window.printed === true`.
- Ghi chú cho ACT:
  - Existing test can be adapted.

### TC-009 - Column settings modal search/reset/save works

- Priority: P0
- Type: E2E
- Preconditions:
  - Logged in.
  - Open `/reports/revenue/store`.
- Test Data:
  - Report table visible.
- Steps:
  1. Open tools menu.
  2. Open column settings.
  3. Search `Doanh thu`.
  4. Verify only matching columns/groups are visible.
  5. Uncheck `Kho hàng`.
  6. Save.
  7. Verify column hidden.
  8. Reopen modal and click reset default.
  9. Save.
- Expected Result:
  - Search filters column list.
  - Save applies column visibility.
  - Reset restores default columns.
  - Table header/body remain aligned; no invalid colSpan.
- Evidence cần kiểm tra:
  - Modal screenshot.
  - Table header count/body cell count alignment.
- Ghi chú cho ACT:
  - Current `colSearch` and reset default are non-functional.

### TC-010 - Empty report data shows professional empty state

- Priority: P0
- Type: E2E/API
- Preconditions:
  - Logged in.
  - Date range with no data or API mocked to `[]`.
- Test Data:
  - Empty response `[]`.
- Steps:
  1. Mock `/api/reports/revenue-store` to return `[]` or choose empty date range.
  2. Open report.
- Expected Result:
  - Empty state card visible.
  - No broken chart/table.
  - Action/filter remain usable.
  - Totals show 0 or hidden consistently.
- Evidence cần kiểm tra:
  - Screenshot empty state.
  - No console errors.
- Ghi chú cho ACT:
  - Current chart/table likely renders empty but no polished empty state.

### TC-011 - API 500 shows error state and retry

- Priority: P0
- Type: E2E/API
- Preconditions:
  - Logged in.
  - Intercept API.
- Test Data:
  - `/api/reports/revenue-store` returns 500 `{message:"Server error"}`.
- Steps:
  1. Mock API 500.
  2. Open report.
  3. Observe error state.
  4. Change mock to 200.
  5. Click retry/update.
- Expected Result:
  - Error message visible.
  - UI does not stay stuck loading.
  - Retry reloads data successfully.
- Evidence cần kiểm tra:
  - Error banner text.
  - Network retry.
- Ghi chú cho ACT:
  - Current `fetchData` only logs error.

### TC-012 - 401 during report API redirects to login or shows auth-expired flow

- Priority: P0
- Type: E2E/API
- Preconditions:
  - Logged in initially or stale token.
  - Mock `/api/reports/revenue-store` 401.
- Test Data:
  - 401 response.
- Steps:
  1. Open report with stale token.
  2. Trigger report fetch.
- Expected Result:
  - User is redirected to `/login` or clear auth-expired message appears.
  - Token cleared if global policy is redirect.
- Evidence cần kiểm tra:
  - URL or auth message.
  - localStorage token state.
- Ghi chú cho ACT:
  - Current `http.ts` has no response interceptor; AppLayout only catches `/auth/me` at mount.

### TC-013 - Report menu remains navigable after redesign

- Priority: P0
- Type: E2E
- Preconditions:
  - Logged in.
- Test Data:
  - Menu routes.
- Steps:
  1. Open navigation report menu/mega menu.
  2. Search/select “Theo cửa hàng”.
  3. Navigate to `/reports/revenue/store`.
  4. Reopen menu and navigate to a customer report route.
- Expected Result:
  - Menu opens reliably by click.
  - Active route highlighted.
  - No menu clipped off-screen.
  - Customer report route works if defined.
- Evidence cần kiểm tra:
  - Screenshots of menu.
  - Final URLs.
- Ghi chú cho ACT:
  - Current menu has many nested hover panels; redesign must not break navigation.

### TC-014 - Mobile responsive navigation and report filter are usable

- Priority: P0
- Type: E2E
- Preconditions:
  - Logged in.
  - Viewport 390x844.
- Test Data:
  - Revenue data exists.
- Steps:
  1. Set mobile viewport.
  2. Open app.
  3. Open navigation drawer/menu.
  4. Navigate to report.
  5. Open filters and tools menu.
  6. Scroll table horizontally.
- Expected Result:
  - No horizontal page overflow except table scroll area.
  - Menu and modals fit viewport.
  - Filter controls stack cleanly.
  - Tools menu accessible.
- Evidence cần kiểm tra:
  - Mobile screenshots.
  - Bounding box/page overflow check.
- Ghi chú cho ACT:
  - User complaint includes hard-to-see UI; mobile must be included.

### TC-015 - Keyboard can operate menus, modals, dropdowns

- Priority: P0
- Type: E2E/Manual
- Preconditions:
  - Logged in.
- Test Data:
  - None.
- Steps:
  1. Use Tab to focus nav/action menu.
  2. Press Enter/Space to open.
  3. Use Arrow/Escape where supported.
  4. Open modal and close with Escape.
  5. Verify focus returns to trigger.
- Expected Result:
  - Keyboard-only user can reach and activate all major actions.
  - Focus indicator visible.
  - Escape closes overlays.
- Evidence cần kiểm tra:
  - Manual notes or Playwright keyboard assertions.
- Ghi chú cho ACT:
  - CustomSelect/DateRangePicker currently lack keyboard semantics.

### TC-016 - Visual hierarchy consistent across representative modules

- Priority: P0
- Type: Manual/E2E screenshot
- Preconditions:
  - Logged in.
- Test Data:
  - Existing module data.
- Steps:
  1. Visit dashboard, product list, customer list, warehouse transaction, accounting cash, orders manage, report revenue store.
  2. Capture screenshots.
  3. Compare header, cards, buttons, table, modals.
- Expected Result:
  - Same design language across modules.
  - No old button style mixed with new style on critical pages.
- Evidence cần kiểm tra:
  - Screenshot set.
- Ghi chú cho ACT:
  - This is the main acceptance for “cải tổ toàn bộ web”.

## 11. Extended Test Cases

### TC-017 - Quick filter remains functional after `DataModulePage` redesign

- Priority: P1
- Type: E2E
- Preconditions:
  - Open a page with `quickFilters`.
- Test Data:
  - Records with matching/non-matching statuses.
- Steps:
  1. Click each quick filter.
  2. Observe table row count/data.
  3. Clear filter.
- Expected Result:
  - Table updates based on actual item values.
  - Active filter state visible.
- Evidence cần kiểm tra:
  - Row count before/after.
- Ghi chú cho ACT:
  - Ensure redesign does not convert filter to cosmetic-only UI.

### TC-018 - Search filters table data, not only input text

- Priority: P1
- Type: E2E
- Preconditions:
  - Open `DataModulePage` page with records.
- Test Data:
  - Unique product/customer name.
- Steps:
  1. Type unique text in search.
  2. Verify only matching row remains.
  3. Type impossible string.
  4. Verify empty state.
- Expected Result:
  - Data table filters correctly.
  - Empty state appears for no match.
- Evidence cần kiểm tra:
  - Row count and empty state.
- Ghi chú cho ACT:
  - Keep client-side search behavior unless redesign changes to server-side.

### TC-019 - Bulk actions menu only enabled when rows selected

- Priority: P1
- Type: E2E
- Preconditions:
  - Page has `bulkActionGroups`.
- Test Data:
  - At least 2 records.
- Steps:
  1. Open page with bulk actions.
  2. Verify bulk menu disabled/hidden initially.
  3. Select one row.
  4. Open bulk menu.
  5. Deselect all.
- Expected Result:
  - Bulk UI appears/enables only when selected count > 0.
  - Count is correct.
- Evidence cần kiểm tra:
  - Button enabled state/count.
- Ghi chú cho ACT:
  - Current behavior disables button but still occupies header space.

### TC-020 - Row actions are consolidated without losing edit/delete

- Priority: P1
- Type: E2E
- Preconditions:
  - Open CRUD page with row actions.
- Test Data:
  - Existing record.
- Steps:
  1. Locate row action menu/kebab.
  2. Open it.
  3. Verify edit/delete/custom actions exist.
  4. Click edit and close modal.
- Expected Result:
  - Actions are discoverable.
  - Edit opens modal with correct data.
  - Delete remains protected by confirm.
- Evidence cần kiểm tra:
  - Menu item names.
  - Modal fields.
- Ghi chú cho ACT:
  - Do not hide destructive actions without label/accessibility.

### TC-021 - Delete API error shows message

- Priority: P1
- Type: E2E/API
- Preconditions:
  - Open CRUD page.
  - Intercept DELETE to 500.
- Test Data:
  - Existing record.
- Steps:
  1. Click delete.
  2. Accept confirm.
  3. Observe error.
- Expected Result:
  - Error message visible.
  - Row remains in table.
- Evidence cần kiểm tra:
  - Error chip/banner.
- Ghi chú cho ACT:
  - Current `remove` lacks try/catch.

### TC-022 - Create/edit modal validation remains intact

- Priority: P1
- Type: E2E
- Preconditions:
  - Open a CRUD page with required fields.
- Test Data:
  - Empty required fields, invalid email if applicable.
- Steps:
  1. Open create modal.
  2. Submit empty form.
  3. Fill invalid values.
  4. Submit.
- Expected Result:
  - Required field validation blocks submit.
  - API validation errors displayed if backend rejects.
  - Modal layout remains readable.
- Evidence cần kiểm tra:
  - Browser validation or error banner.
- Ghi chú cho ACT:
  - Redesign must not remove `required` attributes.

### TC-023 - Date quick ranges are semantically correct

- Priority: P1
- Type: Unit/E2E/Manual
- Preconditions:
  - DateRangePicker open.
- Test Data:
  - Freeze current date if possible.
- Steps:
  1. Click Hôm nay.
  2. Click Hôm qua.
  3. Click Tuần này.
  4. Click Tháng này.
- Expected Result:
  - Hôm nay start=end today.
  - Hôm qua start=end yesterday.
  - Tuần này starts Monday/current week and ends today or week end per product decision.
  - Tháng này starts first day of month.
- Evidence cần kiểm tra:
  - Displayed date range.
- Ghi chú cho ACT:
  - Current implementation uses rolling days, not calendar periods.

### TC-024 - CustomSelect search, clear, and long option labels

- Priority: P1
- Type: E2E
- Preconditions:
  - Report page with branch select.
- Test Data:
  - Branch list includes long Vietnamese name.
- Steps:
  1. Open select.
  2. Search partial name.
  3. Select option.
  4. Reopen and clear.
- Expected Result:
  - Search filters options.
  - Long label truncates/wraps neatly.
  - Clear option has meaningful label, e.g. “Tất cả”.
- Evidence cần kiểm tra:
  - Selected label, dropdown screenshot.
- Ghi chú cho ACT:
  - Current clear label is `--`.

### TC-025 - Chart handles many branches without unreadable labels

- Priority: P1
- Type: E2E/Manual
- Preconditions:
  - Seed > 10 branches with revenue.
- Test Data:
  - 10-15 branch records.
- Steps:
  1. Open report.
  2. Inspect pie/bar chart labels/legend.
- Expected Result:
  - Labels do not overlap severely or chart switches to better display/legend.
  - Tooltip remains usable.
- Evidence cần kiểm tra:
  - Screenshot.
- Ghi chú cho ACT:
  - Current pie labels may overlap.

### TC-026 - Pivot tabs preserve filter data and table alignment

- Priority: P1
- Type: E2E
- Preconditions:
  - Revenue data exists multiple dates/branches.
- Test Data:
  - Known branch/date values.
- Steps:
  1. Apply date/branch filter.
  2. Switch `Doanh thu` tab.
  3. Switch `Lợi nhuận` tab.
  4. Switch back `Kho hàng`.
- Expected Result:
  - No extra API request unless intended.
  - Pivot values correspond to filtered data.
  - Table headers align with cells.
- Evidence cần kiểm tra:
  - Table values and screenshots.
- Ghi chú cho ACT:
  - Current pivot derives from `data`; keep this unless product wants server-side.

### TC-027 - Target modal does not claim server persistence if not persisted

- Priority: P1
- Type: E2E/Manual
- Preconditions:
  - Target action enabled.
- Test Data:
  - Target amount per branch.
- Steps:
  1. Enter target.
  2. Save.
  3. Refresh page.
  4. Reopen target modal.
- Expected Result:
  - If persisted: value remains after refresh.
  - If local-only: UI clearly says local/session-only and does not show fake success.
- Evidence cần kiểm tra:
  - Values after refresh.
  - Success message text.
- Ghi chú cho ACT:
  - Current alert “Đã lưu” is misleading.

### TC-028 - Report route alias/customer target is resolved

- Priority: P1
- Type: E2E/Manual
- Preconditions:
  - ACT has confirmed route policy.
- Test Data:
  - URL `/reports/customer` and `/reports/customers/overview`.
- Steps:
  1. Navigate to `/reports/customer`.
  2. Navigate to customer overview route.
- Expected Result:
  - Either `/reports/customer` redirects to valid customer report or shows 404/route policy clearly.
  - Customer report is redesigned if it is target page.
- Evidence cần kiểm tra:
  - URL and page content.
- Ghi chú cho ACT:
  - User target URL appears as example; clarify if needed before adding alias.

### TC-029 - Owner-only settings/staff menu remains protected

- Priority: P1
- Type: E2E/API
- Preconditions:
  - Owner account and non-owner account, or API mock for `/auth/me` role.
- Test Data:
  - `role=owner`, `role=staff`.
- Steps:
  1. Login/mock as owner.
  2. Verify staff/settings menu visible.
  3. Login/mock as non-owner.
  4. Verify owner-only menu hidden.
- Expected Result:
  - Redesign does not expose owner-only navigation to non-owner.
- Evidence cần kiểm tra:
  - Menu item visibility.
- Ghi chú cho ACT:
  - `AppLayout` currently uses `isOwner`.

### TC-030 - Logout still works after user menu redesign

- Priority: P1
- Type: E2E
- Preconditions:
  - Logged in.
- Test Data:
  - None.
- Steps:
  1. Open user menu.
  2. Click logout.
  3. Try browser Back.
- Expected Result:
  - Token removed.
  - Redirect to login.
  - Back does not show protected content without auth.
- Evidence cần kiểm tra:
  - localStorage token missing.
  - URL `/login`.
- Ghi chú cho ACT:
  - Current logout only removes token and navigates.

### TC-031 - Theme styles do not break legacy module pages

- Priority: P1
- Type: E2E smoke
- Preconditions:
  - Logged in.
- Test Data:
  - Existing pages.
- Steps:
  1. Visit `/products`, `/customers/list`, `/warehouse/transactions`, `/orders/manage`, `/accounting/cash`.
  2. Verify page renders and primary actions work/open modal.
- Expected Result:
  - No layout collapse.
  - No invisible text/buttons.
  - Existing modals/tables usable.
- Evidence cần kiểm tra:
  - Screenshots and no console errors.
- Ghi chú cho ACT:
  - Global CSS changes are high risk.

### TC-032 - Loading skeleton does not flash permanently on slow network

- Priority: P2
- Type: E2E/API
- Preconditions:
  - Intercept API with delay.
- Test Data:
  - 2s delayed response.
- Steps:
  1. Open report with delayed API.
  2. Observe loading state.
  3. Wait for response.
- Expected Result:
  - Loading state visible during delay.
  - Data replaces loading after response.
- Evidence cần kiểm tra:
  - Screenshots before/after.
- Ghi chú cho ACT:
  - Applies to report and DataModulePage.

### TC-033 - Large numbers use consistent Vietnamese formatting

- Priority: P2
- Type: E2E/Manual
- Preconditions:
  - Seed large revenue/profit values.
- Test Data:
  - `1234567890123` revenue.
- Steps:
  1. Open report.
  2. Inspect table/KPI/export.
- Expected Result:
  - UI formats `1.234.567.890.123` or consistent `vi-VN`.
  - Export preserves numeric values or formatted values per spec.
- Evidence cần kiểm tra:
  - UI text and CSV content.
- Ghi chú cho ACT:
  - Current `formatCurrency` returns empty for 0.

### TC-034 - Zero values display intentionally

- Priority: P2
- Type: E2E/Manual
- Preconditions:
  - Seed branch with zero revenue/profit.
- Test Data:
  - Zero value rows.
- Steps:
  1. Open report.
  2. Inspect cells.
- Expected Result:
  - Product decision clear: show `0`/`0 đ` or blank consistently.
  - Percent handles zero totals without NaN/Infinity.
- Evidence cần kiểm tra:
  - Table cells.
- Ghi chú cho ACT:
  - Current `formatCurrency(0)` returns empty string.

### TC-035 - Modals close by overlay/Escape and preserve/cancel state correctly

- Priority: P2
- Type: E2E
- Preconditions:
  - Open target/column modal.
- Test Data:
  - Change a checkbox/input.
- Steps:
  1. Open modal.
  2. Change value.
  3. Press Escape or click Cancel.
  4. Reopen modal.
- Expected Result:
  - Modal closes.
  - Unsaved changes do not apply unless product wants live apply.
  - Focus returns to trigger.
- Evidence cần kiểm tra:
  - Table state after cancel.
- Ghi chú cho ACT:
  - Current column checkbox changes apply immediately before pressing Lưu.

### TC-036 - Browser refresh preserves route and reloads data

- Priority: P1
- Type: E2E
- Preconditions:
  - Logged in.
  - On `/reports/revenue/store`.
- Test Data:
  - Existing data.
- Steps:
  1. Apply filters.
  2. Refresh browser.
  3. Observe page.
- Expected Result:
  - Page stays on same route.
  - Auth remains if token valid.
  - Data reloads.
  - If filters are not persisted, defaults are clear; if persisted, values restored.
- Evidence cần kiểm tra:
  - URL and data.
- Ghi chú cho ACT:
  - Decide whether filters sync to URL query for better UX.

### TC-037 - API returns missing fields gracefully

- Priority: P1
- Type: E2E/API
- Preconditions:
  - Mock `/api/reports/revenue-store` response missing `retail`, `wholesale`, or `total`.
- Test Data:
  - Partial response object.
- Steps:
  1. Mock partial data.
  2. Open report.
- Expected Result:
  - UI does not crash.
  - Missing numeric fields default to 0 or row is skipped with warning.
- Evidence cần kiểm tra:
  - No console error/blank crash.
- Ghi chú cho ACT:
  - Current code assumes nested fields exist.

### TC-038 - Network timeout/offline state

- Priority: P2
- Type: E2E/API
- Preconditions:
  - Abort or never fulfill report API request.
- Test Data:
  - Timeout/offline simulation.
- Steps:
  1. Open report with API failure/timeout.
  2. Wait beyond timeout policy.
- Expected Result:
  - User sees actionable error.
  - Retry available.
  - UI not stuck indefinitely.
- Evidence cần kiểm tra:
  - Error state.
- Ghi chú cho ACT:
  - Axios timeout not configured currently.

### TC-039 - Menu search finds deeply nested report routes

- Priority: P2
- Type: E2E
- Preconditions:
  - Report mega menu implemented.
- Test Data:
  - Search terms `sinh nhật`, `S2a`, `COD`, `tồn kho`.
- Steps:
  1. Open report menu.
  2. Search each term.
  3. Click first expected result.
- Expected Result:
  - Correct route result appears.
  - Navigation works.
- Evidence cần kiểm tra:
  - Search results and URL.
- Ghi chú cho ACT:
  - Helps with huge report menu.

### TC-040 - CSS class collision regression

- Priority: P1
- Type: Manual/E2E visual
- Preconditions:
  - Redesign applied.
- Test Data:
  - Pages with `.btn-outline`, `.btn-success`, `.modal-content` old classes.
- Steps:
  1. Open RevenueByStore modal.
  2. Open DataModulePage modal.
  3. Compare button/modal styling.
- Expected Result:
  - Styles are intentional and consistent.
  - Page-specific CSS does not override global unexpectedly.
- Evidence cần kiểm tra:
  - DOM computed styles or screenshots.
- Ghi chú cho ACT:
  - Prefix page CSS or migrate to shared classes.

## 12. Acceptance Criteria

- `docs/PLAN_HANDOFF.md` contains this new plan with timestamp and reset confirmation.
- ACT has not reused previous `PLAN_HANDOFF` content.
- UI across core layout, shared CRUD pages, and key reports is visually consistent.
- Main navigation is less cluttered and report menu is easier to search/navigate.
- Related buttons are grouped into one clear action/menu where appropriate.
- Duplicate create/action buttons are removed or hidden.
- `/reports/revenue/store` supports all visible controls or removes unsupported ones.
- Export is real or clearly disabled; no dummy export.
- Column settings search/reset/save works.
- Loading, empty, error states are implemented for report and shared data pages.
- Auth/permission behavior remains unchanged or improved safely.
- Responsive desktop/tablet/mobile tested.
- P0 test cases TC-001 through TC-016 pass.
- Existing key E2E smoke tests for auth/menu/reports/customer/product/order/warehouse/accounting pass after selector updates.
- No source change introduces console errors on core pages.

## 13. Suggested Commands

ACT nên chạy sau khi implement. Không chạy trong PLAN.

```bash
npm install
```
````

Nếu dependencies đã có, bỏ qua.

```bash
npm run dev
```

Nếu root script không chạy cả client/server, chạy riêng theo package scripts sau khi kiểm tra `package.json`:

```bash
cd server && npm run dev
```

```bash
cd client && npm run dev
```

Typecheck/build nếu scripts tồn tại:

```bash
cd client && npm run build
```

```bash
cd server && npm run build
```

E2E focused:

```bash
cd e2e && npx playwright test tests/reports-revenue-store.spec.ts --project=chromium
```

Menu regression:

```bash
cd e2e && npx playwright test tests/menu-navigation.spec.ts --project=chromium
```

Critical smoke set:

```bash
cd e2e && npx playwright test tests/auth.setup.ts tests/reports-revenue-store.spec.ts tests/customer-module.spec.ts tests/product-main.spec.ts tests/orders-module.spec.ts --project=chromium
```

Debug headed:

```bash
cd e2e && npx playwright test tests/reports-revenue-store.spec.ts --headed --project=chromium
```

## 14. Risks & Notes

- Đây là thay đổi lớn toàn web; rủi ro cao nhất là global CSS phá layout các module cũ.
- `RevenueByStorePage.css` định nghĩa class trùng global như `.btn-outline`, `.btn-success`, `.modal-content`; cần xử lý sớm để tránh override khó đoán.
- `DataModulePage` là shared component; thay đổi action/header/table có thể ảnh hưởng rất nhiều module.
- Current report UI có nhiều control không thật sự hoạt động (`invoiceType`, time filters, category fetch, target save, column search/reset, export dummy). Redesign cần quyết định rõ: implement đầy đủ hay ẩn/loại bỏ.
- Backend `/api/reports/revenue-store` không xử lý `invoiceType`; nếu UI giữ filter này mà không sửa backend thì bug vẫn còn.
- Current `seedRevenueData` thiếu `branchId`; test branch filter có thể không đáng tin. Cần cải thiện seed nếu test báo cáo theo cửa hàng.
- Font Inter chưa chắc được load. Nếu muốn font xịn và ổn định offline, cân nhắc cài package font hoặc dùng system stack. Không phụ thuộc CDN nếu môi trường test không có mạng.
- User nói được tra mạng để lấy thiết kế, nhưng ACT cần đảm bảo license/asset an toàn và không copy nguyên design proprietary.
- Accessibility của custom dropdown/date picker hiện yếu. Nếu cải tổ chuyên nghiệp, keyboard/focus/ARIA cần nằm trong scope.
- Nếu thêm response interceptor 401 trong `http.ts`, kiểm tra không gây redirect loop ở `/login` và không phá auth setup.
- Nếu thêm route alias `/reports/customer`, cần xác nhận vì source dùng `/reports/customers/...`.
- Agent ACT phải đọc file này trước khi sửa code.

```

Tóm tắt kế hoạch: cải tổ design system trước, sau đó chỉnh navigation, gom action trong shared `DataModulePage`, redesign sâu `/reports/revenue/store`, kiểm tra route customer reports, rồi chạy bộ P0. Agent ACT phải đọc `docs/PLAN_HANDOFF.md` trước khi sửa code.
```
