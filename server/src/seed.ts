import bcrypt from 'bcryptjs';
import { connectDatabase } from './config/database.js';
import { User } from './core/auth/user.model.js';
import { Category, PaymentMethod, Product, SaleChannel } from './modules/product/product.models.js';

await connectDatabase();
const passwordHash = await bcrypt.hash('123456789', 10);
const admin = await User.findOneAndUpdate(
  { email: 'admin@myerp.local' },
  { name: 'Admin', email: 'admin@myerp.local', passwordHash, role: 'admin', isActive: true },
  { upsert: true, new: true }
);
const category = await Category.findOneAndUpdate({ name: 'Hàng hóa' }, { name: 'Hàng hóa', userId: admin._id }, { upsert: true, new: true });
await Product.findOneAndUpdate({ code: 'SP001' }, { name: 'Sản phẩm mẫu', code: 'SP001', categoryId: category._id, cost: 50000, price: 90000, qty: 100, unit: 'cái', userId: admin._id }, { upsert: true });
await PaymentMethod.findOneAndUpdate({ code: 'cash' }, { name: 'Tiền mặt', code: 'cash', isActive: true }, { upsert: true });
await SaleChannel.findOneAndUpdate({ name: 'Bán tại cửa hàng' }, { name: 'Bán tại cửa hàng', isDefault: true, isActive: true }, { upsert: true });
console.log('Seeded admin@myerp.local / 123456789');
process.exit(0);
