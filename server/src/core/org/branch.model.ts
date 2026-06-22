import { Schema, model } from 'mongoose';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeCode(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

const InvoiceProfileSchema = new Schema({
  displayName: { type: String, trim: true, default: '' },
  templateId: {
    type: String,
    enum: ['retail-a4-classic'],
    default: 'retail-a4-classic',
  },
  footerText: {
    type: String,
    trim: true,
    default: 'Cảm ơn quý khách đã mua hàng!',
  },
  showBranchName: { type: Boolean, default: false },
  showCashier: { type: Boolean, default: true },
  showProductCode: { type: Boolean, default: false },
  showLogo: { type: Boolean, default: false },
}, { _id: false });

const BranchSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    set: trimString,
    validate: {
      validator: (value: string) => Boolean(String(value || '').trim()),
      message: 'Tên kho không được để trống.',
    },
  },
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
    immutable: true,
    set: normalizeCode,
    match: [/^\S+$/, 'Mã kho không được chứa khoảng trắng.'],
  },
  phone: {
    type: String,
    trim: true,
    set: trimString,
    validate: {
      validator: (value: string | undefined) => !value || /^[0-9+\-()\s]+$/.test(value),
      message: 'Hotline không hợp lệ.',
    },
  },
  address: { type: String, trim: true, set: trimString },
  isActive: { type: Boolean, default: true },
  invoiceProfile: { type: InvoiceProfileSchema, default: () => ({}) },
}, { timestamps: true });

BranchSchema.index({ name: 'text', code: 'text', phone: 'text' });

export const Branch = model('Branch', BranchSchema);
