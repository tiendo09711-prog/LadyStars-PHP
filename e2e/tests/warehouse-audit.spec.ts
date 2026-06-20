import { expect, test } from '@playwright/test';
import {
  cleanupAuditRun,
  cleanupEmployee,
  createApiContext,
  createEmployee,
  createStockDrift,
  EMPLOYEE_PASSWORD,
  getBranches,
  loginAdminApi,
  loginToken,
  readBranchStock,
  readGlobalStock,
  seedAuditProduct,
  shutdownAuditHelpers,
} from '../utils/warehouse-audit';

function auditCode(runKey: string, suffix: string) {
  return `${runKey}-${suffix}`;
}

async function createAudit(api: any, payload: Record<string, unknown>) {
  const response = await api.post('inventory-audits', { data: payload });
  const data = await response.json().catch(() => null);
  return { response, data };
}

async function submitAudit(api: any, auditId: string) {
  const response = await api.post(`inventory-audits/${auditId}/submit`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function reconcileAudit(api: any, auditId: string) {
  const response = await api.post(`inventory-audits/${auditId}/reconcile`);
  return { response, data: await response.json().catch(() => null) };
}

test.describe.serial('Warehouse audit integration', () => {
  const runKey = `E2E-AUDIT-${Date.now()}`;
  let adminApi: any;
  let hn: any;
  let hcm: any;

  test.beforeAll(async () => {
    const admin = await loginAdminApi();
    adminApi = admin.api;
    const { defaultBranch, secondaryBranch } = await getBranches(adminApi);
    hn = defaultBranch;
    hcm = secondaryBranch._id === defaultBranch._id ? defaultBranch : secondaryBranch;
  });

  test.afterAll(async () => {
    await cleanupAuditRun(adminApi, runKey);
    await adminApi?.dispose();
    await shutdownAuditHelpers();
  });

  test('CASE 1 create by product keeps stock unchanged and shows both views', async () => {
    const productA = await seedAuditProduct(adminApi, {
      code: auditCode(runKey, 'CASE1-A'),
      name: `${runKey} Product A`,
      cost: 100000,
      price: 150000,
      branchStocks: { [hn._id]: 10 },
    });
    const productB = await seedAuditProduct(adminApi, {
      code: auditCode(runKey, 'CASE1-B'),
      name: `${runKey} Product B`,
      cost: 120000,
      price: 180000,
      branchStocks: { [hn._id]: 6 },
    });
    const beforeA = await readBranchStock(adminApi, productA.productId, hn._id);
    const beforeB = await readBranchStock(adminApi, productB.productId, hn._id);

    const code = auditCode(runKey, 'CASE1');
    const created = await createAudit(adminApi, {
      code,
      warehouseId: hn._id,
      auditType: 'BY_PRODUCT',
      status: 'DRAFT',
      note: `${runKey} case 1`,
      items: [{ productId: productA.productId }, { productId: productB.productId }],
    });
    expect(created.response.status()).toBe(201);
    expect(created.data.code).toBe(code);
    expect(created.data.summary.itemCount).toBe(2);
    expect(await readBranchStock(adminApi, productA.productId, hn._id)).toBe(beforeA);
    expect(await readBranchStock(adminApi, productB.productId, hn._id)).toBe(beforeB);

    const listResponse = await adminApi.get(`inventory-audits?keyword=${encodeURIComponent(code)}`);
    expect(listResponse.ok()).toBeTruthy();
    const listPayload = await listResponse.json();
    expect(listPayload.items.some((item: any) => item.code === code)).toBeTruthy();

    const itemsResponse = await adminApi.get(`inventory-audit-items?auditId=${created.data._id}`);
    expect(itemsResponse.ok()).toBeTruthy();
    const itemsPayload = await itemsResponse.json();
    expect(itemsPayload.total).toBe(2);
  });

  test('CASE 2 full warehouse snapshots real warehouse inventory', async () => {
    const seeded = await seedAuditProduct(adminApi, {
      code: auditCode(runKey, 'CASE2-SEED'),
      name: `${runKey} Full Warehouse Seed`,
      cost: 50000,
      price: 70000,
      branchStocks: { [hcm._id]: 7 },
    });
    const before = await readBranchStock(adminApi, seeded.productId, hcm._id);

    const created = await createAudit(adminApi, {
      code: auditCode(runKey, 'CASE2'),
      warehouseId: hcm._id,
      auditType: 'FULL_WAREHOUSE',
      status: 'DRAFT',
      note: `${runKey} case 2`,
    });
    expect(created.response.status()).toBe(201);
    expect(created.data.auditType).toBe('FULL_WAREHOUSE');
    expect(created.data.summary.itemCount).toBeGreaterThan(0);
    expect(created.data.items.some((item: any) => item.productCodeSnapshot === seeded.code)).toBeTruthy();
    expect(await readBranchStock(adminApi, seeded.productId, hcm._id)).toBe(before);
  });

  test('CASE 3 physical quantity validation rejects negative, text, decimal', async () => {
    const seeded = await seedAuditProduct(adminApi, {
      code: auditCode(runKey, 'CASE3'),
      name: `${runKey} Count Validation`,
      cost: 90000,
      price: 130000,
      branchStocks: { [hn._id]: 10 },
    });
    const created = await createAudit(adminApi, {
      code: auditCode(runKey, 'CASE3-AUDIT'),
      warehouseId: hn._id,
      auditType: 'BY_PRODUCT',
      status: 'DRAFT',
      note: `${runKey} case 3`,
      items: [{ productId: seeded.productId }],
    });
    expect(created.response.status()).toBe(201);

    const invalidDecimal = await adminApi.patch(`inventory-audits/${created.data._id}`, {
      data: { status: 'COUNTING', items: [{ productId: seeded.productId, physicalQuantity: 8.5 }] },
    });
    expect(invalidDecimal.status()).toBe(400);

    const invalidNegative = await adminApi.patch(`inventory-audits/${created.data._id}`, {
      data: { status: 'COUNTING', items: [{ productId: seeded.productId, physicalQuantity: -1 }] },
    });
    expect(invalidNegative.status()).toBe(400);

    const invalidText = await adminApi.patch(`inventory-audits/${created.data._id}`, {
      data: { status: 'COUNTING', items: [{ productId: seeded.productId, physicalQuantity: 'abc' }] },
    });
    expect(invalidText.status()).toBe(400);

    const valid = await adminApi.patch(`inventory-audits/${created.data._id}`, {
      data: { status: 'COUNTING', items: [{ productId: seeded.productId, physicalQuantity: 8, note: 'counted once' }] },
    });
    expect(valid.ok()).toBeTruthy();
    const payload = await valid.json();
    expect(payload.items[0].physicalQuantity).toBe(8);
    expect(payload.items[0].varianceQuantity).toBe(-2);
  });

  test('CASE 4 shortage reconcile creates one export voucher and adjusts stock once', async () => {
    const seeded = await seedAuditProduct(adminApi, {
      code: auditCode(runKey, 'CASE4'),
      name: `${runKey} Shortage`,
      cost: 110000,
      price: 150000,
      branchStocks: { [hn._id]: 10 },
    });
    const beforeBranch = await readBranchStock(adminApi, seeded.productId, hn._id);
    const beforeGlobal = await readGlobalStock(adminApi, seeded.productId);

    const created = await createAudit(adminApi, {
      code: auditCode(runKey, 'CASE4-AUDIT'),
      warehouseId: hn._id,
      auditType: 'BY_PRODUCT',
      status: 'COUNTING',
      note: `${runKey} case 4`,
      items: [{ productId: seeded.productId, physicalQuantity: 8 }],
    });
    expect(created.response.status()).toBe(201);
    await submitAudit(adminApi, created.data._id);

    const reconciled = await reconcileAudit(adminApi, created.data._id);
    expect(reconciled.response.ok()).toBeTruthy();
    expect(reconciled.data.status).toBe('RECONCILED');
    expect(reconciled.data.linkedInventoryBillIds).toHaveLength(1);
    expect(await readBranchStock(adminApi, seeded.productId, hn._id)).toBe(beforeBranch - 2);
    expect(await readGlobalStock(adminApi, seeded.productId)).toBe(beforeGlobal - 2);

    const voucherDetail = await adminApi.get(`warehouse/transactions/bills/inventory-voucher/${reconciled.data.linkedInventoryBillIds[0]}`);
    expect(voucherDetail.ok()).toBeTruthy();
    const voucherPayload = await voucherDetail.json();
    expect(String(voucherPayload.kind || voucherPayload.type || '')).toContain('INVENTORY_AUDIT_EXPORT');
    expect(Number(voucherPayload.totalQuantity)).toBe(2);
  });

  test('CASE 5 excess reconcile creates one import voucher', async () => {
    const seeded = await seedAuditProduct(adminApi, {
      code: auditCode(runKey, 'CASE5'),
      name: `${runKey} Excess`,
      cost: 80000,
      price: 140000,
      branchStocks: { [hn._id]: 10 },
    });
    const beforeBranch = await readBranchStock(adminApi, seeded.productId, hn._id);

    const created = await createAudit(adminApi, {
      code: auditCode(runKey, 'CASE5-AUDIT'),
      warehouseId: hn._id,
      auditType: 'BY_PRODUCT',
      status: 'COUNTING',
      note: `${runKey} case 5`,
      items: [{ productId: seeded.productId, physicalQuantity: 13 }],
    });
    expect(created.response.status()).toBe(201);
    await submitAudit(adminApi, created.data._id);

    const reconciled = await reconcileAudit(adminApi, created.data._id);
    expect(reconciled.response.ok()).toBeTruthy();
    expect(reconciled.data.linkedInventoryBillIds).toHaveLength(1);
    expect(await readBranchStock(adminApi, seeded.productId, hn._id)).toBe(beforeBranch + 3);

    const voucherDetail = await adminApi.get(`warehouse/transactions/bills/inventory-voucher/${reconciled.data.linkedInventoryBillIds[0]}`);
    expect(voucherDetail.ok()).toBeTruthy();
    const voucherPayload = await voucherDetail.json();
    expect(String(voucherPayload.kind || voucherPayload.type || '')).toContain('INVENTORY_AUDIT_IMPORT');
    expect(Number(voucherPayload.totalQuantity)).toBe(3);
  });

  test('CASE 6 double reconcile does not create duplicate vouchers', async () => {
    const seeded = await seedAuditProduct(adminApi, {
      code: auditCode(runKey, 'CASE6'),
      name: `${runKey} Double Reconcile`,
      cost: 75000,
      price: 125000,
      branchStocks: { [hn._id]: 10 },
    });
    const created = await createAudit(adminApi, {
      code: auditCode(runKey, 'CASE6-AUDIT'),
      warehouseId: hn._id,
      auditType: 'BY_PRODUCT',
      status: 'COUNTING',
      note: `${runKey} case 6`,
      items: [{ productId: seeded.productId, physicalQuantity: 13 }],
    });
    expect(created.response.status()).toBe(201);
    await submitAudit(adminApi, created.data._id);

    const [first, second] = await Promise.all([
      adminApi.post(`inventory-audits/${created.data._id}/reconcile`),
      adminApi.post(`inventory-audits/${created.data._id}/reconcile`),
    ]);
    expect([200, 409]).toContain(first.status());
    expect([200, 409]).toContain(second.status());

    const refreshed = await adminApi.get(`inventory-audits/${created.data._id}`);
    expect(refreshed.ok()).toBeTruthy();
    const refreshedPayload = await refreshed.json();
    expect(refreshedPayload.status).toBe('RECONCILED');
    expect(refreshedPayload.linkedInventoryBillIds).toHaveLength(1);
  });

  test('CASE 7 stock drift after snapshot blocks reconcile', async () => {
    const seeded = await seedAuditProduct(adminApi, {
      code: auditCode(runKey, 'CASE7'),
      name: `${runKey} Drift`,
      cost: 66000,
      price: 99000,
      branchStocks: { [hn._id]: 10 },
    });
    const created = await createAudit(adminApi, {
      code: auditCode(runKey, 'CASE7-AUDIT'),
      warehouseId: hn._id,
      auditType: 'BY_PRODUCT',
      status: 'COUNTING',
      note: `${runKey} case 7`,
      items: [{ productId: seeded.productId, physicalQuantity: 8 }],
    });
    expect(created.response.status()).toBe(201);
    await submitAudit(adminApi, created.data._id);

    await createStockDrift(adminApi, {
      productId: seeded.productId,
      warehouseId: hn._id,
      warehouseName: hn.name,
      amount: -1,
      note: `${runKey} drift after snapshot`,
    });

    const reconciled = await reconcileAudit(adminApi, created.data._id);
    expect(reconciled.response.status()).toBe(409);
    expect(String(reconciled.data.message || '')).toContain('biến động');
  });

  test('CASE 8 merge same warehouse succeeds and cross warehouse is blocked', async () => {
    const productA = await seedAuditProduct(adminApi, {
      code: auditCode(runKey, 'CASE8-A'),
      name: `${runKey} Merge A`,
      branchStocks: { [hn._id]: 5 },
    });
    const productB = await seedAuditProduct(adminApi, {
      code: auditCode(runKey, 'CASE8-B'),
      name: `${runKey} Merge B`,
      branchStocks: { [hn._id]: 6 },
    });
    const productC = await seedAuditProduct(adminApi, {
      code: auditCode(runKey, 'CASE8-C'),
      name: `${runKey} Merge C`,
      branchStocks: { [hcm._id]: 3 },
    });
    const stockBeforeA = await readBranchStock(adminApi, productA.productId, hn._id);
    const stockBeforeB = await readBranchStock(adminApi, productB.productId, hn._id);

    const auditOne = await createAudit(adminApi, {
      code: auditCode(runKey, 'CASE8-1'),
      warehouseId: hn._id,
      auditType: 'BY_PRODUCT',
      status: 'DRAFT',
      note: `${runKey} case 8 source 1`,
      items: [{ productId: productA.productId }],
    });
    const auditTwo = await createAudit(adminApi, {
      code: auditCode(runKey, 'CASE8-2'),
      warehouseId: hn._id,
      auditType: 'BY_PRODUCT',
      status: 'DRAFT',
      note: `${runKey} case 8 source 2`,
      items: [{ productId: productB.productId }],
    });
    const foreignAudit = await createAudit(adminApi, {
      code: auditCode(runKey, 'CASE8-3'),
      warehouseId: hcm._id,
      auditType: 'BY_PRODUCT',
      status: 'DRAFT',
      note: `${runKey} case 8 foreign`,
      items: [{ productId: productC.productId }],
    });
    expect(auditOne.response.status()).toBe(201);
    expect(auditTwo.response.status()).toBe(201);
    expect(foreignAudit.response.status()).toBe(201);

    const merged = await adminApi.post('inventory-audits/merge', {
      data: { auditIds: [auditOne.data._id, auditTwo.data._id], note: `${runKey} merged audit` },
    });
    expect(merged.status()).toBe(201);
    const mergedPayload = await merged.json();
    expect(mergedPayload.summary.itemCount).toBe(2);
    expect(await readBranchStock(adminApi, productA.productId, hn._id)).toBe(stockBeforeA);
    expect(await readBranchStock(adminApi, productB.productId, hn._id)).toBe(stockBeforeB);

    const sourceOne = await adminApi.get(`inventory-audits/${auditOne.data._id}`);
    expect(sourceOne.ok()).toBeTruthy();
    const sourceOnePayload = await sourceOne.json();
    expect(sourceOnePayload.mergedIntoAuditId).toBe(mergedPayload._id);

    const invalidMerge = await adminApi.post('inventory-audits/merge', {
      data: { auditIds: [auditOne.data._id, foreignAudit.data._id], note: `${runKey} invalid merge` },
    });
    expect(invalidMerge.status()).toBe(409);
  });

  test('CASE 9 warehouse manager is scoped to assigned warehouse and cannot reconcile', async () => {
    const employeeEmail = `${auditCode(runKey, 'EMPLOYEE').toLowerCase()}@example.com`;
    const employeeId = await createEmployee(adminApi, {
      email: employeeEmail,
      name: `${runKey} Employee`,
      warehouseIds: [hn._id],
      defaultWarehouseId: hn._id,
    });
    const localProduct = await seedAuditProduct(adminApi, {
      code: auditCode(runKey, 'CASE9-HN'),
      name: `${runKey} Employee HN`,
      branchStocks: { [hn._id]: 4 },
    });
    const foreignProduct = await seedAuditProduct(adminApi, {
      code: auditCode(runKey, 'CASE9-HCM'),
      name: `${runKey} Employee HCM`,
      branchStocks: { [hcm._id]: 4 },
    });

    let employeeApi: any;
    try {
      const employeeToken = await loginToken(employeeEmail, EMPLOYEE_PASSWORD);
      employeeApi = await createApiContext(employeeToken);

      const ownAudit = await createAudit(employeeApi, {
        code: auditCode(runKey, 'CASE9-OWN'),
        warehouseId: hn._id,
        auditType: 'BY_PRODUCT',
        status: 'COUNTING',
        note: `${runKey} case 9 own`,
        items: [{ productId: localProduct.productId, physicalQuantity: 4 }],
      });
      expect(ownAudit.response.status()).toBe(201);

      const foreignCreate = await employeeApi.post('inventory-audits', {
        data: {
          code: auditCode(runKey, 'CASE9-FORBIDDEN'),
          warehouseId: hcm._id,
          auditType: 'BY_PRODUCT',
          status: 'DRAFT',
          note: `${runKey} case 9 forbidden`,
          items: [{ productId: foreignProduct.productId }],
        },
      });
      expect(foreignCreate.status()).toBe(403);

      const foreignAudit = await createAudit(adminApi, {
        code: auditCode(runKey, 'CASE9-HCM-AUDIT'),
        warehouseId: hcm._id,
        auditType: 'BY_PRODUCT',
        status: 'COUNTING',
        note: `${runKey} case 9 admin foreign`,
        items: [{ productId: foreignProduct.productId, physicalQuantity: 2 }],
      });
      expect(foreignAudit.response.status()).toBe(201);

      const forbiddenRead = await employeeApi.get(`inventory-audits/${foreignAudit.data._id}`);
      expect(forbiddenRead.status()).toBe(403);

      await submitAudit(employeeApi, ownAudit.data._id);
      const forbiddenReconcile = await employeeApi.post(`inventory-audits/${ownAudit.data._id}/reconcile`);
      expect(forbiddenReconcile.status()).toBe(403);
    } finally {
      await employeeApi?.dispose();
      await cleanupEmployee(adminApi, employeeId);
    }
  });

  test('CASE 10 and 11 filters and pagination come from backend totals', async () => {
    const product = await seedAuditProduct(adminApi, {
      code: auditCode(runKey, 'CASE10'),
      name: `${runKey} Filter Product`,
      branchStocks: { [hn._id]: 2 },
    });

    const first = await createAudit(adminApi, {
      code: auditCode(runKey, 'CASE10-FIRST'),
      warehouseId: hn._id,
      auditType: 'BY_PRODUCT',
      status: 'COUNTING',
      note: `${runKey} filter-alpha`,
      items: [{ productId: product.productId, physicalQuantity: 2 }],
    });
    const second = await createAudit(adminApi, {
      code: auditCode(runKey, 'CASE10-SECOND'),
      warehouseId: hn._id,
      auditType: 'BY_PRODUCT',
      status: 'COUNTING',
      note: `${runKey} filter-beta`,
      items: [{ productId: product.productId, physicalQuantity: 1 }],
    });
    expect(first.response.status()).toBe(201);
    expect(second.response.status()).toBe(201);

    const listByWarehouse = await adminApi.get(`inventory-audits?warehouseId=${hn._id}&note=${encodeURIComponent(`${runKey} filter`)}`);
    expect(listByWarehouse.ok()).toBeTruthy();
    const warehousePayload = await listByWarehouse.json();
    expect(warehousePayload.total).toBeGreaterThanOrEqual(2);

    const pageOne = await adminApi.get(`inventory-audits?warehouseId=${hn._id}&note=${encodeURIComponent(`${runKey} filter`)}&page=1&limit=1`);
    expect(pageOne.ok()).toBeTruthy();
    const pageOnePayload = await pageOne.json();
    expect(pageOnePayload.total).toBeGreaterThanOrEqual(2);
    expect(pageOnePayload.items).toHaveLength(1);

    const itemsShortage = await adminApi.get(`inventory-audit-items?auditId=${second.data._id}&productKeyword=${encodeURIComponent(product.code)}&varianceType=SHORTAGE`);
    expect(itemsShortage.ok()).toBeTruthy();
    const shortagePayload = await itemsShortage.json();
    expect(shortagePayload.total).toBe(1);
    expect(shortagePayload.items[0].varianceQuantity).toBe(-1);
  });
});
