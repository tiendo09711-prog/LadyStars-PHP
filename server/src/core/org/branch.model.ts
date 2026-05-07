import { Schema, model } from 'mongoose';

const BranchSchema = new Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  phone: String,
  address: String,
  isDefault: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

BranchSchema.index({ name: 'text', code: 'text', phone: 'text' });

export const Branch = model('Branch', BranchSchema);
