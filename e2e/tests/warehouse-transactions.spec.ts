import { test, expect } from '@playwright/test';
import { connectDB, closeDB } from '../utils/db';
import { ObjectId } from 'mongodb';

const TEST_PRODUCT_CODE = 'E2E_WH_01';

test.describe('Warehouse Transactions - Automation', () => {
  let db: any;
  let branchCN001Id: any;
  let testProductId: any;

  test.beforeAll(async () => {
    db = await connectDB();
    
    // Clear old data
    await db.collection('products').deleteMany({ code: TEST_PRODUCT_CODE });
    
    const branch = await db.collection('branches').findOne({ code: 'CN001' });
    branchCN001Id = branch ? branch._id : null;

    // Insert test product with 10 stock
    const productRes = await db.collection('products').insertOne({
      code: TEST_PRODUCT_CODE,
      name: 'Sản phẩm Test Kho Nhập Xuất',
      qty: 10,
      price: 100000,
      cost: 50000,
      unit: 'Cái',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    testProductId = productRes.insertedId;

    if (branchCN001Id) {
      await db.collection('productbranchstocks').insertOne({
        productId: testProductId,
        branchId: branchCN001Id,
        qty: 10
      });
    }
  });

  test.afterAll(async () => {
    // Cleanup
    await db.collection('products').deleteMany({ code: TEST_PRODUCT_CODE });
    await db.collection('productbranchstocks').deleteMany({ productId: testProductId });
    // Cleanup vouchers created during test via note regex
    await db.collection('inventoryvouchers').deleteMany({ note: /E2E Test/ });
    await db.collection('inventoryproducts').deleteMany({ productCode: TEST_PRODUCT_CODE });
    await closeDB();
  });

  test('Luồng Nhập kho và kiểm tra tồn kho', async ({ page }) => {
    await page.goto('/warehouse/transactions');
    await page.waitForLoadState('networkidle');

    // Mở trang tạo phiếu nhập
    await page.locator('.page-actions').getByRole('button', { name: 'Tạo phiếu XNK' }).click();
    await page.locator('.page-actions .dropdown-menu').getByRole('button', { name: 'Nhập kho', exact: true }).click();

    await expect(page).toHaveURL(/.*\/warehouse\/transactions\/vouchers\/import/);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000); // Wait for product list to load from API

    // Chọn Chi nhánh trung tâm
    await page.locator('select').first().selectOption({ label: 'Chi nhánh trung tâm' });

    // Ghi chú cho phiếu để dễ xoá sau này
    await page.getByPlaceholder('Nhập ghi chú cho toàn bộ phiếu nhập').fill('E2E Test - Nhập kho');

    // Xoá các dòng mặc định
    let trashButtons = page.locator('table.data-table tbody .icon-button.danger');
    let count = await trashButtons.count();
    while (count > 0) {
      await trashButtons.nth(0).click();
      await page.waitForTimeout(100);
      count = await trashButtons.count();
    }

    // Dùng F3 (search bar) để thêm sản phẩm
    const searchInput = page.locator('#product-f3-search');
    await searchInput.fill(TEST_PRODUCT_CODE);
    await searchInput.press('Enter');
    await page.waitForTimeout(500);

    const row = page.locator('table.data-table tbody tr').filter({ hasText: TEST_PRODUCT_CODE }).last();
    
    // Đổi số lượng nhập thành 5
    const qtyInput = row.locator('input[type="number"]').first();
    await qtyInput.fill('5');

    // Lưu phiếu nhập
    await page.getByRole('button', { name: 'Lưu phiếu nhập' }).click();

    // Xác nhận đã lưu thành công bằng Toast
    await expect(page.locator('.status-badge.success')).toContainText('Tạo thành công phiếu nhập kho', { timeout: 5000 });

    // Sẽ tự động quay lại trang chi tiết danh sách phiếu sau 1.5s
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/.*\/warehouse\/transactions/);

    // Kiểm tra trong DB: ProductBranchStock phải được cộng 5 = 15
    const stock = await db.collection('productbranchstocks').findOne({ productId: testProductId, branchId: branchCN001Id });
    expect(stock.qty).toBe(15);
  });

  test('Luồng Xuất kho và kiểm tra tồn kho', async ({ page }) => {
    await page.goto('/warehouse/transactions');
    await page.waitForLoadState('networkidle');

    // Mở trang tạo phiếu xuất
    await page.locator('.page-actions').getByRole('button', { name: 'Tạo phiếu XNK' }).click();
    await page.locator('.page-actions .dropdown-menu').getByRole('button', { name: 'Xuất kho', exact: true }).click();

    await expect(page).toHaveURL(/.*\/warehouse\/transactions\/vouchers\/export/);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000); // Wait for product list

    // Chọn Chi nhánh trung tâm
    await page.locator('select').first().selectOption({ label: 'Chi nhánh trung tâm' });

    // Ghi chú
    await page.getByPlaceholder('Nhập ghi chú cho toàn bộ phiếu xuất').fill('E2E Test - Xuất kho');

    // Xoá các dòng mặc định
    let trashButtons = page.locator('table.data-table tbody .icon-button.danger');
    let count = await trashButtons.count();
    while (count > 0) {
      await trashButtons.nth(0).click();
      await page.waitForTimeout(100);
      count = await trashButtons.count();
    }

    // Tìm sản phẩm bằng F3
    const searchInput = page.locator('#product-f3-search');
    await searchInput.fill(TEST_PRODUCT_CODE);
    await searchInput.press('Enter');
    await page.waitForTimeout(500);

    const row = page.locator('table.data-table tbody tr').filter({ hasText: TEST_PRODUCT_CODE }).last();
    
    // Đổi số lượng xuất thành 3 (tồn hiện tại là 15 do test trên đã nhập 5)
    // Tồn kho hiển thị trên UI ở cột "Tồn" cũng nên là 15.
    const qtyInput = row.locator('input[type="number"]').first();
    await qtyInput.fill('3');

    // Lưu phiếu xuất
    await page.getByRole('button', { name: 'Lưu phiếu xuất' }).click();

    // Xác nhận lưu thành công
    await expect(page.locator('.status-badge.success')).toContainText('Tạo thành công phiếu xuất kho', { timeout: 5000 });

    await page.waitForTimeout(2000);
    
    // Kiểm tra DB: ProductBranchStock phải giảm 3 (15 - 3 = 12)
    const stock = await db.collection('productbranchstocks').findOne({ productId: testProductId, branchId: branchCN001Id });
    expect(stock.qty).toBe(12);
  });
});
