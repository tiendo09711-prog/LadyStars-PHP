import { test, expect } from '@playwright/test';
import { connectDB, closeDB } from '../utils/db';
import { ObjectId } from 'mongodb';

const TEST_CAT_CODE = 'E2E_CAT_01';
const TEST_PROD_CODE = 'E2E_PROD_CAT_01';

test.describe('Products Categories Page - Automation', () => {
  test.beforeAll(async () => {
    const db = await connectDB();
    await db.collection('categories').deleteOne({ code: TEST_CAT_CODE });
    await db.collection('products').deleteOne({ code: TEST_PROD_CODE });
    
    // Seed Danh mục
    const categoryId = new ObjectId();
    await db.collection('categories').insertOne({
      _id: categoryId,
      code: TEST_CAT_CODE,
      name: 'Danh mục Test E2E',
      isActive: true,
      isVisible: true,
      createdAt: new Date(),
    });

    // Seed Sản phẩm thuộc danh mục
    const productId = new ObjectId();
    await db.collection('products').insertOne({
      _id: productId,
      code: TEST_PROD_CODE,
      name: 'Sản phẩm Test thuộc Danh mục',
      categoryId: categoryId,
      type: 'product',
      status: 'Mới',
      cost: 10000,
      price: 20000,
      qty: 10,
      createdAt: new Date(),
    });
  });

  test.afterAll(async () => {
    const db = await connectDB();
    await db.collection('categories').deleteOne({ code: TEST_CAT_CODE });
    await db.collection('products').deleteOne({ code: TEST_PROD_CODE });
    await closeDB();
  });

  test('Kiểm thử toàn diện trang Danh mục', async ({ page }) => {
    test.setTimeout(60000);

    // 1. Vào trang danh mục
    await page.goto('/products/categories');
    await page.waitForLoadState('networkidle');

    // 2. Tìm kiếm danh mục
    const searchInput = page.getByPlaceholder('Tên danh mục, mã...');
    await searchInput.fill(TEST_CAT_CODE);
    await searchInput.press('Enter');
    await page.waitForTimeout(2000);

    // Xác minh hiển thị trong bảng
    const row = page.locator('table.data-table tbody tr').filter({ hasText: TEST_CAT_CODE }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('Danh mục Test E2E');
    await expect(row).toContainText('Đang hoạt động');

    // 3. Mở Modal Xem sản phẩm
    await row.locator('button:has-text("Xem sản phẩm")').click();
    const productModal = page.locator('.modal-card').first();
    await expect(productModal.getByRole('heading', { name: 'Danh mục Test E2E' })).toBeVisible();

    // Xác minh sản phẩm thuộc danh mục có hiển thị
    const prodRow = productModal.locator('table.data-table tbody tr').filter({ hasText: TEST_PROD_CODE }).first();
    await expect(prodRow).toBeVisible();
    await expect(prodRow).toContainText('Sản phẩm Test thuộc Danh mục');

    // Tìm kiếm trong modal
    const modalSearchInput = productModal.getByPlaceholder('Tìm sản phẩm trong danh mục...');
    await modalSearchInput.fill(TEST_PROD_CODE);
    await modalSearchInput.press('Enter');
    await page.waitForTimeout(1000);
    await expect(prodRow).toBeVisible();

    // Đóng Modal
    await productModal.getByRole('button', { name: 'Đóng' }).click();
    await expect(productModal).not.toBeVisible();

    // Lắng nghe console và dialog
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('dialog', dialog => {
      console.log('DIALOG:', dialog.message());
      dialog.accept();
    });

    // 4. Test Xuất Excel
    await page.getByRole('button', { name: 'Xuất Excel' }).click();
    const exportModal = page.locator('.export-card').first();
    await expect(exportModal.getByRole('heading', { name: 'Xuất Excel - Danh mục sản phẩm' })).toBeVisible();

    // Đổi tên file
    const filenameInput = exportModal.locator('input[type="text"]').first();
    await filenameInput.fill('danh-muc-e2e-test');

    // Export
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      exportModal.getByRole('button', { name: 'Xuất dữ liệu' }).click()
    ]);
    
    expect(download.suggestedFilename()).toContain('danh-muc-e2e-test.xlsx');
    await expect(exportModal).not.toBeVisible();
  });
});
