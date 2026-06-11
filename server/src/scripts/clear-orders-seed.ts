/**
 * Script xóa toàn bộ dữ liệu mẫu đã được insert vào module Đơn hàng.
 * Chạy: npx tsx src/scripts/clear-orders-seed.ts
 */
import { connectDatabase } from '../config/database.js';
import {
  Order,
  OrderDuplicate,
  OrderHandover,
  OrderDispute,
  OrderCodControl,
  OrderSource,
  OrderHistory,
} from '../modules/orders/orders.models.js';

await connectDatabase();

const results = await Promise.all([
  Order.deleteMany({}),
  OrderDuplicate.deleteMany({}),
  OrderHandover.deleteMany({}),
  OrderDispute.deleteMany({}),
  OrderCodControl.deleteMany({}),
  OrderSource.deleteMany({}),
  OrderHistory.deleteMany({}),
]);

const names = [
  'Order', 'OrderDuplicate', 'OrderHandover',
  'OrderDispute', 'OrderCodControl', 'OrderSource', 'OrderHistory',
];

results.forEach((r, i) => {
  console.log(`✅ ${names[i]}: đã xóa ${r.deletedCount} bản ghi`);
});

console.log('\n🧹 Xóa xong toàn bộ dữ liệu mẫu module Đơn hàng.');
process.exit(0);
