const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const mysql = require('mysql2/promise');

const mode = process.argv.includes('--apply') ? 'apply' : 'dry-run';
const projectRoot = path.resolve(__dirname, '..', '..');
const mainEnvPath = path.resolve(projectRoot, '..', 'LadyStars', '.env');
const backendEnvPath = path.resolve(__dirname, '..', '.env');
const foundationTables = [
  'user_warehouse_assignments',
  'product_branch_stocks',
  'products',
  'shelves',
  'trademarks',
  'categories',
  'customer_customer_group',
  'customers',
  'customer_groups',
  'users',
  'branches',
];
const report = { mode, mongo: {}, mysql: {}, prepared: {}, inserted: {}, skipped: {}, warnings: [] };

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
const str = (value) => value === undefined || value === null ? null : String(value);
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const bool = (value, fallback = false) => typeof value === 'boolean' ? value : fallback;
const json = (value) => value === undefined || value === null ? null : JSON.stringify(value);
function date(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function normalizeRole(role) { return role === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE'; }
function normalizeUserStatus(status) { return status === 'open' ? 'ACTIVE' : status === 'lock' ? 'LOCKED' : status || 'ACTIVE'; }
function chunk(rows, size = 500) {
  const groups = [];
  for (let index = 0; index < rows.length; index += size) groups.push(rows.slice(index, index + size));
  return groups;
}
function uniqueRows(rows, keyFn, table) {
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const key = keyFn(row);
    if (!key || seen.has(key)) {
      report.warnings.push(`${table}: skipped duplicate/empty key ${key || '(empty)'}`);
      continue;
    }
    seen.add(key);
    result.push(row);
  }
  return result;
}
function warnMissing(table, field, mongoId) {
  if (mongoId) report.warnings.push(`${table}.${field}: missing referenced mongo_id ${mongoId}`);
}

async function docs(db, collection) {
  const rows = await db.collection(collection).find({}).toArray();
  report.mongo[collection] = rows.length;
  return rows;
}
async function truncateFoundation(conn) {
  if (mode !== 'apply') return;
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of foundationTables) await conn.query('TRUNCATE TABLE `' + table + '`');
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
}
async function insertRows(conn, table, rows) {
  report.prepared[table] = rows.length;
  if (mode !== 'apply' || rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const updates = columns.filter((column) => column !== 'mongo_id').map((column) => '`' + column + '` = VALUES(`' + column + '`)').join(', ');
  for (const group of chunk(rows)) {
    const values = group.map((row) => columns.map((column) => row[column]));
    const placeholders = group.map(() => '(' + columns.map(() => '?').join(', ') + ')').join(', ');
    await conn.query(
      'INSERT INTO `' + table + '` (' + columns.map((column) => '`' + column + '`').join(', ') + ') VALUES ' + placeholders + ' ON DUPLICATE KEY UPDATE ' + updates,
      values.flat(),
    );
  }
  report.inserted[table] = rows.length;
}
async function mapByMongoId(conn, table) {
  if (mode !== 'apply') return new Map();
  const [rows] = await conn.query('SELECT id, mongo_id FROM `' + table + '` WHERE mongo_id IS NOT NULL');
  return new Map(rows.map((row) => [row.mongo_id, Number(row.id)]));
}
async function countTable(conn, table) {
  const [rows] = await conn.query('SELECT COUNT(*) AS count FROM `' + table + '`');
  report.mysql[table] = Number(rows[0].count);
}

async function main() {
  console.log(`[migrate] mode=${mode}`);
  console.log(`[migrate] mysql=${mysqlConfig.host}:${mysqlConfig.port}/${mysqlConfig.database}`);
  const mongo = new MongoClient(mongoUri, { readPreference: 'primary' });
  const conn = await mysql.createConnection(mysqlConfig);
  try {
    await mongo.connect();
    const db = mongo.db();
    const [branchDocs, userDocs, customerGroupDocs, customerDocs, categoryDocs, trademarkDocs, shelfDocs, productDocs, stockDocs] = await Promise.all([
      docs(db, 'branches'), docs(db, 'users'), docs(db, 'customergroups'), docs(db, 'customers'), docs(db, 'categories'), docs(db, 'trademarks'), docs(db, 'shelves'), docs(db, 'products'), docs(db, 'productbranchstocks'),
    ]);

    await truncateFoundation(conn);

    const branchRows = uniqueRows(branchDocs.map((doc, index) => ({
      mongo_id: oid(doc._id), name: str(doc.name) || 'Unnamed branch', code: str(doc.code) || `BRANCH-${index + 1}`, phone: str(doc.phone), address: str(doc.address), is_active: bool(doc.isActive, true), invoice_profile: json(doc.invoiceProfile), created_at: date(doc.createdAt), updated_at: date(doc.updatedAt),
    })), (row) => row.mongo_id, 'branches');
    await insertRows(conn, 'branches', branchRows);
    const branchMap = await mapByMongoId(conn, 'branches');

    const userRows = uniqueRows(userDocs.map((doc, index) => ({
      mongo_id: oid(doc._id), name: str(doc.name) || str(doc.email) || `User ${index + 1}`, email: str(doc.email) || `missing-${oid(doc._id)}@local.invalid`, email_verified_at: null, password: str(doc.passwordHash) || '$2y$12$invalid.invalid.invalid.invalid.invalid.invalid', phone: str(doc.phone), role: normalizeRole(doc.role), status: normalizeUserStatus(doc.status), branch_id: branchMap.get(oid(doc.branchId)) || null, default_warehouse_id: branchMap.get(oid(doc.defaultWarehouseId)) || null, created_by_id: null, last_login_at: date(doc.lastLoginAt), locked_at: date(doc.lockedAt), deleted_at: date(doc.deletedAt), token_version: num(doc.tokenVersion, 0), is_root_owner: bool(doc.isRootOwner, false), is_active: bool(doc.isActive, true), remember_token: null, created_at: date(doc.createdAt), updated_at: date(doc.updatedAt),
    })), (row) => row.mongo_id, 'users');
    await insertRows(conn, 'users', userRows);
    const userMap = await mapByMongoId(conn, 'users');
    if (mode === 'apply') {
      for (const doc of userDocs) await conn.query('UPDATE `users` SET `created_by_id` = ? WHERE `mongo_id` = ?', [userMap.get(oid(doc.createdById || doc.createdBy)) || null, oid(doc._id)]);
    }

    const userWarehouseRows = [];
    for (const doc of userDocs) {
      const userId = userMap.get(oid(doc._id));
      for (const branchMongoId of (Array.isArray(doc.assignedWarehouseIds) ? doc.assignedWarehouseIds : []).map(oid)) {
        const branchId = branchMap.get(branchMongoId);
        if (!userId || !branchId) { warnMissing('user_warehouse_assignments', 'branch_id', branchMongoId); continue; }
        userWarehouseRows.push({ user_id: userId, branch_id: branchId, created_at: new Date(), updated_at: new Date() });
      }
    }
    await insertRows(conn, 'user_warehouse_assignments', userWarehouseRows);

    const customerGroupRows = uniqueRows(customerGroupDocs.map((doc, index) => ({
      mongo_id: oid(doc._id), name: str(doc.name) || `Customer group ${index + 1}`, type: str(doc.type) || '1', note: str(doc.note), user_id: userMap.get(oid(doc.userId)) || null, created_at: date(doc.createdAt), updated_at: date(doc.updatedAt),
    })), (row) => row.mongo_id, 'customer_groups');
    await insertRows(conn, 'customer_groups', customerGroupRows);
    const customerGroupMap = await mapByMongoId(conn, 'customer_groups');

    const customerRows = uniqueRows(customerDocs.map((doc, index) => ({
      mongo_id: oid(doc._id), type: ['person', 'company'].includes(doc.type) ? doc.type : 'person', name: str(doc.name) || `Customer ${index + 1}`, code: str(doc.code) || `CUS-${index + 1}`, phone: str(doc.phone), phone2: str(doc.phone2), card_id: str(doc.cardId), email: str(doc.email), birthday: date(doc.birthday), sex: ['female', 'male', 'other'].includes(doc.sex) ? doc.sex : 'female', customer_level: str(doc.customerLevel), address: str(doc.address), address_location: str(doc.addressLocation), province_id: str(doc.provinceId), district_id: str(doc.districtId), ward_id: str(doc.wardId), company: str(doc.company), vat: str(doc.vat), facebook: str(doc.facebook), note: str(doc.note), total_spent: num(doc.totalSpent, 0), purchase_count: num(doc.purchaseCount, 0), purchase_product_quantity: num(doc.purchaseProductQuantity, 0), points: num(doc.points, 0), first_purchase_date: date(doc.firstPurchaseDate), last_purchase_date: date(doc.lastPurchaseDate), days_since_last_purchase: doc.daysSinceLastPurchase ?? null, purchase_cycle_days: doc.purchaseCycleDays ?? null, tags: json(doc.tags), status: ['active', 'inactive'].includes(doc.status) ? doc.status : 'active', branch_id: branchMap.get(oid(doc.branchId)) || null, user_id: userMap.get(oid(doc.userId)) || null, created_at: date(doc.createdAt), updated_at: date(doc.updatedAt),
    })), (row) => row.mongo_id, 'customers');
    await insertRows(conn, 'customers', customerRows);
    const customerMap = await mapByMongoId(conn, 'customers');

    const customerGroupPivotRows = [];
    for (const doc of customerDocs) {
      const customerId = customerMap.get(oid(doc._id));
      for (const groupMongoId of (Array.isArray(doc.groups) ? doc.groups : []).map(oid)) {
        const customerGroupId = customerGroupMap.get(groupMongoId);
        if (!customerId || !customerGroupId) { warnMissing('customer_customer_group', 'customer_group_id', groupMongoId); continue; }
        customerGroupPivotRows.push({ customer_id: customerId, customer_group_id: customerGroupId, created_at: new Date(), updated_at: new Date() });
      }
    }
    await insertRows(conn, 'customer_customer_group', uniqueRows(customerGroupPivotRows, (row) => `${row.customer_id}:${row.customer_group_id}`, 'customer_customer_group'));

    const categoryRows = uniqueRows(categoryDocs.map((doc, index) => ({
      mongo_id: oid(doc._id), external_id: str(doc.externalId), name: str(doc.name) || `Category ${index + 1}`, code: str(doc.code), parent_id: null, user_id: userMap.get(oid(doc.userId)) || null, is_active: bool(doc.isActive, true), is_visible: bool(doc.isVisible, true), product_count: num(doc.productCount, 0), url: str(doc.url), created_at: date(doc.createdAt), updated_at: date(doc.updatedAt),
    })), (row) => row.mongo_id, 'categories');
    await insertRows(conn, 'categories', categoryRows);
    const categoryMap = await mapByMongoId(conn, 'categories');
    if (mode === 'apply') for (const doc of categoryDocs) await conn.query('UPDATE `categories` SET `parent_id` = ? WHERE `mongo_id` = ?', [categoryMap.get(oid(doc.parentId)) || null, oid(doc._id)]);

    const trademarkRows = uniqueRows(trademarkDocs.map((doc, index) => ({ mongo_id: oid(doc._id), name: str(doc.name) || `Trademark ${index + 1}`, user_id: userMap.get(oid(doc.userId)) || null, created_at: date(doc.createdAt), updated_at: date(doc.updatedAt) })), (row) => row.mongo_id, 'trademarks');
    await insertRows(conn, 'trademarks', trademarkRows);
    const trademarkMap = await mapByMongoId(conn, 'trademarks');

    const shelfRows = uniqueRows(shelfDocs.map((doc, index) => ({ mongo_id: oid(doc._id), name: str(doc.name) || `Shelf ${index + 1}`, user_id: userMap.get(oid(doc.userId)) || null, created_at: date(doc.createdAt), updated_at: date(doc.updatedAt) })), (row) => row.mongo_id, 'shelves');
    await insertRows(conn, 'shelves', shelfRows);
    const shelfMap = await mapByMongoId(conn, 'shelves');

    const knownProductKeys = new Set(['_id','externalId','name','code','categoryId','trademarkId','shelfId','cost','price','wholesalePrice','clearancePrice','clearanceActive','clearanceNote','clearanceStartedAt','qty','weight','weightType','allowsSale','unit','minQuantity','maxQuantity','type','description','note','units','elements','userId','status','categoryName','trademarkName','supplierName','origin','color','size','barcode','parentCode','parentName','createdAt','updatedAt','__v']);
    const productRows = uniqueRows(productDocs.map((doc, index) => ({
      mongo_id: oid(doc._id), external_id: str(doc.externalId), name: str(doc.name) || `Product ${index + 1}`, code: str(doc.code) || `PROD-${index + 1}`, category_id: categoryMap.get(oid(doc.categoryId)) || null, trademark_id: trademarkMap.get(oid(doc.trademarkId)) || null, shelf_id: shelfMap.get(oid(doc.shelfId)) || null, cost: num(doc.cost, 0), price: num(doc.price, 0), wholesale_price: num(doc.wholesalePrice, 0), clearance_price: num(doc.clearancePrice, 0), clearance_active: bool(doc.clearanceActive, false), clearance_note: str(doc.clearanceNote), clearance_started_at: date(doc.clearanceStartedAt), qty: num(doc.qty, 0), weight: doc.weight == null ? null : num(doc.weight, 0), weight_type: ['gram', 'kg'].includes(doc.weightType) ? doc.weightType : 'gram', allows_sale: bool(doc.allowsSale, true), unit: str(doc.unit), min_quantity: num(doc.minQuantity, 0), max_quantity: num(doc.maxQuantity, 999999999), type: ['product', 'service', 'combo'].includes(doc.type) ? doc.type : 'product', description: str(doc.description), note: str(doc.note), units: json(doc.units), elements: json(doc.elements), user_id: userMap.get(oid(doc.userId)) || null, status: str(doc.status) || 'Mới', category_name: str(doc.categoryName), trademark_name: str(doc.trademarkName), supplier_name: str(doc.supplierName), origin: str(doc.origin), color: str(doc.color), size: str(doc.size), barcode: str(doc.barcode), parent_code: str(doc.parentCode), parent_name: str(doc.parentName), extra: json(Object.fromEntries(Object.entries(doc).filter(([key]) => !knownProductKeys.has(key)))), created_at: date(doc.createdAt), updated_at: date(doc.updatedAt),
    })), (row) => row.mongo_id, 'products');
    await insertRows(conn, 'products', productRows);
    report.prepared.source_products = productRows.length;
    report.inserted.source_products = mode === 'apply' ? productRows.length : 0;
    const productMap = await mapByMongoId(conn, 'products');

    const missingProductIds = [...new Set(stockDocs.map((doc) => oid(doc.productId)).filter((productMongoId) => productMongoId && !productMap.has(productMongoId)))];
    if (missingProductIds.length > 0) {
      const placeholderRows = missingProductIds.map((productMongoId) => ({
        mongo_id: productMongoId,
        external_id: null,
        name: `MIGRATION PLACEHOLDER PRODUCT ${productMongoId}`,
        code: `MISSING-${productMongoId}`,
        category_id: null,
        trademark_id: null,
        shelf_id: null,
        cost: 0,
        price: 0,
        wholesale_price: 0,
        clearance_price: 0,
        clearance_active: false,
        clearance_note: null,
        clearance_started_at: null,
        qty: 0,
        weight: null,
        weight_type: 'gram',
        allows_sale: false,
        unit: null,
        min_quantity: 0,
        max_quantity: 999999999,
        type: 'product',
        description: 'Placeholder created during Mongo to MySQL migration because productbranchstocks referenced a missing Mongo product.',
        note: 'MIGRATION_PLACEHOLDER_MISSING_PRODUCT',
        units: null,
        elements: null,
        user_id: null,
        status: 'MIGRATION_PLACEHOLDER',
        category_name: null,
        trademark_name: null,
        supplier_name: null,
        origin: null,
        color: null,
        size: null,
        barcode: null,
        parent_code: null,
        parent_name: null,
        extra: JSON.stringify({ migrationPlaceholder: true, missingMongoProductId: productMongoId }),
        created_at: new Date(),
        updated_at: new Date(),
      }));
      await insertRows(conn, 'products', placeholderRows);
      if (mode === 'apply') {
        const refreshedProductMap = await mapByMongoId(conn, 'products');
        for (const [key, value] of refreshedProductMap) productMap.set(key, value);
      } else {
        for (const productMongoId of missingProductIds) productMap.set(productMongoId, -1);
      }
      report.prepared.product_placeholders = placeholderRows.length;
      report.inserted.product_placeholders = mode === 'apply' ? placeholderRows.length : 0;
    }

    const stockRows = [];
    for (const doc of stockDocs) {
      const productId = productMap.get(oid(doc.productId));
      const branchId = branchMap.get(oid(doc.branchId));
      if (!productId || !branchId) { if (!productId) warnMissing('product_branch_stocks', 'product_id', oid(doc.productId)); if (!branchId) warnMissing('product_branch_stocks', 'branch_id', oid(doc.branchId)); continue; }
      stockRows.push({ mongo_id: oid(doc._id), product_id: productId, branch_id: branchId, qty: num(doc.qty, 0), locked_quantity: num(doc.lockedQuantity, 0), min_quantity: num(doc.minQuantity, 0), max_quantity: num(doc.maxQuantity, 999999999), created_at: date(doc.createdAt), updated_at: date(doc.updatedAt) });
    }
    await insertRows(conn, 'product_branch_stocks', uniqueRows(stockRows, (row) => row.mongo_id || `${row.product_id}:${row.branch_id}`, 'product_branch_stocks'));
    report.skipped.product_branch_stocks = stockDocs.length - stockRows.length;

    for (const table of foundationTables.slice().reverse()) await countTable(conn, table);
    console.log(JSON.stringify(report, null, 2));
    if (mode === 'dry-run') console.log('[migrate] Dry-run only. Re-run with --apply to write MySQL local data.');
  } finally {
    await conn.end();
    await mongo.close();
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});


