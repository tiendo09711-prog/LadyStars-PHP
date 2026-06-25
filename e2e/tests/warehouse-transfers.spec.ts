import { expect, test } from '@playwright/test';
import { ObjectId } from 'mongodb';
import { closeDB, connectDB } from '../utils/db';

const runId = `E2E_TRF_SEARCH_${Date.now()}`;

test.describe('Warehouse transfer product search', () => {
  let db: any;
  const sourceBranch = { _id: new ObjectId(), code: `${runId}_SRC`.slice(0, 40), name: `${runId} Source`, isActive: true, createdAt: new Date(), updatedAt: new Date() };
  const destinationBranch = { _id: new ObjectId(), code: `${runId}_DST`.slice(0, 40), name: `${runId} Destination`, isActive: true, createdAt: new Date(), updatedAt: new Date() };
  const otherBranch = { _id: new ObjectId(), code: `${runId}_OTH`.slice(0, 40), name: `${runId} Other`, isActive: true, createdAt: new Date(), updatedAt: new Date() };
  const sourceProduct = { _id: new ObjectId(), code: `${runId}_SRC_PRODUCT`.slice(0, 40), name: `${runId} Product In Source`, barcode: `${runId}_BAR`, qty: 17, price: 100000, cost: 50000, unit: 'Hộp', type: 'product', createdAt: new Date(), updatedAt: new Date() };
  const otherOnlyProduct = { _id: new ObjectId(), code: `${runId}_OTHER_PRODUCT`.slice(0, 40), name: `${runId} Product Other Only`, barcode: `${runId}_OTHER_BAR`, qty: 9, price: 100000, cost: 50000, unit: 'Cái', type: 'product', createdAt: new Date(), updatedAt: new Date() };

  test.beforeAll(async () => {
    db = await connectDB();
    await db.collection('branches').insertMany([sourceBranch, destinationBranch, otherBranch]);
    await db.collection('products').insertMany([sourceProduct, otherOnlyProduct]);
    await db.collection('productbranchstocks').insertMany([
      { productId: sourceProduct._id, branchId: sourceBranch._id, qty: 17, createdAt: new Date(), updatedAt: new Date() },
      { productId: sourceProduct._id, branchId: destinationBranch._id, qty: 0, createdAt: new Date(), updatedAt: new Date() },
      { productId: otherOnlyProduct._id, branchId: otherBranch._id, qty: 9, createdAt: new Date(), updatedAt: new Date() },
    ]);
  });

  test.afterAll(async () => {
    await db.collection('warehousetransfers').deleteMany({ note: new RegExp(`^${runId}`) });
    await db.collection('productbranchstocks').deleteMany({ productId: { $in: [sourceProduct._id, otherOnlyProduct._id] } });
    await db.collection('products').deleteMany({ _id: { $in: [sourceProduct._id, otherOnlyProduct._id] } });
    await db.collection('branches').deleteMany({ _id: { $in: [sourceBranch._id, destinationBranch._id, otherBranch._id] } });
    await closeDB();
  });

  test('requires warehouses and suggests only source-stock products', async ({ page }) => {
    const inventoryRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/products/inventories')) inventoryRequests.push(request.url());
    });

    await page.goto('/warehouse/transfers/create');
    const search = page.getByTestId('transfer-product-search');
    await expect(search).toBeDisabled();
    await expect(search).toHaveAttribute('placeholder', 'Chọn kho nguồn và kho đích trước khi tìm sản phẩm.');
    await expect.poll(() => inventoryRequests.length).toBe(0);

    await page.getByTestId('transfer-source-warehouse').selectOption(sourceBranch._id.toString());
    await expect(search).toBeDisabled();
    await expect.poll(() => inventoryRequests.length).toBe(0);

    await Promise.all([
      page.waitForResponse((response) => response.url().includes('/api/products/inventories') && response.url().includes(sourceBranch._id.toString()) && response.status() === 200),
      page.getByTestId('transfer-destination-warehouse').selectOption(destinationBranch._id.toString()),
    ]);
    await expect(search).toBeEnabled();

    await search.fill(sourceProduct.code);
    await search.focus();
    const suggestions = page.getByTestId('transfer-product-suggestions');
    await expect(suggestions).toContainText(sourceProduct.code);
    await expect(suggestions).toContainText(sourceProduct.name);
    await expect(suggestions).toContainText('Hộp');
    await expect(suggestions).toContainText(`Tồn tại ${sourceBranch.name}: 17`);

    await search.fill(otherOnlyProduct.code);
    await expect(suggestions).toContainText(`Không tìm thấy sản phẩm còn tồn tại ${sourceBranch.name}.`);
    await expect(suggestions).not.toContainText(otherOnlyProduct.name);

    await search.fill(sourceProduct.barcode);
    await suggestions.getByText(sourceProduct.name).click();
    await expect(page.locator('table.data-table tbody tr')).toContainText(sourceProduct.code);
    await expect(page.locator('table.data-table tbody tr')).toContainText('17');

    await page.getByLabel('Ghi chú').fill(`${runId} create draft`);
    await page.getByRole('button', { name: 'Tạo đơn cần duyệt' }).last().click();
    await expect(page).toHaveURL(/\/warehouse\/transfers\//, { timeout: 10000 });
  });
});
