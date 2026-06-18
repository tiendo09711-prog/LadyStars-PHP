import { Schema, model } from 'mongoose';
const money = { type: Number, default: 0, min: 0 };

export const VendorGroup = model('VendorGroup', new Schema({
  name: { type: String, required: true, unique: true },
  note: String,
  userCreatedId: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true }));

const VendorSchema = new Schema({
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  type: { type: String, enum: ['person', 'company'], default: 'company' },
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  vat: String,
  company: String,
  phone: String,
  email: String,
  address: String,
  provinceId: String,
  districtId: String,
  wardId: String,
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  total: money,
  debt: money,
  totalPurchase: money,
  note: String,
  groups: [{ type: Schema.Types.ObjectId, ref: 'VendorGroup' }],
  userCreatedId: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

VendorSchema.pre('find', function(next) {
  this.populate('userCreatedId', 'name');
  next();
});
VendorSchema.pre('findOne', function(next) {
  this.populate('userCreatedId', 'name');
  next();
});

VendorSchema.index({ name: 'text', code: 'text', phone: 'text', email: 'text' });
export const Vendor = model('Vendor', VendorSchema);


const PurchaseItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  amount: { type: Number, default: 0 },
  price: money,
  discountValue: money,
  discountType: { type: String, enum: ['percent', 'number'], default: 'number' },
  value: money,
  total: money,
  note: String,
}, { _id: false });

const VendorPurchaseSchema = new Schema({
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor' },
  code: { type: String, required: true, unique: true },
  discountValue: money,
  discountType: { type: String, enum: ['percent', 'number'], default: 'number' },
  total: money,
  needPay: money,
  value: money,
  valuePayment: money,
  status: { type: String, enum: ['temp', 'success', 'refund', 'cancel', 'draft'], default: 'temp' },
  note: String,
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  userCreatedId: { type: Schema.Types.ObjectId, ref: 'User' },
  items: [PurchaseItemSchema],
}, { timestamps: true });
VendorPurchaseSchema.index({ createdAt: -1, status: 1 });
VendorPurchaseSchema.index({ vendorId: 1, createdAt: -1 });
export const VendorPurchase = model('VendorPurchase', VendorPurchaseSchema);

export const VendorRefund = model('VendorRefund', new Schema({
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  purchaseId: { type: Schema.Types.ObjectId, ref: 'VendorPurchase' },
  vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor' },
  code: { type: String, required: true, unique: true },
  total: money,
  discountValue: money,
  value: money,
  discountType: { type: String, enum: ['percent', 'number'], default: 'number' },
  status: { type: String, enum: ['temp', 'success', 'cancel', 'draft'], default: 'temp' },
  note: String,
  userCreatedId: { type: Schema.Types.ObjectId, ref: 'User' },
  items: [PurchaseItemSchema],
}, { timestamps: true }));

export const VendorTransfer = model('VendorTransfer', new Schema({
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  fromBranchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  toBranchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  code: { type: String, required: true, unique: true },
  status: { type: String, enum: ['temp', 'delivery', 'success', 'fail', 'draft'], default: 'temp' },
  dateSend: Date,
  dateTake: Date,
  note: String,
  userCreatedId: { type: Schema.Types.ObjectId, ref: 'User' },
  items: [{
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    amount: { type: Number, default: 0 },
    price: money,
    value: money,
    note: String,
  }],
}, { timestamps: true }));
