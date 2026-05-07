import { ProductBranchStock } from '../product/product.models.js';
import { moveProductQty } from '../product/product.service.js';
import { VendorPurchase, VendorRefund, VendorTransfer } from './vendor.models.js';

export async function completeVendorPurchase(purchaseId: string) {
  const purchase = await VendorPurchase.findById(purchaseId);
  if (!purchase) throw new Error('Vendor purchase not found');
  if (purchase.status === 'success') return purchase;

  for (const item of purchase.items) {
    await moveProductQty({
      productId: item.productId,
      branchId: purchase.branchId,
      sourceType: 'VendorPurchase',
      sourceId: purchase._id,
      amount: Number(item.amount ?? 0),
      valueAfter: Number(item.price ?? item.value ?? 0),
    });
  }

  purchase.status = 'success';
  await purchase.save();
  return purchase;
}

export async function completeVendorRefund(refundId: string) {
  const refund = await VendorRefund.findById(refundId);
  if (!refund) throw new Error('Vendor refund not found');
  if (refund.status === 'success') return refund;

  for (const item of refund.items) {
    await moveProductQty({
      productId: item.productId,
      branchId: refund.branchId,
      sourceType: 'VendorRefund',
      sourceId: refund._id,
      amount: -Number(item.amount ?? 0),
      valueAfter: Number(item.price ?? item.value ?? 0),
    });
  }

  refund.status = 'success';
  await refund.save();
  if (refund.purchaseId) await VendorPurchase.findByIdAndUpdate(refund.purchaseId, { status: 'refund' });
  return refund;
}

export async function completeVendorTransfer(transferId: string) {
  const transfer = await VendorTransfer.findById(transferId);
  if (!transfer) throw new Error('Vendor transfer not found');
  if (transfer.status === 'success') return transfer;

  for (const item of transfer.items) {
    const amount = Number(item.amount ?? 0);
    await moveProductQty({
      productId: item.productId,
      branchId: transfer.fromBranchId,
      sourceType: 'VendorTransferOut',
      sourceId: transfer._id,
      amount: -amount,
      valueAfter: Number(item.price ?? 0),
    });

    await ProductBranchStock.findOneAndUpdate(
      { productId: item.productId, branchId: transfer.toBranchId },
      { $inc: { qty: amount } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  transfer.status = 'success';
  transfer.dateTake = transfer.dateTake ?? new Date();
  await transfer.save();
  return transfer;
}
