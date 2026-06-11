import { test, expect } from '@playwright/test';
import { connectDB, closeDB } from '../utils/db';
import { ObjectId } from 'mongodb';

const TEST_PROD_CODE = 'E2E_INVENTORY_01';

test.describe('Products Inventory Page - Automation', () => {
  test.beforeAll(async () => {
    const db = await connectDB();
    await db.collection('products').deleteOne({ code: TEST_PROD_CODE });
    
    // Seed sản phẩm
    const productId = new ObjectId();
    await db.collection('products').insertOne({
      _id: productId,
      code: TEST_PROD_CODE,
      name: 'Sản phẩm Test Tồn Kho E2E',
      type: 'product',
      status: 'Mới',
      cost: 50000,
      price: 150000,
      qty: 150,
      createdAt: new Date(),
    });

    // Cấp phát tồn kho cho các chi nhánh
    const hanoiBranch = await db.collection('branches').findOne({ code: 'HN' });
    const hcmBranch = await db.collection('branches').findOne({ code: 'HCM' });

    if (hanoiBranch) {
      await db.collection('productbranchstocks').insertOne({
        productId,
        branchId: hanoiBranch._id,
        qty: 100,
        costPrice: 50000,
      });
    }

    if (hcmBranch) {
      await db.collection('productbranchstocks').insertOne({
        productId,
        branchId: hcmBranch._id,
        qty: 50,
        costPrice: 50000,
      });
    }
  });

  test.afterAll(async () => {
    const db = await connectDB();
    const prod = await db.collection('products').findOne({ code: TEST_PROD_CODE });
    if (prod) {
      await db.collection('productbranchstocks').deleteMany({ productId: prod._id });
    }
    await db.collection('products').deleteOne({ code: TEST_PROD_CODE });
    await closeDB();
  });

  test('Kiểm thử toàn diện trang Tồn Kho', async ({ page }) => {
    test.setTimeout(60000);

    // 1. Vào trang tồn kho
    await page.goto('/products/inventory');
    await page.waitForLoadState('networkidle');

    // 2. Tìm kiếm sản phẩm
    const searchInput = page.getByPlaceholder('Tên SP, mã SP...');
    await searchInput.fill(TEST_PROD_CODE);
    // Nhấn Enter hoặc Form submit
    await searchInput.press('Enter');
    await page.waitForTimeout(2000);

    // Xác minh hiển thị trong bảng
    const row = page.locator('table.data-table tbody tr').filter({ hasText: TEST_PROD_CODE }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('Sản phẩm Test Tồn Kho E2E');
    await expect(row).toContainText('100'); // Tồn kho HN
    await expect(row).toContainText('50'); // Tồn kho HCM
    await expect(row).toContainText('150'); // Tổng tồn

    // 3. Test Bộ lọc Kho Hà Nội
    await page.getByRole('button', { name: 'Kho Hà Nội' }).click();
    await page.waitForTimeout(1000);
    await expect(row).toBeVisible(); // Vẫn hiển thị do có tồn HN

    // 4. Test Bộ lọc Kho HCM
    await page.getByRole('button', { name: 'Kho HCM' }).click();
    await page.waitForTimeout(1000);
    await expect(row).toBeVisible(); // Vẫn hiển thị do có tồn HCM

    // 5. Về lại Tất cả
    await page.getByRole('button', { name: 'Tất cả' }).click();
    await page.waitForTimeout(1000);

    // 6. Test Modal Xuất Excel
    await page.getByRole('button', { name: 'Xuất Excel' }).click();
    const exportModal = page.locator('.export-card').first();
    await expect(exportModal.getByRole('heading', { name: 'Xuất Excel - Tồn kho chi tiết' })).toBeVisible();

    // Thay đổi tên file
    const filenameInput = exportModal.locator('input[type="text"]').first();
    await filenameInput.fill('ton-kho-e2e-test');

    // Tắt thử 1 cột
    const hcmCheckbox = exportModal.locator('label').filter({ hasText: 'Kho HCM' }).locator('input[type="checkbox"]');
    await hcmCheckbox.uncheck();

    // Bấm nút Export
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportModal.getByRole('button', { name: 'Xuất dữ liệu' }).click()
    ]);
    
    expect(download.suggestedFilename()).toContain('ton-kho-e2e-test.xlsx');
    await expect(exportModal).not.toBeVisible();
  });
});
