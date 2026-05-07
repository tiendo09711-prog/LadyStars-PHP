import { Schema, model } from 'mongoose';

const money = { type: Number, default: 0, min: 0 };

export const Category = model('Category', new Schema({
  name: { type: String, required: true, unique: true },
  parentId: { type: Schema.Types.ObjectId, ref: 'Category' },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true }));

export const Trademark = model('Trademark', new Schema({
  name: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true }));

export const Shelf = model('Shelf', new Schema({
  name: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true }));

const ProductUnitSchema = new Schema({
  name: String,
  code: String,
  conversionValue: { type: Number, default: 1 },
  price: money,
  allowsSale: { type: Boolean, default: true },
}, { _id: false });

const ProductElementSchema = new Schema({
  elementId: { type: Schema.Types.ObjectId, ref: 'Product' },
  qty: { type: Number, default: 1 },
  price: money,
}, { _id: false });

const ProductSchema = new Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category' },
  trademarkId: { type: Schema.Types.ObjectId, ref: 'Trademark' },
  shelfId: { type: Schema.Types.ObjectId, ref: 'Shelf' },
  cost: money,
  price: money,
  qty: { type: Number, default: 0 },
  weight: Number,
  weightType: { type: String, enum: ['gram', 'kg'], default: 'gram' },
  allowsSale: { type: Boolean, default: true },
  unit: String,
  minQuantity: { type: Number, default: 0 },
  maxQuantity: { type: Number, default: 999999999 },
  type: { type: String, enum: ['product', 'service', 'combo'], default: 'product' },
  description: String,
  note: String,
  units: [ProductUnitSchema],
  elements: [ProductElementSchema],
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
ProductSchema.index({ name: 'text', code: 'text' });
export const Product = model('Product', ProductSchema);

export const ProductBranchStock = model('ProductBranchStock', new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
  qty: { type: Number, default: 0 },
  minQuantity: { type: Number, default: 0 },
  maxQuantity: { type: Number, default: 999999999 },
}, { timestamps: true }).index({ productId: 1, branchId: 1 }, { unique: true }));

export const SaleChannel = model('SaleChannel', new Schema({
  name: { type: String, required: true },
  description: String,
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false },
}, { timestamps: true }));

export const DeliveryPartner = model('DeliveryPartner', new Schema({
  type: { type: String, enum: ['person', 'company'], default: 'person' },
  name: { type: String, required: true },
  code: { type: String, required: true },
  address: String,
  phone: String,
  email: String,
  provinceId: String,
  districtId: String,
  wardId: String,
  note: String,
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false },
}, { timestamps: true }));

export const PaymentMethod = model('PaymentMethod', new Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  targetPaymentStatus: String,
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true }));

const SaleItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  amount: { type: Number, default: 0 },
  value: money,
  discountValue: money,
  discountType: { type: String, enum: ['percent', 'number'], default: 'number' },
  total: money,
  note: String,
}, { _id: false });

const DeliverySchema = new Schema({
  code: String,
  partnerDeliveryId: { type: Schema.Types.ObjectId, ref: 'DeliveryPartner' },
  type: { type: String, enum: ['normal', 'fast', 'day'] },
  value: money,
  date: Date,
  status: { type: String, enum: ['wait', 'delivery', 'success', 'cancel'], default: 'wait' },
}, { _id: false });

export const SalePayment = model('SalePayment', new Schema({
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
  code: { type: String, required: true, unique: true },
  amountProducts: { type: Number, default: 0 },
  totalCost: money,
  discountValue: money,
  discountType: { type: String, enum: ['percent', 'number'], default: 'number' },
  value: money,
  valuePayment: money,
  typePayment: [{ methodId: { type: Schema.Types.ObjectId, ref: 'PaymentMethod' }, amount: Number }],
  isDelivery: { type: Boolean, default: false },
  saleChannelId: { type: Schema.Types.ObjectId, ref: 'SaleChannel' },
  isCod: { type: Boolean, default: false },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  authorId: { type: Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, default: 'draft' },
  note: String,
  completedAt: Date,
  delivery: DeliverySchema,
  items: [SaleItemSchema],
}, { timestamps: true }));

export const ProductRefund = model('ProductRefund', new Schema({
  paymentId: { type: Schema.Types.ObjectId, ref: 'SalePayment', required: true },
  code: { type: String, required: true, unique: true },
  discountValue: money,
  discountType: { type: String, enum: ['percent', 'number'], default: 'number' },
  refundFee: money,
  refundFeeType: { type: String, enum: ['percent', 'number'], default: 'number' },
  amount: { type: Number, default: 0 },
  originalTotalAmount: money,
  totalPayableAmount: money,
  value: money,
  status: { type: String, enum: ['draft', 'completed', 'cancelled'], default: 'draft' },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  userCreatedId: { type: Schema.Types.ObjectId, ref: 'User' },
  note: String,
  items: [{
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    amount: { type: Number, default: 1 },
    price: money,
    discountValue: money,
    discountType: { type: String, enum: ['percent', 'number'], default: 'number' },
    value: money,
  }],
}, { timestamps: true }));

export const ProductLog = model('ProductLog', new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  sourceType: { type: String, required: true },
  sourceId: { type: Schema.Types.ObjectId, required: true },
  amount: { type: Number, default: 0 },
  valueBefore: money,
  valueAfter: money,
  amountBefore: { type: Number, default: 0 },
  amountAfter: { type: Number, default: 0 },
}, { timestamps: true }));

export const StockAdjustment = model('StockAdjustment', new Schema({
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  code: { type: String, required: true, unique: true },
  balanceDate: Date,
  amount: { type: Number, default: 0 },
  increaseDeviation: { type: Number, default: 0 },
  decreaseDeviation: { type: Number, default: 0 },
  deviation: { type: Number, default: 0 },
  value: money,
  status: { type: String, enum: ['draft', 'completed', 'cancelled'], default: 'draft' },
  note: String,
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  userCreatedId: { type: Schema.Types.ObjectId, ref: 'User' },
  items: [{
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    amount: { type: Number, default: 0 },
    actualStock: { type: Number, default: 0 },
    quantityDifference: { type: Number, default: 0 },
    value: money,
    valueDifference: money,
    note: String,
  }],
}, { timestamps: true }));
