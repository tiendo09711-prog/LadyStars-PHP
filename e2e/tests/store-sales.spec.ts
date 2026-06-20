import { test, expect } from '@playwright/test';
import { seedProduct, cleanupTestData, connectDB } from '../utils/db';

test.describe('Store Sales E2E Flow', () => {
  const TEST_PRODUCT_CODE = 'E2E-SALES-PROD-01';
  let db: any;
  let testProductId: string;
  let testBranchName = '';
  let testBranchId = '';

  test.beforeAll(async () => {
    db = await connectDB();
    await cleanupTestData(TEST_PRODUCT_CODE);
    await seedProduct(TEST_PRODUCT_CODE);
    
    // Retrieve the _id of the seeded product to clean up references later if needed
    const product = await db.collection('products').findOne({ code: TEST_PRODUCT_CODE });
    if (product) {
      testProductId = product._id.toString();
      const stock = await db.collection('productbranchstocks').findOne({ productId: product._id });
      if (stock?.branchId) {
        testBranchId = stock.branchId.toString();
        const branch = await db.collection('branches').findOne({ _id: stock.branchId });
        testBranchName = branch?.name || '';
      }
    }
  });

  test.afterAll(async () => {
    await cleanupTestData(TEST_PRODUCT_CODE);
    if (db) {
      const saleIds = testProductId
        ? await db.collection('salepayments').find({ 'items.productId': testProductId }).project({ _id: 1 }).toArray()
        : [];
      const paymentIds = saleIds.map((sale: any) => sale._id);
      if (paymentIds.length) {
        await db.collection('productrefunds').deleteMany({ paymentId: { $in: paymentIds } });
      }
      await db.collection('salepayments').deleteMany({ _id: { $in: paymentIds } });
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

    // 4. Chọn kho trong modal branch hiện tại và tiếp tục
    const branchDialog = page.getByRole('dialog');
    await expect(branchDialog.getByRole('heading', { name: /Chọn kho hàng/i })).toBeVisible();
    if (!testBranchName) throw new Error('Unable to resolve seeded stock branch for retail E2E test');
    await branchDialog.getByRole('button', { name: new RegExp(testBranchName) }).click();
    await branchDialog.getByRole('button', { name: 'Chọn' }).click();

    // 5. Form tạo mới hóa đơn
    await expect(page.getByRole('heading', { name: /Thêm hóa đơn bán lẻ/i })).toBeVisible();
    
    // Nhập họ tên khách hàng
    await page.getByLabel('Tên khách hàng *').fill('Test Customer E2E');
    await page.getByLabel('Số điện thoại').fill('0988888888');

    // Tìm kiếm và chọn sản phẩm
    const productSearch = page.locator('#retail-product-search');
    await productSearch.click();
    await productSearch.pressSequentially(TEST_PRODUCT_CODE, { delay: 50 });
    
    // Chờ kết quả search
    await page.waitForSelector(`text=${TEST_PRODUCT_CODE}`);
    await page.click(`text=${TEST_PRODUCT_CODE}`);

    // Đợi sản phẩm được load vào bảng dòng hàng
    await expect(page.locator('table')).toContainText(TEST_PRODUCT_CODE);

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
    if (!testBranchId) throw new Error('Unable to resolve seeded stock branch for wholesale E2E test');
    await page.goto(`http://localhost:5173/sales-channels/store/wholesale/create?branchId=${testBranchId}`);

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
