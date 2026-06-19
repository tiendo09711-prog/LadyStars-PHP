import { test, expect } from '@playwright/test';
import { ObjectId } from 'mongodb';
import { connectDB } from '../utils/db';

test.describe('Products Main Page - Automation', () => {
  test('Kiểm thử toàn diện trang sản phẩm và tab lịch sử', async ({ page }) => {
    test.setTimeout(90000);

    const testProductCode = `E2E_MAIN_${Date.now()}`;
    const db = await connectDB();

    await page.goto('/products');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1', { hasText: 'Sản phẩm' })).toBeVisible();

    await page.getByRole('button', { name: 'Thêm mới', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Thêm sản phẩm' })).toBeVisible();

    await page.locator('.form-field').filter({ hasText: 'Mã sản phẩm *' }).locator('input').fill(testProductCode);
    await page.locator('.form-field').filter({ hasText: 'Tên sản phẩm *' }).locator('input').fill('Sản phẩm Test E2E Main');
    await page.locator('.form-field').filter({ hasText: 'Loại sản phẩm' }).locator('select').selectOption('product');
    await page.locator('.form-field').filter({ hasText: 'Giá vốn' }).locator('input').fill('150000');
    await page.locator('.form-field').filter({ hasText: 'Giá bán' }).locator('input').fill('350000');
    await page.getByLabel('Số lượng tồn kho ban đầu').fill('3');

    await page.getByRole('button', { name: 'Tạo sản phẩm' }).click();
    await expect(page.getByRole('heading', { name: 'Thêm sản phẩm' })).not.toBeVisible();
    const createdProduct = await db.collection('products').findOne({ code: testProductCode });
    const createdStock = await db.collection('productbranchstocks').findOne({ productId: createdProduct?._id });
    expect(createdProduct?.qty).toBe(3);
    expect(createdStock?.qty).toBe(3);

    const listSearch = page.getByPlaceholder('Tìm theo tên, mã hoặc barcode...');
    await listSearch.fill(testProductCode);
    await page.getByRole('button', { name: 'Lọc', exact: true }).first().click();

    const row = page.locator('table.data-table tbody tr').filter({ hasText: testProductCode }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('Sản phẩm Test E2E Main');
    await expect(row).toContainText('350.000');
    await expect(row).toContainText('3');

    await row.getByRole('button', { name: 'Chi tiết' }).click();
    const detailModal = page.locator('.modal-card').first();
    await expect(page.getByRole('heading', { name: 'Chi tiết sản phẩm' })).toBeVisible();
    await expect(detailModal.getByText('Sản phẩm Test E2E Main', { exact: true }).first()).toBeVisible();
    await expect(detailModal.getByText('150.000 đ', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Đóng' }).click();
    await expect(page.getByRole('heading', { name: 'Chi tiết sản phẩm' })).not.toBeVisible();

    await row.getByRole('button', { name: 'Sửa' }).click();
    await expect(page.getByRole('heading', { name: 'Sửa sản phẩm' })).toBeVisible();
    await page.locator('.form-field').filter({ hasText: 'Tên sản phẩm *' }).locator('input').fill('Sản phẩm Test E2E Update');
    await page.getByRole('button', { name: 'Cập nhật' }).click();
    await expect(page.getByRole('heading', { name: 'Sửa sản phẩm' })).not.toBeVisible();
    await expect(row).toContainText('Sản phẩm Test E2E Update');

    await page.getByRole('button', { name: 'Mở menu thêm mới' }).click();
    await page.getByRole('button', { name: 'Nhập từ file' }).click();
    await expect(page.getByRole('heading', { name: 'Nhập dữ liệu sản phẩm' })).toBeVisible();
    await page.getByRole('button', { name: 'Hủy' }).click();
    await expect(page.getByRole('heading', { name: 'Nhập dữ liệu sản phẩm' })).not.toBeVisible();

    await page.getByRole('button', { name: 'Thao tác' }).click();
    await page.getByRole('button', { name: 'Xuất dữ liệu' }).click();
    await expect(page.getByRole('heading', { name: 'Xuất Excel - Danh sách sản phẩm' })).toBeVisible();
    await page.getByRole('button', { name: 'Đóng' }).click();
    await expect(page.getByRole('heading', { name: 'Xuất Excel - Danh sách sản phẩm' })).not.toBeVisible();

    await page.getByRole('button', { name: 'Lịch sử' }).click();
    await expect(page.locator('h1', { hasText: 'Lịch sử sửa/xóa' })).toBeVisible();

    const historySearch = page.getByPlaceholder('Mã hoặc tên sản phẩm...');
    await historySearch.fill(testProductCode);
    await page.getByRole('button', { name: 'Lọc', exact: true }).first().click();

    const historyRow = page.locator('table.data-table tbody tr').filter({ hasText: testProductCode }).first();
    await expect(historyRow).toBeVisible({ timeout: 15000 });
    await expect(historyRow).toContainText('Sửa sản phẩm');

    await page.getByRole('button', { name: 'Xuất Excel' }).click();
    await expect(page.getByRole('heading', { name: 'Xuất Excel - Lịch sử sửa xóa' })).toBeVisible();
    await page.getByRole('button', { name: 'Đóng' }).click();

    await page.locator('button[role="tab"][aria-controls="products-panel-products"]').click();
    await expect(page.getByRole('heading', { name: 'Danh sách sản phẩm' })).toBeVisible();

    await listSearch.fill(testProductCode);
    await page.getByRole('button', { name: 'Lọc', exact: true }).first().click();
    const rowAfterReturn = page.locator('table.data-table tbody tr').filter({ hasText: testProductCode }).first();
    await expect(rowAfterReturn).toBeVisible();

    await rowAfterReturn.getByRole('button', { name: 'Xóa' }).click();
    const deleteModal = page.locator('.modal-card').filter({ hasText: 'Xác nhận xóa' });
    await expect(deleteModal.getByRole('heading', { name: 'Xác nhận xóa' })).toBeVisible();
    await deleteModal.getByRole('button', { name: 'Xóa', exact: true }).click();
    await expect(deleteModal).not.toBeVisible();

    await listSearch.fill(testProductCode);
    await page.getByRole('button', { name: 'Lọc', exact: true }).first().click();
    await expect(page.locator('table.data-table tbody tr').filter({ hasText: testProductCode })).toHaveCount(0);
    if (createdProduct?._id) {
      await db.collection('productbranchstocks').deleteMany({ productId: createdProduct._id });
      await db.collection('productlogs').deleteMany({ productId: createdProduct._id });
    }
    await db.collection('producteditlogs').deleteMany({ productCode: testProductCode });
  });
});

test.describe('Products warehouse stock logic', () => {
  test('tạo nhiều kho, sửa một kho và chặn payload tồn kho sai', async ({ page }) => {
    test.setTimeout(120000);
    const db = await connectDB();
    const branches = await db.collection('branches').find({ isActive: { $ne: false } }).limit(2).toArray();
    test.skip(branches.length < 2, 'Cần ít nhất hai kho đang hoạt động để kiểm thử nhiều kho.');

    const code = `E2E_STOCK_${Date.now()}`;
    const invalidCodes = [`${code}_DUP`, `${code}_NEG`, `${code}_DEC`, `${code}_TEXT`, `${code}_BAD`];

    try {
      await page.goto('/products');
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Thêm mới', exact: true }).click();
      await page.locator('.form-field').filter({ hasText: 'Mã sản phẩm *' }).locator('input').fill(`${code}_VALIDATE`);
      await page.locator('.form-field').filter({ hasText: 'Tên sản phẩm *' }).locator('input').fill('Kiểm tra bắt buộc chọn kho');
      await page.locator('.form-field').filter({ hasText: 'Kho hàng *' }).locator('select').selectOption('');
      await page.getByRole('button', { name: 'Tạo sản phẩm' }).click();
      await expect(page.locator('.form-error')).toContainText('Vui lòng chọn kho hàng');
      await page.getByRole('button', { name: 'Hủy' }).click();

      await page.getByRole('button', { name: 'Thêm mới', exact: true }).click();
      await page.locator('.form-field').filter({ hasText: 'Mã sản phẩm *' }).locator('input').fill(code);
      await page.locator('.form-field').filter({ hasText: 'Tên sản phẩm *' }).locator('input').fill('Sản phẩm tồn kho nhiều kho');
      await page.getByLabel('Tạo mới trên nhiều kho').check();

      await expect(page.getByLabel('Số lượng tồn kho ban đầu')).toHaveCount(0);
      await page.getByLabel(`Số lượng tồn ${branches[0].name}`).fill('3');
      await page.getByLabel(`Số lượng tồn ${branches[1].name}`).fill('2');
      await page.getByRole('button', { name: 'Tạo sản phẩm' }).click();
      await expect(page.getByRole('heading', { name: 'Thêm sản phẩm' })).not.toBeVisible();

      const created = await db.collection('products').findOne({ code });
      expect(created).toBeTruthy();
      expect(created?.qty).toBe(5);
      const createdStocks = await db.collection('productbranchstocks')
        .find({ productId: created?._id })
        .sort({ branchId: 1 })
        .toArray();
      expect(createdStocks).toHaveLength(2);
      expect(createdStocks.reduce((sum, stock) => sum + Number(stock.qty || 0), 0)).toBe(5);

      const listSearch = page.getByPlaceholder('Tìm theo tên, mã hoặc barcode...');
      await listSearch.fill(code);
      await page.getByRole('button', { name: 'Lọc', exact: true }).first().click();
      const row = page.locator('table.data-table tbody tr').filter({ hasText: code }).first();
      await expect(row).toContainText('5');

      await row.getByRole('button', { name: 'Sửa' }).click();
      await page.locator('.form-field').filter({ hasText: 'Tên sản phẩm *' }).locator('input').fill('Sản phẩm chỉ sửa thông tin');
      await page.getByRole('button', { name: 'Cập nhật' }).click();
      await expect(page.getByRole('heading', { name: 'Sửa sản phẩm' })).not.toBeVisible();
      const stocksAfterInfoUpdate = await db.collection('productbranchstocks').find({ productId: created?._id }).toArray();
      expect(stocksAfterInfoUpdate.map((stock) => Number(stock.qty)).sort()).toEqual([2, 3]);

      await row.getByRole('button', { name: 'Sửa' }).click();
      await page.getByLabel('Kho hàng').selectOption(String(branches[0]._id));
      await expect(page.getByLabel('Số lượng tồn kho')).toHaveValue('3');
      await page.getByLabel('Số lượng tồn kho').fill('5');
      await page.getByRole('button', { name: 'Cập nhật' }).click();
      await expect(page.getByRole('heading', { name: 'Sửa sản phẩm' })).not.toBeVisible();

      const stocksAfterAdjustment = await db.collection('productbranchstocks').find({ productId: created?._id }).toArray();
      const firstStock = stocksAfterAdjustment.find((stock) => String(stock.branchId) === String(branches[0]._id));
      const secondStock = stocksAfterAdjustment.find((stock) => String(stock.branchId) === String(branches[1]._id));
      expect(firstStock?.qty).toBe(5);
      expect(secondStock?.qty).toBe(2);
      expect((await db.collection('products').findOne({ _id: created?._id }))?.qty).toBe(7);
      expect(await db.collection('productlogs').countDocuments({
        productId: created?._id,
        sourceType: 'PRODUCT_EDIT_ADJUSTMENT',
        amountBefore: 3,
        amountAfter: 5,
      })).toBe(1);

      const token = await page.evaluate(() => localStorage.getItem('token'));
      const apiOptions = { headers: { Authorization: `Bearer ${token}` } };
      const duplicateResponse = await page.request.post('http://localhost:4000/api/products/products', {
        ...apiOptions,
        data: {
          code: invalidCodes[0],
          name: 'Duplicate warehouse',
          initialStocks: [
            { warehouseId: String(branches[0]._id), quantity: 1 },
            { warehouseId: String(branches[0]._id), quantity: 2 },
          ],
        },
      });
      expect(duplicateResponse.status()).toBe(400);

      const negativeResponse = await page.request.post('http://localhost:4000/api/products/products', {
        ...apiOptions,
        data: {
          code: invalidCodes[1],
          name: 'Negative stock',
          initialStocks: [{ warehouseId: String(branches[0]._id), quantity: -1 }],
        },
      });
      expect(negativeResponse.status()).toBe(400);

      const decimalResponse = await page.request.post('http://localhost:4000/api/products/products', {
        ...apiOptions,
        data: {
          code: invalidCodes[2],
          name: 'Decimal stock',
          initialStocks: [{ warehouseId: String(branches[0]._id), quantity: 1.5 }],
        },
      });
      expect(decimalResponse.status()).toBe(400);

      const textResponse = await page.request.post('http://localhost:4000/api/products/products', {
        ...apiOptions,
        data: {
          code: invalidCodes[3],
          name: 'Text stock',
          initialStocks: [{ warehouseId: String(branches[0]._id), quantity: 'abc' }],
        },
      });
      expect(textResponse.status()).toBe(400);

      const missingWarehouseResponse = await page.request.post('http://localhost:4000/api/products/products', {
        ...apiOptions,
        data: {
          code: invalidCodes[4],
          name: 'Missing warehouse',
          initialStocks: [{ warehouseId: String(new ObjectId()), quantity: 1 }],
        },
      });
      expect(missingWarehouseResponse.status()).toBe(400);
      expect(await db.collection('products').countDocuments({ code: { $in: invalidCodes } })).toBe(0);
    } finally {
      const products = await db.collection('products').find({ code: { $in: [code, ...invalidCodes] } }).toArray();
      const productIds = products.map((product) => product._id);
      if (productIds.length) {
        await db.collection('productbranchstocks').deleteMany({ productId: { $in: productIds } });
        await db.collection('productlogs').deleteMany({ productId: { $in: productIds } });
      }
      await db.collection('producteditlogs').deleteMany({ productCode: { $in: [code, ...invalidCodes] } });
      await db.collection('products').deleteMany({ code: { $in: [code, ...invalidCodes] } });
    }
  });
});
