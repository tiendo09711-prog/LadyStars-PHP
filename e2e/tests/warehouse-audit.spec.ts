import { test, expect } from '@playwright/test';
import { connectDB, closeDB } from '../utils/db';

const TEST_PRODUCT_CODE = 'E2E_AUDIT_01';

test.describe('Warehouse Audit - Automation', () => {
  let db: any;
  let branchId: any;
  let testProductId: any;

  test.beforeAll(async () => {
    db = await connectDB();
    
    // Clear old data
    await db.collection('products').deleteMany({ code: TEST_PRODUCT_CODE });
    
    const branch = await db.collection('branches').findOne({ code: 'CN001' });
    branchId = branch ? branch._id : null;
    if (!branchId) throw new Error("Missing branch for testing!");

    // Insert test product
    const productRes = await db.collection('products').insertOne({
      code: TEST_PRODUCT_CODE,
      name: 'Sản phẩm Test Kiểm kê',
      qty: 20, // global qty
      price: 100000,
      cost: 50000,
      unit: 'Cái',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    testProductId = productRes.insertedId;

    // Set stock 20 in branch
    await db.collection('productbranchstocks').deleteMany({ productId: testProductId });
    await db.collection('productbranchstocks').insertOne({
      productId: testProductId,
      branchId: branchId,
      qty: 20
    });
  });

  test.afterAll(async () => {
    // Cleanup
    await db.collection('products').deleteMany({ code: TEST_PRODUCT_CODE });
    await db.collection('productbranchstocks').deleteMany({ productId: testProductId });
    await db.collection('inventorychecks').deleteMany({ note: /E2E Test/ });
    await closeDB();
  });

  test('Luồng Kiểm kê kho và bù trừ', async ({ page }) => {
    page.on('request', req => {
      if (req.url().includes('/api/warehouse/checks') && req.method() === 'POST') {
        console.log('POST /checks Payload:', req.postData());
      }
    });
    
    page.on('response', async res => {
      if (res.url().includes('/api/')) {
        let msg = '';
        if (res.status() === 500 || res.status() === 400 || res.status() === 201) {
          msg = await res.text().catch(() => '');
        }
        console.log(`API Response: ${res.url()} [${res.status()}] ${msg.substring(0, 200)}`);
      }
    });

    await page.goto('/warehouse/audit');
    await page.waitForLoadState('networkidle');

    // Mở trang tạo phiếu kiểm kê
    await Promise.all([
      page.waitForResponse(res => res.url().includes('/system/branches') && res.status() === 200),
      page.getByRole('button', { name: 'Tạo phiếu kiểm kho' }).click()
    ]);
    
    await expect(page).toHaveURL(/.*\/warehouse\/audit\/create/);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000); // React render

    // Chọn Kho
    const warehouseSelect = page.locator('.filter-panel select').first();
    await warehouseSelect.selectOption({ value: branchId.toString() });

    // Điền ghi chú
    await page.getByPlaceholder('Nhập ghi chú...').fill('E2E Test - Kiểm kê');

    // Tìm sản phẩm
    const searchInput = page.getByPlaceholder('Nhập tên sản phẩm hoặc mã vạch để thêm');
    await searchInput.fill(TEST_PRODUCT_CODE);
    await page.waitForTimeout(1000); // Wait for dropdown

    // Chọn sản phẩm từ dropdown
    await page.locator('div', { hasText: new RegExp('Mã: ' + TEST_PRODUCT_CODE) }).last().click();

    // Sửa Tồn thực tế thành 25 (Bù thừa 5 cái)
    const row = page.locator('table.data-table tbody tr').last();
    const actualStockInput = row.locator('input[type="number"]');
    await actualStockInput.fill('25');

    // Nhập lý do
    const reasonInput = row.locator('input[type="text"]').last();
    await reasonInput.fill('Hàng bị sót trong kho');

    // Lưu phiếu
    await page.getByRole('button', { name: 'Lưu phiếu' }).first().click();

    // Chờ quay về trang danh sách hoặc lấy lỗi nếu có
    try {
      await page.waitForURL(/.*\/warehouse\/audit$/, { timeout: 3000 });
    } catch {
      const errorMsg = await page.locator('span').filter({ has: page.locator('text="Cửa hàng"').or(page.locator('text="sản phẩm"')).or(page.locator('text="Lỗi"')) }).first().textContent().catch(() => null);
      throw new Error("Lưu phiếu thất bại. Lỗi giao diện: " + errorMsg);
    }

    // KIỂM TRA DATABASE
    const allStocks = await db.collection('productbranchstocks').find({ productId: testProductId }).toArray();
    console.log('All Stocks for testProductId:', allStocks);
    
    const logs = await db.collection('productlogs').find({ productId: testProductId }).toArray();
    console.log('All Logs for testProductId:', logs);
    
    const stock = allStocks.find((s: any) => s.branchId.toString() === branchId.toString());
    // Tồn kho mới phải là 25
    const has25 = allStocks.some((s: any) => s.qty === 25);
    expect(has25).toBe(true);
  });
});
