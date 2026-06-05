import mongoose from 'mongoose';

export interface IRevenueTime {
  time: string;
  ordersPlaced: number;
  successfulOrders: number;
  retail: number;
  wholesale: number;
  vat: number;
  bhmr: number;
  returnFee: number;
  sales: number;
  discount: number;
  focus: number;
  revenue: number;
  expectedRevenue: number;
  revenuePlusVat: number;
  cost: number;
  profit: number;
  businessId: mongoose.Types.ObjectId;
}

const schema = new mongoose.Schema<IRevenueTime>(
  {
    time: { type: String, required: true },
    ordersPlaced: { type: Number, default: 0 },
    successfulOrders: { type: Number, default: 0 },
    retail: { type: Number, default: 0 },
    wholesale: { type: Number, default: 0 },
    vat: { type: Number, default: 0 },
    bhmr: { type: Number, default: 0 },
    returnFee: { type: Number, default: 0 },
    sales: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    focus: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
    expectedRevenue: { type: Number, default: 0 },
    revenuePlusVat: { type: Number, default: 0 },
    cost: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business' }
  },
  { timestamps: true }
);

export const RevenueTime = mongoose.model<IRevenueTime>('RevenueTime', schema);
