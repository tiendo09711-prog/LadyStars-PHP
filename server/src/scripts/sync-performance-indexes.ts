import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import '../modules/product/product.models.js';
import '../modules/orders/orders.models.js';
import '../modules/accounting/accounting.models.js';
import '../modules/vendor/vendor.models.js';
import '../modules/customer/customer.models.js';
import '../modules/warehouse/warehouse.models.js';

async function main() {
  await connectDatabase();
  const results = await Promise.all(
    Object.values(mongoose.models).map(async (model) => {
      await model.createIndexes();
      return {
        model: model.modelName,
        indexes: (await model.collection.indexes()).length,
      };
    }),
  );
  console.table(results.map((result) => ({
    model: result.model,
    indexes: result.indexes,
  })));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('[indexes] sync failed', error);
  await mongoose.disconnect();
  process.exit(1);
});
