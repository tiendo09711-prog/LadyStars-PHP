import { Product, ProductBranchStock, ProductLog, ProductRefund, SalePayment, StockAdjustment } from './product.models.js';

async function moveProductQty({
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

export async function completeSalePayment(paymentId: string) {
  const payment = await SalePayment.findById(paymentId);
  if (!payment) throw new Error('Sale payment not found');
  if (payment.status === 'completed') return payment;

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
  return payment;
}

export async function completeProductRefund(refundId: string) {
  const refund = await ProductRefund.findById(refundId).populate('paymentId');
  if (!refund) throw new Error('Product refund not found');
  if (refund.status === 'completed') return refund;
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

export { moveProductQty };
