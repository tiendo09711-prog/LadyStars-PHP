import { Router } from 'express';
import { crudRoutes } from '../../core/utils/routeFactory.js';
import { 
  InventoryVoucher, 
  InventoryProduct, 
  WarehouseTransfer,
  InventoryCheck,
  InventoryCheckProduct
} from './warehouse.models.js';
import { Branch } from '../../core/org/branch.model.js';
import { moveProductQty } from '../product/product.service.js';
import { Product, ProductBranchStock } from '../product/product.models.js';

const router = Router();

// Endpoint giao dịch nhập kho đồng bộ
router.post('/vouchers/import', async (req, res) => {
  const { date, warehouse, type, supplier, note, items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Danh sách sản phẩm nhập không được để trống' });
  }

  try {
    // 1. Ánh xạ warehouse sang branchId
    const branchMap: Record<string, string> = {
      'Chi nhánh trung tâm': 'CN001',
      'Kho Hà Nội': 'HN',
      'Kho HCM': 'HCM',
      'Kho Hồ Chí Minh': 'HCM',
      'Kho chính': 'HN'
    };
    const code = branchMap[warehouse] || 'CN001';
    let branch = await Branch.findOne({ code });
    if (!branch) {
      branch = await Branch.findOne({ isDefault: true }) || await Branch.findOne();
    }
    const branchId = branch?._id;

    // 2. Sinh mã phiếu tự động
    const voucherId = 'PNK-' + Math.floor(Math.random() * 900000 + 100000);

    // 3. Tính toán các tổng số
    const spCount = items.length;
    let totalQty = 0;
    let totalAmount = 0;

    const savedItems = [];
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({ message: `Không tìm thấy sản phẩm với ID ${item.productId}` });
      }

      const qty = Number(item.quantity || 0);
      const price = Number(item.price || 0);
      
      // Tính tổng tiền mặt hàng có tính chiết khấu và VAT
      let lineAmount = qty * price;
      if (item.discountType === '%') {
        lineAmount -= lineAmount * (Number(item.discountValue || 0) / 100);
      } else {
        lineAmount -= Number(item.discountValue || 0);
      }
      if (item.vatType === '%') {
        lineAmount += lineAmount * (Number(item.vatValue || 0) / 100);
      } else {
        lineAmount += Number(item.vatValue || 0);
      }
      lineAmount = Math.max(0, lineAmount);

      totalQty += qty;
      totalAmount += lineAmount;

      // Lưu InventoryProduct
      const invProduct = await InventoryProduct.create({
        id: 'TX-' + Math.floor(Math.random() * 900000 + 100000),
        voucherId,
        date: date || new Date().toISOString().slice(0, 10),
        warehouse,
        productCode: product.code,
        productName: product.name,
        type: 'import',
        importQty: qty,
        exportQty: 0,
        price,
        totalAmount: lineAmount,
        creator: (req as any).user?.name || 'Admin',
        unit: item.unit || product.unit,
        cost: price,
        note: item.note || ''
      });

      // Cập nhật kho thực
      await moveProductQty({
        productId: product._id,
        branchId,
        sourceType: 'InventoryProduct',
        sourceId: invProduct._id,
        amount: qty,
        valueAfter: price
      });

      savedItems.push(invProduct);
    }

    // Tạo InventoryVoucher
    const voucher = await InventoryVoucher.create({
      voucherId,
      date: date || new Date().toISOString().slice(0, 10),
      warehouse,
      type: type || 'import',
      supplier: supplier || '',
      spCount,
      qty: totalQty,
      totalAmount,
      discount: items.reduce((sum, l) => sum + (l.discountType === 'đ' ? Number(l.discountValue || 0) : 0), 0),
      creator: (req as any).user?.name || 'Admin',
      note: note || `Nhập kho tự động - Loại: ${type || 'Nhập mua'}`
    });

    res.status(201).json({ voucher, items: savedItems });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi server khi nhập kho' });
  }
});

// Endpoint giao dịch xuất kho đồng bộ
router.post('/vouchers/export', async (req, res) => {
  const { date, warehouse, type, supplier, note, items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Danh sách sản phẩm xuất không được để trống' });
  }

  try {
    // 1. Ánh xạ warehouse sang branchId
    const branchMap: Record<string, string> = {
      'Chi nhánh trung tâm': 'CN001',
      'Kho Hà Nội': 'HN',
      'Kho HCM': 'HCM',
      'Kho Hồ Chí Minh': 'HCM',
      'Kho chính': 'HN'
    };
    const code = branchMap[warehouse] || 'CN001';
    let branch = await Branch.findOne({ code });
    if (!branch) {
      branch = await Branch.findOne({ isDefault: true }) || await Branch.findOne();
    }
    const branchId = branch?._id;

    // 2. Sinh mã phiếu tự động
    const voucherId = 'PXK-' + Math.floor(Math.random() * 900000 + 100000);

    // 3. Tính toán các tổng số
    const spCount = items.length;
    let totalQty = 0;
    let totalAmount = 0;

    // Validate số lượng tồn kho trước khi thực hiện giao dịch
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({ message: `Không tìm thấy sản phẩm với ID ${item.productId}` });
      }
      const qty = Number(item.quantity || 0);
      
      let stockQty = 0;
      if (branchId) {
        const branchStock = await ProductBranchStock.findOne({ productId: product._id, branchId });
        stockQty = branchStock?.qty || 0;
      } else {
        stockQty = product.qty || 0;
      }

      if (qty > stockQty) {
        return res.status(400).json({
          message: `Sản phẩm [${product.code}] ${product.name} không đủ tồn kho để xuất. Tồn hiện tại ở kho này: ${stockQty}, yêu cầu xuất: ${qty}`
        });
      }
    }

    const savedItems = [];
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) continue;

      const qty = Number(item.quantity || 0);
      const price = Number(item.price || 0);
      
      // Tính tổng tiền mặt hàng
      let lineAmount = qty * price;
      if (item.discountType === '%') {
        lineAmount -= lineAmount * (Number(item.discountValue || 0) / 100);
      } else {
        lineAmount -= Number(item.discountValue || 0);
      }
      if (item.vatType === '%') {
        lineAmount += lineAmount * (Number(item.vatValue || 0) / 100);
      } else {
        lineAmount += Number(item.vatValue || 0);
      }
      lineAmount = Math.max(0, lineAmount);

      totalQty += qty;
      totalAmount += lineAmount;

      // Lưu InventoryProduct
      const invProduct = await InventoryProduct.create({
        id: 'TX-' + Math.floor(Math.random() * 900000 + 100000),
        voucherId,
        date: date || new Date().toISOString().slice(0, 10),
        warehouse,
        productCode: product.code,
        productName: product.name,
        type: 'export',
        importQty: 0,
        exportQty: qty,
        price,
        totalAmount: lineAmount,
        creator: (req as any).user?.name || 'Admin',
        unit: item.unit || product.unit,
        cost: price,
        note: item.note || ''
      });

      // Cập nhật kho thực
      await moveProductQty({
        productId: product._id,
        branchId,
        sourceType: 'InventoryProduct',
        sourceId: invProduct._id,
        amount: -qty,
        valueAfter: price
      });

      savedItems.push(invProduct);
    }

    // Tạo InventoryVoucher
    const voucher = await InventoryVoucher.create({
      voucherId,
      date: date || new Date().toISOString().slice(0, 10),
      warehouse,
      type: type || 'export',
      supplier: supplier || '',
      spCount,
      qty: totalQty,
      totalAmount,
      discount: items.reduce((sum, l) => sum + (l.discountType === 'đ' ? Number(l.discountValue || 0) : 0), 0),
      creator: (req as any).user?.name || 'Admin',
      note: note || `Xuất kho tự động - Loại: ${type || 'Xuất bán'}`
    });

    res.status(201).json({ voucher, items: savedItems });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi server khi xuất kho' });
  }
});

router.post('/transfers', async (req, res, next) => {
  try {
    const { fromWarehouse, toWarehouse, lines, type, label, note, spCount, qty, creator, date, tabs } = req.body;
    
    if (!fromWarehouse || !toWarehouse || fromWarehouse === toWarehouse) {
      return res.status(400).json({ message: 'Kho xuất và kho nhập không hợp lệ' });
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ message: 'Danh sách sản phẩm trống' });
    }

    // Lưu phiếu chuyển kho trước để lấy ID
    const transfer = await WarehouseTransfer.create({
      id: req.body.id || `TRF${Date.now()}`,
      date: date || new Date().toISOString(),
      tabs: tabs || ['all', 'draft'],
      type: type || 'Chuyển kho',
      fromWarehouse,
      toWarehouse,
      label,
      note,
      qty,
      spCount,
      creator: creator || 'System',
      lines
    });

    // Thực hiện trừ tồn kho nguồn và cộng tồn kho đích
    for (const line of lines) {
      const q = Number(line.quantity);
      if (q <= 0) continue;
      
      // Trừ kho xuất
      await moveProductQty({
        productId: line.productId,
        branchId: fromWarehouse,
        sourceType: 'WarehouseTransfer',
        sourceId: transfer._id,
        amount: -q
      });
      // Cộng kho nhập
      await moveProductQty({
        productId: line.productId,
        branchId: toWarehouse,
        sourceType: 'WarehouseTransfer',
        sourceId: transfer._id,
        amount: q
      });
    }

    res.status(201).json(transfer);
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi server khi chuyển kho' });
  }
});

router.use('/vouchers', crudRoutes(InventoryVoucher));
router.use('/products', crudRoutes(InventoryProduct));
router.use('/transfers', crudRoutes(WarehouseTransfer));
router.post('/checks', async (req, res, next) => {
  try {
    const { id, date, type, warehouse, creator, spCount, qty, note, missingSp, balance, lines } = req.body;
    
    if (!warehouse) return res.status(400).json({ message: 'Cửa hàng/Kho không hợp lệ' });
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ message: 'Danh sách sản phẩm trống' });
    }

    // Lưu phiếu kiểm kho chính
    const check = await InventoryCheck.create({
      id: id || `PKK${Math.floor(Date.now() / 1000)}`,
      date: date || new Date().toISOString(),
      type,
      warehouse,
      creator,
      spCount,
      qty,
      note,
      missingSp,
      balance
    });

    // Xử lý từng sản phẩm
    for (const line of lines) {
      const difference = Number(line.difference || 0);

      // Lưu dòng chi tiết kiểm kho
      await InventoryCheckProduct.create({
        date: check.date,
        warehouse: check.warehouse,
        productName: line.productName,
        cost: line.cost,
        price: line.price,
        stock: line.stock,
        transferring: line.transferring,
        actualStock: line.actualStock,
        difference: difference,
        description: line.description,
        checkId: check._id,
        externalId: `CHK_PROD_${Date.now()}_${Math.random()}`,
        sourceView: 'audit'
      });

      if (difference !== 0) {
        // Cập nhật tồn kho (bù trừ)
        await moveProductQty({
          productId: line.productId,
          branchId: warehouse,
          sourceType: 'InventoryCheck',
          sourceId: check._id,
          amount: difference, // + nếu thừa, - nếu thiếu
          valueAfter: line.cost
        });
      }
    }

    res.status(201).json(check);
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi server khi lưu phiếu kiểm kho' });
  }
});

router.use('/checks', crudRoutes(InventoryCheck));
router.use('/check-products', crudRoutes(InventoryCheckProduct));

export default router;
