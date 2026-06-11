# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: retail-revenue.spec.ts >> Retail Invoice -> Revenue Report E2E Flow >> Should create a retail invoice and reflect in revenue
- Location: tests\retail-revenue.spec.ts:20:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=E2E_PROD_123').nth(1)
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=E2E_PROD_123').nth(1)

```

```yaml
- button "Close menu"
- complementary:
  - text: LS
  - strong: LadyStars
  - button "Close menu":
    - img
  - navigation:
    - button "Tổng quan":
      - text: Tổng quan
      - img
    - button "Sản phẩm":
      - text: Sản phẩm
      - img
    - button "Kho hàng":
      - text: Kho hàng
      - img
    - button "Kênh bán - Cửa hàng":
      - text: Kênh bán - Cửa hàng
      - img
    - button "Đơn hàng":
      - text: Đơn hàng
      - img
    - button "Khách hàng":
      - text: Khách hàng
      - img
    - button "Kế toán":
      - text: Kế toán
      - img
    - button "Vận hành":
      - text: Vận hành
      - img
    - button "Báo Cáo":
      - text: Báo Cáo
      - img
    - button "Quản lý nhân viên":
      - text: Quản lý nhân viên
      - img
  - link "Thiết lập cài đặt":
    - /url: /settings
    - img
    - text: Thiết lập cài đặt
- banner:
  - button "Open menu":
    - img
  - text: Admin Workspace
  - strong: Quản trị vận hành LadyStars
  - text: A
  - strong: Admin
  - text: admin@gmail.com
  - button "Đăng xuất":
    - img
- main:
  - button:
    - img
  - heading "Thêm Hóa Đơn Lẻ Mới" [level=1]
  - img
  - text: "Kho xuất: Kho HCM (HCM)"
  - button "Hủy bỏ"
  - button "Lưu hóa đơn":
    - img
    - text: Lưu hóa đơn
  - img
  - heading "Thông Tin Chung & Nhân Viên" [level=2]
  - text: Mã hóa đơn *
  - img
  - textbox: HDLE-738225
  - text: Ngày lập hóa đơn *
  - img
  - textbox: 00:48:29 12/6/2026
  - text: Kiểu hóa đơn *
  - combobox:
    - option "Xuất bán lẻ [L]" [selected]
    - option "Xuất mẫu [M]"
    - option "Tặng kèm [T]"
    - option "Khác"
  - text: Nguồn đơn hàng
  - textbox: Cửa hàng
  - text: Nhân viên bán hàng
  - combobox:
    - option "-- Chọn nhân viên --"
    - option "Đỗ Tiến"
    - option "Admin" [selected]
  - img
  - heading "Thông Tin Khách Hàng" [level=2]
  - text: Tên khách hàng *
  - img
  - textbox "Nhập họ tên khách hàng": Khach hang Test E2E
  - text: Số điện thoại
  - img
  - textbox "Nhập số điện thoại"
  - text: Email
  - img
  - textbox "example@mail.com"
  - text: Ngày sinh
  - img
  - textbox
  - text: Facebook
  - img
  - textbox "Link hoặc tên Facebook"
  - text: Mã thẻ thành viên / VIP
  - textbox "Mã thẻ khách hàng"
  - text: Cấp độ thành viên
  - combobox:
    - option "-- Chưa xếp hạng --" [selected]
    - option "Thành viên"
    - option "Thân thiết"
    - option "Vàng (Gold)"
    - option "Kim cương (Diamond)"
  - text: Khu vực (Tỉnh, Quận, Phường)
  - img
  - textbox "Tỉnh/Thành, Quận/Huyện, Phường/Xã"
  - text: Địa chỉ chi tiết
  - textbox "Số nhà, ngõ ngách, tên đường..."
  - img
  - heading "Thông Tin Sản Phẩm & Đơn Giá" [level=2]
  - text: Tìm chọn sản phẩm *
  - img
  - textbox "Tìm theo mã hoặc tên sản phẩm...": E2E_PROD_123
  - text: "Sản phẩm Test E2E Mã: E2E_PROD_123 | Giá: 0đ Tồn kho: 100 Mã sản phẩm (Tự điền)"
  - textbox
  - text: Đơn giá (VNĐ)
  - img
  - spinbutton
  - text: Số lượng
  - spinbutton: "1"
  - text: Mã giảm giá / Coupon
  - textbox "Mã coupon áp dụng"
  - checkbox "Tự động tính tổng tiền dựa trên đơn giá, số lượng, chiết khấu và VAT (%)" [checked]
  - text: Tự động tính tổng tiền dựa trên đơn giá, số lượng, chiết khấu và VAT (%)
  - img
  - heading "Thanh Toán & Tóm Tắt" [level=2]
  - text: "Tạm tính (Sản phẩm): 0 đ Chiết khấu trực tiếp (đ):"
  - spinbutton
  - text: "VAT (%):"
  - spinbutton
  - img
  - text: Tổng tiền phải thanh toán 0 đ Tính toán tự động dựa trên chiết khấu & thuế VAT Phương thức thanh toán
  - button "Tiền mặt"
  - button "Chuyển khoản"
  - button "Quẹt thẻ"
  - button "Khác"
  - text: Trạng thái hóa đơn
  - combobox:
    - option "Mới (Chưa thanh toán)" [selected]
    - option "Đã thanh toán"
    - option "Đã hủy"
  - text: Ghi chú hóa đơn
  - textbox "Ghi chú thêm về đơn hàng hoặc giao hàng..."
  - button "Xác nhận & Lưu":
    - img
    - text: Xác nhận & Lưu
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { seedProduct, cleanupTestData, closeDB } from '../utils/db';
  3  | 
  4  | const TEST_PRODUCT_CODE = 'E2E_PROD_123';
  5  | const TEST_BRANCH_ID = '6a05946e67c30b7a39107bcb'; // Kho HCM
  6  | 
  7  | test.describe('Retail Invoice -> Revenue Report E2E Flow', () => {
  8  |   
  9  |   test.beforeAll(async () => {
  10 |     // 1. Seed the test product before running the UI tests
  11 |     await seedProduct(TEST_PRODUCT_CODE);
  12 |   });
  13 | 
  14 |   test.afterAll(async () => {
  15 |     // Clean up to keep DB pristine
  16 |     await cleanupTestData(TEST_PRODUCT_CODE);
  17 |     await closeDB();
  18 |   });
  19 | 
  20 |   test('Should create a retail invoice and reflect in revenue', async ({ page }) => {
  21 |     // 2. Navigate directly to create invoice page (using Kho HCM branchId)
  22 |     await page.goto(`/sales-channels/admin/retail/create?branchId=${TEST_BRANCH_ID}`);
  23 | 
  24 |     // Wait for the form to render
  25 |     await expect(page.locator('input[placeholder="Nhập họ tên khách hàng"]')).toBeVisible();
  26 | 
  27 |     // 3. Fill Customer Name
  28 |     await page.fill('input[placeholder="Nhập họ tên khách hàng"]', 'Khach hang Test E2E');
  29 |     // Hide dropdown if it appears
  30 |     await page.keyboard.press('Escape');
  31 | 
  32 |     // 4. Fill Product Code to search
  33 |     // We assume the placeholder is "Mã hoặc tên sản phẩm" or similar
  34 |     const searchInput = page.locator('input[placeholder="Tìm theo mã hoặc tên sản phẩm..."]');
  35 |     await searchInput.fill(TEST_PRODUCT_CODE);
  36 | 
  37 |     // Wait for dropdown list to appear containing our test product
> 38 |     await expect(page.locator(`text=${TEST_PRODUCT_CODE}`).nth(1)).toBeVisible({ timeout: 5000 });
     |                                                                    ^ Error: expect(locator).toBeVisible() failed
  39 |     
  40 |     // Select the product
  41 |     await page.locator(`text=${TEST_PRODUCT_CODE}`).nth(1).click();
  42 | 
  43 |     // Fill Price
  44 |     // Product price input might be there, we'll just click Save
  45 |     const submitBtn = page.locator('button:has-text("Lưu hóa đơn")');
  46 |     await submitBtn.click();
  47 | 
  48 |     // Wait for success toast
  49 |     await expect(page.locator('text=Lưu thành công').or(page.locator('text=thành công'))).toBeVisible({ timeout: 5000 });
  50 | 
  51 |     // 5. Navigate to Revenue Report
  52 |     await page.goto('/reports/revenue/time');
  53 | 
  54 |     // Select the branch "Kho HCM" in report filter
  55 |     // Wait for the branch dropdown
  56 |     await page.click('button:has-text("Kho hàng")');
  57 |     await page.click('text=Kho HCM');
  58 | 
  59 |     // Filter by "Hôm nay"
  60 |     await page.click('button:has-text("Khoảng ngày")');
  61 |     await page.click('text=Hôm nay');
  62 | 
  63 |     // Wait for report table/chart to load
  64 |     // Verify our revenue increased by checking the summary/chart
  65 |     // Just looking for the number 500.000 in the table/cards
  66 |     await expect(page.locator('text=500.000').first()).toBeVisible({ timeout: 5000 });
  67 |   });
  68 | 
  69 | });
  70 | 
```