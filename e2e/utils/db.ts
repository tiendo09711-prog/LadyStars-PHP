import { APIRequestContext } from '@playwright/test';
import bcrypt from 'bcryptjs';
import { spawnSync } from 'child_process';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const API_BASE = 'http://localhost:4000/api';

const DB_NAME = process.env.MONGO_DB_NAME || 'ladystars';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ladystars';

let client: MongoClient | null = null;

export type RetailFixture = {
  prefix: string;
  branch: { _id: ObjectId; name: string; code: string };
  customer: { _id: ObjectId; name: string; code: string; phone: string };
  paymentMethods: {
    cash: { _id: ObjectId; name: string; code: string };
    transfer: { _id: ObjectId; name: string; code: string };
    card: { _id: ObjectId; name: string; code: string };
  };
  products: Array<{
    _id: ObjectId;
    code: string;
    name: string;
    qty: number;
    price: number;
    cost: number;
  }>;
};

function now() {
  return new Date();
}

function randomSuffix() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function prefixed(prefix: string, label: string) {
  return `${prefix}${randomSuffix()}_${label}`;
}

function uniqueCode(label: string, maxLength = 40) {
  return `${label}_${randomSuffix().replace(/_/g, '')}`.slice(0, maxLength);
}

function withDatabaseName(uri: string, dbName: string) {
  try {
    const parsed = new URL(uri);
    parsed.pathname = `/${dbName}`;
    return parsed.toString();
  } catch {
    return uri.replace(/\/([^/?]+)?(\?.*)?$/, (_match, _dbName, query = '') => `/${dbName}${query}`);
  }
}

export async function connectDB() {
  if (!client) {
    client = new MongoClient(MONGO_URI);
    await client.connect();
  }
  return client.db(DB_NAME);
}

export async function closeDB() {
  if (client) {
    await client.close();
    client = null;
  }
}

export async function cleanupRetailFixtures(prefix: string) {
  const db = await connectDB();
  const branchIds = await db.collection('branches').find({ $or: [{ code: new RegExp(`^${prefix}`) }, { name: new RegExp(`^${prefix}`) }] }).project({ _id: 1 }).toArray();
  const customerIds = await db.collection('customers').find({ $or: [{ code: new RegExp(`^${prefix}`) }, { name: new RegExp(`^${prefix}`) }] }).project({ _id: 1 }).toArray();
  const productIds = await db.collection('products').find({ $or: [{ code: new RegExp(`^${prefix}`) }, { name: new RegExp(`^${prefix}`) }] }).project({ _id: 1 }).toArray();
  const saleIds = await db.collection('salepayments').find({ code: new RegExp(`^${prefix}`) }).project({ _id: 1 }).toArray();
  const refundIds = await db.collection('productrefunds').find({ code: new RegExp(`^${prefix}`) }).project({ _id: 1 }).toArray();

  const branchObjectIds = branchIds.map((item) => item._id);
  const customerObjectIds = customerIds.map((item) => item._id);
  const productObjectIds = productIds.map((item) => item._id);
  const saleObjectIds = saleIds.map((item) => item._id);
  const refundObjectIds = refundIds.map((item) => item._id);

  const productLogFilters = [
    ...(productObjectIds.length ? [{ productId: { $in: productObjectIds } }] : []),
    ...(saleObjectIds.length ? [{ sourceId: { $in: saleObjectIds } }] : []),
    ...(refundObjectIds.length ? [{ sourceId: { $in: refundObjectIds } }] : []),
  ];
  if (productLogFilters.length) {
    await db.collection('productlogs').deleteMany({ $or: productLogFilters });
  }
  await db.collection('productrefunds').deleteMany({
    $or: [
      { code: new RegExp(`^${prefix}`) },
      ...(saleObjectIds.length ? [{ paymentId: { $in: saleObjectIds } }] : []),
    ],
  });
  await db.collection('salepayments').deleteMany({
    $or: [
      { code: new RegExp(`^${prefix}`) },
      ...(customerObjectIds.length ? [{ customerId: { $in: customerObjectIds } }] : []),
      ...(branchObjectIds.length ? [{ branchId: { $in: branchObjectIds } }] : []),
    ],
  });
  if (productObjectIds.length) {
    await db.collection('productbranchstocks').deleteMany({ productId: { $in: productObjectIds } });
  }
  await db.collection('paymentmethods').deleteMany({ $or: [{ code: new RegExp(`^${prefix}`) }, { name: new RegExp(`^${prefix}`) }] });
  await db.collection('products').deleteMany({ $or: [{ code: new RegExp(`^${prefix}`) }, { name: new RegExp(`^${prefix}`) }] });
  await db.collection('customers').deleteMany({ $or: [{ code: new RegExp(`^${prefix}`) }, { name: new RegExp(`^${prefix}`) }] });
  await db.collection('branches').deleteMany({ $or: [{ code: new RegExp(`^${prefix}`) }, { name: new RegExp(`^${prefix}`) }] });
}

export async function cleanupBranchConfigFixtures(prefix: string) {
  const db = await connectDB();
  const branchIds = await db.collection('branches').find({ $or: [{ code: new RegExp(`^${prefix}`) }, { name: new RegExp(`^${prefix}`) }] }).project({ _id: 1 }).toArray();
  const branchObjectIds = branchIds.map((item) => item._id);
  const userIds = await db.collection('users').find({
    $or: [
      { email: new RegExp(`^${prefix.toLowerCase()}`) },
      { name: new RegExp(`^${prefix}`) },
    ],
  }).project({ _id: 1 }).toArray();
  const userObjectIds = userIds.map((item) => item._id);

  await cleanupRetailFixtures(prefix);

  if (userObjectIds.length) {
    await db.collection('users').deleteMany({ _id: { $in: userObjectIds } });
  }
  if (branchObjectIds.length) {
    await db.collection('auditlogs').deleteMany({
      $or: [
        { resource: 'Branch', resourceId: { $in: branchObjectIds.map((id) => id.toString()) } },
        { userId: { $in: userObjectIds } },
      ],
    }).catch(() => null);
  }
}

export async function createRetailFixture(prefix: string, productCount = 3) {
  const db = await connectDB();
  await cleanupRetailFixtures(prefix);

  const branchName = prefixed(prefix, 'BRANCH');
  const branchCode = uniqueCode('BRANCH', 32);
  const branch = {
    _id: new ObjectId(),
    name: branchName,
    code: branchCode,
    address: `${branchName} Address`,
    phone: '0900000000',
    invoiceProfile: {
      displayName: '',
      templateId: 'retail-a4-classic',
      footerText: 'Cảm ơn quý khách đã mua hàng!',
      showBranchName: false,
      showCashier: true,
      showProductCode: false,
      showLogo: false,
    },
    isActive: true,
    isDefault: false,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.collection('branches').insertOne(branch);

  const customerName = prefixed(prefix, 'CUSTOMER');
  const customerCode = uniqueCode('CUS', 32);
  const customerPhone = `09${Math.floor(10000000 + Math.random() * 89999999)}`;
  const customer = {
    _id: new ObjectId(),
    name: customerName,
    code: customerCode,
    phone: customerPhone,
    type: 'person',
    status: 'active',
    branchId: branch._id,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.collection('customers').insertOne(customer);

  const paymentMethods = {
    cash: {
      _id: new ObjectId(),
      name: `${prefix}Cash`,
      code: uniqueCode('PAY_CASH', 32),
      isActive: true,
      sortOrder: 1,
      createdAt: now(),
      updatedAt: now(),
    },
    transfer: {
      _id: new ObjectId(),
      name: `${prefix}Bank Transfer`,
      code: uniqueCode('PAY_TRANSFER', 32),
      isActive: true,
      sortOrder: 2,
      createdAt: now(),
      updatedAt: now(),
    },
    card: {
      _id: new ObjectId(),
      name: `${prefix}Card`,
      code: uniqueCode('PAY_CARD', 32),
      isActive: true,
      sortOrder: 3,
      createdAt: now(),
      updatedAt: now(),
    },
  };
  await db.collection('paymentmethods').insertMany(Object.values(paymentMethods));

  const products: RetailFixture['products'] = [];
  for (let index = 0; index < productCount; index += 1) {
    const name = prefixed(prefix, `PRODUCT_${index + 1}`);
    const code = uniqueCode(`PROD${index + 1}`, 32);
    const product = {
      _id: new ObjectId(),
      name,
      code,
      price: 100000 * (index + 1),
      cost: 60000 * (index + 1),
      qty: 50,
      minQuantity: 0,
      maxQuantity: 999999999,
      allowsSale: true,
      type: 'product',
      unit: 'cai',
      status: 'Dang ban',
      createdAt: now(),
      updatedAt: now(),
    };
    products.push(product);
  }
  if (products.length) {
    await db.collection('products').insertMany(products);
    await db.collection('productbranchstocks').insertMany(products.map((product) => ({
      _id: new ObjectId(),
      productId: product._id,
      branchId: branch._id,
      qty: 50,
      minQuantity: 0,
      maxQuantity: 999999999,
      createdAt: now(),
      updatedAt: now(),
    })));
  }

  return {
    prefix,
    branch: { _id: branch._id, name: branch.name, code: branch.code },
    customer: { _id: customer._id, name: customer.name, code: customer.code, phone: customer.phone },
    paymentMethods: {
      cash: { _id: paymentMethods.cash._id, name: paymentMethods.cash.name, code: paymentMethods.cash.code },
      transfer: { _id: paymentMethods.transfer._id, name: paymentMethods.transfer.name, code: paymentMethods.transfer.code },
      card: { _id: paymentMethods.card._id, name: paymentMethods.card.name, code: paymentMethods.card.code },
    },
    products: products.map((product) => ({
      _id: product._id,
      code: product.code,
      name: product.name,
      qty: product.qty,
      price: product.price,
      cost: product.cost,
    })),
  } satisfies RetailFixture;
}

export async function createEmptyBranch(prefix: string, overrides: Partial<Record<string, unknown>> = {}) {
  const db = await connectDB();
  const name = String(overrides.name || prefixed(prefix, 'EMPTY_BRANCH'));
  const code = String(overrides.code || uniqueCode('BRANCH_EMPTY', 32));
  const branch = {
    _id: new ObjectId(),
    name,
    code,
    address: String(overrides.address || `${name} Address`),
    phone: String(overrides.phone || '0911111111'),
    invoiceProfile: {
      displayName: String(overrides.displayName || ''),
      templateId: 'retail-a4-classic',
      footerText: 'Cảm ơn quý khách đã mua hàng!',
      showBranchName: false,
      showCashier: true,
      showProductCode: false,
      showLogo: false,
    },
    isActive: overrides.isActive === false ? false : true,
    isDefault: overrides.isDefault === true,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.collection('branches').insertOne(branch);
  return branch;
}

export async function createEmployeeFixture(prefix: string, branchId: string | ObjectId, password = '12345678') {
  const db = await connectDB();
  const email = `${prefix.toLowerCase()}employee_${randomSuffix().replace(/_/g, '')}@example.com`;
  const user = {
    _id: new ObjectId(),
    name: `${prefix}Employee`,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role: 'EMPLOYEE',
    status: 'ACTIVE',
    branchId: typeof branchId === 'string' ? new ObjectId(branchId) : branchId,
    assignedWarehouseIds: [typeof branchId === 'string' ? new ObjectId(branchId) : branchId],
    defaultWarehouseId: typeof branchId === 'string' ? new ObjectId(branchId) : branchId,
    isRootOwner: false,
    isActive: true,
    tokenVersion: 0,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.collection('users').insertOne(user);
  return { ...user, password };
}

export async function findBranchByCode(code: string) {
  const db = await connectDB();
  return db.collection('branches').findOne({ code });
}

export async function countDefaultBranches() {
  const db = await connectDB();
  return db.collection('branches').countDocuments({ isDefault: true });
}

export async function updateBranchConfig(branchId: string | ObjectId, patch: Record<string, unknown>) {
  const db = await connectDB();
  await db.collection('branches').updateOne(
    { _id: typeof branchId === 'string' ? new ObjectId(branchId) : branchId },
    { $set: patch },
  );
}

export async function updateStoreSetting(patch: Record<string, unknown>) {
  const db = await connectDB();
  await db.collection('storesettings').updateOne(
    { singletonKey: 'store' },
    { $set: patch, $setOnInsert: { singletonKey: 'store' } },
    { upsert: true },
  );
}

export async function runIsolatedBranchMigrationCheck(prefix: string) {
  const isolatedDbName = `lsbm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const isolatedMongoUri = withDatabaseName(MONGO_URI, isolatedDbName);
  const script = `
    import { MongoClient, ObjectId } from 'mongodb';
    import mongoose from 'mongoose';
    import { pathToFileURL } from 'url';
    process.env.MONGO_URI = ${JSON.stringify(isolatedMongoUri)};
    process.env.MONGO_DB_NAME = ${JSON.stringify(isolatedDbName)};
    const configUrl = pathToFileURL(${JSON.stringify(path.resolve(__dirname, '../../server/dist/config/database.js'))}).href;
    const serviceUrl = pathToFileURL(${JSON.stringify(path.resolve(__dirname, '../../server/dist/core/org/branch.service.js'))}).href;
    const { connectDatabase } = await import(configUrl);
    const { runBranchDataMigration } = await import(serviceUrl);
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    const db = client.db(process.env.MONGO_DB_NAME);
    const productId = new ObjectId();
    await db.collection('storesettings').insertOne({ singletonKey: 'store', shopName: 'E2E Brand', address: '12 Test Street', phone: '0900000000' });
    await db.collection('products').insertOne({
      _id: productId,
      code: ${JSON.stringify(`${prefix}PRODUCT`)},
      name: ${JSON.stringify(`${prefix}Product`)},
      qty: 10,
      minQuantity: 0,
      maxQuantity: 999999999,
      stockHanoi: 3,
      stockHCM: 4,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await connectDatabase();
    const first = await runBranchDataMigration();
    const second = await runBranchDataMigration();
    const branches = await db.collection('branches').find({ code: { $in: ['KHO-HN', 'KHO-HCM'] } }).toArray();
    const stocks = await db.collection('productbranchstocks').find({ productId }).toArray();
    console.log(JSON.stringify({ first, second, branchCount: branches.length, stockCount: stocks.length }));
    await client.db(process.env.MONGO_DB_NAME).dropDatabase();
    await mongoose.disconnect();
    await client.close();
    process.exit(0);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: path.resolve(__dirname, '../..'),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'Isolated branch migration check failed');
  }
  const output = result.stdout.trim().split(/\r?\n/).pop() || '{}';
  return JSON.parse(output);
}

export async function getBranchStock(productId: string | ObjectId, branchId: string | ObjectId) {
  const db = await connectDB();
  const stock = await db.collection('productbranchstocks').findOne({
    productId: typeof productId === 'string' ? new ObjectId(productId) : productId,
    branchId: typeof branchId === 'string' ? new ObjectId(branchId) : branchId,
  });
  return Number(stock?.qty || 0);
}

export async function findSaleByCode(code: string) {
  const db = await connectDB();
  return db.collection('salepayments').findOne({ code });
}

export async function findRefundByCode(code: string) {
  const db = await connectDB();
  return db.collection('productrefunds').findOne({ code });
}

export async function cleanupTestData(productCode: string) {
  const db = await connectDB();
  const product = await db.collection('products').findOne({ code: productCode });
  if (product?._id) {
    await db.collection('productbranchstocks').deleteMany({ productId: product._id });
    await db.collection('productlogs').deleteMany({ productId: product._id });
  }
  await db.collection('products').deleteMany({ code: productCode });
}

export async function seedProduct(productCode: string) {
  const db = await connectDB();
  const existing = await db.collection('products').findOne({ code: productCode });
  if (existing) return existing;

  const branch = await db.collection('branches').findOne({ isActive: { $ne: false } }) || await db.collection('branches').findOne({});
  if (!branch) {
    throw new Error('Cannot seed product because no branch exists');
  }

  const product = {
    _id: new ObjectId(),
    code: productCode,
    name: `Seed ${productCode}`,
    price: 120000,
    cost: 70000,
    qty: 30,
    minQuantity: 0,
    maxQuantity: 999999999,
    allowsSale: true,
    type: 'product',
    unit: 'cai',
    status: 'Dang ban',
    createdAt: now(),
    updatedAt: now(),
  };
  await db.collection('products').insertOne(product);
  await db.collection('productbranchstocks').insertOne({
    _id: new ObjectId(),
    productId: product._id,
    branchId: branch._id,
    qty: 30,
    minQuantity: 0,
    maxQuantity: 999999999,
    createdAt: now(),
    updatedAt: now(),
  });
  return product;
}

export async function createCompletedSale(api: APIRequestContext, headers: Record<string, string>, params: {
  code: string;
  branchId: string;
  customerId: string;
  paymentMethodId: string;
  items: Array<{ productId: string; amount: number; value: number }>;
  discountValue?: number;
}) {
  const createResponse = await api.post(`${API_BASE}/products/sales`, {
    headers,
    data: {
      code: params.code,
      branchId: params.branchId,
      customerId: params.customerId,
      discountValue: params.discountValue || 0,
      discountType: 'number',
      valuePayment: params.items.reduce((sum, item) => sum + item.amount * item.value, 0) - (params.discountValue || 0),
      typePayment: [{ methodId: params.paymentMethodId, amount: params.items.reduce((sum, item) => sum + item.amount * item.value, 0) - (params.discountValue || 0) }],
      items: params.items.map((item) => ({
        productId: item.productId,
        amount: item.amount,
        value: item.value,
        discountValue: 0,
        discountType: 'number',
      })),
    },
  });
  if (!createResponse.ok()) throw new Error(await createResponse.text());
  const created = await createResponse.json();

  const completeResponse = await api.post(`${API_BASE}/products/sales/${created._id}/complete`, { headers });
  if (!completeResponse.ok()) throw new Error(await completeResponse.text());
  return completeResponse.json();
}

export async function reviseSale(api: APIRequestContext, headers: Record<string, string>, saleId: string, params: {
  customerId: string;
  items: Array<{ productId: string; amount: number; value: number }>;
  paymentMethodId: string;
}) {
  const total = params.items.reduce((sum, item) => sum + item.amount * item.value, 0);
  const response = await api.patch(`${API_BASE}/products/sales/${saleId}`, {
    headers,
    data: {
      customerId: params.customerId,
      discountValue: 0,
      discountType: 'number',
      valuePayment: total,
      typePayment: [{ methodId: params.paymentMethodId, amount: total }],
      items: params.items.map((item) => ({
        productId: item.productId,
        amount: item.amount,
        value: item.value,
        discountValue: 0,
        discountType: 'number',
      })),
    },
  });
  return response;
}

export async function createReturnExchange(api: APIRequestContext, headers: Record<string, string>, saleId: string, params: {
  code: string;
  returnedItems: Array<{ productId: string; amount: number; value: number }>;
  replacementItems?: Array<{ productId: string; amount: number; value: number }>;
  refundPayments?: Array<{ methodId: string; amount: number }>;
  salePayments?: Array<{ methodId: string; amount: number }>;
  note?: string;
  replacementCode?: string;
}) {
  const response = await api.post(`${API_BASE}/products/sales/${saleId}/return-exchange`, {
    headers,
    data: {
      code: params.code,
      note: params.note || '',
      replacementCode: params.replacementCode,
      returnedItems: params.returnedItems.map((item) => ({
        productId: item.productId,
        amount: item.amount,
        value: item.value,
        discountValue: 0,
        discountType: 'number',
      })),
      replacementItems: (params.replacementItems || []).map((item) => ({
        productId: item.productId,
        amount: item.amount,
        value: item.value,
        discountValue: 0,
        discountType: 'number',
      })),
      refundPayments: params.refundPayments || [],
      salePayments: params.salePayments || [],
    },
  });
  return response;
}

export async function createDraftRefund(api: APIRequestContext, headers: Record<string, string>, params: {
  code: string;
  paymentId: string;
  methodId: string;
  items: Array<{ productId: string; amount: number; value: number }>;
}) {
  const totalValue = params.items.reduce((sum, item) => sum + item.amount * item.value, 0);
  const response = await api.post(`${API_BASE}/products/refunds`, {
    headers,
    data: {
      code: params.code,
      paymentId: params.paymentId,
      status: 'draft',
      settlementValue: 0,
      typePayment: [{ methodId: params.methodId, amount: totalValue }],
      items: params.items.map((item) => ({
        productId: item.productId,
        amount: item.amount,
        price: item.value,
        value: item.value,
        discountValue: 0,
        discountType: 'number',
      })),
    },
  });
  return response;
}
