import { Schema, model } from 'mongoose';
const money = { type: Number, default: 0, min: 0 };

export const VendorGroup = model('VendorGroup', new Schema({
  name: { type: String, required: true, unique: true },
  description: String,
}, { timestamps: true }));

export const Vendor = model('Vendor', new Schema({
  type: { type: String, enum: ['person', 'company'], default: 'company' },
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  phone: String,
  email: String,
  address: String,
  note: String,
  groups: [{ type: Schema.Types.ObjectId, ref: 'VendorGroup' }],
}, { timestamps: true }));

const PurchaseItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  amount: { type: Number, default: 0 },
  value: money,
  discountValue: money,
  discountType: { type: String, enum: ['percent', 'number'], default: 'number' },
  total: money,
  note: String,
}, { _id: false });

export const VendorPurchase = model('VendorPurchase', new Schema({
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor' },
  code: { type: String, required: true, unique: true },
  totalCost: money,
  discountValue: money,
  value: money,
  valuePayment: money,
  status: { type: String, default: 'draft' },
  note: String,
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  items: [PurchaseItemSchema],
}, { timestamps: true }));

export const VendorRefund = model('VendorRefund', new Schema({
  purchaseId: { type: Schema.Types.ObjectId, ref: 'VendorPurchase' },
  vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor' },
  code: { type: String, required: true, unique: true },
  value: money,
  status: { type: String, default: 'draft' },
  note: String,
  items: [PurchaseItemSchema],
}, { timestamps: true }));

export const VendorTransfer = model('VendorTransfer', new Schema({
  fromBranchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  toBranchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  code: { type: String, required: true, unique: true },
  status: { type: String, default: 'draft' },
  note: String,
  items: [{ productId: { type: Schema.Types.ObjectId, ref: 'Product' }, amount: Number, note: String }],
}, { timestamps: true }));
