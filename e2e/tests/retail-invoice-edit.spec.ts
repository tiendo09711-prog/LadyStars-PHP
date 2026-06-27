import { expect, test } from '@playwright/test';
import { ObjectId } from 'mongodb';
import {
  API_BASE,
  cleanupRetailFixtures,
  closeDB,
  connectDB,
  createCompletedSale,
  createRetailFixture,
  createReturnExchange,
  getBranchStock,
} from '../utils/db';

const PREFIX = 'E2E_RETAIL_EDIT_';
const usedPrefixes = new Set<string>();

function scenarioPrefix(label: string) {
  const prefix = `${PREFIX}${label}_${Date.now()}_`;
  usedPrefixes.add(prefix);
  return prefix;
}

async function authHeaders(page: any) {
  await page.goto('/');
  const token = await page.evaluate(() => localStorage.getItem('token'));
  return { Authorization: `Bearer ${token}` };
}

function field(page: any, label: string) {
  return page.locator('label').filter({ hasText: label }).locator('input, textarea, select').first();
}

async function expectSaleValues(page: any, headers: Record<string, string>, saleId: string, expected: {
  note?: string;
  quantity?: number;
  unitPrice?: number;
  paymentAmount?: number;
  tenderedValue?: number;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
}) {
  const response = await page.request.get(`${API_BASE}/products/sales/${saleId}`, { headers });
  expect(response.ok()).toBeTruthy();
  const sale = await response.json();
  if (expected.note !== undefined) expect(sale.note).toBe(expected.note);
  if (expected.quantity !== undefined) expect(Number(sale.items?.[0]?.amount)).toBe(expected.quantity);
  if (expected.unitPrice !== undefined) expect(Number(sale.items?.[0]?.value)).toBe(expected.unitPrice);
  if (expected.paymentAmount !== undefined) {
    expect(Number(sale.valuePayment)).toBe(expected.paymentAmount);
    expect(Number(sale.typePayment?.[0]?.amount)).toBe(expected.paymentAmount);
  }
  if (expected.tenderedValue !== undefined) expect(Number(sale.tenderedValue)).toBe(expected.tenderedValue);
  if (expected.customerName !== undefined) expect(sale.customerId?.name).toBe(expected.customerName);
  if (expected.customerPhone !== undefined) expect(sale.customerId?.phone).toBe(expected.customerPhone);
  if (expected.customerEmail !== undefined) expect(sale.customerId?.email).toBe(expected.customerEmail);
  return sale;
}

test.describe('Retail invoice edit page', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test.afterAll(async () => {
    for (const prefix of usedPrefixes) await cleanupRetailFixtures(prefix);
    await closeDB();
  });

  test('saves a completed invoice from the top button and persists after reload', async ({ page }) => {
    const prefix = scenarioPrefix('TOP_SAVE');
    const fixture = await createRetailFixture(prefix, 1);
    const headers = await authHeaders(page);
    const sale = await createCompletedSale(page.request, headers, {
      code: `${prefix}SALE_TOP`,
      branchId: String(fixture.branch._id),
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 1, value: fixture.products[0].price }],
    });

    await page.goto(`/sales-channels/store/retail/create?editId=${sale._id}`);
    await expect(page.getByRole('heading', { name: 'Sửa hóa đơn bán lẻ' })).toBeVisible();
    await expect(field(page, 'Tên khách hàng')).toHaveValue(fixture.customer.name);
    await expect(page.getByLabel(`Số lượng ${fixture.products[0].code}`)).toHaveValue('1');

    await field(page, 'Tên khách hàng').fill(`${prefix}Updated Customer`);
    await field(page, 'Số điện thoại').fill('0987654321');
    await field(page, 'Email').fill('retail-edit@example.test');
    await page.getByLabel(`Số lượng ${fixture.products[0].code}`).fill('2');
    await page.getByLabel(`Đơn giá ${fixture.products[0].code}`).fill('120000');
    await page.getByLabel('Số tiền thanh toán').fill('240000');
    await page.getByLabel('Tiền khách trả').fill('250000');
    await field(page, 'Ghi chú hóa đơn').fill(`${prefix}top note`);

    const patchResponse = page.waitForResponse((response) => response.url().includes(`/api/products/sales/${sale._id}`) && response.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Lưu hóa đơn' }).click();
    const response = await patchResponse;
    expect(response.ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/sales-channels\/store\/retail$/);

    await expectSaleValues(page, headers, sale._id, {
      note: `${prefix}top note`,
      quantity: 2,
      unitPrice: 120000,
      paymentAmount: 240000,
      tenderedValue: 250000,
      customerName: `${prefix}Updated Customer`,
      customerPhone: '0987654321',
      customerEmail: 'retail-edit@example.test',
    });

    await page.goto(`/sales-channels/store/retail/create?editId=${sale._id}`);
    await expect(field(page, 'Tên khách hàng')).toHaveValue(`${prefix}Updated Customer`);
    await expect(field(page, 'Email')).toHaveValue('retail-edit@example.test');
    await expect(page.getByLabel(`Số lượng ${fixture.products[0].code}`)).toHaveValue('2');
    await expect(page.getByLabel('Số tiền thanh toán')).toHaveValue('240000');
    await expect(page.getByLabel('Tiền khách trả')).toHaveValue('250000');
    await expect(field(page, 'Ghi chú hóa đơn')).toHaveValue(`${prefix}top note`);
  });

  test('bottom save uses the same PATCH flow and completed stock delta is single-applied', async ({ page }) => {
    const prefix = scenarioPrefix('BOTTOM_SAVE');
    const fixture = await createRetailFixture(prefix, 1);
    const headers = await authHeaders(page);
    const sale = await createCompletedSale(page.request, headers, {
      code: `${prefix}SALE_BOTTOM`,
      branchId: String(fixture.branch._id),
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 2, value: fixture.products[0].price }],
    });
    expect(await getBranchStock(fixture.products[0]._id, fixture.branch._id)).toBe(48);

    await page.goto(`/sales-channels/store/retail/create?editId=${sale._id}`);
    await page.getByLabel(`Số lượng ${fixture.products[0].code}`).fill('4');
    await page.getByLabel('Số tiền thanh toán').fill('400000');
    await page.getByLabel('Tiền khách trả').fill('400000');
    await field(page, 'Ghi chú hóa đơn').fill(`${prefix}bottom note`);

    const patchResponses: string[] = [];
    page.on('response', (response) => {
      if (response.url().includes(`/api/products/sales/${sale._id}`) && response.request().method() === 'PATCH') {
        patchResponses.push(response.url());
      }
    });
    const patchResponse = page.waitForResponse((response) => response.url().includes(`/api/products/sales/${sale._id}`) && response.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Xác nhận & Lưu' }).click();
    expect((await patchResponse).ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/sales-channels\/store\/retail$/);

    expect(patchResponses).toHaveLength(1);
    expect(await getBranchStock(fixture.products[0]._id, fixture.branch._id)).toBe(46);
    const db = await connectDB();
    expect(await db.collection('productlogs').countDocuments({ sourceType: 'SalePaymentRevision', sourceId: new ObjectId(sale._id) })).toBe(1);
    await expectSaleValues(page, headers, sale._id, { note: `${prefix}bottom note`, quantity: 4, paymentAmount: 400000 });
  });

  test('rejects invalid payments, cancelled invoice, refund invoice, and insufficient stock', async ({ page }) => {
    const prefix = scenarioPrefix('NEGATIVE');
    const fixture = await createRetailFixture(prefix, 1);
    const headers = await authHeaders(page);
    const sale = await createCompletedSale(page.request, headers, {
      code: `${prefix}SALE_NEG`,
      branchId: String(fixture.branch._id),
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 1, value: fixture.products[0].price }],
    });

    await page.goto(`/sales-channels/store/retail/create?editId=${sale._id}`);
    await page.getByLabel('Số tiền thanh toán').fill('1');
    await page.getByRole('button', { name: 'Lưu hóa đơn' }).click();
    await expect(page.getByText(/Còn thiếu|Số tiền thanh toán/)).toBeVisible();

    const stockFail = await page.request.patch(`${API_BASE}/products/sales/${sale._id}`, {
      headers,
      data: {
        customerId: String(fixture.customer._id),
        discountValue: 0,
        discountType: 'number',
        valuePayment: 6000000,
        typePayment: [{ methodId: String(fixture.paymentMethods.cash._id), amount: 6000000 }],
        items: [{ productId: String(fixture.products[0]._id), amount: 60, value: fixture.products[0].price, discountValue: 0, discountType: 'number' }],
      },
    });
    expect(stockFail.status()).toBe(422);

    const refundedSale = await createCompletedSale(page.request, headers, {
      code: `${prefix}SALE_REFUNDED`,
      branchId: String(fixture.branch._id),
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 2, value: fixture.products[0].price }],
    });
    const refund = await createReturnExchange(page.request, headers, refundedSale._id, {
      code: `${prefix}REFUND`,
      returnedItems: [{ productId: String(fixture.products[0]._id), amount: 1, value: fixture.products[0].price }],
      refundPayments: [{ methodId: String(fixture.paymentMethods.cash._id), amount: fixture.products[0].price }],
    });
    expect(refund.status()).toBe(201);
    await page.goto(`/sales-channels/store/retail/create?editId=${refundedSale._id}`);
    await expect(page.getByRole('button', { name: 'Lưu hóa đơn' })).toBeDisabled();

    const cancel = await page.request.post(`${API_BASE}/products/sales/${sale._id}/cancel`, { headers });
    expect(cancel.ok()).toBeTruthy();
    await page.goto(`/sales-channels/store/retail/create?editId=${sale._id}`);
    await expect(page.getByRole('button', { name: 'Lưu hóa đơn' })).toBeDisabled();
  });
});
