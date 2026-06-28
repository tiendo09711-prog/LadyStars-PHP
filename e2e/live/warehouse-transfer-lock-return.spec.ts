import { expect, request, test } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';

/**
 * Live-guarded spec: warehouse transfer lock + auto return.
 *
 * Isolation:
 * - API writes only fixture branches/products/transfers marked with E2E_RUN_ID.
 * - Cleanup removes exact fixture ObjectIds and related docs only.
 * - No deleteMany({}), no Store Settings mutation, no admin/root-owner upsert.
 */

const API = process.env.E2E_API_BASE_URL || 'http://localhost:4100/api';
const ADMIN_PASSWORD = process.env.E2E_AUTH_PASSWORD || '';
const RUN_ID = process.env.E2E_RUN_ID || `live-transfer-${Date.now()}`;

const createdBranchIds: string[] = [];
const createdProductIds: string[] = [];
const createdTransferIds: string[] = [];
const createdVoucherIds: string[] = [];

let auth: any = null;
let mongo: MongoClient | null = null;

async function authContext() {
  const email = process.env.E2E_AUTH_EMAIL;
  const password = ADMIN_PASSWORD;
  if (!email || !password) return null;
  const api = await request.newContext();
  const loginRes = await api.post(`${API}/auth/login`, { data: { email, password } });
  await api.dispose();
  if (!loginRes.ok()) return null;
  const { token } = await loginRes.json();
  return request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
}

async function json(res: any) {
  const body = await res.json().catch(() => ({}));
  return body;
}

async function createBranch(codeSuffix: string) {
  const code = `${RUN_ID}-${codeSuffix}`.slice(0, 28);
  const res = await auth.post(`${API}/system/branches`, {
    data: {
      name: `${RUN_ID} ${codeSuffix}`,
      code,
      address: `${codeSuffix} fixture street`,
      phone: '0900000000',
      invoiceProfile: { displayName: `${RUN_ID}-${codeSuffix}`, templateId: 'retail-a4-classic' },
      adminPassword: ADMIN_PASSWORD,
    },
  });
  expect(res.ok(), `createBranch ${codeSuffix} failed ${res.status()}: ${JSON.stringify(await json(res))}`).toBeTruthy();
  const body = await res.json();
  createdBranchIds.push(body._id);
  return body;
}

async function firstCategoryId() {
  const res = await auth.get(`${API}/products/categories`);
  expect(res.ok(), `categories failed ${res.status()}`).toBeTruthy();
  const categories = await res.json();
  if (!Array.isArray(categories) || !categories.length) return '';
  return String(categories[0]._id || categories[0].id || '');
}

async function createProduct(sourceWarehouseId: string, categoryId: string) {
  const res = await auth.post(`${API}/products/products`, {
    data: {
      name: `${RUN_ID} Product C`,
      type: 'product',
      unit: 'cái',
      size: 'M',
      color: 'Đỏ',
      categoryId,
      price: 100000,
      cost: 50000,
      wholesalePrice: 90000,
      weight: 0,
      initialStocks: [{ warehouseId: sourceWarehouseId, quantity: 5 }],
    },
  });
  expect(res.ok(), `createProduct failed ${res.status()}: ${JSON.stringify(await json(res))}`).toBeTruthy();
  const body = await res.json();
  createdProductIds.push(body._id);
  return body;
}

async function createTransfer(sourceWarehouseId: string, destinationWarehouseId: string, productId: string, quantity: number, suffix: string) {
  const res = await auth.post(`${API}/warehouse/transfers`, {
    data: {
      label: `${RUN_ID} ${suffix}`,
      note: `${RUN_ID} ${suffix}`,
      sourceWarehouseId,
      destinationWarehouseId,
      lines: [{ productId, quantity }],
    },
  });
  expect(res.ok(), `createTransfer ${suffix} failed ${res.status()}: ${JSON.stringify(await json(res))}`).toBeTruthy();
  const body = await res.json();
  createdTransferIds.push(body._id);
  return body;
}

async function confirmSource(transferId: string) {
  const res = await auth.post(`${API}/warehouse/transfers/${transferId}/confirm-source`);
  return { res, body: await json(res) };
}

async function confirmDestination(transferId: string) {
  const res = await auth.post(`${API}/warehouse/transfers/${transferId}/confirm-destination`);
  return { res, body: await json(res) };
}

async function getTransfer(transferId: string) {
  const res = await auth.get(`${API}/warehouse/transfers/${transferId}`);
  expect(res.ok(), `getTransfer failed ${res.status()}`).toBeTruthy();
  return res.json();
}

async function getInventory(productName: string, branchId: string) {
  const res = await auth.get(`${API}/products/inventories`, { params: { q: productName, branchId, limit: 50 } });
  expect(res.ok(), `inventories failed ${res.status()}`).toBeTruthy();
  const body = await res.json();
  const item = (body.items || []).find((row: any) => String(row.name) === productName);
  expect(item, `inventory item not found for ${productName}`).toBeTruthy();
  return item;
}

async function cleanupMongo() {
  if (!process.env.MONGO_URI) return;
  mongo = mongo || new MongoClient(process.env.MONGO_URI);
  await mongo.connect();
  const db = mongo.db();
  const transferObjectIds = createdTransferIds.filter(ObjectId.isValid).map((id) => new ObjectId(id));
  const productObjectIds = createdProductIds.filter(ObjectId.isValid).map((id) => new ObjectId(id));
  const branchObjectIds = createdBranchIds.filter(ObjectId.isValid).map((id) => new ObjectId(id));
  const voucherObjectIds = createdVoucherIds.filter(ObjectId.isValid).map((id) => new ObjectId(id));

  for (const id of transferObjectIds) await db.collection('warehousetransfers').deleteOne({ _id: id });
  for (const id of transferObjectIds) await db.collection('transferauditlogs').deleteMany({ transferRequestId: id });
  for (const id of transferObjectIds) await db.collection('inventoryvouchers').deleteMany({ transferRequestId: id });
  for (const id of transferObjectIds) await db.collection('inventoryproducts').deleteMany({ transferRequestId: id });
  for (const id of voucherObjectIds) await db.collection('inventoryvouchers').deleteOne({ _id: id });
  for (const id of productObjectIds) await db.collection('productbranchstocks').deleteMany({ productId: id });
  for (const id of productObjectIds) await db.collection('productlogs').deleteMany({ productId: id });
  for (const id of productObjectIds) await db.collection('products').deleteOne({ _id: id });
  for (const id of branchObjectIds) await db.collection('branches').deleteOne({ _id: id });
}

test.describe.configure({ mode: 'serial' });

test.describe('warehouse transfer lock + return (live-guarded, isolated)', () => {
  test.beforeAll(async () => {
    test.skip(!ADMIN_PASSWORD, 'E2E_AUTH_PASSWORD not set');
    auth = await authContext();
    test.skip(!auth, 'E2E auth credentials not valid for target DB (skipping)');
  });

  test.afterAll(async () => {
    await cleanupMongo().catch((err) => console.warn(`[live-cleanup] ${err?.message || err}`));
    if (mongo) await mongo.close().catch(() => null);
    if (auth) await auth.dispose().catch(() => null);
  });

  test('locks source stock, blocks over-request, edits IN_TRANSIT, consumes and auto-returns', async () => {
    const source = await createBranch('A');
    const destination = await createBranch('B');
    const other = await createBranch('D');
    const categoryId = await firstCategoryId();
    test.skip(!categoryId, 'No product category available in target DB');
    const product = await createProduct(source._id, categoryId);
    const productName = product.name;

    const t1 = await createTransfer(source._id, destination._id, product._id, 3, 'T1');
    const t1Source = await confirmSource(t1._id);
    expect(t1Source.res.ok(), JSON.stringify(t1Source.body)).toBeTruthy();
    expect(t1Source.body.status).toBe('IN_TRANSIT');
    expect(Number(t1Source.body.lockedQuantity)).toBe(3);
    let inv = await getInventory(productName, source._id);
    expect(Number(inv.selectedStock)).toBe(5);
    expect(Number(inv.lockedQuantity)).toBe(3);
    expect(Number(inv.availableStock)).toBe(2);

    const t2 = await createTransfer(source._id, other._id, product._id, 3, 'T2');
    const t2Source = await confirmSource(t2._id);
    expect(t2Source.res.status()).toBe(409);
    expect(String(t2Source.body.message || '')).toContain('Tồn hiện tại: 5');
    expect(String(t2Source.body.message || '')).toContain('đang khóa: 3');
    expect(String(t2Source.body.message || '')).toContain('khả dụng: 2');
    expect(String(t2Source.body.message || '')).toContain('yêu cầu: 3');

    const t3 = await createTransfer(source._id, other._id, product._id, 2, 'T3');
    expect((await confirmSource(t3._id)).res.ok()).toBeTruthy();
    inv = await getInventory(productName, source._id);
    expect(Number(inv.selectedStock)).toBe(5);
    expect(Number(inv.lockedQuantity)).toBe(5);
    expect(Number(inv.availableStock)).toBe(0);

    const patchT1 = await auth.patch(`${API}/warehouse/transfers/${t1._id}`, {
      data: { lines: [{ productId: product._id, quantity: 2 }], label: `${RUN_ID} T1 edit` },
    });
    expect(patchT1.ok(), JSON.stringify(await json(patchT1))).toBeTruthy();
    inv = await getInventory(productName, source._id);
    expect(Number(inv.lockedQuantity)).toBe(4);
    expect(Number(inv.availableStock)).toBe(1);

    const t1Dest = await confirmDestination(t1._id);
    expect(t1Dest.res.ok(), JSON.stringify(t1Dest.body)).toBeTruthy();
    createdVoucherIds.push(String(t1Dest.body.destinationImportBillId || ''));
    expect(t1Dest.body.status).toBe('COMPLETED');
    inv = await getInventory(productName, source._id);
    expect(Number(inv.selectedStock)).toBe(3);
    expect(Number(inv.lockedQuantity)).toBe(2);

    const returnRes = await auth.post(`${API}/warehouse/transfers/${t3._id}/return`, { data: { reason: `${RUN_ID} reject` } });
    expect(returnRes.ok(), JSON.stringify(await json(returnRes))).toBeTruthy();
    const returnedOrigin = await returnRes.json();
    expect(returnedOrigin.status).toBe('RETURN_IN_PROGRESS');
    expect(returnedOrigin.returnTransfer?._id).toBeTruthy();
    createdTransferIds.push(returnedOrigin.returnTransfer._id);

    const returnSource = await confirmSource(returnedOrigin.returnTransfer._id);
    expect(returnSource.res.ok(), JSON.stringify(returnSource.body)).toBeTruthy();
    expect(returnSource.body.status).toBe('IN_TRANSIT');

    const returnDest = await confirmDestination(returnedOrigin.returnTransfer._id);
    expect(returnDest.res.ok(), JSON.stringify(returnDest.body)).toBeTruthy();
    expect(returnDest.body.status).toBe('COMPLETED');
    const originAfterReturn = await getTransfer(t3._id);
    expect(originAfterReturn.status).toBe('RETURNED');
    inv = await getInventory(productName, source._id);
    expect(Number(inv.selectedStock)).toBe(3);
    expect(Number(inv.lockedQuantity)).toBe(0);
    expect(Number(inv.availableStock)).toBe(3);
  });
});
