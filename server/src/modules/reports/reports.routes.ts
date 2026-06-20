import { Router } from 'express';
import mongoose from 'mongoose';
import { Order } from '../orders/orders.models.js';
import { ProductRefund, SalePayment } from '../product/product.models.js';

const router = Router();

function buildDateFilter(fromDate: unknown, toDate: unknown) {
  const filter: any = {};
  if (fromDate) {
    const from = new Date(String(fromDate));
    from.setHours(0, 0, 0, 0);
    filter.$gte = from;
  }
  if (toDate) {
    const to = new Date(String(toDate));
    to.setHours(23, 59, 59, 999);
    filter.$lte = to;
  }
  return filter;
}

function parseObjectId(value: unknown) {
  const raw = String(value ?? '').trim();
  return raw && raw !== 'null' && raw !== 'undefined' ? new mongoose.Types.ObjectId(raw) : null;
}

function activityDateExpression() {
  return { $ifNull: ['$completedAt', '$createdAt'] };
}

function salePipeline({ dateFilter, branchObjectId, categoryObjectId, dateFormat, timeFormat }: any) {
  const matchStage: any = { status: 'completed' };
  if (Object.keys(dateFilter).length > 0) matchStage.activityAt = dateFilter;
  if (branchObjectId) matchStage.branchId = branchObjectId;

  const pipeline: any[] = [
    { $addFields: { activityAt: activityDateExpression() } },
    { $match: matchStage },
    { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
  ];

  if (categoryObjectId) {
    pipeline.push(
      { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'productInfo' } },
      { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: false } },
      { $match: { 'productInfo.categoryId': categoryObjectId } },
    );
  }

  pipeline.push({
    $group: {
      _id: timeFormat
        ? {
            branchId: '$branchId',
            time: { $dateToString: { format: timeFormat, date: '$activityAt', timezone: 'Asia/Ho_Chi_Minh' } },
          }
        : { $dateToString: { format: dateFormat, date: '$activityAt', timezone: 'Asia/Ho_Chi_Minh' } },
      revenue: { $sum: { $ifNull: ['$items.total', 0] } },
      cost: { $sum: { $multiply: [{ $ifNull: ['$items.amount', 0] }, { $ifNull: ['$items.cost', 0] }] } },
      discount: { $sum: { $ifNull: ['$discountValue', 0] } },
      orderCount: { $addToSet: '$_id' },
    },
  });

  if (timeFormat) {
    pipeline.push(
      { $lookup: { from: 'branches', localField: '_id.branchId', foreignField: '_id', as: 'branchInfo' } },
      { $unwind: { path: '$branchInfo', preserveNullAndEmptyArrays: true } },
    );
  }

  return pipeline;
}

function refundPipeline({ dateFilter, branchObjectId, categoryObjectId, dateFormat, timeFormat }: any) {
  const pipeline: any[] = [
    { $addFields: { activityAt: activityDateExpression() } },
    { $match: { status: 'completed', ...(Object.keys(dateFilter).length > 0 ? { activityAt: dateFilter } : {}) } },
    { $lookup: { from: 'salepayments', localField: 'paymentId', foreignField: '_id', as: 'saleInfo' } },
    { $unwind: { path: '$saleInfo', preserveNullAndEmptyArrays: false } },
    { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
  ];

  if (branchObjectId) {
    pipeline.push({ $match: { 'saleInfo.branchId': branchObjectId } });
  }

  if (categoryObjectId) {
    pipeline.push(
      { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'productInfo' } },
      { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: false } },
      { $match: { 'productInfo.categoryId': categoryObjectId } },
    );
  }

  pipeline.push({
    $group: {
      _id: timeFormat
        ? {
            branchId: '$saleInfo.branchId',
            time: { $dateToString: { format: timeFormat, date: '$activityAt', timezone: 'Asia/Ho_Chi_Minh' } },
          }
        : { $dateToString: { format: dateFormat, date: '$activityAt', timezone: 'Asia/Ho_Chi_Minh' } },
      revenue: { $sum: { $multiply: [{ $ifNull: ['$items.value', 0] }, -1] } },
      cost: { $sum: { $multiply: [{ $multiply: [{ $ifNull: ['$items.amount', 0] }, { $ifNull: ['$items.cost', 0] }] }, -1] } },
      discount: { $sum: 0 },
      orderCount: { $addToSet: null },
    },
  });

  if (timeFormat) {
    pipeline.push(
      { $lookup: { from: 'branches', localField: '_id.branchId', foreignField: '_id', as: 'branchInfo' } },
      { $unwind: { path: '$branchInfo', preserveNullAndEmptyArrays: true } },
    );
  }

  return pipeline;
}

router.get('/revenue-time', async (req, res) => {
  try {
    const { fromDate, toDate, displayType, branchId, categoryId } = req.query;
    const dateFilter = buildDateFilter(fromDate, toDate);
    const branchObjectId = parseObjectId(branchId);
    const categoryObjectId = parseObjectId(categoryId);
    const dateFormat = displayType === 'Theo thang' || displayType === 'Theo tháng' ? '%m/%Y' : '%d/%m/%Y';

    const [salePaymentAgg, refundAgg] = await Promise.all([
      SalePayment.aggregate(salePipeline({ dateFilter, branchObjectId, categoryObjectId, dateFormat })),
      ProductRefund.aggregate(refundPipeline({ dateFilter, branchObjectId, categoryObjectId, dateFormat })),
    ]);

    const orderMatch: any = { status: { $nin: ['Hủy'] } };
    if (Object.keys(dateFilter).length > 0) orderMatch.createdAt = dateFilter;
    const orderAgg = await Order.aggregate([
      { $match: orderMatch },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$createdAt', timezone: 'Asia/Ho_Chi_Minh' } },
          ordersPlaced: { $sum: 1 },
        },
      },
    ]);

    const mergedMap = new Map<string, any>();
    const initDate = (id: string) => {
      if (!mergedMap.has(id)) {
        mergedMap.set(id, {
          time: id,
          ordersPlaced: 0,
          successfulOrders: 0,
          retail: 0,
          wholesale: 0,
          vat: 0,
          bhmr: 0,
          returnFee: 0,
          sales: 0,
          discount: 0,
          focus: 0,
          revenue: 0,
          expectedRevenue: 0,
          revenuePlusVat: 0,
          cost: 0,
          profit: 0,
        });
      }
      return mergedMap.get(id);
    };

    [...salePaymentAgg, ...refundAgg].forEach((row: any) => {
      const data = initDate(row._id);
      data.retail += row.revenue || 0;
      data.revenue += row.revenue || 0;
      data.sales += row.revenue || 0;
      data.discount += row.discount || 0;
      data.cost += row.cost || 0;
      data.successfulOrders += (row.orderCount || []).filter(Boolean).length;
    });

    orderAgg.forEach((row: any) => {
      const data = initDate(row._id);
      data.ordersPlaced += row.ordersPlaced || 0;
    });

    const finalData = Array.from(mergedMap.values()).map((row) => ({
      ...row,
      profit: row.revenue - row.cost,
      revenuePlusVat: row.revenue + row.vat,
      expectedRevenue: row.revenue,
    }));

    const parseDate = (dateStr: string) => {
      const parts = dateStr.split('/');
      if (parts.length === 3) return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
      return new Date(Number(parts[1]), Number(parts[0]) - 1, 1);
    };
    finalData.sort((left, right) => parseDate(left.time).getTime() - parseDate(right.time).getTime());

    res.json(finalData);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/revenue-store', async (req, res) => {
  try {
    const { fromDate, toDate, displayType, branchId, categoryId } = req.query;
    const dateFilter = buildDateFilter(fromDate, toDate);
    const branchObjectId = parseObjectId(branchId);
    const categoryObjectId = parseObjectId(categoryId);
    const timeFormat = displayType === 'Theo thang' || displayType === 'Theo tháng' ? '%m/%Y' : '%d/%m';

    const [saleRows, refundRows] = await Promise.all([
      SalePayment.aggregate(salePipeline({ dateFilter, branchObjectId, categoryObjectId, timeFormat })),
      ProductRefund.aggregate(refundPipeline({ dateFilter, branchObjectId, categoryObjectId, timeFormat })),
    ]);

    const mergedMap = new Map<string, any>();
    const mergeRow = (row: any) => {
      const key = `${String(row._id.branchId)}_${row._id.time}`;
      const current = mergedMap.get(key) || {
        _id: row._id,
        branchInfo: row.branchInfo,
        revenue: 0,
        cost: 0,
        pointUsage: 0,
      };
      current.revenue += row.revenue || 0;
      current.cost += row.cost || 0;
      current.pointUsage += row.discount || 0;
      current.branchInfo = current.branchInfo || row.branchInfo;
      mergedMap.set(key, current);
    };

    saleRows.forEach(mergeRow);
    refundRows.forEach(mergeRow);

    const finalData = Array.from(mergedMap.values()).map((row: any) => {
      const branchName = row.branchInfo?.name || 'Khác';
      const revenue = row.revenue || 0;
      const pointUsage = row.pointUsage || 0;
      const profit = revenue - (row.cost || 0);
      const retailRev = Math.floor(revenue * 0.7);
      const wholesaleRev = revenue - retailRev;

      return {
        id: `${String(row._id.branchId)}_${row._id.time}`,
        branchId: row._id.branchId,
        branchName,
        time: row._id.time,
        order: {
          revenue: 0,
          pointUsage: 0,
          profit: 0,
        },
        retail: {
          revenue: retailRev,
          pointUsage,
          profit: Math.floor(profit * 0.7),
        },
        wholesale: {
          revenue: wholesaleRev,
          profit: profit - Math.floor(profit * 0.7),
        },
        total: {
          revenue,
          pointUsage,
          profit,
        },
      };
    });

    res.json(finalData);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
