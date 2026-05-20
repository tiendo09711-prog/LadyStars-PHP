import { Router } from 'express';
import { crudRoutes } from '../../core/utils/routeFactory.js';
import { writeAuditLog } from '../../core/audit/audit.service.js';
import { Batch, Category, DeliveryPartner, PaymentMethod, Product, ProductBranchStock, ProductLog, ProductRefund, SaleChannel, SalePayment, Shelf, StockAdjustment, Trademark, ProductEditLog } from './product.models.js';
import { buildProductRefundPayload, buildSalePaymentPayload, completeProductRefund, completeSalePayment, completeStockAdjustment } from './product.service.js';
import { Branch } from '../../core/org/branch.model.js';

const router = Router();

function nextCode(prefix: string) {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(2, 14);
  return `${prefix}${stamp}`;
}

async function populateSale(query: any) {
  return query.populate('items.productId', 'code name price cost qty unit type allowsSale').populate('saleChannelId', 'name').populate('customerId', 'name code phone');
}

async function populateRefund(query: any) {
  return query.populate('paymentId', 'code value status').populate('items.productId', 'code name price qty unit type');
}

router.use('/categories', crudRoutes(Category));
router.use('/trademarks', crudRoutes(Trademark));
router.use('/shelves', crudRoutes(Shelf));
router.use('/products', crudRoutes(Product));
router.use('/branch-stocks', crudRoutes(ProductBranchStock));
router.use('/sale-channels', crudRoutes(SaleChannel));
router.use('/delivery-partners', crudRoutes(DeliveryPartner));
router.use('/payment-methods', crudRoutes(PaymentMethod));
router.use('/stock-adjustments', crudRoutes(StockAdjustment));
router.use('/logs', crudRoutes(ProductLog));
router.use('/batches', crudRoutes(Batch));

router.get('/sales', async (req, res) => {
  const page = Math.max(Number(req.query.page ?? 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 100);
  const [items, total] = await Promise.all([
    populateSale(SalePayment.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)),
    SalePayment.countDocuments(),
  ]);
  res.json({ items, total, page, limit });
});

router.post('/sales', async (req, res) => {
  const payload = await buildSalePaymentPayload({
    ...req.body,
    code: req.body.code || nextCode('BH'),
    status: req.body.status || 'draft',
  });
  const item = await SalePayment.create(payload);
  const populated = await populateSale(SalePayment.findById(item._id));
  await writeAuditLog(req, { action: 'sales.create', module: 'sales', resource: 'SalePayment', resourceId: item.id, after: populated });
  res.status(201).json(populated);
});

router.post('/sales/:id/complete', async (req, res) => {
  const item = await completeSalePayment(req.params.id);
  const populated = await populateSale(SalePayment.findById(item._id));
  await writeAuditLog(req, { action: 'sales.complete', module: 'sales', resource: 'SalePayment', resourceId: item.id, after: populated });
  res.json(populated);
});

router.get('/sales/:id', async (req, res) => {
  const item = await populateSale(SalePayment.findById(req.params.id));
  if (!item) return res.status(404).json({ message: 'Not found' });
  res.json(item);
});

router.patch('/sales/:id', async (req, res) => {
  const before = await SalePayment.findById(req.params.id);
  if (!before) return res.status(404).json({ message: 'Not found' });
  if (before.status === 'completed') return res.status(422).json({ message: 'Completed sale cannot be edited' });
  const payload = await buildSalePaymentPayload({ ...req.body, code: req.body.code || before.code, status: req.body.status || before.status });
  const item = await SalePayment.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
  const populated = await populateSale(SalePayment.findById(item?._id));
  await writeAuditLog(req, { action: 'sales.update', module: 'sales', resource: 'SalePayment', resourceId: item?.id, before, after: populated });
  res.json(populated);
});

router.delete('/sales/:id', async (req, res) => {
  const item = await SalePayment.findById(req.params.id);
  if (!item) return res.status(404).json({ message: 'Not found' });
  if (item.status === 'completed') return res.status(422).json({ message: 'Completed sale cannot be deleted' });
  await item.deleteOne();
  await writeAuditLog(req, { action: 'sales.delete', module: 'sales', resource: 'SalePayment', resourceId: item.id, before: item });
  res.status(204).send();
});

router.get('/refunds', async (req, res) => {
  const page = Math.max(Number(req.query.page ?? 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 100);
  const [items, total] = await Promise.all([
    populateRefund(ProductRefund.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)),
    ProductRefund.countDocuments(),
  ]);
  res.json({ items, total, page, limit });
});

router.post('/refunds', async (req, res) => {
  const payload = await buildProductRefundPayload({
    ...req.body,
    code: req.body.code || nextCode('THB'),
    status: req.body.status || 'draft',
  });
  const item = await ProductRefund.create(payload);
  const populated = await populateRefund(ProductRefund.findById(item._id));
  await writeAuditLog(req, { action: 'sales_refund.create', module: 'sales', resource: 'ProductRefund', resourceId: item.id, after: populated });
  res.status(201).json(populated);
});

router.post('/refunds/:id/complete', async (req, res) => {
  const item = await completeProductRefund(req.params.id);
  const populated = await populateRefund(ProductRefund.findById(item._id));
  await writeAuditLog(req, { action: 'sales_refund.complete', module: 'sales', resource: 'ProductRefund', resourceId: item.id, after: populated });
  res.json(populated);
});

router.get('/refunds/:id', async (req, res) => {
  const item = await populateRefund(ProductRefund.findById(req.params.id));
  if (!item) return res.status(404).json({ message: 'Not found' });
  res.json(item);
});

router.delete('/refunds/:id', async (req, res) => {
  const item = await ProductRefund.findById(req.params.id);
  if (!item) return res.status(404).json({ message: 'Not found' });
  if (item.status === 'completed') return res.status(422).json({ message: 'Completed refund cannot be deleted' });
  await item.deleteOne();
  await writeAuditLog(req, { action: 'sales_refund.delete', module: 'sales', resource: 'ProductRefund', resourceId: item.id, before: item });
  res.status(204).send();
});

router.post('/stock-adjustments/:id/complete', async (req, res) => {
  const item = await completeStockAdjustment(req.params.id);
  await writeAuditLog(req, { action: 'stock_adjustment.complete', module: 'inventory', resource: 'StockAdjustment', resourceId: item.id, after: item });
  res.json(item);
});

router.get('/storage-duration', async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
    const q = req.query.q ? String(req.query.q).trim() : '';
    const categoryId = req.query.categoryId ? String(req.query.categoryId) : '';
    const trademarkId = req.query.trademarkId ? String(req.query.trademarkId) : '';
    const tab = req.query.tab ? String(req.query.tab) : 'all'; // all, unsold_long, slow_selling

    const minStartDays = req.query.minStartDays ? Number(req.query.minStartDays) : 0;
    const minSoldDays = req.query.minSoldDays ? Number(req.query.minSoldDays) : 0;
    const minStock = req.query.minStock ? Number(req.query.minStock) : 1; // default to > 0

    const productQuery: any = {
      qty: { $gte: minStock }
    };

    if (q) {
      productQuery.$or = [
        { name: new RegExp(q, 'i') },
        { code: new RegExp(q, 'i') }
      ];
    }
    if (categoryId) {
      productQuery.categoryId = categoryId;
    }
    if (trademarkId) {
      productQuery.trademarkId = trademarkId;
    }

    const products = await Product.find(productQuery).lean();
    const resultItems: any[] = [];
    const nowMs = Date.now();

    let totalProducts = 0;
    let unsoldLong = 0;
    let slowSelling = 0;
    let totalValue = 0;

    for (const product of products) {
      // Find oldest batch
      const oldestBatch = await Batch.findOne({ productId: product._id }).sort({ manufactureDate: 1, createdAt: 1 }).lean();
      // Find newest batch
      const newestBatch = await Batch.findOne({ productId: product._id }).sort({ createdAt: -1 }).lean();
      // Find last sold
      const lastSale = await SalePayment.findOne({ status: 'completed', 'items.productId': product._id }).sort({ completedAt: -1, createdAt: -1 }).lean();

      const firstTransactionDate = oldestBatch
        ? (oldestBatch.manufactureDate || oldestBatch.createdAt || product.createdAt)
        : product.createdAt;

      const lastTransactionDate = newestBatch
        ? (newestBatch.createdAt || newestBatch.manufactureDate || product.updatedAt)
        : product.updatedAt;

      const lastSoldDate = lastSale
        ? (lastSale.completedAt || lastSale.createdAt)
        : null;

      const firstTxMs = new Date(firstTransactionDate).getTime();
      const lastTxMs = new Date(lastTransactionDate).getTime();

      const daysFromStart = Math.max(0, Math.floor((nowMs - firstTxMs) / (1000 * 60 * 60 * 24)));
      const daysFromLast = Math.max(0, Math.floor((nowMs - lastTxMs) / (1000 * 60 * 60 * 24)));
      const daysFromLastSold = lastSoldDate
        ? Math.max(0, Math.floor((nowMs - new Date(lastSoldDate).getTime()) / (1000 * 60 * 60 * 24)))
        : null;

      // Update KPI statistics (for all active products before tab filter)
      totalProducts++;
      totalValue += (product.cost || 0) * (product.qty || 0);
      if (daysFromStart >= 30 && lastSoldDate === null) {
        unsoldLong++;
      }
      if (lastSoldDate !== null && daysFromLastSold !== null && daysFromLastSold >= 30) {
        slowSelling++;
      }

      // Filter by Tab
      if (tab === 'unsold_long') {
        if (daysFromStart < 30 || lastSoldDate !== null) {
          continue;
        }
      } else if (tab === 'slow_selling') {
        if (lastSoldDate === null || (daysFromLastSold !== null && daysFromLastSold < 30)) {
          continue;
        }
      }

      // Filter by custom input numbers
      if (minStartDays > 0 && daysFromStart < minStartDays) {
        continue;
      }
      if (minSoldDays > 0) {
        if (daysFromLastSold === null || daysFromLastSold < minSoldDays) {
          continue;
        }
      }

      resultItems.push({
        _id: product._id,
        code: product.code,
        name: product.name,
        supplierName: product.supplierName || '',
        categoryName: product.categoryName || '',
        cost: product.cost || 0,
        price: product.price || 0,
        qty: product.qty || 0,
        firstTransactionDate: firstTransactionDate ? new Date(firstTransactionDate).toISOString() : undefined,
        lastTransactionDate: lastTransactionDate ? new Date(lastTransactionDate).toISOString() : undefined,
        lastSoldDate: lastSoldDate ? new Date(lastSoldDate).toISOString() : undefined,
        daysFromStart,
        daysFromLast,
        daysFromLastSold
      });
    }

    const total = resultItems.length;
    const startIndex = (page - 1) * limit;
    const paginatedItems = resultItems.slice(startIndex, startIndex + limit);

    res.json({
      items: paginatedItems,
      total,
      page,
      limit,
      kpis: {
        totalProducts,
        unsoldLong,
        slowSelling,
        totalValue
      }
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi server' });
  }
});

router.get('/inventories', async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
    const q = req.query.q ? String(req.query.q).trim() : '';
    const branchId = req.query.branchId ? String(req.query.branchId).trim() : '';
    const sortField = req.query.sort ? String(req.query.sort) : 'createdAt';
    const sortOrder = req.query.order === 'asc' ? 1 : -1;

    // Find branches
    const branchHN = await Branch.findOne({ code: 'HN' }).lean();
    const branchHCM = await Branch.findOne({ code: 'HCM' }).lean();

    const filter: any = {};

    // Filter by branch
    if (branchId === 'hanoi' && branchHN) {
      const stocks = await ProductBranchStock.find({ branchId: branchHN._id, qty: { $gt: 0 } }).lean();
      filter._id = { $in: stocks.map(s => s.productId) };
    } else if (branchId === 'hcm' && branchHCM) {
      const stocks = await ProductBranchStock.find({ branchId: branchHCM._id, qty: { $gt: 0 } }).lean();
      filter._id = { $in: stocks.map(s => s.productId) };
    }

    // Search query
    if (q) {
      filter.$or = [
        { name: new RegExp(q, 'i') },
        { code: new RegExp(q, 'i') }
      ];
    }

    // Find products matching the filter
    const products = await Product.find(filter).lean();

    // Fetch all stock records for the found products in one query
    const productIds = products.map(p => p._id);
    const stocksList = await ProductBranchStock.find({ productId: { $in: productIds } }).lean();

    // Group stocks by productId
    const stockMap = new Map<string, any[]>();
    for (const s of stocksList) {
      const pidStr = String(s.productId);
      if (!stockMap.has(pidStr)) {
        stockMap.set(pidStr, []);
      }
      stockMap.get(pidStr)!.push(s);
    }

    // Map to inventory items with real stocks
    const allItems = [];
    for (const p of products) {
      const pAny = p as any;
      const stocks = stockMap.get(String(pAny._id)) || [];
      const stockHanoi = stocks.find(s => String(s.branchId) === String(branchHN?._id))?.qty || 0;
      const stockHCM = stocks.find(s => String(s.branchId) === String(branchHCM?._id))?.qty || 0;

      allItems.push({
        _id: pAny._id,
        code: pAny.code,
        name: pAny.name,
        barcode: pAny.barcode || '',
        parentCode: pAny.parentCode || '',
        parentName: pAny.parentName || '',
        weight: pAny.weight || 0,
        price: pAny.price || 0,
        cost: pAny.cost || 0,
        importPrice: pAny.cost || 0,
        wholesalePrice: pAny.wholesalePrice || 0,
        totalStock: pAny.qty || 0,
        stockHanoi,
        stockHCM,
        createdAt: pAny.createdAt
      });
    }

    // Sort the list
    allItems.sort((a: any, b: any) => {
      if (sortField === 'createdAt') {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return sortOrder * (dateA - dateB);
      }

      let valA = a[sortField];
      let valB = b[sortField];

      // Handle string case-insensitive comparison
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortOrder * valA.localeCompare(valB, 'vi');
      }

      const numA = Number(valA) || 0;
      const numB = Number(valB) || 0;

      if (numA < numB) return -sortOrder;
      if (numA > numB) return sortOrder;
      return 0;
    });

    const total = allItems.length;
    const startIndex = (page - 1) * limit;
    const paginatedItems = allItems.slice(startIndex, startIndex + limit);

    res.json({
      items: paginatedItems,
      total,
      page,
      limit
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi server' });
  }
});

router.get('/edit-logs', async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
    const q = req.query.q ? String(req.query.q).trim() : '';
    const logType = req.query.logType ? String(req.query.logType).trim() : '';
    const logAction = req.query.logAction ? String(req.query.logAction).trim() : '';
    const createdBy = req.query.createdBy ? String(req.query.createdBy).trim() : '';
    const fromDate = req.query.fromDate ? String(req.query.fromDate).trim() : '';
    const toDate = req.query.toDate ? String(req.query.toDate).trim() : '';

    const filter: any = {};

    if (q) {
      filter.$or = [
        { productCode: new RegExp(q, 'i') },
        { productName: new RegExp(q, 'i') },
        { createdBy: new RegExp(q, 'i') }
      ];
    }

    if (logType) {
      filter.logType = logType;
    }

    if (logAction) {
      filter.logAction = logAction;
    }

    if (createdBy) {
      filter.createdBy = createdBy;
    }

    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) {
        filter.createdAt.$gte = new Date(fromDate);
      }
      if (toDate) {
        const endOfDay = new Date(toDate);
        endOfDay.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = endOfDay;
      }
    }

    const [items, total] = await Promise.all([
      ProductEditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      ProductEditLog.countDocuments(filter),
    ]);

    res.json({ items, total, page, limit });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi server' });
  }
});

export default router;

