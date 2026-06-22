import bcrypt from 'bcryptjs';
import mongoose, { type Model } from 'mongoose';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { connectDatabase } from './config/database.js';
import { User } from './core/auth/user.model.js';
import { Branch } from './core/org/branch.model.js';
import { StoreSetting } from './core/settings/settings.model.js';
import { MenuItem, Permission, Role } from './core/system/system.models.js';
import { AccountingType, ExpensePayment, PayPerson, Receipt } from './modules/accounting/accounting.models.js';
import { Customer, CustomerGroup } from './modules/customer/customer.models.js';
import {
  Category,
  DeliveryPartner,
  PaymentMethod,
  Product,
  ProductBranchStock,
  ProductLog,
  ProductRefund,
  SaleChannel,
  SalePayment,
  Shelf,
  StockAdjustment,
  Trademark,
} from './modules/product/product.models.js';
import { PrintForm } from './modules/printForms/printForms.models.js';
import { Project, Task } from './modules/task/task.models.js';
import { Vendor, VendorGroup, VendorPurchase, VendorRefund, VendorTransfer } from './modules/vendor/vendor.models.js';
import { Order } from './modules/orders/orders.models.js';

function detectSeparator(filePath: string) {
    if (!fs.existsSync(filePath)) return ',';
    const content = fs.readFileSync(filePath, 'utf8');
    const firstLine = content.split('\n')[0] || '';
    const commas = (firstLine.match(/,/g) || []).length;
    const semicolons = (firstLine.match(/;/g) || []).length;
    const tabs = (firstLine.match(/\t/g) || []).length;

    if (semicolons > commas && semicolons > tabs) return ';';
    if (tabs > commas && tabs > semicolons) return '\t';
    return ',';
}

function readCSV(filePath: string): Promise<any[]> {
    const sep = detectSeparator(filePath);
    return new Promise((resolve, reject) => {
        const results: any[] = [];
        if (!fs.existsSync(filePath)) {
            console.log(`❌ LỖI: Không tìm thấy file "${filePath}"!`);
            return resolve([]);
        }
        fs.createReadStream(filePath)
            .pipe(csv({
                separator: sep,
                mapHeaders: ({ header }) => header.replace(/[\uFEFF\u200B"']/g, '').trim()
            }))
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (err) => reject(err));
    });
}

function getFlexVal(row: any, includeKeywords: string | string[], excludeKeywords: string | string[] = []): string | null {
    if (!Array.isArray(includeKeywords)) includeKeywords = [includeKeywords];
    if (!Array.isArray(excludeKeywords)) excludeKeywords = [excludeKeywords];

    const normalizedRowKeys = Object.keys(row).map(k => ({
        original: k,
        norm: k.toLowerCase().trim().normalize('NFC').replace(/[\uFEFF\u200B"']/g, '')
    }));

    const normIncludes = includeKeywords.map(k => k.toLowerCase().trim().normalize('NFC'));
    const normExcludes = excludeKeywords.map(k => k.toLowerCase().trim().normalize('NFC'));

    // 1. ƯU TIÊN 1: Khớp chính xác 100%
    for (const target of normIncludes) {
        const exactMatch = normalizedRowKeys.find(k => k.norm === target);
        if (exactMatch) return row[exactMatch.original] ? String(row[exactMatch.original]).trim() : null;
    }

    // 2. ƯU TIÊN 2: Quét linh hoạt có chứa từ khóa và loại trừ từ rác
    const matchedKey = normalizedRowKeys.find(k => {
        const matchesInclude = normIncludes.some(kw => k.norm.includes(kw));
        const matchesExclude = normExcludes.some(kw => k.norm.includes(kw));
        return matchesInclude && !matchesExclude;
    });

    return matchedKey && row[matchedKey.original] ? String(row[matchedKey.original]).trim() : null;
}

async function upsert<T>(model: Model<T>, filter: Record<string, unknown>, data: Record<string, unknown>) {
  return model.findOneAndUpdate(
    filter,
    { $set: data },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
}

async function load() {
  await connectDatabase();

  const passwordHash = await bcrypt.hash('123456789', 10);
  const admin = await upsert(User, { email: 'admin@myerp.local' }, {
    name: 'Admin',
    email: 'admin@myerp.local',
    passwordHash,
    role: 'owner',
    status: 'open',
    isRootOwner: true,
    isActive: true,
  });

  const branchHN = await upsert(Branch, { code: 'HN' }, {
    name: 'Kho Hà Nội',
    code: 'HN',
    phone: '0900000000',
    address: 'LadyStars Store HN',
    isActive: true,
  });

  const branchHCM = await upsert(Branch, { code: 'HCM' }, {
    name: 'Kho HCM',
    code: 'HCM',
    phone: '0900000000',
    address: 'LadyStars Store HCM',
    isActive: true,
  });

  await upsert(StoreSetting, { singletonKey: 'store' }, {
    singletonKey: 'store',
    shopName: 'LadyStars',
    address: 'LadyStars Store',
    phone: '0900000000',
    taxCode: '',
    updatedBy: admin._id,
  });

  const paymentMethod = await upsert(PaymentMethod, { code: 'cash' }, {
    name: 'Tiền mặt',
    code: 'cash',
    targetPaymentStatus: 'paid',
    sortOrder: 1,
    isActive: true,
  });

  const saleChannel = await upsert(SaleChannel, { name: 'Bán tại cửa hàng' }, {
    name: 'Bán tại cửa hàng',
    description: 'Kênh bán mặc định tại cửa hàng',
    sortOrder: 1,
    isActive: true,
  });

  await upsert(DeliveryPartner, { code: 'SHIP001' }, {
    type: 'company',
    name: 'Giao hàng tiêu chuẩn',
    code: 'SHIP001',
    phone: '0911111111',
    isActive: true,
  });

  const customerGroup = await upsert(CustomerGroup, { name: 'Khách lẻ' }, {
    name: 'Khách lẻ',
    type: '1',
    note: 'Nhóm khách hàng mặc định',
    userId: admin._id,
  });

  const vendorGroup = await upsert(VendorGroup, { name: 'Nhà cung cấp mặc định' }, {
    name: 'Nhà cung cấp mặc định',
    note: 'Nhóm nhà cung cấp mẫu',
    userCreatedId: admin._id,
  });

  const receiptType = await upsert(AccountingType, { name: 'Thu bán hàng', kind: 'receipt' }, {
    name: 'Thu bán hàng',
    kind: 'receipt',
    type: 'receipt',
    description: 'Loại phiếu thu mặc định',
  });

  const paymentType = await upsert(AccountingType, { name: 'Chi nhập hàng', kind: 'payment' }, {
    name: 'Chi nhập hàng',
    kind: 'payment',
    type: 'payment',
    description: 'Loại phiếu chi mặc định',
  });

  const permissionKeys = [
    'products.index', 'products.stock.index', 'products.price-setting', 'products.sale-channel', 'products.delivery-partner',
    'sales.payment.index', 'sales.payment.refund', 'sales.print', 'customers.index', 'customers.groups',
    'accountings.index', 'accountings.payments', 'accountings.refunds', 'accountings.invoices',
    'projects.index', 'projects.create', 'tasks.index', 'tasks.create', 'print-forms.forms.index',
  ];

  for (const key of permissionKeys) {
    await upsert(Permission, { key }, { key, label: key, module: key.split('.')[0] });
  }

  await upsert(Role, { name: 'Admin' }, {
    name: 'Admin',
    description: 'Toàn quyền',
    permissions: permissionKeys,
    isSystem: true,
  });

  const menuItems = [
    ['Dashboard', '/', 'dashboard'],
    ['Hàng hóa', '/products', 'product'],
    ['Bán hàng', '/sales', 'sale'],
    ['Khách hàng', '/customers', 'customer'],
    ['Kế toán', '/accounting', 'accounting'],
    ['Công việc', '/tasks', 'task'],
    ['Mẫu in', '/print-forms', 'print-forms'],
  ];
  for (const [label, path, module] of menuItems) {
    await upsert(MenuItem, { path }, { label, path, module, permission: `${module}.index`, isActive: true });
  }

  // -------------------------------------------------------------
  // BẮT ĐẦU MIGRATION DỮ LIỆU TỪ MIGRATION-TOOL
  // -------------------------------------------------------------
  const collectionsToDrop = [
      'products', 'productbranchstocks', 'categories',
      'vendors', 'stockadjustments', 'vendortransfers', 'salepayments', 'vendorpurchases'
  ];

  console.log("🧹 Đang tự động dọn sạch tàn dư cũ trên Atlas...");
  if (mongoose.connection.db) {
    for (const colName of collectionsToDrop) {
        try {
            const collections = await mongoose.connection.db.listCollections({ name: colName }).toArray();
            if (collections.length > 0) {
                await mongoose.connection.db.collection(colName).drop();
            }
        } catch (err) { }
    }
  }
  
  const migrationToolDir = path.join(process.cwd(), '../migration-tool');
  
  console.log("⏳ ĐANG TÌM VÀ ĐỌC FILE CSV...");
  const rawCategories = await readCSV(path.join(migrationToolDir, 'categories.csv'));
  const rawVendors = await readCSV(path.join(migrationToolDir, 'vendors.csv'));
  const rawProducts = await readCSV(path.join(migrationToolDir, 'products.csv'));
  const rawProductsStock = await readCSV(path.join(migrationToolDir, 'products - Bản đọc để thêm số lương.csv'));
  const rawInventory = await readCSV(path.join(migrationToolDir, 'inventory.csv'));
  const rawChecks = await readCSV(path.join(migrationToolDir, 'inventory_checks.csv'));
  const rawTransfers = await readCSV(path.join(migrationToolDir, 'inventory_transfers.csv'));
  const rawImexBills = await readCSV(path.join(migrationToolDir, 'imex_bills.csv'));

  console.log(`📊 KẾT QUẢ ĐỌC FILE VÀO BỘ NHỚ:`);
  console.log(`   - Danh mục: ${rawCategories.length} dòng`);
  console.log(`   - Nhà cung cấp: ${rawVendors.length} dòng`);
  console.log(`   - Sản phẩm: ${rawProducts.length} dòng`);
  console.log(`   - Sản phẩm (file số lượng): ${rawProductsStock.length} dòng`);
  console.log(`   - Tồn kho: ${rawInventory.length} dòng`);
  console.log(`   - Kiểm kho: ${rawChecks.length} dòng`);
  console.log(`   - Chuyển kho: ${rawTransfers.length} dòng`);
  console.log(`   - Hóa đơn XNK: ${rawImexBills.length} dòng\n`);

  // 1. DANH MỤC
  const categoryMap = new Map();
  let catCount = 0;
  for (const row of rawCategories) {
      const name = getFlexVal(row, ['name', 'tên danh mục', 'danh mục']);
      if (!name) continue;
      const cat = await upsert(Category, { name: name }, { name: name, userId: admin._id });
      categoryMap.set(name.toLowerCase(), cat._id);
      const code = getFlexVal(row, ['code', 'mã danh mục']);
      if (code) categoryMap.set(code.toLowerCase(), cat._id);
      catCount++;
  }
  console.log(`✅ DANH MỤC: Up thành công ${catCount} bản ghi.`);

  // 2. NHÀ CUNG CẤP
  let venCount = 0;
  for (const row of rawVendors) {
      const name = getFlexVal(row, ['tên nhà cung cấp', 'nhà cung cấp']);
      const id = getFlexVal(row, ['mã nhà cung cấp', 'id']);
      if (!name && !id) continue;

      const code = id || name;
      await upsert(Vendor, { code: code }, {
          code: code,
          name: name || 'Chưa rõ',
          address: getFlexVal(row, ['địa chỉ', 'address']) || '',
          phone: getFlexVal(row, ['điện thoại', 'phone']) || '',
          email: getFlexVal(row, ['email']) || '',
          type: getFlexVal(row, ['loại', 'type'])?.toLowerCase().includes('cá nhân') ? 'person' : 'company',
          status: getFlexVal(row, ['trạng thái', 'status'])?.includes('giao dịch') ? 'active' : 'inactive',
          groups: [vendorGroup._id],
          userCreatedId: admin._id,
      });
      venCount++;
  }
  console.log(`✅ NHÀ CUNG CẤP: Up thành công ${venCount} bản ghi.`);

  // 3. SẢN PHẨM & TỒN KHO
  let prodCount = 0;
  let stockCount = 0;
  const productMap = new Map();
  const stockMap = new Map();
  for (const row of rawProductsStock) {
      const sku = getFlexVal(row, ['mã sản phẩm', 'sku'], ['cha']);
      if (sku) {
          stockMap.set(sku.toLowerCase(), parseInt(getFlexVal(row, ['tồn', 'tổng tồn']) || '0') || 0);
      }
  }

  for (const row of rawProducts) {
      const sku = getFlexVal(row, ['mã sản phẩm', 'sku'], ['cha']);
      if (!sku) continue;

      const categoryName = getFlexVal(row, ['danh mục', 'category'], ['mã', 'nội bộ']) || '';
      const categoryId = categoryMap.get(categoryName.toLowerCase());

      const qtyFromNewFile = stockMap.get(sku.toLowerCase()) || 0;
      const qtyFromOldFile = parseInt(getFlexVal(row, ['tổng tồn', 'tồn']) || '0') || 0;
      const finalQty = qtyFromNewFile > 0 ? qtyFromNewFile : qtyFromOldFile;

      const p = await upsert(Product, { code: sku }, {
          name: getFlexVal(row, ['tên sản phẩm', 'name'], ['cha']) || 'Sản phẩm không tên',
          code: sku,
          categoryId: categoryId || null,
          cost: parseInt(getFlexVal(row, ['giá nhập', 'purchase'], ['vat', '+', 'mode']) || '0') || 0,
          price: parseInt(getFlexVal(row, ['giá bán', 'sale'], ['vat', '+', 'mode', 'sỉ', 'chi nhánh']) || '0') || 0,
          qty: finalQty,
          unit: getFlexVal(row, ['đơn vị tính', 'unit']) || 'Cái',
          weight: parseFloat(getFlexVal(row, ['cân nặng', 'khối lượng']) || '0') || 0,
          weightType: 'gram',
          status: getFlexVal(row, ['trạng thái', 'status'])?.includes('Mới') ? 'active' : 'inactive',
          userId: admin._id,
          categoryName: categoryName,
      });
      productMap.set(sku.toLowerCase(), p._id);
      prodCount++;

      const invRow = rawInventory.find(i => getFlexVal(i, ['mã sản phẩm', 'sku'], ['cha']) === sku);
      if (invRow) {
          const stockHN = parseInt(getFlexVal(invRow, ['kho hà nội', 'hà nội']) || '0') || 0;
          const stockHCM = parseInt(getFlexVal(invRow, ['kho hcm', 'hcm']) || '0') || 0;
          
          if (stockHN > 0) {
              await upsert(ProductBranchStock, { productId: p._id, branchId: branchHN._id }, {
                  productId: p._id, branchId: branchHN._id, qty: stockHN
              });
              stockCount++;
          }
          if (stockHCM > 0) {
              await upsert(ProductBranchStock, { productId: p._id, branchId: branchHCM._id }, {
                  productId: p._id, branchId: branchHCM._id, qty: stockHCM
              });
              stockCount++;
          }
      }
  }
  console.log(`✅ SẢN PHẨM: Up thành công ${prodCount} bản ghi.`);
  console.log(`✅ TỒN KHO CHI NHÁNH: Phân bổ ${stockCount} bản ghi.`);

  // 4. KIỂM KHO
  let checkCount = 0;
  for (const row of rawChecks) {
      const id = getFlexVal(row, ['id']);
      if (!id) continue;
      
      const branchName = getFlexVal(row, ['kho', 'branch']) || '';
      const bId = branchName.toLowerCase().includes('hcm') ? branchHCM._id : branchHN._id;
      
      let balanceDateStr = getFlexVal(row, ['ngày', 'date']);
      // Handle dd/mm/yyyy
      if (balanceDateStr && balanceDateStr.includes('/')) {
        const parts = balanceDateStr.split('/');
        if (parts.length === 3) balanceDateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }

      await upsert(StockAdjustment, { code: id }, {
          branchId: bId,
          code: id,
          balanceDate: balanceDateStr ? new Date(balanceDateStr) : new Date(),
          note: getFlexVal(row, ['ghi chú', 'note']) || '',
          status: 'completed',
          userCreatedId: admin._id,
          userId: admin._id
      });
      checkCount++;
  }
  console.log(`✅ PHIẾU KIỂM KHO: Up thành công ${checkCount} bản ghi.`);

  // 5. CHUYỂN KHO
  let transferCount = 0;
  for (const row of rawTransfers) {
      const id = getFlexVal(row, ['id']);
      if (!id) continue;

      const branchRoute = getFlexVal(row, ['kho', 'branch']) || '';
      let fromBranchId = branchHN._id;
      let toBranchId = branchHCM._id;
      if (branchRoute.toLowerCase().includes('hcm - kho hà nội')) {
          fromBranchId = branchHCM._id;
          toBranchId = branchHN._id;
      }

      let dateSendStr = getFlexVal(row, ['ngày', 'date']);
      // Handle dd/mm/yyyy
      if (dateSendStr && dateSendStr.includes('/')) {
        const parts = dateSendStr.split('/');
        if (parts.length === 3) dateSendStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }

      await upsert(VendorTransfer, { code: id }, {
          fromBranchId: fromBranchId,
          toBranchId: toBranchId,
          code: id,
          dateSend: dateSendStr ? new Date(dateSendStr) : new Date(),
          status: 'success',
          note: getFlexVal(row, ['mô tả', 'note']) || '',
          userCreatedId: admin._id
      });
      transferCount++;
  }
  console.log(`✅ PHIẾU CHUYỂN KHO: Up thành công ${transferCount} bản ghi.`);

  // 6. HÓA ĐƠN XNK
  let billCount = 0;
  for (const row of rawImexBills) {
      const id = getFlexVal(row, ['id']);
      if (!id) continue;
      
      const type = getFlexVal(row, ['kiểu', 'type']) || '';
      const branchName = getFlexVal(row, ['kho hàng', 'kho']) || '';
      const bId = branchName.toLowerCase().includes('hcm') ? branchHCM._id : branchHN._id;
      
      const isExport = type.toLowerCase().includes('xuất') || type.toLowerCase().includes('bán');
      
      if (isExport) {
          await upsert(SalePayment, { code: id }, {
              branchId: bId,
              code: id,
              amountProducts: parseInt(getFlexVal(row, ['số sp', 'sp']) || '0') || 0,
              value: parseInt(getFlexVal(row, ['tổng tiền', 'amount']) || '0') || 0,
              discountValue: parseInt(getFlexVal(row, ['chiết khấu', 'discount']) || '0') || 0,
              status: 'completed',
              userId: admin._id,
              authorId: admin._id
          });
      } else {
          await upsert(VendorPurchase, { code: id }, {
              branchId: bId,
              code: id,
              total: parseInt(getFlexVal(row, ['tổng tiền', 'amount']) || '0') || 0,
              discountValue: parseInt(getFlexVal(row, ['chiết khấu', 'discount']) || '0') || 0,
              status: 'success',
              userId: admin._id,
              userCreatedId: admin._id
          });
      }
      billCount++;
  }
  console.log(`✅ HÓA ĐƠN XNK: Up thành công ${billCount} bản ghi.`);

  // 7. ĐƠN HÀNG MẪU (DỰA THEO HTML TEMPLATE)
  console.log("⏳ ĐANG TẠO DỮ LIỆU ĐƠN HÀNG MẪU...");
  const orderStatuses = [
    'Cần xử lí', 'Xác nhận', 'Chờ thanh toán', 'Đã thanh toán',
    'Thanh toán', 'In và đóng gói', 'Đang chuyển', 'Khiếu nại'
  ];
  
  let allProducts = await Product.find({});
  if (allProducts.length === 0) {
    console.log("🌱 Database trống. Đang tạo sản phẩm mẫu để test...");
    const defaultProducts = [];
    for (let i = 1; i <= 5; i++) {
      const p = await upsert(Product, { code: `SKU-00${i}` }, {
        name: `Sản phẩm đóng gói ${i}`,
        code: `SKU-00${i}`,
        cost: 50000 + i * 5000,
        price: 90000 + i * 10000,
        qty: 100,
        unit: 'cái',
        status: 'active',
        userId: admin._id,
      });
      defaultProducts.push(p);
    }
    allProducts = defaultProducts;
  }
  
  for (let i = 1; i <= 20; i++) {
    const status = orderStatuses[i % orderStatuses.length];
    const orderProducts = [];
    let calculatedTotal = 0;
    if (allProducts.length > 0) {
      const count = Math.floor(Math.random() * 2) + 1; // 1-2 products
      for (let j = 0; j < count; j++) {
        const prodIndex = (i + j * 7) % allProducts.length;
        const prod = allProducts[prodIndex];
        const qty = ((i + j) % 3) + 1; // 1 to 3 items
        orderProducts.push({
          productId: prod._id,
          sku: prod.code,
          productName: prod.name,
          quantity: qty,
          scannedQuantity: 0,
        });
        calculatedTotal += (prod.price || 100000) * qty;
      }
    }
    
    await upsert(Order, { orderCode: `ORD-2026-${1000 + i}` }, {
      orderCode: `ORD-2026-${1000 + i}`,
      customerName: `Khách hàng ${i}`,
      customerPhone: `09000000${i.toString().padStart(2, '0')}`,
      shippingAddress: `${i} Đường Lê Lợi, Quận 1, TP HCM`,
      paymentMethod: i % 2 === 0 ? 'COD' : 'Chuyển khoản',
      totalAmount: calculatedTotal || (150000 + (i * 10000)),
      status: status,
      warehouse: i % 2 === 0 ? 'Kho Hà Nội' : 'Kho HCM',
      deliveryStatus: status === 'Đang chuyển' ? 'Đang giao' : 'Chờ lấy hàng',
      note: `Đơn hàng mẫu trạng thái ${status}`,
      products: orderProducts,
      userId: admin._id,
    });
  }
  console.log("✅ ĐƠN HÀNG MẪU: Đã tạo 20 bản ghi vào collection.");

  await Promise.all(Object.values(mongoose.models).map((model) => model.createCollection().catch(() => undefined)));
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes().catch(() => undefined)));

  console.log("\n🎉 TOÀN BỘ DỮ LIỆU TỪ MIGRATION-TOOL ĐÃ ĐƯỢC CHẠY XONG VÀ KHỚP VỚI CẤU TRÚC CODE MỚI!");
}

load()
  .catch((error) => {
    console.error("❌ Lỗi hệ thống:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
