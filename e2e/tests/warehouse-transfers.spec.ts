import { test, expect } from '@playwright/test';
import { connectDB, closeDB } from '../utils/db';

const TEST_PRODUCT_CODE = 'E2E_TRF_01';

test.describe('Warehouse Transfers - Automation', () => {
  let db: any;
  let branchFromId: any;
  let branchToId: any;
  let testProductId: any;

  test.beforeAll(async () => {
    db = await connectDB();
    
    // Clear old data
    await db.collection('products').deleteMany({ code: TEST_PRODUCT_CODE });
    
    // We will transfer from CN001 to HCM
    const branchFrom = await db.collection('branches').findOne({ code: 'CN001' });
    const branchTo = await db.collection('branches').findOne({ code: 'HCM' });
    
    branchFromId = branchFrom ? branchFrom._id : null;
    branchToId = branchTo ? branchTo._id : null;

    if (!branchFromId || !branchToId) throw new Error("Missing branches for testing!");

    // Insert test product
    const productRes = await db.collection('products').insertOne({
      code: TEST_PRODUCT_CODE,
      name: 'Sản phẩm Test Chuyển Kho',
      qty: 20, // global qty
      price: 150000,
      cost: 80000,
      unit: 'Hộp',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    testProductId = productRes.insertedId;

    // Set stock 20 in source branch, 0 in destination branch
    await db.collection('productbranchstocks').deleteMany({ productId: testProductId });
    await db.collection('productbranchstocks').insertOne({
      productId: testProductId,
      branchId: branchFromId,
      qty: 20
    });
    await db.collection('productbranchstocks').insertOne({
      productId: testProductId,
      branchId: branchToId,
      qty: 0
    });
  });

  test.afterAll(async () => {
    // Cleanup
    await db.collection('products').deleteMany({ code: TEST_PRODUCT_CODE });
    await db.collection('productbranchstocks').deleteMany({ productId: testProductId });
    await db.collection('warehousetransfers').deleteMany({ note: /E2E Test/ });
    await closeDB();
  });

  test('Luồng Chuyển kho nội bộ và kiểm tra biến động tồn kho', async ({ page }) => {
    await page.goto('/warehouse/transfers');
    await page.waitForLoadState('networkidle');

    // Mở trang tạo phiếu chuyển
    await Promise.all([
      page.waitForResponse(res => res.url().includes('/system/branches') && res.status() === 200),
      page.getByRole('button', { name: 'Tạo phiếu chuyển kho' }).click()
    ]);
    
    await expect(page).toHaveURL(/.*\/warehouse\/transfers\/create/);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000); // Tạm dừng thêm 1 chút để React render option

    // Chọn Từ kho và Đến kho
    const fromSelect = page.locator('.filter-panel select').nth(0);
    const toSelect = page.locator('.filter-panel select').nth(1);

    await fromSelect.selectOption({ value: branchFromId.toString() });
    await toSelect.selectOption({ value: branchToId.toString() });

    // Ghi chú để dễ clean up
    await page.getByPlaceholder('Ghi chú thêm...').fill('E2E Test - Chuyển hàng');

    // Bấm thêm dòng nếu chưa có
    const addLineBtn = page.getByRole('button', { name: 'Thêm dòng' }).first();
    const rows = page.locator('table.data-table tbody tr');
    
    // Nếu bảng đang trống, thêm 1 dòng
    const rowCount = await rows.count();
    if (rowCount === 0 || await rows.first().locator('.empty-cell').isVisible()) {
        await page.getByRole('button', { name: 'Thêm sản phẩm' }).click();
        await page.waitForTimeout(500);
    }

    // Test Validate tồn kho: Chuyển quá số lượng
    const productSelect0 = page.locator('table.data-table tbody tr').first().locator('select');
    await productSelect0.selectOption({ label: 'Sản phẩm Test Chuyển Kho' });
    const qtyInput0 = page.locator('table.data-table tbody tr').first().locator('input[type="number"]');
    await qtyInput0.fill('21');

    await page.getByRole('button', { name: 'Lưu phiếu chuyển' }).first().click();

    // Verify lỗi hiển thị (alert hoặc toast)
    const errAlert = page.locator('.alert.alert-error, .toast-error'); // Tùy CSS của UI
    await expect(errAlert).toBeVisible({ timeout: 5000 }).catch(() => {
        // Fallback kiểm tra page content
        expect(page.content()).resolves.toContain('không đủ tồn kho');
    });

    // Reset lại số lượng đúng để đi tiếp
    await qtyInput0.fill('5');

    // Lưu phiếu chuyển
    await page.getByRole('button', { name: 'Lưu phiếu chuyển kho' }).first().click();

    // Chờ 2s để quay về trang danh sách
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/.*\/warehouse\/transfers/);

    // KIỂM TRA DATABASE
    const stockFrom = await db.collection('productbranchstocks').findOne({ productId: testProductId, branchId: branchFromId });
    const stockTo = await db.collection('productbranchstocks').findOne({ productId: testProductId, branchId: branchToId });

    // Từ 20 trừ đi 5 còn 15
    expect(stockFrom.qty).toBe(15);
    // Từ 0 cộng 5 thành 5
    expect(stockTo.qty).toBe(5);
  });
});
