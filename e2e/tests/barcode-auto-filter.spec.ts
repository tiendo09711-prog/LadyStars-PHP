import { test, expect } from '@playwright/test';
import { ObjectId } from 'mongodb';
import { connectDB, closeDB } from '../utils/db';

const RUN_ID = `E2E_BARCODE_FILTER_${Date.now()}`;
const PRODUCT_CODE = `${RUN_ID}_PROD`;
const PRODUCT_BARCODE = String(Date.now()).slice(-12).padStart(12, '8');
const PRODUCT_NAME = `Sản phẩm quét barcode filter ${RUN_ID}`;

async function scanBarcode(page: import('@playwright/test').Page, barcode: string) {
  await page.evaluate((value) => {
    for (const char of value) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true }));
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  }, barcode);
}

test.describe('Barcode auto-filter', () => {
  test.beforeAll(async () => {
    const db = await connectDB();
    await db.collection('products').deleteMany({ code: PRODUCT_CODE });

    const productId = new ObjectId();
    await db.collection('products').insertOne({
      _id: productId,
      code: PRODUCT_CODE,
      barcode: PRODUCT_BARCODE,
      name: PRODUCT_NAME,
      type: 'product',
      status: 'Mới',
      unit: 'cái',
      cost: 10000,
      price: 20000,
      qty: 7,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const branch = await db.collection('branches').findOne({ isActive: { $ne: false } });
    if (branch) {
      await db.collection('productbranchstocks').insertOne({
        productId,
        branchId: branch._id,
        qty: 7,
        costPrice: 10000,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  });

  test.afterAll(async () => {
    const db = await connectDB();
    const products = await db.collection('products').find({ code: PRODUCT_CODE }).toArray();
    const productIds = products.map((product) => product._id);
    if (productIds.length) await db.collection('productbranchstocks').deleteMany({ productId: { $in: productIds } });
    await db.collection('products').deleteMany({ code: PRODUCT_CODE });
    await closeDB();
  });

  test('inventory search input auto-filters after scanner barcode and still supports manual search', async ({ page }) => {
    test.setTimeout(90000);

    await page.goto('/products/inventory');
    await page.waitForLoadState('networkidle');

    const searchInput = page.locator('input[data-product-search-scan="true"]').first();
    await searchInput.focus();
    await scanBarcode(page, PRODUCT_BARCODE);

    await expect(searchInput).toHaveValue(PRODUCT_BARCODE);
    await expect(page.locator('table.data-table tbody tr').filter({ hasText: PRODUCT_CODE }).first()).toBeVisible({ timeout: 15000 });

    await searchInput.fill(PRODUCT_NAME);
    await searchInput.press('Enter');
    await expect(searchInput).toHaveValue(PRODUCT_NAME);
    await expect(page.locator('table.data-table tbody tr').filter({ hasText: PRODUCT_CODE }).first()).toBeVisible({ timeout: 15000 });
  });
});
