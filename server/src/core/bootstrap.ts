import type { Model } from 'mongoose';
import { User } from './auth/user.model.js';
import { ACTIVE_STATUS, ADMIN_ROLE, EMPLOYEE_ROLE, normalizeRole, normalizeStatus } from './auth/role.utils.js';
import { runBranchDataMigration, hasMigrationCompletedRecently } from './org/branch.service.js';
import { StoreSetting } from './settings/settings.model.js';
import { Customer, CustomerGroup } from '../modules/customer/customer.models.js';
import { AccountingType, ExpensePayment, PayPerson, Receipt } from '../modules/accounting/accounting.models.js';
import {
  Batch,
  Category,
  DeliveryPartner,
  PaymentMethod,
  Product,
  ProductRefund,
  SaleChannel,
  SalePayment,
  Shelf,
  StockAdjustment,
  Trademark,
} from '../modules/product/product.models.js';
import { Project, Task } from '../modules/task/task.models.js';
import { Vendor, VendorGroup, VendorPurchase, VendorRefund, VendorTransfer } from '../modules/vendor/vendor.models.js';
import { PrintForm } from '../modules/printForms/printForms.models.js';
import {
  Order,
  OrderDuplicate,
  OrderHandover,
  OrderDispute,
  OrderCodControl,
  OrderSource,
  OrderHistory,
} from '../modules/orders/orders.models.js';

async function backfillOwnerField(model: Model<any>, field: string, ownerId: unknown) {
  if (!model.schema.path(field)) return;
  await model.updateMany(
    { $or: [{ [field]: { $exists: false } }, { [field]: null }] },
    { $set: { [field]: ownerId } },
  );
}

function uniqueIds(values: unknown[]) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

async function migrateUserRoles() {
  const users = await User.find({ deletedAt: { $exists: false } }).sort({ lastLoginAt: -1, updatedAt: -1, createdAt: 1 });
  if (!users.length) return null;

  const primaryAdmin = users.find((user) => user.isActive !== false && normalizeRole(user.role, Boolean(user.isRootOwner)) === ADMIN_ROLE)
    || users.find((user) => user.isActive !== false)
    || users[0];

  for (const user of users) {
    const nextRole = String(user._id) === String(primaryAdmin._id) ? ADMIN_ROLE : EMPLOYEE_ROLE;
    const nextStatus = nextRole === ADMIN_ROLE ? ACTIVE_STATUS : normalizeStatus(user.status);
    const warehouseIds = uniqueIds([...(Array.isArray(user.assignedWarehouseIds) ? user.assignedWarehouseIds : []), user.branchId]);
    const defaultWarehouseId = warehouseIds.find((id) => id === String(user.defaultWarehouseId || '')) || warehouseIds[0];
    let changed = false;

    if (user.role !== nextRole) {
      user.role = nextRole;
      changed = true;
    }
    if (user.status !== nextStatus) {
      user.status = nextStatus;
      changed = true;
    }
    if (Boolean(user.isRootOwner) !== (nextRole === ADMIN_ROLE)) {
      user.isRootOwner = nextRole === ADMIN_ROLE;
      changed = true;
    }
    if (nextRole === ADMIN_ROLE && user.lockedAt) {
      user.lockedAt = undefined;
      changed = true;
    }
    if (user.createdBy && !user.createdById) {
      user.createdById = user.createdBy;
      changed = true;
    }
    if (nextRole === EMPLOYEE_ROLE) {
      const currentAssigned = uniqueIds(Array.isArray(user.assignedWarehouseIds) ? user.assignedWarehouseIds : []);
      if (currentAssigned.join(',') !== warehouseIds.join(',')) {
        user.assignedWarehouseIds = warehouseIds as any;
        changed = true;
      }
      if (String(user.defaultWarehouseId || '') !== String(defaultWarehouseId || '')) {
        user.defaultWarehouseId = defaultWarehouseId as any;
        changed = true;
      }
    }

    if (changed) {
      await user.save();
    }
  }

  return User.findById(primaryAdmin._id);
}

export async function bootstrapSystem() {
  const owner = await migrateUserRoles();

  if (!owner) return;

  await StoreSetting.findOneAndUpdate(
    { singletonKey: 'store' },
    { $setOnInsert: { singletonKey: 'store', shopName: 'LadyStars' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  // Anti-spam: skip full migration if the most recent run already completed
  // successfully with no new branches created and no document backfills.
  // This prevents audit log spam on every server restart while preserving
  // the ability to repair when DB is empty, missing a default branch,
  // or has legacy documents still needing backfill.
  const migrationRecentlyDone = await hasMigrationCompletedRecently();
  if (migrationRecentlyDone) {
    console.log('[bootstrap] Branch migration skipped — last run completed successfully with no new backfills.');
  } else {
    await runBranchDataMigration();
  }

  const models = [
    Batch, Category, Trademark, Shelf, Product, SalePayment, ProductRefund, StockAdjustment,
    SaleChannel, DeliveryPartner, PaymentMethod, Customer, CustomerGroup,
    Vendor, VendorGroup, VendorPurchase, VendorRefund, VendorTransfer,
    AccountingType, Receipt, ExpensePayment, PayPerson, Project, Task, PrintForm,
    Order, OrderDuplicate, OrderHandover,
    OrderDispute, OrderCodControl, OrderSource, OrderHistory,
  ];

  for (const model of models) {
    await backfillOwnerField(model, 'userId', owner._id);
    await backfillOwnerField(model, 'userCreatedId', owner._id);
    await backfillOwnerField(model, 'createdBy', owner._id);
    await backfillOwnerField(model, 'authorId', owner._id);
    await backfillOwnerField(model, 'ownerId', owner._id);
  }

  // Backfill Product status field to 'Mới' if it's missing or empty
  await Product.updateMany(
    { $or: [{ status: { $exists: false } }, { status: null }, { status: '' }] },
    { $set: { status: 'Mới' } },
  );

}
