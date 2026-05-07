import { Product, ProductLog, SalePayment } from './product.models.js';

export async function completeSalePayment(paymentId: string) {
  const payment = await SalePayment.findById(paymentId);
  if (!payment) throw new Error('Sale payment not found');
  if (payment.status === 'completed') return payment;

  for (const item of payment.items) {
    const product = await Product.findById(item.productId);
    if (!product || product.type === 'service') continue;
    const before = product.qty ?? 0;
    const after = before - Number(item.amount ?? 0);
    product.qty = after;
    await product.save();
    await ProductLog.create({
      productId: product._id,
      sourceType: 'SalePayment',
      sourceId: payment._id,
      amount: -Number(item.amount ?? 0),
      valueBefore: product.price,
      valueAfter: item.value,
      amountBefore: before,
      amountAfter: after,
    });
  }

  payment.status = 'completed';
  payment.completedAt = new Date();
  await payment.save();
  return payment;
}
