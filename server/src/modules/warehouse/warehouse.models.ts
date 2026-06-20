import { Schema, model } from 'mongoose';

const InventoryVoucherSchema = new Schema({
  date: String,             // Ngày
  voucherId: { type: String, required: true, unique: true }, // ID
  orderId: String,          // ID đơn hàng
  warehouse: String,        // Kho hàng
  relatedVoucher: String,   // Phiếu liên quan
  requestVoucher: String,   // Phiếu yêu cầu XNK
  warrantyId: String,       // ID phiếu bảo hành
  warehouseCode: String,    // Mã kho
  type: String,             // Kiểu
  supplier: String,         // Nhà cung cấp
  spCount: { type: Number, default: 0 }, // SP
  qty: { type: Number, default: 0 },      // SL
  totalAmount: { type: Number, default: 0 }, // Tổng tiền
  discount: { type: Number, default: 0 },    // Chiết khấu
  creator: String,          // Người tạo
  customerDob: String,      // Ngày sinh khách hàng
  customerPhone: String,    // SĐT Khách hàng
  note: String,             // Ghi chú
  invoice: String,          // Hóa đơn
  createdAtStr: String,     // Ngày tạo (from CSV)
  seller: String,           // Nhân viên bán hàng
  code: String,             // Mã
  invoiceLabel: String,     // Nhãn hóa đơn XNK
}, { timestamps: true, strict: false });

InventoryVoucherSchema.index({ voucherId: 'text', warehouse: 'text', type: 'text', creator: 'text', customerPhone: 'text' });
export const InventoryVoucher = model('InventoryVoucher', InventoryVoucherSchema);


const InventoryProductSchema = new Schema({
  id: { type: String, required: true, unique: true }, // ID
  voucherId: String,        // ID phiếu XNK
  warrantyId: String,       // ID phiếu bảo hành
  warehouse: String,        // Kho hàng
  date: String,             // Ngày
  productCode: String,      // Mã sản phẩm
  productName: String,      // Sản phẩm
  barcode: String,          // Mã vạch
  imei: String,             // IMEI
  batch: String,            // Lô hàng
  supplier: String,         // Nhà cung cấp
  type: String,             // Kiểu
  category: String,         // Danh mục
  importQty: { type: Number, default: 0 }, // Số lượng nhập
  exportQty: { type: Number, default: 0 }, // Số lượng xuất
  minUnitQty: { type: Number, default: 0 }, // SL quy đổi theo đơn vị nhỏ nhất
  price: { type: Number, default: 0 },     // Giá
  vat: { type: Number, default: 0 },       // VAT
  vatType: String,          // Loại vat
  cost: { type: Number, default: 0 },      // Giá vốn
  amount: { type: Number, default: 0 },    // Tiền
  discount: { type: Number, default: 0 },  // Chiết khấu
  totalAmount: { type: Number, default: 0 }, // Tổng tiền
  extendedWarranty: String, // Bảo hành mở rộng
  description: String,      // Mô tả
  createdAtStr: String,     // Ngày tạo (from CSV)
  unit: String,             // Đơn vị tính
  currentPrice: { type: Number, default: 0 }, // Giá bán hiện tại
  totalPriceAmount: { type: Number, default: 0 }, // Tổng tiền giá bán
  seller: String,           // Nhân viên bán hàng
  creator: String,          // Người tạo
  customer: String,         // Khách hàng
}, { timestamps: true, strict: false });

InventoryProductSchema.index({ id: 'text', voucherId: 'text', productCode: 'text', productName: 'text', creator: 'text', customer: 'text' });
export const InventoryProduct = model('InventoryProduct', InventoryProductSchema);


const WarehouseTransferItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  productCode: String,
  productName: String,
  barcode: String,
  requestedQuantity: { type: Number, default: 0 },
  approvedQuantity: { type: Number, default: 0 },
  dispatchedQuantity: { type: Number, default: 0 },
  receivedQuantity: { type: Number, default: 0 },
  unitCostSnapshot: { type: Number, default: 0 },
  unit: String,
  batchCode: String,
  imei: String,
  note: String,
}, { _id: true, strict: false });

const WarehouseTransferSchema = new Schema({
  id: { type: String, required: true, unique: true },
  code: { type: String, unique: true, sparse: true },
  tabs: [String],
  date: String,
  dateObj: Date,
  type: String,
  warehouse: String,
  sourceWarehouseId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  destinationWarehouseId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  fromWarehouse: { type: Schema.Types.ObjectId, ref: 'Branch' },
  toWarehouse: { type: Schema.Types.ObjectId, ref: 'Branch' },
  sourceWarehouseName: String,
  destinationWarehouseName: String,
  label: String,
  status: {
    type: String,
    enum: [
      'DRAFT',
      'PENDING_REQUEST_APPROVAL',
      'APPROVED_TO_DISPATCH',
      'PENDING_DISPATCH_APPROVAL',
      'IN_TRANSIT',
      'PENDING_RECEIPT_APPROVAL',
      'PENDING_RETURN_APPROVAL',
      'COMPLETED',
      'RETURNED',
      'REJECTED',
      'CANCELLED',
    ],
    default: 'DRAFT',
  },
  qty: { type: Number, default: 0 },
  spCount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  creator: String,
  createdById: { type: Schema.Types.ObjectId, ref: 'User' },
  requestedAt: Date,
  requestApprovedById: { type: Schema.Types.ObjectId, ref: 'User' },
  requestApprovedAt: Date,
  dispatchConfirmedById: { type: Schema.Types.ObjectId, ref: 'User' },
  dispatchConfirmedAt: Date,
  dispatchApprovedById: { type: Schema.Types.ObjectId, ref: 'User' },
  dispatchApprovedAt: Date,
  receiptConfirmedById: { type: Schema.Types.ObjectId, ref: 'User' },
  receiptConfirmedAt: Date,
  receiptApprovedById: { type: Schema.Types.ObjectId, ref: 'User' },
  receiptApprovedAt: Date,
  rejectedById: { type: Schema.Types.ObjectId, ref: 'User' },
  rejectedAt: Date,
  rejectionReason: String,
  cancelledById: { type: Schema.Types.ObjectId, ref: 'User' },
  cancelledAt: Date,
  cancelReason: String,
  returnedById: { type: Schema.Types.ObjectId, ref: 'User' },
  returnedAt: Date,
  returnReason: String,
  sourceExportBillId: { type: Schema.Types.ObjectId, ref: 'InventoryVoucher' },
  destinationImportBillId: { type: Schema.Types.ObjectId, ref: 'InventoryVoucher' },
  returnBillId: { type: Schema.Types.ObjectId, ref: 'InventoryVoucher' },
  importBatchId: String,
  sourceFileName: String,
  importedAt: Date,
  source: { type: String, default: 'MANUAL' },
  externalImportCode: String,
  version: { type: Number, default: 0 },
  note: String,
  lines: [WarehouseTransferItemSchema],
}, { timestamps: true, strict: false });

WarehouseTransferSchema.index({ id: 'text', warehouse: 'text', type: 'text', creator: 'text' });
WarehouseTransferSchema.index({ status: 1, sourceWarehouseId: 1, destinationWarehouseId: 1, createdAt: -1 });
WarehouseTransferSchema.index({ sourceExportBillId: 1 }, { sparse: true });
WarehouseTransferSchema.index({ destinationImportBillId: 1 }, { sparse: true });
WarehouseTransferSchema.index({ returnBillId: 1 }, { sparse: true });
WarehouseTransferSchema.index({ importBatchId: 1, externalImportCode: 1 }, { unique: true, sparse: true });
export const WarehouseTransfer = model('WarehouseTransfer', WarehouseTransferSchema);

const TransferAuditLogSchema = new Schema({
  transferRequestId: { type: Schema.Types.ObjectId, ref: 'WarehouseTransfer', required: true },
  actionType: { type: String, required: true },
  previousStatus: String,
  nextStatus: String,
  actorId: { type: Schema.Types.ObjectId, ref: 'User' },
  actorRole: String,
  reason: String,
  metadata: Schema.Types.Mixed,
}, { timestamps: true, strict: false });

TransferAuditLogSchema.index({ transferRequestId: 1, createdAt: -1 });
TransferAuditLogSchema.index({ actionType: 1, actorId: 1 });
export const TransferAuditLog = model('TransferAuditLog', TransferAuditLogSchema);

const InventoryAuditSchema = new Schema({
  code: { type: String, required: true, unique: true },
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
  auditType: {
    type: String,
    enum: ['BY_PRODUCT', 'FULL_WAREHOUSE'],
    default: 'BY_PRODUCT',
  },
  status: {
    type: String,
    enum: ['DRAFT', 'COUNTING', 'SUBMITTED', 'RECONCILED', 'CANCELLED'],
    default: 'DRAFT',
  },
  note: String,
  snapshotAt: Date,
  createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  submittedById: { type: Schema.Types.ObjectId, ref: 'User' },
  submittedAt: Date,
  reconciledById: { type: Schema.Types.ObjectId, ref: 'User' },
  reconciledAt: Date,
  cancelledById: { type: Schema.Types.ObjectId, ref: 'User' },
  cancelledAt: Date,
  cancelReason: String,
  linkedInventoryBillId: { type: Schema.Types.ObjectId, ref: 'InventoryVoucher' },
  linkedInventoryBillIds: [{ type: Schema.Types.ObjectId, ref: 'InventoryVoucher' }],
  linkedInventoryBillCodes: [String],
  mergedIntoAuditId: { type: Schema.Types.ObjectId, ref: 'InventoryAudit' },
  sourceAuditIds: [{ type: Schema.Types.ObjectId, ref: 'InventoryAudit' }],
  version: { type: Number, default: 0 },
  reconcileLockToken: String,
}, { timestamps: true, strict: false });

InventoryAuditSchema.index({ code: 'text', note: 'text' });
InventoryAuditSchema.index({ warehouseId: 1, status: 1, createdAt: -1 });
InventoryAuditSchema.index({ auditType: 1, status: 1, createdAt: -1 });
InventoryAuditSchema.index({ linkedInventoryBillId: 1 }, { sparse: true });
export const InventoryAudit = model('InventoryAudit', InventoryAuditSchema);

const InventoryAuditItemSchema = new Schema({
  inventoryAuditId: { type: Schema.Types.ObjectId, ref: 'InventoryAudit', required: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  productCodeSnapshot: String,
  barcodeSnapshot: String,
  productNameSnapshot: String,
  unitSnapshot: String,
  costPriceSnapshot: { type: Number, default: 0 },
  salePriceSnapshot: { type: Number, default: 0 },
  systemQuantitySnapshot: { type: Number, default: 0 },
  inTransitQuantitySnapshot: { type: Number, default: 0 },
  physicalQuantity: { type: Number, default: null },
  varianceQuantity: { type: Number, default: 0 },
  note: String,
  countedById: { type: Schema.Types.ObjectId, ref: 'User' },
  countedAt: Date,
}, { timestamps: true, strict: false });

InventoryAuditItemSchema.index({ inventoryAuditId: 1, productId: 1 }, { unique: true });
InventoryAuditItemSchema.index({
  productCodeSnapshot: 'text',
  barcodeSnapshot: 'text',
  productNameSnapshot: 'text',
});
export const InventoryAuditItem = model('InventoryAuditItem', InventoryAuditItemSchema);

const InventoryAuditLogSchema = new Schema({
  inventoryAuditId: { type: Schema.Types.ObjectId, ref: 'InventoryAudit', required: true },
  actionType: { type: String, required: true },
  actorId: { type: Schema.Types.ObjectId, ref: 'User' },
  previousStatus: String,
  nextStatus: String,
  reason: String,
  metadata: Schema.Types.Mixed,
}, { timestamps: true, strict: false });

InventoryAuditLogSchema.index({ inventoryAuditId: 1, createdAt: -1 });
InventoryAuditLogSchema.index({ actionType: 1, actorId: 1 });
export const InventoryAuditLog = model('InventoryAuditLog', InventoryAuditLogSchema);

const InventoryCheckSchema = new Schema({
  id: { type: String, required: true, unique: true },
  date: String,
  type: String,
  warehouse: String,
  creator: String,
  spCount: { type: Number, default: 0 },
  qty: { type: Number, default: 0 },
  note: String,
  missingSp: String,
  balance: String,
}, { timestamps: true, strict: false });

InventoryCheckSchema.index({ id: 'text', warehouse: 'text', creator: 'text' });
export const InventoryCheck = model('InventoryCheck', InventoryCheckSchema);


const InventoryCheckProductSchema = new Schema({
  date: String,
  warehouse: String,
  productName: String,
  cost: { type: Number, default: 0 },
  price: { type: Number, default: 0 },
  stock: { type: Number, default: 0 },
  transferring: { type: Number, default: 0 },
  actualStock: { type: Number, default: 0 },
  difference: { type: Number, default: 0 },
  description: String,
}, { timestamps: true, strict: false });

InventoryCheckProductSchema.index({ externalId: 1, sourceView: 1 });
InventoryCheckProductSchema.index({
  externalId: 'text',
  productCode: 'text',
  barcode: 'text',
  productName: 'text',
  branchName: 'text',
});
export const InventoryCheckProduct = model('InventoryCheckProduct', InventoryCheckProductSchema);

const WarehouseDraftVoucherSchema = new Schema({
  externalId: { type: String, required: true, unique: true },
  date: String,
  dateObj: Date,
  type: String,
  warehouse: String,
  fromWarehouse: String,
  toWarehouse: String,
  vendor: String,
  spCount: { type: Number, default: 0 },
  qty: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  creator: String,
  customer: String,
  timeCreated: String,
  timeCreatedObj: Date,
  note: String,
  approvedBy: String,
  approvedAt: String,
  approvedAtObj: Date,
  confirmedBy: String,
  confirmedAt: String,
  confirmedAtObj: Date,
  canceledBy: String,
  canceledAt: String,
  label: String,
}, { timestamps: true, strict: false });

WarehouseDraftVoucherSchema.index({ externalId: 'text', warehouse: 'text', type: 'text', creator: 'text', customer: 'text' });
WarehouseDraftVoucherSchema.index({ dateObj: -1 });
export const WarehouseDraftVoucher = model('WarehouseDraftVoucher', WarehouseDraftVoucherSchema);

const WarehouseDraftProductSchema = new Schema({
  externalId: { type: String, required: true, unique: true },
  requestId: String,
  warehouse: String,
  fromWarehouse: String,
  toWarehouse: String,
  date: String,
  dateObj: Date,
  creator: String,
  productCode: String,
  barcode: String,
  productName: String,
  salePrice: { type: Number, default: 0 },
  type: String,
  requestedQty: { type: Number, default: 0 },
  requestedPrice: { type: Number, default: 0 },
  amount: { type: Number, default: 0 },
  description: String,
  approvedAt: String,
  approvedAtObj: Date,
  approvedQty: { type: Number, default: 0 },
  approvedValue: { type: Number, default: 0 },
  confirmedAt: String,
  confirmedAtObj: Date,
  xnkQty: { type: Number, default: 0 },
  confirmedValue: { type: Number, default: 0 },
  vendor: String,
}, { timestamps: true, strict: false });

WarehouseDraftProductSchema.index({ externalId: 'text', requestId: 'text', productCode: 'text', productName: 'text', warehouse: 'text', creator: 'text' });
WarehouseDraftProductSchema.index({ dateObj: -1 });
export const WarehouseDraftProduct = model('WarehouseDraftProduct', WarehouseDraftProductSchema);

const WarehouseVoucherLogSchema = new Schema({
  draftVoucherId: String,
  logType: String,
  xnkCategory: String,
  xnkType: String,
  xnkDate: String,
  xnkDateObj: Date,
  customer: String,
  actor: String,
  createdAtStr: String,
  createdAtObj: Date,
}, { timestamps: true, strict: false });

WarehouseVoucherLogSchema.index({ draftVoucherId: 'text', logType: 'text', xnkCategory: 'text', xnkType: 'text', actor: 'text', customer: 'text' });
WarehouseVoucherLogSchema.index({ createdAtObj: -1 });
export const WarehouseVoucherLog = model('WarehouseVoucherLog', WarehouseVoucherLogSchema);

const WarehouseProductLogSchema = new Schema({
  voucherId: String,
  inventoryProductId: String,
  logType: String,
  xnkCategory: String,
  xnkType: String,
  productName: String,
  imei: String,
  qty: { type: Number, default: 0 },
  price: { type: Number, default: 0 },
  actor: String,
  createdAtStr: String,
  createdAtObj: Date,
}, { timestamps: true, strict: false });

WarehouseProductLogSchema.index({ voucherId: 'text', inventoryProductId: 'text', logType: 'text', xnkCategory: 'text', xnkType: 'text', productName: 'text', actor: 'text' });
WarehouseProductLogSchema.index({ createdAtObj: -1 });
export const WarehouseProductLog = model('WarehouseProductLog', WarehouseProductLogSchema);

