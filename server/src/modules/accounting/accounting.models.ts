import { Schema, model } from 'mongoose';
const money = { type: Number, default: 0, min: 0 };
export const AccountingType = model('AccountingType', new Schema({
  name: { type: String, required: true },
  kind: { type: String, enum: ['receipt', 'payment'], required: true },
  type: { type: String, enum: ['receipt', 'payment'] },
  note: String,
  description: String,
}, { timestamps: true }));

export const PayPerson = model('PayPerson', new Schema({
  name: { type: String, required: true },
  phone: String,
  email: String,
  address: String,
  provinceId: String,
  districtId: String,
  wardId: String,
  note: String,
}, { timestamps: true }));

const FinanceSchema = {
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  code: { type: String, required: true, unique: true },
  date: Date,
  typeId: { type: Schema.Types.ObjectId, ref: 'AccountingType' },
  value: money,
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  userCreatedId: { type: Schema.Types.ObjectId, ref: 'User' },
  financeType: String,
  financeId: Schema.Types.ObjectId,
  businessResult: { type: Boolean, default: false },
  note: String,
};

export const Receipt = model('Receipt', new Schema({
  ...FinanceSchema,
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
}, { timestamps: true }));
Receipt.schema.index({ branchId: 1, createdAt: -1 });
Receipt.schema.index({ createdAt: -1 });

export const ExpensePayment = model('ExpensePayment', new Schema({
  ...FinanceSchema,
  payPersonId: { type: Schema.Types.ObjectId, ref: 'PayPerson' },
}, { timestamps: true }));
ExpensePayment.schema.index({ branchId: 1, createdAt: -1 });
ExpensePayment.schema.index({ createdAt: -1 });

export const CashTransaction = model('CashTransaction', new Schema({
  transactionId: { type: String, required: true, unique: true },
  date: { type: Date, required: true },
  type: { type: String, required: true }, // 'Phiếu thu' or 'Phiếu chi'
  accountCode: String,
  accountName: String,
  contraAccountCode: String,
  contraAccountName: String,
  targetCode: String,
  targetName: String,
  voucherType: String,
  voucherId: String,
  revenue: { type: Number, default: 0 },
  expense: { type: Number, default: 0 },
  description: String,
  creatorName: String,
}, { timestamps: true }));
CashTransaction.schema.index({ date: -1, type: 1 });

export const BankTransaction = model('BankTransaction', new Schema({
  transactionId: { type: String, required: true, unique: true },
  date: { type: Date, required: true },
  type: { type: String, required: true },
  accountCode: String,
  accountName: String,
  contraAccountCode: String,
  contraAccountName: String,
  targetCode: String,
  targetName: String,
  voucherType: String,
  voucherId: String,
  revenue: { type: Number, default: 0 },
  expense: { type: Number, default: 0 },
  description: String,
  creatorName: String,
}, { timestamps: true }));
BankTransaction.schema.index({ date: -1, type: 1 });

export const SummaryTransaction = model('SummaryTransaction', new Schema({
  transactionId: { type: String, required: true, unique: true },
  date: { type: Date, required: true },
  type: { type: String, required: true },
  accountCode: String,
  accountName: String,
  targetName: String,
  voucherType: String,
  voucherId: String,
  revenue: { type: Number, default: 0 },
  expense: { type: Number, default: 0 },
  description: String,
}, { timestamps: true }));
SummaryTransaction.schema.index({ date: -1, type: 1 });

export const CustomerDebtSummary = model('CustomerDebtSummary', new Schema({
  code: { type: String, required: true },
  customerName: { type: String },
  phone: { type: String },
  address: { type: String },
  initialReceivable: { type: Number, default: 0 },
  initialPayable: { type: Number, default: 0 },
  incurredReceivable: { type: Number, default: 0 },
  incurredPayable: { type: Number, default: 0 },
  finalReceivable: { type: Number, default: 0 },
  finalPayable: { type: Number, default: 0 },
}, { timestamps: true }));

export const CustomerDebtRecord = model('CustomerDebtRecord', new Schema({
  invoiceCode: { type: String, required: true },
  creator: { type: String },
  dueDate: { type: Date },
  customerCode: { type: String },
  customerName: { type: String },
  amount: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  totalPayment: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
  remainingDebt: { type: Number, default: 0 },
  salesperson: { type: String },
}, { timestamps: true }));
CustomerDebtRecord.schema.index({ customerCode: 1, dueDate: 1 });

export const StaffDebtSummary = model('StaffDebtSummary', new Schema({
  staffName: { type: String, required: true },
  collectedRetail: { type: Number, default: 0 },
  collectedOrders: { type: Number, default: 0 },
  remainingDebt: { type: Number, default: 0 },
}, { timestamps: true }));

export const VendorDebtSummary = model('VendorDebtSummary', new Schema({
  code: { type: String, required: true },
  vendorName: { type: String, required: true },
  phone: { type: String },
  initialReceivable: { type: Number, default: 0 },
  initialPayable: { type: Number, default: 0 },
  incurredReceivable: { type: Number, default: 0 },
  incurredPayable: { type: Number, default: 0 },
  finalReceivable: { type: Number, default: 0 },
  finalPayable: { type: Number, default: 0 },
}, { timestamps: true }));

export const VendorDebtRecord = model('VendorDebtRecord', new Schema({
  vendorCode: { type: String, required: true },
  invoiceCode: { type: String, required: true },
  creator: { type: String },
  dueDate: { type: Date },
  vendorName: { type: String, required: true },
  amount: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  totalPayment: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
  remainingDebt: { type: Number, default: 0 },
  purchaser: { type: String },
}, { timestamps: true }));
VendorDebtRecord.schema.index({ vendorCode: 1, dueDate: 1 });

export const LogBookEntry = model('LogBookEntry', new Schema({
  date: { type: String },
  transactionId: { type: String, required: true },
  voucherId: { type: String },
  account: { type: String },
  contraAccount: { type: String },
  debit: { type: Number, default: null },
  credit: { type: Number, default: null },
}, { timestamps: true }));
LogBookEntry.schema.index({ createdAt: -1, transactionId: 1 });

export const InstallmentCollection = model('InstallmentCollection', new Schema({
  transactionId: { type: String, required: true, unique: true },
  accountCode: String,
  accountName: String,
  date: Date,
  cashier: String,
  customerName: String,
  customerPhone: String,
  serviceCode: String,
  serviceName: String,
  contractCode: String,
  dueDate: Date,
  amount: { type: Number, default: 0 },
  status: String,
  vendorName: String,
  note: String,
}, { timestamps: true }));

export const AccountingTransactionLog = model('AccountingTransactionLog', new Schema({
  logId: { type: String, required: true, unique: true },
  transactionId: String,
  transactionDate: Date,
  documentType: String,
  documentCode: String,
  transactionType: String,
  totalAmount: { type: Number, default: 0 },
  operator: String,
  operationDate: Date,
  action: String,
  dataDetail: String,
}, { timestamps: true }));

export const AccountingAccount = model('AccountingAccount', new Schema({
  id: { type: String, required: true, unique: true },
  code: { type: String, required: true },
  name: { type: String, required: true },
  warehouse: { type: String, default: '' },
  status: { type: String, default: 'Kích hoạt' },
  creator: { type: String },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true }));

export const InstallmentService = model('InstallmentService', new Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  targetCode: { type: String },
  phone: { type: String },
  address: { type: String },
  creator: { type: String },
  totalAmount: { type: Number, default: 0 },
  prepaidAmount: { type: Number, default: 0 },
  interestRate: { type: Number, default: 0 },
  months: { type: Number, default: 1 },
  monthlyPayment: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true }));

export const InstallmentSetting = model('InstallmentSetting', new Schema({
  defaultInterestRate: { type: Number, default: 1.5 },
  lateFeeRate: { type: Number, default: 0.1 },
}, { timestamps: true }));
