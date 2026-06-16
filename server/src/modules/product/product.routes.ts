import { Router } from 'express';
import { crudRoutes } from '../../core/utils/routeFactory.js';
import { writeAuditLog } from '../../core/audit/audit.service.js';
import { Batch, Category, DeliveryPartner, PaymentMethod, Product, ProductBranchStock, ProductLog, ProductRefund, SaleChannel, SalePayment, Shelf, StockAdjustment, Trademark, ProductEditLog } from './product.models.js';
import { buildProductRefundPayload, buildSalePaymentPayload, completeProductRefund, completeSalePayment, completeStockAdjustment, moveProductQty } from './product.service.js';
import { Branch } from '../../core/org/branch.model.js';
import { Customer } from '../customer/customer.models.js';
import { Order } from '../orders/orders.models.js';
import multer from 'multer';
import * as xlsx from 'xlsx';
import { InventoryProduct, InventoryVoucher } from '../warehouse/warehouse.models.js';

const upload = multer({ storage: multer.memoryStorage() });
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

// Import Excel Endpoint
router.post('/products/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Không tìm thấy file tải lên' });
    }

    const { warehouse, importMode } = req.body; // importMode: 'Thêm mới' | 'Cập nhật thông tin'
    if (!warehouse) {
      return res.status(400).json({ message: 'Vui lòng chọn Kho hàng' });
    }

    // 1. Resolve branch
    const branchMap: Record<string, string> = {
      'Chi nhánh trung tâm': 'CN001',
      'Kho Hà Nội': 'HN',
      'Kho HCM': 'HCM',
      'Kho Hồ Chí Minh': 'HCM',
      'Kho chính': 'HN'
    };
    const branchCode = branchMap[warehouse] || 'CN001';
    let branch = await Branch.findOne({ code: branchCode });
    if (!branch) {
      branch = await Branch.findOne({ isDefault: true }) || await Branch.findOne();
    }
    const branchId = branch?._id;

    // 2. Parse Excel
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json<any>(workbook.Sheets[sheetName]);

    let created = 0, updated = 0, skipped = 0, stockAdded = 0;
    const errors: string[] = [];

    const voucherId = 'PNK-' + Math.floor(Math.random() * 900000 + 100000);
    const date = new Date().toISOString().slice(0, 10);
    let totalQty = 0;
    let totalAmount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const code = row['Mã sản phẩm']?.toString().trim();
      const name = row['Tên sản phẩm']?.toString().trim();
      
      if (!code || !name) {
        errors.push(`Dòng ${i + 2}: Thiếu mã hoặc tên sản phẩm`);
        continue;
      }

      // Map fields
      const costStr = row['Giá nhập'] || row['Giá vốn'] || row['Giá vốn (Đ)'] || 0;
      const priceStr = row['Giá bán'] || row['Giá bán (Đ)'] || 0;
      const wholesalePriceStr = row['Giá sỉ'] || row['Giá sỉ (Đ)'] || 0;
      const qtyStr = row['Tồn trong kho'] || row['Tồn'] || row['Tổng tồn'] || 0;

      const cost = Number(costStr.toString().replace(/,/g, '')) || 0;
      const price = Number(priceStr.toString().replace(/,/g, '')) || 0;
      const wholesalePrice = Number(wholesalePriceStr.toString().replace(/,/g, '')) || 0;
      const qty = Number(qtyStr.toString().replace(/,/g, '')) || 0;

      const metadata = {
        name,
        barcode: row['Mã vạch']?.toString(),
        unit: row['Đơn vị tính']?.toString() || row['Đơn vị']?.toString(),
        cost,
        price,
        wholesalePrice,
        categoryName: row['Danh mục']?.toString(),
        trademarkName: row['Thương hiệu']?.toString(),
        supplierName: row['Nhà cung cấp']?.toString(),
        color: row['Màu sắc']?.toString(),
        size: row['Kích thước']?.toString() || row['Kích cỡ']?.toString(),
        status: row['Trạng thái']?.toString() || 'Mới',
        type: 'product'
      };

      let product = await Product.findOne({ code });

      if (!product) {
        // Mới
        product = await Product.create({ ...metadata, code, qty: 0 });
        created++;
      } else {
        if (importMode === 'Thêm mới') {
          // Bỏ qua dòng trùng mã nếu chọn "Thêm mới"
          skipped++;
          continue;
        } else {
          // Cập nhật thông tin
          await Product.updateOne({ _id: product._id }, { $set: metadata });
          updated++;
        }
      }

      // Nhập kho
      if (qty > 0) {
        const lineAmount = qty * cost;
        totalQty += qty;
        totalAmount += lineAmount;
        stockAdded += qty;

        const invProduct = await InventoryProduct.create({
          id: 'TX-' + Math.floor(Math.random() * 900000 + 100000),
          voucherId,
          date,
          warehouse,
          productCode: product.code,
          productName: product.name,
          type: 'import',
          importQty: qty,
          exportQty: 0,
          price: cost,
          totalAmount: lineAmount,
          creator: (req as any).user?.name || 'Admin',
          unit: product.unit,
          cost: cost,
          note: 'Nhập từ file Excel'
        });

        await moveProductQty({
          productId: product._id,
          branchId,
          sourceType: 'InventoryProduct',
          sourceId: invProduct._id,
          amount: qty,
          valueAfter: cost
        });
      }
    }

    if (totalQty > 0) {
      await InventoryVoucher.create({
        voucherId,
        date,
        warehouse,
        type: 'import',
        supplier: '',
        spCount: created + updated,
        qty: totalQty,
        totalAmount,
        discount: 0,
        creator: (req as any).user?.name || 'Admin',
        note: 'Nhập kho hàng loạt từ file Excel'
      });
    }

    res.json({
      success: true,
      summary: { created, updated, skipped, stockAdded, errors, voucherId: totalQty > 0 ? voucherId : null }
    });

  } catch (err: any) {
    console.error('Import error:', err);
    res.status(500).json({ message: err.message || 'Lỗi server khi nhập file' });
  }
});

router.post('/products', async (req, res) => {
  const payload = { ...req.body, qty: 0 };
  delete (payload as any).availableStock;

  const item = await Product.create(payload);
  await writeAuditLog(req, {
    action: 'product.create_master',
    module: 'Product',
    resource: 'Product',
    resourceId: item.id,
    after: item,
  });
  res.status(201).json(item);
});
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
  
  const filter: any = {};
  if (req.query.code) {
    filter.code = new RegExp(String(req.query.code).trim(), 'i');
  }
  if (req.query.customerPhone) {
    const customers = await Customer.find({
      phone: new RegExp(String(req.query.customerPhone).trim(), 'i')
    }).select('_id');
    filter.customerId = { $in: customers.map(c => c._id) };
  }
  if (req.query.fromDate || req.query.toDate) {
    filter.createdAt = {};
    if (req.query.fromDate) filter.createdAt.$gte = new Date(String(req.query.fromDate));
    if (req.query.toDate) {
      const end = new Date(String(req.query.toDate));
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  const [items, total] = await Promise.all([
    populateSale(SalePayment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)),
    SalePayment.countDocuments(filter),
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

router.post('/sales/:id/cancel', async (req, res) => {
  const payment = await SalePayment.findById(req.params.id);
  if (!payment) return res.status(404).json({ message: 'Not found' });
  if (payment.status === 'cancelled') return res.status(422).json({ message: 'Already cancelled' });

  if (payment.status === 'completed') {
    for (const item of payment.items) {
      await moveProductQty({
        productId: item.productId,
        branchId: payment.branchId,
        sourceType: 'SalePaymentCancel',
        sourceId: payment._id,
        amount: Number(item.amount ?? 0),
        valueAfter: Number(item.value ?? 0),
      });
    }
    if (payment.customerId) {
      const customer = await Customer.findById(payment.customerId);
      if (customer) {
        customer.totalSpent = Math.max((customer.totalSpent || 0) - (payment.value || 0), 0);
        customer.purchaseCount = Math.max((customer.purchaseCount || 0) - 1, 0);
        await customer.save();
      }
    }
  }

  payment.status = 'cancelled';
  await payment.save();
  await writeAuditLog(req, { action: 'sales.cancel', module: 'sales', resource: 'SalePayment', resourceId: payment.id, before: payment });
  res.json(payment);
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
    const branchId = req.query.branchId ? String(req.query.branchId).trim() : '';

    const minStartDays = req.query.minStartDays ? Number(req.query.minStartDays) : 0;
    const minSoldDays = req.query.minSoldDays ? Number(req.query.minSoldDays) : 0;
    const minStock = req.query.minStock ? Number(req.query.minStock) : 1; // default to > 0

    let targetBranchId: any = null;
    let branchName = '';
    
    if (branchId) {
      if (branchId === 'hanoi' || branchId === 'hcm') {
        const branchCode = branchId === 'hanoi' ? 'HN' : 'HCM';
        const branch = await Branch.findOne({ code: branchCode }).lean();
        if (branch) {
          targetBranchId = branch._id;
          branchName = branch.name;
        }
      } else if (/^[0-9a-fA-F]{24}$/.test(branchId)) {
        const branch = await Branch.findById(branchId).lean();
        if (branch) {
          targetBranchId = branch._id;
          branchName = branch.name;
        }
      }
    }

    const productQuery: any = {};
    const branchStockMap = new Map<string, number>();

    if (targetBranchId) {
      const stocks = await ProductBranchStock.find({ branchId: targetBranchId, qty: { $gte: minStock } }).lean();
      productQuery._id = { $in: stocks.map(s => s.productId) };
      for (const s of stocks) {
        branchStockMap.set(String(s.productId), s.qty);
      }
    } else {
      productQuery.qty = { $gte: minStock };
    }

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
    const productIds = products.map(p => p._id);
    const productCodes = products.map(p => p.code).filter(Boolean);

    // Fetch all related transactions in parallel for O(1) in-memory resolution
    const [batches, salePayments, orders, stockAdjustments] = await Promise.all([
      Batch.find({ productId: { $in: productIds } }).lean(),
      SalePayment.find(
        targetBranchId 
          ? { status: 'completed', 'items.productId': { $in: productIds }, branchId: targetBranchId }
          : { status: 'completed', 'items.productId': { $in: productIds } }
      ).lean(),
      Order.find(
        targetBranchId && branchName
          ? { 'products.productId': { $in: productIds }, status: { $ne: 'Đã hủy' }, warehouse: branchName }
          : { 'products.productId': { $in: productIds }, status: { $ne: 'Đã hủy' } }
      ).lean(),
      StockAdjustment.find(
        targetBranchId
          ? { status: 'completed', 'items.productId': { $in: productIds }, branchId: targetBranchId }
          : { status: 'completed', 'items.productId': { $in: productIds } }
      ).lean()
    ]);

    // Build Maps for O(1) lookup inside loop
    const batchesMap = new Map<string, any[]>();
    for (const b of batches) {
      const pidStr = String(b.productId);
      if (!batchesMap.has(pidStr)) batchesMap.set(pidStr, []);
      batchesMap.get(pidStr)!.push(b);
    }

    const salePaymentsMap = new Map<string, any>();
    for (const s of salePayments) {
      for (const item of s.items || []) {
        const pidStr = String(item.productId);
        const existing = salePaymentsMap.get(pidStr);
        const currentLoc = s.completedAt || s.createdAt;
        if (!existing || new Date(currentLoc) > new Date(existing.completedAt || existing.createdAt)) {
          salePaymentsMap.set(pidStr, s);
        }
      }
    }


    const ordersMap = new Map<string, any>();
    for (const o of orders) {
      for (const item of o.products || []) {
        const pidStr = String(item.productId);
        const existing = ordersMap.get(pidStr);
        if (!existing || new Date(o.createdAt) > new Date(existing.createdAt)) {
          ordersMap.set(pidStr, o);
        }
      }
    }

    const stockAdjustmentsMap = new Map<string, any>();
    for (const sa of stockAdjustments) {
      for (const item of sa.items || []) {
        const pidStr = String(item.productId);
        const existing = stockAdjustmentsMap.get(pidStr);
        const currentLoc = sa.balanceDate || sa.createdAt;
        if (!existing || new Date(currentLoc) > new Date(existing.balanceDate || existing.createdAt)) {
          stockAdjustmentsMap.set(pidStr, sa);
        }
      }
    }

    const resultItems: any[] = [];
    const nowMs = Date.now();

    let totalProducts = 0;
    let unsoldLong = 0;
    let slowSelling = 0;
    let totalValue = 0;

    for (const product of products) {
      const productQty = targetBranchId ? (branchStockMap.get(String(product._id)) || 0) : (product.qty || 0);

      // Find oldest and newest batch in memory
      const productBatches = batchesMap.get(String(product._id)) || [];
      let oldestBatch = null;
      let newestBatch = null;
      
      if (productBatches.length > 0) {
        const sortedOldest = [...productBatches].sort((a, b) => {
          const dateA = new Date(a.manufactureDate || a.createdAt).getTime();
          const dateB = new Date(b.manufactureDate || b.createdAt).getTime();
          return dateA - dateB;
        });
        oldestBatch = sortedOldest[0];

        const sortedNewest = [...productBatches].sort((a, b) => {
          const dateA = new Date(a.createdAt || a.manufactureDate).getTime();
          const dateB = new Date(b.createdAt || b.manufactureDate).getTime();
          return dateB - dateA;
        });
        newestBatch = sortedNewest[0];
      }

      // Find last sold from the maps
      const lastSale = salePaymentsMap.get(String(product._id));

      const lastOrder = ordersMap.get(String(product._id));

      const firstTransactionDate = oldestBatch
        ? (oldestBatch.manufactureDate || oldestBatch.createdAt || product.createdAt)
        : product.createdAt;

      // Newest transaction includes batch and stock adjustments
      let lastTransactionDate = product.updatedAt || product.createdAt;
      if (newestBatch) {
        const batchDate = newestBatch.createdAt || newestBatch.manufactureDate;
        if (batchDate && new Date(batchDate) > new Date(lastTransactionDate)) {
          lastTransactionDate = batchDate;
        }
      }
      const lastAdjustment = stockAdjustmentsMap.get(String(product._id));
      if (lastAdjustment) {
        const adjDate = lastAdjustment.balanceDate || lastAdjustment.createdAt;
        if (adjDate && new Date(adjDate) > new Date(lastTransactionDate)) {
          lastTransactionDate = adjDate;
        }
      }

      // Max Sold Date from all 4 sales channels
      let lastSoldDate: any = null;
      const soldDates: Date[] = [];
      if (lastSale) soldDates.push(new Date(lastSale.completedAt || lastSale.createdAt));

      if (lastOrder) soldDates.push(new Date(lastOrder.createdAt));

      if (soldDates.length > 0) {
        lastSoldDate = new Date(Math.max(...soldDates.map(d => d.getTime())));
      }

      const firstTxMs = new Date(firstTransactionDate).getTime();
      const lastTxMs = new Date(lastTransactionDate).getTime();

      const daysFromStart = Math.max(0, Math.floor((nowMs - firstTxMs) / (1000 * 60 * 60 * 24)));
      const daysFromLast = Math.max(0, Math.floor((nowMs - lastTxMs) / (1000 * 60 * 60 * 24)));
      const daysFromLastSold = lastSoldDate
        ? Math.max(0, Math.floor((nowMs - new Date(lastSoldDate).getTime()) / (1000 * 60 * 60 * 24)))
        : null;

      // Update KPI statistics (for all active products before tab filter)
      totalProducts++;
      totalValue += (product.cost || 0) * productQty;
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
        qty: productQty,
        globalQty: product.qty || 0,
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
    const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 5000);
    const q = req.query.q ? String(req.query.q).trim() : '';
    const branchId = req.query.branchId ? String(req.query.branchId).trim() : '';
    const categoryId = req.query.categoryId ? String(req.query.categoryId).trim() : '';
    const sortField = req.query.sort ? String(req.query.sort) : 'createdAt';
    const sortOrder = req.query.order === 'asc' ? 1 : -1;

    // Find branches
    const branchCN = await Branch.findOne({ code: 'CN001' }).lean();
    const branchHN = await Branch.findOne({ code: 'HN' }).lean();
    const branchHCM = await Branch.findOne({ code: 'HCM' }).lean();

    const filter: any = {};
    if (categoryId) {
      filter.categoryId = categoryId;
    }

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
      const stockCN = stocks.find(s => String(s.branchId) === String(branchCN?._id))?.qty || 0;
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
        stockCN,
        stockHanoi,
        stockHCM,
        unit: pAny.unit || '',
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



