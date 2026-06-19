import { test, expect } from '@playwright/test';
import { connectDB, closeDB } from '../utils/db';
import { ObjectId } from 'mongodb';

const TEST_PRODUCT_CODE = 'E2E_WH_01';
const TEST_PRODUCT_CODE_2 = 'E2E_WH_02';

test.describe('Warehouse Transactions - Automation', () => {
  let db: any;
  let branchCN001Id: any;
  let branchCN001Name: string;
  let branchCode: string;
  let testProductId: any;
  let testProductId2: any;
  let multiVoucherId: string;

  test.beforeAll(async () => {
    db = await connectDB();
    
    // Clear old data
    await db.collection('products').deleteMany({ code: { $in: [TEST_PRODUCT_CODE, TEST_PRODUCT_CODE_2] } });
    
    const branch = await db.collection('branches').findOne(
      { isActive: { $ne: false } },
      { sort: { isDefault: -1, name: 1 } }
    );
    branchCN001Id = branch ? branch._id : null;
    branchCN001Name = branch?.name || '';
    branchCode = branch?.code || '';

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

    const productRes2 = await db.collection('products').insertOne({
      code: TEST_PRODUCT_CODE_2,
      name: 'Sản phẩm Test Kho Dòng Hai',
      qty: 5,
      price: 200000,
      cost: 80000,
      unit: 'Cái',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    testProductId2 = productRes2.insertedId;

    if (branchCN001Id) {
      await db.collection('productbranchstocks').insertMany([
        { productId: testProductId, branchId: branchCN001Id, qty: 10 },
        { productId: testProductId2, branchId: branchCN001Id, qty: 5 }
      ]);
    }

    multiVoucherId = `E2E-MULTI-${Date.now()}`;
    await db.collection('inventoryvouchers').insertOne({
      voucherId: multiVoucherId,
      date: new Date().toISOString().slice(0, 10),
      warehouse: branch?.name || 'Chi nhánh trung tâm',
      type: 'import',
      spCount: 2,
      qty: 5,
      totalAmount: 400000,
      creator: 'E2E Runner',
      note: 'E2E Test - Multi item display',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await db.collection('inventoryproducts').insertMany([
      {
        id: `${multiVoucherId}-1`,
        voucherId: multiVoucherId,
        date: new Date().toISOString().slice(0, 10),
        warehouse: branch?.name || 'Chi nhánh trung tâm',
        productCode: TEST_PRODUCT_CODE,
        productName: 'Sản phẩm Test Kho Nhập Xuất',
        type: 'import',
        importQty: 2,
        exportQty: 0,
        price: 100000,
        totalAmount: 200000,
        creator: 'E2E Runner',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: `${multiVoucherId}-2`,
        voucherId: multiVoucherId,
        date: new Date().toISOString().slice(0, 10),
        warehouse: branch?.name || 'Chi nhánh trung tâm',
        productCode: TEST_PRODUCT_CODE_2,
        productName: 'Sản phẩm Test Kho Dòng Hai',
        type: 'import',
        importQty: 3,
        exportQty: 0,
        price: 80000,
        totalAmount: 240000,
        creator: 'E2E Runner',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
  });

  test.afterAll(async () => {
    // Cleanup
    await db.collection('products').deleteMany({ code: { $in: [TEST_PRODUCT_CODE, TEST_PRODUCT_CODE_2] } });
    await db.collection('productbranchstocks').deleteMany({ productId: { $in: [testProductId, testProductId2] } });
    // Cleanup vouchers created during test via note regex
    await db.collection('inventoryvouchers').deleteMany({ note: /E2E Test/ });
    await db.collection('inventoryproducts').deleteMany({ productCode: { $in: [TEST_PRODUCT_CODE, TEST_PRODUCT_CODE_2] } });
    await closeDB();
  });

  test('Hai tab dùng đúng cấp dữ liệu và mở được chi tiết phiếu', async ({ page }) => {
    const billsResponse = page.waitForResponse(response =>
      response.url().includes('/api/warehouse/transactions/bills') && response.request().method() === 'GET'
    );
    await page.goto('/warehouse/transactions');
    await billsResponse;

    await expect(page.getByRole('button', { name: 'Phiếu xuất nhập kho' })).toHaveClass(/active/);
    await expect(page.getByRole('columnheader', { name: 'ID | Ngày' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'SP' })).toBeVisible();

    await page.getByPlaceholder('ID phiếu').fill(multiVoucherId);
    await page.getByRole('button', { name: 'Lọc', exact: true }).click();
    const billRow = page.locator('table.wr-table tbody tr').filter({ hasText: multiVoucherId });
    await expect(billRow).toHaveCount(1);
    await expect(billRow).toContainText('2');
    await expect(billRow).toContainText('5');

    const detailResponse = page.waitForResponse(response =>
      response.url().includes('/api/warehouse/transactions/bills/inventory-voucher/') && response.request().method() === 'GET'
    );
    await billRow.getByRole('button', { name: multiVoucherId, exact: true }).click();
    await detailResponse;
    await expect(page.getByRole('dialog', { name: 'Chi tiết phiếu xuất nhập kho' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Chi tiết phiếu xuất nhập kho' }).locator('tbody tr')).toHaveCount(2);
    await page.getByRole('button', { name: 'Đóng chi tiết' }).click();

    const itemsResponse = page.waitForResponse(response =>
      response.url().includes('/api/warehouse/transactions/items') && response.request().method() === 'GET'
    );
    await page.getByRole('button', { name: 'Sản phẩm xuất nhập kho' }).click();
    await itemsResponse;
    await page.getByPlaceholder('ID phiếu').fill(multiVoucherId);
    await page.getByRole('button', { name: 'Lọc', exact: true }).click();
    await expect(page.locator('table.wr-table tbody tr').filter({ hasText: multiVoucherId })).toHaveCount(2);
    await expect(page.getByText('Sản phẩm Test Kho Nhập Xuất', { exact: true })).toBeVisible();
    await expect(page.getByText('Sản phẩm Test Kho Dòng Hai', { exact: true })).toBeVisible();
  });

  test('Dropdown và tùy chỉnh cột hoạt động, không có nút giả', async ({ page }) => {
    await page.goto('/warehouse/transactions');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /Thêm mới/ }).click();
    await expect(page.getByRole('button', { name: 'Nhập kho', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Xuất kho', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chuyển kho', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Tùy chỉnh cột' }).click();
    const columnDialog = page.getByRole('dialog', { name: 'Tùy chỉnh hiển thị' });
    await expect(columnDialog).toBeVisible();
    await columnDialog.getByLabel('Ghi chú').uncheck();
    await columnDialog.getByRole('button', { name: 'Lưu' }).click();
    await expect(page.getByRole('columnheader', { name: 'Ghi chú' })).toHaveCount(0);
  });

  test('Luồng Nhập kho và kiểm tra tồn kho', async ({ page }) => {
    await page.goto('/warehouse/transactions');
    await page.waitForLoadState('networkidle');

    // Mở trang tạo phiếu nhập
    await page.locator('.wr-actions').getByRole('button', { name: /Thêm mới/ }).click();
    await page.locator('.wr-actions .wr-menu-panel').getByRole('button', { name: 'Nhập kho', exact: true }).click();

    await expect(page).toHaveURL(/.*\/warehouse\/transactions\/vouchers\/import/);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000); // Wait for product list to load from API

    // Chọn kho active đang được API trả về
    await page.locator('select').first().selectOption({ label: `${branchCN001Name} (${branchCode})` });

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

    const row = page.locator('table.data-table tbody tr').last();
    await row.locator('select').first().selectOption(String(testProductId));
    
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
    await page.locator('.wr-actions').getByRole('button', { name: /Thêm mới/ }).click();
    await page.locator('.wr-actions .wr-menu-panel').getByRole('button', { name: 'Xuất kho', exact: true }).click();

    await expect(page).toHaveURL(/.*\/warehouse\/transactions\/vouchers\/export/);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000); // Wait for product list

    // Chọn kho active đang được API trả về
    await page.locator('select').first().selectOption({ label: branchCN001Name });

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

    const row = page.locator('table.data-table tbody tr').last();
    await row.locator('select').first().selectOption(String(testProductId));
    
    // Đổi số lượng xuất thành 3 (tồn hiện tại là 15 do test trên đã nhập 5)
    // Tồn kho hiển thị trên UI ở cột "Tồn" cũng nên là 15.
    const qtyInput = row.locator('input[type="number"]').first();
    await qtyInput.fill('3');

    // Lưu phiếu xuất
    await page.getByRole('button', { name: 'Lưu & Hoàn tất' }).click();

    // Xác nhận lưu thành công
    await expect(page.locator('.status-badge.success')).toContainText('Tạo thành công phiếu xuất kho', { timeout: 5000 });

    await page.waitForTimeout(2000);
    
    // Kiểm tra DB: ProductBranchStock phải giảm 3 (15 - 3 = 12)
    const stock = await db.collection('productbranchstocks').findOne({ productId: testProductId, branchId: branchCN001Id });
    expect(stock.qty).toBe(12);
  });
});
