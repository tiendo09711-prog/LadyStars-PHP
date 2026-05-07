import bcrypt from 'bcryptjs';
import mongoose, { type Model } from 'mongoose';
import { connectDatabase } from './config/database.js';
import { User } from './core/auth/user.model.js';
import { Branch } from './core/org/branch.model.js';
import { AccountingType, ExpensePayment, PayPerson, Receipt } from './modules/accounting/accounting.models.js';
import { Customer, CustomerGroup } from './modules/customer/customer.models.js';
import {
  Category,
  DeliveryPartner,
  PaymentMethod,
  Product,
  ProductBranchStock,
  ProductLog,
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
    qty: 100,
    unit: 'cái',
    minQuantity: 5,
    maxQuantity: 1000,
    type: 'product',
    userId: admin._id,
  });

  await upsert(ProductBranchStock, { productId: product._id, branchId: branch._id }, {
    productId: product._id,
    branchId: branch._id,
    qty: 100,
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

  const deliveryPartner = await upsert(DeliveryPartner, { code: 'SHIP001' }, {
    type: 'company',
    name: 'Đối tác giao hàng mẫu',
    code: 'SHIP001',
    phone: '0911111111',
    isActive: true,
  });

  const customerGroup = await upsert(CustomerGroup, { name: 'Khách lẻ' }, {
    name: 'Khách lẻ',
    description: 'Nhóm khách hàng mặc định',
    userId: admin._id,
  });

  const customer = await upsert(Customer, { code: 'KH001' }, {
    type: 'person',
    name: 'Khách hàng mẫu',
    code: 'KH001',
    phone: '0922222222',
    email: 'customer@example.com',
    address: 'Hồ Chí Minh',
    groups: [customerGroup._id],
    userId: admin._id,
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
    status: 'draft',
    items: [{ productId: product._id, amount: 1, value: 90000, discountValue: 0, discountType: 'number', total: 90000 }],
  });

  await upsert(ProductLog, { productId: product._id, sourceType: 'LoadScript', sourceId: sale._id }, {
    productId: product._id,
    sourceType: 'LoadScript',
    sourceId: sale._id,
    amount: 100,
    valueBefore: 0,
    valueAfter: product.price,
    amountBefore: 0,
    amountAfter: product.qty,
  });

  await upsert(StockAdjustment, { code: 'KK001' }, {
    branchId: branch._id,
    code: 'KK001',
    note: 'Phiếu kiểm kho mẫu',
    userId: admin._id,
    items: [{ productId: product._id, amount: 100, note: 'Tồn đầu kỳ' }],
  });

  const vendorGroup = await upsert(VendorGroup, { name: 'Nhà cung cấp mặc định' }, {
    name: 'Nhà cung cấp mặc định',
    description: 'Nhóm nhà cung cấp mẫu',
  });

  const vendor = await upsert(Vendor, { code: 'NCC001' }, {
    type: 'company',
    name: 'Nhà cung cấp mẫu',
    code: 'NCC001',
    phone: '0933333333',
    email: 'vendor@example.com',
    address: 'Hà Nội',
    groups: [vendorGroup._id],
  });

  const purchase = await upsert(VendorPurchase, { code: 'NH001' }, {
    branchId: branch._id,
    vendorId: vendor._id,
    code: 'NH001',
    totalCost: 500000,
    discountValue: 0,
    value: 500000,
    valuePayment: 500000,
    status: 'draft',
    note: 'Phiếu nhập mẫu',
    userId: admin._id,
    items: [{ productId: product._id, amount: 10, value: 50000, discountValue: 0, discountType: 'number', total: 500000 }],
  });

  await upsert(VendorRefund, { code: 'TNH001' }, {
    purchaseId: purchase._id,
    vendorId: vendor._id,
    code: 'TNH001',
    value: 50000,
    status: 'draft',
    note: 'Phiếu trả hàng nhập mẫu',
    items: [{ productId: product._id, amount: 1, value: 50000, discountValue: 0, discountType: 'number', total: 50000 }],
  });

  await upsert(VendorTransfer, { code: 'CK001' }, {
    fromBranchId: branch._id,
    toBranchId: branch._id,
    code: 'CK001',
    status: 'draft',
    note: 'Phiếu chuyển kho mẫu',
    items: [{ productId: product._id, amount: 1, note: 'Dòng chuyển kho mẫu' }],
  });

  const receiptType = await upsert(AccountingType, { name: 'Thu bán hàng', kind: 'receipt' }, {
    name: 'Thu bán hàng',
    kind: 'receipt',
    description: 'Loại phiếu thu mặc định',
  });

  const paymentType = await upsert(AccountingType, { name: 'Chi nhập hàng', kind: 'payment' }, {
    name: 'Chi nhập hàng',
    kind: 'payment',
    description: 'Loại phiếu chi mặc định',
  });

  const payPerson = await upsert(PayPerson, { name: 'Người nhận chi mẫu' }, {
    name: 'Người nhận chi mẫu',
    phone: '0944444444',
    email: 'payperson@example.com',
    address: 'Đà Nẵng',
  });

  await upsert(Receipt, { code: 'PT001' }, {
    code: 'PT001',
    typeId: receiptType._id,
    customerId: customer._id,
    value: 90000,
    date: new Date(),
    note: 'Phiếu thu mẫu',
    userId: admin._id,
  });

  await upsert(ExpensePayment, { code: 'PC001' }, {
    code: 'PC001',
    typeId: paymentType._id,
    payPersonId: payPerson._id,
    value: 50000,
    date: new Date(),
    note: 'Phiếu chi mẫu',
    userId: admin._id,
  });

  const project = await upsert(Project, { code: 'PRJ001' }, {
    name: 'Dự án mẫu',
    code: 'PRJ001',
    description: 'Dự án vận hành LadyStars',
    status: 'active',
    startDate: new Date(),
    ownerId: admin._id,
  });

  await upsert(Task, { title: 'Kiểm tra dữ liệu mẫu', projectId: project._id }, {
    projectId: project._id,
    title: 'Kiểm tra dữ liệu mẫu',
    description: 'Task mẫu được tạo bởi npm run load',
    status: 'todo',
    priority: 'medium',
    assigneeId: admin._id,
    comments: [{ userId: admin._id, body: 'Dữ liệu mẫu đã sẵn sàng.' }],
    timeLogs: [{ userId: admin._id, minutes: 30, note: 'Khởi tạo dữ liệu', loggedAt: new Date() }],
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

  await Promise.all(Object.values(mongoose.models).map((model) => model.createCollection().catch(() => undefined)));
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes().catch(() => undefined)));

  console.log('Loaded sample collections into MongoDB database.');
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
