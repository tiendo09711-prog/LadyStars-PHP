import { connectDatabase } from '../config/database.js';
import { MenuItem, Permission, Role } from '../core/system/system.models.js';

const retiredVendorPermissions = [
  'vendors.index',
  'vendors.groups',
  'vendors.purchases.index',
  'vendors.refunds.index',
  'vendors.transfers.index',
];

async function main() {
  await connectDatabase();

  const [permissions, menus, roles] = await Promise.all([
    Permission.deleteMany({ key: { $in: retiredVendorPermissions } }),
    MenuItem.deleteMany({ $or: [{ path: '/vendors' }, { module: 'vendor' }] }),
    Role.updateMany(
      { permissions: { $in: retiredVendorPermissions } },
      { $pull: { permissions: { $in: retiredVendorPermissions } } },
    ),
  ]);

  console.log(JSON.stringify({
    removedPermissions: permissions.deletedCount,
    removedMenus: menus.deletedCount,
    updatedRoles: roles.modifiedCount,
    vendorDataRemoved: false,
  }));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
