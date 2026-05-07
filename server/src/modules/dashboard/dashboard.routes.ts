import { Router } from 'express';
import { AccountingType, ExpensePayment, Receipt } from '../accounting/accounting.models.js';
import { Customer } from '../customer/customer.models.js';
import { Product, ProductBranchStock, SalePayment } from '../product/product.models.js';
import { Project, Task } from '../task/task.models.js';
import { Vendor, VendorPurchase } from '../vendor/vendor.models.js';

const router = Router();

router.get('/', async (_req, res) => {
  const [
    products,
    lowStock,
    customers,
    vendors,
    sales,
    purchases,
    receipts,
    expenses,
    projects,
    tasks,
    recentSales,
    recentProducts,
    accountingTypes,
  ] = await Promise.all([
    Product.countDocuments(),
    ProductBranchStock.countDocuments({ $expr: { $lte: ['$qty', '$minQuantity'] } }).catch(() => 0),
    Customer.countDocuments(),
    Vendor.countDocuments(),
    SalePayment.countDocuments(),
    VendorPurchase.countDocuments(),
    Receipt.aggregate([{ $group: { _id: null, total: { $sum: '$value' } } }]),
    ExpensePayment.aggregate([{ $group: { _id: null, total: { $sum: '$value' } } }]),
    Project.countDocuments(),
    Task.countDocuments(),
    SalePayment.find().sort({ createdAt: -1 }).limit(5).select('code value valuePayment status createdAt'),
    Product.find().sort({ createdAt: -1 }).limit(5).select('name code price qty unit type'),
    AccountingType.countDocuments(),
  ]);

  const revenue = receipts[0]?.total ?? 0;
  const expense = expenses[0]?.total ?? 0;

  res.json({
    totals: {
      products,
      lowStock,
      customers,
      vendors,
      sales,
      purchases,
      revenue,
      expense,
      profit: revenue - expense,
      projects,
      tasks,
      accountingTypes,
    },
    recentSales,
    recentProducts,
  });
});

export default router;
