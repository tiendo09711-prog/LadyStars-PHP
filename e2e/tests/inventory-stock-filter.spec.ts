import { expect, request as playwrightRequest, test } from '@playwright/test';
import { connectDB, closeDB } from '../utils/db';
import { ObjectId } from 'mongodb';

const API_BASE = (process.env.E2E_API_BASE_URL || 'http://localhost:4100/api') + '/';
const RUN = `E2E_STOCKFILTER_${Date.now()}`;
const CODES = {
  newInStock: `${RUN}_A`, // Mới + totalStock > 0
  discontinuedInStock: `${RUN}_B`, // Ngừng bán + totalStock > 0
  newOutOfStock: `${RUN}_C`, // Mới + totalStock = 0
  sellingInStock: `${RUN}_D`, // Đang bán + totalStock > 0
};

let db: any;
const productIds: ObjectId[] = [];

async function loginToken(): Promise<string> {
  const email = process.env.E2E_AUTH_EMAIL;
  const password = process.env.E2E_AUTH_PASSWORD;
  if (!email || !password) throw new Error('E2E_AUTH_EMAIL and E2E_AUTH_PASSWORD are required.');
  const api = await playwrightRequest.newContext({ baseURL: API_BASE });
  const response = await api.post('auth/login', { data: { email, password } });
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  await api.dispose();
  return data.token as string;
}

async function authedApi(token: string) {
  return playwrightRequest.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
}

const codesOf = (items: any[]) => items.map((i: any) => i.code).sort();
const testCodesOf = (items: any[]) => codesOf(items.filter((i: any) => i.code.startsWith(RUN)));

function expectedTotal(allItems: any[], mode: 'in_stock' | 'sellable') {
  const sellableStatuses = ['mới', 'đang bán'];
  return allItems.filter((i: any) => {
    if (Number(i.totalStock) <= 0) return false;
    if (mode === 'in_stock') return true;
    return sellableStatuses.includes(String(i.status || '').trim().toLowerCase());
  }).length;
}

test.beforeAll(async () => {
  db = await connectDB();
  const hn = await db.collection('branches').findOne({ code: 'HN' });
  const branchId = hn ? hn._id : new ObjectId();

  const make = (code: string, status: string, qty: number) => {
    const pid = new ObjectId();
    productIds.push(pid);
    return [
      db.collection('products').insertOne({
        _id: pid,
        code,
        name: `SP test stockfilter ${code}`,
        type: 'product',
        status,
        cost: 10000,
        price: 20000,
        qty,
        createdAt: new Date(),
      }),
      qty > 0
        ? db.collection('productbranchstocks').insertOne({ productId: pid, branchId, qty, costPrice: 10000 })
        : Promise.resolve(),
    ];
  };

  await Promise.all([
    ...make(CODES.newInStock, 'Mới', 10),
    ...make(CODES.discontinuedInStock, 'Ngừng bán', 5),
    ...make(CODES.newOutOfStock, 'Mới', 0),
    ...make(CODES.sellingInStock, 'Đang bán', 7),
  ]);
});

test.afterAll(async () => {
  if (db) {
    await db.collection('productbranchstocks').deleteMany({ productId: { $in: productIds } });
    await db.collection('products').deleteMany({ _id: { $in: productIds } });
    await closeDB();
  }
});

test('stockStatus filter respects filter conditions (Còn tồn / Còn tồn có thể bán)', async () => {
  const token = await loginToken();
  const api = await authedApi(token);
  const query = (extra: string) => `products/inventories?q=${RUN}&limit=500${extra}`;

  // Tất cả: hiển thị cả 4 sản phẩm test
  const all = await api.get(query(''));
  expect(all.ok()).toBeTruthy();
  const allJson = await all.json();
  expect(testCodesOf(allJson.items)).toEqual([CODES.discontinuedInStock, CODES.newInStock, CODES.newOutOfStock, CODES.sellingInStock].sort());
  for (const item of allJson.items.filter((i: any) => i.code.startsWith(RUN))) {
    expect(typeof item.status).toBe('string');
  }

  // Còn tồn: totalStock > 0 với mọi trạng thái -> A, B, D (ẩn C)
  const inStock = await api.get(query('&stockStatus=in_stock'));
  expect(inStock.ok()).toBeTruthy();
  const inStockJson = await inStock.json();
  expect(testCodesOf(inStockJson.items)).toEqual([CODES.discontinuedInStock, CODES.newInStock, CODES.sellingInStock].sort());
  for (const item of inStockJson.items.filter((i: any) => i.code.startsWith(RUN))) {
    expect(Number(item.totalStock)).toBeGreaterThan(0);
  }

  // Còn tồn có thể bán: totalStock > 0 + trạng thái Mới/Đang bán -> A, D (ẩn B, C)
  const sellable = await api.get(query('&stockStatus=sellable'));
  expect(sellable.ok()).toBeTruthy();
  const sellableJson = await sellable.json();
  expect(testCodesOf(sellableJson.items)).toEqual([CODES.newInStock, CODES.sellingInStock].sort());
  for (const item of sellableJson.items.filter((i: any) => i.code.startsWith(RUN))) {
    expect(Number(item.totalStock)).toBeGreaterThan(0);
    expect(['mới', 'đang bán']).toContain(String(item.status || '').trim().toLowerCase());
  }

  // total phản ánh số đã lọc
  expect(allJson.total).toBeGreaterThanOrEqual(4);
  expect(inStockJson.total).toBe(expectedTotal(allJson.items, 'in_stock'));
  expect(sellableJson.total).toBe(expectedTotal(allJson.items, 'sellable'));

  await api.dispose();
});