const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const mysql = require('mysql2/promise');

const mode = process.argv.includes('--apply') ? 'apply' : 'dry-run';
const projectRoot = path.resolve(__dirname, '..', '..');
const mainEnvPath = path.resolve(projectRoot, '..', 'LadyStars', '.env');
const backendEnvPath = path.resolve(__dirname, '..', '.env');
const operationalTables = [
  'store_settings',
  'roles',
  'permissions',
  'menu_items',
  'audit_logs',
  'vendors',
  'customer_cares',
  'inventory_check_products',
  'inventory_checks',
  'transfer_audit_logs',
  'warehouse_transfers',
  'inventory_products',
  'inventory_vouchers',
  'product_edit_logs',
  'product_logs',
  'product_refunds',
  'sale_payments',
  'payment_methods',
  'sale_channels',
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
let dryRunId = 1;

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
function dryRunMapByMongoId(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!row.mongo_id || map.has(row.mongo_id)) continue;
    map.set(row.mongo_id, dryRunId++);
  }
  return map;
}


function firstDate(...values) {
  for (const value of values) {
    const parsed = date(value);
    if (parsed) return parsed;
  }
  return null;
}
function mirrorRow(doc, extra = {}) {
  return {
    mongo_id: oid(doc._id),
    code: str(doc.code || doc.id || doc.voucherId),
    name: str(doc.name || doc.title || doc.productName || doc.customerName || doc.actionType || doc.action || doc.warehouse),
    status: str(doc.status),
    type: str(doc.type || doc.kind || doc.auditType),
    amount: doc.amount == null ? null : num(doc.amount, 0),
    value: doc.value == null ? null : num(doc.value, 0),
    total: doc.total == null ? (doc.totalAmount == null ? null : num(doc.totalAmount, 0)) : num(doc.total, 0),
    branch_mongo_id: oid(doc.branchId || doc.warehouseId || doc.sourceWarehouseId),
    customer_mongo_id: oid(doc.customerId),
    product_mongo_id: oid(doc.productId),
    user_mongo_id: oid(doc.userId || doc.authorId || doc.userCreatedId || doc.createdById || doc.createdBy),
    business_date: firstDate(doc.completedAt, doc.recordDate, doc.businessDate, doc.date, doc.createdAt),
    payload: json(doc),
    created_at: date(doc.createdAt),
    updated_at: date(doc.updatedAt),
    ...extra,
  };
}
function localId(map, mongoId) {
  return map.get(oid(mongoId)) || null;
}
function operationalRows(collection, docs, maps = {}) {
  return docs.map((doc) => {
    if (collection === 'salechannels') return mirrorRow(doc, {
      description: str(doc.description),
      sort_order: doc.sortOrder == null ? null : num(doc.sortOrder, 0),
      is_active: bool(doc.isActive, true),
      is_default: bool(doc.isDefault, false),
    });
    if (collection === 'paymentmethods') return mirrorRow(doc, {
      target_payment_status: str(doc.targetPaymentStatus),
      sort_order: doc.sortOrder == null ? null : num(doc.sortOrder, 0),
      is_active: bool(doc.isActive, true),
    });
    if (collection === 'salepayments') return mirrorRow(doc, {
      branch_id: localId(maps.branchMap, doc.branchId),
      customer_id: localId(maps.customerMap, doc.customerId),
      sale_channel_id: oid(doc.saleChannelId),
      amount_products: doc.amountProducts == null ? null : num(doc.amountProducts, 0),
      total_cost: doc.totalCost == null ? null : num(doc.totalCost, 0),
      discount_value: doc.discountValue == null ? null : num(doc.discountValue, 0),
      discount_type: str(doc.discountType),
      value_payment: doc.valuePayment == null ? null : num(doc.valuePayment, 0),
      tendered_value: doc.tenderedValue == null ? null : num(doc.tenderedValue, 0),
      settlement_value: doc.settlementValue == null ? null : num(doc.settlementValue, 0),
      refunded_value: doc.refundedValue == null ? null : num(doc.refundedValue, 0),
      refund_status: str(doc.refundStatus),
      is_delivery: bool(doc.isDelivery, false),
      is_cod: bool(doc.isCod, false),
      note: str(doc.note),
      user_id: localId(maps.userMap, doc.userId),
      author_id: localId(maps.userMap, doc.authorId),
      payment_lines: json(doc.typePayment),
      items: json(doc.items),
      completed_at: date(doc.completedAt),
    });
    if (collection === 'productrefunds') return mirrorRow(doc, {
      payment_mongo_id: oid(doc.paymentId),
      user_id: localId(maps.userMap, doc.userId),
      user_created_id: localId(maps.userMap, doc.userCreatedId),
      refund_fee: doc.refundFee == null ? null : num(doc.refundFee, 0),
      discount_value: doc.discountValue == null ? null : num(doc.discountValue, 0),
      discount_type: str(doc.discountType),
      refund_fee_type: str(doc.refundFeeType),
      original_total_amount: doc.originalTotalAmount == null ? null : num(doc.originalTotalAmount, 0),
      total_payable_amount: doc.totalPayableAmount == null ? null : num(doc.totalPayableAmount, 0),
      settlement_value: doc.settlementValue == null ? null : num(doc.settlementValue, 0),
      note: str(doc.note),
      payment_lines: json(doc.typePayment),
      items: json(doc.items),
      completed_at: date(doc.completedAt),
    });
    if (collection === 'productlogs') return mirrorRow(doc, {
      product_id: localId(maps.productMap, doc.productId),
      source_type: str(doc.sourceType),
      source_mongo_id: oid(doc.sourceId),
      value_before: doc.valueBefore == null ? null : num(doc.valueBefore, 0),
      value_after: doc.valueAfter == null ? null : num(doc.valueAfter, 0),
      amount_before: doc.amountBefore == null ? null : num(doc.amountBefore, 0),
      amount_after: doc.amountAfter == null ? null : num(doc.amountAfter, 0),
    });
    if (collection === 'producteditlogs') return mirrorRow(doc, {
      name: str(doc.productName),
      product_id: localId(maps.productByCodeMap, doc.productCode),
      product_code: str(doc.productCode),
      product_name: str(doc.productName),
      field_name: str(doc.fieldName || doc.logType),
      old_value: str(doc.oldValue),
      new_value: str(doc.newValue || doc.logAction),
      created_by: str(doc.createdBy),
      log_type: str(doc.logType),
      log_action: str(doc.logAction),
    });
    if (collection === 'inventoryvouchers') return mirrorRow(doc, {
      branch_id: localId(maps.branchMap, doc.branchId || doc.warehouseId),
      product_id: localId(maps.productMap, doc.productId),
      warehouse_mongo_id: oid(doc.warehouseId || doc.branchId),
      warehouse_name: str(doc.warehouse),
      warehouse_code: str(doc.warehouseCode),
      import_export_type: str(doc.type),
      voucher_code: str(doc.voucherId || doc.code),
      refer_code: str(doc.relatedVoucher || doc.requestVoucher || doc.orderId || doc.invoice),
      qty: doc.qty == null ? null : num(doc.qty, 0),
      unit_price: doc.price == null ? null : num(doc.price, 0),
      sp_count: doc.spCount == null ? null : num(doc.spCount, 0),
      total_amount: doc.totalAmount == null ? null : num(doc.totalAmount, 0),
      discount: doc.discount == null ? null : num(doc.discount, 0),
      creator: str(doc.creator),
      customer_phone: str(doc.customerPhone),
      supplier: str(doc.supplier),
      seller: str(doc.seller),
      note: str(doc.note),
    });
    if (collection === 'inventoryproducts') return mirrorRow(doc, {
      code: str(doc.id || doc.productCode),
      name: str(doc.productName),
      branch_id: localId(maps.branchMap, doc.branchId),
      product_id: localId(maps.productByCodeMap, doc.productCode),
      inventory_voucher_mongo_id: oid(doc.inventoryVoucherId || doc.voucherId || doc.billId),
      product_mongo_id: oid(doc.productId),
      warehouse_name: str(doc.warehouse),
      product_code: str(doc.productCode),
      product_name: str(doc.productName),
      barcode: str(doc.barcode),
      refer_code: str(doc.voucherId),
      qty: doc.importQty || doc.exportQty ? num(doc.importQty || doc.exportQty, 0) : null,
      import_qty: doc.importQty == null ? null : num(doc.importQty, 0),
      export_qty: doc.exportQty == null ? null : num(doc.exportQty, 0),
      unit_price: doc.price == null ? null : num(doc.price, 0),
      cost: doc.cost == null ? null : num(doc.cost, 0),
      discount: doc.discount == null ? null : num(doc.discount, 0),
      total_amount: doc.totalAmount == null ? null : num(doc.totalAmount, 0),
      creator: str(doc.creator),
      customer_name: str(doc.customer),
      parent_code: str(doc.parentCode),
    });
    if (collection === 'warehousetransfers') return mirrorRow(doc, {
      branch_mongo_id: oid(doc.sourceWarehouseId || doc.fromBranchId),
      from_branch_mongo_id: oid(doc.fromBranchId || doc.sourceWarehouseId),
      to_branch_mongo_id: oid(doc.toBranchId || doc.destinationWarehouseId),
      from_branch_id: localId(maps.branchMap, doc.fromBranchId || doc.sourceWarehouseId),
      to_branch_id: localId(maps.branchMap, doc.toBranchId || doc.destinationWarehouseId),
      date_send: date(doc.dateSend || doc.date),
      date_take: date(doc.dateTake),
      source_warehouse_name: str(doc.sourceWarehouseName),
      destination_warehouse_name: str(doc.destinationWarehouseName),
      qty: doc.qty == null ? null : num(doc.qty, 0),
      sp_count: doc.spCount == null ? null : num(doc.spCount, 0),
      total_amount: doc.totalAmount == null ? null : num(doc.totalAmount, 0),
      creator: str(doc.creator),
      source: str(doc.source),
      source_export_bill_mongo_id: oid(doc.sourceExportBillId),
      destination_import_bill_mongo_id: oid(doc.destinationImportBillId),
      lines: json(doc.lines),
    });
    if (collection === 'transferauditlogs') return mirrorRow(doc, {
      transfer_mongo_id: oid(doc.transferId || doc.warehouseTransferId || doc.transferRequestId),
      transfer_request_mongo_id: oid(doc.transferRequestId),
      action_type: str(doc.actionType),
      actor_mongo_id: oid(doc.actorId),
      actor_role: str(doc.actorRole),
      previous_status: str(doc.previousStatus),
      next_status: str(doc.nextStatus),
      reason: str(doc.reason),
    });
    if (collection === 'inventorychecks') return mirrorRow(doc, {
      branch_mongo_id: oid(doc.warehouseId || doc.branchId),
      branch_id: localId(maps.branchMap, doc.warehouseId || doc.branchId),
      warehouse_name: str(doc.warehouse),
      creator: str(doc.creator),
      sp_count: doc.spCount == null ? null : num(doc.spCount, 0),
      qty: doc.qty == null ? null : num(doc.qty, 0),
      note: str(doc.note),
      missing_sp: str(doc.missingSp),
      balance: str(doc.balance),
    });
    if (collection === 'inventorycheckproducts') return mirrorRow(doc, {
      branch_mongo_id: oid(doc.branchId),
      branch_id: localId(maps.branchMap, doc.branchId),
      product_id: localId(maps.productByCodeMap, doc.productCode),
      warehouse_name: str(doc.warehouse),
      external_id: str(doc.externalId),
      product_code: str(doc.productCode),
      product_name: str(doc.productName),
      barcode: str(doc.barcode),
      cost: doc.cost == null ? null : num(doc.cost, 0),
      price: doc.price == null ? null : num(doc.price, 0),
      stock: doc.stock == null ? null : num(doc.stock, 0),
      transferring: doc.transferring == null ? null : num(doc.transferring, 0),
      actual_stock: doc.actualStock == null ? null : num(doc.actualStock, 0),
      difference: doc.difference == null ? null : num(doc.difference, 0),
      holding: doc.holding == null ? null : num(doc.holding, 0),
      description: str(doc.description),
    });
    if (collection === 'customercares') return mirrorRow(doc, {
      customer_code: str(doc.customerCode),
      customer_name: str(doc.customerName),
      customer_phone: str(doc.customerPhone),
      record_date: date(doc.recordDate),
      details: str(doc.details),
      reason: str(doc.reason),
      description: str(doc.description),
      creator: str(doc.creator),
    });
    if (collection === 'vendors') return mirrorRow(doc, {
      branch_id: localId(maps.branchMap, doc.branchId),
      phone: str(doc.phone),
      email: str(doc.email),
      vat: str(doc.vat),
      company: str(doc.company),
      address: str(doc.address),
      debt: doc.debt == null ? null : num(doc.debt, 0),
      total_purchase: doc.totalPurchase == null ? null : num(doc.totalPurchase, 0),
      user_created_id: localId(maps.userMap, doc.userCreatedId),
      note: str(doc.note),
    });
    if (collection === 'auditlogs') return mirrorRow(doc, {
      user_id: localId(maps.userMap, doc.userId),
      user_name: str(doc.userName),
      user_email: str(doc.userEmail),
      action: str(doc.action),
      entity_type: str(doc.entityType || doc.module),
      module: str(doc.module),
      resource: str(doc.resource),
      entity_mongo_id: oid(doc.entityId || doc.targetId || doc.resourceId),
      resource_mongo_id: oid(doc.resourceId),
      ip: str(doc.ip),
      user_agent: str(doc.userAgent),
    });
    return mirrorRow(doc);
  });
}

async function docs(db, collection) {
  const rows = await db.collection(collection).find({}).toArray();
  report.mongo[collection] = rows.length;
  return rows;
}
async function truncateFoundation(conn) {
  if (mode !== 'apply') return;
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of [...operationalTables, ...foundationTables]) await conn.query('TRUNCATE TABLE `' + table + '`');
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
async function mapByCode(conn, table) {
  if (mode !== 'apply') return new Map();
  const [rows] = await conn.query('SELECT id, code FROM `' + table + '` WHERE code IS NOT NULL');
  return new Map(rows.map((row) => [row.code, Number(row.id)]));
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
    const operationalDocs = new Map(await Promise.all(operationalCollections.map(async ([collection]) => [collection, await docs(db, collection)])));

    await truncateFoundation(conn);

    const branchRows = uniqueRows(branchDocs.map((doc, index) => ({
      mongo_id: oid(doc._id), name: str(doc.name) || 'Unnamed branch', code: str(doc.code) || `BRANCH-${index + 1}`, phone: str(doc.phone), address: str(doc.address), is_active: bool(doc.isActive, true), invoice_profile: json(doc.invoiceProfile), created_at: date(doc.createdAt), updated_at: date(doc.updatedAt),
    })), (row) => row.mongo_id, 'branches');
    const knownBranchMongoIds = new Set(branchRows.map((row) => row.mongo_id).filter(Boolean));
    const missingAssignedBranchIds = [...new Set(userDocs.flatMap((doc) => (Array.isArray(doc.assignedWarehouseIds) ? doc.assignedWarehouseIds : []).map(oid)).filter((branchMongoId) => branchMongoId && !knownBranchMongoIds.has(branchMongoId)))];
    if (missingAssignedBranchIds.length > 0) {
      branchRows.push(...missingAssignedBranchIds.map((branchMongoId) => ({
        mongo_id: branchMongoId,
        name: `MIGRATION PLACEHOLDER BRANCH ${branchMongoId}`,
        code: `MISSING-BRANCH-${branchMongoId}`,
        phone: null,
        address: null,
        is_active: false,
        invoice_profile: JSON.stringify({ migrationPlaceholder: true, missingMongoBranchId: branchMongoId }),
        created_at: new Date(),
        updated_at: new Date(),
      })));
      report.prepared.branch_placeholders = missingAssignedBranchIds.length;
      report.inserted.branch_placeholders = mode === 'apply' ? missingAssignedBranchIds.length : 0;
    }
    await insertRows(conn, 'branches', branchRows);
    const branchMap = mode === 'apply' ? await mapByMongoId(conn, 'branches') : dryRunMapByMongoId(branchRows);

    const userRows = uniqueRows(userDocs.map((doc, index) => ({
      mongo_id: oid(doc._id), name: str(doc.name) || str(doc.email) || `User ${index + 1}`, email: str(doc.email) || `missing-${oid(doc._id)}@local.invalid`, email_verified_at: null, password: str(doc.passwordHash) || '$2y$12$invalid.invalid.invalid.invalid.invalid.invalid', phone: str(doc.phone), role: normalizeRole(doc.role), status: normalizeUserStatus(doc.status), branch_id: branchMap.get(oid(doc.branchId)) || null, default_warehouse_id: branchMap.get(oid(doc.defaultWarehouseId)) || null, created_by_id: null, last_login_at: date(doc.lastLoginAt), locked_at: date(doc.lockedAt), deleted_at: date(doc.deletedAt), token_version: num(doc.tokenVersion, 0), is_root_owner: bool(doc.isRootOwner, false), is_active: bool(doc.isActive, true), remember_token: null, created_at: date(doc.createdAt), updated_at: date(doc.updatedAt),
    })), (row) => row.mongo_id, 'users');
    await insertRows(conn, 'users', userRows);
    const userMap = mode === 'apply' ? await mapByMongoId(conn, 'users') : dryRunMapByMongoId(userRows);
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
    const customerGroupMap = mode === 'apply' ? await mapByMongoId(conn, 'customer_groups') : dryRunMapByMongoId(customerGroupRows);

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
    const categoryMap = mode === 'apply' ? await mapByMongoId(conn, 'categories') : dryRunMapByMongoId(categoryRows);
    if (mode === 'apply') for (const doc of categoryDocs) await conn.query('UPDATE `categories` SET `parent_id` = ? WHERE `mongo_id` = ?', [categoryMap.get(oid(doc.parentId)) || null, oid(doc._id)]);

    const trademarkRows = uniqueRows(trademarkDocs.map((doc, index) => ({ mongo_id: oid(doc._id), name: str(doc.name) || `Trademark ${index + 1}`, user_id: userMap.get(oid(doc.userId)) || null, created_at: date(doc.createdAt), updated_at: date(doc.updatedAt) })), (row) => row.mongo_id, 'trademarks');
    await insertRows(conn, 'trademarks', trademarkRows);
    const trademarkMap = mode === 'apply' ? await mapByMongoId(conn, 'trademarks') : dryRunMapByMongoId(trademarkRows);

    const shelfRows = uniqueRows(shelfDocs.map((doc, index) => ({ mongo_id: oid(doc._id), name: str(doc.name) || `Shelf ${index + 1}`, user_id: userMap.get(oid(doc.userId)) || null, created_at: date(doc.createdAt), updated_at: date(doc.updatedAt) })), (row) => row.mongo_id, 'shelves');
    await insertRows(conn, 'shelves', shelfRows);
    const shelfMap = mode === 'apply' ? await mapByMongoId(conn, 'shelves') : dryRunMapByMongoId(shelfRows);

    const knownProductKeys = new Set(['_id','externalId','name','code','categoryId','trademarkId','shelfId','cost','price','wholesalePrice','clearancePrice','clearanceActive','clearanceNote','clearanceStartedAt','qty','weight','weightType','allowsSale','unit','minQuantity','maxQuantity','type','description','note','units','elements','userId','status','categoryName','trademarkName','supplierName','origin','color','size','barcode','parentCode','parentName','createdAt','updatedAt','__v']);
    const productRows = uniqueRows(productDocs.map((doc, index) => ({
      mongo_id: oid(doc._id), external_id: str(doc.externalId), name: str(doc.name) || `Product ${index + 1}`, code: str(doc.code) || `PROD-${index + 1}`, category_id: categoryMap.get(oid(doc.categoryId)) || null, trademark_id: trademarkMap.get(oid(doc.trademarkId)) || null, shelf_id: shelfMap.get(oid(doc.shelfId)) || null, cost: num(doc.cost, 0), price: num(doc.price, 0), wholesale_price: num(doc.wholesalePrice, 0), clearance_price: num(doc.clearancePrice, 0), clearance_active: bool(doc.clearanceActive, false), clearance_note: str(doc.clearanceNote), clearance_started_at: date(doc.clearanceStartedAt), qty: num(doc.qty, 0), weight: doc.weight == null ? null : num(doc.weight, 0), weight_type: ['gram', 'kg'].includes(doc.weightType) ? doc.weightType : 'gram', allows_sale: bool(doc.allowsSale, true), unit: str(doc.unit), min_quantity: num(doc.minQuantity, 0), max_quantity: num(doc.maxQuantity, 999999999), type: ['product', 'service', 'combo'].includes(doc.type) ? doc.type : 'product', description: str(doc.description), note: str(doc.note), units: json(doc.units), elements: json(doc.elements), user_id: userMap.get(oid(doc.userId)) || null, status: str(doc.status) || 'Má»›i', category_name: str(doc.categoryName), trademark_name: str(doc.trademarkName), supplier_name: str(doc.supplierName), origin: str(doc.origin), color: str(doc.color), size: str(doc.size), barcode: str(doc.barcode), parent_code: str(doc.parentCode), parent_name: str(doc.parentName), extra: json(Object.fromEntries(Object.entries(doc).filter(([key]) => !knownProductKeys.has(key)))), created_at: date(doc.createdAt), updated_at: date(doc.updatedAt),
    })), (row) => row.mongo_id, 'products');
    await insertRows(conn, 'products', productRows);
    report.prepared.source_products = productRows.length;
    report.inserted.source_products = mode === 'apply' ? productRows.length : 0;
    const productMap = mode === 'apply' ? await mapByMongoId(conn, 'products') : dryRunMapByMongoId(productRows);

    const productLogDocs = operationalDocs.get('productlogs') || [];
    const inventoryProductDocs = operationalDocs.get('inventoryproducts') || [];
    const productCodes = new Set(productRows.map((row) => row.code).filter(Boolean));
    const missingProductIds = [...new Set([
      ...stockDocs.map((doc) => oid(doc.productId)),
      ...productLogDocs.map((doc) => oid(doc.productId)),
    ].filter((productMongoId) => productMongoId && !productMap.has(productMongoId)))];
    const missingProductCodes = [...new Set(inventoryProductDocs.map((doc) => str(doc.productCode)).filter((code) => code && !productCodes.has(code)))];
    const placeholderRows = [
      ...missingProductIds.map((productMongoId) => ({
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
        description: 'Placeholder created during Mongo to MySQL migration because operational records referenced a missing Mongo product.',
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
      })),
      ...missingProductCodes.map((productCode) => ({
        mongo_id: null,
        external_id: null,
        name: `MIGRATION PLACEHOLDER PRODUCT CODE ${productCode}`,
        code: productCode,
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
        description: 'Placeholder created during Mongo to MySQL migration because inventoryproducts referenced a missing product code.',
        note: 'MIGRATION_PLACEHOLDER_MISSING_PRODUCT_CODE',
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
        extra: JSON.stringify({ migrationPlaceholder: true, missingProductCode: productCode }),
        created_at: new Date(),
        updated_at: new Date(),
      })),
    ];
    if (placeholderRows.length > 0) {
      await insertRows(conn, 'products', uniqueRows(placeholderRows, (row) => row.mongo_id || row.code, 'products'));
      if (mode === 'apply') {
        const refreshedProductMap = await mapByMongoId(conn, 'products');
        for (const [key, value] of refreshedProductMap) productMap.set(key, value);
      } else {
        for (const row of placeholderRows) if (row.mongo_id) productMap.set(row.mongo_id, dryRunId++);
      }
      report.prepared.product_placeholders = placeholderRows.length;
      report.prepared.product_id_placeholders = missingProductIds.length;
      report.prepared.product_code_placeholders = missingProductCodes.length;
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

    const productByCodeMap = mode === 'apply' ? await mapByCode(conn, 'products') : new Map([...productRows, ...placeholderRows].filter((row) => row.code).map((row) => [row.code, row.mongo_id ? productMap.get(row.mongo_id) : dryRunId++]));
    const operationalMaps = { branchMap, customerMap, productMap, productByCodeMap, userMap };
    for (const [collection, table] of operationalCollections) {
      const rows = uniqueRows(operationalRows(collection, operationalDocs.get(collection) || [], operationalMaps), (row) => row.mongo_id, table);
      await insertRows(conn, table, rows);
    }

    for (const table of [...foundationTables.slice().reverse(), ...operationalTables.slice().reverse()]) await countTable(conn, table);
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

