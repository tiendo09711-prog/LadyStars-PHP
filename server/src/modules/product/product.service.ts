import { PaymentMethod, Product, ProductBranchStock, ProductLog, ProductRefund, SalePayment, StockAdjustment } from './product.models.js';
import { Customer } from '../customer/customer.models.js';

class ProductFlowError extends Error {
  status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.status = status;
  }
}

function toNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function lineDiscount(base: number, discountValue: unknown, discountType: unknown) {
  const discount = toNumber(discountValue);
  if (discountType === 'percent') return Math.min(base, base * Math.max(discount, 0) / 100);
  return Math.min(base, Math.max(discount, 0));
}

export async function moveProductQty({
  productId,
  branchId,
  sourceType,
  sourceId,
  amount,
  valueAfter,
}: {
  productId: unknown;
  branchId?: unknown;
  sourceType: string;
  sourceId: unknown;
  amount: number;
  valueAfter?: number;
}) {
  const product = await Product.findById(productId);
  if (!product || product.type === 'service') return;
  const before = product.qty ?? 0;
  const after = before + amount;
  product.qty = after;
  await product.save();

  if (branchId) {
    const stock = await ProductBranchStock.findOneAndUpdate(
      { productId: product._id, branchId },
      { $inc: { qty: amount }, $setOnInsert: { minQuantity: product.minQuantity, maxQuantity: product.maxQuantity } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    if (stock.qty < 0) stock.qty = 0;
    await stock.save();
  }

  await ProductLog.create({
    productId: product._id,
    sourceType,
    sourceId,
    amount,
    valueBefore: product.price,
    valueAfter: valueAfter ?? product.price,
    amountBefore: before,
    amountAfter: after,
  });
}

export async function buildSalePaymentPayload(payload: any) {
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new ProductFlowError('Sale must include at least one product');
  }

  const items = [];
  let amountProducts = 0;
  let totalCost = 0;
  let grossValue = 0;

  for (const rawItem of payload.items) {
    const product = await Product.findById(rawItem.productId);
    if (!product) throw new ProductFlowError('Product not found', 404);
    if (product.allowsSale === false) throw new ProductFlowError(`Product ${product.code} is not allowed for sale`);

    const amount = toNumber(rawItem.amount);
    if (amount <= 0) throw new ProductFlowError(`Product ${product.code} must have a sale quantity greater than 0`);
    if (product.type !== 'service' && toNumber(product.qty) < amount) {
      throw new ProductFlowError(`Not enough stock for ${product.code} - ${product.name}`);
    }

    const unitValue = toNumber(rawItem.value, toNumber(product.price));
    const base = unitValue * amount;
    const discountValue = toNumber(rawItem.discountValue);
    const discountType = rawItem.discountType === 'percent' ? 'percent' : 'number';
    const total = Math.max(base - lineDiscount(base, discountValue, discountType), 0);

    amountProducts += amount;
    totalCost += toNumber(product.cost) * amount;
    grossValue += total;
    items.push({
      productId: product._id,
      amount,
      value: unitValue,
      cost: toNumber(product.cost),
      discountValue,
      discountType,
      total,
      note: rawItem.note ?? '',
    });
  }

  const orderDiscount = lineDiscount(grossValue, payload.discountValue, payload.discountType);
  const value = Math.max(grossValue - orderDiscount, 0);
  const rawPaymentLines = Array.isArray(payload.typePayment) ? payload.typePayment : [];
  const paymentByMethod = new Map<string, number>();
  for (const rawLine of rawPaymentLines) {
    const methodId = String(rawLine?.methodId ?? '').trim();
    const amount = toNumber(rawLine?.amount);
    if (!methodId || amount <= 0) continue;
    paymentByMethod.set(methodId, (paymentByMethod.get(methodId) ?? 0) + amount);
  }

  const typePayment = [...paymentByMethod.entries()].map(([methodId, amount]) => ({ methodId, amount }));
  if (typePayment.length > 0) {
    const activeMethodCount = await PaymentMethod.countDocuments({
      _id: { $in: typePayment.map(line => line.methodId) },
      isActive: { $ne: false },
    });
    if (activeMethodCount !== typePayment.length) {
      throw new ProductFlowError('Payment method is invalid or inactive');
    }
  }

  const paymentLineTotal = typePayment.reduce((sum, line) => sum + line.amount, 0);
  const valuePayment = Math.min(toNumber(payload.valuePayment, typePayment.length > 0 ? paymentLineTotal : value), value);
  if (typePayment.length > 0 && Math.abs(paymentLineTotal - valuePayment) > 0.5) {
    throw new ProductFlowError('Payment method amounts must equal the paid amount');
  }

  return {
    ...payload,
    items,
    amountProducts,
    totalCost,
    discountValue: toNumber(payload.discountValue),
    discountType: payload.discountType === 'percent' ? 'percent' : 'number',
    value,
    valuePayment,
    typePayment,
  };
}

export async function buildProductRefundPayload(payload: any) {
  const payment = await SalePayment.findById(payload.paymentId);
  if (!payment) throw new ProductFlowError('Sale payment not found', 404);
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new ProductFlowError('Refund must include at least one product');
  }

  const completedRefunds = await ProductRefund.find({ paymentId: payment._id, status: 'completed' });
  const refundedByProduct = new Map<string, number>();
  for (const refund of completedRefunds) {
    for (const item of refund.items) {
      const key = String(item.productId);
      refundedByProduct.set(key, (refundedByProduct.get(key) ?? 0) + toNumber(item.amount));
    }
  }

  const saleItemsByProduct = new Map<string, any>();
  for (const item of payment.items) {
    saleItemsByProduct.set(String(item.productId), item);
  }

  const items = [];
  let amount = 0;
  let value = 0;

  for (const rawItem of payload.items) {
    const productId = String(rawItem.productId);
    const saleItem = saleItemsByProduct.get(productId);
    if (!saleItem) throw new ProductFlowError('Refund item must belong to the selected sale');

    const refundAmount = toNumber(rawItem.amount);
    const available = toNumber(saleItem.amount) - (refundedByProduct.get(productId) ?? 0);
    if (refundAmount <= 0) throw new ProductFlowError('Refund quantity must be greater than 0');
    if (refundAmount > available) throw new ProductFlowError('Refund quantity exceeds sold quantity');

    const price = toNumber(rawItem.price, toNumber(saleItem.value));
    const base = price * refundAmount;
    const discountValue = toNumber(rawItem.discountValue);
    const discountType = rawItem.discountType === 'percent' ? 'percent' : 'number';
    const itemValue = Math.max(base - lineDiscount(base, discountValue, discountType), 0);
    amount += refundAmount;
    value += itemValue;
    items.push({ productId, amount: refundAmount, price, discountValue, discountType, value: itemValue });
  }

  return {
    ...payload,
    items,
    amount,
    originalTotalAmount: payment.value,
    totalPayableAmount: value,
    value,
  };
}

export async function assertSaleCanComplete(payment: any) {
  if (!Array.isArray(payment.items) || payment.items.length === 0) {
    throw new ProductFlowError('Sale must include at least one product');
  }

  for (const item of payment.items) {
    const product = await Product.findById(item.productId);
    if (!product) throw new ProductFlowError('Product not found', 404);
    if (product.allowsSale === false) throw new ProductFlowError(`Product ${product.code} is not allowed for sale`);
    if (product.type !== 'service' && toNumber(product.qty) < toNumber(item.amount)) {
      throw new ProductFlowError(`Not enough stock for ${product.code} - ${product.name}`);
    }
  }
}

export async function completeSalePayment(paymentId: string) {
  const payment = await SalePayment.findById(paymentId);
  if (!payment) throw new Error('Sale payment not found');
  if (payment.status === 'completed') return payment;
  if (payment.status === 'cancelled') throw new ProductFlowError('Cancelled sale cannot be completed');

  await assertSaleCanComplete(payment);

  for (const item of payment.items) {
    await moveProductQty({
      productId: item.productId,
      branchId: payment.branchId,
      sourceType: 'SalePayment',
      sourceId: payment._id,
      amount: -Number(item.amount ?? 0),
      valueAfter: Number(item.value ?? 0),
    });
  }

  payment.status = 'completed';
  payment.completedAt = new Date();
  await payment.save();

  if (payment.customerId) {
    const customer = await Customer.findById(payment.customerId);
    if (customer) {
      customer.totalSpent = (customer.totalSpent || 0) + (payment.value || 0);
      customer.purchaseCount = (customer.purchaseCount || 0) + 1;
      customer.lastPurchaseDate = new Date();
      customer.daysSinceLastPurchase = 0;
      await customer.save();
    }
  }

  return payment;
}

export async function completeProductRefund(refundId: string) {
  const refund = await ProductRefund.findById(refundId).populate('paymentId');
  if (!refund) throw new Error('Product refund not found');
  if (refund.status === 'completed') return refund;
  if (!Array.isArray(refund.items) || refund.items.length === 0) {
    throw new ProductFlowError('Refund must include at least one product');
  }
  const payment = refund.paymentId as any;

  for (const item of refund.items) {
    await moveProductQty({
      productId: item.productId,
      branchId: payment?.branchId,
      sourceType: 'ProductRefund',
      sourceId: refund._id,
      amount: Number(item.amount ?? 0),
      valueAfter: Number(item.price ?? 0),
    });
  }

  refund.status = 'completed';
  await refund.save();
  if (payment?._id) {
    await SalePayment.findByIdAndUpdate(payment._id, { status: 'refunded' });
  }
  return refund;
}

export async function completeStockAdjustment(stockId: string) {
  const stock = await StockAdjustment.findById(stockId);
  if (!stock) throw new Error('Stock adjustment not found');
  if (stock.status === 'completed') return stock;
  if (!Array.isArray(stock.items) || stock.items.length === 0) {
    throw new ProductFlowError('Stock adjustment must include at least one product');
  }

  let totalAmount = 0;
  let increase = 0;
  let decrease = 0;
  let totalValue = 0;

  for (const item of stock.items) {
    const product = await Product.findById(item.productId);
    if (!product || product.type === 'service') continue;
    const current = product.qty ?? 0;
    const actual = Number(item.actualStock ?? item.amount ?? current);
    const diff = actual - current;
    item.amount = current;
    item.actualStock = actual;
    item.quantityDifference = diff;
    item.value = actual * Number(product.cost ?? 0);
    item.valueDifference = diff * Number(product.cost ?? 0);
    totalAmount += actual;
    totalValue += item.value;
    if (diff > 0) increase += diff;
    if (diff < 0) decrease += Math.abs(diff);
    await moveProductQty({
      productId: product._id,
      branchId: stock.branchId,
      sourceType: 'StockAdjustment',
      sourceId: stock._id,
      amount: diff,
      valueAfter: product.cost,
    });
  }

  stock.amount = totalAmount;
  stock.increaseDeviation = increase;
  stock.decreaseDeviation = decrease;
  stock.deviation = increase - decrease;
  stock.value = totalValue;
  stock.status = 'completed';
  await stock.save();
  return stock;
}


