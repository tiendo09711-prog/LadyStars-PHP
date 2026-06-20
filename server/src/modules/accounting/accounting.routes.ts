import { Router } from 'express';
import { crudRoutes } from '../../core/utils/routeFactory.js';
import { ProductRefund, SalePayment } from '../product/product.models.js';
import { AccountingType, CashTransaction, BankTransaction, SummaryTransaction, ExpensePayment, PayPerson, Receipt, CustomerDebtSummary, CustomerDebtRecord, StaffDebtSummary, VendorDebtSummary, VendorDebtRecord, LogBookEntry, InstallmentCollection, AccountingTransactionLog, AccountingAccount, InstallmentService, InstallmentSetting } from './accounting.models.js';
const router = Router();
router.use('/types', crudRoutes(AccountingType));
router.use('/pay-persons', crudRoutes(PayPerson));
router.use('/receipts', crudRoutes(Receipt));
router.use('/payments', crudRoutes(ExpensePayment));
router.use('/cash-transactions', crudRoutes(CashTransaction));
router.use('/logbooks', crudRoutes(LogBookEntry));
router.use('/bank-transactions', crudRoutes(BankTransaction));
router.use('/summary-transactions', crudRoutes(SummaryTransaction));
router.use('/installment-collections', crudRoutes(InstallmentCollection));
router.use('/transaction-logs', crudRoutes(AccountingTransactionLog));
router.use('/accounts', crudRoutes(AccountingAccount));
router.use('/installment-services', crudRoutes(InstallmentService));
router.use('/installment-settings', crudRoutes(InstallmentSetting));

router.get('/installment-services', async (req, res) => {
  const { id, name, targetCode, phone, address } = req.query;
  const query: any = {};
  if (id) query.id = new RegExp(String(id), 'i');
  if (name) query.name = new RegExp(String(name), 'i');
  if (targetCode) query.targetCode = new RegExp(String(targetCode), 'i');
  if (phone) query.phone = new RegExp(String(phone), 'i');
  if (address) query.address = new RegExp(String(address), 'i');

  const items = await InstallmentService.find(query).sort({ createdAt: -1 });
  res.json({ items, total: items.length });
});

router.get('/accounts-list', async (req, res) => {
  const { code, name, status, accountId, search } = req.query;
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 15), 1), 200);
  const query: any = {};
  if (code) query.code = new RegExp(String(code), 'i');
  if (name) query.name = new RegExp(String(name), 'i');
  if (status) query.status = status;
  if (accountId) query.id = accountId;
  if (search) {
    query.$or = [
      { id: new RegExp(String(search), 'i') },
      { code: new RegExp(String(search), 'i') },
      { name: new RegExp(String(search), 'i') }
    ];
  }

  const [items, total] = await Promise.all([
    AccountingAccount.find(query).sort({ code: 1 }).skip((page - 1) * limit).limit(limit),
    AccountingAccount.countDocuments(query),
  ]);
  res.json({ items, total, page, limit });
});
router.get('/invoices', async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 15), 1), 200);
  const filter = { status: 'completed' };
  const [items, total] = await Promise.all([
    SalePayment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    SalePayment.countDocuments(filter),
  ]);
  res.json({ items, total, page, limit });
});
router.get('/reports/sales', async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 15), 1), 200);
  const filter = { status: 'completed' };
  const [sales, total, summaryRows, refundRows] = await Promise.all([
    SalePayment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    SalePayment.countDocuments(filter),
    SalePayment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$value' },
          paid: { $sum: '$valuePayment' },
          cost: { $sum: '$totalCost' },
        },
      },
    ]),
    ProductRefund.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: null,
          refundValue: { $sum: '$value' },
          refundPaid: { $sum: '$totalPayableAmount' },
        },
      },
    ]),
  ]);
  const summary = summaryRows[0] ?? { revenue: 0, paid: 0, cost: 0 };
  const refundSummary = refundRows[0] ?? { refundValue: 0, refundPaid: 0 };
  const netRevenue = Math.max((summary.revenue ?? 0) - (refundSummary.refundValue ?? 0), 0);
  const netPaid = Math.max((summary.paid ?? 0) - (refundSummary.refundPaid ?? 0), 0);
  res.json({
    items: sales,
    total,
    page,
    limit,
    summary: {
      orders: total,
      revenue: netRevenue,
      paid: netPaid,
      debt: netRevenue - netPaid,
      grossProfit: netRevenue - (summary.cost ?? 0),
      refunded: refundSummary.refundValue ?? 0,
    },
  });
});
router.get('/debt/customers/stats', async (req, res) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  
  const endOf7Days = new Date(now);
  endOf7Days.setDate(endOf7Days.getDate() + 7);
  endOf7Days.setHours(23, 59, 59, 999);

  const [all, overdue, today, next_7_days, over_7_days] = await Promise.all([
    CustomerDebtSummary.countDocuments(),
    CustomerDebtRecord.distinct('customerCode', { dueDate: { $lt: now } }),
    CustomerDebtRecord.distinct('customerCode', { dueDate: { $gte: now, $lte: endOfToday } }),
    CustomerDebtRecord.distinct('customerCode', { dueDate: { $gt: endOfToday, $lte: endOf7Days } }),
    CustomerDebtRecord.distinct('customerCode', { dueDate: { $gt: endOf7Days } })
  ]);

  res.json({
    all,
    due_date: overdue.length + today.length + next_7_days.length + over_7_days.length,
    overdue: overdue.length,
    today: today.length,
    next_7_days: next_7_days.length,
    over_7_days: over_7_days.length
  });
});

router.get('/debt/customers/summary', async (req, res) => {
  const { tab, page = 1, limit = 15 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  
  let query: any = {};
  
  if (tab && tab !== 'all') {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    
    const endOf7Days = new Date(now);
    endOf7Days.setDate(endOf7Days.getDate() + 7);
    endOf7Days.setHours(23, 59, 59, 999);

    let recordQuery: any = {};
    switch (tab) {
      case 'overdue': recordQuery = { dueDate: { $lt: now } }; break;
      case 'today': recordQuery = { dueDate: { $gte: now, $lte: endOfToday } }; break;
      case 'next_7_days': recordQuery = { dueDate: { $gt: endOfToday, $lte: endOf7Days } }; break;
      case 'over_7_days': recordQuery = { dueDate: { $gt: endOf7Days } }; break;
      case 'due_date': recordQuery = {}; break; // all that have due dates
    }
    
    const customerCodes = await CustomerDebtRecord.distinct('customerCode', recordQuery);
    query = { code: { $in: customerCodes } };
  }

  const items = await CustomerDebtSummary.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit));
  const total = await CustomerDebtSummary.countDocuments(query);
  
  res.json({ items, total, page: Number(page), limit: Number(limit) });
});

router.get('/debt/customers/records', async (req, res) => {
  const { tab } = req.query;
  const now = new Date();
  now.setHours(0, 0, 0, 0); // start of today
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  
  const endOf7Days = new Date(now);
  endOf7Days.setDate(endOf7Days.getDate() + 7);
  endOf7Days.setHours(23, 59, 59, 999);

  let query: any = {};
  
  switch (tab) {
    case 'overdue':
      query = { dueDate: { $lt: now } };
      break;
    case 'today':
      query = { dueDate: { $gte: now, $lte: endOfToday } };
      break;
    case 'next_7_days':
      query = { dueDate: { $gt: endOfToday, $lte: endOf7Days } };
      break;
    case 'over_7_days':
      query = { dueDate: { $gt: endOf7Days } };
      break;
    case 'due_date': // meaning all records with a due date (essentially all in this context)
    case 'all':
    default:
      query = {}; 
      break;
  }
  
  const items = await CustomerDebtRecord.find(query).sort({ dueDate: 1 });
  res.json({ items, total: items.length });
});

router.get('/debt/staff/summary', async (req, res) => {
  const { page = 1, limit = 15 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  const items = await StaffDebtSummary.find().sort({ createdAt: -1 }).skip(skip).limit(Number(limit));
  const total = await StaffDebtSummary.countDocuments();
  res.json({ items, total, page: Number(page), limit: Number(limit) });
});

router.get('/debt/vendors/stats', async (req, res) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  
  const endOf7Days = new Date(now);
  endOf7Days.setDate(endOf7Days.getDate() + 7);
  endOf7Days.setHours(23, 59, 59, 999);

  const [all, overdue, today, next_7_days, over_7_days] = await Promise.all([
    VendorDebtSummary.countDocuments(),
    VendorDebtRecord.distinct('vendorCode', { dueDate: { $lt: now } }),
    VendorDebtRecord.distinct('vendorCode', { dueDate: { $gte: now, $lte: endOfToday } }),
    VendorDebtRecord.distinct('vendorCode', { dueDate: { $gt: endOfToday, $lte: endOf7Days } }),
    VendorDebtRecord.distinct('vendorCode', { dueDate: { $gt: endOf7Days } })
  ]);

  res.json({
    all,
    due_date: overdue.length + today.length + next_7_days.length + over_7_days.length,
    overdue: overdue.length,
    today: today.length,
    next_7_days: next_7_days.length,
    over_7_days: over_7_days.length
  });
});

router.get('/debt/vendors/summary', async (req, res) => {
  const { tab, page = 1, limit = 15 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  
  let query: any = {};
  
  if (tab && tab !== 'all') {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    
    const endOf7Days = new Date(now);
    endOf7Days.setDate(endOf7Days.getDate() + 7);
    endOf7Days.setHours(23, 59, 59, 999);

    let recordQuery: any = {};
    switch (tab) {
      case 'overdue': recordQuery = { dueDate: { $lt: now } }; break;
      case 'today': recordQuery = { dueDate: { $gte: now, $lte: endOfToday } }; break;
      case 'next_7_days': recordQuery = { dueDate: { $gt: endOfToday, $lte: endOf7Days } }; break;
      case 'over_7_days': recordQuery = { dueDate: { $gt: endOf7Days } }; break;
      case 'due_date': recordQuery = {}; break; 
    }
    
    const vendorCodes = await VendorDebtRecord.distinct('vendorCode', recordQuery);
    query = { code: { $in: vendorCodes } };
  }

  const items = await VendorDebtSummary.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit));
  const total = await VendorDebtSummary.countDocuments(query);
  
  res.json({ items, total, page: Number(page), limit: Number(limit) });
});

router.post('/debt/opening', async (req, res) => {
  const { date, type, amount, note, targetType, targetCode } = req.body;
  
  if (!targetCode || !amount) {
    return res.status(400).json({ message: 'Missing targetCode or amount' });
  }

  const numAmount = Number(String(amount).replace(/[^0-9.-]+/g, ""));

  try {
    if (targetType === 'vendor') {
      let summary = await VendorDebtSummary.findOne({ code: targetCode });
      if (!summary) {
        summary = new VendorDebtSummary({ code: targetCode, vendorName: targetCode });
      }
      if (type === 'payable') {
        summary.initialPayable = (summary.initialPayable || 0) + numAmount;
        summary.finalPayable = (summary.finalPayable || 0) + numAmount;
      } else {
        summary.initialReceivable = (summary.initialReceivable || 0) + numAmount;
        summary.finalReceivable = (summary.finalReceivable || 0) + numAmount;
      }
      await summary.save();
    } else if (targetType === 'customer') {
      let summary = await CustomerDebtSummary.findOne({ code: targetCode });
      if (!summary) {
        summary = new CustomerDebtSummary({ code: targetCode, customerName: targetCode });
      }
      if (type === 'payable') {
        summary.initialPayable = (summary.initialPayable || 0) + numAmount;
        summary.finalPayable = (summary.finalPayable || 0) + numAmount;
      } else {
        summary.initialReceivable = (summary.initialReceivable || 0) + numAmount;
        summary.finalReceivable = (summary.finalReceivable || 0) + numAmount;
      }
      await summary.save();
    } else if (targetType === 'staff') {
      let summary = await StaffDebtSummary.findOne({ staffName: targetCode });
      if (!summary) {
        summary = new StaffDebtSummary({ staffName: targetCode });
      }
      summary.remainingDebt = (summary.remainingDebt || 0) + numAmount;
      await summary.save();
    }
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/debt/opening/bulk', async (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ message: 'Invalid items array' });
  }

  let successCount = 0;

  for (const item of items) {
    const { type, amount, targetType, targetCode } = item;
    if (!targetCode || !amount) continue;

    const numAmount = Number(amount);

    if (targetType === 'vendor') {
      const summary = await VendorDebtSummary.findOne({ code: targetCode });
      if (summary) {
        if (type === 'payable') {
          summary.initialPayable = (summary.initialPayable || 0) + numAmount;
          summary.finalPayable = (summary.finalPayable || 0) + numAmount;
        } else {
          summary.initialReceivable = (summary.initialReceivable || 0) + numAmount;
          summary.finalReceivable = (summary.finalReceivable || 0) + numAmount;
        }
        await summary.save();
        successCount++;
      }
    } else if (targetType === 'customer') {
      const summary = await CustomerDebtSummary.findOne({ code: targetCode });
      if (summary) {
        if (type === 'payable') {
          summary.initialPayable = (summary.initialPayable || 0) + numAmount;
          summary.finalPayable = (summary.finalPayable || 0) + numAmount;
        } else {
          summary.initialReceivable = (summary.initialReceivable || 0) + numAmount;
          summary.finalReceivable = (summary.finalReceivable || 0) + numAmount;
        }
        await summary.save();
        successCount++;
      }
    }
  }

  res.json({ success: true, processed: successCount, total: items.length });
});

router.post('/cash-transactions/bulk', async (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ message: 'Invalid items array' });
  }

  try {
    const validItems = items.filter((item: any) => item.transactionId);
    
    for (const item of validItems) {
      await CashTransaction.findOneAndUpdate(
        { transactionId: item.transactionId },
        { $set: item },
        { upsert: true }
      );
    }
    res.json({ success: true, processed: validItems.length });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/logbooks/bulk', async (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ message: 'Invalid items array' });
  }

  try {
    // Clear all to ensure clean import, or just insert
    await LogBookEntry.deleteMany({});
    
    // items should match schema precisely
    await LogBookEntry.insertMany(items);
    
    res.json({ success: true, processed: items.length });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/installment-collections/bulk', async (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ message: 'Invalid items array' });
  }

  try {
    const validItems = items.filter((item: any) => item.transactionId);
    
    for (const item of validItems) {
      await InstallmentCollection.findOneAndUpdate(
        { transactionId: item.transactionId },
        { $set: item },
        { upsert: true }
      );
    }
    res.json({ success: true, processed: validItems.length });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/transaction-logs/bulk', async (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ message: 'Invalid items array' });
  }

  try {
    const validItems = items.filter((item: any) => item.logId);
    
    for (const item of validItems) {
      await AccountingTransactionLog.findOneAndUpdate(
        { logId: item.logId },
        { $set: item },
        { upsert: true }
      );
    }
    res.json({ success: true, processed: validItems.length });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
