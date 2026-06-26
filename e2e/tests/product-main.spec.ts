import { test, expect } from '@playwright/test';
import { ObjectId } from 'mongodb';
import { connectDB } from '../utils/db';

const MARKER = `E2E_VAL_${Date.now()}`;

async function fillRequiredFields(page: import('@playwright/test').Page, overrides: Record<string, string> = {}) {
  const code = overrides.code ?? `${MARKER}_PROD`;
  await page.locator('.form-field').filter({ hasText: 'Mã sản phẩm *' }).locator('input').fill(code);
  await page.locator('.form-field').filter({ hasText: 'Tên sản phẩm *' }).locator('input').fill(overrides.name ?? 'Sản phẩm test validation');
  await page.locator('.form-field').filter({ hasText: 'Mã vạch *' }).locator('input').fill(overrides.barcode ?? '1234567890123');
  await page.locator('.form-field').filter({ hasText: 'Loại sản phẩm *' }).locator('select').selectOption(overrides.type ?? 'product');
  await page.locator('.form-field').filter({ hasText: 'Đơn vị *' }).locator('select').selectOption(overrides.unit ?? 'cái');
  await page.locator('.form-field').filter({ hasText: 'Giá bán *' }).locator('input').fill(overrides.price ?? '350000');
  await page.locator('.form-field').filter({ hasText: 'Khối lượng (g) *' }).locator('input').fill(overrides.weight ?? '500');
  await page.locator('.form-field').filter({ hasText: 'Kích cỡ *' }).locator('input').fill(overrides.size ?? 'M');
  await page.locator('.form-field').filter({ hasText: 'Màu sắc *' }).locator('input').fill(overrides.color ?? 'Đỏ');
  const categorySelect = page.locator('.form-field').filter({ hasText: 'Danh mục *' }).locator('select');
  const firstCategoryValue = await categorySelect.locator('option').nth(1).getAttribute('value');
  if (firstCategoryValue) await categorySelect.selectOption(firstCategoryValue);
}

async function ensureCategory(db: import('mongodb').Db) {
  const name = `E2E Cat ${MARKER}`;
  let cat = await db.collection('categories').findOne({ name });
  if (!cat) {
    const inserted = await db.collection('categories').insertOne({ name, code: MARKER, isActive: true, isVisible: true, productCount: 0, createdAt: new Date() });
    cat = { _id: inserted.insertedId, name };
  }
  return cat;
}

async function cleanup(db: import('mongodb').Db, codes: string[]) {
  const products = await db.collection('products').find({ code: { $in: codes } }).toArray();
  const ids = products.map((p) => p._id);
  if (ids.length) {
    await db.collection('productbranchstocks').deleteMany({ productId: { $in: ids } });
    await db.collection('productlogs').deleteMany({ productId: { $in: ids } });
  }
  await db.collection('producteditlogs').deleteMany({ productCode: { $in: codes } });
  await db.collection('products').deleteMany({ code: { $in: codes } });
  await db.collection('categories').deleteMany({ code: MARKER });
}

test.describe('Product create/edit validation + multi-warehouse', () => {
  test('create validation blocks empty form and bad barcode/price', async ({ page }) => {
    test.setTimeout(120000);
    const db = await connectDB();
    await ensureCategory(db);
    const code = `${MARKER}_VAL`;

    try {
      await page.goto('/products');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: 'Thêm mới', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Thêm sản phẩm' })).toBeVisible();

      // Submit empty form -> client validation, no API call.
      let createCalled = false;
      page.on('request', (req) => {
        if (req.url().includes('/products/products') && req.method() === 'POST') createCalled = true;
      });
      await page.getByRole('button', { name: 'Tạo sản phẩm' }).click();
      await expect(page.locator('.field-error-text').first()).toBeVisible();
      expect(createCalled).toBe(false);
      await expect(page.locator('.field-error-text', { hasText: 'Vui lòng nhập mã sản phẩm.' })).toBeVisible();
      await expect(page.locator('.field-error-text', { hasText: 'Vui lòng chọn ít nhất một kho hàng.' })).toBeVisible();

      // Barcode rejects letters.
      const barcodeInput = page.locator('.form-field').filter({ hasText: 'Mã vạch *' }).locator('input');
      await barcodeInput.fill('12A34');
      expect(await barcodeInput.inputValue()).toBe('');

      // Fill everything except warehouse -> still blocked for missing warehouse.
      await fillRequiredFields(page, { code });
      await page.getByRole('button', { name: 'Tạo sản phẩm' }).click();
      await expect(page.locator('.field-error-text', { hasText: 'Vui lòng chọn ít nhất một kho hàng.' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Thêm sản phẩm' })).toBeVisible();

      // No product created.
      expect(await db.collection('products').countDocuments({ code })).toBe(0);
    } finally {
      await cleanup(db, [code]);
    }
  });

  test('create success with two warehouses, defaults cost/wholesale to 0', async ({ page }) => {
    test.setTimeout(120000);
    const db = await connectDB();
    await ensureCategory(db);
    const branches = await db.collection('branches').find({ isActive: { $ne: false } }).limit(2).toArray();
    test.skip(branches.length < 2, 'Cần ít nhất hai kho đang hoạt động.');
    const code = `${MARKER}_CREATE`;

    try {
      await page.goto('/products');
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Thêm mới', exact: true }).click();
      await fillRequiredFields(page, { code });

      // Add two warehouses via the add select.
      await page.getByLabel('Thêm kho hàng').selectOption(String(branches[0]._id));
      await page.getByLabel('Thêm kho hàng').selectOption(String(branches[1]._id));

      await page.getByLabel(`Số lượng tồn ${branches[0].name}`).fill('4');
      await page.getByLabel(`Số lượng tồn ${branches[1].name}`).fill('6');

      // Leave cost and wholesale empty -> payload default 0.
      await page.getByRole('button', { name: 'Tạo sản phẩm' }).click();
      await expect(page.getByRole('heading', { name: 'Thêm sản phẩm' })).not.toBeVisible();

      const created = await db.collection('products').findOne({ code });
      expect(created).toBeTruthy();
      expect(created?.qty).toBe(10);
      expect(created?.cost).toBe(0);
      expect(created?.wholesalePrice).toBe(0);
      expect(created?.barcode).toBe('1234567890123');

      const stocks = await db.collection('productbranchstocks').find({ productId: created?._id }).toArray();
      expect(stocks).toHaveLength(2);
      expect(stocks.reduce((s, st) => s + Number(st.qty || 0), 0)).toBe(10);
    } finally {
      await cleanup(db, [code]);
    }
  });

  test('edit preserves old stock and supports adding a warehouse', async ({ page }) => {
    test.setTimeout(120000);
    const db = await connectDB();
    await ensureCategory(db);
    const branches = await db.collection('branches').find({ isActive: { $ne: false } }).limit(2).toArray();
    test.skip(branches.length < 2, 'Cần ít nhất hai kho đang hoạt động.');
    const code = `${MARKER}_EDIT`;

    try {
      await page.goto('/products');
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Thêm mới', exact: true }).click();
      await fillRequiredFields(page, { code });
      await page.getByLabel('Thêm kho hàng').selectOption(String(branches[0]._id));
      await page.getByLabel(`Số lượng tồn ${branches[0].name}`).fill('8');
      await page.getByRole('button', { name: 'Tạo sản phẩm' }).click();
      await expect(page.getByRole('heading', { name: 'Thêm sản phẩm' })).not.toBeVisible();

      const created = await db.collection('products').findOne({ code });
      expect(created?.qty).toBe(8);

      // Open edit.
      const listSearch = page.getByPlaceholder('Tìm theo tên, mã hoặc barcode...');
      await listSearch.fill(code);
      await page.getByRole('button', { name: 'Lọc', exact: true }).first().click();
      const row = page.locator('table.data-table tbody tr').filter({ hasText: code }).first();
      await expect(row).toBeVisible();
      await row.getByRole('button', { name: 'Sửa' }).click();
      await expect(page.getByRole('heading', { name: 'Sửa sản phẩm' })).toBeVisible();

      // Existing stock shown.
      await expect(page.getByLabel(`Số lượng tồn ${branches[0].name}`)).toHaveValue('8');

      // Add a second warehouse; old warehouse qty unchanged.
      await page.getByLabel('Thêm kho hàng').selectOption(String(branches[1]._id));
      await page.getByLabel(`Số lượng tồn ${branches[1].name}`).fill('2');
      await expect(page.getByLabel(`Số lượng tồn ${branches[0].name}`)).toHaveValue('8');

      await page.getByRole('button', { name: 'Cập nhật' }).click();
      await expect(page.getByRole('heading', { name: 'Sửa sản phẩm' })).not.toBeVisible();

      const stocksAfter = await db.collection('productbranchstocks').find({ productId: created?._id }).toArray();
      const first = stocksAfter.find((st) => String(st.branchId) === String(branches[0]._id));
      const second = stocksAfter.find((st) => String(st.branchId) === String(branches[1]._id));
      expect(first?.qty).toBe(8);
      expect(second?.qty).toBe(2);
      expect((await db.collection('products').findOne({ _id: created?._id }))?.qty).toBe(10);
    } finally {
      await cleanup(db, [code]);
    }
  });

  test('edit validation blocks update on missing required field', async ({ page }) => {
    test.setTimeout(120000);
    const db = await connectDB();
    await ensureCategory(db);
    const branches = await db.collection('branches').find({ isActive: { $ne: false } }).limit(1).toArray();
    test.skip(branches.length < 1, 'Cần ít nhất một kho đang hoạt động.');
    const code = `${MARKER}_EDITVAL`;

    try {
      await page.goto('/products');
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Thêm mới', exact: true }).click();
      await fillRequiredFields(page, { code });
      await page.getByLabel('Thêm kho hàng').selectOption(String(branches[0]._id));
      await page.getByLabel(`Số lượng tồn ${branches[0].name}`).fill('3');
      await page.getByRole('button', { name: 'Tạo sản phẩm' }).click();
      await expect(page.getByRole('heading', { name: 'Thêm sản phẩm' })).not.toBeVisible();

      const created = await db.collection('products').findOne({ code });

      const listSearch = page.getByPlaceholder('Tìm theo tên, mã hoặc barcode...');
      await listSearch.fill(code);
      await page.getByRole('button', { name: 'Lọc', exact: true }).first().click();
      const row = page.locator('table.data-table tbody tr').filter({ hasText: code }).first();
      await row.getByRole('button', { name: 'Sửa' }).click();

      // Clear name (required) -> blocked.
      await page.locator('.form-field').filter({ hasText: 'Tên sản phẩm *' }).locator('input').fill('');
      let patchCalled = false;
      page.on('request', (req) => {
        if (req.url().match(/\/products\/products\//) && req.method() === 'PATCH') patchCalled = true;
      });
      await page.getByRole('button', { name: 'Cập nhật' }).click();
      await expect(page.locator('.field-error-text', { hasText: 'Vui lòng nhập tên sản phẩm.' })).toBeVisible();
      expect(patchCalled).toBe(false);
      await expect(page.getByRole('heading', { name: 'Sửa sản phẩm' })).toBeVisible();

      // Stock not changed.
      const stock = await db.collection('productbranchstocks').findOne({ productId: created?._id });
      expect(stock?.qty).toBe(3);

      // Cancel does not write.
      await page.getByRole('button', { name: 'Hủy' }).click();
      const afterCancel = await db.collection('products').findOne({ _id: created?._id });
      expect(afterCancel?.name).toBe(created?.name);
    } finally {
      await cleanup(db, [code]);
    }
  });

  test('server validation blocks direct create requests bypassing form', async ({ page }) => {
    test.setTimeout(120000);
    const db = await connectDB();
    const branches = await db.collection('branches').find({ isActive: { $ne: false } }).limit(1).toArray();
    test.skip(branches.length < 1, 'Cần ít nhất một kho đang hoạt động.');
    const code = `${MARKER}_API`;

    try {
      await page.goto('/products');
      await page.waitForLoadState('networkidle');
      const token = await page.evaluate(() => localStorage.getItem('token'));
      const headers = { Authorization: `Bearer ${token}` };

      // Missing required fields.
      const missingFields = await page.request.post('http://localhost:4100/api/products/products', {
        headers,
        data: { code, name: 'X', initialStocks: [{ warehouseId: String(branches[0]._id), quantity: 1 }] },
      });
      expect(missingFields.status()).toBe(400);

      // No warehouse.
      const noWarehouse = await page.request.post('http://localhost:4100/api/products/products', {
        headers,
        data: { code, name: 'X', barcode: '123', type: 'product', unit: 'cái', price: 1, weight: 1, size: 'M', color: 'Đỏ', categoryId: String(branches[0]._id) },
      });
      expect(noWarehouse.status()).toBe(400);

      // Bad barcode (letters).
      const badBarcode = await page.request.post('http://localhost:4100/api/products/products', {
        headers,
        data: { code, name: 'X', barcode: '12A', type: 'product', unit: 'cái', price: 1, weight: 1, size: 'M', color: 'Đỏ', categoryId: String(branches[0]._id), initialStocks: [{ warehouseId: String(branches[0]._id), quantity: 1 }] },
      });
      expect(badBarcode.status()).toBe(400);

      expect(await db.collection('products').countDocuments({ code })).toBe(0);
    } finally {
      await cleanup(db, [code]);
    }
  });
});
