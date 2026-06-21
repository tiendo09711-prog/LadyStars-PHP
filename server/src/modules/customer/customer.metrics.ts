import mongoose from 'mongoose';
import { Customer } from './customer.models.js';
import { Order } from '../orders/orders.models.js';
import { ProductRefund, SalePayment } from '../product/product.models.js';

const VALID_ORDER_STATUSES = ['Hoàn thành', 'In và đóng gói', 'Đang chuyển', 'Đã chuyển'];
const DAY_IN_MS = 1000 * 60 * 60 * 24;

type CustomerLike = {
  _id: unknown;
  phone?: string | null;
  name?: string | null;
  points?: number | null;
  totalSpent?: number | null;
  purchaseCount?: number | null;
  purchaseProductQuantity?: number | null;
  firstPurchaseDate?: Date | string | null;
  lastPurchaseDate?: Date | string | null;
  daysSinceLastPurchase?: number | null;
  purchaseCycleDays?: number | null;
};

type PurchaseEvent = {
  amount: number;
  quantity: number;
  occurredAt: Date;
};

export type CustomerMetricsSnapshot = {
  totalSpent: number;
  purchaseCount: number;
  purchaseProductQuantity: number;
  firstPurchaseDate: Date | null;
  lastPurchaseDate: Date | null;
  daysSinceLastPurchase: number | null;
  purchaseCycleDays: number | null;
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePhone(value: unknown) {
  return String(value ?? '').replace(/\s+/g, '').trim();
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function toObjectIdString(value: unknown) {
  return String(value ?? '').trim();
}

function roundMetric(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function diffDaysCeil(from: Date, to = new Date()) {
  return Math.ceil(Math.abs(to.getTime() - from.getTime()) / DAY_IN_MS);
}

function quantityFromSaleItems(items: Array<{ amount?: number | null }> = []) {
  return items.reduce((sum, item) => sum + toNumber(item.amount), 0);
}

function quantityFromOrderProducts(products: Array<{ quantity?: number | null }> = []) {
  return products.reduce((sum, item) => sum + toNumber(item.quantity), 0);
}

function buildEmptyMetrics(): CustomerMetricsSnapshot {
  return {
    totalSpent: 0,
    purchaseCount: 0,
    purchaseProductQuantity: 0,
    firstPurchaseDate: null,
    lastPurchaseDate: null,
    daysSinceLastPurchase: null,
    purchaseCycleDays: null,
  };
}

function computeMetricsFromEvents(events: PurchaseEvent[]): CustomerMetricsSnapshot {
  if (!events.length) return buildEmptyMetrics();
  const sorted = [...events].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
  const firstPurchaseDate = sorted[0]?.occurredAt ?? null;
  const lastPurchaseDate = sorted[sorted.length - 1]?.occurredAt ?? null;
  const totalSpent = sorted.reduce((sum, event) => sum + event.amount, 0);
  const purchaseProductQuantity = sorted.reduce((sum, event) => sum + event.quantity, 0);
  const purchaseCount = sorted.length;
  const purchaseCycleDays =
    purchaseCount >= 2 && firstPurchaseDate && lastPurchaseDate
      ? roundMetric((lastPurchaseDate.getTime() - firstPurchaseDate.getTime()) / DAY_IN_MS / (purchaseCount - 1))
      : null;

  return {
    totalSpent: roundMetric(totalSpent),
    purchaseCount,
    purchaseProductQuantity,
    firstPurchaseDate,
    lastPurchaseDate,
    daysSinceLastPurchase: lastPurchaseDate ? diffDaysCeil(lastPurchaseDate) : null,
    purchaseCycleDays,
  };
}

export async function buildCustomerMetricsMap(customers: CustomerLike[]) {
  const customerIds = customers.map((customer) => toObjectIdString(customer._id)).filter(Boolean);
  const metricsByCustomer = new Map<string, PurchaseEvent[]>();
  customerIds.forEach((customerId) => metricsByCustomer.set(customerId, []));
  if (!customerIds.length) return new Map<string, CustomerMetricsSnapshot>();

  const phoneToCustomerIds = new Map<string, Set<string>>();
  const nameToCustomerIds = new Map<string, Set<string>>();
  const phones = new Set<string>();
  const names = new Set<string>();

  for (const customer of customers) {
    const customerId = toObjectIdString(customer._id);
    const phone = normalizePhone(customer.phone);
    const name = normalizeText(customer.name);
    if (phone) {
      phones.add(phone);
      const ids = phoneToCustomerIds.get(phone) ?? new Set<string>();
      ids.add(customerId);
      phoneToCustomerIds.set(phone, ids);
    }
    if (name) {
      names.add(name);
      const ids = nameToCustomerIds.get(name) ?? new Set<string>();
      ids.add(customerId);
      nameToCustomerIds.set(name, ids);
    }
  }

  const [sales, orders] = await Promise.all([
    SalePayment.find({
      customerId: { $in: customerIds },
      status: 'completed',
    })
      .select('customerId value completedAt createdAt items amountProducts')
      .lean(),
    phones.size || names.size
      ? Order.find({
        status: { $in: VALID_ORDER_STATUSES },
        $or: [
          ...(phones.size ? [{ customerPhone: { $in: [...phones] } }] : []),
          ...(names.size ? [{ customerName: { $in: [...names] } }] : []),
        ],
      })
        .select('customerPhone customerName totalAmount createdAt products')
        .lean()
      : Promise.resolve([]),
  ]);

  const saleIds = sales
    .map((sale: any) => toObjectIdString(sale._id))
    .filter(Boolean);
  const refundedQtyRows = saleIds.length
    ? await ProductRefund.aggregate([
      { $match: { paymentId: { $in: saleIds.map((id) => new mongoose.Types.ObjectId(id)) }, status: 'completed' } },
      { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: '$paymentId',
          quantity: { $sum: { $ifNull: ['$items.amount', 0] } },
        },
      },
    ])
    : [];
  const refundedValueRows = saleIds.length
    ? await ProductRefund.aggregate([
      { $match: { paymentId: { $in: saleIds.map((id) => new mongoose.Types.ObjectId(id)) }, status: 'completed' } },
      {
        $group: {
          _id: '$paymentId',
          value: { $sum: { $ifNull: ['$value', 0] } },
        },
      },
    ])
    : [];
  const refundedQtyMap = new Map(refundedQtyRows.map((row: any) => [toObjectIdString(row._id), toNumber(row.quantity)]));
  const refundedValueMap = new Map(refundedValueRows.map((row: any) => [toObjectIdString(row._id), toNumber(row.value)]));

  for (const sale of sales) {
    const customerId = toObjectIdString((sale as any).customerId);
    const events = metricsByCustomer.get(customerId);
    if (!events) continue;
    const occurredAt = new Date((sale as any).completedAt || (sale as any).createdAt || new Date());
    const netAmount = Math.max(toNumber((sale as any).value) - (refundedValueMap.get(toObjectIdString((sale as any)._id)) ?? 0), 0);
    const grossQuantity = toNumber((sale as any).amountProducts, quantityFromSaleItems((sale as any).items || []));
    const netQuantity = Math.max(grossQuantity - (refundedQtyMap.get(toObjectIdString((sale as any)._id)) ?? 0), 0);
    if (netAmount <= 0) continue;
    events.push({
      amount: netAmount,
      quantity: netQuantity,
      occurredAt,
    });
  }

  for (const order of orders as any[]) {
    const matchedCustomerIds = new Set<string>();
    const phone = normalizePhone(order.customerPhone);
    const name = normalizeText(order.customerName);
    if (phoneToCustomerIds.has(phone)) {
      for (const customerId of phoneToCustomerIds.get(phone) || []) matchedCustomerIds.add(customerId);
    }
    if (nameToCustomerIds.has(name)) {
      for (const customerId of nameToCustomerIds.get(name) || []) matchedCustomerIds.add(customerId);
    }
    if (!matchedCustomerIds.size) continue;
    const occurredAt = new Date(order.createdAt || new Date());
    const event: PurchaseEvent = {
      amount: toNumber(order.totalAmount),
      quantity: quantityFromOrderProducts(order.products || []),
      occurredAt,
    };
    for (const customerId of matchedCustomerIds) {
      metricsByCustomer.get(customerId)?.push(event);
    }
  }

  const result = new Map<string, CustomerMetricsSnapshot>();
  for (const customerId of customerIds) {
    result.set(customerId, computeMetricsFromEvents(metricsByCustomer.get(customerId) || []));
  }
  return result;
}

function sameDateValue(left: unknown, right: unknown) {
  const leftTime = left ? new Date(left as any).getTime() : null;
  const rightTime = right ? new Date(right as any).getTime() : null;
  return leftTime === rightTime;
}

export async function persistCustomerMetrics(customers: CustomerLike[], metricsMap: Map<string, CustomerMetricsSnapshot>) {
  const operations = customers.flatMap((customer) => {
    const customerId = toObjectIdString(customer._id);
    const metrics = metricsMap.get(customerId);
    if (!metrics) return [];
    const unchanged =
      roundMetric(toNumber(customer.totalSpent)) === metrics.totalSpent
      && toNumber(customer.purchaseCount) === metrics.purchaseCount
      && toNumber(customer.purchaseProductQuantity) === metrics.purchaseProductQuantity
      && sameDateValue(customer.firstPurchaseDate, metrics.firstPurchaseDate)
      && sameDateValue(customer.lastPurchaseDate, metrics.lastPurchaseDate)
      && (customer.daysSinceLastPurchase ?? null) === metrics.daysSinceLastPurchase
      && (customer.purchaseCycleDays ?? null) === metrics.purchaseCycleDays;
    if (unchanged) return [];
    return [{
      updateOne: {
        filter: { _id: customer._id },
        update: {
          $set: {
            totalSpent: metrics.totalSpent,
            purchaseCount: metrics.purchaseCount,
            purchaseProductQuantity: metrics.purchaseProductQuantity,
            firstPurchaseDate: metrics.firstPurchaseDate,
            lastPurchaseDate: metrics.lastPurchaseDate,
            daysSinceLastPurchase: metrics.daysSinceLastPurchase,
            purchaseCycleDays: metrics.purchaseCycleDays,
          },
        },
      },
    }];
  });

  if (!operations.length) return;
  await Customer.bulkWrite(operations, { ordered: false });
}

export async function recomputeCustomerMetricsByIds(customerIds: string[]) {
  const uniqueIds = [...new Set(customerIds.map(toObjectIdString).filter(Boolean))];
  if (!uniqueIds.length) return new Map<string, CustomerMetricsSnapshot>();
  const customers = await Customer.find({ _id: { $in: uniqueIds } })
    .select('phone name totalSpent purchaseCount purchaseProductQuantity firstPurchaseDate lastPurchaseDate daysSinceLastPurchase purchaseCycleDays')
    .lean();
  const metricsMap = await buildCustomerMetricsMap(customers as CustomerLike[]);
  await persistCustomerMetrics(customers as CustomerLike[], metricsMap);
  return metricsMap;
}
