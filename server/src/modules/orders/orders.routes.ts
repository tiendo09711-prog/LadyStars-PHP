import { Router } from 'express';
import { crudRoutes } from '../../core/utils/routeFactory.js';
import { crudController } from '../../core/utils/crud.js';
import {
  Order,
  OrderDuplicate,
  OrderHandover,
  OrderDispute,
  OrderCodControl,
  OrderSource,
  OrderHistory,
} from './orders.models.js';
import { Product } from '../product/product.models.js';
import { Branch } from '../../core/org/branch.model.js';
import { getAssignedWarehouseIds, isAdminUser, requireOwner } from '../../core/middleware/auth.js';
import multer from 'multer';
import xlsx from 'xlsx';
import fs from 'fs';

const upload = multer({ dest: 'uploads/' });

const router = Router();

async function resolveOrderWarehouseScope(req: any) {
  if (isAdminUser(req.user)) return null;
  const warehouseIds = getAssignedWarehouseIds(req.user);
  if (!warehouseIds.length) return [];
  const branches = await Branch.find({ _id: { $in: warehouseIds } }).select('name code').lean();
  return [...new Set(branches.flatMap((branch: any) => [String(branch.name || '').trim(), String(branch.code || '').trim()]).filter(Boolean))];
}

async function enforceOrderReadScope(req: any, res: any, next: any) {
  if (isAdminUser(req.user)) return next();
  if (req.method !== 'GET') return res.status(403).json({ message: 'ADMIN permission required' });
  const warehouses = await resolveOrderWarehouseScope(req);
  if (!warehouses?.length) return res.status(403).json({ message: 'No assigned warehouse' });
  req.customFilter = { ...(req.customFilter || {}), warehouse: { $in: warehouses } };
  next();
}

async function findScopedOrder(req: any, selector: Record<string, any>) {
  const warehouses = await resolveOrderWarehouseScope(req);
  if (warehouses === null) return Order.findOne(selector);
  if (!warehouses.length) return null;
  return Order.findOne({ ...selector, warehouse: { $in: warehouses } });
}

router.get('/packaging/scan', async (req, res) => {
  try {
    const query = String(req.query.query || '').trim();
    if (!query) {
      return res.status(400).json({ message: 'Yêu cầu mã đơn hàng' });
    }
    // Find order by code (exact or case insensitive)
    const order = await findScopedOrder(req as any, {
      $or: [
        { orderCode: query },
        { orderCode: new RegExp(`^${query}$`, 'i') }
      ]
    });
    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng với mã này' });
    }
    res.json(order);
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi server' });
  }
});

router.post('/packaging/:id/pack', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { products, packageWeight, packagingMaterial, packer, forcePack } = req.body;

    const order = await findScopedOrder(req as any, { _id: orderId });
    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }

    // Update order products scanned quantities
    if (Array.isArray(products)) {
      for (const p of products) {
        const orderProd = (order as any).products.find((op: any) => String(op.productId) === String(p.productId) || op.sku === p.sku);
        if (orderProd) {
          orderProd.scannedQuantity = Number(p.scannedQuantity || 0);
        }
      }
    }

    // Check if all items are fully scanned or forcePack is true
    const isFullyScanned = (order as any).products.every((op: any) => op.scannedQuantity >= op.quantity);
    const markAsPacked = isFullyScanned || forcePack;
    
    if (markAsPacked) {
      order.status = 'Đã đóng gói';
      order.packedAt = new Date().toLocaleString('vi-VN');
    } else {
      order.status = 'Đang đóng gói';
    }

    order.packer = packer || 'Hệ thống';
    order.packageWeight = Number(packageWeight || 0);
    order.packagingMaterial = packagingMaterial || 'Hộp carton';

    await order.save();

    res.json({ success: true, order, isFullyScanned: markAsPacked });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi server' });
  }
});

router.post('/manage/import', requireOwner, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn file' });
    }

    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    const rows = data.slice(6) as any[];
    let successCount = 0;
    const userId = (req as any).user?.sub;

    let currentOrder: any = null;
    const ordersToSave: any[] = [];

    for (const row of rows) {
      if (!Array.isArray(row) || row.length === 0) continue;

      const customerName = row[0];
      const customerPhone = row[1];
      const sku = row[6];
      const quantity = Number(row[7]) || 1;
      const price = Number(row[8]) || 0;

      if (!customerName && !customerPhone) {
        if (currentOrder && sku) {
          currentOrder.products.push({
            productId: null,
            sku: sku,
            productName: sku,
            quantity: quantity,
            scannedQuantity: 0,
            _price: price
          });
        }
        continue;
      }

      const addressPart1 = row[2] || '';
      const addressPart2 = row[3] || '';
      const addressPart3 = row[4] || '';
      const shippingAddress = [addressPart1, addressPart2, addressPart3].filter(Boolean).join(' - ');

      const transferMoney = Number(row[9]) || 0;
      const discount = Number(row[10]) || 0;
      const codAmount = Number(row[11]) || 0;
      const paymentMethod = transferMoney > 0 ? 'Chuyển khoản' : 'COD';
      const note = [row[12], row[13]].filter(Boolean).join(' | ');

      currentOrder = new Order({
        orderCode: `ORD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`,
        customerName: customerName || 'Khách lẻ',
        customerPhone: customerPhone || '',
        shippingAddress,
        paymentMethod,
        status: 'Cần xử lí',
        deliveryStatus: 'Chờ lấy hàng',
        note,
        codAmount,
        userId,
        products: []
      });

      if (sku) {
        currentOrder.products.push({
          productId: null,
          sku: sku,
          productName: sku,
          quantity: quantity,
          scannedQuantity: 0,
          _price: price
        });
      }

      ordersToSave.push(currentOrder);
    }

    for (const order of ordersToSave) {
      let total = 0;
      for (const p of order.products) {
        if (p.sku) {
          const prod = await Product.findOne({ code: p.sku });
          if (prod) {
            p.productId = prod._id;
            p.productName = prod.name;
            if (!p._price) p._price = (prod as any).price || 0;
          }
        }
        total += p.quantity * (p._price || 0);
      }
      order.totalAmount = total;
      
      await order.save();
      successCount++;
    }

    fs.unlinkSync(req.file.path);
    return res.json({ success: true, message: `Đã nhập thành công ${successCount} đơn hàng!` });
  } catch (err: any) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ success: false, message: err.message || 'Lỗi server khi nhập file' });
  }
});

router.post('/manage/bulk-action', requireOwner, async (req, res) => {
  try {
    const { action, ids, status, warehouse, mainOrderCode, handoverId } = req.body;
    const userId = (req as any).user?.sub;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Vui lòng cung cấp danh sách ID đơn hàng' });
    }

    if (action === 'status') {
      if (!status) return res.status(400).json({ message: 'Thiếu trạng thái mới' });
      await Order.updateMany({ _id: { $in: ids } }, { status });
      return res.json({ success: true, message: `Đã cập nhật trạng thái mới cho ${ids.length} đơn hàng` });
    }

    if (action === 'warehouse') {
      if (!warehouse) return res.status(400).json({ message: 'Thiếu kho hàng mới' });
      await Order.updateMany({ _id: { $in: ids } }, { warehouse });
      return res.json({ success: true, message: `Đã cập nhật kho hàng cho ${ids.length} đơn hàng` });
    }

    if (action === 'delete') {
      await Order.deleteMany({ _id: { $in: ids } });
      return res.json({ success: true, message: `Đã xóa ${ids.length} đơn hàng` });
    }

    if (action === 'merge') {
      if (!mainOrderCode) {
        return res.status(400).json({ message: 'Vui lòng cung cấp mã đơn hàng chính để gộp' });
      }
      const mainOrder = await Order.findOne({ orderCode: mainOrderCode });
      if (!mainOrder) {
        return res.status(404).json({ message: `Không tìm thấy đơn hàng chính với mã ${mainOrderCode}` });
      }

      const allOrders = await Order.find({ _id: { $in: ids } });
      const secondaryOrders = allOrders.filter(o => o.orderCode !== mainOrderCode);

      if (secondaryOrders.length === 0) {
        return res.status(400).json({ message: 'Không tìm thấy các đơn phụ hợp lệ để gộp' });
      }

      let additionalAmount = 0;

      for (const order of secondaryOrders) {
        additionalAmount += order.totalAmount || 0;
        if (order.products) {
          for (const p of order.products) {
            const existing = (mainOrder.products as any).find((mp: any) => mp.sku === p.sku);
            if (existing) {
              existing.quantity += p.quantity;
              existing.scannedQuantity += p.scannedQuantity;
            } else {
              (mainOrder.products as any).push({
                productId: p.productId,
                sku: p.sku,
                productName: p.productName,
                quantity: p.quantity,
                scannedQuantity: p.scannedQuantity
              });
            }
          }
        }
        order.status = 'Đã gộp';
        order.note = order.note 
          ? `${order.note}\n[Đã gộp vào đơn ${mainOrderCode}]` 
          : `[Đã gộp vào đơn ${mainOrderCode}]`;
        await order.save();
      }

      mainOrder.totalAmount = (mainOrder.totalAmount || 0) + additionalAmount;
      const mergedCodesList = secondaryOrders.map(o => o.orderCode).join(', ');
      mainOrder.note = mainOrder.note
        ? `${mainOrder.note}\n[Đã gộp các đơn: ${mergedCodesList} vào đơn này]`
        : `[Đã gộp các đơn: ${mergedCodesList} vào đơn này]`;
      
      await mainOrder.save();

      return res.json({ success: true, message: `Gộp thành công ${secondaryOrders.length} đơn vào đơn chính ${mainOrderCode}` });
    }

    if (action === 'split') {
      const orders = await Order.find({ _id: { $in: ids } });
      let splitCount = 0;

      for (const order of orders) {
        if (!order.products || order.products.length <= 1) {
          continue;
        }

        const totalProductsCount = order.products.length;
        const productIds = order.products.map(p => p.productId);
        const productsFromDb = await Product.find({ _id: { $in: productIds } });
        
        let sumPrices = 0;
        const priceMap: Record<string, number> = {};
        for (const pDb of productsFromDb) {
          priceMap[String(pDb._id)] = pDb.price || 0;
        }
        
        for (const op of order.products) {
          const price = priceMap[String(op.productId)] || 0;
          sumPrices += price * op.quantity;
        }

        const sumQuantities = order.products.reduce((acc, p) => acc + p.quantity, 0);

        for (let i = 0; i < totalProductsCount; i++) {
          const p = order.products[i];
          const subCode = `${order.orderCode}-${i + 1}`;
          
          let subAmount = 0;
          if (sumPrices > 0) {
            const itemPrice = priceMap[String(p.productId)] || 0;
            subAmount = Math.round((order.totalAmount || 0) * (itemPrice * p.quantity) / sumPrices);
          } else {
            subAmount = Math.round((order.totalAmount || 0) * p.quantity / sumQuantities);
          }

          const subOrder = new Order({
            orderCode: subCode,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            shippingAddress: order.shippingAddress,
            paymentMethod: order.paymentMethod,
            totalAmount: subAmount,
            status: order.status,
            warehouse: order.warehouse,
            deliveryStatus: order.deliveryStatus,
            note: order.note ? `${order.note}\n[Được tách từ đơn gốc ${order.orderCode}]` : `[Được tách từ đơn gốc ${order.orderCode}]`,
            products: [{
              productId: p.productId,
              sku: p.sku,
              productName: p.productName,
              quantity: p.quantity,
              scannedQuantity: p.scannedQuantity
            }],
            userId: order.userId
          });
          await subOrder.save();
        }

        order.status = 'Đã tách';
        order.note = order.note ? `${order.note}\n[Đã tách thành ${totalProductsCount} đơn phụ]` : `[Đã tách thành ${totalProductsCount} đơn phụ]`;
        await order.save();
        splitCount++;
      }

      return res.json({ success: true, message: `Đã tách thành công ${splitCount} đơn hàng Mega Live` });
    }

    if (action === 'send-carrier') {
      const orders = await Order.find({ _id: { $in: ids } });
      for (const order of orders) {
        order.deliveryStatus = 'Chờ lấy hàng';
        order.status = 'In và đóng gói'; // Wait, let's keep status logical. Usually it's still packing or waiting
        order.carrier = 'Giao hàng nhanh';
        order.shippingFee = 30000;
        order.codAmount = order.paymentMethod === 'COD' ? order.totalAmount : 0;
        await order.save();
      }
      return res.json({ success: true, message: `Đã chuyển tiếp ${ids.length} đơn sang hãng vận chuyển` });
    }

    if (action === 'add-handover') {
      if (!handoverId) {
        return res.status(400).json({ message: 'Thiếu ID biên bản bàn giao' });
      }
      const handover = await OrderHandover.findById(handoverId);
      if (!handover) {
        return res.status(404).json({ message: 'Không tìm thấy biên bản bàn giao' });
      }

      const orders = await Order.find({ _id: { $in: ids } });
      for (const order of orders) {
        order.deliveryStatus = 'Đang giao';
        order.note = order.note 
          ? `${order.note}\n[Đã thêm vào biên bản bàn giao: ${handover.handoverCode}]` 
          : `[Đã thêm vào biên bản bàn giao: ${handover.handoverCode}]`;
        await order.save();
      }

      handover.orderCount = (handover.orderCount || 0) + orders.length;
      handover.status = 'Đã bàn giao';
      await handover.save();

      return res.json({ success: true, message: `Đã gán ${orders.length} đơn hàng vào biên bản ${handover.handoverCode}` });
    }

    if (action === 'reconcile') {
      const orders = await Order.find({ _id: { $in: ids } });
      for (const order of orders) {
        order.note = order.note ? `${order.note}\n[Đã thêm đối soát]` : `[Đã thêm đối soát]`;
        await order.save();
      }
      return res.json({ success: true, message: `Đã đánh dấu đối soát cho ${ids.length} đơn hàng` });
    }

    if (action === 'einvoice-draft') {
      const orders = await Order.find({ _id: { $in: ids } });
      for (const order of orders) {
        order.eInvoiceStatus = 'Nháp';
        order.note = order.note ? `${order.note}\n[Đã tạo hóa đơn nháp]` : `[Đã tạo hóa đơn nháp]`;
        await order.save();
      }
      return res.json({ success: true, message: `Đã tạo hóa đơn nháp cho ${ids.length} đơn` });
    }

    if (action === 'einvoice-issue') {
      const orders = await Order.find({ _id: { $in: ids } });
      for (const order of orders) {
        order.eInvoiceStatus = 'Đã phát hành';
        order.note = order.note ? `${order.note}\n[Đã phát hành hóa đơn]` : `[Đã phát hành hóa đơn]`;
        await order.save();
      }
      return res.json({ success: true, message: `Đã phát hành hóa đơn cho ${ids.length} đơn` });
    }

    return res.status(400).json({ message: `Hành động bulk-action "${action}" không hợp lệ` });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi server' });
  }
});

const manageCrud = crudController(Order);
const manageRouter = Router();
manageRouter.use(enforceOrderReadScope);
manageRouter.get('/', manageCrud.list);
manageRouter.post('/', manageCrud.create);
manageRouter.get('/:id', manageCrud.detail);
manageRouter.patch('/:id', manageCrud.update);
manageRouter.delete('/:id', manageCrud.remove);

// Sync middleware for Disputes
router.use('/disputes', requireOwner, async (req, res, next) => {
  if (req.method === 'POST' || req.method === 'PATCH') {
    if (req.body.orderCode) {
      const order = await Order.findOne({ orderCode: req.body.orderCode });
      if (order) {
        req.body.customerName = order.customerName;
        req.body.customerPhone = order.customerPhone;
      }
    }
  }
  next();
}, crudRoutes(OrderDispute));

// Sync middleware for Duplicates
router.use('/duplicates', requireOwner, async (req, res, next) => {
  if (req.method === 'POST' || req.method === 'PATCH') {
    if (req.body.orderCode) {
      const order = await Order.findOne({ orderCode: req.body.orderCode });
      if (order) {
        req.body.customerName = order.customerName;
        req.body.customerPhone = order.customerPhone;
      }
    }
  }
  next();
}, crudRoutes(OrderDuplicate));

// Custom Shipping Pending Router using Order model
const shippingRouter = Router();
const shippingCrud = crudController(Order);
shippingRouter.use(enforceOrderReadScope);
shippingRouter.get('/', (req, res, next) => {
  if (!req.query.deliveryStatus) {
    req.query.deliveryStatus = 'Chờ lấy hàng,Lỗi kết nối API';
  }
  next();
}, shippingCrud.list);
shippingRouter.post('/', shippingCrud.create);
shippingRouter.get('/:id', shippingCrud.detail);
shippingRouter.patch('/:id', shippingCrud.update);
shippingRouter.delete('/:id', shippingCrud.remove);
router.use('/shipping-pending', shippingRouter);

router.use('/manage', manageRouter);
router.use('/handover', requireOwner, crudRoutes(OrderHandover));
router.use('/cod-control', requireOwner, crudRoutes(OrderCodControl));
router.use('/sources', requireOwner, crudRoutes(OrderSource));
router.use('/history', requireOwner, crudRoutes(OrderHistory));

export default router;
