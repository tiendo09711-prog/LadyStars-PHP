import { test, expect } from '@playwright/test';
import { connectDB, closeDB } from '../utils/db';
import { ObjectId } from 'mongodb';

const TEST_BATCH_CODE = 'E2E_BATCH_2026_01';
const TEST_PROD_CODE_FOR_BATCH = 'E2E_PROD_BATCH_LINK';

test.describe('Products Batches Page - Automation', () => {
  test.beforeAll(async () => {
    const db = await connectDB();
    // Dọn dẹp trước khi test
    await db.collection('batches').deleteOne({ batchNumber: TEST_BATCH_CODE });
    await db.collection('products').deleteOne({ code: TEST_PROD_CODE_FOR_BATCH });

    // Seed 1 sản phẩm để có thể chọn trong dropdown
    await db.collection('products').insertOne({
      _id: new ObjectId(),
      code: TEST_PROD_CODE_FOR_BATCH,
      name: 'Sản phẩm Test Lô E2E',
      type: 'product',
      status: 'Mới',
      createdAt: new Date(),
    });
  });

  test.afterAll(async () => {
    const db = await connectDB();
    await db.collection('batches').deleteOne({ batchNumber: TEST_BATCH_CODE });
    await db.collection('products').deleteOne({ code: TEST_PROD_CODE_FOR_BATCH });
    await closeDB();
  });

  test('Kiểm thử toàn diện trang quản lý Lô Sản Phẩm', async ({ page }) => {
    test.setTimeout(60000);

    // 1. Vào trang lô sản phẩm
    await page.goto('/products/batches');
    await page.waitForLoadState('networkidle');

    // 2. Test Tạo mới lô sản phẩm
    await page.getByRole('button', { name: 'Thêm lô hàng' }).click();
    await expect(page.getByRole('heading', { name: 'Thêm lô sản phẩm' })).toBeVisible();

    // Điền form
    await page.locator('.form-field').filter({ hasText: 'Số lô hàng *' }).locator('input').fill(TEST_BATCH_CODE);
    
    // Chọn Sản phẩm liên kết
    await page.locator('.form-field').filter({ hasText: 'Sản phẩm liên kết *' }).locator('select').selectOption({ label: `Sản phẩm Test Lô E2E (${TEST_PROD_CODE_FOR_BATCH})` });
    
    // Nhập giá và số lượng
    await page.locator('.form-field').filter({ hasText: 'Giá nhập lô' }).locator('input').fill('250000');
    await page.locator('.form-field').filter({ hasText: 'Số tồn lô hàng' }).locator('input').fill('50');

    // Nhập ngày
    await page.locator('.form-field').filter({ hasText: 'Ngày sản xuất' }).locator('input').fill('2026-01-01');
    await page.locator('.form-field').filter({ hasText: 'Ngày hết hạn' }).locator('input').fill('2026-12-31');

    // Click Tạo lô sản phẩm
    await page.getByRole('button', { name: 'Tạo lô sản phẩm' }).click();
    
    // Chờ form đóng và tải lại
    await expect(page.getByRole('heading', { name: 'Thêm lô sản phẩm' })).not.toBeVisible();
    await page.waitForTimeout(1000);

    // 3. Tìm kiếm lô vừa tạo
    const searchInput = page.getByPlaceholder('Nhập số lô...');
    await searchInput.fill(TEST_BATCH_CODE);
    await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
    await page.waitForTimeout(1000);

    // Xác minh lô hiển thị trong bảng
    const row = page.locator('table.data-table tbody tr').filter({ hasText: TEST_BATCH_CODE }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('Sản phẩm Test Lô E2E');
    await expect(row).toContainText('250.000');
    await expect(row).toContainText('50');

    // 4. Mở Xem Chi tiết
    await row.locator('button[title="Chi tiết"]').click();
    const detailModal = page.locator('.modal-card').first();
    await expect(detailModal.getByRole('heading', { name: 'Chi tiết lô sản phẩm' })).toBeVisible();
    await expect(detailModal.getByText(TEST_BATCH_CODE, { exact: true })).toBeVisible();
    await expect(detailModal.getByText('250.000 đ', { exact: true }).first()).toBeVisible();
    await detailModal.getByRole('button', { name: 'Đóng' }).click();
    await expect(detailModal).not.toBeVisible();

    // 5. Test Cập nhật lô
    await row.locator('button[title="Sửa"]').click();
    await expect(page.getByRole('heading', { name: 'Sửa lô sản phẩm' })).toBeVisible();
    await page.locator('.form-field').filter({ hasText: 'Ghi chú' }).locator('input').fill('Đã kiểm tra chất lượng E2E');
    await page.getByRole('button', { name: 'Cập nhật' }).click();
    await expect(page.getByRole('heading', { name: 'Sửa lô sản phẩm' })).not.toBeVisible();
    await page.waitForTimeout(1000);
    
    // Kiểm tra xem có lưu thành công chưa (mở lại chi tiết)
    await row.locator('button[title="Chi tiết"]').click();
    const detailModal2 = page.locator('.modal-card').first();
    await expect(detailModal2.getByText('Đã kiểm tra chất lượng E2E', { exact: true })).toBeVisible();
    await detailModal2.getByRole('button', { name: 'Đóng' }).click();

    // 6. Test các chức năng nút trên thanh công cụ
    // Mở Import
    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByRole('heading', { name: 'Nhập File Lô Hàng (Import)' })).toBeVisible();
    await page.getByRole('button', { name: 'Đóng' }).click();
    
    // Mở Xuất Excel
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Xuất Excel' }).click()
    ]);
    expect(download.suggestedFilename()).toContain('lo-san-pham-');

    // Test Bộ lọc trạng thái
    await page.getByRole('button', { name: 'Còn hạn' }).first().click(); // Click Quick filter "Còn hạn"
    await page.waitForTimeout(1000);
    await expect(row).toBeVisible(); // Lô vừa tạo có date 2026-12-31 nên 'Còn hạn'

    // 7. Xóa lô sản phẩm
    await row.locator('button[title="Xóa"]').click();
    const deleteModal = page.locator('.modal-card');
    await expect(deleteModal.getByRole('heading', { name: 'Xác nhận xóa' })).toBeVisible();
    await deleteModal.getByRole('button', { name: 'Xóa', exact: true }).click();
    await expect(deleteModal).not.toBeVisible();
    await page.waitForTimeout(1000);

    // Kiểm tra đã biến mất khỏi bảng
    await expect(row).not.toBeVisible();
  });
});
