import { Router } from 'express';
import mongoose from 'mongoose';
import { AccountingType, ExpensePayment, Receipt } from '../accounting/accounting.models.js';
import { Customer } from '../customer/customer.models.js';
import { Order } from '../orders/orders.models.js';
import { Product, ProductBranchStock, ProductRefund, SalePayment } from '../product/product.models.js';
import { Project, Task } from '../task/task.models.js';
import { Wallet } from '../../core/system/system.models.js';
import { Vendor, VendorPurchase } from '../vendor/vendor.models.js';

const router = Router();

function makeDateRange(label: unknown, fallback = 'Hôm nay') {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let startDate = new Date(today);
  let endDate = new Date(today);
  endDate.setDate(today.getDate() + 1);

  const raw = String(label || fallback).toLowerCase();
  if (raw.includes('qua') && !raw.includes('tu')) {
    startDate.setDate(today.getDate() - 1);
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1);
  } else if (raw.includes('7')) {
    startDate.setDate(today.getDate() - 6);
  } else if (raw.includes('14')) {
    startDate.setDate(today.getDate() - 13);
  } else if (raw.includes('30')) {
    startDate.setDate(today.getDate() - 29);
  } else if (raw.includes('tu') && raw.includes('tr')) {
    startDate.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1) - 7);
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 7);
  } else if (raw.includes('tu')) {
    startDate.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
  } else if (raw.includes('th') && raw.includes('tr')) {
    startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    endDate = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (raw.includes('th')) {
    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
  }

  return { today, startDate, endDate, filter: { $gte: startDate, $lt: endDate } };
}

function iconForChannel(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes('facebook')) return 'facebook';
  if (lower.includes('instagram')) return 'instagram';
  if (lower.includes('zalo')) return 'zalo';
  if (lower.includes('api')) return 'api';
  if (lower.includes('web')) return 'website';
  if (lower.includes('shopee')) return 'shopee';
  if (lower.includes('tiktok')) return 'tiktok';
  return 'admin';
}

router.get('/', async (req, res) => {
  const { stores, date, chartRange, topRange, topLimit, orderRange } = req.query;
  const { today, filter: dateFilter } = makeDateRange(date);
  const { filter: chartFilter, startDate: chartStart, endDate: chartEnd } = makeDateRange(chartRange || '14 ngày');
  const { filter: topDateFilter } = makeDateRange(topRange || '7 ngày');
  const { filter: orderDateFilter } = makeDateRange(orderRange || '2 ngày');
  const parsedTopLimit = Math.min(Math.max(Number(String(topLimit || '10').replace(/\D/g, '')) || 10, 1), 50);

  const allBranches = await mongoose.connection.db!.collection('branches').find({ isActive: true }).project({ _id: 1, name: 1 }).toArray();
  const availableStores = allBranches.map((branch: any) => branch.name);
  const storeNames = stores ? String(stores).split(',').filter(Boolean) : [];
  const selectedBranches = storeNames.length ? allBranches.filter((branch: any) => storeNames.includes(branch.name)) : [];
  const branchIds = selectedBranches.map((branch: any) => branch._id);
  const branchMatch = branchIds.length ? { branchId: { $in: branchIds } } : {};
  const orderStoreMatch = storeNames.length ? { warehouse: { $in: storeNames } } : {};

  const [
    products,
    lowStock,
    customers,
    vendors,
    purchases,
    receipts,
    expenses,
    projects,
    tasks,
    accountingTypes,
    retailAgg,
    topProductsAgg,
    topReturnsAgg,
    totalInventory,
    fetchedWallets,
    orderStatusAgg,
    recentSalesDocs,
    currentChartData,
    prevChartData,
  ] = await Promise.all([
    Product.countDocuments(),
    ProductBranchStock.countDocuments({ $expr: { $lte: ['$qty', '$minQuantity'] }, ...branchMatch }).catch(() => 0),
    Customer.countDocuments(),
    Vendor.countDocuments(),
    VendorPurchase.countDocuments({ createdAt: dateFilter }),
    Receipt.aggregate([
      { $match: { createdAt: dateFilter, ...branchMatch } },
      { $group: { _id: null, total: { $sum: '$value' } } },
    ]).catch(() => []),
    ExpensePayment.aggregate([
      { $match: { createdAt: dateFilter, ...branchMatch } },
      { $group: { _id: null, total: { $sum: '$value' } } },
    ]).catch(() => []),
    Project.countDocuments(),
    Task.countDocuments(),
    AccountingType.countDocuments(),
    SalePayment.aggregate([
      { $match: { createdAt: dateFilter, status: 'completed', ...branchMatch } },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$value' },
          orders: { $sum: 1 },
          totalCost: { $sum: '$totalCost' },
          amountProducts: { $sum: '$amountProducts' },
        },
      },
    ]).catch(() => []),
    SalePayment.aggregate([
      { $match: { createdAt: topDateFilter, status: { $nin: ['draft', 'cancelled'] }, ...branchMatch } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          qtySold: { $sum: '$items.amount' },
          revenue: { $sum: '$items.total' },
        },
      },
      { $sort: { qtySold: -1, revenue: -1 } },
      { $limit: parsedTopLimit },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'productInfo' } },
      { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          name: { $ifNull: ['$productInfo.name', 'Không rõ'] },
          code: { $ifNull: ['$productInfo.code', ''] },
          qtySold: 1,
          revenue: 1,
        },
      },
    ]).catch(() => []),
    ProductRefund.aggregate([
      { $match: { createdAt: topDateFilter, status: 'completed' } },
      { $unwind: '$items' },
      { $group: { _id: '$items.productId', qtyReturned: { $sum: '$items.amount' } } },
    ]).catch(() => []),
    ProductBranchStock.aggregate([
      { $match: branchMatch },
      { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'productInfo' } },
      { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: null,
          totalQty: { $sum: '$qty' },
          totalCostValue: { $sum: { $multiply: ['$qty', { $ifNull: ['$productInfo.cost', 0] }] } },
          totalSaleValue: { $sum: { $multiply: ['$qty', { $ifNull: ['$productInfo.price', 0] }] } },
        },
      },
    ]).catch(() => []),
    Wallet.find(),
    Order.aggregate([
      { $match: { createdAt: orderDateFilter, ...orderStoreMatch } },
      {
        $group: {
          _id: '$source',
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $in: ['$status', ['Cần xử lí', 'Chờ xử lý', 'Mới', 'Đang xử lý']] }, 1, 0] } },
          packing: { $sum: { $cond: [{ $in: ['$status', ['Đang đóng gói', 'In và đóng gói']] }, 1, 0] } },
          shipping: { $sum: { $cond: [{ $in: ['$status', ['Đang chuyển', 'Đã bàn giao', 'Đang giao']] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $in: ['$status', ['Khách hủy', 'HVC hủy', 'Đã hủy']] }, 1, 0] } },
          returned: { $sum: { $cond: [{ $in: ['$status', ['Đã hoàn', 'Xác nhận hoàn', 'Hoàn hàng']] }, 1, 0] } },
        },
      },
      { $sort: { total: -1 } },
    ]).catch(() => []),
    SalePayment.find({ createdAt: dateFilter, status: 'completed', ...branchMatch })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('branchId', 'name')
      .populate('customerId', 'name phone')
      .lean(),
    SalePayment.aggregate(buildChartAgg(chartFilter, branchMatch)).catch(() => []),
    SalePayment.aggregate(buildChartAgg(makePreviousFilter(chartStart, chartEnd), branchMatch)).catch(() => []),
  ]);

  const receiptRevenue = receipts[0]?.total ?? 0;
  const expense = expenses[0]?.total ?? 0;
  const inventoryData = totalInventory[0] ?? { totalQty: 0, totalCostValue: 0, totalSaleValue: 0 };
  const retailRevenue = retailAgg[0]?.revenue ?? 0;
  const retailOrders = retailAgg[0]?.orders ?? 0;
  const retailQty = retailAgg[0]?.amountProducts ?? 0;
  const totalRevenue = retailRevenue;
  const totalOrders = retailOrders;
  const totalCost = retailAgg[0]?.totalCost ?? 0;
  const returnMap = new Map(topReturnsAgg.map((row: any) => [String(row._id), row.qtyReturned ?? 0]));

  const salesChannels = [
    {
      label: 'Tổng',
      type: 'total',
      revenue: totalRevenue > 0 ? totalRevenue : receiptRevenue,
      orders: totalOrders,
      avgOrderValue: totalOrders > 0 ? Math.round((totalRevenue > 0 ? totalRevenue : receiptRevenue) / totalOrders) : 0,
      avgProducts: totalOrders > 0 ? Number((retailQty / totalOrders).toFixed(2)) : 0,
      ads: 0,
      profit: totalRevenue - totalCost - expense,
      revenuePercent: 100,
      profitPercent: totalRevenue > 0 ? Math.round(((totalRevenue - totalCost - expense) / totalRevenue) * 100) : 0,
    },
    {
      label: 'Bán lẻ',
      type: 'retail',
      revenue: retailRevenue,
      orders: retailOrders,
      avgOrderValue: retailOrders > 0 ? Math.round(retailRevenue / retailOrders) : 0,
      avgProducts: retailOrders > 0 ? Number((retailQty / retailOrders).toFixed(2)) : 0,
      ads: 0,
      profit: retailRevenue - totalCost,
      revenuePercent: totalRevenue > 0 ? Math.round((retailRevenue / totalRevenue) * 100) : 0,
      profitPercent: retailRevenue > 0 ? Math.round(((retailRevenue - totalCost) / retailRevenue) * 100) : 0,
    },
    {
      label: 'Bán sỉ',
      type: 'wholesale',
      revenue: 0,
      orders: 0,
      avgOrderValue: 0,
      avgProducts: 0,
      ads: 0,
      profit: 0,
      revenuePercent: 0,
      profitPercent: 0,
    },
  ];

  const orderChannels = orderStatusAgg.map((row: any) => {
    const label = row._id || 'Admin';
    return {
      label,
      icon: iconForChannel(label),
      newOrders: row.pending ?? 0,
      packing: row.packing ?? 0,
      shipping: row.shipping ?? 0,
      cancelled: row.cancelled ?? 0,
      returned: row.returned ?? 0,
    };
  });

  const topProductsList = topProductsAgg.map((product: any, idx: number) => ({
    rank: idx + 1,
    name: product.name,
    code: product.code,
    qtySold: product.qtySold ?? 0,
    qtyReturned: returnMap.get(String(product._id)) ?? 0,
    revenue: product.revenue ?? 0,
  }));

  const walletsData = {
    zaloOA: 0,
    shopeeWallet: 0,
    zaloWallet: 0,
    adsWallet: 0,
  };
  for (const wallet of fetchedWallets || []) {
    if (wallet.code === 'ZALO_OA') walletsData.zaloOA = wallet.balance;
    if (wallet.code === 'SHOPEE') walletsData.shopeeWallet = wallet.balance;
    if (wallet.code === 'ZALO_WALLET') walletsData.zaloWallet = wallet.balance;
    if (wallet.code === 'ADS') walletsData.adsWallet = wallet.balance;
  }

  const periodMs = chartEnd.getTime() - chartStart.getTime();
  const currentMap = mergeChartData(currentChartData);
  const prevMap = mergeChartData(prevChartData);
  const chartDays: Date[] = [];
  const cursor = new Date(chartStart);
  while (cursor < chartEnd) {
    chartDays.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  const chartData = chartDays.map((day) => {
    const label = `${day.getDate()}/${day.getMonth() + 1}`;
    const fullDate = `${String(day.getDate()).padStart(2, '0')}/${String(day.getMonth() + 1).padStart(2, '0')}/${day.getFullYear()}`;
    const prevDay = new Date(day.getTime() - periodMs);
    const prevLabel = `${prevDay.getDate()}/${prevDay.getMonth() + 1}`;
    return {
      date: label,
      fullDate,
      revenue: currentMap.get(label) ?? 0,
      prevRevenue: prevMap.get(prevLabel) ?? 0,
    };
  });

  const recentSales = recentSalesDocs.map((sale: any) => ({
    id: sale._id,
    code: sale.code,
    customerName: sale.customerName || sale.customerId?.name || 'Hệ thống',
    value: sale.value ?? 0,
    createdAt: sale.createdAt,
    branchName: sale.branchId?.name || '',
    type: sale.saleType || 'Bán lẻ',
  }));

  res.json({
    totals: {
      products,
      lowStock,
      customers,
      vendors,
      sales: totalOrders,
      purchases,
      revenue: totalRevenue > 0 ? totalRevenue : receiptRevenue,
      expense,
      profit: totalRevenue - totalCost - expense,
      projects,
      tasks,
      accountingTypes,
    },
    salesChannels,
    orderChannels,
    inventory: {
      totalQty: inventoryData.totalQty,
      totalCostValue: inventoryData.totalCostValue,
      totalSaleValue: inventoryData.totalSaleValue,
    },
    topProducts: topProductsList,
    chartData,
    wallets: walletsData,
    recentSales,
    availableStores,
  });
});

function buildChartAgg(dateFilter: { $gte: Date; $lt: Date }, branchMatch: Record<string, any>) {
  return [
    { $match: { createdAt: dateFilter, status: 'completed', ...branchMatch } },
    {
      $group: {
        _id: {
          day: { $dayOfMonth: { date: '$createdAt', timezone: 'Asia/Ho_Chi_Minh' } },
          month: { $month: { date: '$createdAt', timezone: 'Asia/Ho_Chi_Minh' } },
        },
        total: { $sum: '$value' },
      },
    },
  ];
}

function makePreviousFilter(startDate: Date, endDate: Date) {
  const periodMs = endDate.getTime() - startDate.getTime();
  return { $gte: new Date(startDate.getTime() - periodMs), $lt: new Date(startDate) };
}

function mergeChartData(rows: any[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = `${row._id.day}/${row._id.month}`;
    map.set(key, (map.get(key) ?? 0) + (row.total || 0));
  }
  return map;
}

router.get('/daily-products', async (req, res) => {
  const { date, stores } = req.query;
  if (!date) return res.status(400).json({ message: 'Thiếu tham số date' });

  const parts = String(date).split('/');
  if (parts.length !== 3) return res.status(400).json({ message: 'Định dạng ngày không hợp lệ (dd/mm/yyyy)' });
  const dayStart = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayStart.getDate() + 1);

  let branchMatch: any = {};
  if (stores) {
    const allBranches = await mongoose.connection.db!.collection('branches').find({ isActive: true }).project({ _id: 1, name: 1 }).toArray();
    const storeNames = String(stores).split(',').filter(Boolean);
    const selectedBranches = allBranches.filter((branch: any) => storeNames.includes(branch.name));
    const branchIds = selectedBranches.map((branch: any) => branch._id);
    if (branchIds.length > 0) branchMatch = { branchId: { $in: branchIds } };
  }

  const result = await SalePayment.aggregate([
    { $match: { createdAt: { $gte: dayStart, $lt: dayEnd }, status: 'completed', ...branchMatch } },
    { $unwind: { path: '$items', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'productInfo' } },
    { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$items.productId',
        name: { $first: { $ifNull: ['$productInfo.name', 'Không rõ'] } },
        code: { $first: { $ifNull: ['$productInfo.code', ''] } },
        qty: { $sum: { $ifNull: ['$items.amount', 1] } },
        revenue: { $sum: { $ifNull: ['$items.total', 0] } },
      },
    },
    { $sort: { revenue: -1 } },
  ]).catch(() => []);

  res.json({
    date,
    products: result.map((product: any) => ({
      code: product.code,
      name: product.name,
      qty: product.qty,
      revenue: product.revenue,
      price: product.qty > 0 ? Math.round(product.revenue / product.qty) : 0,
    })),
  });
});

export default router;
