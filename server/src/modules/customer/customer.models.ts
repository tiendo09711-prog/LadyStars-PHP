import { Schema, model } from 'mongoose';

export const CustomerGroup = model('CustomerGroup', new Schema({
  name: { type: String, required: true, unique: true },
  description: String,
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true }));

const CustomerSchema = new Schema({
  type: { type: String, enum: ['person', 'company'], default: 'person' },
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  phone: String,
  email: String,
  birthday: Date,
  address: String,
  provinceId: String,
  districtId: String,
  wardId: String,
  note: String,
  groups: [{ type: Schema.Types.ObjectId, ref: 'CustomerGroup' }],
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
CustomerSchema.index({ name: 'text', code: 'text', phone: 'text', email: 'text' });
export const Customer = model('Customer', CustomerSchema);
