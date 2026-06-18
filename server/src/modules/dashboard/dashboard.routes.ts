import { Router } from 'express';
import mongoose from 'mongoose';
import { Wallet } from '../../core/system/system.models.js';
import { AccountingType, ExpensePayment, Receipt } from '../accounting/accounting.models.js';
import { Customer } from '../customer/customer.models.js';
import { Order } from '../orders/orders.models.js';
import { Product, ProductBranchStock, ProductRefund, SalePayment } from '../product/product.models.js';
import { Project, Task } from '../task/task.models.js';
import { Vendor, VendorPurchase } from '../vendor/vendor.models.js';
import { cacheKey, getCachedJson, setCachedJson } from '../../core/cache/cache.js';

const router = Router();

type BranchDoc = { _id: mongoose.Types.ObjectId; name: string };

function normalizeText(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function makeDateRange(label: unknown, fallback = 'Hôm nay') {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let startDate = new Date(today);
  let endDate = new Date(today);
  endDate.setDate(today.getDate() + 1);

  const raw = normalizeText(label || fallback);

  if (raw.includes('hom qua') && !raw.includes('tuan')) {
    startDate.setDate(today.getDate() - 1);
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1);
  } else if (raw.includes('7')) {
    startDate.setDate(today.getDate() - 6);
  } else if (raw.includes('14')) {
    startDate.setDate(today.getDate() - 13);
  } else if (raw.includes('30')) {
    startDate.setDate(today.getDate() - 29);
  } else if (raw.includes('tuan') && raw.includes('truoc')) {
    startDate.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1) - 7);
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 7);
  } else if (raw.includes('tuan')) {
    startDate.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
  } else if (raw.includes('thang') && raw.includes('truoc')) {
    startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    endDate = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (raw.includes('thang')) {
    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
  }

  return { today, startDate, endDate, filter: { $gte: startDate, $lt: endDate } };
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
  try {
    const { stores, date, chartRange, topRange, topLimit, orderRange } = req.query;
    const overviewCacheKey = cacheKey('dashboard:overview', {
      stores: stores || '',
      date: date || 'Hôm nay',
      chartRange: chartRange || '7 ngày',
      topRange: topRange || '7 ngày',
      topLimit: topLimit || '10',
      orderRange: orderRange || '2 ngày',
    });
    if (!req.query.refresh) {
      const cached = await getCachedJson<Record<string, unknown>>(overviewCacheKey);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(cached);
      }
    }
    const { filter: dateFilter } = makeDateRange(date);
    const { filter: chartFilter, startDate: chartStart, endDate: chartEnd } = makeDateRange(chartRange || '7 ngày');
    const { filter: topDateFilter } = makeDateRange(topRange || '7 ngày');
    const { filter: orderDateFilter } = makeDateRange(orderRange || '2 ngày');
    const parsedTopLimit = Math.min(Math.max(Number(String(topLimit || '10').replace(/\D/g, '')) || 10, 1), 50);

    const allBranches = await mongoose.connection.db!
      .collection('branches')
      .find({ isActive: true })
      .project({ _id: 1, name: 1 })
      .toArray() as BranchDoc[];

    const availableStores = allBranches
      .map((branch) => branch.name)
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, 'vi'));

    const storeNames = stores ? String(stores).split(',').filter(Boolean) : [];
    const selectedBranches = storeNames.length
      ? allBranches.filter((branch) => storeNames.includes(branch.name))
      : [];
    const branchIds = selectedBranches.map((branch) => branch._id);
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
      saleChannelAgg,
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
        { $match: { createdAt: dateFilter, status: 'completed', ...branchMatch } },
        {
          $group: {
            _id: '$saleChannelId',
            revenue: { $sum: '$value' },
            orders: { $sum: 1 },
            totalCost: { $sum: '$totalCost' },
            amountProducts: { $sum: '$amountProducts' },
          },
        },
        {
          $lookup: {
            from: 'salechannels',
            localField: '_id',
            foreignField: '_id',
            as: 'channelInfo',
          },
        },
        { $unwind: { path: '$channelInfo', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            revenue: 1,
            orders: 1,
            totalCost: 1,
            amountProducts: 1,
            label: { $ifNull: ['$channelInfo.name', 'Chưa phân kênh'] },
          },
        },
        { $sort: { revenue: -1, orders: -1 } },
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
      Wallet.find().lean(),
      Order.aggregate([
        { $match: { createdAt: orderDateFilter, ...orderStoreMatch } },
        {
          $group: {
            _id: '$source',
            total: { $sum: 1 },
            pending: { $sum: { $cond: [{ $in: ['$status', ['Cần xử lý', 'Chờ xử lý', 'Mới', 'Đang xử lý']] }, 1, 0] } },
            packing: { $sum: { $cond: [{ $in: ['$status', ['Đang đóng gói', 'In và đóng gói']] }, 1, 0] } },
            shipping: { $sum: { $cond: [{ $in: ['$status', ['Đang chuyển', 'Đã bàn giao', 'Đang giao']] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $in: ['$status', ['Khách hủy', 'HVC hủy', 'Đã hủy']] }, 1, 0] } },
            returned: { $sum: { $cond: [{ $in: ['$status', ['Đã hoàn', 'Xác nhận hoàn', 'Hoàn hàng']] }, 1, 0] } },
          },
        },
        { $sort: { total: -1 } },
      ]).catch(() => []),
      SalePayment.find({ status: 'completed', ...branchMatch })
        .sort({ completedAt: -1, createdAt: -1 })
        .limit(10)
        .populate('branchId', 'name')
        .populate('customerId', 'name phone')
        .populate('saleChannelId', 'name')
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
    const totalRevenueBase = totalRevenue > 0 ? totalRevenue : receiptRevenue;
    const totalOrders = retailOrders;
    const totalCost = retailAgg[0]?.totalCost ?? 0;
    const returnMap = new Map(topReturnsAgg.map((row: any) => [String(row._id), row.qtyReturned ?? 0]));

    const salesChannels = [
      {
        label: 'Tổng',
        type: 'total',
        revenue: totalRevenueBase,
        orders: totalOrders,
        avgOrderValue: totalOrders > 0 ? Math.round(totalRevenueBase / totalOrders) : 0,
        avgProducts: totalOrders > 0 ? Number((retailQty / totalOrders).toFixed(2)) : 0,
        ads: 0,
        profit: totalRevenueBase - totalCost - expense,
        revenuePercent: 100,
        profitPercent: totalRevenueBase > 0 ? Math.round(((totalRevenueBase - totalCost - expense) / totalRevenueBase) * 100) : 0,
      },
      ...saleChannelAgg.map((channel: any, index: number) => ({
        label: channel.label || `Kênh ${index + 1}`,
        type: `channel-${String(channel._id || index)}`,
        revenue: channel.revenue ?? 0,
        orders: channel.orders ?? 0,
        avgOrderValue: channel.orders > 0 ? Math.round((channel.revenue ?? 0) / channel.orders) : 0,
        avgProducts: channel.orders > 0 ? Number(((channel.amountProducts ?? 0) / channel.orders).toFixed(2)) : 0,
        ads: 0,
        profit: (channel.revenue ?? 0) - (channel.totalCost ?? 0),
        revenuePercent: totalRevenueBase > 0 ? Math.round(((channel.revenue ?? 0) / totalRevenueBase) * 100) : 0,
        profitPercent: (channel.revenue ?? 0) > 0 ? Math.round((((channel.revenue ?? 0) - (channel.totalCost ?? 0)) / (channel.revenue ?? 0)) * 100) : 0,
      })),
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

    const topProductsList = topProductsAgg.map((product: any, index: number) => ({
      rank: index + 1,
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

    const walletItems = (fetchedWallets || [])
      .map((wallet: any) => ({
        code: wallet.code,
        name: wallet.name || wallet.code,
        balance: Number(wallet.balance ?? 0),
      }))
      .sort((left: any, right: any) => right.balance - left.balance || left.name.localeCompare(right.name, 'vi'));

    for (const wallet of walletItems) {
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
      createdAt: sale.completedAt || sale.createdAt,
      branchName: sale.branchId?.name || '',
      type: sale.saleChannelId?.name || sale.saleType || 'Bán lẻ',
    }));

    const payload = {
      totals: {
        products,
        lowStock,
        customers,
        vendors,
        sales: totalOrders,
        purchases,
        revenue: totalRevenueBase,
        expense,
        profit: totalRevenueBase - totalCost - expense,
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
      walletItems,
      recentSales,
      availableStores,
    };
    await setCachedJson(overviewCacheKey, payload, 12);
    res.setHeader('X-Cache', 'MISS');
    res.json(payload);
  } catch (error) {
    console.error('Dashboard route failed', error);
    res.status(500).json({ message: 'Không thể tải dữ liệu tổng quan' });
  }
});

router.get('/daily-products', async (req, res) => {
  const { date, stores } = req.query;
  if (!date) return res.status(400).json({ message: 'Thiếu tham số date' });

  const parts = String(date).split('/');
  if (parts.length !== 3) {
    return res.status(400).json({ message: 'Định dạng ngày không hợp lệ (dd/mm/yyyy)' });
  }

  const dayStart = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayStart.getDate() + 1);

  let branchMatch: Record<string, any> = {};
  if (stores) {
    const allBranches = await mongoose.connection.db!
      .collection('branches')
      .find({ isActive: true })
      .project({ _id: 1, name: 1 })
      .toArray() as BranchDoc[];
    const storeNames = String(stores).split(',').filter(Boolean);
    const selectedBranches = allBranches.filter((branch) => storeNames.includes(branch.name));
    const branchIds = selectedBranches.map((branch) => branch._id);
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
