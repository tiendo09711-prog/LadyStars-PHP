import type { Model } from 'mongoose';
import { User } from './auth/user.model.js';
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

async function backfillOwnerField(model: Model<any>, field: string, ownerId: unknown) {
  if (!model.schema.path(field)) return;
  await model.updateMany(
    { $or: [{ [field]: { $exists: false } }, { [field]: null }] },
    { $set: { [field]: ownerId } },
  );
}

export async function bootstrapSystem() {
  const owner = await User.findOneAndUpdate(
    { email: 'admin@myerp.local' },
    { $set: { role: 'owner', status: 'open', isRootOwner: true, isActive: true } },
    { new: true },
  );

  if (!owner) return;

  await StoreSetting.findOneAndUpdate(
    { singletonKey: 'store' },
    { $setOnInsert: { singletonKey: 'store', shopName: 'LadyStars' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const models = [
    Batch, Category, Trademark, Shelf, Product, SalePayment, ProductRefund, StockAdjustment,
    SaleChannel, DeliveryPartner, PaymentMethod, Customer, CustomerGroup,
    Vendor, VendorGroup, VendorPurchase, VendorRefund, VendorTransfer,
    AccountingType, Receipt, ExpensePayment, PayPerson, Project, Task, PrintForm,
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
