import { Router } from 'express';
import mongoose from 'mongoose';
import { Wallet } from '../../core/system/system.models.js';
import { Customer } from '../customer/customer.models.js';
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

function activityDateExpression() {
  return { $ifNull: ['$completedAt', '$createdAt'] };
}

function buildChartAgg(dateFilter: { $gte: Date; $lt: Date }, branchMatch: Record<string, any>) {
  return [
    { $addFields: { activityAt: activityDateExpression() } },
    { $match: { activityAt: dateFilter, status: 'completed', ...branchMatch } },
    {
      $group: {
        _id: {
          day: { $dayOfMonth: { date: '$activityAt', timezone: 'Asia/Ho_Chi_Minh' } },
          month: { $month: { date: '$activityAt', timezone: 'Asia/Ho_Chi_Minh' } },
        },
        total: { $sum: '$value' },
      },
    },
  ];
}

function buildRefundBranchStages(branchIds: mongoose.Types.ObjectId[]) {
  return branchIds.length
    ? [{ $match: { 'saleInfo.branchId': { $in: branchIds } } }]
    : [];
}

function buildRefundChartAgg(dateFilter: { $gte: Date; $lt: Date }, branchIds: mongoose.Types.ObjectId[]) {
  return [
    { $addFields: { activityAt: activityDateExpression() } },
    { $match: { activityAt: dateFilter, status: 'completed' } },
    { $lookup: { from: 'salepayments', localField: 'paymentId', foreignField: '_id', as: 'saleInfo' } },
    { $unwind: { path: '$saleInfo', preserveNullAndEmptyArrays: false } },
    ...buildRefundBranchStages(branchIds),
    {
      $group: {
        _id: {
          day: { $dayOfMonth: { date: '$activityAt', timezone: 'Asia/Ho_Chi_Minh' } },
          month: { $month: { date: '$activityAt', timezone: 'Asia/Ho_Chi_Minh' } },
        },
        total: { $sum: { $multiply: [{ $ifNull: ['$value', 0] }, -1] } },
      },
    },
  ];
}


router.get('/', async (req, res) => {
  try {
    const { stores, date, chartRange, topRange, topLimit } = req.query;
    const overviewCacheKey = cacheKey('dashboard:overview', {
      stores: stores || '',
      date: date || 'Hôm nay',
      chartRange: chartRange || '7 ngày',
      topRange: topRange || '7 ngày',
      topLimit: topLimit || '10',
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

    const [
      products,
      lowStock,
      customers,
      vendors,
      purchases,
      projects,
      tasks,
      retailAgg,
      refundAgg,
      saleChannelAgg,
      saleChannelRefundAgg,
      topProductsAgg,
      topReturnsAgg,
      totalInventory,
      fetchedWallets,
      recentSalesDocs,
      currentChartData,
      currentRefundChartData,
      prevChartData,
      prevRefundChartData,
    ] = await Promise.all([
      Product.countDocuments(),
      ProductBranchStock.countDocuments({ $expr: { $lte: ['$qty', '$minQuantity'] }, ...branchMatch }).catch(() => 0),
      Customer.countDocuments(),
      Vendor.countDocuments(),
      VendorPurchase.countDocuments({ createdAt: dateFilter }),
      Project.countDocuments(),
      Task.countDocuments(),
      SalePayment.aggregate([
        { $addFields: { activityAt: activityDateExpression() } },
        { $match: { activityAt: dateFilter, status: 'completed', ...branchMatch } },
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
      ProductRefund.aggregate([
        { $addFields: { activityAt: activityDateExpression() } },
        { $match: { activityAt: dateFilter, status: 'completed' } },
        { $lookup: { from: 'salepayments', localField: 'paymentId', foreignField: '_id', as: 'saleInfo' } },
        { $unwind: { path: '$saleInfo', preserveNullAndEmptyArrays: false } },
        ...buildRefundBranchStages(branchIds),
        { $unwind: { path: '$items', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: null,
            refundValue: { $sum: { $ifNull: ['$items.value', 0] } },
            refundedProducts: { $sum: { $ifNull: ['$items.amount', 0] } },
            refundCost: {
              $sum: {
                $multiply: [
                  { $ifNull: ['$items.amount', 0] },
                  { $ifNull: ['$items.cost', 0] },
                ],
              },
            },
          },
        },
      ]).catch(() => []),
      SalePayment.aggregate([
        { $addFields: { activityAt: activityDateExpression() } },
        { $match: { activityAt: dateFilter, status: 'completed', ...branchMatch } },
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
      ProductRefund.aggregate([
        { $addFields: { activityAt: activityDateExpression() } },
        { $match: { activityAt: dateFilter, status: 'completed' } },
        { $lookup: { from: 'salepayments', localField: 'paymentId', foreignField: '_id', as: 'saleInfo' } },
        { $unwind: { path: '$saleInfo', preserveNullAndEmptyArrays: false } },
        ...buildRefundBranchStages(branchIds),
        { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
        {
          $group: {
            _id: '$saleInfo.saleChannelId',
            revenue: { $sum: { $multiply: [{ $ifNull: ['$items.value', 0] }, -1] } },
            totalCost: {
              $sum: {
                $multiply: [
                  {
                    $multiply: [
                      { $ifNull: ['$items.amount', 0] },
                      { $ifNull: ['$items.cost', 0] },
                    ],
                  },
                  -1,
                ],
              },
            },
            amountProducts: { $sum: { $multiply: [{ $ifNull: ['$items.amount', 0] }, -1] } },
          },
        },
      ]).catch(() => []),
      SalePayment.aggregate([
        { $addFields: { activityAt: activityDateExpression() } },
        { $match: { activityAt: topDateFilter, status: 'completed', ...branchMatch } },
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
        { $addFields: { activityAt: activityDateExpression() } },
        { $match: { activityAt: topDateFilter, status: 'completed' } },
        { $lookup: { from: 'salepayments', localField: 'paymentId', foreignField: '_id', as: 'saleInfo' } },
        { $unwind: { path: '$saleInfo', preserveNullAndEmptyArrays: false } },
        ...buildRefundBranchStages(branchIds),
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            qtyReturned: { $sum: { $ifNull: ['$items.amount', 0] } },
            refundValue: { $sum: { $ifNull: ['$items.value', 0] } },
          },
        },
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
      SalePayment.find({ status: 'completed', ...branchMatch })
        .sort({ completedAt: -1, createdAt: -1 })
        .limit(10)
        .populate('branchId', 'name')
        .populate('customerId', 'name phone')
        .populate('saleChannelId', 'name')
        .lean(),
      SalePayment.aggregate(buildChartAgg(chartFilter, branchMatch)).catch(() => []),
      ProductRefund.aggregate(buildRefundChartAgg(chartFilter, branchIds)).catch(() => []),
      SalePayment.aggregate(buildChartAgg(makePreviousFilter(chartStart, chartEnd), branchMatch)).catch(() => []),
      ProductRefund.aggregate(buildRefundChartAgg(makePreviousFilter(chartStart, chartEnd), branchIds)).catch(() => []),
    ]);

    const receiptRevenue = 0;
    const expense = 0;
    const inventoryData = totalInventory[0] ?? { totalQty: 0, totalCostValue: 0, totalSaleValue: 0 };
    const retailRevenue = (retailAgg[0]?.revenue ?? 0) - (refundAgg[0]?.refundValue ?? 0);
    const retailOrders = retailAgg[0]?.orders ?? 0;
    const retailQty = Math.max((retailAgg[0]?.amountProducts ?? 0) - (refundAgg[0]?.refundedProducts ?? 0), 0);
    const totalRevenue = retailRevenue;
    const hasRetailActivity = retailOrders > 0 || (refundAgg[0]?.refundValue ?? 0) > 0;
    const totalRevenueBase = hasRetailActivity ? totalRevenue : receiptRevenue;
    const totalOrders = retailOrders;
    const totalCost = (retailAgg[0]?.totalCost ?? 0) - (refundAgg[0]?.refundCost ?? 0);
    const returnMap = new Map(topReturnsAgg.map((row: any) => [String(row._id), row.qtyReturned ?? 0]));
    const returnRevenueMap = new Map(topReturnsAgg.map((row: any) => [String(row._id), row.refundValue ?? 0]));
    const saleChannelRefundMap = new Map(saleChannelRefundAgg.map((row: any) => [String(row._id ?? ''), row]));

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
      ...saleChannelAgg.map((channel: any, index: number) => {
        const refundRow = saleChannelRefundMap.get(String(channel._id ?? ''));
        const netChannelRevenue = (channel.revenue ?? 0) + (refundRow?.revenue ?? 0);
        const netChannelCost = (channel.totalCost ?? 0) + (refundRow?.totalCost ?? 0);
        const netChannelProducts = (channel.amountProducts ?? 0) + (refundRow?.amountProducts ?? 0);
        return {
        label: channel.label || `Kênh ${index + 1}`,
        type: `channel-${String(channel._id || index)}`,
        revenue: netChannelRevenue,
        orders: channel.orders ?? 0,
        avgOrderValue: channel.orders > 0 ? Math.round(netChannelRevenue / channel.orders) : 0,
        avgProducts: channel.orders > 0 ? Number((netChannelProducts / channel.orders).toFixed(2)) : 0,
        ads: 0,
        profit: netChannelRevenue - netChannelCost,
        revenuePercent: totalRevenueBase !== 0 ? Math.round((netChannelRevenue / totalRevenueBase) * 100) : 0,
        profitPercent: netChannelRevenue !== 0 ? Math.round(((netChannelRevenue - netChannelCost) / netChannelRevenue) * 100) : 0,
        };
      }),
    ];

    const topProductsList = topProductsAgg.map((product: any, index: number) => ({
      rank: index + 1,
      name: product.name,
      code: product.code,
      qtySold: product.qtySold ?? 0,
      qtyReturned: returnMap.get(String(product._id)) ?? 0,
      revenue: (product.revenue ?? 0) - (returnRevenueMap.get(String(product._id)) ?? 0),
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
    const currentMap = mergeChartData([...currentChartData, ...currentRefundChartData]);
    const prevMap = mergeChartData([...prevChartData, ...prevRefundChartData]);
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
      },
      salesChannels,
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
    { $addFields: { activityAt: activityDateExpression() } },
    { $match: { activityAt: { $gte: dayStart, $lt: dayEnd }, status: 'completed', ...branchMatch } },
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

  const refundResult = await ProductRefund.aggregate([
    { $addFields: { activityAt: activityDateExpression() } },
    { $match: { activityAt: { $gte: dayStart, $lt: dayEnd }, status: 'completed' } },
    { $lookup: { from: 'salepayments', localField: 'paymentId', foreignField: '_id', as: 'saleInfo' } },
    { $unwind: { path: '$saleInfo', preserveNullAndEmptyArrays: false } },
    ...(branchMatch.branchId?.$in?.length ? [{ $match: { 'saleInfo.branchId': branchMatch.branchId } }] : []),
    { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
    { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'productInfo' } },
    { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$items.productId',
        name: { $first: { $ifNull: ['$productInfo.name', 'Không rõ'] } },
        code: { $first: { $ifNull: ['$productInfo.code', ''] } },
        qtyReturned: { $sum: { $ifNull: ['$items.amount', 0] } },
        refundValue: { $sum: { $ifNull: ['$items.value', 0] } },
      },
    },
  ]).catch(() => []);

  const refundByProduct = new Map(refundResult.map((row: any) => [String(row._id), row]));

  res.json({
    date,
    products: result.map((product: any) => {
      const refundRow = refundByProduct.get(String(product._id));
      const netQty = Math.max((product.qty ?? 0) - (refundRow?.qtyReturned ?? 0), 0);
      const netRevenue = (product.revenue ?? 0) - (refundRow?.refundValue ?? 0);
      return {
        code: product.code,
        name: product.name,
        qty: netQty,
        qtyReturned: refundRow?.qtyReturned ?? 0,
        revenue: netRevenue,
        price: netQty > 0 ? Math.round(netRevenue / netQty) : 0,
      };
    }),
  });
});

export default router;
