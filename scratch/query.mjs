import { env } from '../server/src/config/env.js';
import mongoose from 'mongoose';
import { Customer } from '../server/src/modules/customer/customer.models.js';

async function main() {
  await mongoose.connect(env.mongoUri);
  const customers = await Customer.find({ code: { $in: ['354521', '446876', '454394', '454464'] } });
  console.log(customers.map(c => ({ code: c.code, name: c.name, phone: c.phone })));
  await mongoose.disconnect();
}

main().catch(console.error);
