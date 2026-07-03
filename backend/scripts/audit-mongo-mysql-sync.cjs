const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const mysql = require('mysql2/promise');

const projectRoot = path.resolve(__dirname, '..', '..');
const mainEnvPath = path.resolve(projectRoot, '..', 'LadyStars', '.env');
const backendEnvPath = path.resolve(__dirname, '..', '.env');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).reduce((env, rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return env;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) return env;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[match[1]] = value;
    return env;
  }, {});
}

const mainEnv = parseEnvFile(mainEnvPath);
const backendEnv = parseEnvFile(backendEnvPath);
const mongoUri = process.env.MONGO_URI || mainEnv.MONGO_URI;
if (!mongoUri) {
  console.error('Missing MONGO_URI. Expected it in ../LadyStars/.env or process env.');
  process.exit(1);
}

const mysqlConfig = {
  host: process.env.DB_HOST || backendEnv.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || backendEnv.DB_PORT || 3306),
  user: process.env.DB_USERNAME || backendEnv.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || backendEnv.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || backendEnv.DB_DATABASE || 'ladystars_php',
  charset: 'utf8mb4',
};

const oid = (value) => value ? (value instanceof ObjectId ? value.toString() : String(value)) : null;
const usefulMongoCollections = [
  'branches',
  'users',
  'customergroups',
  'customers',
  'categories',
  'trademarks',
  'shelves',
  'products',
  'productbranchstocks',
];
const operationalCollections = [
  ['salechannels', 'sale_channels'],
  ['paymentmethods', 'payment_methods'],
  ['salepayments', 'sale_payments'],
  ['productrefunds', 'product_refunds'],
  ['productlogs', 'product_logs'],
  ['producteditlogs', 'product_edit_logs'],
  ['inventoryvouchers', 'inventory_vouchers'],
  ['inventoryproducts', 'inventory_products'],
  ['warehousetransfers', 'warehouse_transfers'],
  ['transferauditlogs', 'transfer_audit_logs'],
  ['inventorychecks', 'inventory_checks'],
  ['inventorycheckproducts', 'inventory_check_products'],
  ['customercares', 'customer_cares'],
  ['vendors', 'vendors'],
  ['auditlogs', 'audit_logs'],
  ['menuitems', 'menu_items'],
  ['permissions', 'permissions'],
  ['roles', 'roles'],
  ['storesettings', 'store_settings'],
];
const foundationMapping = [
  ['branches', 'branches'],
  ['users', 'users'],
  ['customergroups', 'customer_groups'],
  ['customers', 'customers'],
  ['categories', 'categories'],
  ['trademarks', 'trademarks'],
  ['shelves', 'shelves'],
  ['products', 'products'],
  ['productbranchstocks', 'product_branch_stocks'],
];
const modeledMainCollections = new Set([
  'auditlogs', 'users', 'branches', 'storesettings', 'permissions', 'roles', 'menuitems', 'wallets',
  'customergroups', 'customers', 'customercares',
  'categories', 'trademarks', 'shelves', 'products', 'productbranchstocks', 'salechannels', 'deliverypartners',
  'paymentmethods', 'salepayments', 'productrefunds', 'productlogs', 'stockadjustments', 'batches', 'producteditlogs',
  'vendorgroups', 'vendors', 'vendorpurchases', 'vendorrefunds', 'vendortransfers',
  'inventoryvouchers', 'inventoryproducts', 'warehousetransfers', 'transferauditlogs', 'inventoryaudits',
  'inventoryaudititems', 'inventoryauditlogs', 'inventorychecks', 'inventorycheckproducts', 'revenuetimes',
]);

async function countMongo(db, name) {
  return db.collection(name).countDocuments({});
}

async function countMysql(conn, table, where = '') {
  const [rows] = await conn.query(`SELECT COUNT(*) AS count FROM \`${table}\` ${where}`);
  return Number(rows[0].count);
}

async function main() {
  const mongo = new MongoClient(mongoUri, { readPreference: 'primary', serverSelectionTimeoutMS: 15000 });
  const conn = await mysql.createConnection(mysqlConfig);
  try {
    await mongo.connect();
    const db = mongo.db();
    const collectionNames = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
    const collectionCounts = {};
    for (const name of collectionNames) collectionCounts[name] = await countMongo(db, name);

    const operationalCounts = Object.fromEntries(await Promise.all(operationalCollections.map(async ([collection]) => [collection, await countMongo(db, collection)])));

    const userDocs = await db.collection('users').find({}, { projection: { assignedWarehouseIds: 1 } }).toArray();
    const productIds = new Set((await db.collection('products').find({}, { projection: { _id: 1 } }).toArray()).map((doc) => oid(doc._id)));
    const branchIds = new Set((await db.collection('branches').find({}, { projection: { _id: 1 } }).toArray()).map((doc) => oid(doc._id)));
    const orphanAssignedBranchIds = new Set(userDocs.flatMap((doc) => (Array.isArray(doc.assignedWarehouseIds) ? doc.assignedWarehouseIds : []).map(oid)).filter((branchMongoId) => branchMongoId && !branchIds.has(branchMongoId)));
    const stockDocs = await db.collection('productbranchstocks').find({}).toArray();
    const productLogDocs = await db.collection('productlogs').find({}, { projection: { productId: 1 } }).toArray();
    const inventoryProductDocs = await db.collection('inventoryproducts').find({}, { projection: { productCode: 1 } }).toArray();
    const productCodes = new Set((await db.collection('products').find({}, { projection: { code: 1 } }).toArray()).map((doc) => doc.code).filter(Boolean));
    const orphanStockProductIds = new Set();
    const orphanOperationalProductIds = new Set();
    const orphanOperationalProductCodes = new Set();
    let orphanStockRows = 0;
    let missingBranchStockRows = 0;
    for (const stock of stockDocs) {
      const productMongoId = oid(stock.productId);
      const branchMongoId = oid(stock.branchId);
      if (!productIds.has(productMongoId)) {
        orphanStockRows += 1;
        if (productMongoId) orphanStockProductIds.add(productMongoId);
      }
      if (!branchIds.has(branchMongoId)) missingBranchStockRows += 1;
    }
    for (const log of productLogDocs) {
      const productMongoId = oid(log.productId);
      if (productMongoId && !productIds.has(productMongoId)) orphanOperationalProductIds.add(productMongoId);
    }
    for (const item of inventoryProductDocs) {
      const productCode = item.productCode ? String(item.productCode) : null;
      if (productCode && !productCodes.has(productCode)) orphanOperationalProductCodes.add(productCode);
    }

    const mysqlCounts = {
      branches: await countMysql(conn, 'branches'),
      users: await countMysql(conn, 'users'),
      customer_groups: await countMysql(conn, 'customer_groups'),
      customers: await countMysql(conn, 'customers'),
      categories: await countMysql(conn, 'categories'),
      trademarks: await countMysql(conn, 'trademarks'),
      shelves: await countMysql(conn, 'shelves'),
      products: await countMysql(conn, 'products'),
      real_products: await countMysql(conn, 'products', "WHERE status <> 'MIGRATION_PLACEHOLDER'"),
      placeholder_products: await countMysql(conn, 'products', "WHERE status = 'MIGRATION_PLACEHOLDER'"),
      product_branch_stocks: await countMysql(conn, 'product_branch_stocks'),
      user_warehouse_assignments: await countMysql(conn, 'user_warehouse_assignments'),
      branch_placeholders: await countMysql(conn, 'branches', "WHERE code LIKE 'MISSING-BRANCH-%'"),
    };

    const expected = {
      branches: collectionCounts.branches + orphanAssignedBranchIds.size,
      users: collectionCounts.users,
      customer_groups: collectionCounts.customergroups,
      customers: collectionCounts.customers,
      categories: collectionCounts.categories,
      trademarks: collectionCounts.trademarks,
      shelves: collectionCounts.shelves,
      real_products: collectionCounts.products,
      placeholder_products: new Set([...orphanStockProductIds, ...orphanOperationalProductIds]).size + orphanOperationalProductCodes.size,
      products: collectionCounts.products + new Set([...orphanStockProductIds, ...orphanOperationalProductIds]).size + orphanOperationalProductCodes.size,
      product_branch_stocks: collectionCounts.productbranchstocks,
    };
    const operationalExpected = Object.fromEntries(operationalCollections.map(([collection, table]) => [table, operationalCounts[collection] ?? 0]));
    const operationalMysql = Object.fromEntries(await Promise.all(operationalCollections.map(async ([, table]) => [table, await countMysql(conn, table)])));

    const comparisons = Object.fromEntries(Object.entries(expected).map(([key, value]) => [key, {
      expected: value,
      actual: mysqlCounts[key],
      ok: value === mysqlCounts[key],
    }]));
    const operationalComparisons = Object.fromEntries(Object.entries(operationalExpected).map(([key, value]) => [key, {
      expected: value,
      actual: operationalMysql[key],
      ok: value === operationalMysql[key],
    }]));

    const fullCoverage = Object.fromEntries(collectionNames.map((name) => {
      const tableEntry = operationalCollections.find(([collection]) => collection === name);
      const foundationEntry = foundationMapping.find(([collection]) => collection === name);
      const table = tableEntry ? tableEntry[1] : foundationEntry ? foundationEntry[1] : null;
      const expected = collectionCounts[name];
      const actual = expected === 0 ? (table ? 0 : null) : null;
      return [name, { mirrored: Boolean(table), count: expected }];
    }));
    const nonEmptyUnmirroredCollections = Object.entries(fullCoverage).filter(([name, info]) => info.count > 0 && !info.mirrored).map(([name]) => name);
    const emptyModeledCollections = collectionNames.filter((name) => collectionCounts[name] === 0 && modeledMainCollections.has(name));
    const emptyUnmodeledCollections = collectionNames.filter((name) => collectionCounts[name] === 0 && !modeledMainCollections.has(name));
    const nonEmptyUnmodeledCollections = collectionNames.filter((name) => collectionCounts[name] > 0 && !modeledMainCollections.has(name));

    console.log(JSON.stringify({
      mongoDatabase: db.databaseName,
      mysqlDatabase: mysqlConfig.database,
      usefulMongoCounts: Object.fromEntries(usefulMongoCollections.map((name) => [name, collectionCounts[name] ?? 0])),
      operationalCounts,
      operationalComparisons,
      mysqlCounts,
      comparisons,
      stockIntegrity: {
        mongoStockRows: stockDocs.length,
        orphanStockRows,
        orphanStockProductIds: orphanStockProductIds.size,
        orphanOperationalProductIds: orphanOperationalProductIds.size,
        orphanOperationalProductCodes: orphanOperationalProductCodes.size,
        missingBranchStockRows,
        orphanAssignedBranchIds: orphanAssignedBranchIds.size,
      },
      collectionAudit: {
        emptyModeledCollections,
        emptyUnmodeledCollections,
        nonEmptyUnmodeledCollections,
        nonEmptyUnmirroredCollections,
      },
    }, null, 2));
  } finally {
    await conn.end();
    await mongo.close();
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
