import mongoose, { type ClientSession } from 'mongoose';
import { PaymentMethod, Product, ProductBranchStock, ProductLog, ProductRefund, SalePayment, StockAdjustment } from './product.models.js';
import { recomputeCustomerMetricsByIds } from '../customer/customer.metrics.js';

class ProductFlowError extends Error {
  status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.status = status;
  }
}

type PaymentLine = { methodId: string; amount: number };
type BuildSaleOptions = {
  session?: ClientSession;
  stockAllowanceByProduct?: Map<string, number>;
};

const MONEY_TOLERANCE = 1;

function buildNextCode(prefix: string) {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(2, 14);
  return `${prefix}${stamp}`;
}

function applySession<T extends { session?: (session: ClientSession) => T }>(query: T, session?: ClientSession) {
  return session && query.session ? query.session(session) : query;
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

function normalizeObjectIdString(value: unknown) {
  return String(value ?? '').trim();
}

function sumPaymentLines(lines: PaymentLine[]) {
  return lines.reduce((sum, line) => sum + toNumber(line.amount), 0);
}

function uniqueCustomerIds(...values: Array<unknown>) {
  return [...new Set(values.map((value) => normalizeObjectIdString(value)).filter(Boolean))];
}

function groupQuantitiesByProduct(items: Array<{ productId?: unknown; amount?: unknown }> = []) {
  const grouped = new Map<string, number>();
  for (const item of items) {
    const productId = normalizeObjectIdString(item?.productId);
    if (!productId) continue;
    grouped.set(productId, (grouped.get(productId) ?? 0) + toNumber(item?.amount));
  }
  return grouped;
}

function groupUnitValuesByProduct(items: Array<{ productId?: unknown; value?: unknown; price?: unknown }> = []) {
  const grouped = new Map<string, number>();
  for (const item of items) {
    const productId = normalizeObjectIdString(item?.productId);
    if (!productId || grouped.has(productId)) continue;
    grouped.set(productId, toNumber(item?.value, toNumber(item?.price)));
  }
  return grouped;
}

async function getAvailableStockForSale(product: any, branchId?: unknown, session?: ClientSession) {
  if (product.type === 'service') return Number.POSITIVE_INFINITY;
  if (!branchId) return toNumber(product.qty);

  const stockQuery = ProductBranchStock.findOne({ productId: product._id, branchId }).lean();
  const stock = await applySession(stockQuery, session);
  return toNumber(stock?.qty);
}

async function normalizePaymentLines(rawLines: unknown, session?: ClientSession) {
  const paymentByMethod = new Map<string, number>();

  if (Array.isArray(rawLines)) {
    for (const rawLine of rawLines) {
      const methodId = normalizeObjectIdString((rawLine as any)?.methodId);
      const amount = toNumber((rawLine as any)?.amount);
      if (!methodId || amount <= 0) continue;
      paymentByMethod.set(methodId, (paymentByMethod.get(methodId) ?? 0) + amount);
    }
  }

  const lines = [...paymentByMethod.entries()].map(([methodId, amount]) => ({ methodId, amount }));
  if (lines.length === 0) return lines;

  const countQuery = PaymentMethod.countDocuments({
    _id: { $in: lines.map((line) => line.methodId) },
    isActive: { $ne: false },
  });
  const activeMethodCount = await applySession(countQuery, session);
  if (activeMethodCount !== lines.length) {
    throw new ProductFlowError('Payment method is invalid or inactive');
  }

  return lines;
}

async function loadProduct(productId: unknown, session?: ClientSession) {
  const productQuery = Product.findById(productId);
  return applySession(productQuery, session);
}

async function loadSale(paymentId: unknown, session?: ClientSession) {
  const saleQuery = SalePayment.findById(paymentId);
  return applySession(saleQuery, session);
}

async function loadRefund(refundId: unknown, session?: ClientSession) {
  const refundQuery = ProductRefund.findById(refundId).populate('paymentId');
  return applySession(refundQuery, session);
}

async function countActiveRefundDocuments(paymentId: unknown, session?: ClientSession) {
  const countQuery = ProductRefund.countDocuments({
    paymentId,
    status: { $ne: 'cancelled' },
  });
  return applySession(countQuery, session);
}

async function completedRefundsForSale(paymentId: unknown, session?: ClientSession) {
  const refundsQuery = ProductRefund.find({ paymentId, status: 'completed' }).lean();
  return applySession(refundsQuery, session);
}

async function syncSaleRefundState(paymentId: unknown, session?: ClientSession) {
  const sale = await loadSale(paymentId, session);
  if (!sale) return null;

  const completedRefunds = await completedRefundsForSale(sale._id, session);
  const refundedByProduct = new Map<string, number>();
  let refundedValue = 0;

  for (const refund of completedRefunds) {
    refundedValue += toNumber((refund as any).value, toNumber((refund as any).totalPayableAmount));
    for (const item of (refund as any).items || []) {
      const productId = normalizeObjectIdString(item?.productId);
      if (!productId) continue;
      refundedByProduct.set(productId, (refundedByProduct.get(productId) ?? 0) + toNumber(item?.amount));
    }
  }

  const fullRefund =
    sale.items.length > 0
    && sale.items.every((item: any) => (refundedByProduct.get(normalizeObjectIdString(item.productId)) ?? 0) >= toNumber(item.amount));
  const refundStatus = completedRefunds.length === 0 ? 'none' : fullRefund ? 'full' : 'partial';

  sale.refundedValue = refundedValue;
  sale.refundStatus = refundStatus;
  await sale.save({ session });
  return sale;
}

export async function moveProductQty({
  productId,
  branchId,
  sourceType,
  sourceId,
  amount,
  valueAfter,
  session,
}: {
  productId: unknown;
  branchId?: unknown;
  sourceType: string;
  sourceId: unknown;
  amount: number;
  valueAfter?: number;
  session?: ClientSession;
}) {
  const product = await loadProduct(productId, session);
  if (!product || product.type === 'service') return;
  const before = product.qty ?? 0;
  const after = before + amount;
  product.qty = after;
  await product.save({ session });

  if (branchId) {
    const stockQuery = ProductBranchStock.findOneAndUpdate(
      { productId: product._id, branchId },
      { $inc: { qty: amount }, $setOnInsert: { minQuantity: product.minQuantity, maxQuantity: product.maxQuantity } },
      { upsert: true, new: true, setDefaultsOnInsert: true, session },
    );
    const stock = await stockQuery;
    if (stock.qty < 0) stock.qty = 0;
    await stock.save({ session });
  }

  await ProductLog.create([{
    productId: product._id,
    sourceType,
    sourceId,
    amount,
    valueBefore: product.price,
    valueAfter: valueAfter ?? product.price,
    amountBefore: before,
    amountAfter: after,
  }], { session });
}

export async function buildSalePaymentPayload(payload: any, options: BuildSaleOptions = {}) {
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new ProductFlowError('Sale must include at least one product');
  }

  const items = [];
  let amountProducts = 0;
  let totalCost = 0;
  let grossValue = 0;

  for (const rawItem of payload.items) {
    const product = await loadProduct(rawItem.productId, options.session);
    if (!product) throw new ProductFlowError('Product not found', 404);
    if (product.allowsSale === false) throw new ProductFlowError(`Product ${product.code} is not allowed for sale`);

    const amount = toNumber(rawItem.amount);
    if (amount <= 0) throw new ProductFlowError(`Product ${product.code} must have a sale quantity greater than 0`);
    const availableStock = await getAvailableStockForSale(product, payload.branchId, options.session);
    const stockAllowance = options.stockAllowanceByProduct?.get(String(product._id)) ?? 0;
    if (product.type !== 'service' && availableStock + stockAllowance < amount) {
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
      isGift: rawItem.isGift === true,
      gift: rawItem.gift === true,
      giftForProductId: rawItem.giftForProductId || undefined,
    });
  }

  const orderDiscount = lineDiscount(grossValue, payload.discountValue, payload.discountType);
  const value = Math.max(grossValue - orderDiscount, 0);
  const typePayment = await normalizePaymentLines(payload.typePayment, options.session);
  const paymentLineTotal = sumPaymentLines(typePayment);
  const settlementValue = Math.min(Math.max(0, toNumber(payload.settlementValue)), value);
  const rawValuePayment = payload.valuePayment === undefined || payload.valuePayment === null
    ? paymentLineTotal
    : toNumber(payload.valuePayment);
  const valuePayment = Math.min(Math.max(rawValuePayment, 0), value);
  const rawTenderedValue = payload.tenderedValue === undefined || payload.tenderedValue === null
    ? valuePayment
    : toNumber(payload.tenderedValue);
  const tenderedValue = Math.max(rawTenderedValue, valuePayment);

  if (Math.abs(paymentLineTotal - valuePayment) > MONEY_TOLERANCE) {
    throw new ProductFlowError('Payment method amounts must equal the paid amount');
  }
  if (valuePayment + settlementValue - value > MONEY_TOLERANCE) {
    throw new ProductFlowError('Settlement exceeds the invoice total');
  }

  return {
    ...payload,
    items,
    amountProducts,
    totalCost,
    discountValue: toNumber(payload.discountValue),
    discountType: payload.discountType === 'percent' ? 'percent' : 'number',
    settlementValue,
    value,
    valuePayment,
    tenderedValue,
    typePayment,
  };
}

export async function buildProductRefundPayload(payload: any, options: { session?: ClientSession } = {}) {
  const payment = await loadSale(payload.paymentId, options.session);
  if (!payment) throw new ProductFlowError('Sale payment not found', 404);
  if (payment.status === 'cancelled') throw new ProductFlowError('Cancelled sale cannot be refunded');
  if (payment.status !== 'completed') throw new ProductFlowError('Only completed sales can be refunded');
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new ProductFlowError('Refund must include at least one product');
  }

  const completedRefunds = await completedRefundsForSale(payment._id, options.session);
  const refundedByProduct = new Map<string, number>();
  for (const refund of completedRefunds) {
    for (const item of (refund as any).items || []) {
      const key = normalizeObjectIdString(item?.productId);
      refundedByProduct.set(key, (refundedByProduct.get(key) ?? 0) + toNumber(item?.amount));
    }
  }

  const saleItemsByProduct = new Map<string, any>();
  for (const item of payment.items) {
    saleItemsByProduct.set(normalizeObjectIdString(item.productId), item);
  }

  const items = [];
  let amount = 0;
  let value = 0;

  for (const rawItem of payload.items) {
    const productId = normalizeObjectIdString(rawItem.productId);
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
    items.push({
      productId,
      amount: refundAmount,
      price,
      cost: toNumber((saleItem as any).cost),
      discountValue,
      discountType,
      value: itemValue,
    });
  }

  const settlementValue = Math.min(Math.max(0, toNumber(payload.settlementValue)), value);
  const typePayment = await normalizePaymentLines(payload.typePayment, options.session);
  const totalPayableAmount = Math.max(value - settlementValue, 0);
  const refundPaymentTotal = sumPaymentLines(typePayment);

  if (Math.abs(refundPaymentTotal - totalPayableAmount) > MONEY_TOLERANCE) {
    throw new ProductFlowError('Refund payment lines must equal the cash value returned to the customer');
  }

  return {
    ...payload,
    items,
    amount,
    typePayment,
    settlementValue,
    originalTotalAmount: payment.value,
    totalPayableAmount,
    value,
  };
}

export async function assertSaleCanComplete(payment: any, options: BuildSaleOptions = {}) {
  if (!Array.isArray(payment.items) || payment.items.length === 0) {
    throw new ProductFlowError('Sale must include at least one product');
  }

  for (const item of payment.items) {
    const product = await loadProduct(item.productId, options.session);
    if (!product) throw new ProductFlowError('Product not found', 404);
    if (product.allowsSale === false) throw new ProductFlowError(`Product ${product.code} is not allowed for sale`);
    const availableStock = await getAvailableStockForSale(product, payment.branchId, options.session);
    const stockAllowance = options.stockAllowanceByProduct?.get(String(product._id)) ?? 0;
    if (product.type !== 'service' && availableStock + stockAllowance < toNumber(item.amount)) {
      throw new ProductFlowError(`Not enough stock for ${product.code} - ${product.name}`);
    }
  }
}

export async function completeSalePayment(
  paymentId: string,
  options: { session?: ClientSession; recomputeMetrics?: boolean } = {},
) {
  if (!options.session) {
    const session = await mongoose.startSession();
    let completed: any = null;
    let customerId = '';

    try {
      await session.withTransaction(async () => {
        completed = await completeSalePayment(paymentId, {
          ...options,
          session,
          recomputeMetrics: false,
        });
        customerId = normalizeObjectIdString(completed?.customerId);
      });
    } finally {
      await session.endSession();
    }

    if (options.recomputeMetrics !== false && customerId) {
      await recomputeCustomerMetricsByIds([customerId]);
    }

    return completed;
  }

  const payment = await loadSale(paymentId, options.session);
  if (!payment) throw new Error('Sale payment not found');
  if (payment.status === 'completed') return payment;
  if (payment.status === 'cancelled') throw new ProductFlowError('Cancelled sale cannot be completed');

  await assertSaleCanComplete(payment, { session: options.session });

  for (const item of payment.items) {
    await moveProductQty({
      productId: item.productId,
      branchId: payment.branchId,
      sourceType: 'SalePayment',
      sourceId: payment._id,
      amount: -Number(item.amount ?? 0),
      valueAfter: Number(item.value ?? 0),
      session: options.session,
    });
  }

  payment.status = 'completed';
  payment.completedAt = new Date();
  await payment.save({ session: options.session });

  return payment;
}

export async function completeProductRefund(
  refundId: string,
  options: { session?: ClientSession; recomputeMetrics?: boolean } = {},
) {
  if (!options.session) {
    const session = await mongoose.startSession();
    let completed: any = null;
    let customerId = '';

    try {
      await session.withTransaction(async () => {
        completed = await completeProductRefund(refundId, {
          ...options,
          session,
          recomputeMetrics: false,
        });
        customerId = normalizeObjectIdString((completed?.paymentId as any)?.customerId);
      });
    } finally {
      await session.endSession();
    }

    if (options.recomputeMetrics !== false && customerId) {
      await recomputeCustomerMetricsByIds([customerId]);
    }

    return completed;
  }

  const refund = await loadRefund(refundId, options.session);
  if (!refund) throw new Error('Product refund not found');
  if (refund.status === 'completed') return refund;
  if (!Array.isArray(refund.items) || refund.items.length === 0) {
    throw new ProductFlowError('Refund must include at least one product');
  }
  const payment = refund.paymentId as any;
  if (!payment?._id) throw new ProductFlowError('Sale payment not found', 404);
  if (payment.status === 'cancelled') throw new ProductFlowError('Cancelled sale cannot be refunded');
  if (payment.status !== 'completed') throw new ProductFlowError('Only completed sales can be refunded');

  const completedRefunds = await completedRefundsForSale(payment._id, options.session);
  const refundedByProduct = new Map<string, number>();
  for (const completedRefund of completedRefunds) {
    if (String((completedRefund as any)._id) === String(refund._id)) continue;
    for (const item of (completedRefund as any).items || []) {
      const productId = normalizeObjectIdString(item?.productId);
      if (!productId) continue;
      refundedByProduct.set(productId, (refundedByProduct.get(productId) ?? 0) + toNumber(item?.amount));
    }
  }

  const soldByProduct = groupQuantitiesByProduct(payment.items as any[]);
  for (const item of refund.items) {
    const productId = normalizeObjectIdString(item?.productId);
    const soldQuantity = soldByProduct.get(productId) ?? 0;
    if (soldQuantity <= 0) throw new ProductFlowError('Refund item must belong to the selected sale');
    const nextRefundedQuantity = (refundedByProduct.get(productId) ?? 0) + toNumber(item?.amount);
    if (nextRefundedQuantity - soldQuantity > MONEY_TOLERANCE) {
      throw new ProductFlowError('Refund quantity exceeds sold quantity');
    }
  }

  for (const item of refund.items) {
    await moveProductQty({
      productId: item.productId,
      branchId: payment?.branchId,
      sourceType: 'ProductRefund',
      sourceId: refund._id,
      amount: Number(item.amount ?? 0),
      valueAfter: Number(item.price ?? 0),
      session: options.session,
    });
  }

  refund.status = 'completed';
  refund.completedAt = new Date();
  await refund.save({ session: options.session });
  if (payment?._id) await syncSaleRefundState(payment._id, options.session);
  return refund;
}

export async function reviseCompletedSalePayment(paymentId: string, payload: any) {
  const session = await mongoose.startSession();
  let revised: any = null;
  let affectedCustomerIds: string[] = [];

  try {
    await session.withTransaction(async () => {
      const payment = await loadSale(paymentId, session);
      if (!payment) throw new ProductFlowError('Sale payment not found', 404);
      if (payment.status === 'cancelled') throw new ProductFlowError('Cancelled sale cannot be edited');

      const activeRefundCount = await countActiveRefundDocuments(payment._id, session);
      if (activeRefundCount > 0) {
        throw new ProductFlowError('Sale already has return or exchange documents and cannot be edited');
      }

      const originalQtyByProduct = groupQuantitiesByProduct(payment.items as any[]);
      const nextPayload = await buildSalePaymentPayload({
        ...payload,
        branchId: payment.branchId,
        code: payment.code,
        status: 'completed',
        settlementValue: 0,
      }, {
        session,
        stockAllowanceByProduct: originalQtyByProduct,
      });

      const nextQtyByProduct = groupQuantitiesByProduct(nextPayload.items);
      const lineValueByProduct = groupUnitValuesByProduct(nextPayload.items);
      const originalLineValueByProduct = groupUnitValuesByProduct(payment.items as any[]);
      const productIds = new Set<string>([
        ...originalQtyByProduct.keys(),
        ...nextQtyByProduct.keys(),
      ]);

      for (const productId of productIds) {
        const oldQty = originalQtyByProduct.get(productId) ?? 0;
        const newQty = nextQtyByProduct.get(productId) ?? 0;
        const stockDelta = oldQty - newQty;
        if (stockDelta === 0) continue;

        const product = await loadProduct(productId, session);
        if (!product || product.type === 'service') continue;
        if (stockDelta < 0) {
          const available = await getAvailableStockForSale(product, payment.branchId, session);
          if (available < Math.abs(stockDelta)) {
            throw new ProductFlowError(`Not enough stock for ${product.code} - ${product.name}`);
          }
        }
      }

      for (const productId of productIds) {
        const oldQty = originalQtyByProduct.get(productId) ?? 0;
        const newQty = nextQtyByProduct.get(productId) ?? 0;
        const stockDelta = oldQty - newQty;
        if (stockDelta === 0) continue;
        await moveProductQty({
          productId,
          branchId: payment.branchId,
          sourceType: 'SalePaymentRevision',
          sourceId: payment._id,
          amount: stockDelta,
          valueAfter: lineValueByProduct.get(productId) ?? originalLineValueByProduct.get(productId) ?? 0,
          session,
        });
      }

      const beforeCustomerId = payment.customerId;
      payment.customerId = nextPayload.customerId || null;
      payment.note = nextPayload.note ?? '';
      payment.discountValue = nextPayload.discountValue;
      payment.discountType = nextPayload.discountType;
      payment.amountProducts = nextPayload.amountProducts;
      payment.totalCost = nextPayload.totalCost;
      payment.value = nextPayload.value;
      payment.valuePayment = nextPayload.valuePayment;
      payment.tenderedValue = nextPayload.tenderedValue;
      payment.typePayment = nextPayload.typePayment;
      payment.items = nextPayload.items;
      payment.settlementValue = 0;
      payment.status = 'completed';
      await payment.save({ session });

      revised = payment;
      affectedCustomerIds = uniqueCustomerIds(beforeCustomerId, payment.customerId);
    });
  } finally {
    await session.endSession();
  }

  if (affectedCustomerIds.length > 0) {
    await recomputeCustomerMetricsByIds(affectedCustomerIds);
  }

  return revised;
}

export async function cancelSalePayment(paymentId: string) {
  const session = await mongoose.startSession();
  let cancelled: any = null;
  let customerId = '';

  try {
    await session.withTransaction(async () => {
      const payment = await loadSale(paymentId, session);
      if (!payment) throw new ProductFlowError('Sale payment not found', 404);
      if (payment.status === 'cancelled') throw new ProductFlowError('Already cancelled');

      const activeRefundCount = await countActiveRefundDocuments(payment._id, session);
      if (activeRefundCount > 0) {
        throw new ProductFlowError('Cannot cancel a sale that already has return or exchange documents');
      }

      if (payment.status === 'completed') {
        const qtyByProduct = groupQuantitiesByProduct(payment.items as any[]);
        const lineValueByProduct = groupUnitValuesByProduct(payment.items as any[]);
        for (const [productId, quantity] of qtyByProduct.entries()) {
          await moveProductQty({
            productId,
            branchId: payment.branchId,
            sourceType: 'SalePaymentCancel',
            sourceId: payment._id,
            amount: quantity,
            valueAfter: lineValueByProduct.get(productId) ?? 0,
            session,
          });
        }
      }

      payment.status = 'cancelled';
      await payment.save({ session });
      cancelled = payment;
      customerId = normalizeObjectIdString(payment.customerId);
    });
  } finally {
    await session.endSession();
  }

  if (customerId) {
    await recomputeCustomerMetricsByIds([customerId]);
  }

  return cancelled;
}

export async function createReturnExchange(saleId: string, payload: any) {
  const session = await mongoose.startSession();
  let refund: any = null;
  let replacementSale: any = null;
  let originalSale: any = null;
  let affectedCustomerIds: string[] = [];

  try {
    await session.withTransaction(async () => {
      const sale = await loadSale(saleId, session);
      if (!sale) throw new ProductFlowError('Sale payment not found', 404);
      if (sale.status === 'cancelled') throw new ProductFlowError('Cancelled sale cannot be returned');
      if (sale.status !== 'completed') {
        throw new ProductFlowError('Only completed sales can be returned or exchanged');
      }

      // Phase 3B-1: chứng từ mới phải có kho rõ ràng. Hóa đơn gốc có branch thì khóa theo branch gốc;
      // hóa đơn legacy thiếu branch thì dùng branch admin chọn explicit, không fallback isDefault.
      const explicitBranchId = String(payload.branchId || '').trim();
      const documentBranchId = sale.branchId || (explicitBranchId ? new mongoose.Types.ObjectId(explicitBranchId) : null);
      if (!documentBranchId) {
        throw new ProductFlowError('Vui lòng chọn kho thực hiện cho phiếu đổi trả.', 400);
      }
      if (sale.branchId && explicitBranchId && String(sale.branchId) !== explicitBranchId) {
        throw new ProductFlowError('Kho thực hiện phải trùng với kho của hóa đơn gốc.', 400);
      }

      const completedRefunds = await completedRefundsForSale(sale._id, session);
      const refundedByProduct = new Map<string, number>();
      for (const completedRefund of completedRefunds) {
        for (const item of (completedRefund as any).items || []) {
          const productId = normalizeObjectIdString(item?.productId);
          refundedByProduct.set(productId, (refundedByProduct.get(productId) ?? 0) + toNumber(item?.amount));
        }
      }

      const soldByProduct = groupQuantitiesByProduct(sale.items as any[]);
      const saleItemsByProduct = new Map<string, any>();
      for (const item of sale.items) {
        saleItemsByProduct.set(normalizeObjectIdString(item.productId), item);
      }

      const returnedItems = [];
      let returnedAmount = 0;
      let returnedValue = 0;

      for (const rawItem of Array.isArray(payload.returnedItems) ? payload.returnedItems : []) {
        const productId = normalizeObjectIdString(rawItem?.productId);
        const soldItem = saleItemsByProduct.get(productId);
        if (!soldItem) throw new ProductFlowError('Returned product must belong to the original sale');

        const quantity = toNumber(rawItem?.amount);
        const remainingQty = (soldByProduct.get(productId) ?? 0) - (refundedByProduct.get(productId) ?? 0);
        if (quantity <= 0) continue;
        if (quantity > remainingQty) throw new ProductFlowError('Return quantity exceeds the remaining sold quantity');

        const price = toNumber(rawItem?.value, toNumber(soldItem.value));
        const base = price * quantity;
        const discountValue = toNumber(rawItem?.discountValue);
        const discountType = rawItem?.discountType === 'percent' ? 'percent' : 'number';
        const lineValue = Math.max(base - lineDiscount(base, discountValue, discountType), 0);

        returnedAmount += quantity;
        returnedValue += lineValue;
        returnedItems.push({
          productId,
          amount: quantity,
          price,
          cost: toNumber(soldItem.cost),
          discountValue,
          discountType,
          value: lineValue,
        });
      }

      if (returnedItems.length === 0) {
        throw new ProductFlowError('Return or exchange must include at least one returned product');
      }

      const rawRefundPayments = await normalizePaymentLines(payload.refundPayments, session);

      let settlementValue = 0;
      let replacementPayload: any = null;
      if (Array.isArray(payload.replacementItems) && payload.replacementItems.length > 0) {
        replacementPayload = await buildSalePaymentPayload({
          branchId: documentBranchId,
          customerId: sale.customerId,
          saleChannelId: sale.saleChannelId,
          note: payload.note || '',
          code: payload.replacementCode || buildNextCode('BH'),
          status: 'completed',
          valuePayment: payload.salePayments?.reduce((sum: number, line: any) => sum + toNumber(line?.amount), 0) ?? 0,
          typePayment: payload.salePayments || [],
          discountValue: 0,
          discountType: 'number',
          settlementValue: 0,
          items: payload.replacementItems,
          userId: payload.userId || sale.userId,
          authorId: payload.userId || sale.authorId || sale.userId,
        }, { session });

        settlementValue = Math.min(returnedValue, replacementPayload.value);
        const saleCashDue = Math.max(replacementPayload.value - settlementValue, 0);
        if (Math.abs(replacementPayload.valuePayment - saleCashDue) > MONEY_TOLERANCE) {
          throw new ProductFlowError('Replacement sale payments must equal the amount the customer still has to pay');
        }
      }

      const refundCashDue = Math.max(returnedValue - settlementValue, 0);
      if (Math.abs(sumPaymentLines(rawRefundPayments) - refundCashDue) > MONEY_TOLERANCE) {
        throw new ProductFlowError('Refund payments must equal the amount returned to the customer');
      }

      const [createdRefund] = await ProductRefund.create([{
        paymentId: sale._id,
        code: payload.code || buildNextCode('THB'),
        discountValue: 0,
        discountType: 'number',
        refundFee: 0,
        refundFeeType: 'number',
        amount: returnedAmount,
        originalTotalAmount: sale.value,
        totalPayableAmount: refundCashDue,
        value: returnedValue,
        settlementValue,
        status: 'completed',
        completedAt: new Date(),
        userId: payload.userId || sale.userId,
        userCreatedId: payload.userId || sale.userId,
        note: payload.note || '',
        typePayment: rawRefundPayments,
        items: returnedItems,
      }], { session });

      const returnedValueByProduct = groupUnitValuesByProduct(returnedItems as any[]);
      for (const [productId, quantity] of groupQuantitiesByProduct(returnedItems as any[]).entries()) {
        await moveProductQty({
          productId,
          branchId: documentBranchId,
          sourceType: 'ProductRefund',
          sourceId: createdRefund._id,
          amount: quantity,
          valueAfter: returnedValueByProduct.get(productId) ?? 0,
          session,
        });
      }

      if (replacementPayload) {
        replacementPayload.status = 'completed';
        replacementPayload.completedAt = new Date();
        replacementPayload.settlementValue = settlementValue;

        const [createdReplacementSale] = await SalePayment.create([replacementPayload], { session });
        const replacementValueByProduct = groupUnitValuesByProduct(createdReplacementSale.items as any[]);
        for (const [productId, quantity] of groupQuantitiesByProduct(createdReplacementSale.items as any[]).entries()) {
          await moveProductQty({
            productId,
            branchId: createdReplacementSale.branchId,
            sourceType: 'SalePayment',
            sourceId: createdReplacementSale._id,
            amount: -quantity,
            valueAfter: replacementValueByProduct.get(productId) ?? 0,
            session,
          });
        }

        replacementSale = createdReplacementSale;
        createdRefund.replacementSaleId = createdReplacementSale._id;
        await createdRefund.save({ session });
      }

      await syncSaleRefundState(sale._id, session);

      refund = createdRefund;
      originalSale = await loadSale(sale._id, session);
      affectedCustomerIds = uniqueCustomerIds(sale.customerId, replacementSale?.customerId);
    });
  } finally {
    await session.endSession();
  }

  if (affectedCustomerIds.length > 0) {
    await recomputeCustomerMetricsByIds(affectedCustomerIds);
  }

  return { refund, replacementSale, sale: originalSale };
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
