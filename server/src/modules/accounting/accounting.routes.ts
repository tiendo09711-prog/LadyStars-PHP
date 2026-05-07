import { Router } from 'express';
import { crudRoutes } from '../../core/utils/routeFactory.js';
import { SalePayment } from '../product/product.models.js';
import { AccountingType, ExpensePayment, PayPerson, Receipt } from './accounting.models.js';
const router = Router();
router.use('/types', crudRoutes(AccountingType));
router.use('/pay-persons', crudRoutes(PayPerson));
router.use('/receipts', crudRoutes(Receipt));
router.use('/payments', crudRoutes(ExpensePayment));
router.get('/invoices', async (_req, res) => {
  const items = await SalePayment.find({ status: { $in: ['completed', 'refunded'] } }).sort({ createdAt: -1 }).limit(100);
  res.json({ items, total: items.length, page: 1, limit: 100 });
});
router.get('/reports/sales', async (_req, res) => {
  const sales = await SalePayment.find({ status: { $in: ['completed', 'refunded'] } });
  const revenue = sales.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
  const paid = sales.reduce((sum, item) => sum + Number(item.valuePayment ?? 0), 0);
  const cost = sales.reduce((sum, item) => sum + Number(item.totalCost ?? 0), 0);
  res.json({
    items: sales,
    total: sales.length,
    summary: {
      orders: sales.length,
      revenue,
      paid,
      debt: revenue - paid,
      grossProfit: revenue - cost,
    },
  });
});
export default router;
