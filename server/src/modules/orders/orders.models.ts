import { Schema, model } from 'mongoose';

const money = { type: Number, default: 0, min: 0 };

// 1. Đơn hàng (Đã gộp Packing & ShippingPending)
const OrderSchema = new Schema({
  orderCode: { type: String, required: true, unique: true },
  customerName: { type: String, required: true },
  customerPhone: String,
  shippingAddress: String,
  paymentMethod: { type: String, default: 'COD' },
  totalAmount: money,
  status: { type: String, default: 'Cần xử lí' },
  warehouse: String,
  deliveryStatus: { type: String, default: 'Chờ lấy hàng' },
  note: String,
  products: [{
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    sku: String,
    productName: String,
    quantity: { type: Number, default: 1 },
    scannedQuantity: { type: Number, default: 0 }
  }],
  eInvoiceStatus: { type: String, default: 'Chưa tạo' },
  
  // -- Đóng gói (Merge từ OrderPackaging) --
  packer: String,
  packageWeight: { type: Number, default: 0 },
  packagingMaterial: String,
  packedAt: String,

  // -- Vận chuyển (Merge từ OrderShippingPending) --
  carrier: String,
  shippingFee: money,
  codAmount: money,

  userId: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
OrderSchema.index({ orderCode: 'text', customerName: 'text', customerPhone: 'text' });
export const Order = model('Order', OrderSchema);

// 2. Đơn trùng (Chỉ giữ lại, có thể refactor liên kết sau nếu cần)
const OrderDuplicateSchema = new Schema({
  orderCode: { type: String, required: true },
  duplicateCode: { type: String, required: true },
  customerName: String,
  customerPhone: String,
  totalAmount: money,
  reason: String,
  status: { type: String, default: 'Mới' },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
OrderDuplicateSchema.index({ orderCode: 'text', customerName: 'text', customerPhone: 'text' });
export const OrderDuplicate = model('OrderDuplicate', OrderDuplicateSchema);

// 3. Biên bản bàn giao
const OrderHandoverSchema = new Schema({
  handoverCode: { type: String, required: true, unique: true },
  carrier: String,
  orderCount: { type: Number, default: 0 },
  handoverStaff: String,
  carrierStaff: String,
  status: { type: String, default: 'Đang kiểm đếm' },
  handoverDate: String,
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
OrderHandoverSchema.index({ handoverCode: 'text', carrier: 'text', handoverStaff: 'text' });
export const OrderHandover = model('OrderHandover', OrderHandoverSchema);

// 4. Khiếu nại (Được link hoặc đồng bộ customerName, customerPhone từ Order ở route)
const OrderDisputeSchema = new Schema({
  disputeCode: { type: String, required: true, unique: true },
  orderCode: String,
  customerName: String,
  customerPhone: String,
  disputeType: String,
  description: String,
  solution: String,
  status: { type: String, default: 'Chờ xử lý' },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
OrderDisputeSchema.index({ disputeCode: 'text', orderCode: 'text', customerName: 'text' });
export const OrderDispute = model('OrderDispute', OrderDisputeSchema);

// 5. Đối soát COD
const OrderCodControlSchema = new Schema({
  controlCode: { type: String, required: true, unique: true },
  carrier: String,
  totalCodCollected: money,
  totalFee: money,
  amountPaid: money,
  status: { type: String, default: 'Đã đối soát' },
  controlDate: String,
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
OrderCodControlSchema.index({ controlCode: 'text', carrier: 'text' });
export const OrderCodControl = model('OrderCodControl', OrderCodControlSchema);

// 6. Nguồn đơn hàng
const OrderSourceSchema = new Schema({
  sourceName: { type: String, required: true, unique: true },
  sourceCode: String,
  orderCount: { type: Number, default: 0 },
  totalRevenue: money,
  isActive: { type: Boolean, default: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
OrderSourceSchema.index({ sourceName: 'text', sourceCode: 'text' });
export const OrderSource = model('OrderSource', OrderSourceSchema);

// 7. Lịch sử sửa xóa
const OrderHistorySchema = new Schema({
  actionType: String,
  orderCode: String,
  staffName: String,
  details: String,
  createdAtStr: String,
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
OrderHistorySchema.index({ orderCode: 'text', staffName: 'text', actionType: 'text' });
export const OrderHistory = model('OrderHistory', OrderHistorySchema);
