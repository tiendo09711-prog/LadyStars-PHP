import { Router } from 'express';
import mongoose from 'mongoose';
import { AccountingType, ExpensePayment, Receipt } from '../accounting/accounting.models.js';
import { Customer } from '../customer/customer.models.js';
import { Product, ProductBranchStock, SalePayment } from '../product/product.models.js';
import { Project, Task } from '../task/task.models.js';
import { Wallet } from '../../core/system/system.models.js';
import { Vendor, VendorPurchase } from '../vendor/vendor.models.js';

const router = Router();

// GET /dashboard — Tổng hợp dữ liệu cho toàn bộ Trang Tổng quan
router.get('/', async (req, res) => {
  const { stores, date } = req.query;

  // 1. Date range filter
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let startDate = new Date(today);
  let endDate = new Date(today);
  endDate.setDate(today.getDate() + 1);

  const d = String(date || 'Hôm nay');
  if (d === 'Hôm qua') {
    startDate.setDate(today.getDate() - 1);
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1);
  } else if (d === '7 ngày') {
    startDate.setDate(today.getDate() - 6);
  } else if (d === '14 ngày') {
    startDate.setDate(today.getDate() - 13);
  } else if (d === '30 ngày') {
    startDate.setDate(today.getDate() - 29);
  } else if (d === 'Tuần này') {
    startDate.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
  } else if (d === 'Tuần trước') {
    startDate.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1) - 7);
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 7);
  } else if (d === 'Tháng này') {
    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (d === 'Tháng trước') {
    startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    endDate = new Date(today.getFullYear(), today.getMonth(), 1);
  }

  const dateFilter = { $gte: startDate, $lt: endDate };

  // 2. Lấy danh sách chi nhánh
  const allBranches = await mongoose.connection.db.collection('branches').find({ isActive: true }).project({ _id: 1, name: 1 }).toArray();
  const availableStores = allBranches.map((b: any) => b.name);

  // 3. Branch filter
  let branchMatch: any = {};
  let receiptBranchMatch: any = {};
  if (stores) {
    const storeNames = String(stores).split(',');
    const selectedBranches = allBranches.filter(b => storeNames.includes((b as any).name));
    const branchIds = selectedBranches.map((b: any) => b._id);
    if (branchIds.length > 0) {
      branchMatch = { branchId: { $in: branchIds } };
      receiptBranchMatch = { branchId: { $in: branchIds } };
    }
  }

  // 4. Tất cả các query song song
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
    // ── Doanh thu thật từ SalePayment (status = completed) ──
    retailAgg,
    // ── Sản phẩm bán chạy từ items của SalePayment ──
    topProductsAgg,
    // ── Tồn kho ──
    totalInventory,
    // ── Số đơn SalePayment tổng ──
    totalSaleCount,
    // ── Lấy thông tin Ví ──
    fetchedWallets,
  ] = await Promise.all([
    Product.countDocuments(),
    ProductBranchStock.countDocuments({ $expr: { $lte: ['$qty', '$minQuantity'] }, ...branchMatch }).catch(() => 0),
    Customer.countDocuments(),
    Vendor.countDocuments(),
    VendorPurchase.countDocuments({ createdAt: dateFilter }),
    Receipt.aggregate([
      { $match: { createdAt: dateFilter, ...receiptBranchMatch } },
      { $group: { _id: null, total: { $sum: '$value' } } }
    ]).catch(() => []),
    ExpensePayment.aggregate([
      { $match: { createdAt: dateFilter, ...receiptBranchMatch } },
      { $group: { _id: null, total: { $sum: '$value' } } }
    ]).catch(() => []),
    Project.countDocuments(),
    Task.countDocuments(),
    AccountingType.countDocuments(),

    // Doanh thu thật: tổng từ SalePayment hoàn tất, theo thời gian và chi nhánh
    SalePayment.aggregate([
      {
        $match: {
          createdAt: dateFilter,
          status: 'completed',
          ...branchMatch,
        },
      },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$value' },
          orders: { $sum: 1 },
          totalCost: { $sum: '$totalCost' },
        },
      },
    ]).catch(() => []),

    // Top sản phẩm bán chạy: unwind items từ SalePayment, group theo productId
    SalePayment.aggregate([
      {
        $match: {
          createdAt: dateFilter,
          status: { $nin: ['draft', 'cancelled'] },
          ...branchMatch,
        },
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          qtySold: { $sum: '$items.amount' },
          revenue: { $sum: '$items.total' },
        },
      },
      { $sort: { qtySold: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productInfo',
        },
      },
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

    // Tồn kho tổng hợp
    ProductBranchStock.aggregate([
      { $match: branchMatch },
      {
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: '_id',
          as: 'productInfo',
        },
      },
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

    // Đếm SalePayment
    SalePayment.countDocuments({ createdAt: dateFilter, ...branchMatch }),

    // Lấy thông tin Ví
    Wallet.find(),
  ]);

  const revenue = receipts[0]?.total ?? 0;
  const expense = expenses[0]?.total ?? 0;
  const inventoryData = totalInventory[0] ?? { totalQty: 0, totalCostValue: 0, totalSaleValue: 0 };

  const retailRevenue = retailAgg[0]?.revenue ?? 0;
  const retailOrders = retailAgg[0]?.orders ?? 0;
  const wholesaleRevenue = 0;
  const wholesaleOrders = 0;
  const totalRevenue = retailRevenue;

  // ── Bảng Kênh bán ──
  const salesChannels = [
    {
      label: 'Tổng',
      type: 'total',
      revenue: totalRevenue > 0 ? totalRevenue : revenue,
      orders: totalSaleCount,
      avgOrderValue: totalSaleCount > 0 ? Math.round((totalRevenue > 0 ? totalRevenue : revenue) / totalSaleCount) : 0,
      ads: 0,
      profit: (totalRevenue > 0 ? totalRevenue : revenue) - expense,
      revenuePercent: 100,
    },
    {
      label: 'Bán lẻ',
      type: 'retail',
      revenue: retailRevenue,
      orders: retailOrders,
      avgOrderValue: retailOrders > 0 ? Math.round(retailRevenue / retailOrders) : 0,
      ads: 0,
      profit: retailRevenue - (retailRevenue / Math.max(totalRevenue || revenue, 1)) * expense,
      revenuePercent: totalRevenue > 0 ? Math.round((retailRevenue / totalRevenue) * 100) : 0,
    },
    {
      label: 'Bán sỉ',
      type: 'wholesale',
      revenue: wholesaleRevenue,
      orders: wholesaleOrders,
      avgOrderValue: wholesaleOrders > 0 ? Math.round(wholesaleRevenue / wholesaleOrders) : 0,
      ads: 0,
      profit: wholesaleRevenue - (wholesaleRevenue / Math.max(totalRevenue || revenue, 1)) * expense,
      revenuePercent: totalRevenue > 0 ? Math.round((wholesaleRevenue / totalRevenue) * 100) : 0,
    },
  ];

  // ── Đơn hàng theo gian hàng (từ SalePayment group theo saleChannelId) ──
  const orderChannelAgg = await SalePayment.aggregate([
    { $match: { createdAt: dateFilter, ...branchMatch } },
    {
      $group: {
        _id: '$saleChannelId',
        total: { $sum: 1 },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
        packing: { $sum: { $cond: [{ $eq: ['$status', 'packing'] }, 1, 0] } },
        shipping: { $sum: { $cond: [{ $eq: ['$status', 'shipping'] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        returned: { $sum: { $cond: [{ $eq: ['$status', 'returned'] }, 1, 0] } },
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
  ]).catch(() => []);

  const CHANNEL_ICON_MAP: Record<string, string> = {
    admin: 'admin', facebook: 'facebook', instagram: 'instagram',
    zalo: 'zalo', api: 'api', website: 'website', shopee: 'shopee', tiktok: 'tiktok',
  };

  const orderChannels = orderChannelAgg.map((ch: any) => {
    const name: string = ch.channelInfo?.name || 'Không rõ';
    const iconKey = Object.keys(CHANNEL_ICON_MAP).find(k => name.toLowerCase().includes(k)) || 'admin';
    return {
      label: name,
      icon: CHANNEL_ICON_MAP[iconKey],
      newOrders: ch.pending ?? 0,
      packing: ch.packing ?? 0,
      shipping: ch.shipping ?? 0,
      cancelled: ch.cancelled ?? 0,
      returned: ch.returned ?? 0,
    };
  });

  // ── Sản phẩm bán chạy ──
  const topProductsList = topProductsAgg.map((p: any, idx: number) => ({
    rank: idx + 1,
    name: p.name,
    code: p.code,
    qtySold: p.qtySold ?? 0,
    qtyReturned: 0,
    revenue: p.revenue ?? 0,
  }));

  // ── Biểu đồ doanh thu thực tế từ DB ──
  const cRange = String(req.query.chartRange || '14 ngày');

  let chartStart = new Date(today);
  let chartEnd = new Date(today);
  chartEnd.setDate(today.getDate() + 1);

  if (cRange === '7 ngày') {
    chartStart.setDate(today.getDate() - 6);
  } else if (cRange === '14 ngày') {
    chartStart.setDate(today.getDate() - 13);
  } else if (cRange === '30 ngày') {
    chartStart.setDate(today.getDate() - 29);
  } else if (cRange === 'Tháng này') {
    chartStart = new Date(today.getFullYear(), today.getMonth(), 1);
    chartEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  } else if (cRange === 'Tháng trước') {
    chartStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    chartEnd = new Date(today.getFullYear(), today.getMonth(), 1);
  }

  const periodMs = chartEnd.getTime() - chartStart.getTime();
  const prevStart = new Date(chartStart.getTime() - periodMs);
  const prevEnd = new Date(chartStart);

  // Query doanh thu kỳ này + kỳ trước từ SalePayment (status=completed)
  const buildChartAgg = (start: Date, end: Date) => [
    {
      $match: {
        createdAt: { $gte: start, $lt: end },
        status: 'completed',
        ...branchMatch,
      },
    },
    { $unwind: { path: '$items', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: {
          day: { $dayOfMonth: { $toDate: '$createdAt' } },
          month: { $month: { $toDate: '$createdAt' } },
          year: { $year: { $toDate: '$createdAt' } },
        },
        total: { $sum: '$items.total' },
      },
    },
  ];

  const [currentChartData, prevChartData] = await Promise.all([
    SalePayment.aggregate(buildChartAgg(chartStart, chartEnd)).catch(() => []),
    SalePayment.aggregate(buildChartAgg(prevStart, prevEnd)).catch(() => []),
  ]);

  // Map theo ngày
  const mergeByDay = (a: any[]) => {
    const map = new Map<string, number>();
    for (const row of a) {
      const key = `${row._id.day}/${row._id.month}`;
      map.set(key, (map.get(key) ?? 0) + (row.total || 0));
    }
    return map;
  };

  const currentMap = mergeByDay(currentChartData);
  const prevMap = mergeByDay(prevChartData);

  const chartDays: Date[] = [];
  const cur = new Date(chartStart);
  while (cur < chartEnd) {
    chartDays.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }

  const chartData = chartDays.map((d) => {
    const label = `${d.getDate()}/${d.getMonth() + 1}`;
    const fullDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const prevD = new Date(d.getTime() - periodMs);
    const prevLabel = `${prevD.getDate()}/${prevD.getMonth() + 1}`;
    return {
      date: label,
      fullDate,
      revenue: currentMap.get(label) ?? 0,
      prevRevenue: prevMap.get(prevLabel) ?? 0,
    };
  });

  // Build wallets object from Wallet collection
  const walletsData = {
    zaloOA: 0,
    shopeeWallet: 0,
    zaloWallet: 0,
    adsWallet: 0,
  };
  const walletsList = fetchedWallets || [];
  for (const w of walletsList) {
    if (w.code === 'ZALO_OA') walletsData.zaloOA = w.balance;
    if (w.code === 'SHOPEE') walletsData.shopeeWallet = w.balance;
    if (w.code === 'ZALO_WALLET') walletsData.zaloWallet = w.balance;
    if (w.code === 'ADS') walletsData.adsWallet = w.balance;
  }

  res.json({
    totals: {
      products,
      lowStock,
      customers,
      vendors,
      sales: totalSaleCount,
      purchases,
      revenue: totalRevenue > 0 ? totalRevenue : revenue,
      expense,
      profit: (totalRevenue > 0 ? totalRevenue : revenue) - expense,
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
    availableStores,
  });
});
// GET /dashboard/daily-products — Sản phẩm bán ra trong 1 ngày (từ SalePayment)
router.get('/daily-products', async (req, res) => {
  const { date, stores } = req.query; // date format: "dd/mm/yyyy"
  if (!date) return res.status(400).json({ message: 'Thiếu tham số date' });

  // Parse date string "dd/mm/yyyy" to Date range
  const parts = String(date).split('/');
  if (parts.length !== 3) return res.status(400).json({ message: 'Định dạng ngày không hợp lệ (dd/mm/yyyy)' });
  const dayStart = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayStart.getDate() + 1);

  let branchMatch: any = {};
  if (stores) {
    const allBranches = await mongoose.connection.db.collection('branches').find({ isActive: true }).project({ _id: 1, name: 1 }).toArray();
    const storeNames = String(stores).split(',').filter(Boolean);
    if (storeNames.length > 0) {
      const selectedBranches = allBranches.filter(b => storeNames.includes((b as any).name));
      const branchIds = selectedBranches.map((b: any) => b._id);
      if (branchIds.length > 0) branchMatch = { branchId: { $in: branchIds } };
    }
  }

  // Aggregate from SalePayment → unwind items → lookup product name
  const result = await SalePayment.aggregate([
    {
      $match: {
        createdAt: { $gte: dayStart, $lt: dayEnd },
        status: 'completed',
        ...branchMatch,
      },
    },
    { $unwind: { path: '$items', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'products',
        localField: 'items.productId',
        foreignField: '_id',
        as: 'productInfo',
      },
    },
    { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: { productId: '$items.productId' },
        name: { $first: { $ifNull: ['$productInfo.name', 'Không rõ'] } },
        code: { $first: { $ifNull: ['$productInfo.code', ''] } },
        qty: { $sum: { $ifNull: ['$items.amount', 1] } },
        revenue: { $sum: { $ifNull: ['$items.total', 0] } },
      },
    },
    { $sort: { revenue: -1 } },
  ]).catch(() => []);

  const resultList = result.map((p: any) => ({
    code: p.code,
    name: p.name,
    qty: p.qty,
    revenue: p.revenue,
    price: p.qty > 0 ? Math.round(p.revenue / p.qty) : 0,
  }));

  res.json({ date, products: resultList });
});

export default router;
