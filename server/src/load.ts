import bcrypt from 'bcryptjs';
import mongoose, { type Model } from 'mongoose';
import { connectDatabase } from './config/database.js';
import { User } from './core/auth/user.model.js';
import { Branch } from './core/org/branch.model.js';
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
    role: 'admin',
    isActive: true,
  });

  const branch = await upsert(Branch, { code: 'CN001' }, {
    name: 'Chi nhánh trung tâm',
    code: 'CN001',
    phone: '0900000000',
    address: 'LadyStars Store',
    isDefault: true,
    isActive: true,
  });

  const category = await upsert(Category, { name: 'Hàng hóa' }, { name: 'Hàng hóa', userId: admin._id });
  const trademark = await upsert(Trademark, { name: 'LadyStars' }, { name: 'LadyStars', userId: admin._id });
  const shelf = await upsert(Shelf, { name: 'Kệ A1' }, { name: 'Kệ A1', userId: admin._id });

  const product = await upsert(Product, { code: 'SP001' }, {
    name: 'Sản phẩm mẫu',
    code: 'SP001',
    categoryId: category._id,
    trademarkId: trademark._id,
    shelfId: shelf._id,
    cost: 50000,
    price: 90000,
    qty: 99,
    unit: 'cái',
    minQuantity: 5,
    maxQuantity: 1000,
    type: 'product',
    userId: admin._id,
    units: [{ name: 'Hộp', code: 'HOP', conversionValue: 10, price: 850000, allowsSale: true }],
  });

  await upsert(ProductBranchStock, { productId: product._id, branchId: branch._id }, {
    productId: product._id,
    branchId: branch._id,
    qty: 99,
    minQuantity: 5,
    maxQuantity: 1000,
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
    isDefault: true,
    isActive: true,
  });

  await upsert(DeliveryPartner, { code: 'SHIP001' }, {
    type: 'company',
    name: 'Đối tác giao hàng mẫu',
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

  const customer = await upsert(Customer, { code: 'KH001' }, {
    type: 'person',
    name: 'Khách hàng mẫu',
    code: 'KH001',
    phone: '0922222222',
    phone2: '0922222223',
    email: 'customer@example.com',
    address: 'Hồ Chí Minh',
    status: 'active',
    groups: [customerGroup._id],
    userId: admin._id,
    branchId: branch._id,
  });

  const sale = await upsert(SalePayment, { code: 'BH001' }, {
    branchId: branch._id,
    customerId: customer._id,
    code: 'BH001',
    amountProducts: 1,
    totalCost: 50000,
    discountValue: 0,
    discountType: 'number',
    value: 90000,
    valuePayment: 90000,
    typePayment: [{ methodId: paymentMethod._id, amount: 90000 }],
    isDelivery: false,
    saleChannelId: saleChannel._id,
    isCod: false,
    userId: admin._id,
    authorId: admin._id,
    status: 'completed',
    completedAt: new Date(),
    items: [{ productId: product._id, amount: 1, value: 90000, discountValue: 0, discountType: 'number', total: 90000 }],
  });

  await upsert(ProductRefund, { code: 'THB001' }, {
    paymentId: sale._id,
    code: 'THB001',
    amount: 1,
    originalTotalAmount: 90000,
    totalPayableAmount: 90000,
    value: 90000,
    status: 'draft',
    userId: admin._id,
    userCreatedId: admin._id,
    note: 'Phiếu trả hàng bán mẫu',
    items: [{ productId: product._id, amount: 1, price: 90000, discountValue: 0, discountType: 'number', value: 90000 }],
  });

  await upsert(ProductLog, { productId: product._id, sourceType: 'LoadScript', sourceId: sale._id }, {
    productId: product._id,
    sourceType: 'LoadScript',
    sourceId: sale._id,
    amount: 99,
    valueBefore: 0,
    valueAfter: product.price,
    amountBefore: 0,
    amountAfter: product.qty,
  });

  await upsert(StockAdjustment, { code: 'KK001' }, {
    branchId: branch._id,
    code: 'KK001',
    balanceDate: new Date(),
    amount: 99,
    increaseDeviation: 0,
    decreaseDeviation: 0,
    deviation: 0,
    value: 4950000,
    status: 'draft',
    note: 'Phiếu kiểm kho mẫu',
    userId: admin._id,
    userCreatedId: admin._id,
    items: [{ productId: product._id, amount: 99, actualStock: 99, quantityDifference: 0, value: 4950000, valueDifference: 0, note: 'Tồn sau bán mẫu' }],
  });

  const vendorGroup = await upsert(VendorGroup, { name: 'Nhà cung cấp mặc định' }, {
    name: 'Nhà cung cấp mặc định',
    note: 'Nhóm nhà cung cấp mẫu',
    userCreatedId: admin._id,
  });

  const vendor = await upsert(Vendor, { code: 'NCC001' }, {
    type: 'company',
    branchId: branch._id,
    name: 'Nhà cung cấp mẫu',
    code: 'NCC001',
    vat: '0312345678',
    phone: '0933333333',
    email: 'vendor@example.com',
    address: 'Hà Nội',
    status: 'active',
    total: 500000,
    debt: 0,
    totalPurchase: 500000,
    groups: [vendorGroup._id],
    userCreatedId: admin._id,
  });

  const purchase = await upsert(VendorPurchase, { code: 'NH001' }, {
    branchId: branch._id,
    vendorId: vendor._id,
    code: 'NH001',
    discountValue: 0,
    discountType: 'number',
    total: 500000,
    needPay: 500000,
    value: 500000,
    valuePayment: 500000,
    status: 'temp',
    note: 'Phiếu nhập mẫu',
    userId: admin._id,
    userCreatedId: admin._id,
    items: [{ branchId: branch._id, productId: product._id, amount: 10, price: 50000, value: 500000, discountValue: 0, discountType: 'number', total: 500000 }],
  });

  await upsert(VendorRefund, { code: 'TNH001' }, {
    branchId: branch._id,
    purchaseId: purchase._id,
    vendorId: vendor._id,
    code: 'TNH001',
    total: 50000,
    value: 50000,
    status: 'temp',
    note: 'Phiếu trả hàng nhập mẫu',
    userCreatedId: admin._id,
    items: [{ productId: product._id, amount: 1, price: 50000, value: 50000, discountValue: 0, discountType: 'number', total: 50000 }],
  });

  await upsert(VendorTransfer, { code: 'CK001' }, {
    branchId: branch._id,
    fromBranchId: branch._id,
    toBranchId: branch._id,
    code: 'CK001',
    status: 'temp',
    dateSend: new Date(),
    note: 'Phiếu chuyển kho mẫu',
    userCreatedId: admin._id,
    items: [{ productId: product._id, amount: 1, price: 50000, value: 50000, note: 'Dòng chuyển kho mẫu' }],
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

  const payPerson = await upsert(PayPerson, { name: 'Người nhận chi mẫu' }, {
    name: 'Người nhận chi mẫu',
    phone: '0944444444',
    email: 'payperson@example.com',
    address: 'Đà Nẵng',
  });

  await upsert(Receipt, { code: 'PT001' }, {
    branchId: branch._id,
    code: 'PT001',
    typeId: receiptType._id,
    customerId: customer._id,
    value: 90000,
    date: new Date(),
    financeType: 'SalePayment',
    financeId: sale._id,
    businessResult: true,
    note: 'Phiếu thu mẫu',
    userId: admin._id,
    userCreatedId: admin._id,
  });

  await upsert(ExpensePayment, { code: 'PC001' }, {
    branchId: branch._id,
    code: 'PC001',
    typeId: paymentType._id,
    payPersonId: payPerson._id,
    value: 50000,
    date: new Date(),
    financeType: 'VendorPurchase',
    financeId: purchase._id,
    businessResult: true,
    note: 'Phiếu chi mẫu',
    userId: admin._id,
    userCreatedId: admin._id,
  });

  const project = await upsert(Project, { code: 'PRJ001' }, {
    name: 'Dự án mẫu',
    code: 'PRJ001',
    description: 'Dự án vận hành LadyStars',
    status: 'active',
    priority: 'medium',
    plannedStartDate: new Date(),
    budget: 20000000,
    progressPercentage: 25,
    branchId: branch._id,
    createdBy: admin._id,
    ownerId: admin._id,
  });

  await upsert(Task, { code: 'TASK001' }, {
    projectId: project._id,
    code: 'TASK001',
    name: 'Kiểm tra dữ liệu mẫu',
    title: 'Kiểm tra dữ liệu mẫu',
    description: 'Task mẫu được tạo bởi npm run load',
    status: 'todo',
    priority: 'medium',
    plannedStartDate: new Date(),
    plannedEndDate: new Date(),
    estimatedHours: 2,
    actualHours: 0.5,
    progressPercentage: 20,
    branchId: branch._id,
    createdBy: admin._id,
    assigneeId: admin._id,
    assignedTo: admin._id,
    comments: [{ userId: admin._id, content: 'Dữ liệu mẫu đã sẵn sàng.', body: 'Dữ liệu mẫu đã sẵn sàng.' }],
    timeLogs: [{ userId: admin._id, hours: 0.5, minutes: 30, description: 'Khởi tạo dữ liệu', note: 'Khởi tạo dữ liệu', logDate: new Date(), loggedAt: new Date() }],
  });

  await upsert(PrintForm, { code: 'INVOICE_A4' }, {
    name: 'Hóa đơn A4',
    code: 'INVOICE_A4',
    type: 'sale_invoice',
    paperSize: 'A4',
    templateHtml: '<h1>{{companyName}}</h1><p>Mã hóa đơn: {{code}}</p>',
    templateData: { companyName: 'LadyStars' },
    isActive: true,
  });

  await upsert(PrintForm, { code: 'RECEIPT_A5' }, {
    name: 'Phiếu thu A5',
    code: 'RECEIPT_A5',
    type: 'receipt',
    paperSize: 'A5',
    templateHtml: '<h1>Phiếu thu {{code}}</h1><p>{{value}}</p>',
    templateData: {},
    isActive: true,
  });

  const permissionKeys = [
    'products.index', 'products.stock.index', 'products.price-setting', 'products.sale-channel', 'products.delivery-partner',
    'sales.payment.index', 'sales.payment.refund', 'sales.print', 'customers.index', 'customers.groups',
    'vendors.index', 'vendors.groups', 'vendors.purchases.index', 'vendors.refunds.index', 'vendors.transfers.index',
    'accountings.index', 'accountings.payments', 'accountings.refunds', 'accountings.invoices',
    'projects.index', 'projects.create', 'tasks.index', 'tasks.create', 'print-forms.forms.index',
  ];

  for (const key of permissionKeys) {
    await upsert(Permission, { key }, { key, label: key, module: key.split('.')[0] });
  }

  await upsert(Role, { name: 'Admin' }, {
    name: 'Admin',
    description: 'Toàn quyền theo permission Polirium đã port',
    permissions: permissionKeys,
    isSystem: true,
  });

  const menuItems = [
    ['Dashboard', '/', 'dashboard'],
    ['Hàng hóa', '/products', 'product'],
    ['Bán hàng', '/sales', 'sale'],
    ['Khách hàng', '/customers', 'customer'],
    ['Nhà cung cấp', '/vendors', 'vendor'],
    ['Kế toán', '/accounting', 'accounting'],
    ['Công việc', '/tasks', 'task'],
    ['Mẫu in', '/print-forms', 'print-forms'],
  ];
  for (const [label, path, module] of menuItems) {
    await upsert(MenuItem, { path }, { label, path, module, permission: `${module}.index`, isActive: true });
  }

  await Promise.all(Object.values(mongoose.models).map((model) => model.createCollection().catch(() => undefined)));
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes().catch(() => undefined)));

  console.log('Loaded Polirium-style sample collections into MongoDB database.');
  console.log('Admin login: admin@myerp.local / 123456789');
}

load()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
