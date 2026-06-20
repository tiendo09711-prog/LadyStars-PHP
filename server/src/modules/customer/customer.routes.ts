import { Router } from 'express';
import { crudRoutes } from '../../core/utils/routeFactory.js';
import { crudController } from '../../core/utils/crud.js';
import { Customer, CustomerGroup, CustomerCare } from './customer.models.js';
import { Order } from '../orders/orders.models.js';
import { SalePayment } from '../product/product.models.js';
import { getAssignedWarehouseIds, isAdminUser, requireOwner } from '../../core/middleware/auth.js';

const router = Router();

// Auto-generate customer code if missing
router.post('/customers', (req, res, next) => {
  if (!req.body.code) {
    req.body.code = `KH${Math.floor(100000 + Math.random() * 900000)}`;
  }
  next();
});

// Smart Filters for Customers
const customerCrud = crudController(Customer);
const customerRouter = Router();

function mergeCustomFilter(req: any, nextFilter: Record<string, any>) {
  req.customFilter = { ...(req.customFilter || {}), ...nextFilter };
}

function scopedCustomerAccess(req: any, res: any, next: any) {
  if (isAdminUser(req.user)) return next();
  const warehouseIds = getAssignedWarehouseIds(req.user);
  if (!warehouseIds.length) return res.status(403).json({ message: 'No assigned warehouse' });

  mergeCustomFilter(req, { branchId: { $in: warehouseIds } });

  if (req.method === 'POST' || req.method === 'PATCH') {
    const targetBranchId = String(req.body.branchId || req.user?.defaultWarehouseId || warehouseIds[0] || '').trim();
    if (!warehouseIds.includes(targetBranchId)) {
      return res.status(403).json({ message: 'Customer branch is outside employee scope' });
    }
    req.body.branchId = targetBranchId;
  }
  next();
}

customerRouter.use(scopedCustomerAccess);

customerRouter.get('/', (req, res, next) => {
  if (req.query.tags) {
    const tag = req.query.tags as string;
    
    if (tag === 'all') {
      delete req.query.tags;
    } else if (['high_value', 'frequent', 'inactive', 'birthday_high_value'].includes(tag)) {
      delete req.query.tags;
      mergeCustomFilter(req as any, { tags: tag });
    }
  }
  next();
}, customerCrud.list);

customerRouter.post('/', customerCrud.create);
customerRouter.get('/:id', customerCrud.detail);
customerRouter.patch('/:id', customerCrud.update);
customerRouter.delete('/:id', customerCrud.remove);

router.use('/customers', customerRouter);
router.use('/groups', requireOwner, crudRoutes(CustomerGroup));

// Customer Care Auto-fill
const careRouter = Router();
const careCrud = crudController(CustomerCare);
careRouter.post('/', async (req, res, next) => {
  if (req.body.customerCode) {
    const customer = await Customer.findOne({ code: req.body.customerCode });
    if (customer) {
      req.body.customerName = customer.name;
      req.body.customerPhone = customer.phone;
    }
  }
  next();
}, careCrud.create);
careRouter.get('/', careCrud.list);
careRouter.get('/:id', careCrud.detail);
careRouter.patch('/:id', careCrud.update);
careRouter.delete('/:id', careCrud.remove);

router.use('/care', requireOwner, careRouter);

// Sync metrics API
router.post('/sync-metrics', requireOwner, async (req, res) => {
  try {
    const customers = await Customer.find({});
    let updatedCount = 0;

    for (const customer of customers) {
      let totalSpent = 0;
      let purchaseCount = 0;
      let lastPurchaseDate = null;

      // 1. Get from Orders (completed, packed, etc)
      const orders = await Order.find({
        $or: [
          { customerPhone: customer.phone },
          { customerName: customer.name } // Fallback
        ],
        status: { $in: ['Hoàn thành', 'In và đóng gói', 'Đang chuyển', 'Đã chuyển'] }
      }).sort({ createdAt: -1 });

      for (const o of orders) {
        totalSpent += o.totalAmount || 0;
        purchaseCount += 1;
        if (!lastPurchaseDate || o.createdAt > lastPurchaseDate) {
          lastPurchaseDate = o.createdAt;
        }
      }

      // 2. Get from Retail Invoices (SalePayment)
      const sales = await SalePayment.find({
        customerId: customer._id,
        status: 'completed'
      }).sort({ createdAt: -1 });

      for (const s of sales) {
        totalSpent += s.value || 0;
        purchaseCount += 1;
        if (!lastPurchaseDate || s.createdAt > lastPurchaseDate) {
          lastPurchaseDate = s.createdAt;
        }
      }

      // Update customer
      let daysSinceLastPurchase = 0;
      if (lastPurchaseDate) {
        const diffTime = Math.abs(new Date().getTime() - new Date(lastPurchaseDate).getTime());
        daysSinceLastPurchase = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      await Customer.updateOne(
        { _id: customer._id },
        { 
          $set: {
            totalSpent,
            purchaseCount,
            lastPurchaseDate,
            daysSinceLastPurchase
          }
        }
      );
      updatedCount++;
    }

    res.json({ success: true, message: `Đã đồng bộ ${updatedCount} khách hàng thành công` });
  } catch (error: any) {
    console.error('Lỗi đồng bộ KH:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
