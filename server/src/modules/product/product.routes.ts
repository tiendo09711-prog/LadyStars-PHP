import { Router } from 'express';
import { crudRoutes } from '../../core/utils/routeFactory.js';
import { writeAuditLog } from '../../core/audit/audit.service.js';
import { Category, DeliveryPartner, PaymentMethod, Product, ProductBranchStock, ProductLog, ProductRefund, SaleChannel, SalePayment, Shelf, StockAdjustment, Trademark } from './product.models.js';
import { buildProductRefundPayload, buildSalePaymentPayload, completeProductRefund, completeSalePayment, completeStockAdjustment } from './product.service.js';

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
export default router;
