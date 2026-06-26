import { expect, test } from '@playwright/test';
import {
  API_BASE,
  cleanupRetailFixtures,
  closeDB,
  connectDB,
  createCompletedSale,
  createDraftRefund,
  createRetailFixture,
  createReturnExchange,
  getBranchStock,
  reviseSale,
} from '../utils/db';

const PREFIX = 'E2E_RETAIL_INTEGRITY_';
const usedPrefixes = new Set<string>();

function scenarioPrefix(label: string) {
  const prefix = `${PREFIX}${label}_`;
  usedPrefixes.add(prefix);
  return prefix;
}

function todayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function authHeaders(page: any) {
  await page.goto('/');
  const token = await page.evaluate(() => localStorage.getItem('token'));
  return { Authorization: `Bearer ${token}` };
}

async function getCustomerByPhone(page: any, headers: Record<string, string>, phone: string) {
  const response = await page.request.get(`${API_BASE}/customers/customers?phone=${phone}&limit=5`, { headers });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  return payload.items?.[0];
}

test.describe('Retail invoice integrity', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test.afterAll(async () => {
    for (const prefix of usedPrefixes) {
      await cleanupRetailFixtures(prefix);
    }
    await closeDB();
  });

  test('keeps sale identity on revision and rolls stock back correctly', async ({ page }) => {
    const prefix = scenarioPrefix('REVISION_KEEP_IDENTITY');
    const fixture = await createRetailFixture(prefix, 2);
    const headers = await authHeaders(page);

    const original = await createCompletedSale(page.request, headers, {
      code: `${prefix}SALE_MAIN`,
      branchId: String(fixture.branch._id),
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [
        { productId: String(fixture.products[0]._id), amount: 1, value: fixture.products[0].price },
        { productId: String(fixture.products[1]._id), amount: 1, value: fixture.products[1].price },
      ],
    });

    const stockAfterSale = await getBranchStock(fixture.products[1]._id, fixture.branch._id);
    expect(stockAfterSale).toBe(49);

    const reviseResponse = await reviseSale(page.request, headers, original._id, {
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 1, value: fixture.products[0].price }],
    });
    expect(reviseResponse.ok()).toBeTruthy();
    const revised = await reviseResponse.json();

    expect(revised._id).toBe(original._id);
    expect(revised.code).toBe(original.code);
    expect(revised.createdAt).toBe(original.createdAt);
    expect(revised.completedAt).toBe(original.completedAt);

    const stockAfterRevision = await getBranchStock(fixture.products[1]._id, fixture.branch._id);
    expect(stockAfterRevision).toBe(50);

    const db = await connectDB();
    expect(await db.collection('salepayments').countDocuments({ code: original.code })).toBe(1);
  });

  test('decreases stock on revision and rolls everything back when stock is insufficient', async ({ page }) => {
    const prefix = scenarioPrefix('REVISION_DECREASE_STOCK');
    const fixture = await createRetailFixture(prefix, 1);
    const headers = await authHeaders(page);

    const sale = await createCompletedSale(page.request, headers, {
      code: `${prefix}SALE_MAIN`,
      branchId: String(fixture.branch._id),
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 1, value: fixture.products[0].price }],
    });

    const reviseUpResponse = await reviseSale(page.request, headers, sale._id, {
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 3, value: fixture.products[0].price }],
    });
    expect(reviseUpResponse.ok()).toBeTruthy();
    expect(await getBranchStock(fixture.products[0]._id, fixture.branch._id)).toBe(47);

    const failedResponse = await reviseSale(page.request, headers, sale._id, {
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 60, value: fixture.products[0].price }],
    });
    expect(failedResponse.status()).toBe(422);

    const currentSaleResponse = await page.request.get(`${API_BASE}/products/sales/${sale._id}`, { headers });
    expect(currentSaleResponse.ok()).toBeTruthy();
    const currentSale = await currentSaleResponse.json();
    expect(currentSale.items).toHaveLength(1);
    expect(Number(currentSale.items[0].amount)).toBe(3);
    expect(await getBranchStock(fixture.products[0]._id, fixture.branch._id)).toBe(47);
  });

  test('handles partial and full refunds without changing sale status or allowing forbidden actions', async ({ page }) => {
    const prefix = scenarioPrefix('PARTIAL_FULL_REFUND');
    const fixture = await createRetailFixture(prefix, 1);
    const headers = await authHeaders(page);

    const sale = await createCompletedSale(page.request, headers, {
      code: `${prefix}SALE_MAIN`,
      branchId: String(fixture.branch._id),
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 3, value: fixture.products[0].price }],
    });

    const partialResponse = await createReturnExchange(page.request, headers, sale._id, {
      code: `${prefix}REFUND_PARTIAL`,
      returnedItems: [{ productId: String(fixture.products[0]._id), amount: 1, value: fixture.products[0].price }],
      refundPayments: [{ methodId: String(fixture.paymentMethods.cash._id), amount: fixture.products[0].price }],
    });
    expect(partialResponse.status()).toBe(201);
    const partialPayload = await partialResponse.json();
    expect(partialPayload.sale.status).toBe('completed');
    expect(partialPayload.sale.refundStatus).toBe('partial');
    expect(Number(partialPayload.sale.refundedValue)).toBe(fixture.products[0].price);
    expect(await getBranchStock(fixture.products[0]._id, fixture.branch._id)).toBe(48);

    const cancelAfterPartial = await page.request.post(`${API_BASE}/products/sales/${sale._id}/cancel`, { headers });
    expect(cancelAfterPartial.status()).toBe(422);
    const deleteAfterPartial = await page.request.delete(`${API_BASE}/products/sales/${sale._id}`, { headers });
    expect(deleteAfterPartial.status()).toBe(422);
    const editAfterPartial = await reviseSale(page.request, headers, sale._id, {
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 2, value: fixture.products[0].price }],
    });
    expect(editAfterPartial.status()).toBe(422);

    const fullResponse = await createReturnExchange(page.request, headers, sale._id, {
      code: `${prefix}REFUND_FULL`,
      returnedItems: [{ productId: String(fixture.products[0]._id), amount: 2, value: fixture.products[0].price }],
      refundPayments: [{ methodId: String(fixture.paymentMethods.transfer._id), amount: fixture.products[0].price * 2 }],
    });
    expect(fullResponse.status()).toBe(201);
    const fullPayload = await fullResponse.json();
    expect(fullPayload.sale.refundStatus).toBe('full');
    expect(await getBranchStock(fixture.products[0]._id, fixture.branch._id)).toBe(50);

    const thirdRefund = await createReturnExchange(page.request, headers, sale._id, {
      code: `${prefix}REFUND_EXTRA`,
      returnedItems: [{ productId: String(fixture.products[0]._id), amount: 1, value: fixture.products[0].price }],
      refundPayments: [{ methodId: String(fixture.paymentMethods.cash._id), amount: fixture.products[0].price }],
    });
    expect(thirdRefund.status()).toBe(422);

    const cancelAfterFull = await page.request.post(`${API_BASE}/products/sales/${sale._id}/cancel`, { headers });
    expect(cancelAfterFull.status()).toBe(422);
    const deleteAfterFull = await page.request.delete(`${API_BASE}/products/sales/${sale._id}`, { headers });
    expect(deleteAfterFull.status()).toBe(422);
    const editAfterFull = await reviseSale(page.request, headers, sale._id, {
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 1, value: fixture.products[0].price }],
    });
    expect(editAfterFull.status()).toBe(422);
  });

  test('rolls exchange back on insufficient replacement stock and validates settlements with real payment methods', async ({ page }) => {
    const prefix = scenarioPrefix('EXCHANGE_SETTLEMENT');
    const fixture = await createRetailFixture(prefix, 2);
    const headers = await authHeaders(page);
    const db = await connectDB();

    await db.collection('productbranchstocks').updateOne(
      { productId: fixture.products[1]._id, branchId: fixture.branch._id },
      { $set: { qty: 0, updatedAt: new Date() } },
    );
    await db.collection('products').updateOne({ _id: fixture.products[1]._id }, { $set: { qty: 0, updatedAt: new Date() } });

    const failingSale = await createCompletedSale(page.request, headers, {
      code: `${prefix}SALE_FAIL`,
      branchId: String(fixture.branch._id),
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 1, value: fixture.products[0].price }],
    });

    const stockBeforeFail = await getBranchStock(fixture.products[0]._id, fixture.branch._id);
    const exchangeFail = await createReturnExchange(page.request, headers, failingSale._id, {
      code: `${prefix}REFUND_FAIL`,
      returnedItems: [{ productId: String(fixture.products[0]._id), amount: 1, value: fixture.products[0].price }],
      replacementItems: [{ productId: String(fixture.products[1]._id), amount: 1, value: fixture.products[1].price }],
      salePayments: [{ methodId: String(fixture.paymentMethods.transfer._id), amount: fixture.products[1].price - fixture.products[0].price }],
    });
    expect(exchangeFail.status()).toBe(422);
    expect(await getBranchStock(fixture.products[0]._id, fixture.branch._id)).toBe(stockBeforeFail);
    expect(await getBranchStock(fixture.products[1]._id, fixture.branch._id)).toBe(0);
    expect(await db.collection('productrefunds').countDocuments({ code: `${prefix}REFUND_FAIL` })).toBe(0);

    await db.collection('productbranchstocks').updateOne(
      { productId: fixture.products[1]._id, branchId: fixture.branch._id },
      { $set: { qty: 10, updatedAt: new Date() } },
    );
    await db.collection('products').updateOne({ _id: fixture.products[1]._id }, { $set: { qty: 10, updatedAt: new Date() } });

    const extraPaySale = await createCompletedSale(page.request, headers, {
      code: `${prefix}SALE_EXTRA_PAY`,
      branchId: String(fixture.branch._id),
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 1, value: fixture.products[0].price }],
    });
    const extraPayResponse = await createReturnExchange(page.request, headers, extraPaySale._id, {
      code: `${prefix}REFUND_EXTRA_PAY`,
      replacementCode: `${prefix}REPLACEMENT_EXTRA_PAY`,
      returnedItems: [{ productId: String(fixture.products[0]._id), amount: 1, value: fixture.products[0].price }],
      replacementItems: [{ productId: String(fixture.products[1]._id), amount: 1, value: fixture.products[1].price }],
      salePayments: [{ methodId: String(fixture.paymentMethods.transfer._id), amount: fixture.products[1].price - fixture.products[0].price }],
    });
    expect(extraPayResponse.status()).toBe(201);
    const extraPayPayload = await extraPayResponse.json();
    expect(Number(extraPayPayload.refund.settlementValue)).toBe(fixture.products[0].price);
    expect(Number(extraPayPayload.refund.totalPayableAmount)).toBe(0);
    expect(Number(extraPayPayload.replacementSale.valuePayment)).toBe(fixture.products[1].price - fixture.products[0].price);
    expect(extraPayPayload.replacementSale.typePayment).toHaveLength(1);
    expect(extraPayPayload.replacementSale.typePayment[0].methodId).toBeTruthy();

    const refundBackSale = await createCompletedSale(page.request, headers, {
      code: `${prefix}SALE_REFUND_BACK`,
      branchId: String(fixture.branch._id),
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[1]._id), amount: 1, value: fixture.products[1].price }],
    });
    const refundBackResponse = await createReturnExchange(page.request, headers, refundBackSale._id, {
      code: `${prefix}REFUND_BACK`,
      replacementCode: `${prefix}REPLACEMENT_BACK`,
      returnedItems: [{ productId: String(fixture.products[1]._id), amount: 1, value: fixture.products[1].price }],
      replacementItems: [{ productId: String(fixture.products[0]._id), amount: 1, value: fixture.products[0].price }],
      refundPayments: [{ methodId: String(fixture.paymentMethods.card._id), amount: fixture.products[1].price - fixture.products[0].price }],
    });
    expect(refundBackResponse.status()).toBe(201);
    const refundBackPayload = await refundBackResponse.json();
    expect(Number(refundBackPayload.refund.totalPayableAmount)).toBe(fixture.products[1].price - fixture.products[0].price);
    expect(Number(refundBackPayload.refund.settlementValue)).toBe(fixture.products[0].price);
    expect(refundBackPayload.refund.typePayment).toHaveLength(1);
    expect(refundBackPayload.refund.typePayment[0].methodId).toBeTruthy();
  });

  test('cancels a completed sale exactly once and never hard deletes it directly', async ({ page }) => {
    const prefix = scenarioPrefix('CANCEL_COMPLETED');
    const fixture = await createRetailFixture(prefix, 1);
    const headers = await authHeaders(page);

    const sale = await createCompletedSale(page.request, headers, {
      code: `${prefix}SALE_MAIN`,
      branchId: String(fixture.branch._id),
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 2, value: fixture.products[0].price }],
    });

    const deleteCompleted = await page.request.delete(`${API_BASE}/products/sales/${sale._id}`, { headers });
    expect(deleteCompleted.status()).toBe(422);

    const stockAfterSale = await getBranchStock(fixture.products[0]._id, fixture.branch._id);
    expect(stockAfterSale).toBe(48);

    const cancelResponse = await page.request.post(`${API_BASE}/products/sales/${sale._id}/cancel`, { headers });
    expect(cancelResponse.ok()).toBeTruthy();
    expect(await getBranchStock(fixture.products[0]._id, fixture.branch._id)).toBe(50);

    const secondCancel = await page.request.post(`${API_BASE}/products/sales/${sale._id}/cancel`, { headers });
    expect([409, 422]).toContain(secondCancel.status());
    expect(await getBranchStock(fixture.products[0]._id, fixture.branch._id)).toBe(50);
  });

  test('keeps revenue and customer metrics net of completed refunds', async ({ page }) => {
    const prefix = scenarioPrefix('REVENUE_CUSTOMER');
    const fixture = await createRetailFixture(prefix, 1);
    const headers = await authHeaders(page);
    const today = todayIsoDate();


    const sale = await createCompletedSale(page.request, headers, {
      code: `${prefix}SALE_MAIN`,
      branchId: String(fixture.branch._id),
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 10, value: fixture.products[0].price }],
    });

    const firstRefund = await createReturnExchange(page.request, headers, sale._id, {
      code: `${prefix}REFUND_300K`,
      returnedItems: [{ productId: String(fixture.products[0]._id), amount: 3, value: fixture.products[0].price }],
      refundPayments: [{ methodId: String(fixture.paymentMethods.cash._id), amount: fixture.products[0].price * 3 }],
    });
    expect(firstRefund.status()).toBe(201);

    const reportResponse = await page.request.get(`${API_BASE}/reports/revenue-time?displayType=Theo%20ngay&fromDate=${today}&toDate=${today}&branchId=${fixture.branch._id}`, { headers });
    expect(reportResponse.ok()).toBeTruthy();
    const reportRows = await reportResponse.json();
    const reportRevenue = reportRows.reduce((sum: number, row: any) => sum + Number(row.revenue || 0), 0);
    expect(reportRevenue).toBe(700000);

    const dashboardResponse = await page.request.get(`${API_BASE}/dashboard?stores=${encodeURIComponent(fixture.branch.name)}&date=Hom%20nay&refresh=1`, { headers });
    expect(dashboardResponse.ok()).toBeTruthy();
    const dashboardPayload = await dashboardResponse.json();
    expect(Number(dashboardPayload.totals?.revenue || 0)).toBe(700000);


    const customerAfterFirst = await getCustomerByPhone(page, headers, fixture.customer.phone);
    expect(Number(customerAfterFirst.totalSpent || 0)).toBe(700000);
    expect(Number(customerAfterFirst.purchaseCount || 0)).toBe(1);

    const secondRefund = await createReturnExchange(page.request, headers, sale._id, {
      code: `${prefix}REFUND_700K`,
      returnedItems: [{ productId: String(fixture.products[0]._id), amount: 7, value: fixture.products[0].price }],
      refundPayments: [{ methodId: String(fixture.paymentMethods.transfer._id), amount: fixture.products[0].price * 7 }],
    });
    expect(secondRefund.status()).toBe(201);

    const customerAfterSecond = await getCustomerByPhone(page, headers, fixture.customer.phone);
    expect(Number(customerAfterSecond.totalSpent || 0)).toBe(0);
    expect(Number(customerAfterSecond.purchaseCount || 0)).toBe(0);

  });

  test('creates a real draft refund with valid payment lines for legacy edit coverage', async ({ page }) => {
    const prefix = scenarioPrefix('LEGACY_DRAFT_REFUND');
    const fixture = await createRetailFixture(prefix, 1);
    const headers = await authHeaders(page);
    const sale = await createCompletedSale(page.request, headers, {
      code: `${prefix}SALE_MAIN`,
      branchId: String(fixture.branch._id),
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 2, value: fixture.products[0].price }],
    });

    const draftRefund = await createDraftRefund(page.request, headers, {
      code: `${prefix}REFUND_DRAFT`,
      paymentId: sale._id,
      methodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 1, value: fixture.products[0].price }],
    });
    expect(draftRefund.status()).toBe(201);
  });
});
