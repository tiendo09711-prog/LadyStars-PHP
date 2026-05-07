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

export const ExpensePayment = model('ExpensePayment', new Schema({
  ...FinanceSchema,
  payPersonId: { type: Schema.Types.ObjectId, ref: 'PayPerson' },
}, { timestamps: true }));
