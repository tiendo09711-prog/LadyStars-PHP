# Gemini Task: Quét sâu UI, lập testcase, gọi API và fix dữ liệu hardcode

## 0. Vai trò và mục tiêu

Bạn là agent full-stack phụ trách kiểm tra toàn bộ dự án LadyStars ERP để phát hiện và sửa các phần dữ liệu đang bị hardcode, dữ liệu hiển thị sai so với API, hoặc nút chức năng có giao diện nhưng không hoạt động đúng.

Mục tiêu không phải là "nhìn sơ rồi sửa vài chỗ". Mục tiêu là đi từng trang, quét toàn bộ thành phần UI, lập testcase rõ ràng cho từng nút và từng vùng dữ liệu, dùng Playwright e2e để gọi/quan sát API, sau đó chỉ sửa code khi có bằng chứng cụ thể.

Repo hiện tại:

- Frontend: `client/src`
- Backend API: `server/src`, chạy mặc định tại `http://localhost:4000/api`
- Frontend local: `http://localhost:5173`
- E2E: `e2e`, dùng Playwright
- Auth e2e có sẵn: `e2e/tests/auth.setup.ts`
- API client frontend: `client/src/core/api/http.ts`
- Routes frontend chính: `client/src/main.tsx`
- Layout/menu chính: `client/src/core/layout/AppLayout.tsx`

Tài khoản e2e hiện có trong repo:

```text
admin@gmail.com / 123456
```

## 1. Luật bắt buộc trước khi sửa code

1. Không được sửa code chỉ dựa trên cảm giác hoặc nhìn UI bằng mắt.
2. Không được kết luận "ổn" nếu chưa có bằng chứng từ ít nhất một trong các nguồn sau:
   - Network request/response trong Playwright.
   - API được gọi trực tiếp bằng request từ test.
   - DB seed/query trong `e2e/utils/db.ts`.
   - Source code chứng minh UI lấy dữ liệu từ API và có state loading/error/empty hợp lý.
3. Không được bỏ qua nút chỉ vì nút là icon, dropdown, menu con, pagination, tab, filter, date picker, export, print, refresh, search, sort, modal, drawer, hoặc action trong từng row.
4. Không được chỉ test happy path. Với mỗi trang phải có ít nhất:
   - Test tải dữ liệu ban đầu.
   - Test trạng thái empty/loading/error nếu trang có xử lý.
   - Test filter/search/pagination/sort nếu có.
   - Test từng nút action hiển thị trên trang.
   - Test dữ liệu UI có khớp API hoặc DB seed không.
5. Không được xóa hardcode nếu hardcode đó là label, placeholder, tên cột, text hướng dẫn, trạng thái UI tĩnh hợp lệ. Chỉ xử lý hardcode thuộc nhóm dữ liệu nghiệp vụ đáng lẽ phải đến từ API/DB.
6. Sau mỗi nhóm sửa phải chạy e2e liên quan. Nếu fail thì tự đọc log, sửa và chạy lại.
7. Nếu một trang chưa có API tương ứng, không tự chế dữ liệu giả trong frontend. Phải thêm hoặc nối API backend phù hợp, hoặc ghi rõ lý do chưa thể làm nếu thiếu model/domain.
8. Khi sửa, giữ style và cấu trúc code hiện có. Không refactor lớn ngoài phạm vi phát hiện.

## 2. Định nghĩa hardcode cần tìm

Một đoạn bị xem là hardcode cần xử lý nếu thuộc một trong các loại sau:

- Bảng hiển thị danh sách nghiệp vụ bằng array cố định trong component.
- KPI/tổng tiền/số lượng/doanh thu/tồn kho/công nợ đang ghi số cố định.
- Dropdown/filter lấy danh sách cửa hàng, nhân viên, khách hàng, nhà cung cấp, danh mục, trạng thái bằng dữ liệu mẫu thay vì API.
- Modal/detail hiển thị dữ liệu giả không phụ thuộc record được chọn.
- Nút "Lọc", "Tìm kiếm", "Xuất dữ liệu", "In", "Tạo", "Sửa", "Xóa", "Xác nhận", "Lưu", "Hủy", "Refresh", "Import", "Export" không gọi API hoặc không thay đổi dữ liệu như UI thể hiện.
- Pagination/sort/search chỉ thay đổi UI local trên dataset giả.
- Biểu đồ/thống kê/report dùng số mẫu thay vì response.
- Empty state hiển thị "không có dữ liệu" trong khi API có dữ liệu, hoặc ngược lại.

Không xem là hardcode lỗi nếu là:

- Label menu, tiêu đề trang, tên cột, placeholder.
- Danh sách trạng thái nghiệp vụ cố định thật sự là enum.
- Text mô tả, toast message, validation message.
- Dữ liệu test chỉ nằm trong e2e seed/test.

## 3. Lệnh chạy dự án và e2e

Chạy dev server từ root:

```bash
npm run dev
```

Chạy Playwright từ thư mục `e2e`:

```bash
cd e2e
npx playwright test
```

Chạy một spec cụ thể:

```bash
cd e2e
npx playwright test tests/<ten-file>.spec.ts --project=chromium
```

Xem report:

```bash
cd e2e
npx playwright show-report
```

Nếu cần kiểm tra build:

```bash
npm run build
```

Nếu cần kiểm tra TypeScript:

```bash
npx tsc --noEmit
```

Lưu ý: config e2e đang dùng `baseURL: http://localhost:5173`, storage auth tại `e2e/playwright/.auth/user.json`, và setup login trong `e2e/tests/auth.setup.ts`.

## 4. Phạm vi quét trang

Bắt đầu từ `client/src/main.tsx` để lấy danh sách route thật sự render được. Sau đó đối chiếu với menu trong `client/src/core/layout/AppLayout.tsx`.

Ưu tiên làm theo từng module, không nhảy lung tung:

1. Dashboard: `/`
2. Sản phẩm:
   - `/products`
   - `/products/batches`
   - `/products/storage-duration`
   - `/products/inventory`
   - `/products/categories`
   - `/vendors`
3. Kho hàng:
   - `/warehouse/transactions`
   - `/warehouse/transactions/vouchers/import`
   - `/warehouse/transactions/vouchers/export`
   - `/warehouse/transactions/vouchers/excel`
   - `/warehouse/transfers`
   - `/warehouse/transfers/create`
   - `/warehouse/audit`
   - `/warehouse/audit/create`
   - `/warehouse/drafts`
   - `/warehouse/history`
4. Kênh bán:
   - `/sales-channels/store/find`
   - `/sales-channels/store/retail`
   - `/sales-channels/store/wholesale`
   - `/sales-channels/store/refund`
   - `/sales-channels/store/retail/create`
   - `/sales-channels/store/wholesale/create`
   - `/sales-channels/store/refund/create`
5. Đơn hàng:
   - `/orders/manage`
   - `/orders/packing`
   - `/orders/handover`
   - `/orders/shipping-pending`
   - `/orders/disputes`
   - `/orders/cod-control`
   - `/orders/sources`
   - `/orders/history`
6. Khách hàng:
   - `/customers/list`
   - `/customers/care`
7. Kế toán:
   - `/accounting/cash`
   - `/accounting/cash/create`
   - `/accounting/bank`
   - `/accounting/bank/create`
   - `/accounting/summary`
   - `/accounting/debt/customers`
   - `/accounting/debt/staff`
   - `/accounting/debt/vendors`
   - `/accounting/debt/initial`
   - `/accounting/entries`
   - `/accounting/journal`
   - `/accounting/installment-collection`
   - `/accounting/history`
   - `/accounting/accounts`
   - `/accounting/installment`
8. Vận hành:
   - `/tasks`
   - `/print-forms`
9. Nhân viên/cài đặt:
   - `/staff`
   - `/staff/create`
   - `/staff/accounts`
   - `/staff/stats`
   - `/settings`
10. Báo cáo:
   - Tất cả route `/reports/...` có trong `client/src/main.tsx`.

Nếu menu có link nhưng `main.tsx` chưa khai báo route, ghi nhận là lỗi route/menu mismatch. Nếu `main.tsx` có route nhưng menu không có link, ghi nhận là route orphan, chỉ sửa nếu user yêu cầu hoặc rõ ràng thiếu navigation.

## 5. Quy trình bắt buộc cho từng trang

Mỗi trang phải đi qua đủ 5 phase sau.

### Phase A: Inventory toàn bộ UI

Mở trang bằng Playwright, chờ network idle, rồi lập inventory. Không được chỉ nhìn DOM một lần. Phải kiểm tra desktop và nếu trang có responsive đáng kể thì thêm mobile.

Ghi lại tất cả:

- URL, component file nghi ngờ, module.
- Tiêu đề trang, subtitle, breadcrumbs nếu có.
- KPI/card/tổng số/biểu đồ.
- Bảng: tên cột, số dòng, row action, trạng thái empty.
- Form input: text, number, select, date range, checkbox, radio, textarea, file input.
- Filter/search/sort/pagination/tab.
- Button thường và icon button.
- Dropdown/menu popover.
- Modal/drawer/detail page.
- Toast/dialog/confirm.
- API request phát sinh khi page load.
- Console error.

Output inventory bắt buộc:

```md
## Inventory: <route>

- Component nghi ngờ: `client/src/...`
- API page load:
  - `GET /api/...` -> status 200, response shape: ...
- Vùng dữ liệu:
  - KPI: ...
  - Table: ...
  - Form: ...
- Nút/chức năng:
  - Button `<text/aria/class>`: expected behavior, API expected
  - Icon button thứ N trong `<container>`: expected behavior, API expected
- Dữ liệu nghi hardcode:
  - Text/value: ...
  - Lý do nghi ngờ: ...
  - File/line cần kiểm tra: ...
```

### Phase B: Lập testcase từ inventory

Từ Phase A, lập testcase cho từng vùng dữ liệu và từng nút.

Mỗi testcase phải có:

- ID duy nhất: `<module>-<route>-<number>`
- Mục tiêu.
- Precondition/seed data nếu cần.
- Action trên UI.
- API cần bắt hoặc gọi trực tiếp.
- Expected UI.
- Expected API/DB.
- Tiêu chí phát hiện hardcode.

Format bắt buộc:

```md
| ID | UI item | Action | API/DB evidence | Expected | Hardcode signal |
| --- | --- | --- | --- | --- | --- |
| products-list-001 | Table sản phẩm | Load `/products` | `GET /api/products` | Row chứa seed product | UI có row không nằm trong API hoặc API empty nhưng UI vẫn có dữ liệu nghiệp vụ |
```

### Phase C: Viết hoặc cập nhật e2e spec

Tạo spec ở `e2e/tests/<module>-hardcode-audit.spec.ts` hoặc thêm vào spec hiện có nếu hợp lý.

Spec phải:

- Bắt console error.
- Bắt request/response API liên quan.
- Seed data bằng DB helper nếu cần dữ liệu ổn định.
- Không phụ thuộc dữ liệu production ngẫu nhiên.
- Kiểm tra UI khớp response hoặc DB seed.
- Test từng nút chức năng có trong inventory.
- Có cleanup test data trong `afterAll`.

Không viết test chỉ kiểm tra element visible. Visible chỉ là bước đầu, chưa đủ chứng minh không hardcode.

### Phase D: Gọi API và so sánh

Với từng testcase dữ liệu:

1. Bắt response thật khi UI load hoặc khi click nút.
2. Parse JSON response.
3. So sánh ít nhất một giá trị đặc trưng với UI:
   - Code sản phẩm/đơn/phiếu.
   - Tên khách hàng/nhà cung cấp/nhân viên.
   - Tổng tiền/số lượng.
   - Trạng thái.
   - Ngày.
4. Nếu API trả empty thì UI không được hiển thị dữ liệu nghiệp vụ giả.
5. Nếu API trả lỗi thì UI phải có error/empty state hợp lý, không âm thầm hiển thị dữ liệu mẫu.

Với từng nút:

- Nếu nút lọc/search/sort: request phải chứa params đúng hoặc dữ liệu UI phải thay đổi đúng theo response.
- Nếu nút tạo/sửa/xóa/lưu/xác nhận: phải có request mutation đúng method/body, UI/DB đổi đúng.
- Nếu nút export: phải có download hoặc response file đúng.
- Nếu nút print: mock `window.print` và xác nhận được gọi.
- Nếu nút mở modal/dropdown: modal/dropdown phải mở, hiển thị dữ liệu theo context record.
- Nếu nút "đang phát triển" là chủ ý hiện tại, phải ghi rõ là intentional placeholder, không tính là dữ liệu hardcode.

### Phase E: Sửa và nghiệm thu

Chỉ sửa khi đã có một trong các kết luận:

- UI hiển thị dữ liệu không có trong API/DB.
- UI không cập nhật khi API response thay đổi.
- Button không gọi API/không đổi state/không đúng route như kỳ vọng.
- API thiếu endpoint cần thiết để thay hardcode.
- Mapping response sai field.
- Loading/error/empty state khiến người dùng thấy dữ liệu sai.

Sau khi sửa:

1. Chạy lại spec vừa viết.
2. Chạy spec liên quan có sẵn.
3. Chạy build hoặc typecheck nếu sửa TypeScript/API.
4. Cập nhật báo cáo với file đã sửa, test đã chạy, pass/fail.

## 6. Template Playwright bắt network và so UI/API

Dùng template này làm nền, chỉnh selector theo từng trang.

```ts
import { test, expect } from '@playwright/test';

test.describe('<Module> hardcode audit', () => {
  test.beforeEach(async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.addInitScript(() => {
      window.print = () => console.log('Mocked window.print()');
    });
  });

  test('<route> loads data from API, not hardcoded fallback', async ({ page }) => {
    const apiResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/<endpoint>') &&
      response.request().method() === 'GET'
    );

    await page.goto('/<route>');
    await page.waitForLoadState('networkidle');

    const apiResponse = await apiResponsePromise;
    expect(apiResponse.ok()).toBeTruthy();
    const payload = await apiResponse.json();

    const items = Array.isArray(payload) ? payload : payload.data ?? payload.items ?? [];

    if (items.length === 0) {
      await expect(page.locator('table tbody tr')).toHaveCount(0);
      await expect(page.getByText(/không có|chưa có|no data/i)).toBeVisible();
      return;
    }

    const first = items[0];
    const expectedText = first.code ?? first.name ?? first.title;
    expect(expectedText).toBeTruthy();
    await expect(page.getByText(String(expectedText)).first()).toBeVisible();
  });

  test('<button/filter> sends correct API request', async ({ page }) => {
    await page.goto('/<route>');
    await page.waitForLoadState('networkidle');

    const responsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/<endpoint>') &&
      response.request().method() === 'GET'
    );

    await page.getByRole('button', { name: /lọc|tìm kiếm|search/i }).click();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();

    const url = new URL(response.url());
    expect(url.searchParams.toString()).not.toBe('');
  });
});
```

## 7. Template seed DB cho dữ liệu ổn định

Nếu trang cần dữ liệu ổn định để chứng minh UI lấy từ API, dùng `e2e/utils/db.ts`. Không seed bừa dữ liệu thật không cleanup.

```ts
import { test, expect } from '@playwright/test';
import { connectDB, closeDB } from '../utils/db';

const TEST_CODE = 'E2E_HARDCODE_AUDIT_001';

test.describe('Module hardcode audit with DB seed', () => {
  let db: any;

  test.beforeAll(async () => {
    db = await connectDB();
    await db.collection('<collection>').deleteMany({ code: TEST_CODE });
    await db.collection('<collection>').insertOne({
      code: TEST_CODE,
      name: 'Dữ liệu audit hardcode',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  test.afterAll(async () => {
    await db.collection('<collection>').deleteMany({ code: TEST_CODE });
    await closeDB();
  });

  test('UI renders seeded DB data through API', async ({ page }) => {
    const responsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/<endpoint>') &&
      response.request().method() === 'GET'
    );

    await page.goto('/<route>');
    await page.waitForLoadState('networkidle');
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();

    await expect(page.getByText(TEST_CODE)).toBeVisible();
    await expect(page.getByText('Dữ liệu audit hardcode')).toBeVisible();
  });
});
```

## 8. Cách quét DOM sâu để không bỏ sót nút

Trong Playwright, trước khi lập testcase, chạy đoạn evaluate để lấy inventory thô. Sau đó đọc lại bằng mắt và bổ sung selector tốt hơn.

```ts
const inventory = await page.evaluate(() => {
  const visible = (el: Element) => {
    const style = window.getComputedStyle(el);
    const rect = (el as HTMLElement).getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };

  const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);

  return {
    buttons: Array.from(document.querySelectorAll('button,[role="button"],a,input[type="button"],input[type="submit"]'))
      .filter(visible)
      .map((el, index) => ({
        index,
        tag: el.tagName.toLowerCase(),
        text: text(el),
        aria: el.getAttribute('aria-label'),
        title: el.getAttribute('title'),
        href: el.getAttribute('href'),
        className: (el as HTMLElement).className,
      })),
    inputs: Array.from(document.querySelectorAll('input,select,textarea'))
      .filter(visible)
      .map((el, index) => ({
        index,
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type'),
        name: el.getAttribute('name'),
        placeholder: el.getAttribute('placeholder'),
        aria: el.getAttribute('aria-label'),
        value: (el as HTMLInputElement).value,
      })),
    tables: Array.from(document.querySelectorAll('table'))
      .filter(visible)
      .map((table, index) => ({
        index,
        headers: Array.from(table.querySelectorAll('th')).map(text),
        rowCount: table.querySelectorAll('tbody tr').length,
      })),
    links: Array.from(document.querySelectorAll('a[href]'))
      .filter(visible)
      .map((el, index) => ({
        index,
        text: text(el),
        href: el.getAttribute('href'),
      })),
  };
});

console.log(JSON.stringify(inventory, null, 2));
```

Sau khi có inventory thô:

- Click từng dropdown/menu để lộ các nút ẩn rồi chạy lại inventory.
- Mở từng tab rồi chạy lại inventory.
- Mở từng modal/drawer/detail rồi chạy lại inventory.
- Nếu bảng có row actions chỉ hiện khi hover, hover từng row rồi inventory lại.
- Nếu mobile có drawer/header khác desktop, set viewport mobile rồi inventory lại.

## 9. Cách đọc source để xác nhận hardcode

Khi nghi hardcode, tìm trong component và API liên quan:

```bash
rg "mock|sample|demo|fake|placeholder|TODO|hardcode|static|dummy" client/src server/src
rg "const .*=\s*\[" client/src/modules
rg "useState\(\[" client/src/modules
rg "Array.from|new Array|Math.random" client/src/modules
```

Nhưng không được kết luận chỉ vì thấy array. Có thể đó là config cột hoặc enum hợp lệ. Phải đối chiếu:

- Array đó có phải dữ liệu nghiệp vụ hiển thị trên table/card/report không?
- Có API nào tương ứng không?
- Khi API response thay đổi, UI có đổi không?
- Nếu API lỗi, UI có hiển thị dữ liệu mẫu không?

## 10. Quy tắc sửa frontend

Khi thay hardcode bằng API:

1. Dùng `http` từ `client/src/core/api/http.ts`.
2. Tạo hoặc dùng file API helper trong `client/src/core/api` nếu module đã có pattern.
3. State tối thiểu phải có:
   - `data`
   - `loading`
   - `error`
   - filter/search/pagination state nếu có
4. Không để fallback dữ liệu mẫu sau khi API fail.
5. Empty state phải phản ánh dữ liệu thật.
6. Số tiền/số lượng/ngày phải format ở UI, nhưng giá trị gốc lấy từ API.
7. Filter phải gửi params hoặc lọc trên dataset API thật, tùy cách backend hiện có.
8. Mutation phải cập nhật UI bằng refetch hoặc cập nhật state nhất quán.

Ví dụ pattern:

```ts
const [items, setItems] = useState<Item[]>([]);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  let cancelled = false;
  setLoading(true);
  setError(null);

  http.get('/products', { params: filters })
    .then((response) => {
      if (!cancelled) setItems(response.data.data ?? response.data.items ?? response.data ?? []);
    })
    .catch((err) => {
      if (!cancelled) {
        setItems([]);
        setError(err?.response?.data?.message ?? 'Không tải được dữ liệu');
      }
    })
    .finally(() => {
      if (!cancelled) setLoading(false);
    });

  return () => {
    cancelled = true;
  };
}, [filters]);
```

## 11. Quy tắc sửa backend

Chỉ thêm/sửa API khi frontend cần dữ liệu thật mà backend chưa có endpoint hoặc endpoint trả thiếu field.

Khi sửa backend:

- Tìm route trong `server/src/modules/<module>/*.routes.ts`.
- Tìm model trong `server/src/modules/<module>/*.models.ts`.
- Giữ middleware auth hiện có.
- Không phá response shape đang được spec cũ dùng.
- Với report, kiểm tra `server/src/modules/reports/reports.routes.ts`.
- Với CRUD chuẩn, kiểm tra `server/src/core/utils/routeFactory.ts` và `server/src/core/utils/crud.ts`.
- Nếu thêm endpoint mới, thêm e2e/API evidence tương ứng.

## 12. Tiêu chí cho từng loại UI

### Bảng dữ liệu

Phải test:

- Header đúng.
- Số row khớp API hoặc ít nhất row chứa seed.
- Không hiển thị row giả khi API empty.
- Pagination đổi page và gọi API/đổi data đúng.
- Sort nếu có.
- Search/filter nếu có.
- Row action mở đúng record, không mở dữ liệu mẫu.

### KPI/card/report

Phải test:

- Giá trị số khớp API/DB seed.
- Date range/filter làm thay đổi request.
- Khi API empty, KPI về 0 hoặc empty hợp lý, không giữ số mẫu.
- Export/print nếu có.

### Form tạo/sửa

Phải test:

- Select option lấy từ API nếu là dữ liệu động.
- Submit gửi body đúng.
- Validation hiển thị khi thiếu field.
- Sau lưu, DB/API có record.
- Edit load đúng record, không load default giả.

### Modal/detail/drawer

Phải test:

- Mở từ đúng row.
- Nội dung modal chứa ID/code/name của record được chọn.
- Nếu modal cần API detail, phải bắt request detail.
- Đóng modal hoạt động.

### Dropdown/filter/tab

Phải test:

- Dropdown mở đầy đủ option.
- Option động khớp API.
- Chọn option làm request hoặc data thay đổi.
- Tab nào cũng được inventory riêng, không chỉ tab đầu tiên.

## 13. Báo cáo bắt buộc sau mỗi module

Sau khi hoàn thành một module, tạo hoặc cập nhật file báo cáo:

```text
docs/hardcode-audit/<module>.md
```

Format:

~~~md
# Hardcode Audit: <module>

## Routes đã quét

| Route | Component | Inventory done | Testcase done | E2E done | Fix done | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `/products` | `client/src/...` | yes | yes | yes | yes/no | pass/fail |

## Phát hiện

| ID | Route | Loại lỗi | Bằng chứng | File sửa | Trạng thái |
| --- | --- | --- | --- | --- | --- |

## Test đã chạy

```bash
cd e2e
npx playwright test tests/<module>-hardcode-audit.spec.ts --project=chromium
```

Kết quả: pass/fail.

## Còn lại

- ...
~~~

Không được báo "đã quét toàn bộ" nếu bảng trên chưa có đủ route của module.

## 14. Checklist nghiệm thu cuối cùng

Một module chỉ được coi là xong khi tất cả đều đạt:

- Có inventory từng route.
- Có testcase từng vùng dữ liệu và từng nút.
- Có e2e chạy được.
- Mỗi dữ liệu nghiệp vụ quan trọng có bằng chứng API/DB.
- Không còn UI hiển thị dữ liệu mẫu khi API empty/error.
- Nút chức năng không còn "click không làm gì" trừ khi được ghi rõ intentional placeholder.
- Spec liên quan pass.
- Không phát sinh console error nghiêm trọng.
- Báo cáo module đã cập nhật.

Toàn dự án chỉ được coi là xong khi:

- Tất cả route trong `client/src/main.tsx` đã được phân loại: done, intentionally skipped, route missing, hoặc blocked.
- Tất cả hardcode nghiệp vụ đã được fix hoặc có lý do kỹ thuật rõ ràng.
- E2E audit mới và e2e liên quan đều pass.
- Có báo cáo tổng hợp `docs/hardcode-audit/README.md`.

## 15. Quy trình làm việc đề xuất cho Gemini

Làm theo vòng lặp này, từng module một:

1. Đọc `client/src/main.tsx`, `client/src/core/layout/AppLayout.tsx`, component route và route backend liên quan.
2. Mở trang bằng Playwright.
3. Chạy DOM inventory desktop.
4. Mở tất cả dropdown/tab/modal/drawer/menu row action rồi inventory lại.
5. Nếu cần, chạy mobile inventory.
6. Ghi inventory vào báo cáo module.
7. Lập testcase table cho từng UI item.
8. Viết e2e spec.
9. Chạy spec để xác nhận lỗi.
10. Sửa frontend/backend đúng phạm vi.
11. Chạy lại spec.
12. Chạy spec liên quan sẵn có.
13. Cập nhật báo cáo.
14. Sang route tiếp theo.

## 16. Câu lệnh bắt đầu cho Gemini

Khi bắt đầu, hãy phản hồi bằng kế hoạch ngắn, sau đó làm ngay module đầu tiên. Không hỏi lại nếu không bị thiếu thông tin nghiêm trọng.

Prompt gợi ý:

```text
Hãy làm theo file `docs/GEMINI_HARDCODE_DATA_AUDIT.md`.
Bắt đầu với module `<tên module>`.
Yêu cầu:
1. Quét sâu từng route trong module.
2. Lập inventory toàn bộ nút, filter, table, KPI, modal, dropdown, pagination, tab.
3. Lập testcase cho từng item.
4. Viết/chỉnh e2e Playwright trong `e2e/tests`.
5. Bắt API và so UI/API/DB để phát hiện hardcode.
6. Nếu có hardcode hoặc hiển thị sai thì sửa code.
7. Chạy test liên quan.
8. Cập nhật báo cáo trong `docs/hardcode-audit/<module>.md`.
Không được kết luận bằng quan sát nông. Mỗi kết luận phải có bằng chứng.
```
