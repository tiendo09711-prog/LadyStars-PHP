import { Schema, model } from 'mongoose';

export const CustomerGroup = model('CustomerGroup', new Schema({
  name: { type: String, required: true, unique: true },
  type: { type: String, enum: ['1', '2', '3'], default: '1' },
  note: String,
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true }));

const CustomerSchema = new Schema({
  type: { type: String, enum: ['person', 'company'], default: 'person' },
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  phone: String,
  phone2: String,
  email: String,
  birthday: Date,
  sex: { type: String, enum: ['female', 'male', 'other'], default: 'female' },
  address: String,
  provinceId: String,
  districtId: String,
  wardId: String,
  company: String,
  vat: String,
  facebook: String,
  note: String,
  totalSpent: { type: Number, default: 0 },
  purchaseCount: { type: Number, default: 0 },
  points: { type: Number, default: 0 },
  lastPurchaseDate: Date,
  daysSinceLastPurchase: Number,
  tags: [{ type: String }],
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  groups: [{ type: Schema.Types.ObjectId, ref: 'CustomerGroup' }],
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
CustomerSchema.index({ name: 'text', code: 'text', phone: 'text', email: 'text' });
export const Customer = model('Customer', CustomerSchema);
