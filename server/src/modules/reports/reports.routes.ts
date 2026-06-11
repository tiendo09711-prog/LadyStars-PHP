import { Router } from 'express';
import mongoose from 'mongoose';
import { SalePayment } from '../product/product.models.js';
import { Order } from '../orders/orders.models.js';

const router = Router();

router.get('/revenue-time', async (req, res) => {
  try {
    const { fromDate, toDate, displayType, branchId, categoryId } = req.query;
    
    // 1. Base Match for Date and Branch
    const dateFilter: any = {};
    if (fromDate) {
      const from = new Date(String(fromDate));
      from.setHours(0, 0, 0, 0);
      dateFilter.$gte = from;
    }
    if (toDate) {
      const to = new Date(String(toDate));
      to.setHours(23, 59, 59, 999);
      dateFilter.$lte = to;
    }

    // Match only COMPLETED sales (real revenue, inventory was deducted)
    const matchStage: any = { status: 'completed' };
    if (Object.keys(dateFilter).length > 0) {
      matchStage.createdAt = dateFilter;
    }
    if (branchId && branchId !== 'null' && branchId !== 'undefined') {
      matchStage.branchId = new mongoose.Types.ObjectId(String(branchId));
    }

    // 2. Aggregation Pipeline for SalePayment
    const dateFormat = displayType === 'Theo tháng' ? '%m/%Y' : '%d/%m/%Y';
    
    const buildSalePaymentPipeline = () => {
      const pipeline: any[] = [
        { $match: matchStage },
        { $unwind: { path: '$items', preserveNullAndEmptyArrays: true } },
      ];

      if (categoryId && categoryId !== 'null' && categoryId !== 'undefined') {
        pipeline.push(
          { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'productInfo' } },
          { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
          { $match: { 'productInfo.categoryId': new mongoose.Types.ObjectId(String(categoryId)) } }
        );
      }

      pipeline.push({
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$createdAt', timezone: 'Asia/Ho_Chi_Minh' } },
          revenue: { $sum: '$items.total' },
          cost: { $sum: { $multiply: ['$items.amount', { $ifNull: ['$items.cost', 0] }] } },
          discount: { $sum: { $ifNull: ['$discountValue', 0] } },
          orderCount: { $addToSet: '$_id' },  // unique sale IDs
        }
      });

      return pipeline;
    };

    const salePaymentAgg = await SalePayment.aggregate(buildSalePaymentPipeline());

    // 3. Count Orders
    const orderMatch: any = { status: { $nin: ['Hủy'] } };
    if (Object.keys(dateFilter).length > 0) orderMatch.createdAt = dateFilter;
    const dateFormatOrder = displayType === 'Theo tháng' ? '%m/%Y' : '%d/%m/%Y';
    const orderPipeline: any[] = [
      { $match: orderMatch },
      {
        $group: {
          _id: { $dateToString: { format: dateFormatOrder, date: '$createdAt', timezone: 'Asia/Ho_Chi_Minh' } },
          ordersPlaced: { $sum: 1 },
          successfulOrders: { $sum: { $cond: [{ $eq: ['$status', 'Thành công'] }, 1, 0] } }
        }
      }
    ];
    const orderAgg = await Order.aggregate(orderPipeline);

    const mergedMap = new Map();
    const initDate = (id: string) => {
      if (!mergedMap.has(id)) {
        mergedMap.set(id, {
          time: id, ordersPlaced: 0, successfulOrders: 0, retail: 0, wholesale: 0, vat: 0,
          bhmr: 0, returnFee: 0, sales: 0, discount: 0, focus: 0, revenue: 0, expectedRevenue: 0,
          revenuePlusVat: 0, cost: 0, profit: 0
        });
      }
      return mergedMap.get(id);
    };

    salePaymentAgg.forEach(r => {
      const d = initDate(r._id);
      d.retail += r.revenue || 0;
      d.revenue += r.revenue || 0;
      d.sales += r.revenue || 0;
      d.discount += r.discount || 0;
      d.cost += r.cost || 0;
      d.successfulOrders += (r.orderCount || []).length;
    });

    orderAgg.forEach(o => {
      const d = initDate(o._id);
      d.ordersPlaced += o.ordersPlaced || 0;
    });

    const finalData = Array.from(mergedMap.values()).map(d => {
      d.profit = d.revenue - d.cost;
      d.revenuePlusVat = d.revenue + d.vat;
      d.expectedRevenue = d.revenue;
      return d;
    });

    const parseDate = (dateStr: string) => {
      const parts = dateStr.split('/');
      if (parts.length === 3) return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
      return new Date(Number(parts[1]), Number(parts[0]) - 1, 1);
    };
    finalData.sort((a, b) => parseDate(a.time).getTime() - parseDate(b.time).getTime());

    res.json(finalData);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
