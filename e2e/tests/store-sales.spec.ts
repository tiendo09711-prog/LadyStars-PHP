import { test, expect } from '@playwright/test';
import { seedProduct, cleanupTestData, connectDB } from '../utils/db';

test.describe('Store Sales E2E Flow', () => {
  const TEST_PRODUCT_CODE = 'E2E-SALES-PROD-01';
  let db: any;
  let testProductId: string;

  test.beforeAll(async () => {
    db = await connectDB();
    await cleanupTestData(TEST_PRODUCT_CODE);
    await seedProduct(TEST_PRODUCT_CODE);
    
    // Retrieve the _id of the seeded product to clean up references later if needed
    const product = await db.collection('products').findOne({ code: TEST_PRODUCT_CODE });
    if (product) {
      testProductId = product._id.toString();
    }
  });

  test.afterAll(async () => {
    await cleanupTestData(TEST_PRODUCT_CODE);
    if (db) {
      // Clean up the created SalePayments matching this product code
      await db.collection('salepayments').deleteMany({ 'items.productId': testProductId });
      await db.collection('productrefunds').deleteMany({});
    }
  });

  test.beforeEach(async ({ page }) => {
    // 1. Đăng nhập
    await page.goto('http://localhost:5173/login');
    const isLoginVisible = await page.locator('input[type="email"]').isVisible().catch(() => false);
    if (isLoginVisible) {
      await page.fill('input[type="email"]', 'admin@gmail.com');
      await page.fill('input[type="password"]', '123456');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2000); // wait for redirect
    }
  });

  test('Should create a Retail Invoice successfully', async ({ page }) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    page.on('response', async res => {
      if (res.status() === 422) {
        console.log('422 Error URL:', res.url());
        console.log('422 Error Body:', await res.text().catch(() => 'no body'));
      }
    });
    
    // 2. Truy cập trang hóa đơn bán lẻ
    await page.goto('http://localhost:5173/sales-channels/store/retail');
    
    // 3. Click "Thêm hóa đơn lẻ"
    await page.click('text=Thêm hóa đơn lẻ');

    // 4. Chọn kho trong Modal và Tiếp tục
    await page.waitForSelector('text=Chọn Kho / Chi Nhánh');
    const firstBranch = page.locator('.modal-card > div:nth-child(2) > div > div').first();
    await firstBranch.click();
    await page.click('button:has-text("Tiếp tục")');

    // 5. Form tạo mới hóa đơn
    await page.waitForSelector('text=Thêm Hóa Đơn Lẻ Mới');
    
    // Nhập họ tên khách hàng
    await page.fill('input[placeholder="Nhập họ tên khách hàng"]', 'Test Customer E2E');
    await page.fill('input[placeholder="Nhập số điện thoại"]', '0988888888');

    // Tìm kiếm và chọn sản phẩm
    await page.click('input[placeholder="Tìm theo mã hoặc tên sản phẩm..."]');
    await page.locator('input[placeholder="Tìm theo mã hoặc tên sản phẩm..."]').pressSequentially(TEST_PRODUCT_CODE, { delay: 50 });
    
    // Chờ kết quả search
    await page.waitForSelector(`text=${TEST_PRODUCT_CODE}`);
    await page.click(`text=${TEST_PRODUCT_CODE}`);

    // Đợi sản phẩm được load vào input (vì form Retail chỉ cho tạo 1 sản phẩm 1 lúc)
    await expect(page.locator(`input[value="${TEST_PRODUCT_CODE}"]`).first()).toBeVisible();

    // Click Lưu hóa đơn
    await page.click('button:has-text("Lưu hóa đơn")');

    // Debug screenshot
    await page.screenshot({ path: 'retail-debug.png', fullPage: true });

    // Kiểm tra thông báo thành công
    await expect(page.locator('text=được lưu')).toBeVisible();
  });
  
  test('Should create a Wholesale Invoice successfully', async ({ page }) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    page.on('response', async res => {
      if (res.status() === 422) {
        console.log('422 Error URL:', res.url());
        console.log('422 Error Body:', await res.text().catch(() => 'no body'));
      }
    });
    
    await page.goto('http://localhost:5173/sales-channels/store/wholesale');
    
    await page.click('text=Tạo hóa đơn sỉ');

    await page.waitForSelector('text=Chọn Kho / Chi Nhánh Bán Sỉ');
    const firstBranch = page.locator('.modal-card > div:nth-child(2) > div > div').first();
    await firstBranch.click();
    await page.click('button:has-text("Tiếp tục")');

    await page.waitForSelector('text=Tạo Mới Hóa Đơn Bán Sỉ');
    
    // Điền tên khách hàng sỉ
    const customerInput = page.locator('input[placeholder="Tên khách đại lý / sỉ"]');
    if (await customerInput.isVisible()) {
      await customerInput.fill('Wholesale Test E2E');
    }

    // Tìm và chọn sản phẩm
    await page.click('input[placeholder*="F3"]');
    await page.locator('input[placeholder*="F3"]').pressSequentially(TEST_PRODUCT_CODE, { delay: 50 });
    
    // Debug screenshot
    await page.screenshot({ path: 'wholesale-debug.png', fullPage: true });

    await page.waitForSelector(`text=${TEST_PRODUCT_CODE}`);
    await page.click(`text=${TEST_PRODUCT_CODE}`);

    await expect(page.locator('table')).toContainText(TEST_PRODUCT_CODE);
    await page.click('#save-invoice-btn');
    await expect(page.locator('text=được lưu')).toBeVisible();
  });

});
