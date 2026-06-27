import bcrypt from 'bcryptjs';
import { connectDatabase } from './config/database.js';
import { User } from './core/auth/user.model.js';
import { ACTIVE_STATUS, ADMIN_ROLE } from './core/auth/role.utils.js';
import { StoreSetting } from './core/settings/settings.model.js';
import { Category, PaymentMethod, Product, SaleChannel } from './modules/product/product.models.js';

await connectDatabase();
const passwordHash = await bcrypt.hash('123456789', 10);
const admin = await User.findOneAndUpdate(
  { email: 'admin@myerp.local' },
  { name: 'Admin', email: 'admin@myerp.local', passwordHash, role: ADMIN_ROLE, status: ACTIVE_STATUS, isRootOwner: true, isActive: true },
  { upsert: true, new: true }
);
await StoreSetting.findOneAndUpdate(
  { singletonKey: 'store' },
  { singletonKey: 'store', shopName: 'LadyStars', updatedBy: admin._id },
  { upsert: true, new: true }
);
const category = await Category.findOneAndUpdate({ name: 'Hàng hóa' }, { name: 'Hàng hóa', userId: admin._id }, { upsert: true, new: true });
await Product.findOneAndUpdate({ code: 'SP001' }, { name: 'Sản phẩm mẫu', code: 'SP001', categoryId: category._id, cost: 50000, price: 90000, qty: 100, unit: 'cái', userId: admin._id }, { upsert: true });
await PaymentMethod.findOneAndUpdate({ code: 'cash' }, { name: 'Tiền mặt', code: 'cash', isActive: true }, { upsert: true });
await PaymentMethod.findOneAndUpdate({ code: 'bank_transfer' }, { name: 'Chuyển khoản', code: 'bank_transfer', isActive: true, sortOrder: 2 }, { upsert: true });
await PaymentMethod.findOneAndUpdate({ code: 'installment' }, { name: 'Trả góp', code: 'installment', isActive: true, sortOrder: 3 }, { upsert: true });
await SaleChannel.findOneAndUpdate({ name: 'Bán tại cửa hàng' }, { name: 'Bán tại cửa hàng', isDefault: true, isActive: true }, { upsert: true });
console.log('Seeded admin@myerp.local / 123456789');
process.exit(0);
