import { Schema, model } from 'mongoose';

const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  phone: String,
  role: { type: String, enum: ['ADMIN', 'EMPLOYEE', 'owner', 'staff'], default: 'EMPLOYEE' },
  status: { type: String, enum: ['ACTIVE', 'LOCKED', 'open', 'lock'], default: 'ACTIVE' },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  assignedWarehouseIds: [{ type: Schema.Types.ObjectId, ref: 'Branch' }],
  defaultWarehouseId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdById: { type: Schema.Types.ObjectId, ref: 'User' },
  lastLoginAt: Date,
  lockedAt: Date,
  deletedAt: Date,
  tokenVersion: { type: Number, default: 0 },
  isRootOwner: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

UserSchema.index({ name: 'text', email: 'text' });
UserSchema.index({ role: 1, status: 1, deletedAt: 1 });
UserSchema.index({ role: 1 }, { unique: true, partialFilterExpression: { role: 'ADMIN', isActive: true, deletedAt: { $exists: false } } });
UserSchema.index({ assignedWarehouseIds: 1, status: 1 });
export const User = model('User', UserSchema);
