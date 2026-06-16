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
      name: 'Sản phẩm Test Lưu Kho E2E',
      type: 'product',
      status: 'Mới',
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
    await closeDB();
  });

  test('Kiểm thử toàn diện trang Thời gian lưu kho', async ({ page }) => {
    test.setTimeout(60000);

    // 1. Vào trang lưu kho
    await page.goto('/products/storage-duration');
    await page.waitForLoadState('networkidle');

    // 2. Chuyển đổi các Tabs (Tất cả, Nhập lâu, Bán chậm)
    await page.getByRole('button', { name: /Nhập lâu - Chưa bán/ }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /Bán chậm/ }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /Tất cả/ }).click();
    await page.waitForTimeout(1000);

    // 3. Sử dụng Bộ lọc
    const searchInput = page.getByPlaceholder('Tên SP, mã SP...');
    await searchInput.fill(TEST_PROD_CODE);
    
    // Lọc nâng cao
    await page.locator('.filter-panel input[type="number"]').first().fill('10'); // Số ngày nhập đầu
    
    // Click Lọc
    await page.getByRole('button', { name: 'Lọc', exact: true }).click();
    await page.waitForTimeout(2000); // Chờ API trả về

    // Xác minh hiển thị trong bảng
    const row = page.locator('table.data-table tbody tr').filter({ hasText: TEST_PROD_CODE }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('Sản phẩm Test Lưu Kho E2E');
    await expect(row).toContainText('50'); // Tồn kho

    // 4. Test chức năng "Xả hàng" (Discount)
    await row.locator('button:has-text("Xả hàng")').click();
    const discountModal = page.locator('.modal-card').first();
    await expect(discountModal.getByRole('heading', { name: 'Lập khuyến mãi giảm giá xả hàng' })).toBeVisible();
    
    // Chỉnh sửa % giảm giá
    const discountInput = discountModal.locator('input[type="number"]');
    await discountInput.fill('20');
    await discountModal.locator('textarea').fill('Giảm 20% xả hàng E2E');
    
    // Áp dụng
    await discountModal.getByRole('button', { name: 'Áp dụng giá mới' }).click();
    await expect(discountModal).not.toBeVisible();
    await expect(page.getByText('Đã áp dụng giảm giá')).toBeVisible(); // Toast success
    await page.waitForTimeout(1000);

    // 5. Test chức năng "Trả hàng" (Return to Vendor)
    // Cần chọn chi nhánh trước khi trả hàng (theo validation mới)
    const branchSelect = page.locator('.filter-panel select').first();
    await branchSelect.selectOption({ index: 1 }); // Chọn chi nhánh đầu tiên
    await page.waitForTimeout(1000); // Chờ API reload do branch thay đổi
    
    const rowAfterBranch = page.locator('table.data-table tbody tr').filter({ hasText: TEST_PROD_CODE }).first();
    await expect(rowAfterBranch).toBeVisible();

    await rowAfterBranch.locator('button:has-text("Trả hàng")').click();
    const returnModal = page.locator('.modal-card').first();
    await expect(returnModal.getByRole('heading', { name: 'Lập phiếu nháp trả hàng nhà cung cấp' })).toBeVisible();
    
    // Điền form trả hàng
    const returnQtyInput = returnModal.locator('.form-field').filter({ hasText: 'Số lượng xuất trả' }).locator('input');
    await returnQtyInput.fill('10');
    await returnModal.locator('textarea').fill('Trả hàng do lưu kho quá lâu E2E');
    
    // Tạo phiếu
    await returnModal.getByRole('button', { name: 'Tạo phiếu trả hàng' }).click();
    await expect(returnModal).not.toBeVisible();
    await expect(page.getByText('Đã tạo phiếu trả hàng')).toBeVisible(); // Toast success
    await page.waitForTimeout(1000);

    // 6. Test nút Xóa bộ lọc và Xuất CSV
    await page.getByRole('button', { name: 'Xóa lọc' }).click();
    await page.waitForTimeout(1000);

    // Download file
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Xuất CSV' }).click()
    ]);
    expect(download.suggestedFilename()).toContain('bao_cao_thoi_gian_luu_kho_');
  });
});
