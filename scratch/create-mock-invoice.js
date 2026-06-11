import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env từ server
dotenv.config({ path: path.join(process.cwd(), 'server', '.env') });

const RetailInvoiceSchema = new mongoose.Schema({
  id: { type: String, unique: true, sparse: true },
  date: String,
  orderId: String,
  type: String,
  customerName: String,
  productCode: String,
  productName: String,
  totalAmount: { type: Number, default: 0 },
  status: { type: String, default: 'Mới' },
}, { timestamps: true, strict: false });
const RetailInvoice = mongoose.model('RetailInvoice', RetailInvoiceSchema);

const SalePaymentSchema = new mongoose.Schema({
  branchId: mongoose.Schema.Types.ObjectId,
  code: { type: String, required: true, unique: true },
  value: { type: Number, default: 0 },
  status: { type: String, default: 'draft' },
  items: [{
    productId: mongoose.Schema.Types.ObjectId,
    amount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  }],
}, { timestamps: true, strict: false });
const SalePayment = mongoose.model('SalePayment', SalePaymentSchema);

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
}, { timestamps: true, strict: false });
const Product = mongoose.model('Product', ProductSchema);

const BranchSchema = new mongoose.Schema({
  name: String,
  isActive: Boolean
});
const Branch = mongoose.model('Branch', BranchSchema);

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ladystars';
  console.log('Connecting to DB:', uri);
  await mongoose.connect(uri);
  console.log('Connected to Database');

  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
  console.log('Target date:', dateStr);

  // 1. Lấy chi nhánh đầu tiên
  const branch = await Branch.findOne({ isActive: true });
  const branchId = branch ? branch._id : new mongoose.Types.ObjectId();

  // 2. Tạo một Sản phẩm mock
  let product = await Product.findOne({ code: 'MOCK_SP_01' });
  if (!product) {
    product = await Product.create({
      name: 'Sản phẩm Test (Biểu đồ)',
      code: 'MOCK_SP_01',
      price: 5000000,
    });
    console.log('Created mock product');
  }

  // 3. Tạo RetailInvoice để test biểu đồ doanh thu
  const invoiceCode = `INV-${Date.now()}`;
  await RetailInvoice.create({
    id: invoiceCode,
    orderId: invoiceCode,
    date: dateStr, // dd/mm/yyyy
    customerName: 'Khách hàng Test',
    productCode: product.code,
    productName: product.name,
    totalAmount: 15000000, // 15 triệu
    status: 'Hoàn thành'
  });
  console.log(`Created RetailInvoice with 15,000,000 revenue on ${dateStr}`);

  // 4. Tạo SalePayment để test Đơn hàng và Sản phẩm bán chạy
  await SalePayment.create({
    branchId: branchId,
    code: `SP-${Date.now()}`,
    value: 15000000,
    status: 'shipping', // Test trạng thái "Đang chuyển"
    items: [{
      productId: product._id,
      amount: 3, // Bán 3 cái
      total: 15000000
    }]
  });
  console.log(`Created SalePayment (Shipping status) with 3 items of product MOCK_SP_01`);

  console.log('\n✅ Tạo dữ liệu thành công! Hãy tải lại trang Dashboard (F5) để kiểm tra:');
  console.log('- Biểu đồ "Doanh thu theo thời gian" sẽ mọc lên 1 cột 15M ở ngày hôm nay.');
  console.log('- (Sau khi code Đơn hàng & Sản phẩm bán chạy được fix thì sẽ thấy dữ liệu hiển thị tương ứng).');
  
  await mongoose.disconnect();
}

run().catch(console.error);
