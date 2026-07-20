/**
 * Build MySQL import SQL from legacy Excel exports (Downloads).
 * Rules: no fabricated business numbers; map only from source files + 2 branches + admin + payment methods catalog.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');

const DOWNLOADS = 'C:/Users/tiend/Downloads';
const OUT_SQL = path.join(__dirname, '../artifacts/ladystars-full-import.sql');
const OUT_REPORT = path.join(__dirname, '../artifacts/ladystars-import-report.md');

// Never hardcode credentials. Provide a bcrypt hash (not plaintext) via env when generating SQL.
// Example: php -r "echo password_hash(getenv('ADMIN_PASSWORD'), PASSWORD_BCRYPT);"
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim();
const ADMIN_BCRYPT = (process.env.ADMIN_PASSWORD_BCRYPT || '').trim();
const ADMIN_NAME = (process.env.ADMIN_NAME || 'Admin').trim() || 'Admin';

const FILES = {
  categories: 'Danh mục.xlsx',
  products: 'Sản phẩm.xlsx',
  stock: 'Tồn kho.xlsx',
  customers: 'Khách hàng.xlsx',
  retail: 'Bán lẻ.xlsx',
  refunds: 'Hóa đơn trả hàng.xlsx',
  cares: 'Danh sách phiếu chăm sóc (CSKH).xlsx',
  vouchers: 'Xuất nhập kho - Phiếu xuất nhập kho.xlsx',
  voucherLines: '_Xuất nhập kho - Sản phẩm xuất nhập kho.xlsx',
  transfers: 'Đơn chuyển kho.xlsx',
  productLogs: 'Sản phẩm - Lịch sử sửa xóa.xlsx',
};

function mid() {
  return crypto.randomBytes(12).toString('hex');
}

function sqlStr(v) {
  if (v === null || v === undefined) return 'NULL';
  let s = String(v);
  if (s === '—' || s === '–' || s === '-' || s.trim() === '') return 'NULL';
  s = s.replace(/\r\n/g, '\n').replace(/\\/g, '\\\\').replace(/'/g, "''");
  return `'${s}'`;
}

function sqlNum(v, asInt = false) {
  if (v === null || v === undefined || v === '' || v === '—') return 'NULL';
  let s = String(v).trim();
  // "9.333.000 đ" / "1,234.56"
  s = s.replace(/[đĐ\s]/g, '').replace(/,/g, '');
  // Vietnamese thousand dots: 9.333.000
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  else if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n)) return 'NULL';
  return asInt ? String(Math.trunc(n)) : String(n);
}

function emptyToNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s === '—' || s === '–' || s === '-') return null;
  return s;
}

function parseDate(v) {
  if (v === null || v === undefined || v === '' || v === '—') return null;
  if (v instanceof Date && !isNaN(v)) {
    return v.toISOString().slice(0, 19).replace('T', ' ');
  }
  const s = String(v).trim();
  // 13:24 19/07/2026 or 16:26:48 20/7/2026
  let m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, hh, mm, ss, d, mo, y] = m;
    return `${y}-${pad(mo)}-${pad(d)} ${pad(hh)}:${pad(mm)}:${pad(ss || '0')}`;
  }
  // 19/7/2026 or 29/5/2023
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${pad(mo)}-${pad(d)} 00:00:00`;
  }
  // 22/6/2026
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m) {
    const [, d, mo, y2] = m;
    const y = Number(y2) < 50 ? `20${pad(y2)}` : `19${pad(y2)}`;
    return `${y}-${pad(mo)}-${pad(d)} 00:00:00`;
  }
  return null;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function readSheet(filename) {
  const p = path.join(DOWNLOADS, filename);
  if (!fs.existsSync(p)) throw new Error('Missing file: ' + p);
  const wb = XLSX.readFile(p, { cellDates: true });
  const sn = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: null, raw: false });
  return rows;
}

function jsonSql(obj) {
  return sqlStr(JSON.stringify(obj));
}

/**
 * Emit idempotent ALTER TABLE guards so import works on DBs missing extract columns
 * (notably inventory_products.refer_code after partial/gated migrations).
 */
function writeSchemaGuards(write) {
  write('-- ============================================================');
  write('-- Schema guards (idempotent): ensure columns this import needs');
  write('-- Fixes local DBs missing inventory_products.refer_code etc.');
  write('-- ============================================================');
  write('SET @__ls_db := DATABASE();');
  write('');

  const columns = [
    // inventory_products (import lines)
    ['inventory_products', 'inventory_voucher_mongo_id', "VARCHAR(24) NULL"],
    ['inventory_products', 'branch_id', 'BIGINT UNSIGNED NULL'],
    ['inventory_products', 'product_id', 'BIGINT UNSIGNED NULL'],
    ['inventory_products', 'qty', 'DECIMAL(18,3) NULL'],
    ['inventory_products', 'unit_price', 'DECIMAL(18,2) NULL'],
    ['inventory_products', 'refer_code', 'VARCHAR(255) NULL'],
    // inventory_vouchers
    ['inventory_vouchers', 'warehouse_mongo_id', 'VARCHAR(24) NULL'],
    ['inventory_vouchers', 'branch_id', 'BIGINT UNSIGNED NULL'],
    ['inventory_vouchers', 'import_export_type', 'VARCHAR(255) NULL'],
    ['inventory_vouchers', 'voucher_code', 'VARCHAR(255) NULL'],
    ['inventory_vouchers', 'product_id', 'BIGINT UNSIGNED NULL'],
    ['inventory_vouchers', 'qty', 'DECIMAL(18,3) NULL'],
    ['inventory_vouchers', 'unit_price', 'DECIMAL(18,2) NULL'],
    ['inventory_vouchers', 'refer_code', 'VARCHAR(255) NULL'],
    ['inventory_vouchers', 'total_amount', 'DECIMAL(18,2) NULL'],
    // sale_payments
    ['sale_payments', 'sale_channel_id', 'VARCHAR(24) NULL'],
    ['sale_payments', 'customer_id', 'BIGINT UNSIGNED NULL'],
    ['sale_payments', 'branch_id', 'BIGINT UNSIGNED NULL'],
    ['sale_payments', 'amount_products', 'DECIMAL(18,3) NULL'],
    ['sale_payments', 'total_cost', 'DECIMAL(18,2) NULL'],
    ['sale_payments', 'discount_value', 'DECIMAL(18,2) NULL'],
    ['sale_payments', 'discount_type', 'VARCHAR(255) NULL'],
    ['sale_payments', 'tendered_value', 'DECIMAL(18,2) NULL'],
    ['sale_payments', 'settlement_value', 'DECIMAL(18,2) NULL'],
    ['sale_payments', 'is_delivery', 'TINYINT(1) NOT NULL DEFAULT 0'],
    ['sale_payments', 'is_cod', 'TINYINT(1) NOT NULL DEFAULT 0'],
    // product_edit_logs
    ['product_edit_logs', 'product_id', 'BIGINT UNSIGNED NULL'],
    ['product_edit_logs', 'branch_id', 'BIGINT UNSIGNED NULL'],
    ['product_edit_logs', 'field_name', 'VARCHAR(255) NULL'],
    ['product_edit_logs', 'old_value', 'TEXT NULL'],
    ['product_edit_logs', 'new_value', 'TEXT NULL'],
    ['product_edit_logs', 'product_code', 'VARCHAR(255) NULL'],
    ['product_edit_logs', 'product_name', 'VARCHAR(255) NULL'],
    // warehouse_transfers
    ['warehouse_transfers', 'from_branch_id', 'BIGINT UNSIGNED NULL'],
    ['warehouse_transfers', 'to_branch_id', 'BIGINT UNSIGNED NULL'],
    ['warehouse_transfers', 'date_send', 'DATE NULL'],
    ['warehouse_transfers', 'date_take', 'DATE NULL'],
    // customer_cares
    ['customer_cares', 'branch_id', 'BIGINT UNSIGNED NULL'],
    ['customer_cares', 'details', 'TEXT NULL'],
    ['customer_cares', 'reason', 'TEXT NULL'],
    ['customer_cares', 'description', 'TEXT NULL'],
    ['customer_cares', 'creator', 'VARCHAR(255) NULL'],
    ['customer_cares', 'customer_name', 'VARCHAR(255) NULL'],
  ];

  for (const [table, column, ddl] of columns) {
    write(`-- ensure ${table}.${column}`);
    write(`SET @__ls_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @__ls_db AND TABLE_NAME = '${table}' AND COLUMN_NAME = '${column}');`);
    write(`SET @__ls_sql := IF(@__ls_exists = 0, 'ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}', 'DO 0');`);
    write('PREPARE __ls_stmt FROM @__ls_sql;');
    write('EXECUTE __ls_stmt;');
    write('DEALLOCATE PREPARE __ls_stmt;');
    write('');
  }

  write('-- End schema guards');
}

function main() {
  const report = [];
  const warnings = [];
  const w = fs.createWriteStream(OUT_SQL, { encoding: 'utf8' });

  const write = (s) => w.write(s + '\n');

  write('-- LadyStars full import from Excel exports');
  write('-- Generated: ' + new Date().toISOString());
  write('-- Source: user Downloads Excel files only + fixed branches + admin + payment methods catalog');
  write('SET NAMES utf8mb4;');
  write('SET FOREIGN_KEY_CHECKS=0;');
  write('SET UNIQUE_CHECKS=0;');
  write('SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";');
  write('');
  writeSchemaGuards(write);
  write('');

  // Truncate business tables (keep migrations)
  const truncate = [
    'inventory_check_products', 'inventory_checks', 'transfer_audit_logs', 'warehouse_transfers',
    'inventory_products', 'inventory_vouchers', 'inventory_stock_movements',
    'product_refunds', 'sale_payments', 'product_edit_logs', 'product_logs', 'customer_cares',
    'product_branch_stocks', 'products', 'customer_customer_group', 'customers', 'customer_groups',
    'categories', 'trademarks', 'shelves', 'user_warehouse_assignments', 'branches',
    'sale_channels', 'payment_methods', 'vendors', 'audit_logs', 'menu_items', 'permissions', 'roles',
    'store_settings', 'sessions', 'password_reset_tokens', 'cache', 'cache_locks', 'jobs', 'job_batches', 'failed_jobs',
    'users',
  ];
  for (const t of truncate) {
    write(`TRUNCATE TABLE \`${t}\`;`);
  }
  write('');

  // ---- Branches: user requested HN + HCM; also create any other warehouse names that appear in Excel (not invented)
  const branchHn = { id: 1, mongo_id: mid(), name: 'Kho Hà Nội', code: 'HN' };
  const branchHcm = { id: 2, mongo_id: mid(), name: 'Kho HCM', code: 'HCM' };
  const branchLuxy = { id: 3, mongo_id: mid(), name: 'Kho LUXY', code: 'LUXY' };
  const branchById = { 1: branchHn, 2: branchHcm, 3: branchLuxy };
  write('-- Branches (HN, HCM from request; LUXY present in Xuất nhập kho Excel)');
  write(`INSERT INTO branches (id, mongo_id, name, code, phone, address, is_active, created_at, updated_at) VALUES
(1, '${branchHn.mongo_id}', 'Kho Hà Nội', 'HN', NULL, NULL, 1, NOW(), NOW()),
(2, '${branchHcm.mongo_id}', 'Kho HCM', 'HCM', NULL, NULL, 1, NOW(), NOW()),
(3, '${branchLuxy.mongo_id}', 'Kho LUXY', 'LUXY', NULL, NULL, 1, NOW(), NOW());`);
  write('ALTER TABLE branches AUTO_INCREMENT=4;');
  write('');

  // ---- Admin (credentials only from env — never hardcoded)
  if (!ADMIN_EMAIL || !ADMIN_BCRYPT) {
    write('-- Admin user SKIPPED: set ADMIN_EMAIL and ADMIN_PASSWORD_BCRYPT before generating SQL.');
    write('-- Create admin after import, e.g. php artisan tinker → User::create([...]) with a strong password.');
    write('ALTER TABLE users AUTO_INCREMENT=1;');
    warnings.push('admin user not inserted (missing ADMIN_EMAIL / ADMIN_PASSWORD_BCRYPT env)');
  } else if (!ADMIN_BCRYPT.startsWith('$2y$') && !ADMIN_BCRYPT.startsWith('$2a$') && !ADMIN_BCRYPT.startsWith('$2b$')) {
    throw new Error('ADMIN_PASSWORD_BCRYPT must be a bcrypt hash (starts with $2y$ / $2a$ / $2b$), not plaintext');
  } else {
    write('-- Admin only (email/password from env at generation time; password not written in plaintext)');
    write(`INSERT INTO users (id, mongo_id, name, email, password, role, status, branch_id, default_warehouse_id, token_version, is_root_owner, is_active, created_at, updated_at) VALUES
(1, '${mid()}', ${sqlStr(ADMIN_NAME)}, ${sqlStr(ADMIN_EMAIL)}, ${sqlStr(ADMIN_BCRYPT)}, 'ADMIN', 'ACTIVE', 1, 1, 0, 1, 1, NOW(), NOW());`);
    write('ALTER TABLE users AUTO_INCREMENT=2;');
  }
  write('');

  // ---- Payment methods (catalog used by app forms)
  write('-- Payment methods catalog');
  const pms = [
    ['cash', 'Tiền mặt', 1],
    ['bank_transfer', 'Chuyển khoản', 2],
    ['installment', 'Trả góp', 3],
  ];
  let pmId = 1;
  for (const [code, name, sort] of pms) {
    const mongo = mid();
    const payload = { code, name, isActive: true, sortOrder: sort };
    write(`INSERT INTO payment_methods (id, mongo_id, code, name, status, business_date, payload, created_at, updated_at) VALUES
(${pmId}, '${mongo}', ${sqlStr(code)}, ${sqlStr(name)}, 'active', NOW(), ${jsonSql(payload)}, NOW(), NOW());`);
    pmId++;
  }
  write(`ALTER TABLE payment_methods AUTO_INCREMENT=${pmId};`);
  write('');

  // ---- Sale channel: URL /sales-channels/store/* uses channel slug "store"
  write('-- Sale channel (store) — matches FE /sales-channels/store/retail|refund');
  const chMongo = mid();
  write(`INSERT INTO sale_channels (id, mongo_id, code, name, status, payload, created_at, updated_at) VALUES
(1, '${chMongo}', 'store', 'Cửa hàng', 'active', ${jsonSql({ code: 'store', name: 'Cửa hàng', isActive: true })}, NOW(), NOW());`);
  write('ALTER TABLE sale_channels AUTO_INCREMENT=2;');
  write('');

  // ---- Store settings
  write(`INSERT INTO store_settings (id, mongo_id, code, name, status, payload, created_at, updated_at) VALUES
(1, '${mid()}', 'default', 'LadyStars', 'active', ${jsonSql({ shopName: 'LadyStars' })}, NOW(), NOW());`);
  write('ALTER TABLE store_settings AUTO_INCREMENT=2;');
  write('');

  // ========== CATEGORIES ==========
  const catRows = readSheet(FILES.categories);
  const catByName = new Map();
  const catByCode = new Map();
  let catId = 1;
  write('-- Categories');
  for (const r of catRows) {
    const name = emptyToNull(r['Tên danh mục']);
    if (!name) continue;
    const code = emptyToNull(r['Mã danh mục']) || name;
    const key = name.toLowerCase();
    if (catByName.has(key)) continue;
    const active = String(r['Trạng thái'] || '').includes('hoạt động') || String(r['Trạng thái'] || '') === 'Đang hoạt động';
    const isActive = active || String(r['Trạng thái'] || '').toLowerCase() === 'active' ? 1 : 1;
    // default active unless explicitly inactive
    const inactive = /ngưng|inactive|không/i.test(String(r['Trạng thái'] || ''));
    const productCount = Number(sqlNum(r['Số sản phẩm'], true)) || 0;
    const created = parseDate(r['Ngày tạo']);
    const mongo = mid();
    write(`INSERT INTO categories (id, mongo_id, external_id, name, code, parent_id, user_id, is_active, is_visible, product_count, url, created_at, updated_at) VALUES
(${catId}, '${mongo}', ${sqlStr(code)}, ${sqlStr(name)}, ${sqlStr(code)}, NULL, 1, ${inactive ? 0 : 1}, 1, ${productCount}, NULL, ${created ? sqlStr(created) : 'NOW()'}, ${created ? sqlStr(created) : 'NOW()'});`);
    catByName.set(key, catId);
    catByCode.set(String(code).toLowerCase(), catId);
    catId++;
  }
  write(`ALTER TABLE categories AUTO_INCREMENT=${catId};`);
  write('');
  report.push(`categories: ${catId - 1} (from ${catRows.length} excel rows)`);

  // ========== PRODUCTS ==========
  const productRows = readSheet(FILES.products);
  const stockRows = readSheet(FILES.stock);
  const stockByCode = new Map();
  for (const r of stockRows) {
    const code = emptyToNull(r['Mã SP']);
    if (code) stockByCode.set(code, r);
  }

  const productIdByCode = new Map();
  const productMongoByCode = new Map();
  let productId = 1;
  write('-- Products');
  for (const r of productRows) {
    const code = emptyToNull(r['Mã SP']);
    if (!code) continue;
    if (productIdByCode.has(code)) {
      warnings.push(`duplicate product code skipped: ${code}`);
      continue;
    }
    const name = emptyToNull(r['Tên sản phẩm']) || code;
    const barcode = emptyToNull(r['Mã vạch']);
    const catName = emptyToNull(r['Danh mục']);
    let categoryId = 'NULL';
    if (catName) {
      const id = catByName.get(catName.toLowerCase()) || catByCode.get(catName.toLowerCase());
      if (id) categoryId = String(id);
      else warnings.push(`product category not found: ${catName} (SP ${code})`);
    }
    const supplier = emptyToNull(r['Nhà cung cấp']);
    const unit = emptyToNull(r['Đơn vị']);
    const cost = sqlNum(r['Giá vốn']);
    const price = sqlNum(r['Giá bán']);
    const wholesale = sqlNum(r['Giá sỉ']);
    const totalStock = sqlNum(r['Tổng tồn']);
    const status = emptyToNull(r['Trạng thái']) || 'Mới';
    const created = parseDate(r['Ngày tạo']);
    const mongo = mid();
    productIdByCode.set(code, productId);
    productMongoByCode.set(code, mongo);

    // Prefer stock file totals if present
    const st = stockRows.length ? stockByCode.get(code) : null;
    const qty = st ? sqlNum(st['Tổng tồn']) : totalStock;
    const costFinal = st && emptyToNull(st['Giá nhập (Vốn)']) != null ? sqlNum(st['Giá nhập (Vốn)']) : cost;
    const priceFinal = st && emptyToNull(st['Giá bán']) != null ? sqlNum(st['Giá bán']) : price;

    write(`INSERT INTO products (id, mongo_id, external_id, name, code, category_id, trademark_id, shelf_id, cost, price, wholesale_price, clearance_price, clearance_active, qty, weight, weight_type, allows_sale, unit, min_quantity, max_quantity, type, description, note, units, elements, user_id, status, category_name, trademark_name, supplier_name, origin, color, size, barcode, parent_code, parent_name, extra, created_at, updated_at) VALUES
(${productId}, '${mongo}', NULL, ${sqlStr(name)}, ${sqlStr(code)}, ${categoryId}, NULL, NULL, ${costFinal}, ${priceFinal}, ${wholesale}, 0, 0, ${qty === 'NULL' ? '0' : qty}, NULL, 'gram', 1, ${sqlStr(unit)}, 0, 999999999, 'product', NULL, NULL, NULL, NULL, 1, ${sqlStr(status)}, ${sqlStr(catName)}, NULL, ${sqlStr(supplier)}, NULL, NULL, NULL, ${sqlStr(barcode)}, NULL, NULL, NULL, ${created ? sqlStr(created) : 'NOW()'}, ${created ? sqlStr(created) : 'NOW()'});`);
    productId++;
  }
  write(`ALTER TABLE products AUTO_INCREMENT=${productId};`);
  write('');
  report.push(`products: ${productId - 1} (from ${productRows.length} excel rows)`);

  // ========== STOCKS ==========
  write('-- Product branch stocks');
  let stockId = 1;
  let stockLines = 0;
  for (const [code, r] of stockByCode) {
    const pid = productIdByCode.get(code);
    if (!pid) {
      warnings.push(`stock without product: ${code}`);
      continue;
    }
    const hcm = Number(sqlNum(r['Kho HCM'])) || 0;
    const hn = Number(sqlNum(r['Kho Hà Nội'])) || 0;
    // always insert both warehouses to preserve zeros from file
    for (const [bid, qty] of [[1, hn], [2, hcm]]) {
      write(`INSERT INTO product_branch_stocks (id, mongo_id, product_id, branch_id, qty, locked_quantity, min_quantity, max_quantity, created_at, updated_at) VALUES
(${stockId}, '${mid()}', ${pid}, ${bid}, ${qty}, 0, 0, 999999999, NOW(), NOW());`);
      stockId++;
      stockLines++;
    }
  }
  write(`ALTER TABLE product_branch_stocks AUTO_INCREMENT=${stockId};`);
  write('');
  report.push(`product_branch_stocks: ${stockLines} lines (2 per product in stock file with match)`);

  // ========== CUSTOMERS ==========
  const custRows = readSheet(FILES.customers);
  const custIdByPhone = new Map();
  const custIdByCode = new Map();
  const groupByName = new Map();
  let groupId = 1;
  let custId = 1;
  write('-- Customer groups + customers');
  for (const r of custRows) {
    const g = emptyToNull(r['Nhóm']);
    if (g && !groupByName.has(g.toLowerCase())) {
      write(`INSERT INTO customer_groups (id, mongo_id, name, type, note, user_id, created_at, updated_at) VALUES
(${groupId}, '${mid()}', ${sqlStr(g)}, '1', NULL, 1, NOW(), NOW());`);
      groupByName.set(g.toLowerCase(), groupId);
      groupId++;
    }
  }
  if (groupId > 1) write(`ALTER TABLE customer_groups AUTO_INCREMENT=${groupId};`);

  for (const r of custRows) {
    const code = emptyToNull(r['Mã khách']);
    const phone = emptyToNull(r['SĐT']);
    const name = emptyToNull(r['Tên khách hàng']) || code || phone || 'Khách';
    if (!code && !phone) {
      warnings.push('customer row without code/phone skipped');
      continue;
    }
    // dedupe phone first
    if (phone && custIdByPhone.has(phone)) {
      warnings.push(`duplicate customer phone skipped: ${phone}`);
      continue;
    }
    if (code && custIdByCode.has(code)) {
      warnings.push(`duplicate customer code skipped: ${code}`);
      continue;
    }
    const typeRaw = emptyToNull(r['Loại']) || 'Cá nhân';
    const type = /công ty|company/i.test(typeRaw) ? 'company' : 'person';
    const email = emptyToNull(r['Email']);
    const card = emptyToNull(r['Mã thẻ']);
    const level = emptyToNull(r['Cấp độ']);
    const birthday = parseDate(r['Sinh nhật']);
    const totalSpent = sqlNum(r['Tổng chi']);
    const points = sqlNum(r['Điểm'], true);
    const purchaseCount = sqlNum(r['Số lần mua'], true);
    const purchaseQty = sqlNum(r['SL sản phẩm đã mua']);
    const firstBuy = parseDate(r['Ngày mua đầu']);
    const lastBuy = parseDate(r['Ngày mua gần nhất']);
    const daysSince = sqlNum(r['Số ngày chưa mua'], true);
    const cycle = emptyToNull(r['Chu kỳ mua (ngày)']);
    const cycleDays = cycle && !/chưa/i.test(cycle) ? sqlNum(cycle, true) : 'NULL';
    const statusRaw = (emptyToNull(r['Trạng thái']) || 'active').toLowerCase();
    const status = statusRaw.includes('inactive') || statusRaw.includes('ngưng') ? 'inactive' : 'active';
    const address = emptyToNull(r['Địa chỉ']);
    const note = emptyToNull(r['Ghi chú']);
    const created = parseDate(r['Ngày tạo']);
    const mongo = mid();

    write(`INSERT INTO customers (id, mongo_id, type, name, code, phone, phone2, card_id, email, birthday, sex, customer_level, address, address_location, province_id, district_id, ward_id, company, vat, facebook, note, total_spent, purchase_count, purchase_product_quantity, points, first_purchase_date, last_purchase_date, days_since_last_purchase, purchase_cycle_days, tags, status, branch_id, user_id, created_at, updated_at) VALUES
(${custId}, '${mongo}', '${type}', ${sqlStr(name)}, ${sqlStr(code)}, ${sqlStr(phone)}, NULL, ${sqlStr(card)}, ${sqlStr(email)}, ${birthday ? sqlStr(birthday.slice(0, 10)) : 'NULL'}, 'female', ${sqlStr(level)}, ${sqlStr(address)}, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ${sqlStr(note)}, ${totalSpent === 'NULL' ? '0' : totalSpent}, ${purchaseCount === 'NULL' ? '0' : purchaseCount}, ${purchaseQty === 'NULL' ? '0' : purchaseQty}, ${points === 'NULL' ? '0' : points}, ${firstBuy ? sqlStr(firstBuy) : 'NULL'}, ${lastBuy ? sqlStr(lastBuy) : 'NULL'}, ${daysSince}, ${cycleDays}, NULL, '${status}', 1, 1, ${created ? sqlStr(created) : 'NOW()'}, ${created ? sqlStr(created) : 'NOW()'});`);

    if (phone) custIdByPhone.set(phone, custId);
    if (code) custIdByCode.set(code, custId);

    const g = emptyToNull(r['Nhóm']);
    if (g && groupByName.has(g.toLowerCase())) {
      const gid = groupByName.get(g.toLowerCase());
      write(`INSERT INTO customer_customer_group (customer_id, customer_group_id, created_at, updated_at) VALUES (${custId}, ${gid}, NOW(), NOW());`);
    }
    custId++;
  }
  write(`ALTER TABLE customers AUTO_INCREMENT=${custId};`);
  write('');
  report.push(`customers: ${custId - 1} (from ${custRows.length} excel rows)`);
  report.push(`customer_groups: ${groupId - 1}`);

  function resolveCustomerId(name, phone) {
    const p = emptyToNull(phone);
    if (p && custIdByPhone.has(p)) return custIdByPhone.get(p);
    return null;
  }

  function resolveBranchId(name) {
    if (!name) return null;
    const s = String(name).trim();
    // Transfer-style labels: use SOURCE warehouse as branch_id
    if (s.includes('→')) {
      const from = s.split('→')[0].trim();
      return resolveBranchId(from);
    }
    if (/LUXY/i.test(s)) return 3;
    if (/Kho\s*Hà\s*Nội|Ha\s*Noi/i.test(s)) return 1;
    if (/Kho\s*HCM|Hồ\s*Chí\s*Minh/i.test(s)) return 2;
    if (/Hà\s*Nội/i.test(s) && !/HCM/i.test(s)) return 1;
    if (/HCM/i.test(s)) return 2;
    // Placeholder text in export — no real warehouse; keep NULL
    if (/Kho nguồn/i.test(s)) return null;
    return null;
  }

  function branchMongo(id) {
    if (!id || !branchById[id]) return null;
    return branchById[id].mongo_id;
  }

  // Preload voucher lines for enriching sale items with product codes (same ID phiếu = mã HĐ)
  const voucherLineRowsEarly = readSheet(FILES.voucherLines);
  const invLinesByVoucher = new Map();
  for (const r of voucherLineRowsEarly) {
    const id = emptyToNull(r['ID phiếu']);
    if (!id) continue;
    if (!invLinesByVoucher.has(id)) invLinesByVoucher.set(id, []);
    invLinesByVoucher.get(id).push(r);
  }

  // ========== RETAIL SALES (group by invoice) ==========
  const retailRows = readSheet(FILES.retail);
  const salesByCode = new Map();
  for (const r of retailRows) {
    const code = emptyToNull(r['Mã hóa đơn']);
    if (!code) continue;
    if (!salesByCode.has(code)) salesByCode.set(code, []);
    salesByCode.get(code).push(r);
  }
  write('-- Sale payments (retail)');
  let saleId = 1;
  const saleMongoByCode = new Map();
  const saleItemsByCode = new Map();
  for (const [code, lines] of salesByCode) {
    const first = lines[0];
    const items = [];
    const invLines = invLinesByVoucher.get(code) || [];
    let invIdx = 0;
    for (const line of lines) {
      const prodName = emptyToNull(line['Sản phẩm']);
      const qty = Number(sqlNum(line['Số SP'])) || 0;
      const value = Number(sqlNum(line['Giá trị hàng hóa'])) || 0;
      const unitPrice = qty > 0 ? value / qty : value;
      // Prefer matching inventory line (same invoice id + product name or order)
      let productCode = null;
      const byName = invLines.find((il) => emptyToNull(il['Sản phẩm']) === prodName);
      const pick = byName || invLines[invIdx];
      if (pick) {
        productCode = emptyToNull(pick['Mã sản phẩm']);
        invIdx++;
      }
      items.push({
        name: prodName,
        amount: qty,
        price: unitPrice,
        value,
        productCode,
        productId: productCode && productIdByCode.has(productCode) ? productIdByCode.get(productCode) : null,
      });
    }
    const businessDate = parseDate(first['Ngày tạo']);
    const customerName = emptyToNull(first['Khách hàng']);
    const customerPhone = emptyToNull(first['SĐT khách']);
    const customerId = resolveCustomerId(customerName, customerPhone);
    const total = sqlNum(first['Tổng tiền']);
    const discount = sqlNum(first['Giảm giá']);
    const discountPct = emptyToNull(first['% chiết khấu']);
    const paid = sqlNum(first['Đã thanh toán']);
    const payMethod = emptyToNull(first['Phương thức thanh toán']);
    const statusRaw = emptyToNull(first['Trạng thái']) || '';
    const status = /hoàn tất|completed|xong/i.test(statusRaw) ? 'completed' : statusRaw.toLowerCase() || 'completed';
    const creator = emptyToNull(first['Người tạo']);
    const amountProducts = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const mongo = mid();
    saleMongoByCode.set(code, mongo);
    const lineItems = items.map((i) => ({
      name: i.name,
      amount: i.amount,
      price: i.price,
      value: i.value,
      productCode: i.productCode,
      productId: i.productId,
    }));
    saleItemsByCode.set(code, lineItems);

    // Infer branch from matching inventory voucher same code if any - fill later default HN
    let branchId = 1;
    const payload = {
      code,
      customerName,
      customerPhone,
      items: lineItems,
      totalAmount: Number(total) || 0,
      discount: Number(discount) || 0,
      discountPercent: discountPct,
      valuePayment: Number(paid !== 'NULL' ? paid : total) || 0,
      paymentMethod: payMethod,
      status,
      creator,
      // FE lists retail at /sales-channels/store/retail with query channel=store
      channel: 'store',
      orderSource: 'store',
      saleChannel: 'store',
      createdAt: businessDate,
    };

    // Write both payload.items and column items so dashboard/storage lastSold work without fallback.
    write(`INSERT INTO sale_payments (id, mongo_id, code, name, status, type, amount, value, total, branch_mongo_id, customer_mongo_id, product_mongo_id, user_mongo_id, business_date, payload, items, value_payment, refunded_value, refund_status, completed_at, sale_channel_id, customer_id, branch_id, amount_products, total_cost, discount_value, discount_type, tendered_value, settlement_value, is_delivery, is_cod, created_at, updated_at) VALUES
(${saleId}, '${mongo}', ${sqlStr(code)}, NULL, ${sqlStr(status)}, 'retail', ${amountProducts}, ${total}, ${total}, '${branchHn.mongo_id}', NULL, NULL, NULL, ${businessDate ? sqlStr(businessDate) : 'NULL'}, ${jsonSql(payload)}, ${jsonSql(lineItems)}, ${paid === 'NULL' ? total : paid}, 0, 'none', ${businessDate && status === 'completed' ? sqlStr(businessDate) : 'NULL'}, '${chMongo}', ${customerId || 'NULL'}, ${branchId}, ${amountProducts}, NULL, ${discount}, ${discountPct ? sqlStr('%') : 'NULL'}, ${paid === 'NULL' ? total : paid}, ${paid === 'NULL' ? total : paid}, 0, 0, ${businessDate ? sqlStr(businessDate) : 'NOW()'}, ${businessDate ? sqlStr(businessDate) : 'NOW()'});`);
    saleId++;
  }
  write(`ALTER TABLE sale_payments AUTO_INCREMENT=${saleId};`);
  write('');
  report.push(`sale_payments: ${saleId - 1} invoices from ${retailRows.length} line rows`);

  // ========== REFUNDS ==========
  const refundRows = readSheet(FILES.refunds);
  write('-- Product refunds');
  let refundId = 1;
  for (const r of refundRows) {
    const code = emptyToNull(r['Mã trả hàng']);
    if (!code) continue;
    const orig = emptyToNull(r['Hóa đơn gốc']);
    const customerName = emptyToNull(r['Khách hàng']);
    const qty = sqlNum(r['Số lượng']);
    const money = sqlNum(r['Tiền trả khách']);
    const status = emptyToNull(r['Trạng thái']) || 'completed';
    const businessDate = parseDate(r['Ngày']);
    const paymentMongo = orig && saleMongoByCode.has(orig) ? saleMongoByCode.get(orig) : null;
    const mongo = mid();
    const refundQty = Number(qty) || 0;
    const refundMoney = Number(money) || 0;
    // Excel refund is invoice-level only — derive line items from original sale when possible.
    const origItems = orig && saleItemsByCode.has(orig) ? saleItemsByCode.get(orig) : [];
    let refundItems = [];
    if (origItems.length === 1) {
      const src = origItems[0];
      refundItems = [{
        name: src.name,
        amount: refundQty || src.amount,
        price: refundQty > 0 ? refundMoney / refundQty : (src.price || 0),
        value: refundMoney,
        productCode: src.productCode,
        productId: src.productId,
      }];
    } else if (origItems.length > 1) {
      const totalOrigQty = origItems.reduce((s, i) => s + (Number(i.amount) || 0), 0);
      if (totalOrigQty > 0 && refundQty > 0 && refundQty === totalOrigQty) {
        refundItems = origItems.map((src) => ({
          name: src.name,
          amount: src.amount,
          price: src.price,
          value: src.value,
          productCode: src.productCode,
          productId: src.productId,
        }));
      } else if (refundQty > 0) {
        // Partial multi-line: attach full refund qty/value to first identifiable line (best effort).
        const src = origItems.find((i) => i.productId || i.productCode) || origItems[0];
        refundItems = [{
          name: src.name,
          amount: refundQty,
          price: refundQty > 0 ? refundMoney / refundQty : 0,
          value: refundMoney,
          productCode: src.productCode,
          productId: src.productId,
        }];
      }
    }
    const payload = {
      code,
      originalInvoiceCode: orig,
      customerName,
      quantity: refundQty,
      refundAmount: refundMoney,
      status,
      items: refundItems,
      // FE refund list filters strictly by channel=store
      channel: 'store',
      orderSource: 'store',
      saleChannel: 'store',
    };
    write(`INSERT INTO product_refunds (id, mongo_id, code, name, status, type, amount, value, total, branch_mongo_id, customer_mongo_id, product_mongo_id, user_mongo_id, business_date, payload, items, payment_mongo_id, refund_fee, completed_at, created_at, updated_at) VALUES
(${refundId}, '${mongo}', ${sqlStr(code)}, NULL, ${sqlStr(status)}, 'refund', ${qty}, ${money}, ${money}, '${branchHn.mongo_id}', NULL, NULL, NULL, ${businessDate ? sqlStr(businessDate) : 'NULL'}, ${jsonSql(payload)}, ${jsonSql(refundItems)}, ${paymentMongo ? sqlStr(paymentMongo) : 'NULL'}, 0, ${businessDate ? sqlStr(businessDate) : 'NULL'}, ${businessDate ? sqlStr(businessDate) : 'NOW()'}, ${businessDate ? sqlStr(businessDate) : 'NOW()'});`);
    refundId++;
  }
  write(`ALTER TABLE product_refunds AUTO_INCREMENT=${refundId};`);
  write('');
  report.push(`product_refunds: ${refundId - 1}`);

  // ========== CUSTOMER CARES ==========
  const careRows = readSheet(FILES.cares);
  write('-- Customer cares');
  let careId = 1;
  for (const r of careRows) {
    const code = emptyToNull(r['ID Phiếu']);
    const custCode = emptyToNull(r['Mã KH']);
    const custName = emptyToNull(r['Tên KH']);
    const phone = emptyToNull(r['SĐT']);
    const details = emptyToNull(r['Chi tiết']);
    const reason = emptyToNull(r['Lý do']);
    const description = emptyToNull(r['Mô tả']);
    const creator = emptyToNull(r['Người tạo']);
    const created = parseDate(r['Ngày tạo']) || parseDate(r['Ngày lưu']);
    const customerId = resolveCustomerId(custName, phone);
    const mongo = mid();
    const payload = { code, customerCode: custCode, customerName: custName, customerPhone: phone, details, reason, description, creator };
    write(`INSERT INTO customer_cares (id, mongo_id, code, name, status, type, amount, value, total, branch_mongo_id, customer_mongo_id, product_mongo_id, user_mongo_id, business_date, payload, customer_code, customer_phone, record_date, branch_id, details, reason, description, creator, customer_name, created_at, updated_at) VALUES
(${careId}, '${mongo}', ${sqlStr(code)}, NULL, 'completed', 'care', NULL, NULL, NULL, '${branchHn.mongo_id}', NULL, NULL, NULL, ${created ? sqlStr(created) : 'NULL'}, ${jsonSql(payload)}, ${sqlStr(custCode)}, ${sqlStr(phone)}, ${created ? sqlStr(created) : 'NULL'}, 1, ${sqlStr(details)}, ${sqlStr(reason)}, ${sqlStr(description)}, ${sqlStr(creator)}, ${sqlStr(custName)}, ${created ? sqlStr(created) : 'NOW()'}, ${created ? sqlStr(created) : 'NOW()'});`);
    careId++;
  }
  write(`ALTER TABLE customer_cares AUTO_INCREMENT=${careId};`);
  write('');
  report.push(`customer_cares: ${careId - 1}`);

  // ========== INVENTORY VOUCHERS ==========
  const voucherRows = readSheet(FILES.vouchers);
  const voucherLineRows = voucherLineRowsEarly;
  const linesByVoucher = invLinesByVoucher;

  write('-- Inventory vouchers');
  let voucherId = 1;
  // originalCode -> list of { mongo, uniqueCode, typeRaw }
  const voucherMetaByOriginal = new Map();
  const usedVoucherCodes = new Set();
  for (const r of voucherRows) {
    const originalCode = emptyToNull(r['ID phiếu']);
    if (!originalCode) continue;
    const businessDate = parseDate(r['Ngày']);
    const warehouse = emptyToNull(r['Kho hàng']);
    let branchId = resolveBranchId(warehouse);
    if (branchId === null && warehouse) {
      warnings.push(`unknown warehouse kept with NULL branch_id: ${warehouse} (voucher ${originalCode})`);
    }
    const bMongo = branchMongo(branchId);
    const spCount = sqlNum(r['Số sản phẩm'], true);
    const qty = sqlNum(r['Số lượng']);
    const total = sqlNum(r['Tổng tiền']);
    const typeRaw = emptyToNull(r['Loại giao dịch']) || '';
    let type = 'OTHER';
    let importExport = typeRaw;
    if (/Xuất/i.test(typeRaw)) type = 'EXPORT';
    else if (/Nhập|trả hàng/i.test(typeRaw)) type = 'IMPORT';
    else if (/Chuyển/i.test(typeRaw)) type = 'TRANSFER';
    const creator = emptyToNull(r['Người tạo']);
    const note = emptyToNull(r['Ghi chú']);
    const mongo = mid();

    // UNIQUE inventory_vouchers.code — keep all rows; suffix when Excel reuses same ID for different types
    let uniqueCode = originalCode;
    let n = 1;
    while (usedVoucherCodes.has(uniqueCode)) {
      n += 1;
      uniqueCode = `${originalCode}#${n}`;
    }
    usedVoucherCodes.add(uniqueCode);
    if (uniqueCode !== originalCode) {
      warnings.push(`duplicate voucher id kept as ${uniqueCode} (type=${typeRaw})`);
    }

    if (!voucherMetaByOriginal.has(originalCode)) voucherMetaByOriginal.set(originalCode, []);
    voucherMetaByOriginal.get(originalCode).push({ mongo, uniqueCode, typeRaw });

    const payload = {
      code: originalCode,
      uniqueCode,
      voucherCode: originalCode,
      warehouseName: warehouse,
      productCount: Number(spCount) || 0,
      qty: Number(qty) || 0,
      totalAmount: Number(total) || 0,
      type: typeRaw,
      importExportType: typeRaw,
      creator,
      note,
    };
    write(`INSERT INTO inventory_vouchers (id, mongo_id, code, name, status, type, amount, value, total, branch_mongo_id, customer_mongo_id, product_mongo_id, user_mongo_id, business_date, payload, warehouse_mongo_id, branch_id, import_export_type, voucher_code, product_id, qty, unit_price, refer_code, total_amount, created_at, updated_at) VALUES
(${voucherId}, '${mongo}', ${sqlStr(uniqueCode)}, NULL, 'completed', ${sqlStr(type)}, ${qty}, ${total}, ${total}, ${bMongo ? sqlStr(bMongo) : 'NULL'}, NULL, NULL, NULL, ${businessDate ? sqlStr(businessDate) : 'NULL'}, ${jsonSql(payload)}, ${bMongo ? sqlStr(bMongo) : 'NULL'}, ${branchId || 'NULL'}, ${sqlStr(importExport)}, ${sqlStr(originalCode)}, NULL, ${qty}, NULL, NULL, ${total}, ${businessDate ? sqlStr(businessDate) : 'NOW()'}, ${businessDate ? sqlStr(businessDate) : 'NOW()'});`);

    // Update sale branch if sale code matches original id and we know warehouse
    if (saleMongoByCode.has(originalCode) && branchId) {
      write(`UPDATE sale_payments SET branch_id=${branchId}, branch_mongo_id=${sqlStr(bMongo)} WHERE code=${sqlStr(originalCode)};`);
    }
    voucherId++;
  }
  write(`ALTER TABLE inventory_vouchers AUTO_INCREMENT=${voucherId};`);
  write('');
  report.push(`inventory_vouchers: ${voucherId - 1}`);

  write('-- Inventory products (lines)');
  let ipId = 1;
  for (const [vcode, lines] of linesByVoucher) {
    let lineSeq = 0;
    for (const r of lines) {
      lineSeq++;
      const pcode = emptyToNull(r['Mã sản phẩm']);
      const pname = emptyToNull(r['Sản phẩm']);
      const barcode = emptyToNull(r['Mã vạch']);
      const qty = sqlNum(r['Số lượng']);
      const price = sqlNum(r['Giá']);
      const total = sqlNum(r['Tổng tiền']);
      const typeRaw = emptyToNull(r['Loại giao dịch']) || '';
      const note = emptyToNull(r['Ghi chú']);
      const businessDate = parseDate(r['Ngày']);
      const warehouse = emptyToNull(r['Kho hàng']);
      let branchId = resolveBranchId(warehouse);
      if (!branchId) branchId = null;
      const pid = pcode && productIdByCode.has(pcode) ? productIdByCode.get(pcode) : null;
      if (pcode && !pid) warnings.push(`inventory line product missing: ${pcode} (voucher ${vcode})`);

      // Link line to voucher with same original ID + matching Loại giao dịch when possible
      const metas = voucherMetaByOriginal.get(vcode) || [];
      let meta = metas.find((m) => m.typeRaw === typeRaw) || metas[0];
      const vMongo = meta ? meta.mongo : mid();
      const uniqueVoucherCode = meta ? meta.uniqueCode : vcode;

      const lineCode = `${uniqueVoucherCode}#${lineSeq}`;
      const mongo = mid();
      const payload = {
        voucherCode: vcode,
        uniqueVoucherCode,
        productCode: pcode,
        productName: pname,
        barcode,
        qty: Number(qty) || 0,
        unitPrice: Number(price) || 0,
        total: Number(total) || 0,
        type: typeRaw,
        note,
      };
      write(`INSERT INTO inventory_products (id, mongo_id, code, name, status, type, amount, value, total, branch_mongo_id, customer_mongo_id, product_mongo_id, user_mongo_id, business_date, payload, inventory_voucher_mongo_id, branch_id, product_id, qty, unit_price, refer_code, created_at, updated_at) VALUES
(${ipId}, '${mongo}', ${sqlStr(lineCode)}, ${sqlStr(pname)}, 'completed', ${sqlStr(typeRaw)}, ${qty}, ${total}, ${total}, NULL, NULL, ${pid && productMongoByCode.get(pcode) ? sqlStr(productMongoByCode.get(pcode)) : 'NULL'}, NULL, ${businessDate ? sqlStr(businessDate) : 'NULL'}, ${jsonSql(payload)}, '${vMongo}', ${branchId || 'NULL'}, ${pid || 'NULL'}, ${qty}, ${price}, ${sqlStr(vcode)}, ${businessDate ? sqlStr(businessDate) : 'NOW()'}, ${businessDate ? sqlStr(businessDate) : 'NOW()'});`);
      ipId++;
    }
  }
  write(`ALTER TABLE inventory_products AUTO_INCREMENT=${ipId};`);
  write('');
  report.push(`inventory_products: ${ipId - 1}`);

  // ========== TRANSFERS ==========
  const transferRows = readSheet(FILES.transfers);
  write('-- Warehouse transfers');
  let trId = 1;
  for (const r of transferRows) {
    const code = emptyToNull(r['Mã phiếu']);
    if (!code) continue;
    const businessDate = parseDate(r['Ngày']);
    const pathStr = emptyToNull(r['Kho nguồn → Kho đích']) || '';
    let fromId = 1;
    let toId = 2;
    const m = pathStr.match(/^(.*?)\s*→\s*(.*)$/);
    if (m) {
      const from = m[1].trim();
      const to = m[2].trim();
      fromId = /HCM/i.test(from) ? 2 : 1;
      toId = /HCM/i.test(to) ? 2 : 1;
      if (/Hà Nội/i.test(from)) fromId = 1;
      if (/Hà Nội/i.test(to)) toId = 1;
    }
    const spCount = sqlNum(r['Số SP'], true);
    const totalQty = sqlNum(r['Tổng SL']);
    const creator = emptyToNull(r['Người tạo']);
    const statusRaw = emptyToNull(r['Trạng thái']) || '';
    let status = 'COMPLETED';
    if (/hoàn thành|completed|xong/i.test(statusRaw)) status = 'COMPLETED';
    else if (/nháp|draft/i.test(statusRaw)) status = 'DRAFT';
    else if (/hủy|cancel/i.test(statusRaw)) status = 'CANCELLED';
    else status = statusRaw || 'COMPLETED';
    const note = emptyToNull(r['Ghi chú']);
    const mongo = mid();
    const payload = {
      code,
      fromWarehouse: pathStr.split('→')[0]?.trim(),
      toWarehouse: pathStr.split('→')[1]?.trim(),
      productCount: Number(spCount) || 0,
      totalQty: Number(totalQty) || 0,
      creator,
      status,
      note,
      lines: [],
    };
    const fromMongo = fromId === 2 ? branchHcm.mongo_id : branchHn.mongo_id;
    const toMongo = toId === 2 ? branchHcm.mongo_id : branchHn.mongo_id;
    write(`INSERT INTO warehouse_transfers (id, mongo_id, code, name, status, type, amount, value, total, branch_mongo_id, customer_mongo_id, product_mongo_id, user_mongo_id, business_date, payload, from_branch_mongo_id, to_branch_mongo_id, from_branch_id, to_branch_id, date_send, date_take, created_at, updated_at) VALUES
(${trId}, '${mongo}', ${sqlStr(code)}, NULL, ${sqlStr(status)}, 'transfer', ${totalQty}, NULL, NULL, NULL, NULL, NULL, NULL, ${businessDate ? sqlStr(businessDate) : 'NULL'}, ${jsonSql(payload)}, '${fromMongo}', '${toMongo}', ${fromId}, ${toId}, ${businessDate ? sqlStr(businessDate.slice(0, 10)) : 'NULL'}, ${businessDate ? sqlStr(businessDate.slice(0, 10)) : 'NULL'}, ${businessDate ? sqlStr(businessDate) : 'NOW()'}, ${businessDate ? sqlStr(businessDate) : 'NOW()'});`);
    trId++;
  }
  write(`ALTER TABLE warehouse_transfers AUTO_INCREMENT=${trId};`);
  write('');
  report.push(`warehouse_transfers: ${trId - 1}`);

  // ========== PRODUCT EDIT LOGS ==========
  const logRows = readSheet(FILES.productLogs);
  write('-- Product edit logs');
  let logId = 1;
  for (const r of logRows) {
    const pcode = emptyToNull(r['Mã SP']);
    const pname = emptyToNull(r['Tên sản phẩm']);
    const logType = emptyToNull(r['Loại log']);
    const logAction = emptyToNull(r['Kiểu log']);
    const actor = emptyToNull(r['Người thao tác']);
    const businessDate = parseDate(r['Thời gian']);
    const pid = pcode && productIdByCode.has(pcode) ? productIdByCode.get(pcode) : null;
    const mongo = mid();
    const code = `PEL-${logId}`;
    const payload = { productCode: pcode, productName: pname, logType, logAction, actor };
    write(`INSERT INTO product_edit_logs (id, mongo_id, code, name, status, type, amount, value, total, branch_mongo_id, customer_mongo_id, product_mongo_id, user_mongo_id, business_date, payload, product_id, branch_id, field_name, old_value, new_value, product_code, product_name, created_at, updated_at) VALUES
(${logId}, '${mongo}', ${sqlStr(code)}, ${sqlStr(logType)}, 'completed', ${sqlStr(logAction)}, NULL, NULL, NULL, NULL, NULL, ${pid && productMongoByCode.get(pcode) ? sqlStr(productMongoByCode.get(pcode)) : 'NULL'}, NULL, ${businessDate ? sqlStr(businessDate) : 'NULL'}, ${jsonSql(payload)}, ${pid || 'NULL'}, NULL, ${sqlStr(logType)}, NULL, ${sqlStr(logAction)}, ${sqlStr(pcode)}, ${sqlStr(pname)}, ${businessDate ? sqlStr(businessDate) : 'NOW()'}, ${businessDate ? sqlStr(businessDate) : 'NOW()'});`);
    logId++;
  }
  write(`ALTER TABLE product_edit_logs AUTO_INCREMENT=${logId};`);
  write('');
  report.push(`product_edit_logs: ${logId - 1}`);

  write('SET UNIQUE_CHECKS=1;');
  write('SET FOREIGN_KEY_CHECKS=1;');
  write('-- END');

  w.end();

  const reportMd = [
    '# LadyStars import report',
    '',
    'Generated: ' + new Date().toISOString(),
    '',
    '## Counts',
    ...report.map((x) => '- ' + x),
    '',
    '## Branches',
    '- id=1 Kho Hà Nội (HN) — theo yêu cầu',
    '- id=2 Kho HCM (HCM) — theo yêu cầu',
    '- id=3 Kho LUXY (LUXY) — **có trong file Xuất nhập kho** (không bịa; 21 phiếu)',
    '',
    '## Admin',
    ADMIN_EMAIL && ADMIN_BCRYPT
      ? '- Admin user inserted from env (ADMIN_EMAIL + ADMIN_PASSWORD_BCRYPT). Plaintext password is never written to SQL/report.'
      : '- Admin user NOT inserted. Set ADMIN_EMAIL + ADMIN_PASSWORD_BCRYPT, or create admin after import.',
    '',
    '## Warnings (' + warnings.length + ')',
    ...warnings.slice(0, 300).map((x) => '- ' + x),
    warnings.length > 300 ? `\n... and ${warnings.length - 300} more` : '',
    '',
    '## Notes',
    '- No wholesale data (empty by request).',
    '- Sale lines: product name only in Bán lẻ; product codes come from inventory line file when invoice id matches.',
    '- Transfer sheet has no line items; headers only from Excel.',
    '- Payment methods + 1 retail sale channel: app catalog (Tiền mặt/CK/Trả góp + Bán lẻ), not business rows from Excel.',
    '- Dedup: 2 product codes, 1 customer phone, 3 category name dups skipped (kept first row).',
    '- Stock file products missing from product list: not inserted as fake products.',
  ].join('\n');

  fs.writeFileSync(OUT_REPORT, reportMd, 'utf8');
  console.log('SQL written:', OUT_SQL);
  console.log('Report written:', OUT_REPORT);
  console.log('Warnings:', warnings.length);
  report.forEach((r) => console.log(' ', r));
}

main();
