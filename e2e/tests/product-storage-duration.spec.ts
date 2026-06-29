import { test, expect } from '@playwright/test';
import { connectDB, closeDB } from '../utils/db';
import { ObjectId } from 'mongodb';

const TEST_PROD_CODE = 'E2E_STOR_DUR_01';

test.describe('Products Storage Duration Page - Automation', () => {
  test.beforeAll(async () => {
    const db = await connectDB();
    await db.collection('products').deleteOne({ code: TEST_PROD_CODE });

    // Seed 1 sản phẩm có tồn kho để chắc chắn nó hiện lên trong báo cáo lưu kho
    const productId = new ObjectId();
    await db.collection('products').insertOne({
      _id: productId,
      code: TEST_PROD_CODE,
      name: 'San pham Test Luu Kho E2E',
      type: 'product',
      status: 'Moi',
      cost: 100000,
      price: 200000,
      qty: 50,
      createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 ngày trước
    });

    const branches = await db.collection('branches').find({ isActive: true }).toArray();
    if (branches.length > 0) {
      await db.collection('productbranchstocks').insertOne({
        productId,
        branchId: branches[0]._id,
        qty: 50,
        costPrice: 100000,
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
    await db.collection('products').updateOne({ code: TEST_PROD_CODE }, { $unset: { clearancePrice: 1, clearanceActive: 1, clearanceNote: 1, clearanceStartedAt: 1 } });
    await closeDB();
  });

  test('Kiểm thử toàn diện trang Hàng tồn lâu & bán chậm', async ({ page }) => {
    test.setTimeout(60000);
    page.on('dialog', (dialog) => dialog.accept());

    // 1. Vào trang storage-duration
    await page.goto('/products/storage-duration');
    await page.waitForLoadState('networkidle');

    // 2. Chuyển đổi các Tabs
    await page.getByRole('button', { name: /Nhập lâu - Chưa bán/ }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /Bán chậm/ }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /Tất cả/ }).click();
    await page.waitForTimeout(1000);

    // 3. Sử dụng Bộ lọc
    const searchInput = page.getByPlaceholder('Tìm theo tên, mã SP...');
    await searchInput.fill(TEST_PROD_CODE);

    // Lọc nâng cao (số ngày nhập đầu)
    await page.locator('.products-filter-form input[type="number"]').first().fill('10');

    // Click Lọc
    await page.getByRole('button', { name: 'Lọc', exact: true }).click();
    await page.waitForTimeout(2000); // Chờ API trả về

    // Xác minh hiển thị trong bảng
    const row = page.locator('table tbody tr').filter({ hasText: TEST_PROD_CODE }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('50'); // Tồn kho

    // 4. Test action "Đặt giá xả hàng" (clearance price, không đổi giá bán chính)
    await row.locator('button:has-text("Đặt giá xả hàng")').click();
    const discountModal = page.locator('.modal-card').first();
    await expect(discountModal.getByRole('heading', { name: 'Lưu giá xả hàng' })).toBeVisible();

    // Chỉnh sửa mức giảm giá
    const discountInput = discountModal.locator('input[type="number"]').first();
    await discountInput.fill('20');
    await discountModal.locator('textarea').fill('Giảm 20% xả hàng E2E');

    // Lưu giá xả hàng (có confirm dialog đã auto-accept)
    await discountModal.getByRole('button', { name: 'Lưu giá xả hàng' }).click();
    await expect(discountModal).not.toBeVisible();
    await expect(page.getByText('Đã lưu giá xả hàng')).toBeVisible(); // Toast success
    await page.waitForTimeout(1000);

    // 5. Test action "Mở phiếu xuất trả NCC" điều hướng sang workflow voucher xuất
    const branchSelect = page.locator('.products-filter-form select').first();
    await branchSelect.selectOption({ index: 1 }); // Chọn chi nhánh đầu tiên
    await page.waitForTimeout(1000);

    const rowAfterBranch = page.locator('table tbody tr').filter({ hasText: TEST_PROD_CODE }).first();
    await expect(rowAfterBranch).toBeVisible();
    await rowAfterBranch.locator('button:has-text("Mở phiếu xuất trả NCC")').click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/warehouse\/transactions\/vouchers\/export/);
    await page.goto('/products/storage-duration');
    await page.waitForLoadState('networkidle');

    // 6. Test nút Làm mới và Xuất CSV
    await page.getByRole('button', { name: 'Làm mới' }).click();
    await page.waitForTimeout(1000);

    // Download file
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Xuất CSV' }).click()
    ]);
    expect(download.suggestedFilename()).toContain('bao_cao_thoi_gian_luu_kho_');
  });
});
