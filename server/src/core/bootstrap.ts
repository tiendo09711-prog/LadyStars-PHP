import type { Model } from 'mongoose';
import { User } from './auth/user.model.js';
import { ADMIN_ROLE } from './auth/role.utils.js';
import { runBranchDataMigration, hasMigrationCompletedRecently } from './org/branch.service.js';
import { StoreSetting } from './settings/settings.model.js';
import { Customer, CustomerGroup } from '../modules/customer/customer.models.js';
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
import { Vendor, VendorGroup, VendorPurchase, VendorRefund, VendorTransfer } from '../modules/vendor/vendor.models.js';

async function backfillOwnerField(model: Model<any>, field: string, ownerId: unknown) {
  if (!model.schema.path(field)) return;
  await model.updateMany(
    { $or: [{ [field]: { $exists: false } }, { [field]: null }] },
    { $set: { [field]: ownerId } },
  );
}

async function findBootstrapOwner() {
  return User.findOne({
    deletedAt: { $exists: false },
    isActive: true,
    $or: [
      { role: ADMIN_ROLE },
      { isRootOwner: true },
    ],
  }).sort({ isRootOwner: -1, createdAt: 1 });
}

export async function bootstrapSystem() {
  const owner = await findBootstrapOwner();

  if (!owner) return;

  await StoreSetting.findOneAndUpdate(
    { singletonKey: 'store' },
    { $setOnInsert: { singletonKey: 'store', shopName: 'LadyStars' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  // Anti-spam: skip full migration if the most recent run already completed
  // successfully with no new branches created and no document backfills.
  // This prevents audit log spam on every server restart while preserving
  // the ability to repair when DB is empty or has legacy documents needing backfill,
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
