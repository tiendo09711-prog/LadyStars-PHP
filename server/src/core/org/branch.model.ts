import { Schema, model } from 'mongoose';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeCode(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

const TotalLabelsSchema = new Schema({
  subtotal: { type: String, trim: true, default: 'Tổng cộng' },
  discount: { type: String, trim: true, default: 'Giảm giá' },
  total: { type: String, trim: true, default: 'Thành tiền' },
  paid: { type: String, trim: true, default: 'Đã thanh toán' },
  change: { type: String, trim: true, default: 'Tiền trả lại' },
}, { _id: false });

const TypographySchema = new Schema({
  titleAlign: { type: String, enum: ['left', 'center', 'right'], default: 'center' },
  bodyFontSize: { type: String, enum: ['small', 'normal'], default: 'normal' },
}, { _id: false });

const TemplateConfigSchema = new Schema({
  version: { type: Number, default: 1 },
  title: { type: String, trim: true, default: '' },
  subtitle: { type: String, trim: true, default: '' },
  noteText: { type: String, trim: true, default: '' },
  totalLabels: { type: TotalLabelsSchema, default: () => ({}) },
  typography: { type: TypographySchema, default: () => ({}) },
}, { _id: false });

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
  templateConfig: { type: TemplateConfigSchema, default: () => ({}) },
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
      validator: (value: string | undefined) => !value || /^[0-9+\-()\s.]+$/.test(value),
      message: 'Hotline không hợp lệ.',
    },
  },
  address: { type: String, trim: true, set: trimString },
  isActive: { type: Boolean, default: true },
  invoiceProfile: { type: InvoiceProfileSchema, default: () => ({}) },
}, { timestamps: true });

BranchSchema.index({ name: 'text', code: 'text', phone: 'text' });

export const Branch = model('Branch', BranchSchema);
